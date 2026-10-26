"""Backend provisioning adapters for CatalogItemOrder.

Builds the provisioning resources the catalog UI currently creates in
catalog/ui/src/app/api.ts (createServiceRequest, createWorkshop,
createWorkshopProvision, createSelfPacedLab, createSelfPacedLabProvisionItem),
preserving their labels, annotations, defaults and schedule semantics.

Differences from the UI, all deliberate:
- Names use a random suffix chosen when the attempt is claimed and recorded
  in the order status before creation, so a controller restart rediscovers
  the resources it created instead of creating new ones.
- Every resource carries catalog-item-order labels identifying the order and
  attempt; a same-named resource without them is never adopted. Once created,
  ownership is tracked by the recorded uid, which requesters cannot change.
- Schedules come from the attempt: relative defaults are resolved at dispatch
  so waiting for approval does not shorten runtime or lifespan.
- Workshop and self-paced lab provisions receive effective parameter values
  (submitted values plus catalog defaults), as services already do, so the
  approved values are exactly those provisioned.
- There are no ownerReferences to the order: deleting an order record never
  garbage-collects a provisioned environment.
"""

import json
from dataclasses import dataclass
from datetime import timedelta

from catalog_item_order import (
    BABYLON_DOMAIN,
    CATALOG_ITEM_NAME_LABEL,
    CATALOG_ITEM_NAMESPACE_LABEL,
    DEMO_DOMAIN,
    GPTE_DOMAIN,
    ORDER_ATTEMPT_LABEL,
    ORDER_LABEL,
    ORDER_TYPE_SELF_PACED_LAB,
    ORDER_TYPE_SERVICE,
    ORDER_TYPE_WORKSHOP,
    ORDER_UID_LABEL,
    POOLBOY_DOMAIN,
    catalog_display_name,
    child_resource_name,
    parse_time,
)

AUTO_DETACH_WHEN = (
    "status.resources | json_query(\"[?state.spec.vars.current_state == "
    "'provision-failed']\") | length != 0"
)
SCHEDULED_THRESHOLD = timedelta(minutes=15)
ASSET_UUID_LABEL = f'{GPTE_DOMAIN}/asset-uuid'


@dataclass(frozen=True)
class ResourceKind:
    api_group: str
    version: str
    kind: str
    plural: str

    @property
    def api_version(self):
        return f"{self.api_group}/{self.version}"


RESOURCE_CLAIM = ResourceKind(POOLBOY_DOMAIN, 'v1', 'ResourceClaim', 'resourceclaims')
WORKSHOP = ResourceKind(BABYLON_DOMAIN, 'v1', 'Workshop', 'workshops')
WORKSHOP_PROVISION = ResourceKind(BABYLON_DOMAIN, 'v1', 'WorkshopProvision', 'workshopprovisions')
SELF_PACED_LAB = ResourceKind(BABYLON_DOMAIN, 'v1', 'SelfPacedLab', 'selfpacedlabs')
SELF_PACED_LAB_PROVISION_ITEM = ResourceKind(
    BABYLON_DOMAIN, 'v1', 'SelfPacedLabProvisionItem', 'selfpacedlabprovisionitems'
)
RESOURCE_KINDS = {
    kind.kind: kind for kind in (
        RESOURCE_CLAIM, WORKSHOP, WORKSHOP_PROVISION, SELF_PACED_LAB, SELF_PACED_LAB_PROVISION_ITEM,
    )
}
# Resources created per order type, parents first. Deleting the first kind
# cascades to the others through the ownerReferences the UI already sets.
ORDER_TYPE_KINDS = {
    ORDER_TYPE_SERVICE: (RESOURCE_CLAIM,),
    ORDER_TYPE_WORKSHOP: (WORKSHOP, WORKSHOP_PROVISION),
    ORDER_TYPE_SELF_PACED_LAB: (SELF_PACED_LAB, SELF_PACED_LAB_PROVISION_ITEM),
}


class UnsupportedOrderTypeError(Exception):
    pass


def resource_kind(ref):
    return RESOURCE_KINDS[ref['kind']]


def _kinds(order_type):
    try:
        return ORDER_TYPE_KINDS[order_type]
    except KeyError:
        raise UnsupportedOrderTypeError(f"Order type {order_type!r} is not supported") from None


def plan_resources(order, suffix):
    """Return the resource references for an order attempt.

    Recorded in status before any resource is created."""
    metadata = order['metadata']
    spec = order['spec']
    name = child_resource_name(spec['catalogItem']['name'], suffix)
    return [
        {
            'apiVersion': kind.api_version,
            'kind': kind.kind,
            'namespace': metadata['namespace'],
            'name': name,
        }
        for kind in _kinds(spec['orderType'])
    ]


def _json(value):
    """JSON.stringify equivalent used by the UI for annotation values."""
    return json.dumps(value, separators=(',', ':'), ensure_ascii=False)


def _order_labels(order, attempt):
    return {
        ORDER_LABEL: order['metadata']['name'],
        ORDER_UID_LABEL: order['metadata']['uid'],
        ORDER_ATTEMPT_LABEL: str(attempt),
    }


def _catalog_labels(catalog_item, include_asset_uuid=True):
    metadata = catalog_item['metadata']
    labels = {
        CATALOG_ITEM_NAME_LABEL: metadata['name'],
        CATALOG_ITEM_NAMESPACE_LABEL: metadata['namespace'],
    }
    asset_uuid = (metadata.get('labels') or {}).get(ASSET_UUID_LABEL)
    if include_asset_uuid and asset_uuid:
        labels[ASSET_UUID_LABEL] = asset_uuid
    return labels


def _scheduled(schedule, now):
    start = parse_time(schedule.get('start'))
    return 'true' if start and start > now + SCHEDULED_THRESHOLD else 'false'


def _message_template_annotations(catalog_spec):
    annotations = {}
    templates = catalog_spec.get('messageTemplates') or {}
    if templates.get('info'):
        annotations[f'{DEMO_DOMAIN}/info-message-template'] = _json(templates['info'])
    if catalog_spec.get('workshopUserMode') != 'none' and templates.get('user'):
        annotations[f'{DEMO_DOMAIN}/user-message-template'] = _json(templates['user'])
    return annotations


def _purpose_and_sfdc(annotations, request):
    """Match catalog UI addPurposeAndSfdc."""
    if request.get('purpose'):
        annotations[f'{DEMO_DOMAIN}/purpose'] = request['purpose']
    if request.get('activity'):
        annotations[f'{DEMO_DOMAIN}/purpose-activity'] = request['activity']
    if request.get('explanation'):
        annotations[f'{DEMO_DOMAIN}/purpose-explanation'] = request['explanation']
    if request.get('salesforceItems'):
        annotations[f'{DEMO_DOMAIN}/salesforce-items'] = _json(request['salesforceItems'])
    annotations[f'{DEMO_DOMAIN}/provide_salesforce-id_later'] = (
        'true' if request.get('skipSalesforceId') else 'false'
    )


def _requester_annotations(order):
    requester = order['spec']['requester']
    return {
        # The notifier emails the requester annotation when it is an address.
        f'{DEMO_DOMAIN}/requester': requester.get('email') or requester['user'],
        f'{DEMO_DOMAIN}/orderedBy': requester['user'],
    }


def _url(base_url, path):
    return {f'{BABYLON_DOMAIN}/url': f"{base_url.rstrip('/')}{path}"} if base_url else {}


def _provision_parameters(request):
    """Parameters passed to WorkshopProvision / SelfPacedLabProvisionItem,
    matching the UI `{...parameterValues, salesforce_items}`."""
    parameters = dict(request['parameters'])
    for key, field in (
        ('purpose', 'purpose'), ('purpose_activity', 'activity'), ('purpose_explanation', 'explanation'),
    ):
        if request.get(field):
            parameters[key] = request[field]
    parameters['salesforce_items'] = _json(request.get('salesforceItems') or [])
    return parameters


def _owner_reference(kind, parent):
    return {
        'apiVersion': kind.api_version,
        'controller': True,
        'kind': kind.kind,
        'name': parent['metadata']['name'],
        'uid': parent['metadata']['uid'],
    }


def build_resource_claim(order, ref, catalog_item, attempt, schedule, now, base_url):
    request = order['spec']['request']
    service = request.get('service') or {}
    catalog_spec = catalog_item.get('spec') or {}
    catalog_metadata = catalog_item['metadata']
    annotations = {
        f'{BABYLON_DOMAIN}/catalogDisplayName': catalog_metadata['namespace'],
        f'{BABYLON_DOMAIN}/catalogItemDisplayName': catalog_display_name(catalog_item),
        **_requester_annotations(order),
        **_url(base_url, f"/services/{ref['namespace']}/{ref['name']}"),
        **_message_template_annotations(catalog_spec),
        f'{DEMO_DOMAIN}/scheduled': _scheduled(schedule, now),
    }
    if catalog_spec.get('category') is not None:
        annotations[f'{BABYLON_DOMAIN}/category'] = catalog_spec['category']
    if service.get('resourcePool'):
        annotations[f'{POOLBOY_DOMAIN}/resource-pool-name'] = service['resourcePool']
    if catalog_spec.get('userData'):
        annotations[f'{BABYLON_DOMAIN}/userData'] = _json(catalog_spec['userData'])
    if catalog_spec.get('workshopUiDisabled'):
        annotations[f'{DEMO_DOMAIN}/workshopUiDisabled'] = 'true'
    if catalog_spec.get('supportLink'):
        annotations[f'{BABYLON_DOMAIN}/support-link'] = catalog_spec['supportLink']
    for key, value in (catalog_metadata.get('annotations') or {}).items():
        if key.startswith(f'{BABYLON_DOMAIN}/displayNameComponent'):
            annotations[key] = value
    _purpose_and_sfdc(annotations, request)

    labels = {
        **_catalog_labels(catalog_item),
        f'{DEMO_DOMAIN}/white-glove': 'false',
        **_order_labels(order, attempt),
    }
    if catalog_spec.get('bookbag'):
        labels[f'{BABYLON_DOMAIN}/labUserInterface'] = 'bookbag'

    parameter_values = {}
    if request.get('purpose'):
        parameter_values['purpose'] = request['purpose']
    if schedule.get('stop'):
        parameter_values['stop_timestamp'] = schedule['stop']
    parameter_values.update(request['parameters'])

    lifespan = {'end': schedule['end']}
    if schedule.get('start'):
        lifespan['start'] = schedule['start']
    spec = {
        'provider': {
            'name': catalog_metadata['name'],
            'parameterValues': parameter_values,
        },
        'lifespan': lifespan,
    }
    if service.get('autoDetach', True):
        spec['autoDetach'] = {'when': AUTO_DETACH_WHEN}
    return {
        'apiVersion': RESOURCE_CLAIM.api_version,
        'kind': RESOURCE_CLAIM.kind,
        'metadata': {
            'annotations': annotations,
            'labels': labels,
            'name': ref['name'],
            'namespace': ref['namespace'],
        },
        'spec': spec,
    }


def build_workshop(order, ref, catalog_item, attempt, schedule, now, base_url):
    request = order['spec']['request']
    options = request['workshop']
    catalog_spec = catalog_item.get('spec') or {}
    annotations = {
        **_url(base_url, f"/workshops/{ref['namespace']}/{ref['name']}"),
        **_message_template_annotations(catalog_spec),
        f'{DEMO_DOMAIN}/scheduled': _scheduled(schedule, now),
        **_requester_annotations(order),
    }
    if catalog_spec.get('category') is not None:
        annotations[f'{BABYLON_DOMAIN}/category'] = catalog_spec['category']
    if catalog_spec.get('supportLink'):
        annotations[f'{BABYLON_DOMAIN}/support-link'] = catalog_spec['supportLink']
    _purpose_and_sfdc(annotations, request)

    lifespan = {}
    action_schedule = {}
    for key in ('start', 'end', 'readyBy'):
        if schedule.get(key):
            lifespan[key] = schedule[key]
    catalog_lifespan = catalog_spec.get('lifespan') or {}
    for key in ('maximum', 'relativeMaximum'):
        if catalog_lifespan.get(key) is not None:
            lifespan[key] = catalog_lifespan[key]
    if schedule.get('start'):
        action_schedule['start'] = schedule['start']
    if schedule.get('stop'):
        action_schedule['stop'] = schedule['stop']
    spec = {
        'multiuserServices': catalog_spec.get('workshopUserMode') != 'none',
        'openRegistration': options['openRegistration'],
        'lifespan': lifespan,
        'actionSchedule': action_schedule,
    }
    if catalog_spec.get('workshopLabUiRedirect') is True:
        spec['labUserInterface'] = {'redirect': True}
    for key in ('accessPassword', 'description', 'displayName'):
        if options.get(key):
            spec[key] = options[key]
    return {
        'apiVersion': WORKSHOP.api_version,
        'kind': WORKSHOP.kind,
        'metadata': {
            'annotations': annotations,
            'labels': {
                **_catalog_labels(catalog_item),
                f'{DEMO_DOMAIN}/white-glove': 'false',
                **_order_labels(order, attempt),
            },
            'name': ref['name'],
            'namespace': ref['namespace'],
        },
        'spec': spec,
    }


def build_workshop_provision(order, ref, catalog_item, attempt, workshop):
    request = order['spec']['request']
    options = request['workshop']
    catalog_spec = catalog_item.get('spec') or {}
    catalog_metadata = catalog_item['metadata']
    annotations = {}
    if catalog_spec.get('category') is not None:
        annotations[f'{BABYLON_DOMAIN}/category'] = catalog_spec['category']
    spec = {
        'catalogItem': {
            'name': catalog_metadata['name'],
            'namespace': catalog_metadata['namespace'],
        },
        'concurrency': options['concurrency'],
        'count': options['count'],
        'parameters': _provision_parameters(request),
        'startDelay': options['startDelay'],
        'workshopName': workshop['metadata']['name'],
    }
    if options.get('resourcePool'):
        spec['resourcePool'] = options['resourcePool']
    if options.get('autoDetach', True):
        spec['autoDetach'] = {'when': AUTO_DETACH_WHEN}
    return {
        'apiVersion': WORKSHOP_PROVISION.api_version,
        'kind': WORKSHOP_PROVISION.kind,
        'metadata': {
            'annotations': annotations,
            'labels': {
                **_catalog_labels(catalog_item),
                f'{BABYLON_DOMAIN}/workshop': workshop['metadata']['name'],
                **_order_labels(order, attempt),
            },
            'name': ref['name'],
            'namespace': ref['namespace'],
            'ownerReferences': [_owner_reference(WORKSHOP, workshop)],
        },
        'spec': spec,
    }


def build_self_paced_lab(order, ref, catalog_item, attempt, schedule):
    request = order['spec']['request']
    options = request['selfPacedLab']
    catalog_spec = catalog_item.get('spec') or {}
    annotations = {**_requester_annotations(order)}
    if catalog_spec.get('category') is not None:
        annotations[f'{BABYLON_DOMAIN}/category'] = catalog_spec['category']
    if catalog_spec.get('supportLink'):
        annotations[f'{BABYLON_DOMAIN}/support-link'] = catalog_spec['supportLink']
    _purpose_and_sfdc(annotations, request)
    lifespan = {key: schedule[key] for key in ('start', 'end') if schedule.get(key)}
    spec = {'openRegistration': options['openRegistration'], 'lifespan': lifespan}
    for key in ('accessPassword', 'description', 'displayName'):
        if options.get(key):
            spec[key] = options[key]
    return {
        'apiVersion': SELF_PACED_LAB.api_version,
        'kind': SELF_PACED_LAB.kind,
        'metadata': {
            'annotations': annotations,
            'labels': {
                **_catalog_labels(catalog_item),
                f'{DEMO_DOMAIN}/white-glove': 'false',
                **_order_labels(order, attempt),
            },
            'name': ref['name'],
            'namespace': ref['namespace'],
        },
        'spec': spec,
    }


def build_self_paced_lab_provision_item(order, ref, catalog_item, attempt, lab):
    request = order['spec']['request']
    options = request['selfPacedLab']
    catalog_spec = catalog_item.get('spec') or {}
    catalog_metadata = catalog_item['metadata']
    annotations = {}
    if catalog_spec.get('category') is not None:
        annotations[f'{BABYLON_DOMAIN}/category'] = catalog_spec['category']
    spec = {
        'assignedLifespan': options['assignedLifespan'],
        'catalogItem': {
            'name': catalog_metadata['name'],
            'namespace': catalog_metadata['namespace'],
        },
        'poolSize': options['poolSize'],
        'selfPacedLabName': lab['metadata']['name'],
        'unassignedLifespan': options['unassignedLifespan'],
        'parameters': _provision_parameters(request),
    }
    if options.get('concurrency'):
        spec['concurrency'] = options['concurrency']
    if options.get('startDelay'):
        spec['startDelay'] = options['startDelay']
    return {
        'apiVersion': SELF_PACED_LAB_PROVISION_ITEM.api_version,
        'kind': SELF_PACED_LAB_PROVISION_ITEM.kind,
        'metadata': {
            'annotations': annotations,
            'labels': {
                **_catalog_labels(catalog_item),
                **_order_labels(order, attempt),
            },
            'name': ref['name'],
            'namespace': ref['namespace'],
            'ownerReferences': [_owner_reference(SELF_PACED_LAB, lab)],
        },
        'spec': spec,
    }


def build_resource(order, ref, *, catalog_item, attempt, schedule, created, now, base_url=None):
    """Build the body for one planned resource.

    schedule is the attempt's resolved schedule. created maps kind to already
    existing parent objects (with uid)."""
    kind = ref['kind']
    if kind == RESOURCE_CLAIM.kind:
        return build_resource_claim(order, ref, catalog_item, attempt, schedule, now, base_url)
    if kind == WORKSHOP.kind:
        return build_workshop(order, ref, catalog_item, attempt, schedule, now, base_url)
    if kind == WORKSHOP_PROVISION.kind:
        return build_workshop_provision(order, ref, catalog_item, attempt, created[WORKSHOP.kind])
    if kind == SELF_PACED_LAB.kind:
        return build_self_paced_lab(order, ref, catalog_item, attempt, schedule)
    if kind == SELF_PACED_LAB_PROVISION_ITEM.kind:
        return build_self_paced_lab_provision_item(
            order, ref, catalog_item, attempt, created[SELF_PACED_LAB.kind]
        )
    raise UnsupportedOrderTypeError(f"Resource kind {kind!r} is not supported")


def owned_by_attempt(obj, order, attempt, ref=None):
    """True only if obj was created for this order attempt.

    After creation the recorded uid is authoritative: requesters can edit
    labels on their resources, so labels only identify a resource the
    controller has not recorded yet."""
    metadata = obj.get('metadata') or {}
    if ref is not None and ref.get('uid'):
        return metadata.get('uid') == ref['uid']
    labels = metadata.get('labels') or {}
    return (
        labels.get(ORDER_UID_LABEL) == order['metadata']['uid']
        and labels.get(ORDER_ATTEMPT_LABEL) == str(attempt)
    )


# Outcome assessment. States: provisioning, provisioned, failed, missing.

def _anarchy_states(resource_claim):
    states = []
    resources = (resource_claim.get('status') or {}).get('resources')
    if not resources:
        return None
    for resource in resources:
        state = resource.get('state')
        if not state:
            return None
        states.append(state)
    return states


def resource_claim_outcome(resource_claim):
    """Mirror workshop-manager ResourceClaim.provision_complete / is_failed."""
    states = _anarchy_states(resource_claim)
    if states is None:
        return 'provisioning', ''
    complete = True
    for state in states:
        if state.get('kind') != 'AnarchySubject':
            continue
        current_state = ((state.get('spec') or {}).get('vars') or {}).get('current_state')
        if current_state is not None and (
            current_state.endswith('-failed')
            or current_state in ('provision-error', 'provision-cancelled')
        ):
            return 'failed', f"Provisioning reported state {current_state}"
        tower_jobs = (state.get('status') or {}).get('towerJobs') or {}
        if not (tower_jobs.get('provision') or {}).get('completeTimestamp'):
            complete = False
    return ('provisioned', '') if complete else ('provisioning', '')


def _percentage_failed(failed, total, threshold):
    return total > 0 and failed / total * 100 >= threshold


def assess_resources(order_type, objects, workshop_fail_threshold=60, self_paced_lab_fail_threshold=60):
    """Assess the outcome of an attempt from its resources.

    objects maps kind to the current object or None. Failure thresholds match
    the workshop and self-paced lab managers, which stop creating instances
    once the failed percentage reaches the threshold."""
    for kind in _kinds(order_type):
        obj = objects.get(kind.kind)
        if obj is None or (obj.get('metadata') or {}).get('deletionTimestamp'):
            return 'missing', f"{kind.kind} was deleted"

    if order_type == ORDER_TYPE_SERVICE:
        return resource_claim_outcome(objects[RESOURCE_CLAIM.kind])

    if order_type == ORDER_TYPE_WORKSHOP:
        provision = objects[WORKSHOP_PROVISION.kind]
        count = (provision.get('spec') or {}).get('count', 0)
        status = provision.get('status') or {}
        active = status.get('activeCount', 0)
        failed = status.get('failedCount', 0)
        if count and active >= count:
            return 'provisioned', ''
        if status.get('provisioningCount', 0) == 0 and _percentage_failed(failed, count, workshop_fail_threshold):
            return 'failed', f"{failed} of {count} workshop instances failed to provision"
        return 'provisioning', ''

    item = objects[SELF_PACED_LAB_PROVISION_ITEM.kind]
    pool_size = (item.get('spec') or {}).get('poolSize', 0)
    status = item.get('status') or {}
    ready = status.get('readyCount', 0) + status.get('assignedCount', 0)
    failed = status.get('failedCount', 0)
    provisioning = status.get('provisioningCount', 0)
    if pool_size and ready >= pool_size:
        return 'provisioned', ''
    if provisioning == 0 and _percentage_failed(failed, ready + failed, self_paced_lab_fail_threshold):
        return 'failed', f"{failed} self-paced lab instances failed to provision"
    return 'provisioning', ''
