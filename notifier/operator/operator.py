#!/usr/bin/env python3

import jinja2
import json
import kopf
import kubernetes
import logging
import os
import re
import redis
import requests
import smtplib

from base64 import b64decode
from datetime import datetime, timedelta, timezone
from dateutil.parser import isoparse
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from html2text import html2text
from humanize import naturaldelta
from tempfile import mkstemp
from threading import Timer

babylon_domain = os.environ.get('BABYLON_DOMAIN', 'babylon.gpte.redhat.com')
babylon_api_version = os.environ.get('BABYLON_API_VERSION', 'v1')
poolboy_domain = os.environ.get('POOLBOY_DOMAIN', 'poolboy.gpte.redhat.com')
poolboy_api_version = os.environ.get('POOLBOY_API_VERSION', 'v1')
redis_host = os.environ.get('REDIS_HOST', 'localhost')
redis_password = os.environ.get('REDIS_PASSWORD', None)
redis_port = int(os.environ.get('REDIS_PORT', 6379))
smtp_from = os.environ.get('SMTP_FROM', None)
smtp_host = os.environ.get('SMTP_HOST', None)
smtp_port = int(os.environ.get('SMTP_PORT', 25))
smtp_tls_cert = os.environ.get('SMTP_TLS_CERT', None)
smtp_tls_cert_file = os.environ.get('SMTP_TLS_CERT_FILE', None)
smtp_tls_key = os.environ.get('SMTP_TLS_KEY', None)
smtp_tls_key_file = os.environ.get('SMTP_TLS_KEY_FILE', None)

### Development/Test variables
# Only send messages to contact listed in ONLY_SEND_TO
only_send_to = os.environ.get('ONLY_SEND_TO', None)

if not smtp_from:
    raise Exception('Environment variable SMTP_FROM must be set')
if not smtp_host:
    raise Exception('Environment variable SMTP_HOST must be set')
if not smtp_tls_cert and not smtp_tls_cert_file:
    raise Exception('Environment variable SMTP_TLS_CERT or SMTP_TLS_CERT_FILE must be set')
if not smtp_tls_key and not smtp_tls_key_file:
    raise Exception('Environment variable SMTP_TLS_KEY or SMTP_TLS_KEY_FILE must be set')

# Write cert and key to tmp file and load
if smtp_tls_cert:
    smtp_tls_cert_fd, smtp_tls_cert_file = mkstemp()
    with open(smtp_tls_cert_fd, 'w') as f:
        f.write(f"{smtp_tls_cert}\n{smtp_tls_key}\n")

tls_context = smtplib.ssl.SSLContext()
tls_context.load_cert_chain(smtp_tls_cert_file, smtp_tls_key_file)

j2env = jinja2.Environment(
    loader = jinja2.FileSystemLoader([
        os.path.join(
            os.path.dirname(os.path.abspath(__file__)),
            'templates',
        )
    ]),
    trim_blocks = True,
)

r = redis.StrictRedis(
    host=redis_host,
    password=redis_password,
    port=redis_port,
    db=0,
    decode_responses=True,
)

if os.path.exists('/run/secrets/kubernetes.io/serviceaccount'):
    kubernetes.config.load_incluster_config()
else:
    kubernetes.config.load_kube_config()

core_v1_api = kubernetes.client.CoreV1Api()
custom_objects_api = kubernetes.client.CustomObjectsApi()
namespace_email_addresses = {}
retirement_timers = {}
stop_timers = {}

@kopf.on.startup()
def configure(settings: kopf.OperatorSettings, **_):
    global ansible_tower_hostname, ansible_tower_password, ansible_tower_user

    # Disable scanning for CustomResourceDefinitions
    settings.scanning.disabled = True

    # Get the tower secret. This may change in the future if there are
    # multiple ansible tower deployments
    ansible_tower_secret = core_v1_api.read_namespaced_secret('babylon-tower', 'anarchy-operator')
    ansible_tower_hostname = b64decode(ansible_tower_secret.data['hostname']).decode('utf8')
    ansible_tower_password = b64decode(ansible_tower_secret.data['password']).decode('utf8')
    ansible_tower_user = b64decode(ansible_tower_secret.data['user']).decode('utf8')

@kopf.on.event('namespaces')
def namespace_event(event, logger, **_):
    namespace = event.get('object')
    if not namespace \
    or namespace.get('kind') != 'Namespace':
        logger.warning(event)
        return
    namespace_metadata = namespace['metadata']
    namespace_annotations = namespace_metadata.get('annotations', {})
    namespace_name = namespace_metadata['name']
    contact_email = namespace_annotations.get(f"{babylon_domain}/contactEmail")
    requester = namespace_annotations.get('openshift.io/requester')
    emails = []
    if contact_email:
        emails = [a.strip() for a in contact_email.split(',')]
    elif contact_email != "" and requester and requester != 'system:admin':
        try:
            user = custom_objects_api.get_cluster_custom_object('user.openshift.io', 'v1', 'users', requester)
            for identity_name in user.get('identities', []):
                try:
                    identity = custom_objects_api.get_cluster_custom_object('user.openshift.io', 'v1', 'identities', identity_name)
                    email = identity.get('extra', {}).get('email')
                    if email:
                        emails.append(email)
                        break
                except kubernetes.client.rest.ApiException as e:
                    if e.status != 404:
                        raise
        except kubernetes.client.rest.ApiException as e:
            if e.status != 404:
                raise
    # If only_send_to is set then restrict delivery to that address.
    if only_send_to:
        if only_send_to in emails:
            emails = [only_send_to]
        else:
            emails = []
    namespace_email_addresses[namespace_name] = emails

@kopf.on.event(
    poolboy_domain, poolboy_api_version, 'resourceclaims',
    labels={
        f"{babylon_domain}/catalogItemName": kopf.PRESENT,
        f"{babylon_domain}/catalogItemNamespace": kopf.PRESENT,
    }
)
def resourceclaim_event(event, logger, **_):
    resource_claim = event.get('object')
    if not resource_claim \
    or resource_claim.get('kind') != 'ResourceClaim':
        logger.warning(event)
        return

    # Ignore resource claims marked with disable
    if 'disable' == resource_claim.get('metadata', {}).get('annotations', {}).get(f"{babylon_domain}/notifier"):
        return

    # Too early to notify if there is no status yet
    if not 'status' in resource_claim \
    or not 'resourceHandle' in resource_claim['status']:
        return

    # Cancel any pending timers
    cancel_timers(resource_claim, logger)

    email_addresses = namespace_email_addresses.get(resource_claim['metadata']['namespace'])
    if email_addresses is None:
        raise kopf.TemporaryError("Namespace unknown", delay=15)
    elif not email_addresses:
        # Nobody to notify, so just skip
        logger.info("No contact email")
        return

    if event['type'] == 'DELETED':
        handle_resource_claim_delete(resource_claim, email_addresses, logger)
    elif event['type'] in ['ADDED', 'MODIFIED', None]:
        handle_resource_claim_event(resource_claim, email_addresses, logger)
    else:
        logger.warning(event)

def cancel_timers(resource_claim, logger):
    uid = resource_claim['metadata']['uid']
    retirement_timer = retirement_timers.pop(uid, None)
    if retirement_timer:
        retirement_timer.cancel()
    stop_timer = stop_timers.pop(uid, None)
    if stop_timer:
        stop_timer.cancel()

def create_retirement_timer(resource_claim, logger):
    metadata = resource_claim['metadata']
    name = metadata['name']
    namespace = metadata['namespace']
    uid = metadata['uid']

    try:
        retirement_timestamp = resource_claim['status']['lifespan']['end']
    except KeyError:
        return

    retirement_datetime = isoparse(retirement_timestamp)
    notification_timedelta = retirement_datetime - datetime.now(timezone.utc) - timedelta(days=1, seconds=30)
    notification_interval = notification_timedelta.total_seconds()
    if notification_interval > 0:
        logger.info("scheduled retirement notification in " + naturaldelta(notification_timedelta))
        timer = Timer(
            notification_interval, notify_scheduled_retirement,
            [resource_claim, retirement_datetime]
        )
        retirement_timers[uid] = timer
        timer.start()

def create_stop_timer(resource_claim, logger):
    metadata = resource_claim['metadata']
    name = metadata['name']
    namespace = metadata['namespace']
    uid = metadata['uid']
    stop_datetime = None
    for status_resource in resource_claim['status'].get('resources', []):
        try:
            stop_ts = status_resource['state']['spec']['vars']['action_schedule']['stop']
        except KeyError:
            return
        stop_dt = isoparse(stop_ts)
        if not stop_datetime or stop_dt < stop_datetime:
            stop_datetime = stop_dt

    if not stop_datetime:
        return

    notification_timedelta = stop_datetime - datetime.now(timezone.utc) - timedelta(minutes=30, seconds=30)
    notification_interval = notification_timedelta.total_seconds()
    if notification_interval > 0:
        logger.info("scheduled stop notification in " + naturaldelta(notification_timedelta))
        timer = Timer(
            notification_interval, notify_scheduled_stop,
            [resource_claim, stop_datetime]
        )
        stop_timers[uid] = timer
        timer.start()

def handle_resource_claim_delete(resource_claim, email_addresses, logger):
    notify_deleted(resource_claim, email_addresses, logger)

def handle_resource_claim_event(resource_claim, email_addresses, logger):
    create_retirement_timer(resource_claim, logger)
    create_stop_timer(resource_claim, logger)
    notify_if_provision_failed(resource_claim, email_addresses, logger)
    notify_if_provision_started(resource_claim, email_addresses, logger)
    notify_if_ready(resource_claim, email_addresses, logger)
    notify_if_stop_complete(resource_claim, email_addresses, logger)
    notify_if_stop_failed(resource_claim, email_addresses, logger)
    notify_if_start_complete(resource_claim, email_addresses, logger)
    notify_if_start_failed(resource_claim, email_addresses, logger)

def kebabToCamelCase(kebab_string):
    return ''.join([s if i == 0 else s.capitalize() for i, s in enumerate(kebab_string.split('-'))])

def notify_if_provision_failed(resource_claim, email_addresses, logger):
    # If resource claim was created a while ago then notification should
    # definitely already have been delivered.
    creation_ts = resource_claim['metadata']['creationTimestamp']
    creation_dt = isoparse(creation_ts)
    if creation_dt < datetime.now(timezone.utc) - timedelta(days=5):
        return

    status = resource_claim.get('status')
    if not status or not 'resources' in status:
        return

    failure_resource_state = None
    for status_resource in status['resources']:
        resource_state = status_resource.get('state')
        if resource_state \
        and 'provision-failed' == resource_state.get('spec', {}).get('vars', {}).get('current_state'):
            failure_resource_state = resource_state

    if not failure_resource_state:
        return

    rkey = f"{resource_claim['metadata']['uid']}/provision-failed"
    notified = r.getset(rkey, creation_ts)
    if notified == creation_ts:
        return
    r.expire(rkey, timedelta(days=7))

    notify_provision_failed(resource_claim, failure_resource_state, email_addresses, logger)

def notify_if_provision_started(resource_claim, email_addresses, logger):
    creation_ts = resource_claim['metadata']['creationTimestamp']
    creation_dt = isoparse(creation_ts)
    if creation_dt < datetime.now(timezone.utc) - timedelta(days=5):
        return

    status = resource_claim.get('status')
    if not status or not 'resources' in status:
        return

    have_running_provision = False
    for status_resource in status['resources']:
        resource_state = status_resource.get('state')
        if resource_state \
        and 'provisioning' == resource_state.get('spec', {}).get('vars', {}).get('current_state'):
            have_running_provision = True

    if not have_running_provision:
        return

    rkey = f"{resource_claim['metadata']['uid']}/provision-started"
    notified = r.getset(rkey, creation_ts)
    if notified == creation_ts:
        return
    r.expire(rkey, timedelta(days=7))
    notify_provision_started(resource_claim, email_addresses, logger)

def notify_if_ready(resource_claim, email_addresses, logger):
    # If resource claim was created a while ago then notification should
    # definitely already have been delivered.
    creation_ts = resource_claim['metadata']['creationTimestamp']
    creation_dt = isoparse(creation_ts)
    if creation_dt < datetime.now(timezone.utc) - timedelta(days=5):
        return

    # If no status is set then provision must not be complete.
    status = resource_claim.get('status')
    if not status or not 'resources' in status:
        return

    for status_resource in status['resources']:
        resource_state = status_resource.get('state')
        # To be ready all environments must be started.
        if not resource_state \
        or 'started' != resource_state.get('spec', {}).get('vars', {}).get('current_state'):
            return

    rkey = f"{resource_claim['metadata']['uid']}/ready"
    notified = r.getset(rkey, creation_ts)
    if notified == creation_ts:
        return
    r.expire(rkey, timedelta(days=7))
    notify_ready(resource_claim, email_addresses, logger)

def notify_if_start_complete(resource_claim, email_addresses, logger):
    creation_ts = resource_claim['metadata']['creationTimestamp']
    creation_dt = isoparse(creation_ts)

    status = resource_claim.get('status')
    if not status or not 'resources' in status:
        return

    recent_dt = None
    recent_ts = None
    for status_resource in status['resources']:
        resource_state = status_resource.get('state')
        # To notify for start all resources must be started
        if not resource_state \
        or 'started' != resource_state.get('spec', {}).get('vars', {}).get('current_state'):
            return
        complete_ts = resource_state.get('status', {}).get('towerJobs', {}).get('start', {}).get('completeTimestamp')
        if not complete_ts:
            return
        complete_dt = isoparse(complete_ts)
        if complete_dt > creation_dt \
        and complete_dt > datetime.now(timezone.utc) - timedelta(minutes=30) \
        and (not recent_dt or complete_dt > recent_dt):
            recent_dt = complete_dt
            recent_ts = complete_ts

    if not recent_ts:
        return

    rkey = f"{resource_claim['metadata']['uid']}/start-complete"
    notified = r.getset(rkey, recent_ts)
    if notified == recent_ts:
        return
    r.expire(rkey, timedelta(days=7))
    notify_start_complete(resource_claim, email_addresses, logger)

def notify_if_start_failed(resource_claim, email_addresses, logger):
    status = resource_claim.get('status')
    if not status or not 'resources' in status:
        return

    failure_dt = None
    failure_ts = None
    failure_resource_state = None
    for status_resource in status['resources']:
        resource_state = status_resource.get('state')
        # Notify failure if any resource start failed
        if resource_state \
        and 'start-failed' == resource_state.get('spec', {}).get('vars', {}).get('current_state'):
            start_ts = resource_state.get('status', {}).get('towerJobs', {}).get('start', {}).get('startTimestamp')
            start_dt = isoparse(start_ts)
            if start_dt > datetime.now(timezone.utc) - timedelta(hours=2) \
            and (not failure_dt or start_dt < failure_dt):
                failure_dt = start_dt
                failure_ts = start_ts
                failure_resource_state = resource_state

    if not failure_ts:
        return

    rkey = f"{resource_claim['metadata']['uid']}/start-failed"
    notified = r.getset(rkey, failure_ts)
    if notified == failure_ts:
        return
    r.expire(rkey, timedelta(days=1))
    notify_start_failed(resource_claim, failure_resource_state, email_addresses, logger)

def notify_if_stop_complete(resource_claim, email_addresses, logger):
    creation_ts = resource_claim['metadata']['creationTimestamp']
    creation_dt = isoparse(creation_ts)

    status = resource_claim.get('status')
    if not status or not 'resources' in status:
        return

    recent_dt = None
    recent_ts = None
    for status_resource in status['resources']:
        resource_state = status_resource.get('state')
        # To notify for stop all resources must be stopped
        if not resource_state \
        or 'stopped' != resource_state.get('spec', {}).get('vars', {}).get('current_state'):
            return
        complete_ts = resource_state.get('status', {}).get('towerJobs', {}).get('stop', {}).get('completeTimestamp')
        if not complete_ts:
            return
        complete_dt = isoparse(complete_ts)
        if complete_dt > creation_dt \
        and complete_dt > datetime.now(timezone.utc) - timedelta(minutes=30) \
        and (not recent_dt or complete_dt > recent_dt):
            recent_dt = complete_dt
            recent_ts = complete_ts

    if not recent_ts:
        return

    rkey = f"{resource_claim['metadata']['uid']}/stop-complete"
    notified = r.getset(rkey, recent_ts)
    if notified == recent_ts:
        return
    r.expire(rkey, timedelta(days=7))
    notify_stop_complete(resource_claim, email_addresses, logger)

def notify_if_stop_failed(resource_claim, email_addresses, logger):
    status = resource_claim.get('status')
    if not status or not 'resources' in status:
        return

    failure_dt = None
    failure_ts = None
    failure_resource_state = None
    for status_resource in status['resources']:
        resource_state = status_resource.get('state')
        # Notify failure if any resource stop failed
        if resource_state \
        and 'stop-failed' == resource_state.get('spec', {}).get('vars', {}).get('current_state'):
            start_ts = resource_state.get('status', {}).get('towerJobs', {}).get('stop', {}).get('startTimestamp')
            start_dt = isoparse(start_ts)
            if start_dt > datetime.now(timezone.utc) - timedelta(hours=2) \
            and (not failure_dt or start_dt < failure_dt):
                failure_dt = start_dt
                failure_ts = start_ts
                failure_resource_state = resource_state

    if not failure_ts:
        return

    rkey = f"{resource_claim['metadata']['uid']}/stop-failed"
    notified = r.getset(rkey, failure_ts)
    if notified == failure_ts:
        return
    r.expire(rkey, timedelta(days=1))
    notify_stop_failed(resource_claim, failure_resource_state, email_addresses, logger)

def notify_deleted(resource_claim, email_addresses, logger):
    logger.info("sending service-deleted notification", extra=dict(to=email_addresses))
    send_notification_email(
        logger = logger,
        resource_claim = resource_claim,
        subject = "{{catalog_display_name}} service {{service_display_name}} has been deleted",
        template = "service-deleted",
        to = email_addresses,
    )

def notify_provision_failed(resource_claim, resource_state, email_addresses, logger):
    logger.info("sending provision-failed notification", extra=dict(to=email_addresses))

    attachments = []
    try:
        job_id = resource_state['status']['towerJobs']['provision']['deployerJob']
        resp = requests.get(
            f"https://{ansible_tower_hostname}/api/v2/jobs/{job_id}/stdout/?format=txt",
            auth=(ansible_tower_user, ansible_tower_password),
            # We really need to fix the tower certs!
            verify=False,
        )
        filename = f"ansible-log-{job_id}.txt"
        mimeapp = MIMEApplication(resp.content, Name=filename)
        mimeapp['Content-Disposition'] = f"attachment; filename=\"{filename}\""
        attachments.append(mimeapp)
    except Exception:
        logging.exception("Exception when getting tower job.")

    send_notification_email(
        logger = logger,
        resource_claim = resource_claim,
        subject = "ERROR: {{catalog_display_name}} service {{service_display_name}} has failed to provision",
        to = email_addresses,
        template = "provision-failed",
        template_vars = dict(
            failure_details = '...',
        ),
        attachments = attachments,
    )

def notify_provision_started(resource_claim, email_addresses, logger):
    logger.info("sending provision-started notification", extra=dict(to=email_addresses))
    send_notification_email(
        logger = logger,
        resource_claim = resource_claim,
        subject = "{{catalog_display_name}} service {{service_display_name}} has begun provisioning",
        to = email_addresses,
        template = "provision-started",
        template_vars = dict(
            provision_time_estimate = 'an hour',
        ),
    )

def notify_ready(resource_claim, email_addresses, logger):
    logger.info("sending service-ready notification", extra=dict(to=email_addresses))
    message_body = []
    template_vars = dict(
        provision_messages = [],
        provision_data = {},
    )
    for status_resource in resource_claim['status']['resources']:
        anarchy_subject = status_resource['state']
        message_body.extend(anarchy_subject['spec']['vars'].get('provision_message_body', []))
        template_vars['provision_messages'].extend(anarchy_subject['spec']['vars'].get('provision_messages', []))
        template_vars['provision_data'].update(anarchy_subject['spec']['vars'].get('provision_data', {}))

    send_notification_email(
        logger = logger,
        message_body = message_body,
        resource_claim = resource_claim,
        subject = "{{catalog_display_name}} service {{service_display_name}} is ready",
        to = email_addresses,
        template = "service-ready",
        template_vars = template_vars,
    )

def notify_scheduled_retirement(resource_claim, retirement_datetime):
    logger = logging.getLogger('scheduled-retirement')
    metadata = resource_claim['metadata']
    name = metadata['name']
    namespace = metadata['namespace']
    uid = metadata['uid']
    retirement_timers.pop(uid, None)

    # FIXME? - Schedule subsequent reminder?

    email_addresses = namespace_email_addresses.get(namespace)
    if not email_addresses:
        return

    logger.info("sending retirement schedule notification", extra=dict(
        at = retirement_datetime.strftime('%FT%TZ'),
        object = dict(
            apiVersion = resource_claim['apiVersion'],
            kind = resource_claim['kind'],
            name = name,
            namespace = namespace,
            uid = uid,
        ),
        to = email_addresses,
    ))

    send_notification_email(
        logger = logger,
        resource_claim = resource_claim,
        subject = "{{catalog_display_name}} service {{service_display_name}} retirement in {{retirement_timedelta_humanized}}",
        to = email_addresses,
        template = "retirement-scheduled",
    )

def notify_scheduled_stop(resource_claim, stop_datetime):
    logger = logging.getLogger('scheduled-stop')
    metadata = resource_claim['metadata']
    namespace = metadata['namespace']
    uid = metadata['uid']
    stop_timers.pop(uid, None)

    email_addresses = namespace_email_addresses.get(namespace)
    if not email_addresses:
        return

    logger.info("sending stop schedule notification", extra=dict(
        at = stop_datetime.strftime('%FT%TZ'),
        object = dict(
            apiVersion = resource_claim['apiVersion'],
            kind = resource_claim['kind'],
            name = name,
            namespace = namespace,
            uid = uid,
        ),
        to = email_addresses,
    ))

    send_notification_email(
        logger = logger,
        resource_claim = resource_claim,
        subject = "{{catalog_display_name}} service {{service_display_name}} will stop in {{stop_timedelta_humanized}}",
        to = email_addresses,
        template = "stop-scheduled",
    )

def notify_start_complete(resource_claim, email_addresses, logger):
    logger.info("sending start-complete notification", extra=dict(to=email_addresses))
    send_notification_email(
        logger = logger,
        resource_claim = resource_claim,
        subject = "{{catalog_display_name}} service {{service_display_name}} has started",
        template = "start-complete",
        to = email_addresses,
    )

def notify_start_failed(resource_claim, resource_state, email_addresses, logger):
    logger.info("sending start-failed notification", extra=dict(to=email_addresses))

    attachments = []
    try:
        job_id = resource_state['status']['towerJobs']['start']['deployerJob']
        resp = requests.get(
            f"https://{ansible_tower_hostname}/api/v2/jobs/{job_id}/stdout/?format=txt",
            auth=(ansible_tower_user, ansible_tower_password),
            # We really need to fix the tower certs!
            verify=False,
        )
        filename = f"ansible-log-{job_id}.txt",
        mimeapp = MIMEApplication(resp.content, Name=filename)
        mimeapp['Content-Disposition'] = f"attachment; filename=\"{filename}\""
        attachments.append(mimeapp)
    except Exception:
        logging.exception("Exception when getting tower job.")

    send_notification_email(
        logger = logger,
        resource_claim = resource_claim,
        subject = "ERROR: {{catalog_display_name}} service {{service_display_name}} failed to start",
        to = email_addresses,
        template = "start-failed",
        template_vars = dict(
            failure_details = '...',
        ),
        attachments = attachments,
    )

def notify_stop_complete(resource_claim, email_addresses, logger):
    logger.info("sending stop-complete notification", extra=dict(to=email_addresses))
    send_notification_email(
        logger = logger,
        resource_claim = resource_claim,
        subject = "{{catalog_display_name}} service {{service_display_name}} has stopped",
        template = "stop-complete",
        to = email_addresses,
    )

def notify_stop_failed(resource_claim, resource_state, email_addresses, logger):
    logger.info("sending stop-failed notification", extra=dict(to=email_addresses))

    attachments = []
    try:
        job_id = resource_state['status']['towerJobs']['stop']['deployerJob']
        resp = requests.get(
            f"https://{ansible_tower_hostname}/api/v2/jobs/{job_id}/stdout/?format=txt",
            auth=(ansible_tower_user, ansible_tower_password),
            # We really need to fix the tower certs!
            verify=False,
        )
        filename = f"ansible-log-{job_id}.txt",
        mimeapp = MIMEApplication(resp.content, Name=filename)
        mimeapp['Content-Disposition'] = f"attachment; filename=\"{filename}\""
        attachments.append(mimeapp)
    except Exception:
        logging.exception("Exception when getting tower job.")

    send_notification_email(
        logger = logger,
        resource_claim = resource_claim,
        subject = "ERROR: {{catalog_display_name}} service {{service_display_name}} failed to stop",
        to = email_addresses,
        template = "stop-failed",
        template_vars = dict(
            failure_details = '...',
        ),
        attachments = attachments,
    )

def get_template_vars(resource_claim, logger):
    metadata = resource_claim['metadata']
    status = resource_claim['status']
    annotations = metadata.get('annotations', {})
    labels = metadata.get('labels', {})

    catalog_name = labels.get(f"{babylon_domain}/catalogItemNamespace")
    catalog_item_name = labels.get(f"{babylon_domain}/catalogItemName")
    catalog_item_display_name = annotations.get(f"{babylon_domain}/catalogItemDisplayName", catalog_item_name)
    guid = re.sub(r'^guid-', '', resource_claim['status']['resourceHandle']['name'])
    service_short_name = annotations.get(f"{babylon_domain}/shortName")

    retirement_timestamp, retirement_datetime, retirement_timedelta, retirement_timedelta_humanized = None, None, None, None
    try:
        retirement_timestamp = status['lifespan']['end']
        retirement_datetime = isoparse(retirement_timestamp)
        retirement_timedelta = retirement_datetime - datetime.now(timezone.utc)
        retirement_timedelta_humanized = naturaldelta(retirement_timedelta)
    except KeyError:
        pass

    stop_timestamp, stop_datetime, stop_timedelta, stop_timedelta_humanized = None, None, None, None
    try:
        stop_timestamp = status['resources'][0]['state']['spec']['vars']['action_schedule']['stop']
        stop_datetime = isoparse(stop_timestamp)
        stop_timedelta = stop_datetime - datetime.now(timezone.utc)
        stop_timedelta_humanized = naturaldelta(stop_timedelta)
    except (IndexError, KeyError):
        pass

    return dict(
        catalog_display_name = annotations.get(f"{babylon_domain}/catalogDisplayName", catalog_name),
        catalog_item_name = catalog_item_name,
        catalog_item_display_name = catalog_item_display_name,
        catalog_name = catalog_name,
        guid = guid,
        stop_datetime = stop_datetime,
        stop_timestamp = stop_timestamp,
        stop_timedelta = stop_timedelta,
        stop_timedelta_humanized = stop_timedelta_humanized,
        retirement_datetime = retirement_datetime,
        retirement_timestamp = retirement_timestamp,
        retirement_timedelta = retirement_timedelta,
        retirement_timedelta_humanized = retirement_timedelta_humanized,
        service_display_name = f"{catalog_item_display_name} {guid}" if catalog_item_display_name else metadata['name'],
        service_short_name = service_short_name,
        service_url = annotations.get(f"{babylon_domain}/url"),
        survey_link = None,
    )

def send_notification_email(resource_claim, subject, to, template, logger, message_body=[], template_vars={}, attachments=[]):
    metadata = resource_claim['metadata']
    annotations = metadata.get('annotations', {})

    template_vars.update(
        get_template_vars(resource_claim, logger)
    )
    email_subject = j2env.from_string(subject).render(**template_vars)
    message_template_annotation = annotations.get(f"{babylon_domain}/{kebabToCamelCase(template)}MessageTemplate")
    if message_template_annotation:
        message_template = json.loads(message_template_annotation);
        # FIXME - future support for handling templateFormat and outputFormat in template annotation
        email_body = j2env.from_string(message_template['template']).render(**template_vars)
    elif message_body:
        email_body = "\n".join(message_body)
    else:
        email_body = j2env.get_template(template + '.html.j2').render(**template_vars)

    msg = MIMEMultipart('alternative')
    msg['Subject'] = email_subject
    msg['From'] = f"{template_vars['catalog_display_name']} <{smtp_from}>"
    msg['To'] = ', '.join(to)

    msg.attach(MIMEText(html2text(email_body), 'plain'))
    msg.attach(MIMEText(email_body, 'html'))

    for attachment in attachments:
        msg.attach(attachment)

    with smtplib.SMTP(
        host = smtp_host,
        port = smtp_port,
    ) as smtp:
        smtp.starttls(context = tls_context)
        smtp.sendmail(smtp_from, to, msg.as_string())


##################################################################################
# TODO
##################################################################################

# Email on Stop soon
# * status.resources[*].spec.vars.current_state == 'started'
# * status.resources[*].spec.vars.action_schedule.stop < NOW + 30 minutes
#
#   Subject: Your RHPDS service <NAME> is about to stop (30 minutes)
#
#   Your Red Hat OPENTLC environment <NAME> will shutdown in 30 minutes.
#
#   You may manage service runtime at <SERVICE URL>.

# Email on Retirement soon
#   Subject: RHPDS service retirement reminder for <NAME>
#
#   Reminder: Your Red Hat Product Demo System service: <NAME> will be retired in <TIME INTERVAL> at <DATE TIME>.
#
#   If you require more time, please adjust lifetime at <SERVICE URL>.
#
#   Thank you for using Red Hat Product Demo System

##################################################################################
