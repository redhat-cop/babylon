"""Approval review and decisions for CatalogItemOrders (GPTEINFRA-18189).

Who may decide a pending order:
- the requester's direct manager or anyone in the requester's management chain,
  according to the Reporting API at the time of the request;
- administrators (server-side role check), across namespaces and also when
  the Reporting API is unavailable.

Nobody may decide their own order, administrators included.

Decisions are recorded with record_approval_decision and a resourceVersion
precondition. The order controller performs the resulting transition and all
provisioning; nothing here creates provisioning resources.
"""

import base64
import time

from catalog_item_order import (
    APPROVAL_PENDING,
    ApprovalDecisionError,
    PHASE_PENDING_APPROVAL,
    catalog_material_digest,
    order_phase,
    parse_time,
    record_approval_decision,
    review_view,
    utcnow,
    verify_order_integrity,
)
from catalog_item_order_kube import KubeConflictError
from catalog_item_order_manager import (
    BASIS_ADMINISTRATOR,
    LOOKUP_UNAVAILABLE,
    ManagerLookupError,
    normalize_email,
    trusted_user_email,
)

DECISION_SOURCE = 'catalog-api'
MAX_COMMENT_LENGTH = 2048
DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 200
MAX_CONFLICT_RETRIES = 3


class ApprovalApiError(Exception):
    def __init__(self, status, code, message):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


class CachedManagerLookup:
    """Short-lived cache for listing. Decisions always use a fresh lookup."""

    def __init__(self, lookup, ttl=60, clock=time.monotonic):
        self.lookup = lookup
        self.ttl = ttl
        self.clock = clock
        self.cache = {}

    async def get_manager_data(self, email):
        cached = self.cache.get(email)
        if cached and cached[1] > self.clock():
            return cached[0]
        data = await self.lookup.get_manager_data(email)
        self.cache[email] = (data, self.clock() + self.ttl)
        return data


def _is_requester(order, user_name, actor_email):
    requester = order['spec']['requester']
    return user_name == requester.get('user') or (
        actor_email is not None and actor_email == normalize_email(requester.get('email'))
    )


def _encode_offset(offset):
    return base64.urlsafe_b64encode(str(offset).encode()).decode()


def _decode_offset(token):
    try:
        offset = int(base64.urlsafe_b64decode(token.encode()).decode())
    except (ValueError, UnicodeDecodeError):
        raise ApprovalApiError(400, 'invalid_continue', 'continue token is not valid') from None
    if offset < 0:
        raise ApprovalApiError(400, 'invalid_continue', 'continue token is not valid')
    return offset


def _is_pending(order):
    approval = (order.get('status') or {}).get('approval') or {}
    return (
        order_phase(order) == PHASE_PENDING_APPROVAL
        and approval.get('state') == APPROVAL_PENDING
        and not approval.get('decision')
    )


class ApprovalService:
    def __init__(self, kube, manager_lookup, clock=utcnow):
        """manager_lookup provides `async get_manager_data(email)`; it is called
        fresh for every decision and may be cached for review and listing."""
        self.kube = kube
        self.manager_lookup = manager_lookup
        self.clock = clock

    async def _find(self, uid):
        for order in await self.kube.list_orders():
            if (order.get('metadata') or {}).get('uid') == uid:
                return order
        return None

    async def _authority(self, order, user_name, session, lookup):
        """Return an authority dict, or None if the actor may not decide.

        Raises ApprovalApiError for self-decisions and, for non-administrators,
        when the Reporting API is unavailable."""
        actor_email = trusted_user_email(user_name)
        if _is_requester(order, user_name, actor_email):
            raise ApprovalApiError(403, 'self_decision', 'Requesters cannot review or decide their own orders')
        if session.get('admin'):
            return {'basis': BASIS_ADMINISTRATOR, 'source': 'catalog-api-session'}
        requester_email = normalize_email(order['spec']['requester'].get('email'))
        if actor_email is None or requester_email is None:
            return None
        try:
            data = await lookup.get_manager_data(requester_email)
        except ManagerLookupError as exception:
            if exception.reason == LOOKUP_UNAVAILABLE:
                raise ApprovalApiError(
                    503, 'manager_lookup_unavailable',
                    'Manager information is temporarily unavailable; try again later',
                ) from exception
            return None
        match = data.authority_for(actor_email)
        if match is None:
            return None
        authority = {'basis': match[0], 'source': 'reporting-api'}
        if match[1] is not None:
            authority['level'] = match[1]
        return authority

    async def _catalog_item(self, order):
        reference = order['spec']['catalogItem']
        return await self.kube.get_catalog_item(reference['namespace'], reference['name'])

    async def review(self, uid, *, session, user_name):
        order = await self._find(uid)
        if order is None:
            raise ApprovalApiError(404, 'order_not_found', 'Order not found')
        authority = await self._authority(order, user_name, session, self.manager_lookup)
        if authority is None:
            raise ApprovalApiError(403, 'not_authorized', 'You are not an approver for this order')
        return review_view(order, await self._catalog_item(order), authority)

    async def list(self, *, session, user_name, limit=None, continue_token=None):
        """Pending orders the actor may decide, oldest request first."""
        if limit is None:
            limit = DEFAULT_PAGE_SIZE
        if not isinstance(limit, int) or not 1 <= limit <= MAX_PAGE_SIZE:
            raise ApprovalApiError(400, 'invalid_limit', f"limit must be between 1 and {MAX_PAGE_SIZE}")
        offset = _decode_offset(continue_token) if continue_token else 0
        pending = sorted(
            (order for order in await self.kube.list_orders() if _is_pending(order)),
            key=lambda order: (order['status']['approval'].get('requestedAt') or '', order['metadata']['uid']),
        )
        lookup = CachedManagerLookup(self.manager_lookup)
        eligible = []
        incomplete = False
        for order in pending:
            try:
                authority = await self._authority(order, user_name, session, lookup)
            except ApprovalApiError as exception:
                if exception.code == 'manager_lookup_unavailable':
                    incomplete = True
                continue
            if authority is not None:
                eligible.append((order, authority))
        page = eligible[offset:offset + limit]
        result = {
            'items': [review_view(order, None, authority) for order, authority in page],
            'incomplete': incomplete,
        }
        if offset + limit < len(eligible):
            result['continue'] = _encode_offset(offset + limit)
        return result

    def _check_still_valid(self, order, catalog_item, now):
        status = order.get('status') or {}
        approval = status.get('approval') or {}
        if not _is_pending(order):
            raise ApprovalApiError(409, 'not_pending', f"Order is {order_phase(order)} and no longer pending approval")
        expires_at = parse_time(approval.get('expiresAt'))
        if expires_at is None or now >= expires_at:
            raise ApprovalApiError(409, 'expired', 'Approval request has expired')
        if verify_order_integrity(order) or approval.get('requestDigest') != order['spec']['requestDigest']:
            raise ApprovalApiError(409, 'request_changed', 'Order request changed since approval was requested')
        reference = order['spec']['catalogItem']
        if (
            catalog_item is None
            or catalog_item['metadata'].get('uid') != reference['uid']
            or catalog_material_digest(catalog_item) != reference['materialDigest']
        ):
            raise ApprovalApiError(409, 'request_changed', 'Catalog item changed since approval was requested')
        policy = (catalog_item.get('spec') or {}).get('approvalPolicy')
        current_digest = policy.get('digest') if isinstance(policy, dict) else None
        if current_digest != (status.get('policy') or {}).get('digest'):
            raise ApprovalApiError(409, 'policy_changed', 'Approval policy changed since approval was requested')

    async def decide(self, uid, outcome, *, session, user_name, comment=None):
        """Record Approved or Denied. Returns (http_status, review view)."""
        if comment is not None and (not isinstance(comment, str) or len(comment) > MAX_COMMENT_LENGTH):
            raise ApprovalApiError(400, 'invalid_comment', f"comment must be a string of at most {MAX_COMMENT_LENGTH} characters")
        actor_email = trusted_user_email(user_name)
        for _ in range(MAX_CONFLICT_RETRIES):
            order = await self._find(uid)
            if order is None:
                raise ApprovalApiError(404, 'order_not_found', 'Order not found')
            authority = await self._authority(order, user_name, session, self.manager_lookup)
            if authority is None:
                raise ApprovalApiError(403, 'not_authorized', 'You are not an approver for this order')
            catalog_item = await self._catalog_item(order)
            decision = ((order.get('status') or {}).get('approval') or {}).get('decision')
            if decision:
                if decision.get('decidedBy') == user_name and decision.get('outcome') == outcome:
                    return 200, review_view(order, catalog_item, authority)
                raise ApprovalApiError(409, 'already_decided', 'A decision has already been recorded for this order')
            now = self.clock()
            self._check_still_valid(order, catalog_item, now)
            try:
                status = record_approval_decision(
                    order, outcome=outcome, decided_by=user_name, decided_by_email=actor_email,
                    comment=comment or None, source=DECISION_SOURCE, authority=authority, now=now,
                )
            except ApprovalDecisionError as exception:
                http_status = 403 if exception.code == 'self_approval' else 409
                raise ApprovalApiError(http_status, exception.code, exception.message) from exception
            try:
                updated = await self.kube.replace_order_status(order, status)
            except KubeConflictError:
                continue
            return 200, review_view(updated, catalog_item, authority)
        raise ApprovalApiError(409, 'order_conflict', 'Order changed concurrently; reload and try again')
