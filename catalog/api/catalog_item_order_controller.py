#!/usr/bin/env python3
"""CatalogItemOrder controller.

Runs as its own Deployment from the catalog API image (see
catalog/helm/templates/order-controller/). Evaluates approval policies,
waits for trusted approval decisions, rechecks ordering restrictions at
dispatch and creates provisioning resources through the backend adapters.

Concurrency model: every status change is written with a resourceVersion
precondition. Dispatch is claimed by recording the attempt and its planned
resource names before creating anything, so duplicate events, concurrent
reconcilers and restarts converge on the same resources. The
catalog API cancels with the same precondition, so cancellation and the
dispatch claim cannot both win. See docs/Catalog_Item_Orders.md.
"""

import asyncio
import copy
import logging
import os
from collections import defaultdict
from dataclasses import dataclass
from datetime import timedelta

import kubernetes_asyncio

from approval_policy import evaluate_approval_policy, parse_duration
from catalog_item_order import (
    API_GROUP,
    API_VERSION,
    APPROVAL_APPROVED,
    APPROVAL_DENIED,
    APPROVAL_EXPIRED,
    APPROVAL_NOT_REQUIRED,
    APPROVAL_PENDING,
    APPROVAL_REVOKED,
    ATTEMPT_DISPATCHING,
    ATTEMPT_CREATED,
    DECISION_OUTCOMES,
    ORDER_TYPE_SERVICE,
    PHASE_BLOCKED,
    PHASE_DENIED,
    PHASE_EXPIRED,
    PHASE_PENDING_APPROVAL,
    PHASE_CREATING,
    PHASE_FULFILLED,
    PHASE_READY,
    PHASE_SUBMITTED,
    PLURAL,
    TERMINAL_PHASES,
    add_history,
    catalog_material_digest,
    format_time,
    generate_name_suffix,
    order_attempts,
    order_completed,
    order_id,
    order_phase,
    parse_time,
    policy_request_inputs,
    purpose_options,
    resolve_schedule,
    set_condition,
    utcnow,
    verify_order_integrity,
)
from catalog_item_order_adapters import (
    ORDER_TYPE_KINDS,
    build_resource,
    owned_by_attempt,
    plan_resources,
)
from catalog_item_order_kube import KubeConflictError, KubeError, KubeOrderClient
from catalog_item_order_manager import (
    AUTHORITY_BASES,
    MAX_MANAGER_LEVEL,
    ManagerExemptions,
    ManagerLookupError,
    ReportingApiClient,
    normalize_email,
)
from catalog_order_policy import catalog_item_allows_ordering, ordering_block_reason

logger = logging.getLogger('catalog_item_order_controller')

ACTOR = 'catalog-item-order-controller'
ADMIN_ACCESS = ('anarchy.gpte.redhat.com', 'anarchysubjects', 'patch')
ORDERING_BLOCK_KEYS = {
    ORDER_TYPE_SERVICE: ('services_ordering_blocked', 'services_ordering_blocked_message'),
}
WORKSHOP_ORDERING_BLOCK_KEYS = ('workshops_ordering_blocked', 'workshops_ordering_blocked_message')


@dataclass
class ControllerConfig:
    approval_expires_after: str = '72h'
    catalog_base_url: str | None = None
    review_base_url: str | None = None
    resync_interval: int = 60
    workers: int = 4
    history_limit: int = 50
    # Delete completed orders this long after completion; None disables.
    retention: str | None = '30d'
    # Exempt managers at this chain level or above (1 is the top); None disables.
    manager_exemption_max_level: int | None = None

    def __post_init__(self):
        level = self.manager_exemption_max_level
        if level is not None and not 1 <= level <= MAX_MANAGER_LEVEL:
            raise ValueError(f"manager_exemption_max_level must be between 1 and {MAX_MANAGER_LEVEL}")
        if self.review_base_url is None:
            self.review_base_url = self.catalog_base_url
        if self.retention is not None and not parse_duration(self.retention):
            raise ValueError('retention must be a duration such as 30d, or empty to disable')
        for name in ('approval_expires_after',):
            if parse_duration(getattr(self, name)) is None:
                raise ValueError(f"{name} must be a duration such as 72h")

    @classmethod
    def from_env(cls, environ=None):
        environ = os.environ if environ is None else environ
        catalog_base_url = environ.get('CATALOG_BASE_URL') or None
        return cls(
            approval_expires_after=environ.get('ORDER_APPROVAL_EXPIRES_AFTER', '72h'),
            catalog_base_url=catalog_base_url,
            review_base_url=environ.get('ORDER_REVIEW_BASE_URL') or None,
            resync_interval=int(environ.get('ORDER_CONTROLLER_RESYNC_INTERVAL', 60)),
            workers=int(environ.get('ORDER_CONTROLLER_WORKERS', 4)),
            history_limit=int(environ.get('ORDER_HISTORY_LIMIT', 50)),
            retention=environ.get('ORDER_RETENTION', '30d') or None,
            manager_exemption_max_level=int(environ['ORDER_MANAGER_EXEMPTION_MAX_LEVEL'])
            if environ.get('ORDER_MANAGER_EXEMPTION_MAX_LEVEL') else None,
        )


class NoApprovalExemptions:
    """Extension point for approval exemptions.

    Used when the manager exemption is not configured; see
    catalog_item_order_manager.ManagerExemptions. A provider must return None unless an
    approved exemption source positively grants one; missing or unavailable
    manager data must never produce an exemption. A returned dict
    ({source, reason}) is recorded in status.approval.exemption."""

    async def find_exemption(self, order, evaluation):
        return None


class CatalogItemOrderController:
    def __init__(self, kube, config=None, clock=utcnow, exemptions=None, manager_resolver=None):
        """manager_resolver provides `async get_manager_data(email)`, normally a
        ReportingApiClient. Without one, manager resolution stays unresolved."""
        self.kube = kube
        self.config = config or ControllerConfig()
        self.clock = clock
        self.exemptions = exemptions or NoApprovalExemptions()
        self.manager_resolver = manager_resolver

    async def reconcile(self, namespace, name, max_steps=20):
        """Advance one order until it needs to wait. Returns the final order."""
        order = None
        for _ in range(max_steps):
            order = await self.kube.get_order(namespace, name)
            if order is None:
                return None
            status = await self.step(order)
            if status is None:
                return order
            try:
                await self.kube.replace_order_status(order, status)
            except KubeConflictError:
                logger.info("Conflict updating %s/%s, retrying with current state", namespace, name)
        logger.warning("Order %s/%s did not settle after %d steps", namespace, name, max_steps)
        return order

    async def step(self, order):
        """Return the next status for order, or None if it must wait."""
        phase = order_phase(order)
        if phase in TERMINAL_PHASES:
            return None
        now = self.clock()
        status = copy.deepcopy(order.get('status') or {})
        integrity_problem = verify_order_integrity(order)
        if integrity_problem:
            return self._block(order, status, 'OrderIntegrity', integrity_problem, now)
        handler = {
            PHASE_SUBMITTED: self._submitted,
            PHASE_PENDING_APPROVAL: self._pending_approval,
            PHASE_READY: self._ready,
            PHASE_CREATING: self._creating,
            PHASE_BLOCKED: self._blocked,
        }.get(phase)
        if handler is None:
            return self._block(order, status, 'UnknownPhase', f"Unknown phase {phase!r}", now)
        return await handler(order, status, now)

    # Status helpers

    def _history(self, status, event, now, message=''):
        add_history(status, event, now, ACTOR, message, self.config.history_limit)

    def _transition(self, order, status, phase, event, now, message=''):
        status['phase'] = phase
        status.pop('blocked', None)
        # Retention is measured from completedAt.
        if phase in TERMINAL_PHASES:
            status['completedAt'] = format_time(now)
        else:
            status.pop('completedAt', None)
        generation = (order.get('metadata') or {}).get('generation')
        if generation is not None:
            status['observedGeneration'] = generation
        self._history(status, event, now, message)
        return status

    def _block(self, order, status, reason, message, now, recoverable=False, resume_phase=None):
        current = status.get('blocked') or {}
        if (
            order_phase(order) == PHASE_BLOCKED
            and current.get('reason') == reason
            and current.get('message') == message
        ):
            return None
        blocked = {
            'reason': reason,
            'message': message,
            'recoverable': recoverable,
            'since': format_time(now),
        }
        if recoverable and resume_phase:
            blocked['resumePhase'] = resume_phase
        self._transition(order, status, PHASE_BLOCKED, reason, now, message)
        status['blocked'] = blocked
        if not recoverable:
            status['completedAt'] = format_time(now)
        set_condition(status, 'Ready', 'False', reason, message, now)
        return status

    async def apply_retention(self, order):
        """Delete a completed order once its retention period has passed.

        Never deletes orders that are pending or in progress, failed orders
        that can still be retried, or orders whose provisioning resources
        still exist, so the record outlives the environment it authorized.
        Returns True if the order was deleted."""
        if self.config.retention is None or not order_completed(order):
            return False
        now = self.clock()
        status = order.get('status') or {}
        completed_at = parse_time(status.get('completedAt'))
        if completed_at is None:
            # Completed before completedAt was recorded: start the clock now.
            updated = copy.deepcopy(status)
            updated['completedAt'] = format_time(now)
            try:
                await self.kube.replace_order_status(order, updated)
            except KubeConflictError:
                pass
            return False
        if now < completed_at + timedelta(seconds=parse_duration(self.config.retention)):
            return False
        for attempt in order_attempts(order):
            for ref in attempt.get('resources') or []:
                if not ref.get('uid'):
                    continue
                obj = await self.kube.get_resource(ref)
                if obj is not None and obj['metadata'].get('uid') == ref['uid']:
                    return False
        if not await self.kube.delete_order(order):
            return False
        logger.info(
            "Deleted CatalogItemOrder %s in phase %s after retention %s",
            order_id(order), order_phase(order), self.config.retention,
        )
        return True

    # Catalog item and policy checks

    async def _catalog_item(self, order):
        reference = order['spec']['catalogItem']
        return await self.kube.get_catalog_item(reference['namespace'], reference['name'])

    def _catalog_item_problem(self, order, catalog_item):
        reference = order['spec']['catalogItem']
        if catalog_item is None:
            return (
                'CatalogItemUnavailable',
                f"Catalog item {reference['namespace']}/{reference['name']} is not available",
            )
        if catalog_item['metadata'].get('uid') != reference['uid']:
            return 'CatalogItemReplaced', 'Catalog item was deleted and recreated; submit a new order'
        if catalog_material_digest(catalog_item) != reference['materialDigest']:
            return (
                'CatalogItemChanged',
                'Catalog item provisioning configuration changed since submission; submit a new order',
            )
        return None

    @staticmethod
    def _policy_digest(catalog_item):
        policy = (catalog_item.get('spec') or {}).get('approvalPolicy')
        return policy.get('digest') if isinstance(policy, dict) else None

    # Phase handlers

    async def _submitted(self, order, status, now):
        spec = order['spec']
        catalog_item = await self._catalog_item(order)
        problem = self._catalog_item_problem(order, catalog_item)
        if problem:
            recoverable = problem[0] == 'CatalogItemUnavailable'
            return self._block(order, status, *problem, now, recoverable, PHASE_SUBMITTED)

        catalog_spec = catalog_item.get('spec') or {}
        published = catalog_spec.get('approvalPolicy')
        evaluation = evaluate_approval_policy(
            published,
            policy_request_inputs(spec),
            spec['request']['parameters'],
            catalog_spec.get('parameters') or [],
            # Purpose and activity are free text unless the item defines
            # purpose options, so policies must not rely on them.
            unavailable_fields=() if purpose_options(catalog_item) else ('request.purpose', 'request.activity'),
        )
        policy_status = {
            'state': evaluation['state'],
            'approvalRequired': evaluation['approvalRequired'],
            'evaluatedAt': format_time(now),
            'evaluatorVersion': evaluation['evaluatorVersion'],
            'matchedRules': evaluation['matchedRules'],
            'disabledRules': evaluation['disabledRules'],
        }
        for key, field in (('digest', 'policyDigest'), ('version', 'policyVersion')):
            if evaluation[field] is not None:
                policy_status[key] = evaluation[field]
        if evaluation['errors']:
            policy_status['errors'] = evaluation['errors']
        if isinstance(published, dict):
            policy_status['snapshot'] = copy.deepcopy(published)
        status['policy'] = policy_status
        if self.config.catalog_base_url:
            status['orderUrl'] = (
                f"{self.config.catalog_base_url.rstrip('/')}/orders/"
                f"{order['metadata']['namespace']}/{order['metadata']['name']}"
            )

        if evaluation['state'] in ('Invalid', 'Error'):
            reason = 'PolicyInvalid' if evaluation['state'] == 'Invalid' else 'PolicyEvaluationFailed'
            message = '; '.join(evaluation['errors'])[:1024] or reason
            set_condition(status, 'PolicyEvaluated', 'False', reason, message, now)
            return self._block(order, status, reason, message, now, True, PHASE_SUBMITTED)
        set_condition(status, 'PolicyEvaluated', 'True', evaluation['state'], '', now)

        approval = {
            'requestDigest': spec['requestDigest'],
            'approver': ((published or {}).get('approval') or {}).get('approver', 'requester_manager'),
        }
        exemption = None
        # Exemptions replace manager approval only; other approvers are never skipped.
        if evaluation['approvalRequired'] and approval['approver'] == 'requester_manager':
            exemption = await self.exemptions.find_exemption(order, evaluation)
        if evaluation['policyDigest']:
            approval['policyDigest'] = evaluation['policyDigest']

        if evaluation['approvalRequired'] and not exemption:
            expires_after = ((published or {}).get('approval') or {}).get(
                'expiresAfter', self.config.approval_expires_after
            )
            approval.update({
                'state': APPROVAL_PENDING,
                'requestedAt': format_time(now),
                'expiresAt': format_time(now + timedelta(seconds=parse_duration(expires_after))),
                'manager': {
                    'source': 'reporting-api',
                    'state': 'Pending',
                    'attempts': 0,
                    'nextAttemptAt': format_time(now),
                },
            })
            if self.config.review_base_url:
                approval['reviewUrl'] = (
                    f"{self.config.review_base_url.rstrip('/')}/approvals/{order['metadata']['uid']}"
                )
            status['approval'] = approval
            reasons = '; '.join(rule['reason'] for rule in evaluation['matchedRules'])
            set_condition(status, 'ApprovalSatisfied', 'False', 'PendingApproval', reasons, now)
            return self._transition(order, status, PHASE_PENDING_APPROVAL, 'ApprovalRequired', now, reasons)

        approval.update({'state': APPROVAL_NOT_REQUIRED, 'satisfiedAt': format_time(now)})
        if exemption:
            approval['exemption'] = {
                'source': str(exemption.get('source', '')),
                'reason': str(exemption.get('reason', '')),
            }
        status['approval'] = approval
        set_condition(status, 'ApprovalSatisfied', 'True', 'NotRequired', '', now)
        return self._transition(order, status, PHASE_READY, 'ApprovalNotRequired', now)

    def _decision_problem(self, order, approval, decision):
        if decision.get('outcome') not in DECISION_OUTCOMES:
            return 'Decision outcome is not valid'
        if not decision.get('source'):
            return 'Decision source is missing'
        if (decision.get('authority') or {}).get('basis') not in AUTHORITY_BASES:
            return 'Decision has no recognized authority basis'
        decided_by = decision.get('decidedBy')
        if not decided_by:
            return 'Decision approver is missing'
        if decided_by == order['spec']['requester']['user']:
            return 'Requesters cannot decide their own orders'
        if (
            decision.get('requestDigest') != order['spec']['requestDigest']
            or approval.get('requestDigest') != order['spec']['requestDigest']
        ):
            return 'Decision does not reference the current order request'
        if decision.get('policyDigest') != approval.get('policyDigest'):
            return 'Decision does not reference the evaluated policy'
        decided_at = parse_time(decision.get('decidedAt'))
        expires_at = parse_time(approval.get('expiresAt'))
        if decided_at is None or expires_at is None or decided_at > expires_at:
            return 'Decision was recorded after the approval request expired'
        return None

    async def _pending_approval(self, order, status, now):
        approval = status.setdefault('approval', {})
        catalog_item = await self._catalog_item(order)
        problem = self._catalog_item_problem(order, catalog_item)
        if problem:
            return self._block(order, status, *problem, now)
        if self._policy_digest(catalog_item) != (status.get('policy') or {}).get('digest'):
            return self._block(
                order, status, 'PolicyChanged',
                'Approval policy changed while approval was pending; submit a new order', now,
            )
        if approval.get('revocation'):
            approval['state'] = APPROVAL_REVOKED
            set_condition(status, 'ApprovalSatisfied', 'False', 'Revoked', approval['revocation'].get('reason', ''), now)
            return self._transition(order, status, PHASE_DENIED, 'ApprovalRevoked', now)

        changed = False
        decision = approval.get('decision')
        if decision:
            decision_problem = self._decision_problem(order, approval, decision)
            if decision_problem is None and decision['outcome'] == APPROVAL_APPROVED:
                approval['state'] = APPROVAL_APPROVED
                approval['satisfiedAt'] = decision['decidedAt']
                set_condition(status, 'ApprovalSatisfied', 'True', 'Approved', f"Approved by {decision['decidedBy']}", now)
                return self._transition(order, status, PHASE_READY, 'Approved', now, f"Approved by {decision['decidedBy']}")
            if decision_problem is None:
                approval['state'] = APPROVAL_DENIED
                set_condition(status, 'ApprovalSatisfied', 'False', 'Denied', f"Denied by {decision['decidedBy']}", now)
                return self._transition(order, status, PHASE_DENIED, 'Denied', now, f"Denied by {decision['decidedBy']}")
            before = copy.deepcopy(status.get('conditions'))
            set_condition(status, 'ApprovalSatisfied', 'False', 'InvalidDecision', decision_problem, now)
            if status.get('conditions') != before:
                self._history(status, 'DecisionIgnored', now, decision_problem)
                changed = True

        expires_at = parse_time(approval.get('expiresAt'))
        if expires_at is None or now >= expires_at:
            approval['state'] = APPROVAL_EXPIRED
            set_condition(status, 'ApprovalSatisfied', 'False', 'Expired', 'Approval request expired', now)
            return self._transition(order, status, PHASE_EXPIRED, 'ApprovalExpired', now)
        if await self._resolve_manager(order, status, approval, now):
            changed = True
        return status if changed else None

    async def _resolve_manager(self, order, status, approval, now):
        """Resolve the direct manager to notify. Returns True if status changed.

        Resolution only selects the notification recipient; it is not
        authorization, which the decision endpoints check live. Failures leave
        approval pending with an actionable condition and are retried with
        backoff until the original expiry, which is never extended."""
        manager = approval.setdefault('manager', {'source': 'reporting-api', 'attempts': 0})
        if manager.get('state') == 'Resolved':
            return False
        next_attempt = parse_time(manager.get('nextAttemptAt'))
        if next_attempt is None or now < next_attempt:
            return False
        attempts = int(manager.get('attempts') or 0) + 1
        manager.update({'attempts': attempts, 'lastAttemptAt': format_time(now)})
        retry = True
        requester_email = normalize_email(order['spec']['requester'].get('email'))
        if requester_email is None:
            reason, retry = 'RequesterEmailMissing', False
            message = 'Requester has no email address; an administrator must review this request'
        elif self.manager_resolver is None:
            reason, retry = 'ManagerLookupNotConfigured', False
            message = 'Manager lookup is not configured; an administrator must review this request'
        else:
            try:
                data = await self.manager_resolver.get_manager_data(requester_email)
            except ManagerLookupError as exception:
                reason, message = exception.reason, exception.message
            else:
                if data.direct_manager_email:
                    manager['directManager'] = {'email': data.direct_manager_email}
                    if data.direct_manager_name:
                        manager['directManager']['name'] = data.direct_manager_name
                    manager.update({'state': 'Resolved', 'resolvedAt': format_time(now)})
                    for key in ('reason', 'message', 'nextAttemptAt'):
                        manager.pop(key, None)
                    set_condition(status, 'ManagerResolved', 'True', 'Resolved', '', now)
                    self._history(status, 'ManagerResolved', now)
                    return True
                reason = 'DirectManagerMissing'
                message = 'Reporting API has no direct manager for the requester'
        if retry:
            delay = min(60 * 2 ** (attempts - 1), 1800)
            manager['nextAttemptAt'] = format_time(now + timedelta(seconds=delay))
            message = f"{message}; retrying. Managers in the reporting chain and administrators can still review the request"
        else:
            manager.pop('nextAttemptAt', None)
        manager.update({'state': 'Unresolved', 'reason': reason, 'message': message[:1024]})
        set_condition(status, 'ManagerResolved', 'False', reason, message[:1024], now)
        return True

    async def _dispatch_problem(self, order, status, now):
        """Return (reason, message, recoverable) blocking dispatch, or None."""
        spec = order['spec']
        approval = status.get('approval') or {}
        if approval.get('revocation'):
            return 'ApprovalRevoked', 'Approval was revoked; submit a new order', False
        if approval.get('state') not in (APPROVAL_APPROVED, APPROVAL_NOT_REQUIRED):
            return 'ApprovalMissing', 'Order has no valid approval', False
        catalog_item = await self._catalog_item(order)
        problem = self._catalog_item_problem(order, catalog_item)
        if problem:
            return problem[0], problem[1], problem[0] == 'CatalogItemUnavailable'
        if self._policy_digest(catalog_item) != (status.get('policy') or {}).get('digest'):
            return 'PolicyChanged', 'Approval policy changed after evaluation; submit a new order', False
        schedule = resolve_schedule(spec['request']['schedule'], now)
        end = parse_time(schedule['end'])
        stop = parse_time(schedule.get('stop'))
        if end <= now or (stop is not None and stop <= now):
            return 'ScheduleExpired', 'Requested schedule can no longer be honored; submit a new order', False

        user = spec['requester']['user']
        namespace = order['metadata']['namespace']
        groups = await self.kube.get_user_groups(user)
        if not await self.kube.check_access(user, groups, *ADMIN_ACCESS):
            block_key, message_key = ORDERING_BLOCK_KEYS.get(spec['orderType'], WORKSHOP_ORDERING_BLOCK_KEYS)
            block_reason = ordering_block_reason(await self.kube.get_system_status(), block_key, message_key)
            if block_reason:
                return 'OrderingBlocked', block_reason, True
            if not catalog_item_allows_ordering(catalog_item, groups):
                return 'CatalogItemAccessDenied', 'Requester is not allowed to order this catalog item', True
        kind = ORDER_TYPE_KINDS[spec['orderType']][0]
        if not await self.kube.check_access(user, groups, kind.api_group, kind.plural, 'create', namespace):
            return (
                'NamespaceAccessDenied',
                f"Requester cannot create {kind.plural} in namespace {namespace}",
                True,
            )
        return None

    def _dispatch_problem_status(self, order, status, problem, now):
        """Status for an order whose dispatch is prevented by problem."""
        reason, message, recoverable = problem
        attempts = status.get('attempts') or []
        approval = status.get('approval') or {}
        if reason == 'PolicyChanged' and approval.get('state') == APPROVAL_NOT_REQUIRED and not attempts:
            # No approval was granted, so a fresh evaluation in this order
            # cannot reuse a stale approval.
            for key in ('approval', 'policy'):
                status.pop(key, None)
            return self._transition(order, status, PHASE_SUBMITTED, 'Reevaluating', now, message)
        return self._block(order, status, reason, message, now, recoverable, PHASE_READY)

    async def _ready(self, order, status, now):
        problem = await self._dispatch_problem(order, status, now)
        attempts = list(status.get('attempts') or [])
        if problem:
            return self._dispatch_problem_status(order, status, problem, now)

        number = len(attempts) + 1
        resources = plan_resources(order, generate_name_suffix())
        attempts.append({
            'number': number,
            'state': ATTEMPT_DISPATCHING,
            'startedAt': format_time(now),
            'schedule': resolve_schedule(order['spec']['request']['schedule'], now),
            'resources': resources,
        })
        status['attempts'] = attempts
        set_condition(status, 'Dispatched', 'False', 'Dispatching', f"Attempt {number} creating resources", now)
        # Planned names are not exposed until the resources exist.
        return self._transition(
            order, status, PHASE_CREATING, 'DispatchStarted', now,
            f"Attempt {number}: " + ', '.join(ref['kind'] for ref in resources),
        )

    def _creation_pending(self, status, reason, message, now):
        """Creation could not complete; keep the order Creating and try again on
        the next reconcile. Returns None when nothing changed, to avoid churn."""
        message = f"{message[:1000]}; retrying"
        current = next((c for c in status.get('conditions') or [] if c.get('type') == 'Dispatched'), {})
        if current.get('reason') == reason and current.get('message') == message:
            return None
        set_condition(status, 'Dispatched', 'False', reason, message, now)
        self._history(status, 'CreationRetrying', now, message)
        return status

    async def _creating(self, order, status, now):
        attempts = status.get('attempts') or []
        attempt = attempts[-1] if attempts else None
        if attempt is None or attempt.get('state') != ATTEMPT_DISPATCHING:
            return self._block(order, status, 'InconsistentState', 'Creating order has no active attempt', now)
        return await self._dispatch_resources(order, status, attempt, now)

    async def _dispatch_resources(self, order, status, attempt, now):
        number = attempt['number']
        catalog_item = await self._catalog_item(order)
        if catalog_item is None or catalog_item['metadata'].get('uid') != order['spec']['catalogItem']['uid']:
            return self._creation_pending(
                status, 'CatalogItemUnavailable', 'Catalog item is not available', now,
            )
        existing = {}
        for ref in attempt['resources']:
            obj = await self.kube.get_resource(ref)
            if obj is not None:
                existing[ref['kind']] = obj
        if len(existing) < len(attempt['resources']):
            # Creation may resume long after the claim (restart, persistent
            # API errors), so recheck everything dispatch depends on.
            problem = await self._dispatch_problem(order, status, now)
            if problem and not existing:
                status['attempts'] = status['attempts'][:-1]
                self._history(status, 'DispatchAborted', now, problem[1])
                return self._dispatch_problem_status(order, status, problem, now)
            if problem:
                return self._creation_pending(status, problem[0], problem[1], now)
        created = {}
        for ref in attempt['resources']:
            obj = existing.get(ref['kind'])
            if obj is None:
                body = build_resource(
                    order, ref, catalog_item=catalog_item, attempt=number,
                    schedule=attempt['schedule'], created=created,
                    now=now, base_url=self.config.catalog_base_url,
                )
                try:
                    obj = await self.kube.create_resource(ref, body)
                    logger.info("Created %s %s/%s for order %s", ref['kind'], ref['namespace'], ref['name'], order_id(order))
                except KubeConflictError:
                    obj = await self.kube.get_resource(ref)
                    if obj is None:
                        raise KubeError(409, f"{ref['kind']} {ref['name']} conflicted but is not readable")
                except KubeError as exception:
                    if 400 <= exception.status < 500 and exception.status != 429:
                        return self._creation_pending(
                            status, 'CreateRejected',
                            f"{ref['kind']} {ref['namespace']}/{ref['name']} was rejected: {exception}", now,
                        )
                    raise
            if not owned_by_attempt(obj, order, number, ref):
                return self._block(
                    order, status, 'NameCollision',
                    f"{ref['kind']} {ref['namespace']}/{ref['name']} exists and was not created by this order",
                    now,
                )
            created[ref['kind']] = obj
            ref['uid'] = obj['metadata'].get('uid')
        attempt['state'] = ATTEMPT_CREATED
        attempt['createdAt'] = format_time(now)
        set_condition(status, 'Dispatched', 'True', 'ResourcesCreated', '', now)
        return self._transition(
            order, status, PHASE_FULFILLED, 'Fulfilled', now,
            ', '.join(f"{ref['kind']} {ref['name']}" for ref in attempt['resources']),
        )

    async def _blocked(self, order, status, now):
        blocked = status.get('blocked') or {}
        resume_phase = blocked.get('resumePhase')
        if not blocked.get('recoverable') or resume_phase not in (PHASE_SUBMITTED, PHASE_READY):
            return None
        resumed = copy.deepcopy(order)
        resumed_status = resumed.setdefault('status', {})
        resumed_status['phase'] = resume_phase
        resumed_status.pop('blocked', None)
        handler = self._submitted if resume_phase == PHASE_SUBMITTED else self._ready
        new_status = await handler(resumed, copy.deepcopy(resumed_status), now)
        if new_status is None:
            return None
        new_blocked = new_status.get('blocked') or {}
        if (
            new_status.get('phase') == PHASE_BLOCKED
            and new_blocked.get('reason') == blocked.get('reason')
            and new_blocked.get('message') == blocked.get('message')
        ):
            return None
        return new_status


def order_needs_reconcile(order):
    status = order.get('status') or {}
    phase = order_phase(order)
    if phase in TERMINAL_PHASES:
        return False
    if phase == PHASE_BLOCKED:
        return bool((status.get('blocked') or {}).get('recoverable'))
    return True


async def run(controller, kube, config):
    queue = asyncio.Queue()
    queued = set()
    locks = defaultdict(asyncio.Lock)

    def enqueue(order):
        metadata = order.get('metadata') or {}
        key = (metadata.get('namespace'), metadata.get('name'))
        if key not in queued:
            queued.add(key)
            queue.put_nowait(key)

    async def worker():
        while True:
            key = await queue.get()
            queued.discard(key)
            try:
                async with locks[key]:
                    await controller.reconcile(*key)
            except Exception:
                logger.exception("Failed to reconcile CatalogItemOrder %s/%s", *key)
            finally:
                queue.task_done()

    async def resync():
        while True:
            try:
                for order in await kube.list_orders():
                    if order_needs_reconcile(order):
                        enqueue(order)
                    else:
                        try:
                            await controller.apply_retention(order)
                        except Exception:
                            logger.exception("Failed to apply retention to CatalogItemOrder %s", order_id(order))
            except Exception:
                logger.exception("Failed to list CatalogItemOrders")
            await asyncio.sleep(config.resync_interval)

    async def watch():
        while True:
            try:
                async with kubernetes_asyncio.watch.Watch() as watcher:
                    async for event in watcher.stream(
                        kube.custom_objects_api.list_cluster_custom_object,
                        group=API_GROUP, version=API_VERSION, plural=PLURAL,
                        timeout_seconds=300,
                    ):
                        obj = event.get('object')
                        if isinstance(obj, dict) and event.get('type') in ('ADDED', 'MODIFIED') and order_needs_reconcile(obj):
                            enqueue(obj)
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("CatalogItemOrder watch failed, restarting")
                await asyncio.sleep(5)

    tasks = [asyncio.create_task(worker()) for _ in range(max(1, config.workers))]
    tasks.append(asyncio.create_task(resync()))
    tasks.append(asyncio.create_task(watch()))
    await asyncio.gather(*tasks)


async def main():
    logging.basicConfig(level=os.environ.get('LOGGING_LEVEL', 'INFO'))
    config = ControllerConfig.from_env()
    babylon_namespace = os.environ.get('BABYLON_NAMESPACE')
    if os.path.exists('/run/secrets/kubernetes.io/serviceaccount'):
        kubernetes_asyncio.config.load_incluster_config()
        if not babylon_namespace:
            with open('/run/secrets/kubernetes.io/serviceaccount/namespace') as f:
                babylon_namespace = f.read()
    else:
        await kubernetes_asyncio.config.load_kube_config()
    if not babylon_namespace:
        raise Exception('Unable to determine babylon namespace. Please set BABYLON_NAMESPACE environment variable.')
    if not config.catalog_base_url:
        logger.warning('CATALOG_BASE_URL is not set; provisioned resources will not have url annotations')
    async with kubernetes_asyncio.client.ApiClient() as api_client:
        kube = KubeOrderClient(
            api_client,
            babylon_namespace=babylon_namespace,
            system_status_configmap=os.environ.get('SYSTEM_STATUS_CONFIGMAP', 'babylon-system-status'),
        )
        reporting_api = os.environ.get(
            'SALESFORCE_API', 'http://reporting-api.demo-reporting.svc.cluster.local:8080'
        )
        manager_resolver = ReportingApiClient(reporting_api, os.environ.get('SALESFORCE_AUTHORIZATION_TOKEN'))
        exemptions = None
        if config.manager_exemption_max_level is not None:
            exemptions = ManagerExemptions(manager_resolver, config.manager_exemption_max_level)
            logger.info("Manager approval exemption enabled at level %d or above", config.manager_exemption_max_level)
        controller = CatalogItemOrderController(
            kube, config, exemptions=exemptions, manager_resolver=manager_resolver,
        )
        logger.info("Starting CatalogItemOrder controller")
        await run(controller, kube, config)


if __name__ == '__main__':
    asyncio.run(main())
