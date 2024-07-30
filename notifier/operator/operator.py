#!/usr/bin/env python3

import aiohttp
import aiosmtplib
import asyncio
import jinja2
import kopf
import logging
import os
import redis.asyncio
import ssl
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
from tempfile import mkstemp

from babylon import Babylon
from catalog_item import CatalogItem
from catalog_namespace import CatalogNamespace
from configure_kopf_logging import configure_kopf_logging
from infinite_relative_backoff import InfiniteRelativeBackoff
from resource_claim import ResourceClaim
from service_namespace import ServiceNamespace

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
smtp_tls_validate_certs = os.environ.get('SMTP_TLS_VALIDATE_CERTS', 'true') != 'false'

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
        f.write(smtp_tls_cert)
if smtp_tls_key:
    smtp_tls_key_fd, smtp_tls_key_file = mkstemp()
    with open(smtp_tls_key_fd, 'w') as f:
        f.write(smtp_tls_key)
if smtp_tls_ca_cert:
    smtp_tls_ca_fd, smtp_tls_ca_cert_file = mkstemp()
    with open(smtp_tls_ca_fd, 'w') as f:
        f.write(smtp_tls_ca_cert)

smtp = aiosmtplib.SMTP(
    cert_bundle = smtp_tls_ca_cert_file,
    client_cert = smtp_tls_cert_file,
    client_key = smtp_tls_key_file,
    hostname = smtp_host,
    port = smtp_port,
    username = smtp_user,
    password = smtp_user_password,
    validate_certs = smtp_tls_validate_certs,
)

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

retirement_tasks = {}
stop_tasks = {}

@kopf.on.startup()
async def configure(settings: kopf.OperatorSettings, **_):
    global redis_connection

    # Never give up from network errors
    settings.networking.error_backoffs = InfiniteRelativeBackoff()

    # Only create events for warnings and errors
    settings.posting.level = logging.WARNING

    # Disable scanning for CustomResourceDefinitions
    settings.scanning.disabled = True

    configure_kopf_logging()

    await Babylon.on_startup()

    redis_connection = redis.asyncio.StrictRedis(
        host=redis_host,
        password=redis_password,
        port=redis_port,
        db=0,
        decode_responses=True,
    )

@kopf.on.cleanup()
async def on_cleanup(**_):
    await Babylon.on_cleanup()
    await redis_connection.close()

@kopf.on.event(
    Babylon.resource_broker_domain, Babylon.resource_broker_api_version, 'resourceclaims',
    labels={Babylon.resource_broker_ignore_label: kopf.ABSENT},
)
async def resourceclaim_event(event, logger, **_):
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

    # Cancel any pending tasks
    await cancel_tasks(resource_claim, logger)

    catalog_item = await CatalogItem.get(
        name = resource_claim.catalog_item_name,
        namespace = resource_claim.catalog_item_namespace,
    )
    if not catalog_item:
        logger.info(
            f"Cannot find CatalogItem {resource_claim.catalog_item_name} in {resource_claim.catalog_item_namespace}"
        )
        return

    catalog_namespace = await CatalogNamespace.get(resource_claim.catalog_item_namespace)
    service_namespace = await ServiceNamespace.get(resource_claim.namespace)

    email_addresses = service_namespace.get_email_recipients(resource_claim)

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
        await handle_resource_claim_delete(**kwargs)
    elif event['type'] in ['ADDED', 'MODIFIED', None]:
        await handle_resource_claim_event(**kwargs)
    else:
        logger.warning(event)

async def cancel_tasks(resource_claim, logger):
    uid = resource_claim.uid

    retirement_task = retirement_tasks.pop(uid, None)
    if retirement_task:
        retirement_task.cancel()
        try:
            await retirement_task
        except asyncio.CancelledError:
            pass

    stop_task = stop_tasks.pop(uid, None)
    if stop_task:
        stop_task.cancel()
        try:
            await stop_task
        except asyncio.CancelledError:
            pass

def create_retirement_task(logger, catalog_item, resource_claim, **kwargs):
    retirement_timestamp = resource_claim.retirement_timestamp
    if not retirement_timestamp:
        return
    retirement_datetime = isoparse(retirement_timestamp)

    notification_timedelta = (
        retirement_datetime - datetime.now(timezone.utc) - catalog_item.notification_before_retirement_timedelta
    )
    notification_interval = notification_timedelta.total_seconds()
    if notification_interval > 0:
        logger.info("scheduled retirement notification in " + naturaldelta(notification_timedelta))
        retirement_tasks[resource_claim.uid] = asyncio.create_task(
            notify_retirement_scheduled_after(
                interval = notification_interval,
                logger = kopf.LocalObjectLogger(body=resource_claim.definition, settings=kopf.OperatorSettings()),
                catalog_item = catalog_item,
                resource_claim = resource_claim,
                **kwargs,
            )
        )

def create_stop_task(logger, resource_claim, **kwargs):
    stop_timestamp = resource_claim.stop_timestamp
    if not stop_timestamp:
        return
    stop_datetime = isoparse(stop_timestamp)
    notification_timedelta = stop_datetime - datetime.now(timezone.utc) - timedelta(minutes=30, seconds=30)
    notification_interval = notification_timedelta.total_seconds()
    if notification_interval > 0:
        logger.info("scheduled stop notification in " + naturaldelta(notification_timedelta))
        stop_tasks[resource_claim.uid] = asyncio.create_task(
            notify_stop_scheduled_after(
                interval = notification_interval,
                logger = kopf.LocalObjectLogger(body=resource_claim.definition, settings=kopf.OperatorSettings()),
                resource_claim = resource_claim,
                **kwargs,
            )
        )

async def get_deployer_log(deployer_job, logger):
    secret_list = await Babylon.core_v1_api.list_namespaced_secret(
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

    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"https://{hostname}/api/v2/jobs/{deployer_job.job_id}/stdout/?format=txt",
                auth = aiohttp.BasicAuth(user, password),
                raise_for_status = True,
                verify_ssl = False,
            ) as response:
                return await response.text()
    except Exception as err:
        logger.warning(f"Failed to get deployer job {deployer_job.job_id} from {hostname}: {err}")
        return None

async def handle_resource_claim_delete(**kwargs):
    await notify_deleted(**kwargs)

async def handle_resource_claim_event(catalog_item, **kwargs):
    if not catalog_item.retirement_scheduled_email_disabled:
        create_retirement_task(catalog_item=catalog_item, **kwargs)
    if not catalog_item.stop_scheduled_email_disabled:
        create_stop_task(catalog_item=catalog_item, **kwargs)
    if not catalog_item.provision_failed_email_disabled:
        await notify_if_provision_failed(catalog_item=catalog_item, **kwargs)
    if not catalog_item.provision_started_email_disabled:
        await notify_if_provision_started(catalog_item=catalog_item, **kwargs)
    if not catalog_item.service_ready_email_disabled:
        await notify_if_ready(catalog_item=catalog_item, **kwargs)
    if not catalog_item.start_complete_email_disabled:
        await notify_if_start_complete(catalog_item=catalog_item, **kwargs)
    if not catalog_item.start_failed_email_disabled:
        await notify_if_start_failed(catalog_item=catalog_item, **kwargs)
    if not catalog_item.stop_complete_email_disabled:
        await notify_if_stop_complete(catalog_item=catalog_item, **kwargs)
    if not catalog_item.stop_failed_email_disabled:
        await notify_if_stop_failed(catalog_item=catalog_item, **kwargs)

def kebabToCamelCase(kebab_string):
    return ''.join([s if i == 0 else s.capitalize() for i, s in enumerate(kebab_string.split('-'))])

async def notify_if_provision_failed(catalog_item, catalog_namespace, email_addresses, logger, resource_claim):
    creation_ts = resource_claim.creation_timestamp
    creation_dt = isoparse(creation_ts)

    if creation_dt < datetime.now(timezone.utc) - timedelta(days=1):
        logger.debug("Too old to notify provision failed")
        return

    if not resource_claim.provision_failed:
        logger.debug("Provision not failed")
        return

    rkey = f"{resource_claim.uid}/provision-failed"
    notified = await redis_connection.getset(rkey, creation_ts)
    if notified == creation_ts:
        return
    await redis_connection.expire(rkey, timedelta(days=7))

    await notify_provision_failed(
        catalog_item = catalog_item,
        catalog_namespace = catalog_namespace,
        email_addresses = email_addresses,
        logger = logger,
        resource_claim = resource_claim,
    )

async def notify_if_provision_started(catalog_item, catalog_namespace, email_addresses, logger, resource_claim):
    creation_ts = resource_claim.creation_timestamp
    creation_dt = isoparse(creation_ts)

    if creation_dt < datetime.now(timezone.utc) - timedelta(hours=2):
        logger.debug("Too old to notify provision started")
        return

    if not resource_claim.provision_started:
        logger.debug("Provision not started")
        return

    rkey = f"{resource_claim.uid}/provision-started"
    notified = await redis_connection.getset(rkey, creation_ts)
    if notified == creation_ts:
        logger.debug(f"Already notified provision started")
        return
    await redis_connection.expire(rkey, timedelta(days=1))

    await notify_provision_started(
        catalog_item = catalog_item,
        catalog_namespace = catalog_namespace,
        email_addresses = email_addresses,
        logger = logger,
        resource_claim = resource_claim,
    )

async def notify_if_ready(catalog_item, catalog_namespace, email_addresses, logger, resource_claim):
    creation_ts = resource_claim.creation_timestamp
    creation_dt = isoparse(creation_ts)

    if creation_dt < datetime.now(timezone.utc) - timedelta(days=1):
        logger.debug("Too old to notify ready")
        return

    if not resource_claim.provision_complete:
        logger.debug("Provision not complete")
        return

    rkey = f"{resource_claim.uid}/ready"
    notified = await redis_connection.getset(rkey, creation_ts)
    if notified == creation_ts:
        logger.debug(f"Already notified provision complete")
        return
    await redis_connection.expire(rkey, timedelta(days=7))

    await notify_ready(
        catalog_item = catalog_item,
        catalog_namespace = catalog_namespace,
        email_addresses = email_addresses,
        logger = logger,
        resource_claim = resource_claim,
    )

async def notify_if_start_complete(catalog_item, catalog_namespace, email_addresses, logger, resource_claim):
    started_ts = resource_claim.last_started_timestamp
    if not started_ts:
        logger.debug("Not started")
        return

    started_dt = isoparse(started_ts)

    if started_dt < datetime.now(timezone.utc) - timedelta(hours=1):
        logger.debug("Too long ago to notify started")
        return

    rkey = f"{resource_claim.uid}/start-complete"
    notified = await redis_connection.getset(rkey, started_ts)
    if notified == started_ts:
        return
    await redis_connection.expire(rkey, timedelta(days=1))

    await notify_start_complete(
        catalog_item = catalog_item,
        catalog_namespace = catalog_namespace,
        email_addresses = email_addresses,
        logger = logger,
        resource_claim = resource_claim,
    )

async def notify_if_start_failed(catalog_item, catalog_namespace, email_addresses, logger, resource_claim):
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
    notified = await redis_connection.getset(rkey, start_ts)
    if notified == start_ts:
        return
    await redis_connection.expire(rkey, timedelta(days=1))

    await notify_start_failed(
        catalog_item = catalog_item,
        catalog_namespace = catalog_namespace,
        email_addresses = email_addresses,
        logger = logger,
        resource_claim = resource_claim,
    )

async def notify_if_stop_complete(catalog_item, catalog_namespace, email_addresses, logger, resource_claim):
    stopped_ts = resource_claim.last_stopped_timestamp
    if not stopped_ts:
        logger.debug("Not stopped")
        return

    stopped_dt = isoparse(stopped_ts)

    if stopped_dt < datetime.now(timezone.utc) - timedelta(hours=1):
        logger.debug("Too long ago to notify stopped")
        return

    rkey = f"{resource_claim.uid}/stop-complete"
    notified = await redis_connection.getset(rkey, stopped_ts)
    if notified == stopped_ts:
        return
    await redis_connection.expire(rkey, timedelta(days=1))

    await notify_stop_complete(
        catalog_item = catalog_item,
        catalog_namespace = catalog_namespace,
        email_addresses = email_addresses,
        logger = logger,
        resource_claim = resource_claim,
    )

async def notify_if_stop_failed(catalog_item, catalog_namespace, email_addresses, logger, resource_claim):
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
    notified = await redis_connection.getset(rkey, stop_ts)
    if notified == stop_ts:
        return
    await redis_connection.expire(rkey, timedelta(days=1))

    await notify_stop_failed(
        catalog_item = catalog_item,
        catalog_namespace = catalog_namespace,
        email_addresses = email_addresses,
        logger = logger,
        resource_claim = resource_claim,
    )

async def notify_deleted(catalog_item, catalog_namespace, email_addresses, logger, resource_claim):
    logger.info("sending service-deleted notification", extra=dict(to=email_addresses))
    await send_notification_email(
        catalog_item = catalog_item,
        catalog_namespace = catalog_namespace,
        logger = logger,
        resource_claim = resource_claim,
        subject = catalog_item.service_deleted_email_subject_template,
        template = "service-deleted",
        to = email_addresses,
    )

async def notify_provision_failed(catalog_item, catalog_namespace, email_addresses, logger, resource_claim):
    logger.info("sending provision-failed notification", extra=dict(to=email_addresses))

    attachments = []
    for deployer_job in resource_claim.provision_deployer_jobs:
        deployer_log = await get_deployer_log(deployer_job, logger)
        if deployer_log:
            filename = f"ansible-log-{deployer_job.job_id}.txt"
            mimeapp = MIMEApplication(deployer_log, Name=filename)
            mimeapp['Content-Disposition'] = f"attachment; filename=\"{filename}\""
            attachments.append(mimeapp)

    await send_notification_email(
        attachments = attachments,
        catalog_item = catalog_item,
        catalog_namespace = catalog_namespace,
        logger = logger,
        resource_claim = resource_claim,
        subject = catalog_item.provision_failed_email_subject_template,
        to = email_addresses,
        template = "provision-failed",
    )

async def notify_provision_started(catalog_item, catalog_namespace, email_addresses, logger, resource_claim):
    logger.info("sending provision-started notification", extra=dict(to=email_addresses))
    await send_notification_email(
        catalog_item = catalog_item,
        catalog_namespace = catalog_namespace,
        logger = logger,
        resource_claim = resource_claim,
        subject = catalog_item.provision_started_email_subject_template,
        to = email_addresses,
        template = "provision-started",
        template_vars = dict(
            provision_time_estimate = 'an hour',
        ),
    )

async def notify_ready(catalog_item, catalog_namespace, email_addresses, logger, resource_claim):
    logger.info("sending service-ready notification", extra=dict(to=email_addresses))
    provision_message_body = resource_claim.provision_message_body
    provision_messages = resource_claim.provision_messages

    template_vars = {}
    if provision_messages:
        template_vars['provision_messages'] = provision_messages
        asciidoctor_process = await asyncio.create_subprocess_exec(
            'asciidoctor', '-sb', 'html5', '-',
            stdin = asyncio.subprocess.PIPE,
            stdout = asyncio.subprocess.PIPE,
            stderr = asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asciidoctor_process.communicate(
            input = "\n".join([m.rstrip("\n") + ' +' if m else m for m in provision_messages]).encode('utf8')
        )
        if stderr:
            logger.warning(f"asciidoctor error: f{stderr}")
        template_vars['provision_messages_html'] = stdout.decode('utf8')

    await send_notification_email(
        catalog_item = catalog_item,
        catalog_namespace = catalog_namespace,
        logger = logger,
        message_body = provision_message_body,
        resource_claim = resource_claim,
        subject = catalog_item.service_ready_email_subject_template,
        template = "service-ready",
        template_vars = template_vars,
        to = email_addresses,
    )

async def notify_retirement_scheduled_after(interval, resource_claim, **kwargs):
    try:
        await asyncio.sleep(interval)
        await resource_claim.refetch()
        if not resource_claim.ignore:
            await notify_retirement_scheduled(resource_claim=resource_claim, **kwargs)
    except asyncio.CancelledError:
        pass

async def notify_retirement_scheduled(catalog_item, catalog_namespace, email_addresses, logger, resource_claim):
    logger.info("sending retirement schedule notification")

    await send_notification_email(
        catalog_item = catalog_item,
        catalog_namespace = catalog_namespace,
        logger = logger,
        resource_claim = resource_claim,
        subject = catalog_item.retirement_scheduled_email_subject_template,
        to = email_addresses,
        template = "retirement-scheduled",
    )

async def notify_stop_scheduled_after(interval, resource_claim, **kwargs):
    try:
        await asyncio.sleep(interval)
        await resource_claim.refetch()
        if not resource_claim.ignore:
            await notify_stop_scheduled(resource_claim=resource_claim, **kwargs)
    except asyncio.CancelledError:
        pass

async def notify_stop_scheduled(catalog_item, catalog_namespace, email_addresses, logger, resource_claim):
    logger.info("sending stop schedule notification")

    await send_notification_email(
        catalog_item = catalog_item,
        catalog_namespace = catalog_namespace,
        logger = logger,
        resource_claim = resource_claim,
        subject = catalog_item.stop_scheduled_email_subject_template,
        to = email_addresses,
        template = "stop-scheduled",
    )

async def notify_start_complete(catalog_item, catalog_namespace, email_addresses, logger, resource_claim):
    logger.info("sending start-complete notification", extra=dict(to=email_addresses))
    await send_notification_email(
       catalog_item = catalog_item,
       catalog_namespace = catalog_namespace,
        logger = logger,
        resource_claim = resource_claim,
        subject = catalog_item.start_complete_email_subject_template,
        template = "start-complete",
        to = email_addresses,
    )

async def notify_start_failed(catalog_item, catalog_namespace, email_addresses, logger, resource_claim):
    logger.info("sending start-failed notification", extra=dict(to=email_addresses))

    attachments = []
    for deployer_job in resource_claim.start_deployer_jobs:
        deployer_log = await get_deployer_log(deployer_job, logger)
        if deployer_log:
            filename = f"ansible-log-{deployer_job.job_id}.txt"
            mimeapp = MIMEApplication(deployer_log, Name=filename)
            mimeapp['Content-Disposition'] = f"attachment; filename=\"{filename}\""
            attachments.append(mimeapp)

    await send_notification_email(
        attachments = attachments,
        catalog_item = catalog_item,
        catalog_namespace = catalog_namespace,
        logger = logger,
        resource_claim = resource_claim,
        subject = catalog_item.start_failed_email_subject_template,
        to = email_addresses,
        template = "start-failed",
    )

async def notify_stop_complete(catalog_item, catalog_namespace, email_addresses, logger, resource_claim):
    logger.info("sending stop-complete notification", extra=dict(to=email_addresses))
    await send_notification_email(
        catalog_item = catalog_item,
        catalog_namespace = catalog_namespace,
        logger = logger,
        resource_claim = resource_claim,
        subject = catalog_item.stop_complete_email_subject_template,
        template = "stop-complete",
        to = email_addresses,
    )

async def notify_stop_failed(catalog_item, catalog_namespace, email_addresses, logger, resource_claim):
    logger.info("sending stop-failed notification", extra=dict(to=email_addresses))

    attachments = []
    for deployer_job in resource_claim.stop_deployer_jobs:
        deployer_log = await get_deployer_log(deployer_job, logger)
        if deployer_log:
            filename = f"ansible-log-{deployer_job.job_id}.txt"
            mimeapp = MIMEApplication(deployer_log, Name=filename)
            mimeapp['Content-Disposition'] = f"attachment; filename=\"{filename}\""
            attachments.append(mimeapp)

    await send_notification_email(
        attachments = attachments,
        catalog_item = catalog_item,
        catalog_namespace = catalog_namespace,
        logger = logger,
        resource_claim = resource_claim,
        subject = catalog_item.stop_failed_email_subject_template,
        to = email_addresses,
        template = "stop-failed",
    )

def get_template_vars(catalog_item, catalog_namespace, resource_claim):
    provision_data, provision_data_for_component = resource_claim.get_provision_data()

    retirement_timestamp = resource_claim.retirement_timestamp
    retirement_datetime = isoparse(retirement_timestamp) if retirement_timestamp else None
    retirement_timedelta = retirement_datetime - datetime.now(timezone.utc) if retirement_datetime else None
    retirement_timedelta_humanized = naturaldelta(retirement_timedelta + timedelta(seconds=30)) if retirement_timedelta else None

    stop_timestamp = resource_claim.stop_timestamp
    stop_datetime = isoparse(stop_timestamp) if stop_timestamp else None
    stop_timedelta = stop_datetime - datetime.now(timezone.utc) if stop_datetime else None
    stop_timedelta_humanized = naturaldelta(stop_timedelta + timedelta(seconds=30)) if stop_timedelta else None

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

async def send_notification_email(
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
            try:
                email_body = j2env.from_string(message_template).render(**template_vars)
            except Exception as exception:
                logger.warning(f"Failed to render template: {exception}")
                email_body = j2env.get_template(template + '.html.j2').render(**template_vars)
                email_body += (
                    "<p><b>Attention:</b> "
                    "A custom message template was configured for your service, "
                    "but unfortunately, rendering failed with the following error:</p> "
                    f"<p>{exception}</p>"
                    "<p>The content shown above is the default message template.</p>"
                )
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

    await send_email_message(msg, logger=logger)

async def send_email_message(msg, logger, retries=5):
    try:
        await smtp.connect()
        await smtp.send_message(msg)
        await smtp.quit()
    except aiosmtplib.errors.SMTPException:
        if retries > 0:
            logger.exception(f"Failed sending email to {msg['To']}, will retry.")
            await asyncio.sleep(5)
            await send_email_message(msg, logger=logger, retries=retries-1)
        else:
            logger.exception(f"Failed sending email to {msg['To']}.")
