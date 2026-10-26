"""CatalogItemOrder model: request normalization, digests and lifecycle rules.

Pure functions shared by the catalog API (submission, cancel, retry) and the
CatalogItemOrder controller. Kubernetes access lives in
catalog_item_order_kube.py, resource construction in
catalog_item_order_adapters.py and reconciliation in
catalog_item_order_controller.py. See docs/Catalog_Item_Orders.md.
"""

import copy
import hashlib
import re
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

from approval_policy import canonical_json, parse_duration, sha256_digest

BABYLON_DOMAIN = 'babylon.gpte.redhat.com'
DEMO_DOMAIN = 'demo.redhat.com'
GPTE_DOMAIN = 'gpte.redhat.com'
POOLBOY_DOMAIN = 'poolboy.gpte.redhat.com'

API_GROUP = BABYLON_DOMAIN
API_VERSION = 'v1'
KIND = 'CatalogItemOrder'
PLURAL = 'catalogitemorders'

ORDER_TYPE_SERVICE = 'service'
ORDER_TYPE_WORKSHOP = 'workshop'
ORDER_TYPE_SELF_PACED_LAB = 'selfPacedLab'
SUPPORTED_ORDER_TYPES = (ORDER_TYPE_SERVICE, ORDER_TYPE_WORKSHOP, ORDER_TYPE_SELF_PACED_LAB)
# Known ordering paths that are not supported through CatalogItemOrder yet.
UNSUPPORTED_ORDER_TYPES = {
    'multiWorkshop': 'MultiWorkshop event orders are not supported by CatalogItemOrder',
    'multiuserServiceWorkshop': (
        'Converting a multi-user service into a workshop is not supported by CatalogItemOrder'
    ),
    'externalUrl': 'External URL catalog items are not provisioned by Babylon',
    'whiteGloveRequest': 'White glove request fulfillment is not supported by CatalogItemOrder',
}

PHASE_SUBMITTED = 'Submitted'
PHASE_PENDING_APPROVAL = 'PendingApproval'
PHASE_READY = 'Ready'
PHASE_PROVISIONING = 'Provisioning'
PHASE_PROVISIONED = 'Provisioned'
PHASE_FAILED = 'Failed'
PHASE_DENIED = 'Denied'
PHASE_EXPIRED = 'Expired'
PHASE_CANCELLED = 'Cancelled'
PHASE_BLOCKED = 'Blocked'
TERMINAL_PHASES = (PHASE_PROVISIONED, PHASE_DENIED, PHASE_EXPIRED, PHASE_CANCELLED)

APPROVAL_NOT_REQUIRED = 'NotRequired'
APPROVAL_PENDING = 'Pending'
APPROVAL_APPROVED = 'Approved'
APPROVAL_DENIED = 'Denied'
APPROVAL_EXPIRED = 'Expired'
APPROVAL_REVOKED = 'Revoked'
DECISION_OUTCOMES = (APPROVAL_APPROVED, APPROVAL_DENIED)

ATTEMPT_DISPATCHING = 'Dispatching'
ATTEMPT_PROVISIONING = 'Provisioning'
ATTEMPT_SUCCEEDED = 'Succeeded'
ATTEMPT_FAILED = 'Failed'
ATTEMPT_CLEANING_UP = 'CleaningUp'
ATTEMPT_CLEANED_UP = 'CleanedUp'
ACTIVE_ATTEMPT_STATES = (ATTEMPT_DISPATCHING, ATTEMPT_PROVISIONING, ATTEMPT_CLEANING_UP)

ORDER_LABEL = f'{BABYLON_DOMAIN}/catalog-item-order'
ORDER_UID_LABEL = f'{BABYLON_DOMAIN}/catalog-item-order-uid'
ORDER_ATTEMPT_LABEL = f'{BABYLON_DOMAIN}/catalog-item-order-attempt'
REQUESTER_UID_LABEL = f'{BABYLON_DOMAIN}/requester-uid'
CATALOG_ITEM_NAME_LABEL = f'{BABYLON_DOMAIN}/catalogItemName'
CATALOG_ITEM_NAMESPACE_LABEL = f'{BABYLON_DOMAIN}/catalogItemNamespace'

RESERVED_PARAMETERS = ('purpose', 'purpose_activity', 'purpose_explanation', 'salesforce_id')
SALESFORCE_ITEM_TYPES = ('campaign', 'opportunity', 'project')
SUBMISSION_KEYS = {
    'activity', 'catalogItem', 'explanation', 'idempotencyKey', 'namespace',
    'orderType', 'parameters', 'purpose', 'salesforceItems', 'schedule',
    'selfPacedLab', 'service', 'skipSalesforceId', 'workshop',
}
SCHEDULE_KEYS = {'end', 'readyBy', 'start', 'stop'}
SERVICE_KEYS = {'autoDetach', 'resourcePool'}
WORKSHOP_KEYS = {
    'accessPassword', 'autoDetach', 'concurrency', 'count', 'description',
    'displayName', 'openRegistration', 'resourcePool', 'startDelay',
}
SELF_PACED_LAB_KEYS = {
    'accessPassword', 'assignedLifespan', 'concurrency', 'description',
    'displayName', 'openRegistration', 'poolSize', 'startDelay',
    'unassignedLifespan',
}
# CatalogItem spec fields whose change makes an evaluated order stale.
MATERIAL_CATALOG_FIELDS = (
    'externalUrl', 'lifespan', 'multiuser', 'numUsersParameter', 'parameters',
    'resources', 'runtime', 'sandboxes', 'workshopUiDisabled',
    'workshopUiMaxInstances', 'workshopUserMode',
)

_IDEMPOTENCY_KEY_RE = re.compile(r'^[A-Za-z0-9._:-]{8,128}$')
_DNS_NAME_RE = re.compile(r'^[a-z0-9]([-a-z0-9.]{0,251}[a-z0-9])?$')
_CATALOG_ITEM_NAME_RE = re.compile(r'^[a-zA-Z0-9]([-a-zA-Z0-9._]{0,251}[a-zA-Z0-9])?$')
_ACCESS_PASSWORD_ALPHABET = '23456789abcdefghjkmnpqrstuzwxyz'
MAX_PARAMETERS_BYTES = 65536
MAX_STRING_PARAMETER_LENGTH = 16384
DEFAULT_WORKSHOP_MAX_INSTANCES = 30
MAX_SELF_PACED_LAB_POOL_SIZE = 200


class OrderValidationError(Exception):
    """Submission rejected; status is an HTTP status code."""

    def __init__(self, code, message, status=400):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


class OrderConflictError(Exception):
    """Requested lifecycle operation conflicts with current order state."""

    def __init__(self, code, message):
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True)
class Requester:
    user: str
    uid: str
    email: str | None = None


def utcnow():
    return datetime.now(timezone.utc)


def format_time(value):
    """Format like the catalog UI dateToApiString: second precision, Z suffix."""
    return value.astimezone(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def parse_time(value):
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return None
    return parsed.astimezone(timezone.utc)


def digest_text(value):
    return 'sha256:' + hashlib.sha256(value.encode('utf-8')).hexdigest()


def order_name(requester_uid, namespace, idempotency_key):
    """Deterministic order name scoping idempotency to requester and namespace."""
    seed = '\0'.join((requester_uid, namespace, idempotency_key))
    return 'order-' + hashlib.sha256(seed.encode('utf-8')).hexdigest()[:20]


def reporting_user_lookup_path(email):
    """Reporting API manager-data lookup path for GPTEINFRA-18189.

    The authenticated requester email is encoded as one path segment."""
    return '/users/by-email/' + quote(email, safe='')


def sanitize_name(name, preserve_dots=False):
    """Match catalog UI sanitizeForK8s."""
    pattern = r'[^a-z0-9.]' if preserve_dots else r'[^a-z0-9]'
    value = re.sub(pattern, '-', name.lower())
    value = re.sub(r'-+', '-', value)
    return value.strip('-')


def generate_name_suffix():
    """Random suffix chosen when an attempt is claimed and recorded in status
    before any resource is created. Unpredictable, so a requester cannot
    pre-create an object under the planned name."""
    return secrets.token_hex(4)


def child_resource_name(base_name, suffix, max_length=63):
    """Provisioning resource name, same shape as the catalog UI
    generateK8sNameWithSuffix."""
    base = sanitize_name(base_name, preserve_dots=True)[:max_length - len(suffix) - 1]
    base = base.rstrip('.-') or 'order'
    return f"{base}-{suffix}"


def catalog_material_digest(catalog_item):
    spec = catalog_item.get('spec') or {}
    return sha256_digest({
        'uid': (catalog_item.get('metadata') or {}).get('uid'),
        'spec': {field: spec.get(field) for field in MATERIAL_CATALOG_FIELDS},
    })


def request_digest(spec, namespace):
    """Digest binding the immutable request. Approval decisions must quote it."""
    catalog_item = spec['catalogItem']
    return sha256_digest({
        'catalogItem': {
            key: catalog_item.get(key)
            for key in ('materialDigest', 'name', 'namespace', 'uid')
        },
        'namespace': namespace,
        'orderType': spec['orderType'],
        'request': spec['request'],
        'requester': {'uid': spec['requester']['uid'], 'user': spec['requester']['user']},
        'submittedAt': spec['submittedAt'],
    })


def submission_digest(body):
    """Digest of the client submission excluding the idempotency key."""
    return sha256_digest({key: value for key, value in body.items() if key != 'idempotencyKey'})


def _string(value, path, max_length=256, required=False):
    if value is None:
        if required:
            raise OrderValidationError('invalid_request', f"{path} is required")
        return None
    if not isinstance(value, str) or (required and not value):
        raise OrderValidationError('invalid_request', f"{path} must be a string")
    if len(value) > max_length:
        raise OrderValidationError(
            'invalid_request', f"{path} must be at most {max_length} characters"
        )
    return value


def _boolean(value, path, default):
    if value is None:
        return default
    if not isinstance(value, bool):
        raise OrderValidationError('invalid_request', f"{path} must be a boolean")
    return value


def _integer(value, path, default, minimum, maximum):
    if value is None:
        return default
    if isinstance(value, bool) or not isinstance(value, int):
        raise OrderValidationError('invalid_request', f"{path} must be an integer")
    if value < minimum or value > maximum:
        raise OrderValidationError(
            'invalid_request', f"{path} must be between {minimum} and {maximum}"
        )
    return value


def _mapping(value, path, allowed):
    if value is None:
        return {}
    if not isinstance(value, dict):
        raise OrderValidationError('invalid_request', f"{path} must be an object")
    unknown = sorted(set(value) - allowed)
    if unknown:
        raise OrderValidationError(
            'invalid_request', f"{path} has unsupported fields: {', '.join(unknown)}"
        )
    return value


def _duration_string(value, path, default):
    if value is None:
        value = default
    if parse_duration(value) is None:
        raise OrderValidationError('invalid_request', f"{path} must be a duration such as 4h")
    return value


def _dns_name(value, path):
    value = _string(value, path, max_length=253)
    if value is not None and not _DNS_NAME_RE.match(value):
        raise OrderValidationError('invalid_request', f"{path} must be a valid resource name")
    return value


def _schema_type_matches(declared, value):
    if declared == 'string':
        return isinstance(value, str)
    if declared == 'integer':
        return isinstance(value, int) and not isinstance(value, bool)
    if declared == 'number':
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if declared == 'boolean':
        return isinstance(value, bool)
    if declared == 'array':
        return isinstance(value, list)
    if declared == 'object':
        return isinstance(value, dict)
    return isinstance(value, (str, int, float, bool))


def _coerce_default(declared, value):
    """CatalogItem `value` defaults are strings; coerce them to the schema type."""
    if not isinstance(value, str):
        return value
    try:
        if declared == 'integer':
            return int(value)
        if declared == 'number':
            return float(value)
    except ValueError:
        return value
    if declared == 'boolean' and value.lower() in ('true', 'false'):
        return value.lower() == 'true'
    return value


def _validate_parameter_value(name, schema, value):
    path = f"parameters.{name}"
    declared = schema.get('type')
    if not _schema_type_matches(declared, value):
        raise OrderValidationError(
            'invalid_parameter', f"{path} must be of type {declared or 'scalar'}"
        )
    if isinstance(value, str) and len(value) > MAX_STRING_PARAMETER_LENGTH:
        raise OrderValidationError('invalid_parameter', f"{path} is too long")
    enum = schema.get('enum')
    if isinstance(enum, list) and value not in enum:
        raise OrderValidationError('invalid_parameter', f"{path} must be one of the allowed values")
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        for keyword, check in (
            ('minimum', lambda bound: value < bound),
            ('maximum', lambda bound: value > bound),
            ('exclusiveMinimum', lambda bound: value <= bound),
            ('exclusiveMaximum', lambda bound: value >= bound),
        ):
            bound = schema.get(keyword)
            if isinstance(bound, (int, float)) and not isinstance(bound, bool) and check(bound):
                raise OrderValidationError('invalid_parameter', f"{path} violates {keyword} {bound}")
    if isinstance(value, str):
        min_length = schema.get('minLength')
        max_length = schema.get('maxLength')
        if isinstance(min_length, int) and len(value) < min_length:
            raise OrderValidationError('invalid_parameter', f"{path} is shorter than {min_length}")
        if isinstance(max_length, int) and len(value) > max_length:
            raise OrderValidationError('invalid_parameter', f"{path} is longer than {max_length}")
        pattern = schema.get('pattern')
        if isinstance(pattern, str):
            try:
                matched = re.search(pattern, value)
            except re.error:
                matched = True
            if not matched:
                raise OrderValidationError('invalid_parameter', f"{path} does not match the required pattern")


def normalize_parameters(catalog_item, submitted):
    """Return effective parameter values with defaults, as provisioning uses them.

    Mirrors the catalog UI: a submitted value wins, otherwise the
    openAPIV3Schema default, otherwise the parameter `value`. Submitted values
    are validated against the parameter schema. Form JavaScript conditions
    (formDisableCondition, formHideCondition, formRequireCondition, validation)
    are UI behavior and are not evaluated server-side."""
    if submitted is None:
        submitted = {}
    if not isinstance(submitted, dict):
        raise OrderValidationError('invalid_request', 'parameters must be an object')
    specs = {}
    for parameter in (catalog_item.get('spec') or {}).get('parameters') or []:
        if isinstance(parameter, dict) and isinstance(parameter.get('name'), str):
            specs[parameter['name']] = parameter
    for name in submitted:
        if name in RESERVED_PARAMETERS:
            raise OrderValidationError(
                'reserved_parameter',
                f"parameters.{name} is reserved; use the dedicated order fields",
            )
        if name not in specs:
            raise OrderValidationError('unknown_parameter', f"parameters.{name} is not defined by the catalog item")
    effective = {}
    for name, parameter in specs.items():
        if name == 'purpose':
            continue
        schema = parameter.get('openAPIV3Schema')
        schema = schema if isinstance(schema, dict) else {}
        if name in submitted and submitted[name] is not None:
            value = submitted[name]
            _validate_parameter_value(name, schema, value)
        elif schema.get('default') is not None:
            value = schema['default']
        else:
            value = _coerce_default(schema.get('type'), parameter.get('value'))
        if (value is None or value == '') and parameter.get('required') and name not in RESERVED_PARAMETERS:
            raise OrderValidationError(
                'missing_required_parameter', f"parameters.{name} is required"
            )
        if value is not None:
            effective[name] = value
    if len(canonical_json(effective).encode('utf-8')) > MAX_PARAMETERS_BYTES:
        raise OrderValidationError('invalid_request', 'parameters are too large')
    return effective


def purpose_options(catalog_item):
    for parameter in (catalog_item.get('spec') or {}).get('parameters') or []:
        if isinstance(parameter, dict) and parameter.get('name') == 'purpose':
            schema = parameter.get('openAPIV3Schema') or {}
            options = schema.get('x-form-options') if isinstance(schema, dict) else None
            return [option for option in options or [] if isinstance(option, dict)]
    return []


def normalize_purpose(catalog_item, body, groups):
    purpose = _string(body.get('purpose'), 'purpose')
    activity = _string(body.get('activity'), 'activity')
    explanation = _string(body.get('explanation'), 'explanation', max_length=4096)
    options = purpose_options(catalog_item)
    if options:
        option = next((o for o in options if o.get('name') == purpose), None)
        if purpose is None or option is None:
            raise OrderValidationError('invalid_purpose', 'purpose must be one of the catalog item purposes')
        required_roles = option.get('requiredRoles')
        if isinstance(required_roles, list) and required_roles and not set(required_roles) & set(groups):
            raise OrderValidationError('invalid_purpose', 'purpose is not available to the requester', status=403)
        if activity is not None and activity != option.get('activity'):
            raise OrderValidationError('invalid_purpose', 'activity does not match the selected purpose')
        activity = option.get('activity')
        if option.get('requireUserInput') and not explanation:
            raise OrderValidationError('invalid_purpose', 'explanation is required for the selected purpose')
    result = {}
    for key, value in (('purpose', purpose), ('activity', activity), ('explanation', explanation)):
        if value:
            result[key] = value
    return result


def normalize_salesforce(body):
    items = body.get('salesforceItems')
    normalized = []
    if items is not None:
        if not isinstance(items, list) or len(items) > 20:
            raise OrderValidationError('invalid_request', 'salesforceItems must be a list of at most 20 items')
        for index, item in enumerate(items):
            item = _mapping(item, f"salesforceItems[{index}]", {'id', 'type'})
            item_id = _string(item.get('id'), f"salesforceItems[{index}].id", max_length=128, required=True)
            item_type = item.get('type')
            if item_type not in SALESFORCE_ITEM_TYPES:
                raise OrderValidationError(
                    'invalid_request',
                    f"salesforceItems[{index}].type must be one of {', '.join(SALESFORCE_ITEM_TYPES)}",
                )
            normalized.append({'id': item_id, 'type': item_type})
    return normalized, _boolean(body.get('skipSalesforceId'), 'skipSalesforceId', False)


def auto_stop_disabled(catalog_item):
    """Match catalog UI isAutoStopDisabled."""
    spec = catalog_item.get('spec') or {}
    supported_actions = spec.get('supportedActions')
    if supported_actions is not None and 'stop' not in supported_actions:
        return True
    runtime_default = (spec.get('runtime') or {}).get('default')
    if runtime_default:
        return '999h' in runtime_default
    return False


def _schedule_time(value, path):
    if value is None:
        return None
    parsed = parse_time(value) if isinstance(value, str) else None
    if parsed is None:
        raise OrderValidationError('invalid_schedule', f"{path} must be an RFC 3339 timestamp with timezone")
    return parsed


def normalize_schedule(catalog_item, body, order_type, now):
    """Resolve start/stop/end the way the catalog UI form initializes them."""
    schedule = _mapping(body.get('schedule'), 'schedule', SCHEDULE_KEYS)
    spec = catalog_item.get('spec') or {}
    start = _schedule_time(schedule.get('start'), 'schedule.start')
    stop = _schedule_time(schedule.get('stop'), 'schedule.stop')
    end = _schedule_time(schedule.get('end'), 'schedule.end')
    ready_by = _schedule_time(schedule.get('readyBy'), 'schedule.readyBy')
    origin = start or now
    lifespan = spec.get('lifespan') or {}
    runtime = spec.get('runtime') or {}
    end_default = lifespan.get('default') if parse_duration(lifespan.get('default')) else '2d'
    stop_default = runtime.get('default') if parse_duration(runtime.get('default')) else '4h'
    wants_stop = not auto_stop_disabled(catalog_item) and order_type != ORDER_TYPE_SELF_PACED_LAB
    # Without a start time, defaults are kept relative and resolved when the
    # order is dispatched, so time spent waiting for approval does not shorten
    # the runtime or lifespan. Explicit times stay absolute.
    relative = {}
    if end is None:
        if start is None:
            relative['endAfter'] = end_default
        end = origin + timedelta(seconds=parse_duration(end_default))
    if stop is None and wants_stop:
        if start is None:
            relative['stopAfter'] = stop_default
        stop = origin + timedelta(seconds=parse_duration(stop_default))
    if end <= now:
        raise OrderValidationError('invalid_schedule', 'schedule.end must be in the future')
    if start is not None and start >= end:
        raise OrderValidationError('invalid_schedule', 'schedule.start must be before schedule.end')
    if stop is not None and stop <= origin:
        raise OrderValidationError('invalid_schedule', 'schedule.stop must be after the start time')
    maximums = [
        parse_duration(lifespan.get(key)) for key in ('maximum', 'relativeMaximum')
        if parse_duration(lifespan.get(key))
    ]
    if maximums and (end - origin).total_seconds() > min(maximums):
        raise OrderValidationError('invalid_schedule', 'schedule.end exceeds the catalog item maximum lifespan')
    if ready_by is not None and order_type != ORDER_TYPE_WORKSHOP:
        raise OrderValidationError('invalid_schedule', 'schedule.readyBy is only supported for workshops')
    result = dict(relative)
    if 'endAfter' not in relative:
        result['end'] = format_time(end)
    if start is not None:
        result['start'] = format_time(start)
    if stop is not None and 'stopAfter' not in relative:
        result['stop'] = format_time(stop)
    if ready_by is not None:
        result['readyBy'] = format_time(ready_by)
    return result


def resolve_schedule(schedule, at):
    """Absolute schedule for an attempt dispatched at `at`."""
    end = parse_time(schedule.get('end')) or at + timedelta(seconds=parse_duration(schedule['endAfter']))
    stop = parse_time(schedule.get('stop'))
    if stop is None and schedule.get('stopAfter'):
        stop = at + timedelta(seconds=parse_duration(schedule['stopAfter']))
    resolved = {'end': format_time(end)}
    if stop is not None:
        resolved['stop'] = format_time(min(stop, end))
    for key in ('start', 'readyBy'):
        if schedule.get(key):
            resolved[key] = schedule[key]
    return resolved


def generate_access_password():
    """Match catalog UI randomString(8) alphabet."""
    return ''.join(secrets.choice(_ACCESS_PASSWORD_ALPHABET) for _ in range(8))


def catalog_display_name(catalog_item):
    spec = catalog_item.get('spec') or {}
    return spec.get('displayName') or (catalog_item.get('metadata') or {}).get('name')


def normalize_order_options(catalog_item, body, order_type):
    spec = catalog_item.get('spec') or {}
    if order_type == ORDER_TYPE_SERVICE:
        for key in ('workshop', 'selfPacedLab'):
            if body.get(key) is not None:
                raise OrderValidationError('invalid_request', f"{key} is not valid for service orders")
        options = _mapping(body.get('service'), 'service', SERVICE_KEYS)
        service = {'autoDetach': _boolean(options.get('autoDetach'), 'service.autoDetach', True)}
        resource_pool = _dns_name(options.get('resourcePool'), 'service.resourcePool')
        if resource_pool:
            service['resourcePool'] = resource_pool
        return {'service': service}

    if spec.get('workshopUiDisabled'):
        raise OrderValidationError(
            'unsupported_order_type', 'This catalog item does not support workshop ordering'
        )
    max_instances = spec.get('workshopUiMaxInstances')
    if not isinstance(max_instances, int) or isinstance(max_instances, bool) or max_instances <= 0:
        max_instances = DEFAULT_WORKSHOP_MAX_INSTANCES

    if order_type == ORDER_TYPE_WORKSHOP:
        for key in ('service', 'selfPacedLab'):
            if body.get(key) is not None:
                raise OrderValidationError('invalid_request', f"{key} is not valid for workshop orders")
        options = _mapping(body.get('workshop'), 'workshop', WORKSHOP_KEYS)
        multi = spec.get('workshopUserMode') == 'multi'
        workshop = {
            'autoDetach': _boolean(options.get('autoDetach'), 'workshop.autoDetach', True),
            'concurrency': _integer(options.get('concurrency'), 'workshop.concurrency', 1 if multi else 10, 1, 100),
            'count': _integer(options.get('count'), 'workshop.count', 1, 1, 1 if multi else max_instances),
            'description': _string(options.get('description'), 'workshop.description', max_length=65536) or '<p></p>',
            'displayName': _string(options.get('displayName'), 'workshop.displayName') or catalog_display_name(catalog_item),
            'openRegistration': _boolean(options.get('openRegistration'), 'workshop.openRegistration', True),
            'startDelay': _integer(options.get('startDelay'), 'workshop.startDelay', 30, 0, 3600),
        }
        access_password = _string(options.get('accessPassword'), 'workshop.accessPassword')
        workshop['accessPassword'] = access_password or generate_access_password()
        resource_pool = _dns_name(options.get('resourcePool'), 'workshop.resourcePool')
        if resource_pool:
            workshop['resourcePool'] = resource_pool
        return {'workshop': workshop}

    for key in ('service', 'workshop'):
        if body.get(key) is not None:
            raise OrderValidationError('invalid_request', f"{key} is not valid for self-paced lab orders")
    options = _mapping(body.get('selfPacedLab'), 'selfPacedLab', SELF_PACED_LAB_KEYS)
    runtime_default = (spec.get('runtime') or {}).get('default') or '24h'
    lab = {
        'assignedLifespan': _duration_string(options.get('assignedLifespan'), 'selfPacedLab.assignedLifespan', '4h'),
        'concurrency': _integer(options.get('concurrency'), 'selfPacedLab.concurrency', 5, 1, 100),
        'description': _string(options.get('description'), 'selfPacedLab.description', max_length=65536) or '<p></p>',
        'displayName': _string(options.get('displayName'), 'selfPacedLab.displayName') or catalog_display_name(catalog_item),
        'openRegistration': _boolean(options.get('openRegistration'), 'selfPacedLab.openRegistration', True),
        'poolSize': _integer(options.get('poolSize'), 'selfPacedLab.poolSize', 5, 1, MAX_SELF_PACED_LAB_POOL_SIZE),
        'startDelay': _integer(options.get('startDelay'), 'selfPacedLab.startDelay', 10, 0, 3600),
        'unassignedLifespan': _duration_string(
            options.get('unassignedLifespan'), 'selfPacedLab.unassignedLifespan', runtime_default
        ),
    }
    access_password = _string(options.get('accessPassword'), 'selfPacedLab.accessPassword')
    lab['accessPassword'] = access_password or generate_access_password()
    return {'selfPacedLab': lab}


def validate_submission_envelope(body):
    """Validate the request envelope before any lookups. Returns
    (idempotency_key, catalog item reference, namespace, order type)."""
    if not isinstance(body, dict):
        raise OrderValidationError('invalid_request', 'Request body must be a JSON object')
    unknown = sorted(set(body) - SUBMISSION_KEYS)
    if unknown:
        raise OrderValidationError(
            'invalid_request', f"Unsupported fields: {', '.join(unknown)}"
        )
    key = body.get('idempotencyKey')
    if not isinstance(key, str) or not _IDEMPOTENCY_KEY_RE.match(key):
        raise OrderValidationError(
            'invalid_idempotency_key',
            'idempotencyKey is required: 8-128 characters of letters, digits, ".", "_", ":" or "-"',
        )
    reference = _mapping(body.get('catalogItem'), 'catalogItem', {'name', 'namespace'})
    name = _string(reference.get('name'), 'catalogItem.name', max_length=253)
    if name is not None and not _CATALOG_ITEM_NAME_RE.match(name):
        raise OrderValidationError('invalid_catalog_reference', 'catalogItem.name is not a valid name')
    namespace = _dns_name(reference.get('namespace'), 'catalogItem.namespace')
    if not name or not namespace:
        raise OrderValidationError('invalid_catalog_reference', 'catalogItem.name and catalogItem.namespace are required')
    target_namespace = _dns_name(body.get('namespace'), 'namespace')
    if not target_namespace:
        raise OrderValidationError('invalid_request', 'namespace is required')
    order_type = body.get('orderType')
    if order_type in UNSUPPORTED_ORDER_TYPES:
        raise OrderValidationError('unsupported_order_type', UNSUPPORTED_ORDER_TYPES[order_type])
    if order_type not in SUPPORTED_ORDER_TYPES:
        raise OrderValidationError(
            'unsupported_order_type',
            f"orderType must be one of {', '.join(SUPPORTED_ORDER_TYPES)}",
        )
    return key, (namespace, name), target_namespace, order_type


def build_order(body, *, catalog_item, requester, groups, now):
    """Build a CatalogItemOrder definition from an authenticated submission.

    Identity comes from `requester` (session-derived); the body never supplies
    identity, approval state or Kubernetes manifests."""
    key, _, target_namespace, order_type = validate_submission_envelope(body)
    if (catalog_item.get('spec') or {}).get('externalUrl'):
        raise OrderValidationError('unsupported_order_type', UNSUPPORTED_ORDER_TYPES['externalUrl'])
    metadata = catalog_item.get('metadata') or {}
    salesforce_items, skip_salesforce_id = normalize_salesforce(body)
    purpose = normalize_purpose(catalog_item, body, groups)
    parameters = normalize_parameters(catalog_item, body.get('parameters'))
    declared = {
        parameter.get('name') for parameter in (catalog_item.get('spec') or {}).get('parameters') or []
        if isinstance(parameter, dict)
    }
    # The UI passes the form's activity and explanation for these catalog
    # parameters when they are declared.
    for name, field in (('purpose_activity', 'activity'), ('purpose_explanation', 'explanation')):
        if name in declared and purpose.get(field):
            parameters[name] = purpose[field]
    request = {
        **purpose,
        'parameters': parameters,
        'schedule': normalize_schedule(catalog_item, body, order_type, now),
        'skipSalesforceId': skip_salesforce_id,
        **normalize_order_options(catalog_item, body, order_type),
    }
    if salesforce_items:
        request['salesforceItems'] = salesforce_items
    requester_spec = {'user': requester.user, 'uid': requester.uid}
    if requester.email:
        requester_spec['email'] = requester.email
    spec = {
        'catalogItem': {
            'materialDigest': catalog_material_digest(catalog_item),
            'name': metadata['name'],
            'namespace': metadata['namespace'],
            'resourceVersion': metadata.get('resourceVersion', ''),
            'uid': metadata['uid'],
        },
        'idempotencyKeyDigest': digest_text(key),
        'orderType': order_type,
        'request': request,
        'requester': requester_spec,
        'submissionDigest': submission_digest(body),
        'submittedAt': format_time(now),
    }
    spec['requestDigest'] = request_digest(spec, target_namespace)
    return {
        'apiVersion': f"{API_GROUP}/{API_VERSION}",
        'kind': KIND,
        'metadata': {
            'name': order_name(requester.uid, target_namespace, key),
            'namespace': target_namespace,
            'labels': {
                CATALOG_ITEM_NAME_LABEL: metadata['name'],
                CATALOG_ITEM_NAMESPACE_LABEL: metadata['namespace'],
                REQUESTER_UID_LABEL: requester.uid,
            },
        },
        'spec': spec,
    }


def policy_request_inputs(spec):
    """Request-level policy inputs derived deterministically from the spec."""
    request = spec['request']
    order_type = spec['orderType']
    if order_type == ORDER_TYPE_WORKSHOP:
        quantity = request['workshop']['count']
    elif order_type == ORDER_TYPE_SELF_PACED_LAB:
        quantity = request['selfPacedLab']['poolSize']
    else:
        quantity = 1
    schedule = request['schedule']
    if schedule.get('endAfter'):
        duration_hours = parse_duration(schedule['endAfter']) / 3600
    else:
        origin = parse_time(schedule.get('start')) or parse_time(spec['submittedAt'])
        duration_hours = (parse_time(schedule['end']) - origin).total_seconds() / 3600
    inputs = {
        'order_type': order_type,
        'quantity': quantity,
        'duration_hours': duration_hours,
    }
    for key in ('purpose', 'activity'):
        if request.get(key):
            inputs[key] = request[key]
    return inputs


def verify_order_integrity(order):
    """Return None if spec is unmodified since creation, else a message."""
    metadata = order.get('metadata') or {}
    generation = metadata.get('generation')
    if generation is not None and generation != 1:
        return 'Order spec was modified after submission'
    spec = order.get('spec') or {}
    try:
        expected = request_digest(spec, metadata.get('namespace'))
    except (KeyError, TypeError):
        return 'Order spec is incomplete'
    if spec.get('requestDigest') != expected:
        return 'Order request digest does not match the request'
    if spec.get('orderType') not in SUPPORTED_ORDER_TYPES:
        return f"Order type {spec.get('orderType')!r} is not supported"
    return None


def order_phase(order):
    return (order.get('status') or {}).get('phase') or PHASE_SUBMITTED


def order_attempts(order):
    return (order.get('status') or {}).get('attempts') or []


def active_attempt(order):
    for attempt in order_attempts(order):
        if attempt.get('state') in ACTIVE_ATTEMPT_STATES:
            return attempt
    return None


def order_completed(order):
    """True once an order needs no further controller work: terminal phases,
    non-recoverable blocks, and failures with no retry in progress."""
    status = order.get('status') or {}
    phase = order_phase(order)
    if phase in TERMINAL_PHASES:
        return True
    if phase == PHASE_BLOCKED:
        return not (status.get('blocked') or {}).get('recoverable')
    if phase == PHASE_FAILED:
        return not status.get('retry') and active_attempt(order) is None
    return False


def set_condition(status, condition_type, value, reason, message, now):
    conditions = status.setdefault('conditions', [])
    for condition in conditions:
        if condition.get('type') == condition_type:
            if condition.get('status') != value:
                condition['lastTransitionTime'] = format_time(now)
            condition.update({'status': value, 'reason': reason, 'message': message})
            return
    conditions.append({
        'type': condition_type,
        'status': value,
        'reason': reason,
        'message': message,
        'lastTransitionTime': format_time(now),
    })


def add_history(status, event, now, actor, message='', limit=50):
    history = status.setdefault('history', [])
    history.append({
        'timestamp': format_time(now),
        'event': event,
        'phase': status.get('phase', PHASE_SUBMITTED),
        'actor': actor,
        'message': message,
    })
    if len(history) > limit:
        del history[:len(history) - limit]


def cancel_order(order, actor, now):
    """Return updated status for a pre-dispatch cancellation.

    Raises OrderConflictError once a provisioning attempt has been claimed.
    The caller must write the status with the order resourceVersion so that
    cancellation and the controller dispatch claim cannot both succeed."""
    phase = order_phase(order)
    if phase in TERMINAL_PHASES:
        raise OrderConflictError('order_finished', f"Order is already {phase}")
    if order_attempts(order) or phase in (PHASE_PROVISIONING, PHASE_FAILED):
        raise OrderConflictError(
            'dispatch_started',
            'Provisioning has started; manage or delete the provisioned resources instead',
        )
    status = copy.deepcopy(order.get('status') or {})
    status['phase'] = PHASE_CANCELLED
    status['completedAt'] = format_time(now)
    status.pop('blocked', None)
    set_condition(status, 'Ready', 'False', 'Cancelled', 'Order was cancelled by the requester', now)
    add_history(status, 'Cancelled', now, actor, 'Order cancelled before provisioning')
    return status


@dataclass(frozen=True)
class RetryEligibility:
    eligible: bool
    code: str
    message: str
    attempts_used: int = 0
    max_attempts: int | None = None
    deadline: str | None = None

    def as_dict(self):
        result = {
            'eligible': self.eligible,
            'reason': self.code,
            'message': self.message,
            'attemptsUsed': self.attempts_used,
        }
        if self.max_attempts is not None:
            result['maxAttempts'] = self.max_attempts
        if self.deadline is not None:
            result['deadline'] = self.deadline
        return result


def retry_limits(order):
    limits = ((order.get('status') or {}).get('policy') or {}).get('retryLimits') or {}
    return parse_duration(limits.get('window')), limits.get('maxAttempts')


def evaluate_retry(order, now, controller=False):
    """Whether the existing approval may be reused for another attempt.

    Window origin is status.approval.satisfiedAt (approval decision time, or
    policy evaluation time when no approval was required). maxAttempts counts
    every attempt including the initial one. The controller additionally
    rechecks policy and catalog item digests before dispatching the retry.

    controller=True re-evaluates an accepted retry request: the order may
    already be Ready again after cleanup and status.retry is set."""
    status = order.get('status') or {}
    attempts = order_attempts(order)
    window, max_attempts = retry_limits(order)
    used = len(attempts)

    def result(eligible, code, message, deadline=None):
        return RetryEligibility(eligible, code, message, used, max_attempts, deadline)

    if not controller and order_phase(order) != PHASE_FAILED:
        return result(False, 'not_failed', 'Only failed orders can be retried')
    if active_attempt(order) is not None:
        return result(False, 'attempt_active', 'Another attempt is still active')
    if not controller and status.get('retry'):
        return result(False, 'retry_pending', 'A retry has already been requested')
    if any(attempt.get('state') == ATTEMPT_SUCCEEDED for attempt in attempts):
        return result(False, 'previously_succeeded', 'A successful order cannot be retried; submit a new order')
    last = attempts[-1] if attempts else None
    failure = (last or {}).get('failure') or {}
    if not last or last.get('state') not in (ATTEMPT_FAILED, ATTEMPT_CLEANED_UP) or not failure.get('verifiedAt'):
        return result(False, 'failure_not_verified', 'No controller-verified provisioning failure to retry')
    if not failure.get('retryable'):
        return result(False, 'failure_not_retryable', failure.get('message') or 'Failure is not retryable')
    approval = status.get('approval') or {}
    if approval.get('revocation') or approval.get('state') not in (APPROVAL_APPROVED, APPROVAL_NOT_REQUIRED):
        return result(False, 'approval_invalid', 'Approval is no longer valid; submit a new order')
    if window is None or not isinstance(max_attempts, int):
        return result(False, 'retry_not_configured', 'Retry limits were not recorded for this order')
    satisfied_at = parse_time(approval.get('satisfiedAt'))
    if satisfied_at is None:
        return result(False, 'approval_invalid', 'Approval time was not recorded')
    deadline = satisfied_at + timedelta(seconds=window)
    if now > deadline:
        return result(False, 'retry_window_expired', 'Retry window has expired; submit a new order', format_time(deadline))
    if used >= max_attempts:
        return result(False, 'attempt_limit_reached', 'Attempt limit reached; submit a new order', format_time(deadline))
    return result(True, 'eligible', 'Retry may reuse the existing approval', format_time(deadline))


def request_retry(order, actor, now):
    eligibility = evaluate_retry(order, now)
    if not eligibility.eligible:
        raise OrderConflictError(eligibility.code, eligibility.message)
    status = copy.deepcopy(order['status'])
    status['retry'] = {'requestedAt': format_time(now), 'requestedBy': actor}
    add_history(status, 'RetryRequested', now, actor, f"Retry requested for attempt {len(order_attempts(order)) + 1}")
    return status


class ApprovalDecisionError(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code
        self.message = message


def record_approval_decision(order, *, outcome, decided_by, now, source,
                             decided_by_email=None, comment=None):
    """Approval-state integration contract for GPTEINFRA-18189.

    Returns an updated status carrying status.approval.decision. The trusted
    decision service must authenticate and authorize the approver (manager
    relationship via Reporting API GET /users/by-email/{email}) before calling
    this and must write the result with the order resourceVersion. The
    controller performs the resulting lifecycle transition after verifying
    that the decision quotes the current request and policy digests.

    There is intentionally no HTTP endpoint for this in GPTEINFRA-18188."""
    if outcome not in DECISION_OUTCOMES:
        raise ApprovalDecisionError('invalid_outcome', f"outcome must be one of {', '.join(DECISION_OUTCOMES)}")
    if not isinstance(decided_by, str) or not decided_by:
        raise ApprovalDecisionError('invalid_approver', 'decided_by is required')
    if not isinstance(source, str) or not source:
        raise ApprovalDecisionError('invalid_source', 'source is required')
    status = copy.deepcopy(order.get('status') or {})
    approval = status.get('approval') or {}
    if order_phase(order) != PHASE_PENDING_APPROVAL or approval.get('state') != APPROVAL_PENDING:
        raise ApprovalDecisionError('not_pending', 'Order is not pending approval')
    if approval.get('decision'):
        existing = approval['decision']
        if existing.get('outcome') == outcome and existing.get('decidedBy') == decided_by:
            return status
        raise ApprovalDecisionError('already_decided', 'A decision has already been recorded')
    if decided_by == order['spec']['requester']['user']:
        raise ApprovalDecisionError('self_approval', 'Requesters cannot decide their own orders')
    expires_at = parse_time(approval.get('expiresAt'))
    if expires_at is None or now > expires_at:
        raise ApprovalDecisionError('expired', 'Approval request has expired')
    if approval.get('requestDigest') != order['spec']['requestDigest']:
        raise ApprovalDecisionError('stale_request', 'Approval request does not match the order request')
    decision = {
        'outcome': outcome,
        'decidedBy': decided_by,
        'decidedAt': format_time(now),
        'requestDigest': approval['requestDigest'],
        'policyDigest': approval.get('policyDigest'),
        'source': source,
    }
    if decided_by_email:
        decision['decidedByEmail'] = decided_by_email
    if comment:
        decision['comment'] = comment[:2048]
    approval['decision'] = decision
    status['approval'] = approval
    add_history(status, f"Decision{outcome}", now, decided_by, f"Approval decision recorded by {source}")
    return status


def revoke_approval(order, *, revoked_by, reason, now):
    """Contract for GPTEINFRA-18189: revoke an approval before dispatch or
    to prevent approval reuse for retries."""
    status = copy.deepcopy(order.get('status') or {})
    approval = status.get('approval') or {}
    if approval.get('state') not in (APPROVAL_APPROVED, APPROVAL_PENDING):
        raise ApprovalDecisionError('not_revocable', 'Approval is not in a revocable state')
    approval['revocation'] = {'revokedAt': format_time(now), 'revokedBy': revoked_by, 'reason': reason}
    status['approval'] = approval
    add_history(status, 'ApprovalRevoked', now, revoked_by, reason)
    return status


def order_id(order):
    metadata = order.get('metadata') or {}
    return f"{metadata.get('namespace')}/{metadata.get('name')}"


def order_view(order, now=None):
    """Sanitized order representation returned by the catalog API."""
    metadata = order.get('metadata') or {}
    spec = order.get('spec') or {}
    status = order.get('status') or {}
    request = copy.deepcopy(spec.get('request') or {})
    for key in ('workshop', 'selfPacedLab'):
        if isinstance(request.get(key), dict):
            request[key].pop('accessPassword', None)
    approval = copy.deepcopy(status.get('approval') or {})
    policy = status.get('policy') or {}
    view = {
        'id': order_id(order),
        'name': metadata.get('name'),
        'namespace': metadata.get('namespace'),
        'uid': metadata.get('uid'),
        'createdAt': metadata.get('creationTimestamp'),
        'phase': order_phase(order),
        'orderType': spec.get('orderType'),
        'catalogItem': {
            key: (spec.get('catalogItem') or {}).get(key) for key in ('name', 'namespace')
        },
        'requester': (spec.get('requester') or {}).get('user'),
        'submittedAt': spec.get('submittedAt'),
        'request': request,
        'approval': approval,
        'policy': {
            key: policy.get(key)
            for key in ('state', 'version', 'digest', 'approvalRequired', 'matchedRules', 'errors', 'evaluatedAt')
            if key in policy
        },
        'conditions': status.get('conditions', []),
        'blocked': status.get('blocked'),
        'completedAt': status.get('completedAt'),
        'attempts': [
            {
                **attempt,
                'resources': [ref for ref in attempt.get('resources') or [] if ref.get('uid')],
            }
            for attempt in status.get('attempts', [])
        ],
        'history': status.get('history', []),
        'statusUrl': f"/api/catalog-item-orders/{metadata.get('namespace')}/{metadata.get('name')}",
    }
    if now is not None:
        view['retry'] = evaluate_retry(order, now).as_dict()
    return view
