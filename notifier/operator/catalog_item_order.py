"""CatalogItemOrder approval notifications (GPTEINFRA-18189).

The order controller resolves the direct manager and publishes everything an
email needs in the order status. This module only reads orders: it decides
which notifications an order currently calls for and prepares template
variables. It never writes orders, so the notifier cannot affect approval.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from dateutil.parser import isoparse

EVENT_APPROVAL_REQUEST = 'approval-request'
EVENT_APPROVED = 'approved'
EVENT_DENIED = 'denied'
EVENT_EXPIRED = 'expired'

TEMPLATES = {
    EVENT_APPROVAL_REQUEST: 'catalog-item-order-approval-request',
    EVENT_APPROVED: 'catalog-item-order-approved',
    EVENT_DENIED: 'catalog-item-order-denied',
    EVENT_EXPIRED: 'catalog-item-order-expired',
}
SUBJECTS = {
    EVENT_APPROVAL_REQUEST: 'Approval requested: {item} for {requester}',
    EVENT_APPROVED: 'Approved: your order for {item}',
    EVENT_DENIED: 'Denied: your order for {item}',
    EVENT_EXPIRED: 'Expired: your order for {item} was not approved in time',
}
# Events older than this are not sent, so that losing delivery state (for
# example a Redis reset) does not resend old notifications.
MAX_EVENT_AGE = timedelta(days=7)


@dataclass(frozen=True)
class OrderNotification:
    event: str
    recipient: str
    key: str
    occurred_at: datetime

    @property
    def template(self):
        return TEMPLATES[self.event]


def _time(value):
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = isoparse(value)
    except ValueError:
        return None
    return parsed if parsed.tzinfo else None


def _email(value):
    if not isinstance(value, str):
        return None
    value = value.strip().lower()
    return value if '@' in value and '\n' not in value and '\r' not in value else None


def _notification(order, event, recipient, cycle, occurred_at):
    uid = order['metadata']['uid']
    return OrderNotification(
        event=event,
        recipient=recipient,
        key=f"catalog-item-order/{uid}/{event}/{cycle}/{recipient}",
        occurred_at=occurred_at,
    )


def notifications_for(order, now=None, max_age=MAX_EVENT_AGE):
    """Notifications the order currently calls for.

    One approval request per approval cycle to the resolved direct manager;
    higher managers use the same review link or the approvals panel. Requester
    notifications for approval, denial (including revocation) and expiry.
    Provisioning retries reuse the approval, so they produce no new events."""
    now = now or datetime.now(timezone.utc)
    status = order.get('status') or {}
    approval = status.get('approval') or {}
    state = approval.get('state')
    requester_email = _email((order.get('spec') or {}).get('requester', {}).get('email'))
    result = []

    if is_approval_request_pending(order):
        manager = approval.get('manager') or {}
        recipient = _email((manager.get('directManager') or {}).get('email'))
        occurred = _time(manager.get('resolvedAt')) or _time(approval.get('requestedAt'))
        if recipient and occurred and recipient != requester_email:
            result.append(_notification(order, EVENT_APPROVAL_REQUEST, recipient, approval.get('requestedAt'), occurred))
    elif requester_email:
        decision = approval.get('decision') or {}
        if state == 'Approved':
            occurred = _time(approval.get('satisfiedAt')) or _time(decision.get('decidedAt'))
            event = EVENT_APPROVED
        elif state == 'Denied':
            occurred = _time(decision.get('decidedAt'))
            event = EVENT_DENIED
        elif state == 'Revoked':
            occurred = _time((approval.get('revocation') or {}).get('revokedAt'))
            event = EVENT_DENIED
        elif state == 'Expired':
            occurred = _time(approval.get('expiresAt'))
            event = EVENT_EXPIRED
        else:
            occurred = event = None
        if event and occurred:
            result.append(_notification(order, event, requester_email, approval.get('requestedAt'), occurred))

    return [n for n in result if now - n.occurred_at <= max_age]


def is_approval_request_pending(order):
    status = order.get('status') or {}
    approval = status.get('approval') or {}
    expires_at = _time(approval.get('expiresAt'))
    return (
        status.get('phase') == 'PendingApproval'
        and approval.get('state') == 'Pending'
        and not approval.get('decision')
        and not approval.get('revocation')
        and (approval.get('manager') or {}).get('state') == 'Resolved'
        and expires_at is not None
        and expires_at > datetime.now(timezone.utc)
    )


def still_relevant(notification, order):
    """Re-checked against a freshly read order right before sending."""
    return notification in notifications_for(order, max_age=timedelta.max)


def _summary(order):
    spec = order['spec']
    request = spec.get('request') or {}
    order_type = spec.get('orderType')
    if order_type == 'workshop':
        quantity = (request.get('workshop') or {}).get('count')
    elif order_type == 'selfPacedLab':
        quantity = (request.get('selfPacedLab') or {}).get('poolSize')
    else:
        quantity = 1
    schedule = request.get('schedule') or {}
    return {
        'order_type': {'service': 'Service', 'workshop': 'Workshop', 'selfPacedLab': 'Self-paced lab'}.get(order_type, order_type),
        'quantity': quantity,
        'start': schedule.get('start'),
        'end': schedule.get('end'),
        'lifespan': schedule.get('endAfter'),
    }


def template_vars(notification, order, catalog_item=None, catalog_namespace_display_name=None):
    """Variables for the order templates. Every value derived from user input
    must be escaped by the templates; nothing here is pre-escaped."""
    spec = order['spec']
    status = order.get('status') or {}
    approval = status.get('approval') or {}
    request = spec.get('request') or {}
    catalog_reference = spec.get('catalogItem') or {}
    catalog_display_name = (
        ((catalog_item or {}).get('spec') or {}).get('displayName') or catalog_reference.get('name')
    )
    requester = spec.get('requester') or {}
    decision = approval.get('decision') or {}
    expires_at = _time(approval.get('expiresAt'))
    return {
        'service_status': {
            EVENT_APPROVAL_REQUEST: 'Approval requested',
            EVENT_APPROVED: 'Approved',
            EVENT_DENIED: 'Denied',
            EVENT_EXPIRED: 'Expired',
        }[notification.event],
        'service_display_name': catalog_display_name,
        'catalog_item_display_name': catalog_display_name,
        'catalog_namespace_name': catalog_reference.get('namespace'),
        'catalog_namespace': {
            'display_name': catalog_namespace_display_name or catalog_reference.get('namespace'),
        },
        'requester_name': requester.get('user'),
        'requester_email': requester.get('email'),
        'purpose': request.get('purpose'),
        'activity': request.get('activity'),
        'explanation': request.get('explanation'),
        'summary': _summary(order),
        'reasons': [rule.get('reason') for rule in (status.get('policy') or {}).get('matchedRules') or [] if rule.get('reason')],
        'expires_at': expires_at.strftime('%Y-%m-%d %H:%M UTC') if expires_at else None,
        'review_url': approval.get('reviewUrl'),
        'order_url': status.get('orderUrl'),
        'decided_by': decision.get('decidedBy'),
        'decision_comment': decision.get('comment'),
        'revocation_reason': (approval.get('revocation') or {}).get('reason'),
    }


def subject_for(notification, variables):
    subject = SUBJECTS[notification.event].format(
        item=variables['catalog_item_display_name'] or 'catalog item',
        requester=variables['requester_name'] or 'a requester',
    )
    # Header injection guard: user-controlled names must stay on one line.
    return ' '.join(subject.split())[:200]
