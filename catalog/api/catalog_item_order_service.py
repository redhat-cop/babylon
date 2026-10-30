"""Catalog API operations for CatalogItemOrders: submit, get, list, cancel, retry.

Identity always comes from the authenticated session. Orders are read and
written with the catalog API service account after ownership checks; users
have no direct Kubernetes access to CatalogItemOrders."""

from catalog_item_order import (
    REQUESTER_UID_LABEL,
    ORDER_TYPE_SERVICE,
    OrderConflictError,
    OrderValidationError,
    Requester,
    build_order,
    cancel_order,
    order_name,
    order_view,
    request_retry,
    submission_digest,
    utcnow,
    validate_submission_envelope,
)
from catalog_item_order_adapters import ORDER_TYPE_KINDS
from catalog_item_order_kube import KubeConflictError
from catalog_order_policy import (
    CatalogItemReference,
    CatalogOrderPolicyError,
    enforce_catalog_item_order_restrictions,
)

MAX_CONFLICT_RETRIES = 3


class OrderApiError(Exception):
    def __init__(self, status, code, message):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


def _service_namespace_names(session):
    return {
        namespace.get('name') for namespace in session.get('serviceNamespaces') or []
        if isinstance(namespace, dict) and namespace.get('name')
    }


class CatalogItemOrderService:
    def __init__(self, kube, get_system_status, check_create_access, clock=utcnow):
        """check_create_access(group, plural, namespace) reports whether the
        authenticated requester may create that resource in the namespace."""
        self.kube = kube
        self.get_system_status = get_system_status
        self.check_create_access = check_create_access
        self.clock = clock

    def _can_access(self, order, session, user_uid):
        if session.get('admin'):
            return True
        spec = order.get('spec') or {}
        requester = spec.get('requester') or {}
        return (
            requester.get('uid') == user_uid
            and requester.get('user') == session.get('user')
            and order['metadata']['namespace'] in _service_namespace_names(session)
        )

    async def _get_accessible(self, namespace, name, session, user_uid):
        order = await self.kube.get_order(namespace, name)
        if order is None or not self._can_access(order, session, user_uid):
            # Do not reveal whether another user's order exists.
            raise OrderApiError(404, 'order_not_found', 'Order not found')
        return order

    async def submit(self, body, *, session, user_uid, email=None):
        """Return (http_status, order view)."""
        try:
            key, (catalog_namespace, catalog_name), namespace, order_type = validate_submission_envelope(body)
        except OrderValidationError as exception:
            raise OrderApiError(exception.status, exception.code, exception.message) from exception
        if namespace not in _service_namespace_names(session):
            raise OrderApiError(403, 'namespace_forbidden', f"Ordering into namespace {namespace} is not allowed")

        name = order_name(user_uid, namespace, key)
        existing = await self.kube.get_order(namespace, name)
        if existing is not None:
            return self._replay(existing, body, user_uid)

        block_keys = (
            ('services_ordering_blocked', 'services_ordering_blocked_message')
            if order_type == ORDER_TYPE_SERVICE
            else ('workshops_ordering_blocked', 'workshops_ordering_blocked_message')
        )
        try:
            catalog_item = await enforce_catalog_item_order_restrictions(
                catalog_item_reference=CatalogItemReference(catalog_namespace, catalog_name),
                block_key=block_keys[0],
                block_message_key=block_keys[1],
                session=session,
                get_system_status=self.get_system_status,
                get_catalog_item=self.kube.get_catalog_item,
            )
        except CatalogOrderPolicyError as exception:
            raise OrderApiError(exception.status, exception.code, exception.reason) from exception

        # Same check the controller repeats at dispatch, so orders the
        # requester could never provision (for example self-paced labs without
        # access) are rejected before anyone is asked to approve them.
        kind = ORDER_TYPE_KINDS[order_type][0]
        if not await self.check_create_access(kind.api_group, kind.plural, namespace):
            raise OrderApiError(
                403, 'namespace_access_denied',
                f"Requester cannot create {kind.plural} in namespace {namespace}",
            )

        groups = session.get('groups') if isinstance(session.get('groups'), list) else []
        try:
            definition = build_order(
                body,
                catalog_item=catalog_item,
                requester=Requester(user=session['user'], uid=user_uid, email=email),
                groups=groups,
                now=self.clock(),
            )
        except OrderValidationError as exception:
            raise OrderApiError(exception.status, exception.code, exception.message) from exception

        try:
            created = await self.kube.create_order(definition)
        except KubeConflictError:
            existing = await self.kube.get_order(namespace, name)
            if existing is None:
                raise OrderApiError(409, 'order_conflict', 'Order creation conflicted; retry the request') from None
            return self._replay(existing, body, user_uid)
        return 202, order_view(created, self.clock())

    def _replay(self, existing, body, user_uid):
        spec = existing.get('spec') or {}
        if (
            (spec.get('requester') or {}).get('uid') != user_uid
            or spec.get('submissionDigest') != submission_digest(body)
        ):
            raise OrderApiError(
                409, 'idempotency_key_conflict',
                'idempotencyKey was already used with a different request',
            )
        return 200, order_view(existing, self.clock())

    async def get(self, namespace, name, *, session, user_uid):
        order = await self._get_accessible(namespace, name, session, user_uid)
        return order_view(order, self.clock())

    async def list(self, *, session, user_uid, namespace=None):
        if namespace and session.get('admin'):
            orders = await self.kube.list_orders(namespace=namespace)
        else:
            orders = await self.kube.list_orders(
                namespace=namespace, label_selector=f"{REQUESTER_UID_LABEL}={user_uid}",
            )
        now = self.clock()
        return [
            order_view(order, now) for order in orders
            if self._can_access(order, session, user_uid)
        ]

    async def _update_status(self, namespace, name, session, user_uid, operation):
        for _ in range(MAX_CONFLICT_RETRIES):
            order = await self._get_accessible(namespace, name, session, user_uid)
            try:
                status = operation(order, session['user'], self.clock())
            except OrderConflictError as exception:
                raise OrderApiError(409, exception.code, exception.message) from exception
            try:
                updated = await self.kube.replace_order_status(order, status)
            except KubeConflictError:
                continue
            return order_view(updated, self.clock())
        raise OrderApiError(409, 'order_conflict', 'Order changed concurrently; retry the request')

    async def cancel(self, namespace, name, *, session, user_uid):
        return await self._update_status(namespace, name, session, user_uid, cancel_order)

    async def retry(self, namespace, name, *, session, user_uid):
        return await self._update_status(namespace, name, session, user_uid, request_retry)
