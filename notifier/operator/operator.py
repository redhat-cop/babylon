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
import subprocess
import yaml

from base64 import b64decode
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from dateutil.parser import isoparse
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from html2text import html2text
from humanize import naturaldelta
from catalog_item import CatalogItem
from catalog_namespace import CatalogNamespace
from infinite_relative_backoff import InfiniteRelativeBackoff
from configure_kopf_logging import configure_kopf_logging
from resource_claim import ResourceClaim
from service_namespace import ServiceNamespace
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
smtp_user = os.environ.get('SMTP_USER', None)
smtp_user_password = os.environ.get('SMTP_USER_PASSWORD', None)
smtp_tls_ca_cert = os.environ.get('SMTP_TLS_CA_CERT', None)
smtp_tls_ca_cert_file = os.environ.get('SMTP_TLS_CA_CERT_FILE', None)
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

# Write cert and key to tmp file and load
if smtp_tls_cert:
    smtp_tls_cert_fd, smtp_tls_cert_file = mkstemp()
    with open(smtp_tls_cert_fd, 'w') as f:
        f.write(f"{smtp_tls_cert}\n{smtp_tls_key}\n")

tls_context = smtplib.ssl.create_default_context(
    cadata = smtp_tls_ca_cert,
    cafile = smtp_tls_ca_cert_file,
)

if smtp_tls_cert_file and smtp_tls_key_file:
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

# Add to_yaml filter
def to_yaml(input):
    return yaml.safe_dump(
        input,
        default_flow_style=False,
        explicit_start=False,
        explicit_end=False,
    )
j2env.filters['to_yaml'] = to_yaml
j2env.filters['to_nice_yaml'] = to_yaml

# Force block quotes for multiline strings:
def str_presenter(dumper, data):
  if "\n" in data:
    return dumper.represent_scalar('tag:yaml.org,2002:str', data, style='|')
  return dumper.represent_scalar('tag:yaml.org,2002:str', data)
yaml.add_representer(str, str_presenter)
yaml.representer.SafeRepresenter.add_representer(str, str_presenter)

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
retirement_timers = {}
stop_timers = {}

@kopf.on.startup()
def configure(settings: kopf.OperatorSettings, **_):
    # Never give up from network errors
    settings.networking.error_backoffs = InfiniteRelativeBackoff()

    # Only create events for warnings and errors
    settings.posting.level = logging.WARNING

    # Disable scanning for CustomResourceDefinitions
    settings.scanning.disabled = True

    configure_kopf_logging()

@kopf.on.event(
    poolboy_domain, poolboy_api_version, 'resourceclaims',
    labels={
        f"{babylon_domain}/catalogItemName": kopf.PRESENT,
        f"{babylon_domain}/catalogItemNamespace": kopf.PRESENT,
    }
)
def resourceclaim_event(event, logger, **_):
    resource_claim_definition = event.get('object')
    if not resource_claim_definition \
    or resource_claim_definition.get('kind') != 'ResourceClaim':
        logger.warning(event)
        return

    resource_claim = ResourceClaim(definition=resource_claim_definition)

    # Only notify for ResourceClaims with corresponding CatalogItems
    if not resource_claim.catalog_item_name \
    or not resource_claim.catalog_item_namespace:
        logger.debug("No catalog item name or namespace")
        return

    # Ignore resource claims marked with disable
    if resource_claim.notifier_disable:
        logger.debug("Notifier disabled")
        return

    # Too early to notify if there is no status yet
    if not resource_claim.has_status:
        logger.debug("No status")
        return

    # Cancel any pending timers
    cancel_timers(resource_claim, logger)

    catalog_item = get_catalog_item(resource_claim.catalog_item_namespace, resource_claim.catalog_item_name)
    catalog_namespace = get_catalog_namespace(resource_claim.catalog_item_namespace)
    service_namespace = get_service_namespace(resource_claim.namespace)
    email_addresses = service_namespace.contact_email_addresses
    if only_send_to:
        if only_send_to in email_addresses:
            email_addresses = [only_send_to]
        else:
            email_addresses = []

    if not email_addresses:
        # Nobody to notify, so just skip
        logger.debug("No contact email")
        return

    kwargs = dict(
        catalog_item = catalog_item,
        catalog_namespace = catalog_namespace,
        email_addresses = email_addresses,
        logger = logger,
        resource_claim = resource_claim,
    )

    if event['type'] == 'DELETED':
        handle_resource_claim_delete(**kwargs)
    elif event['type'] in ['ADDED', 'MODIFIED', None]:
        handle_resource_claim_event(**kwargs)
    else:
        logger.warning(event)

def cancel_timers(resource_claim, logger):
    uid = resource_claim.uid
    retirement_timer = retirement_timers.pop(uid, None)
    if retirement_timer:
        retirement_timer.cancel()
    stop_timer = stop_timers.pop(uid, None)
    if stop_timer:
        stop_timer.cancel()

def create_retirement_timer(logger, resource_claim, **kwargs):
    retirement_timestamp = resource_claim.retirement_timestamp
    if not retirement_timestamp:
        return
    retirement_datetime = isoparse(retirement_timestamp)
    notification_timedelta = retirement_datetime - datetime.now(timezone.utc) - timedelta(days=1, seconds=30)
    notification_interval = notification_timedelta.total_seconds()
    if notification_interval > 0:
        logger.info("scheduled retirement notification in " + naturaldelta(notification_timedelta))
        timer = Timer(
            notification_interval, notify_scheduled_retirement,
            kwargs = {
                "logger": kopf.LocalObjectLogger(body=resource_claim.definition, settings=kopf.OperatorSettings()),
                "resource_claim": resource_claim,
                **kwargs
            }
        )
        retirement_timers[resource_claim.uid] = timer
        timer.start()

def create_stop_timer(logger, resource_claim, **kwargs):
    stop_timestamp = resource_claim.stop_timestamp
    if not stop_timestamp:
        return
    stop_datetime = isoparse(stop_timestamp)
    notification_timedelta = stop_datetime - datetime.now(timezone.utc) - timedelta(minutes=30, seconds=30)
    notification_interval = notification_timedelta.total_seconds()
    if notification_interval > 0:
        logger.info("scheduled stop notification in " + naturaldelta(notification_timedelta))
        timer = Timer(
            notification_interval, notify_scheduled_stop,
            kwargs = {
                "logger": kopf.LocalObjectLogger(body=resource_claim.definition, settings=kopf.OperatorSettings()),
                "resource_claim": resource_claim,
                **kwargs
            }
        )
        stop_timers[resource_claim.uid] = timer
        timer.start()

def get_catalog_item(namespace, name):
    definition = custom_objects_api.get_namespaced_custom_object(
        babylon_domain, babylon_api_version, namespace, 'catalogitems', name
    )
    return CatalogItem(definition=definition)

def get_catalog_namespace(name):
    namespace = core_v1_api.read_namespace(name)
    return CatalogNamespace(namespace=namespace)

def get_deployer_log(deployer_job, logger):
    secret_list = core_v1_api.list_namespaced_secret(
        deployer_job.namespace,
        label_selector=f"babylon.gpte.redhat.com/ansible-control-plane={deployer_job.host}"
    )
    if not secret_list.items or len(secret_list.items) == 0:
        logger.warning(f"Unable to find secret for {deployer_job.host}")
        return None
    secret = secret_list.items[0]
    hostname = b64decode(secret.data['hostname']).decode('utf8')
    password = b64decode(secret.data['password']).decode('utf8')
    user = b64decode(secret.data['user']).decode('utf8')

    resp = requests.get(
        f"https://{hostname}/api/v2/jobs/{deployer_job.job_id}/stdout/?format=txt",
        auth=(user, password),
        # FIXME - We really need to fix the tower certs!
        verify=False,
    )
    return resp.content

def get_service_namespace(name):
    namespace = core_v1_api.read_namespace(name)
    return ServiceNamespace(namespace=namespace)

def handle_resource_claim_delete(**kwargs):
    notify_deleted(**kwargs)

def handle_resource_claim_event(**kwargs):
    create_retirement_timer(**kwargs)
    create_stop_timer(**kwargs)
    notify_if_provision_failed(**kwargs)
    notify_if_provision_started(**kwargs)
    notify_if_ready(**kwargs)
    notify_if_start_complete(**kwargs)
    notify_if_start_failed(**kwargs)
    notify_if_stop_complete(**kwargs)
    notify_if_stop_failed(**kwargs)

def kebabToCamelCase(kebab_string):
    return ''.join([s if i == 0 else s.capitalize() for i, s in enumerate(kebab_string.split('-'))])

def notify_if_provision_failed(catalog_item, catalog_namespace, email_addresses, logger, resource_claim):
    creation_ts = resource_claim.creation_timestamp
    creation_dt = isoparse(creation_ts)

    if creation_dt < datetime.now(timezone.utc) - timedelta(days=1):
        logger.debug("Too old to notify provision failed")
        return

    if not resource_claim.provision_failed:
        logger.debug("Provision not failed")
        return

    rkey = f"{resource_claim.uid}/provision-failed"
    notified = r.getset(rkey, creation_ts)
    if notified == creation_ts:
        return
    r.expire(rkey, timedelta(days=7))

    notify_provision_failed(
        catalog_item = catalog_item,
        catalog_namespace = catalog_namespace,
        email_addresses = email_addresses,
        logger = logger,
        resource_claim = resource_claim,
    )

def notify_if_provision_started(catalog_item, catalog_namespace, email_addresses, logger, resource_claim):
    creation_ts = resource_claim.creation_timestamp
    creation_dt = isoparse(creation_ts)

    if creation_dt < datetime.now(timezone.utc) - timedelta(hours=2):
        logger.debug("Too old to notify provision started")
        return

    if not resource_claim.provision_started:
        logger.debug("Provision not started")
        return

    rkey = f"{resource_claim.uid}/provision-started"
    notified = r.getset(rkey, creation_ts)
    if notified == creation_ts:
        logger.debug(f"Already notified provision started")
        return
    r.expire(rkey, timedelta(days=1))

    notify_provision_started(
        catalog_item = catalog_item,
        catalog_namespace = catalog_namespace,
        email_addresses = email_addresses,
        logger = logger,
        resource_claim = resource_claim,
    )

def notify_if_ready(catalog_item, catalog_namespace, email_addresses, logger, resource_claim):
    creation_ts = resource_claim.creation_timestamp
    creation_dt = isoparse(creation_ts)

    if creation_dt < datetime.now(timezone.utc) - timedelta(days=1):
        logger.debug("Too old to notify ready")
        return

    if not resource_claim.provision_complete:
        logger.debug("Provision not complete")
        return

    rkey = f"{resource_claim.uid}/ready"
    notified = r.getset(rkey, creation_ts)
    if notified == creation_ts:
        logger.debug(f"Already notified provision complete")
        return
    r.expire(rkey, timedelta(days=7))

    notify_ready(
        catalog_item = catalog_item,
        catalog_namespace = catalog_namespace,
        email_addresses = email_addresses,
        logger = logger,
        resource_claim = resource_claim,
    )

def notify_if_start_complete(catalog_item, catalog_namespace, email_addresses, logger, resource_claim):
    started_ts = resource_claim.last_started_timestamp
    if not started_ts:
        logger.debug("Not started")
        return

    started_dt = isoparse(started_ts)

    if started_dt < datetime.now(timezone.utc) - timedelta(hours=1):
        logger.debug("Too long ago to notify started")
        return

    rkey = f"{resource_claim.uid}/start-complete"
    notified = r.getset(rkey, started_ts)
    if notified == started_ts:
        return
    r.expire(rkey, timedelta(days=1))

    notify_start_complete(
        catalog_item = catalog_item,
        catalog_namespace = catalog_namespace,
        email_addresses = email_addresses,
        logger = logger,
        resource_claim = resource_claim,
    )

def notify_if_start_failed(catalog_item, catalog_namespace, email_addresses, logger, resource_claim):
    if not resource_claim.start_failed:
        return

    deployer_jobs = resource_claim.start_deployer_jobs
    if not deployer_jobs:
        logger.warning("Stop failed but there are no start deployer jobs?")

    start_ts = deployer_jobs[0].start_timestamp
    start_dt = isoparse(start_ts)

    if start_dt < datetime.now(timezone.utc) - timedelta(hours=2):
        return

    rkey = f"{resource_claim.uid}/start-failed"
    notified = r.getset(rkey, start_ts)
    if notified == start_ts:
        return
    r.expire(rkey, timedelta(days=1))
    notify_start_failed(
        catalog_item = catalog_item,
        catalog_namespace = catalog_namespace,
        email_addresses = email_addresses,
        logger = logger,
        resource_claim = resource_claim,
    )

def notify_if_stop_complete(catalog_item, catalog_namespace, email_addresses, logger, resource_claim):
    stopped_ts = resource_claim.last_stopped_timestamp
    if not stopped_ts:
        logger.debug("Not stopped")
        return

    stopped_dt = isoparse(stopped_ts)

    if stopped_dt < datetime.now(timezone.utc) - timedelta(hours=1):
        logger.debug("Too long ago to notify stopped")
        return

    rkey = f"{resource_claim.uid}/stop-complete"
    notified = r.getset(rkey, stopped_ts)
    if notified == stopped_ts:
        return
    r.expire(rkey, timedelta(days=1))

    notify_stop_complete(
        catalog_item = catalog_item,
        catalog_namespace = catalog_namespace,
        email_addresses = email_addresses,
        logger = logger,
        resource_claim = resource_claim,
    )

def notify_if_stop_failed(catalog_item, catalog_namespace, email_addresses, logger, resource_claim):
    if not resource_claim.stop_failed:
        return

    deployer_jobs = resource_claim.stop_deployer_jobs
    if not deployer_jobs:
        logger.warning("Stop failed but there are no stop deployer jobs?")

    stop_ts = deployer_jobs[0].start_timestamp
    stop_dt = isoparse(stop_ts)

    if stop_dt < datetime.now(timezone.utc) - timedelta(hours=2):
        return

    rkey = f"{resource_claim.uid}/stop-failed"
    notified = r.getset(rkey, stop_ts)
    if notified == stop_ts:
        return
    r.expire(rkey, timedelta(days=1))
    notify_stop_failed(
        catalog_item = catalog_item,
        catalog_namespace = catalog_namespace,
        email_addresses = email_addresses,
        logger = logger,
        resource_claim = resource_claim,
    )

def notify_deleted(catalog_item, catalog_namespace, email_addresses, logger, resource_claim):
    logger.info("sending service-deleted notification", extra=dict(to=email_addresses))
    send_notification_email(
        catalog_item = catalog_item,
        catalog_namespace = catalog_namespace,
        logger = logger,
        resource_claim = resource_claim,
        subject = "{{catalog_namespace.display_name}} service {{service_display_name}} has been deleted",
        template = "service-deleted",
        to = email_addresses,
    )

def notify_provision_failed(catalog_item, catalog_namespace, email_addresses, logger, resource_claim):
    logger.info("sending provision-failed notification", extra=dict(to=email_addresses))

    attachments = []
    for deployer_job in resource_claim.provision_deployer_jobs:
        deployer_log = get_deployer_log(deployer_job, logger)
        if deployer_log:
            filename = f"ansible-log-{deployer_job.job_id}.txt"
            mimeapp = MIMEApplication(deployer_log, Name=filename)
            mimeapp['Content-Disposition'] = f"attachment; filename=\"{filename}\""
            attachments.append(mimeapp)

    send_notification_email(
        attachments = attachments,
        catalog_item = catalog_item,
        catalog_namespace = catalog_namespace,
        logger = logger,
        resource_claim = resource_claim,
        subject = "ERROR: {{catalog_namespace.display_name}} service {{service_display_name}} has failed to provision",
        to = email_addresses,
        template = "provision-failed",
    )

def notify_provision_started(catalog_item, catalog_namespace, email_addresses, logger, resource_claim):
    logger.info("sending provision-started notification", extra=dict(to=email_addresses))
    send_notification_email(
        catalog_item = catalog_item,
        catalog_namespace = catalog_namespace,
        logger = logger,
        resource_claim = resource_claim,
        subject = "{{catalog_namespace.display_name}} service {{service_display_name}} has begun provisioning",
        to = email_addresses,
        template = "provision-started",
        template_vars = dict(
            provision_time_estimate = 'an hour',
        ),
    )

def notify_ready(catalog_item, catalog_namespace, email_addresses, logger, resource_claim):
    logger.info("sending service-ready notification", extra=dict(to=email_addresses))
    provision_message_body = resource_claim.provision_message_body
    provision_messages = resource_claim.provision_messages

    template_vars = {}
    if provision_messages:
        template_vars['provision_messages'] = provision_messages
        asciidoctor_process = subprocess.Popen(
            ['asciidoctor', '-sb', 'html5', '-'],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        stdout, stderr = asciidoctor_process.communicate(
            input = "\n".join([m.rstrip("\n") + ' +' if m else m for m in provision_messages]).encode('utf8')
        )
        template_vars['provision_messages_html'] = stdout.decode('utf8')

    send_notification_email(
        catalog_item = catalog_item,
        catalog_namespace = catalog_namespace,
        logger = logger,
        message_body = provision_message_body,
        resource_claim = resource_claim,
        subject = "{{catalog_namespace.display_name}} service {{service_display_name}} is ready",
        template = "service-ready",
        template_vars = template_vars,
        to = email_addresses,
    )

def notify_scheduled_retirement(catalog_item, catalog_namespace, email_addresses, logger, resource_claim):
    logger.info("sending retirement schedule notification")
    retirement_timers.pop(resource_claim.uid, None)

    send_notification_email(
        catalog_item = catalog_item,
        catalog_namespace = catalog_namespace,
        logger = logger,
        resource_claim = resource_claim,
        subject = "{{catalog_namespace.display_name}} service {{service_display_name}} retirement in {{retirement_timedelta_humanized}}",
        to = email_addresses,
        template = "retirement-scheduled",
    )

def notify_scheduled_stop(catalog_item, catalog_namespace, email_addresses, logger, resource_claim):
    logger.info("sending stop schedule notification")
    stop_timers.pop(resource_claim.uid, None)

    send_notification_email(
        catalog_item = catalog_item,
        catalog_namespace = catalog_namespace,
        logger = logger,
        resource_claim = resource_claim,
        subject = "{{catalog_namespace.display_name}} service {{service_display_name}} will stop in {{stop_timedelta_humanized}}",
        to = email_addresses,
        template = "stop-scheduled",
    )

def notify_start_complete(catalog_item, catalog_namespace, email_addresses, logger, resource_claim):
    logger.info("sending start-complete notification", extra=dict(to=email_addresses))
    send_notification_email(
       catalog_item = catalog_item,
       catalog_namespace = catalog_namespace,
        logger = logger,
        resource_claim = resource_claim,
        subject = "{{catalog_namespace.display_name}} service {{service_display_name}} has started",
        template = "start-complete",
        to = email_addresses,
    )

def notify_start_failed(catalog_item, catalog_namespace, email_addresses, logger, resource_claim):
    logger.info("sending start-failed notification", extra=dict(to=email_addresses))

    attachments = []
    for deployer_job in resource_claim.start_deployer_jobs:
        deployer_log = get_deployer_log(deployer_job, logger)
        if deployer_log:
            filename = f"ansible-log-{deployer_job.job_id}.txt"
            mimeapp = MIMEApplication(deployer_log, Name=filename)
            mimeapp['Content-Disposition'] = f"attachment; filename=\"{filename}\""
            attachments.append(mimeapp)

    send_notification_email(
        attachments = attachments,
        catalog_item = catalog_item,
        catalog_namespace = catalog_namespace,
        logger = logger,
        resource_claim = resource_claim,
        subject = "ERROR: {{catalog_namespace.display_name}} service {{service_display_name}} failed to start",
        to = email_addresses,
        template = "start-failed",
    )

def notify_stop_complete(catalog_item, catalog_namespace, email_addresses, logger, resource_claim):
    logger.info("sending stop-complete notification", extra=dict(to=email_addresses))
    send_notification_email(
        catalog_item = catalog_item,
        catalog_namespace = catalog_namespace,
        logger = logger,
        resource_claim = resource_claim,
        subject = "{{catalog_namespace.display_name}} service {{service_display_name}} has stopped",
        template = "stop-complete",
        to = email_addresses,
    )

def notify_stop_failed(catalog_item, catalog_namespace, email_addresses, logger, resource_claim):
    logger.info("sending stop-failed notification", extra=dict(to=email_addresses))

    attachments = []
    for deployer_job in resource_claim.stop_deployer_jobs:
        deployer_log = get_deployer_log(deployer_job, logger)
        if deployer_log:
            filename = f"ansible-log-{deployer_job.job_id}.txt"
            mimeapp = MIMEApplication(deployer_log, Name=filename)
            mimeapp['Content-Disposition'] = f"attachment; filename=\"{filename}\""
            attachments.append(mimeapp)

    send_notification_email(
        attachments = attachments,
        catalog_item = catalog_item,
        catalog_namespace = catalog_namespace,
        logger = logger,
        resource_claim = resource_claim,
        subject = "ERROR: {{catalog_namespace.display_name}} service {{service_display_name}} failed to stop",
        to = email_addresses,
        template = "stop-failed",
    )

def get_template_vars(catalog_item, catalog_namespace, resource_claim):
    provision_data, provision_data_for_component = resource_claim.get_provision_data()
    retirement_timestamp, retirement_datetime, retirement_timedelta, retirement_timedelta_humanized = None, None, None, None
    retirement_timestamp = resource_claim.retirement_timestamp
    retirement_datetime = isoparse(retirement_timestamp) if retirement_timestamp else None
    retirement_timedelta = retirement_datetime - datetime.now(timezone.utc) if retirement_datetime else None
    retirement_timedelta_humanized = naturaldelta(retirement_timedelta) if retirement_timedelta else None

    stop_timestamp = resource_claim.stop_timestamp
    stop_datetime = isoparse(stop_timestamp) if stop_timestamp else None
    stop_timedelta = stop_datetime - datetime.now(timezone.utc) if stop_datetime else None
    stop_timedelta_humanized = naturaldelta(stop_timedelta) if stop_timedelta else None

    return {
        **{k: v for (k, v) in provision_data.items() if isinstance(k, str)},
        "catalog_display_name": catalog_namespace.display_name,
        "catalog_item": catalog_item,
        "catalog_namespace": catalog_namespace,
        "guid": resource_claim.guid,
        "provision_data": provision_data,
        "provision_data_for_component": provision_data_for_component,
        "retirement_datetime": retirement_datetime,
        "retirement_timestamp": retirement_timestamp,
        "retirement_timedelta": retirement_timedelta,
        "retirement_timedelta_humanized": retirement_timedelta_humanized,
        "stop_datetime": stop_datetime,
        "stop_timestamp": stop_timestamp,
        "stop_timedelta": stop_timedelta,
        "stop_timedelta_humanized": stop_timedelta_humanized,
        "service_display_name": f"{catalog_item.display_name} {resource_claim.guid}",
        "service_url": resource_claim.service_url,
        "survey_link": catalog_item.survey_link,
    }

def send_notification_email(
    catalog_item,
    catalog_namespace,
    logger,
    resource_claim,
    subject,
    to,
    template,
    message_body=[],
    template_vars={},
    attachments=[]
):
    template_vars = deepcopy(template_vars)
    template_vars.update(
        get_template_vars(
            catalog_item=catalog_item,
            catalog_namespace=catalog_namespace,
            resource_claim=resource_claim,
        )
    )
    template_vars['have_attachments'] = len(attachments) > 0

    email_subject = j2env.from_string(subject).render(**template_vars)

    if message_body:
        email_body = "\n".join(message_body)
    else:
        message_template = catalog_item.get_message_template(kebabToCamelCase(template))
        if message_template:
            email_body = j2env.from_string(message_template).render(**template_vars)
        else:
            email_body = j2env.get_template(template + '.html.j2').render(**template_vars)

    msg = MIMEMultipart('alternative')
    msg['Subject'] = email_subject
    msg['From'] = f"{catalog_namespace.display_name} <{smtp_from}>"
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
        if smtp_user and smtp_user_password:
            smtp.login(smtp_user, smtp_user_password)
        smtp.sendmail(smtp_from, to, msg.as_string())
        smtp.quit()
