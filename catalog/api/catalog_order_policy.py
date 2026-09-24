import asyncio
from dataclasses import dataclass, replace
from typing import Any, Awaitable, Callable, NoReturn

import aiohttp
import kubernetes_asyncio

from audit import parse_k8s_path


BABYLON_DOMAIN = 'babylon.gpte.redhat.com'
CATALOG_ITEM_NAME_LABEL = f'{BABYLON_DOMAIN}/catalogItemName'
CATALOG_ITEM_NAMESPACE_LABEL = f'{BABYLON_DOMAIN}/catalogItemNamespace'


class CatalogOrderPolicyError(Exception):
    def __init__(self, status, code, reason):
        super().__init__(reason)
        self.status = status
        self.code = code
        self.reason = reason


@dataclass(frozen=True)
class CatalogItemReference:
    namespace: str | None
    name: str


@dataclass(frozen=True)
class OrderRequest:
    api_group: str
    plural: str
    block_key: str
    block_message_key: str
    reference_kind: str
    namespace: str | None = None


@dataclass(frozen=True)
class ResourceClaimReference:
    namespace: str
    name: str
    uid: str


_PROTECTED_ORDERS = {
    ('poolboy.gpte.redhat.com', 'resourceclaims'): OrderRequest(
        api_group='poolboy.gpte.redhat.com',
        plural='resourceclaims',
        block_key='services_ordering_blocked',
        block_message_key='services_ordering_blocked_message',
        reference_kind='provider',
    ),
    (BABYLON_DOMAIN, 'workshops'): OrderRequest(
        api_group=BABYLON_DOMAIN,
        plural='workshops',
        block_key='workshops_ordering_blocked',
        block_message_key='workshops_ordering_blocked_message',
        reference_kind='labels',
    ),
    (BABYLON_DOMAIN, 'workshopprovisions'): OrderRequest(
        api_group=BABYLON_DOMAIN,
        plural='workshopprovisions',
        block_key='workshops_ordering_blocked',
        block_message_key='workshops_ordering_blocked_message',
        reference_kind='spec_catalog_item',
    ),
    (BABYLON_DOMAIN, 'selfpacedlabs'): OrderRequest(
        api_group=BABYLON_DOMAIN,
        plural='selfpacedlabs',
        block_key='workshops_ordering_blocked',
        block_message_key='workshops_ordering_blocked_message',
        reference_kind='labels',
    ),
    (BABYLON_DOMAIN, 'selfpacedlabprovisionitems'): OrderRequest(
        api_group=BABYLON_DOMAIN,
        plural='selfpacedlabprovisionitems',
        block_key='workshops_ordering_blocked',
        block_message_key='workshops_ordering_blocked_message',
        reference_kind='spec_catalog_item',
    ),
    (BABYLON_DOMAIN, 'multiworkshops'): OrderRequest(
        api_group=BABYLON_DOMAIN,
        plural='multiworkshops',
        block_key='workshops_ordering_blocked',
        block_message_key='workshops_ordering_blocked_message',
        reference_kind='assets',
    ),
}


def classify_order_request(method: str, path: str) -> OrderRequest | None:
    if not isinstance(method, str) or method.upper() != 'POST':
        return None
    parsed = parse_k8s_path(path)
    if not parsed or parsed.get('name') is not None:
        return None
    api_group = parsed.get('api_group')
    plural = parsed.get('plural')
    if not isinstance(api_group, str) or not isinstance(plural, str):
        return None
    order = _PROTECTED_ORDERS.get((api_group, plural))
    if order is None:
        return None
    namespace = parsed.get('namespace')
    return replace(
        order,
        namespace=namespace if isinstance(namespace, str) else None,
    )


def reject_server_side_apply(method: Any, path: str, content_type: Any) -> None:
    if not isinstance(method, str) or method.upper() != 'PATCH':
        return
    if not isinstance(content_type, str):
        return
    media_type = content_type.split(';', 1)[0].strip().lower()
    if media_type != 'application/apply-patch+yaml':
        return
    parsed = parse_k8s_path(path)
    if not parsed:
        return
    api_group = parsed.get('api_group')
    plural = parsed.get('plural')
    if not isinstance(api_group, str) or not isinstance(plural, str):
        return
    if (api_group, plural) not in _PROTECTED_ORDERS:
        return
    raise CatalogOrderPolicyError(
        403,
        'server_side_apply_not_supported',
        'Use POST to create resources and JSON Patch or Merge Patch to update resources',
    )


def _invalid_reference(
    reason: str = 'Missing or invalid CatalogItem reference',
) -> NoReturn:
    raise CatalogOrderPolicyError(400, 'invalid_catalog_reference', reason)


def _dict_value(value: Any, reason: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        _invalid_reference(reason)
    return value


def _nonempty_string(value: Any, reason: str) -> str:
    if not isinstance(value, str) or not value:
        _invalid_reference(reason)
    return value


def _labels_reference(body: dict[str, Any]) -> CatalogItemReference:
    metadata = _dict_value(body.get('metadata'), 'Missing resource metadata')
    labels = _dict_value(metadata.get('labels'), 'Missing resource labels')
    name = _nonempty_string(
        labels.get(CATALOG_ITEM_NAME_LABEL), 'Missing CatalogItem name label'
    )
    namespace = _nonempty_string(
        labels.get(CATALOG_ITEM_NAMESPACE_LABEL),
        'Missing CatalogItem namespace label',
    )
    return CatalogItemReference(namespace=namespace, name=name)


def _optional_labels_reference(
    body: dict[str, Any],
) -> CatalogItemReference | None:
    metadata = _dict_value(body.get('metadata'), 'Missing resource metadata')
    if 'labels' not in metadata:
        return None
    labels = metadata['labels']
    if not isinstance(labels, dict):
        _invalid_reference('Invalid resource labels')
    has_name = CATALOG_ITEM_NAME_LABEL in labels
    has_namespace = CATALOG_ITEM_NAMESPACE_LABEL in labels
    if not has_name and not has_namespace:
        return None
    if not has_name or not has_namespace:
        _invalid_reference('Incomplete CatalogItem labels')
    return _labels_reference(body)


def _spec_catalog_item_reference(body: dict[str, Any]) -> CatalogItemReference:
    spec = _dict_value(body.get('spec'), 'Missing resource spec')
    catalog_item = _dict_value(
        spec.get('catalogItem'), 'Missing spec.catalogItem reference'
    )
    name = _nonempty_string(
        catalog_item.get('name'), 'Missing spec.catalogItem.name'
    )
    namespace = _nonempty_string(
        catalog_item.get('namespace'), 'Missing spec.catalogItem.namespace'
    )
    return CatalogItemReference(namespace=namespace, name=name)


def _provider_reference(body: dict[str, Any]) -> CatalogItemReference:
    spec = _dict_value(body.get('spec'), 'Missing resource spec')
    provider = _dict_value(spec.get('provider'), 'Missing spec.provider reference')
    return CatalogItemReference(
        namespace=None,
        name=_nonempty_string(provider.get('name'), 'Missing spec.provider.name'),
    )


def _deduplicate(
    references: list[CatalogItemReference],
) -> tuple[CatalogItemReference, ...]:
    return tuple(dict.fromkeys(references))


def extract_catalog_item_references(
    order: OrderRequest, body: Any
) -> tuple[CatalogItemReference, ...]:
    if not isinstance(body, dict):
        _invalid_reference('Request body must be a JSON object')

    if order.reference_kind == 'assets':
        spec = _dict_value(body.get('spec'), 'Missing resource spec')
        assets = spec.get('assets', [])
        if not isinstance(assets, list):
            _invalid_reference('spec.assets must be an array')
        references = []
        for asset in assets:
            asset = _dict_value(asset, 'Each spec.assets entry must be an object')
            if asset.get('type') == 'external':
                continue
            references.append(CatalogItemReference(
                namespace=_nonempty_string(
                    asset.get('namespace'), 'Missing CatalogItem asset namespace'
                ),
                name=_nonempty_string(
                    asset.get('key'), 'Missing CatalogItem asset key'
                ),
            ))
        return _deduplicate(references)

    if order.reference_kind == 'labels':
        reference = _optional_labels_reference(body)
        return (reference,) if reference else ()

    if order.reference_kind == 'provider':
        return (_provider_reference(body),)

    if order.reference_kind == 'spec_catalog_item':
        return (_spec_catalog_item_reference(body),)

    _invalid_reference()


def _group_matches(configured_groups: Any, user_groups: set[str]) -> bool:
    if not isinstance(configured_groups, list):
        return False
    return any(
        isinstance(group, str) and group in user_groups
        for group in configured_groups
    )


def catalog_item_allows_ordering(
    catalog_item: dict[str, Any], groups: list[str]
) -> bool:
    spec = catalog_item.get('spec')
    if not isinstance(spec, dict):
        return False
    access_control = spec.get('accessControl')
    if access_control is None:
        return True
    if not isinstance(access_control, dict):
        return False
    for field in ('denyGroups', 'allowGroups', 'viewOnlyGroups'):
        configured_groups = access_control.get(field)
        if configured_groups is not None and not isinstance(configured_groups, list):
            return False

    user_groups = {group for group in groups if isinstance(group, str)}
    if _group_matches(access_control.get('denyGroups'), user_groups):
        return False
    if _group_matches(access_control.get('allowGroups'), user_groups):
        return True
    return False


def catalog_item_is_visible(catalog_item: dict[str, Any], groups: list[str]) -> bool:
    spec = catalog_item.get('spec')
    if not isinstance(spec, dict):
        return False
    access_control = spec.get('accessControl')
    if access_control is None:
        return True
    if not isinstance(access_control, dict):
        return False
    for field in ('denyGroups', 'allowGroups', 'viewOnlyGroups'):
        configured_groups = access_control.get(field)
        if configured_groups is not None and not isinstance(configured_groups, list):
            return False

    user_groups = {group for group in groups if isinstance(group, str)}
    if _group_matches(access_control.get('denyGroups'), user_groups):
        return False
    return (
        _group_matches(access_control.get('allowGroups'), user_groups)
        or _group_matches(access_control.get('viewOnlyGroups'), user_groups)
    )


def _resource_claim_workshop_reference(
    order: OrderRequest, body: Any
) -> ResourceClaimReference | None:
    if order.plural != 'workshops' or not isinstance(body, dict):
        return None
    spec = body.get('spec')
    if not isinstance(spec, dict) or spec.get('provisionDisabled') is not True:
        return None
    if not order.namespace:
        _invalid_reference('ResourceClaim workshop requires a namespace')

    metadata = _dict_value(body.get('metadata'), 'Missing resource metadata')
    owner_references = metadata.get('ownerReferences')
    if not isinstance(owner_references, list):
        _invalid_reference('Missing ResourceClaim owner reference')
    resource_claim_owners = [
        owner for owner in owner_references
        if isinstance(owner, dict)
        and owner.get('kind') == 'ResourceClaim'
        and owner.get('apiVersion') == 'poolboy.gpte.redhat.com/v1'
    ]
    if len(resource_claim_owners) != 1:
        _invalid_reference('Missing or ambiguous ResourceClaim owner reference')
    owner = resource_claim_owners[0]
    return ResourceClaimReference(
        namespace=order.namespace,
        name=_nonempty_string(owner.get('name'), 'Missing ResourceClaim owner name'),
        uid=_nonempty_string(owner.get('uid'), 'Missing ResourceClaim owner UID'),
    )


def _validate_resource_claim_workshop(
    reference: ResourceClaimReference, resource_claim: dict[str, Any] | None
) -> None:
    if resource_claim is None:
        raise CatalogOrderPolicyError(
            403,
            'resource_claim_unavailable',
            'Resource claim is not available for workshop conversion',
        )
    metadata = _dict_value(
        resource_claim.get('metadata'), 'ResourceClaim metadata is invalid'
    )
    actual_uid = metadata.get('uid')
    if actual_uid != reference.uid:
        _invalid_reference('ResourceClaim owner reference is inconsistent')


def _catalog_namespaces(session: dict[str, Any]) -> tuple[str, ...]:
    namespaces = []
    for namespace in session.get('catalogNamespaces', []):
        name = namespace.get('name') if isinstance(namespace, dict) else None
        if isinstance(name, str) and name not in namespaces:
            namespaces.append(name)
    return tuple(namespaces)


async def _load_catalog_item(
    reference: CatalogItemReference,
    catalog_namespaces: tuple[str, ...],
    get_catalog_item: Callable[[str, str], Awaitable[dict[str, Any] | None]],
) -> tuple[CatalogItemReference, dict[str, Any]]:
    if reference.namespace is not None:
        if reference.namespace not in catalog_namespaces:
            raise CatalogOrderPolicyError(
                403,
                'catalog_item_unavailable',
                'Catalog item is not available for ordering',
            )
        catalog_item = await get_catalog_item(reference.namespace, reference.name)
        if catalog_item is None:
            raise CatalogOrderPolicyError(
                403,
                'catalog_item_unavailable',
                'Catalog item is not available for ordering',
            )
        return reference, catalog_item

    matches = []
    for namespace in catalog_namespaces:
        catalog_item = await get_catalog_item(namespace, reference.name)
        if catalog_item is not None:
            matches.append((CatalogItemReference(namespace, reference.name), catalog_item))
    if not matches:
        raise CatalogOrderPolicyError(
            403,
            'catalog_item_unavailable',
            'Catalog item is not available for ordering',
        )
    if len(matches) > 1:
        raise CatalogOrderPolicyError(
            403,
            'catalog_item_ambiguous',
            'Catalog item is not available for ordering',
        )
    return matches[0]


async def enforce_catalog_order_policy(
    *,
    method: str,
    path: str,
    body: Any,
    session: dict[str, Any],
    get_system_status: Callable[[], Awaitable[dict[str, Any]]],
    get_catalog_item: Callable[[str, str], Awaitable[dict[str, Any] | None]],
    get_resource_claim: Callable[[str, str], Awaitable[dict[str, Any] | None]] | None = None,
) -> None:
    order = classify_order_request(method, path)
    if order is None or session.get('admin'):
        return
    catalog_namespaces = _catalog_namespaces(session)

    resource_claim_reference = _resource_claim_workshop_reference(order, body)
    if resource_claim_reference is not None:
        if get_resource_claim is None:
            raise CatalogOrderPolicyError(
                503,
                'resource_claim_lookup_failed',
                'Unable to validate resource claim',
            )
        try:
            resource_claim = await get_resource_claim(
                resource_claim_reference.namespace,
                resource_claim_reference.name,
            )
        except (
            kubernetes_asyncio.client.exceptions.ApiException,
            aiohttp.ClientError,
            asyncio.TimeoutError,
        ) as exception:
            raise CatalogOrderPolicyError(
                503,
                'resource_claim_lookup_failed',
                'Unable to validate resource claim',
            ) from exception
        _validate_resource_claim_workshop(
            resource_claim_reference, resource_claim
        )
        return

    system_status = await get_system_status()
    if isinstance(system_status, dict) and system_status.get(order.block_key):
        reason = system_status.get(order.block_message_key)
        if not isinstance(reason, str) or not reason:
            reason = 'Ordering is temporarily unavailable'
        raise CatalogOrderPolicyError(403, 'ordering_blocked', reason)

    references = extract_catalog_item_references(order, body)
    groups = session.get('groups', [])
    if not isinstance(groups, list):
        groups = []

    for reference in references:
        _, catalog_item = await _load_catalog_item(
            reference, catalog_namespaces, get_catalog_item
        )
        if not catalog_item_allows_ordering(catalog_item, groups):
            raise CatalogOrderPolicyError(
                403,
                'catalog_item_access_denied',
                'Catalog item is not available for ordering',
            )
