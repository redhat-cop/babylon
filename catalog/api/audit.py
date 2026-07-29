import json
import logging
import re
from datetime import datetime, timezone

audit_logger = logging.getLogger('audit')

RESOURCE_DISPLAY_NAMES = {
    'resourceclaims': 'ResourceClaim',
    'workshops': 'Workshop',
    'workshopprovisions': 'WorkshopProvision',
    'workshopuserassignments': 'WorkshopUserAssignment',
    'selfpacedlabs': 'SelfPacedLab',
    'selfpacedlabprovisionitems': 'SelfPacedLabProvisionItem',
    'selfpacedlabuserassignments': 'SelfPacedLabUserAssignment',
    'multiworkshops': 'MultiWorkshop',
    'resourcehandles': 'ResourceHandle',
    'resourcepools': 'ResourcePool',
    'resourcepoolscalings': 'ResourcePoolScaling',
    'resourceproviders': 'ResourceProvider',
    'serviceaccessconfigs': 'ServiceAccessConfig',
    'anarchysubjects': 'AnarchySubject',
    'anarchyactions': 'AnarchyAction',
    'anarchyruns': 'AnarchyRun',
    'anarchygovernors': 'AnarchyGovernor',
    'tenantclusterpools': 'TenantClusterPool',
    'configmaps': 'ConfigMap',
}

ACTION_MAP = {
    ('resourceclaims', 'POST'): 'order_service',
    ('resourceclaims', 'DELETE'): 'delete_service',
    ('workshops', 'POST'): 'create_workshop',
    ('workshops', 'DELETE'): 'delete_workshop',
    ('workshopprovisions', 'POST'): 'provision_workshop_instances',
    ('workshopuserassignments', 'PUT'): 'update_user_assignment',
    ('selfpacedlabs', 'POST'): 'create_self_paced_lab',
    ('selfpacedlabs', 'DELETE'): 'delete_self_paced_lab',
    ('selfpacedlabprovisionitems', 'POST'): 'provision_lab_items',
    ('selfpacedlabuserassignments', 'PUT'): 'update_user_assignment',
    ('multiworkshops', 'POST'): 'create_multi_workshop',
    ('multiworkshops', 'DELETE'): 'delete_multi_workshop',
    ('resourcehandles', 'DELETE'): 'delete_resource_handle',
    ('resourcepools', 'POST'): 'create_resource_pool',
    ('resourcepools', 'DELETE'): 'delete_resource_pool',
    ('resourcepoolscalings', 'POST'): 'create_resource_pool_scaling',
    ('resourcepoolscalings', 'DELETE'): 'delete_resource_pool_scaling',
    ('resourceproviders', 'DELETE'): 'delete_resource_provider',
    ('serviceaccessconfigs', 'POST'): 'share_service',
    ('serviceaccessconfigs', 'PUT'): 'update_collaborators',
    ('serviceaccessconfigs', 'DELETE'): 'remove_sharing',
    ('anarchysubjects', 'DELETE'): 'delete_anarchy_subject',
    ('anarchyactions', 'DELETE'): 'delete_anarchy_action',
    ('anarchyruns', 'DELETE'): 'delete_anarchy_run',
    ('anarchygovernors', 'DELETE'): 'delete_anarchy_governor',
    ('tenantclusterpools', 'POST'): 'create_tenant_cluster_pool',
    ('tenantclusterpools', 'DELETE'): 'delete_tenant_cluster_pool',
}

_K8S_PATH_RE = re.compile(
    r'^/apis/(?P<api_group>[^/]+)/(?P<version>[^/]+)'
    r'(?:/namespaces/(?P<namespace>[^/]+))?'
    r'/(?P<plural>[^/]+)'
    r'(?:/(?P<name>[^/?]+))?'
)
_K8S_CORE_PATH_RE = re.compile(
    r'^/api/(?P<version>[^/]+)'
    r'(?:/namespaces/(?P<namespace>[^/]+))?'
    r'/(?P<plural>[^/]+)'
    r'(?:/(?P<name>[^/?]+))?'
)


def parse_k8s_path(path):
    """Parse a Kubernetes API path into its components. Returns None on failure."""
    try:
        m = _K8S_PATH_RE.match(path)
        if m:
            return {
                'api_group': m.group('api_group'),
                'version': m.group('version'),
                'namespace': m.group('namespace'),
                'plural': m.group('plural'),
                'name': m.group('name'),
            }
        m = _K8S_CORE_PATH_RE.match(path)
        if m:
            return {
                'api_group': '',
                'version': m.group('version'),
                'namespace': m.group('namespace'),
                'plural': m.group('plural'),
                'name': m.group('name'),
            }
    except Exception:
        pass
    return None


def _safe_get(obj, *keys):
    """Safely traverse nested dicts. Returns None if any key is missing."""
    for key in keys:
        if not isinstance(obj, dict):
            return None
        obj = obj.get(key)
    return obj


def _classify_resourceclaim_patch(body):
    if not isinstance(body, dict):
        return 'update_service'
    raw_pv = _safe_get(body, 'spec', 'provider', 'parameterValues')
    param_values = raw_pv if isinstance(raw_pv, dict) else {}
    if _safe_get(body, 'spec', 'lifespan', 'end'):
        return 'retire_service'
    if param_values.get('start_timestamp'):
        return 'start_service'
    if param_values.get('stop_timestamp'):
        return 'stop_service'
    # Legacy per-resource action_schedule
    raw_resources = _safe_get(body, 'spec', 'resources')
    resources = raw_resources if isinstance(raw_resources, list) else []
    for resource in resources:
        if not isinstance(resource, dict):
            continue
        raw_schedule = _safe_get(resource, 'template', 'spec', 'vars', 'action_schedule')
        schedule = raw_schedule if isinstance(raw_schedule, dict) else {}
        if schedule.get('start'):
            return 'start_service'
        if schedule.get('stop'):
            return 'stop_service'
        if _safe_get(resource, 'template', 'spec', 'vars', 'check_status_request_timestamp'):
            return 'request_status'
    tenant_action = _safe_get(body, 'metadata', 'annotations', 'babylon.gpte.redhat.com/tenant-cluster-action')
    if tenant_action is not None:
        return 'tenant_cluster_action'
    return 'update_service'


def _classify_workshop_patch(body):
    if not isinstance(body, dict):
        return 'update_workshop'
    lock_label = _safe_get(body, 'metadata', 'labels', 'demo.redhat.com/lock-enabled')
    if lock_label == 'true':
        return 'lock_workshop'
    if lock_label == 'false':
        return 'unlock_workshop'
    raw_schedule = _safe_get(body, 'spec', 'actionSchedule')
    action_schedule = raw_schedule if isinstance(raw_schedule, dict) else {}
    if action_schedule.get('start'):
        return 'start_workshop'
    if action_schedule.get('stop'):
        return 'stop_workshop'
    if _safe_get(body, 'spec', 'lifespan', 'end'):
        return 'retire_workshop'
    spec = body.get('spec') or {}
    if any(k in spec for k in ('displayName', 'description', 'accessPassword', 'openRegistration', 'labUserInterface')):
        return 'edit_workshop'
    return 'update_workshop'


def _classify_json_patch(plural, operations):
    """Classify action from a JSON Patch array."""
    user_assignment_plurals = ('workshopuserassignments', 'selfpacedlabuserassignments')
    for op in operations:
        if not isinstance(op, dict):
            continue
        patch_op = op.get('op', '')
        patch_path = op.get('path', '')
        if plural in user_assignment_plurals and '/spec/assignment' in patch_path:
            if patch_op in ('add', 'replace'):
                return 'assign_user'
            if patch_op == 'remove':
                return 'unassign_user'
    return None


def classify_action(method, plural, body):
    """Map (method, K8s plural resource name, body) to a human-readable action string."""
    try:
        # JSON Patch bodies are arrays
        if isinstance(body, list):
            action = _classify_json_patch(plural, body)
            if action:
                return action
            return ACTION_MAP.get((plural, method), f'patch_{plural}')

        if method in ('POST', 'DELETE'):
            return ACTION_MAP.get((plural, method), f'{method.lower()}_{plural}')

        if method == 'PUT':
            return ACTION_MAP.get((plural, method), f'update_{plural}')

        if method == 'PATCH':
            if plural == 'resourceclaims':
                return _classify_resourceclaim_patch(body)
            if plural == 'workshops':
                return _classify_workshop_patch(body)
            if plural == 'selfpacedlabs':
                spec = (_safe_get(body, 'spec') or {}) if isinstance(body, dict) else {}
                if _safe_get(body, 'spec', 'lifespan', 'end'):
                    return 'retire_self_paced_lab'
                if any(k in spec for k in ('displayName', 'description', 'accessPassword', 'openRegistration')):
                    return 'edit_self_paced_lab'
                return 'update_self_paced_lab'
            if plural == 'workshopprovisions':
                if _safe_get(body, 'spec', 'count') is not None:
                    return 'scale_workshop'
                return 'update_workshop_provision'
            if plural == 'selfpacedlabprovisionitems':
                if _safe_get(body, 'spec', 'count') is not None:
                    return 'scale_lab_items'
                return 'update_lab_provision_item'
            if plural == 'multiworkshops':
                return 'edit_multi_workshop'
            if plural == 'resourcehandles':
                if _safe_get(body, 'spec', 'lifespan') is not None:
                    return 'extend_lifespan'
                return 'update_resource_handle'
            if plural == 'anarchysubjects':
                if isinstance(body, dict) and body.get('metadata', {}).get('finalizers') is None and 'metadata' in body:
                    return 'force_delete_anarchy_subject'
                return 'update_anarchy_subject'
            if plural == 'anarchyruns':
                runner = _safe_get(body, 'metadata', 'labels', 'anarchy.gpte.redhat.com/runner')
                if runner == 'pending':
                    return 'retry_anarchy_run'
                return 'update_anarchy_run'
            return f'update_{plural}'

        return f'{method.lower()}_{plural}'
    except Exception:
        return 'unknown'


def extract_details(action, body):
    """Extract only known-safe fields from the body for the given action. Never logs raw body."""
    try:
        if not isinstance(body, dict) and not isinstance(body, list):
            return {}

        if action == 'start_service':
            raw_pv = _safe_get(body, 'spec', 'provider', 'parameterValues')
            param_values = raw_pv if isinstance(raw_pv, dict) else {}
            details = {}
            if param_values.get('start_timestamp'):
                details['start_timestamp'] = param_values['start_timestamp']
            if param_values.get('stop_timestamp'):
                details['stop_timestamp'] = param_values['stop_timestamp']
            return details

        if action == 'stop_service':
            raw_pv = _safe_get(body, 'spec', 'provider', 'parameterValues')
            param_values = raw_pv if isinstance(raw_pv, dict) else {}
            details = {}
            if param_values.get('stop_timestamp'):
                details['stop_timestamp'] = param_values['stop_timestamp']
            return details

        if action == 'retire_service':
            details = {}
            end = _safe_get(body, 'spec', 'lifespan', 'end')
            if end:
                details['lifespan_end'] = end
            return details

        if action == 'order_service':
            details = {}
            name = _safe_get(body, 'metadata', 'name')
            if name:
                details['resource_name'] = name
            display_name = _safe_get(body, 'metadata', 'annotations', 'babylon.gpte.redhat.com/catalogItemDisplayName')
            if display_name:
                details['catalog_item_display_name'] = display_name
            return details

        if action == 'start_workshop':
            details = {}
            start = _safe_get(body, 'spec', 'actionSchedule', 'start')
            stop = _safe_get(body, 'spec', 'actionSchedule', 'stop')
            lifespan_end = _safe_get(body, 'spec', 'lifespan', 'end')
            if start:
                details['start'] = start
            if stop:
                details['stop'] = stop
            if lifespan_end:
                details['lifespan_end'] = lifespan_end
            return details

        if action == 'stop_workshop':
            details = {}
            stop = _safe_get(body, 'spec', 'actionSchedule', 'stop')
            if stop:
                details['stop'] = stop
            return details

        if action in ('retire_workshop', 'retire_self_paced_lab', 'retire_service'):
            details = {}
            end = _safe_get(body, 'spec', 'lifespan', 'end')
            if end:
                details['lifespan_end'] = end
            return details

        if action == 'edit_workshop':
            spec = (_safe_get(body, 'spec') or {}) if isinstance(body, dict) else {}
            changed = [k for k in ('displayName', 'description', 'openRegistration', 'labUserInterface') if k in spec]
            return {'fields_changed': changed} if changed else {}

        if action == 'scale_workshop':
            count = _safe_get(body, 'spec', 'count')
            return {'count': count} if count is not None else {}

        if action == 'scale_lab_items':
            count = _safe_get(body, 'spec', 'count')
            return {'count': count} if count is not None else {}

        if action in ('assign_user', 'unassign_user'):
            # JSON Patch — extract email from value field of assignment op
            if isinstance(body, list):
                for op in body:
                    if isinstance(op, dict) and op.get('op') in ('add', 'replace'):
                        value = op.get('value') or {}
                        email = value.get('email') if isinstance(value, dict) else None
                        if email:
                            return {'email': email}
            return {}

        if action == 'extend_lifespan':
            raw_ls = _safe_get(body, 'spec', 'lifespan')
            lifespan = raw_ls if isinstance(raw_ls, dict) else {}
            details = {}
            if lifespan.get('maximum'):
                details['maximum'] = lifespan['maximum']
            if lifespan.get('relativeMaximum'):
                details['relative_maximum'] = lifespan['relativeMaximum']
            return details

        if action == 'tenant_cluster_action':
            raw = _safe_get(body, 'metadata', 'annotations', 'babylon.gpte.redhat.com/tenant-cluster-action')
            if isinstance(raw, str):
                try:
                    parsed = json.loads(raw)
                    if isinstance(parsed, dict) and parsed.get('action'):
                        return {'cluster_action': parsed['action']}
                except (json.JSONDecodeError, TypeError):
                    pass
            return {}

        if action in ('create_workshop', 'create_self_paced_lab', 'create_multi_workshop',
                      'provision_workshop_instances', 'provision_lab_items'):
            details = {}
            name = _safe_get(body, 'metadata', 'name')
            if name:
                details['resource_name'] = name
            display_name = _safe_get(body, 'spec', 'displayName')
            if display_name:
                details['display_name'] = display_name
            return details

        if action == 'share_service':
            raw_users = _safe_get(body, 'spec', 'users')
            users = raw_users if isinstance(raw_users, list) else []
            emails = [u['name'] for u in users if isinstance(u, dict) and u.get('name')]
            return {'users': emails} if emails else {}

        return {}
    except Exception:
        return {}


def audit_log(event, user, effective_user=None, action=None, resource_type=None,
              resource_name=None, namespace=None, status=None, details=None, **extra):
    try:
        record = {
            'timestamp': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
            'event': event,
            'user': user,
        }
        if effective_user and effective_user != user:
            record['effective_user'] = effective_user
        if action:
            record['action'] = action
        if resource_type:
            record['resource_type'] = resource_type
        if resource_name:
            record['resource_name'] = resource_name
        if namespace:
            record['namespace'] = namespace
        if status is not None:
            record['status'] = status
        if details:
            record['details'] = details
        for k, v in extra.items():
            record[k] = v
        audit_logger.info(json.dumps(record, separators=(',', ':')))
    except Exception as exc:
        logging.getLogger(__name__).warning('audit_log failed: %s', exc)


def audit_log_api_action(user, effective_user, method, path, status, body):
    """Parse K8s path and body to emit a structured audit log entry. Never raises."""
    try:
        parsed = parse_k8s_path(path)
        if parsed:
            plural = parsed['plural']
            action = classify_action(method, plural, body)
            details = extract_details(action, body)
            audit_log(
                'api_action',
                user=user,
                effective_user=effective_user,
                action=action,
                resource_type=RESOURCE_DISPLAY_NAMES.get(plural, plural),
                resource_name=parsed.get('name'),
                namespace=parsed.get('namespace'),
                status=status,
                details=details or None,
            )
        else:
            audit_log(
                'api_action',
                user=user,
                effective_user=effective_user,
                action=f'{str(method).lower()}_request',
                status=status,
                details={'path': path},
            )
    except Exception as exc:
        logging.getLogger(__name__).warning('audit_log_api_action failed: %s', exc)
        try:
            audit_log(
                'api_action',
                user=user,
                effective_user=effective_user,
                action='unknown',
                status=status,
                details={'path': path, 'method': method},
            )
        except Exception:
            pass
