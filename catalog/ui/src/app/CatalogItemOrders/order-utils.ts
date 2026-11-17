import type { CatalogItem } from '@app/types';
import type {
  ApprovalReview,
  CatalogItemOrder,
  CatalogItemOrderSubmission,
  CatalogItemOrderType,
  OrderAttempt,
  OrderSchedule,
  SalesforceItem,
} from './types';

export const PENDING_APPROVAL_MESSAGE = 'Your order is waiting for manager approval. Provisioning has not started.';

// Parameters the API sets from dedicated fields; sending them as parameters is rejected.
const RESERVED_PARAMETERS = ['purpose', 'purpose_activity', 'purpose_explanation', 'salesforce_id'];

const TERMINAL_PHASES = ['Provisioned', 'Denied', 'Expired', 'Cancelled'];

export type OrderFormInput = {
  catalogItem: CatalogItem;
  namespace: string;
  parameterValues: Record<string, unknown>;
  purpose?: string;
  activity?: string;
  explanation?: string;
  salesforceItems?: SalesforceItem[];
  skipSalesforceId?: boolean;
  startDate?: Date;
  stopDate?: Date;
  endDate?: Date;
  readyByDate?: Date;
  useAutoDetach?: boolean;
  selectedResourcePool?: string;
  /**
   * The user kept the catalog default runtime and lifespan without choosing a
   * start time. Stop and end are then omitted so the API applies the defaults
   * when provisioning starts, and time spent waiting for approval does not
   * shorten them.
   */
  usesDefaultSchedule?: boolean;
  workshop?: {
    userRegistration?: string;
    accessPassword?: string;
    description?: string;
    displayName?: string;
    provisionCount?: number;
    provisionConcurrency?: number;
    provisionStartDelay?: number;
  } | null;
  selfPacedLab?: {
    poolSize?: number;
    assignedLifespan?: string;
    unassignedLifespan?: string;
    concurrency?: number;
    startDelay?: number;
  } | null;
};

/**
 * Why the order form cannot submit this request as a CatalogItemOrder, or null.
 * These requests are rejected outright instead of falling back to direct
 * resource creation (see "Order API" in docs/Catalog_Item_Orders.md).
 */
export function unsupportedOrderReason({
  catalogItem,
  whiteGloved,
}: {
  catalogItem: CatalogItem;
  whiteGloved?: boolean;
}): string | null {
  if (catalogItem.spec.externalUrl) {
    return 'This catalog item opens an external site and cannot be ordered through catalog item orders yet.';
  }
  if (whiteGloved) {
    return 'White glove requests cannot be fulfilled through catalog item orders yet. Contact the catalog administrators.';
  }
  return null;
}

export function orderTypeFor(input: Pick<OrderFormInput, 'workshop' | 'selfPacedLab'>): CatalogItemOrderType {
  if (input.workshop && input.selfPacedLab) return 'selfPacedLab';
  if (input.workshop) return 'workshop';
  return 'service';
}

function iso(date?: Date): string | undefined {
  return date ? date.toISOString() : undefined;
}

function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  ) as T;
}

/** Map the order form state to the API body, without the idempotency key. */
export function buildOrderSubmission(input: OrderFormInput): Omit<CatalogItemOrderSubmission, 'idempotencyKey'> {
  const orderType = orderTypeFor(input);
  const parameters = Object.fromEntries(
    Object.entries(input.parameterValues || {}).filter(([name]) => !RESERVED_PARAMETERS.includes(name)),
  );
  const relativeDefaults = input.usesDefaultSchedule && !input.startDate;
  const schedule = compact({
    start: iso(input.startDate),
    // Self-paced labs have no auto-stop.
    stop: orderType === 'selfPacedLab' || relativeDefaults ? undefined : iso(input.stopDate),
    end: relativeDefaults ? undefined : iso(input.endDate),
    readyBy: orderType === 'workshop' ? iso(input.readyByDate) : undefined,
  });
  const body: Omit<CatalogItemOrderSubmission, 'idempotencyKey'> = compact({
    catalogItem: { namespace: input.catalogItem.metadata.namespace, name: input.catalogItem.metadata.name },
    namespace: input.namespace,
    orderType,
    purpose: input.purpose,
    activity: input.activity,
    explanation: input.explanation,
    salesforceItems: input.salesforceItems && input.salesforceItems.length > 0 ? input.salesforceItems : undefined,
    skipSalesforceId: input.skipSalesforceId ? true : undefined,
    parameters,
    schedule: Object.keys(schedule).length > 0 ? schedule : undefined,
  });
  if (orderType === 'service') {
    body.service = compact({ autoDetach: input.useAutoDetach, resourcePool: input.selectedResourcePool });
  } else if (orderType === 'workshop') {
    const workshop = input.workshop;
    body.workshop = compact({
      accessPassword: workshop.accessPassword,
      autoDetach: input.useAutoDetach,
      concurrency: workshop.provisionConcurrency,
      count: workshop.provisionCount,
      description: workshop.description,
      displayName: workshop.displayName,
      openRegistration: workshop.userRegistration === 'open',
      resourcePool: input.selectedResourcePool,
      startDelay: workshop.provisionStartDelay,
    });
  } else {
    const workshop = input.workshop;
    const lab = input.selfPacedLab;
    body.selfPacedLab = compact({
      accessPassword: workshop.accessPassword,
      assignedLifespan: lab.assignedLifespan,
      concurrency: lab.concurrency,
      description: workshop.description,
      displayName: workshop.displayName,
      openRegistration: workshop.userRegistration === 'open',
      poolSize: lab.poolSize,
      startDelay: lab.startDelay,
      unassignedLifespan: lab.unassignedLifespan,
    });
  }
  return body;
}

export type OrderStatusKind =
  | 'submitted'
  | 'pendingApproval'
  | 'starting'
  | 'scheduled'
  | 'provisioning'
  | 'retrying'
  | 'provisioned'
  | 'failed'
  | 'denied'
  | 'expired'
  | 'cancelled'
  | 'onHold'
  | 'blocked';

export type OrderStatus = {
  kind: OrderStatusKind;
  label: string;
  /** Visual tone. "success" is reserved for provisioned orders. */
  tone: 'info' | 'warning' | 'success' | 'danger' | 'neutral';
  description: string;
};

export function latestAttempt(order: Pick<CatalogItemOrder, 'attempts'>): OrderAttempt | undefined {
  return order.attempts && order.attempts.length > 0 ? order.attempts[order.attempts.length - 1] : undefined;
}

/** The schedule of the latest attempt (resolved at dispatch) or the requested one. */
export function effectiveSchedule(order: Pick<CatalogItemOrder, 'attempts' | 'request'>): OrderSchedule {
  return latestAttempt(order)?.schedule || order.request?.schedule || {};
}

function inFuture(timestamp: string | undefined, now: number): boolean {
  if (!timestamp) return false;
  const time = Date.parse(timestamp);
  return !Number.isNaN(time) && time > now;
}

export function getOrderStatus(order: CatalogItemOrder, now: number = Date.now()): OrderStatus {
  const approval = order.approval || {};
  const attempt = latestAttempt(order);
  const start = effectiveSchedule(order).start;
  switch (order.phase) {
    case 'PendingApproval':
      return { kind: 'pendingApproval', label: 'Waiting for approval', tone: 'warning', description: PENDING_APPROVAL_MESSAGE };
    case 'Ready': {
      const approvedText =
        approval.state === 'Approved'
          ? 'Approved. '
          : approval.state === 'NotRequired'
            ? 'No approval was needed. '
            : '';
      if (inFuture(start, now)) {
        return {
          kind: 'scheduled',
          label: 'Scheduled',
          tone: 'info',
          description: `${approvedText}Provisioning will start at the scheduled time.`,
        };
      }
      return {
        kind: 'starting',
        label: approval.state === 'Approved' ? 'Approved' : 'Ready',
        tone: 'info',
        description: `${approvedText}Provisioning has not started yet; it will start shortly.`,
      };
    }
    case 'Provisioning':
      if (attempt && (attempt.state === 'CleaningUp' || attempt.state === 'CleanedUp')) {
        return {
          kind: 'retrying',
          label: 'Retrying',
          tone: 'info',
          description: 'Cleaning up the previous attempt before provisioning again.',
        };
      }
      if (inFuture(start, now)) {
        return {
          kind: 'scheduled',
          label: 'Scheduled',
          tone: 'info',
          description: 'Resources are created and will start at the scheduled time.',
        };
      }
      return { kind: 'provisioning', label: 'Provisioning', tone: 'info', description: 'Provisioning is in progress.' };
    case 'Provisioned':
      return { kind: 'provisioned', label: 'Provisioned', tone: 'success', description: 'Provisioning completed successfully.' };
    case 'Failed':
      if (order.retryRequest || (attempt && (attempt.state === 'CleaningUp' || attempt.state === 'CleanedUp'))) {
        return {
          kind: 'retrying',
          label: 'Retrying',
          tone: 'info',
          description: 'Cleaning up the previous attempt before provisioning again.',
        };
      }
      return {
        kind: 'failed',
        label: 'Provisioning failed',
        tone: 'danger',
        description: attempt?.failure?.message || 'The latest provisioning attempt failed.',
      };
    case 'Denied': {
      const decision = approval.decision;
      const revoked = approval.state === 'Revoked';
      return {
        kind: 'denied',
        label: 'Denied',
        tone: 'danger',
        description: revoked
          ? 'The approval was revoked. Provisioning did not start.'
          : `Your order was denied${decision?.decidedBy ? ` by ${decision.decidedByEmail || decision.decidedBy}` : ''}. Provisioning did not start.`,
      };
    }
    case 'Expired':
      return {
        kind: 'expired',
        label: 'Expired',
        tone: 'neutral',
        description: 'No decision was made before the approval request expired. Provisioning did not start.',
      };
    case 'Cancelled':
      return { kind: 'cancelled', label: 'Cancelled', tone: 'neutral', description: 'You cancelled this order before provisioning started.' };
    case 'Blocked':
      if (order.blocked?.recoverable) {
        return {
          kind: 'onHold',
          label: 'On hold',
          tone: 'warning',
          description: `${order.blocked.message || order.blocked.reason}. The order resumes automatically when this is resolved.`,
        };
      }
      return {
        kind: 'blocked',
        label: 'Blocked',
        tone: 'danger',
        description: `${order.blocked?.message || order.blocked?.reason || 'The order cannot continue'}. Submit a new order.`,
      };
    case 'Submitted':
    default:
      return { kind: 'submitted', label: 'Submitted', tone: 'info', description: 'Your order was received and is being evaluated.' };
  }
}

/** Orders that can still change on their own; their views refresh automatically. */
export function isOrderActive(order: Pick<CatalogItemOrder, 'phase' | 'retryRequest' | 'attempts'>): boolean {
  if (TERMINAL_PHASES.includes(order.phase)) return false;
  if (order.phase === 'Failed') {
    const state = latestAttempt(order)?.state;
    return Boolean(order.retryRequest) || state === 'CleaningUp' || state === 'CleanedUp';
  }
  return true;
}

const RESOURCE_PAGES: Record<string, { path: string; label: string }> = {
  ResourceClaim: { path: 'services', label: 'View service' },
  Workshop: { path: 'workshops', label: 'View workshop' },
  SelfPacedLab: { path: 'selfpacedlabs', label: 'View self-paced lab' },
};

/** Links to existing service, workshop or lab pages for the latest attempt that created one. */
export function orderResourceLinks(order: Pick<CatalogItemOrder, 'attempts'>): { to: string; label: string }[] {
  for (const attempt of [...(order.attempts || [])].reverse()) {
    const links = (attempt.resources || [])
      .filter((ref) => ref.uid && RESOURCE_PAGES[ref.kind])
      .map((ref) => ({
        to: `/${RESOURCE_PAGES[ref.kind].path}/${encodeURIComponent(ref.namespace)}/${encodeURIComponent(ref.name)}`,
        label: RESOURCE_PAGES[ref.kind].label,
      }));
    if (links.length > 0) return links;
  }
  return [];
}

export function orderTypeLabel(orderType?: CatalogItemOrderType): string {
  switch (orderType) {
    case 'workshop':
      return 'Workshop';
    case 'selfPacedLab':
      return 'Self-paced lab';
    case 'service':
      return 'Service';
    default:
      return orderType || '-';
  }
}

export function approvalReasons(order: Pick<CatalogItemOrder, 'policy'>): string[] {
  return (order.policy?.matchedRules || []).map((rule) => rule.reason).filter(Boolean);
}

/** Human summary of relative schedule defaults ("3d") stored until dispatch. */
export function describeSchedule(schedule: OrderSchedule = {}): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  if (schedule.start) rows.push({ label: 'Start', value: schedule.start });
  if (schedule.readyBy) rows.push({ label: 'Ready by', value: schedule.readyBy });
  if (schedule.stop) rows.push({ label: 'Auto-stop', value: schedule.stop });
  else if (schedule.stopAfter) rows.push({ label: 'Auto-stop', value: `${schedule.stopAfter} after provisioning starts` });
  if (schedule.end) rows.push({ label: 'Auto-destroy', value: schedule.end });
  else if (schedule.endAfter) rows.push({ label: 'Auto-destroy', value: `${schedule.endAfter} after provisioning starts` });
  return rows;
}

/** Status shown to approvers: the approval outcome, never provisioning success. */
export function getReviewStatus(review: Pick<ApprovalReview, 'phase' | 'approval' | 'canDecide'>, now: number = Date.now()) {
  const state = review.approval?.state;
  const expired = review.approval?.expiresAt && !inFuture(review.approval.expiresAt, now);
  if (review.phase === 'Cancelled') return { label: 'Cancelled', tone: 'neutral' as const };
  if (state === 'Pending' && !review.approval?.decision) {
    if (expired) return { label: 'Expired', tone: 'neutral' as const };
    return { label: 'Pending', tone: 'warning' as const };
  }
  if (state === 'Approved' || review.approval?.decision?.outcome === 'Approved') return { label: 'Approved', tone: 'info' as const };
  if (state === 'Denied' || state === 'Revoked' || review.approval?.decision?.outcome === 'Denied')
    return { label: 'Denied', tone: 'danger' as const };
  if (state === 'Expired') return { label: 'Expired', tone: 'neutral' as const };
  return { label: state || review.phase, tone: 'neutral' as const };
}

/** Render parameter values as plain text; the API already removes sensitive names. */
export function formatParameterValue(value: unknown): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function authorityLabel(authority?: { basis?: string; level?: number }): string {
  switch (authority?.basis) {
    case 'administrator':
      return 'Administrator';
    case 'direct_manager':
      return 'Direct manager';
    case 'management_chain':
      return authority.level ? `Management chain (level ${authority.level})` : 'Management chain';
    default:
      return '-';
  }
}

/** User-facing text for API error codes that need more than the server message. */
export function orderErrorTitle(code: string): string {
  switch (code) {
    case 'self_decision':
      return 'You cannot review your own order';
    case 'not_authorized':
      return 'You are not an approver for this request';
    case 'manager_lookup_unavailable':
      return 'Manager information is temporarily unavailable';
    case 'already_decided':
      return 'Someone already decided this request';
    case 'not_pending':
    case 'expired':
      return 'This request is no longer pending';
    case 'request_changed':
    case 'policy_changed':
      return 'This request changed after approval was requested';
    case 'order_conflict':
      return 'The request changed while you were deciding';
    case 'impersonation_not_supported':
      return 'Not available while impersonating';
    case 'order_not_found':
      return 'Order not found';
    case 'dispatch_started':
      return 'Provisioning has already started';
    case 'idempotency_key_conflict':
      return 'This order was already submitted with different values';
    default:
      return 'Request failed';
  }
}

// Same rule the API applies for approvers (catalog_item_order._SENSITIVE_PARAMETER_RE).
const SENSITIVE_PARAMETER_RE = /(password|passwd|secret|token|credential|private|key)/i;

/** Parameters safe to display: drops names that look sensitive. */
export function safeParameters(parameters: Record<string, unknown> = {}): [string, unknown][] {
  return Object.entries(parameters)
    .filter(([name]) => !SENSITIVE_PARAMETER_RE.test(name))
    .sort(([a], [b]) => a.localeCompare(b));
}

/** Quantity requested: workshop instance count or self-paced lab pool size. */
export function orderQuantity(order: Pick<CatalogItemOrder, 'orderType' | 'request'>): number | undefined {
  if (order.orderType === 'workshop') return order.request?.workshop?.count;
  if (order.orderType === 'selfPacedLab') return order.request?.selfPacedLab?.poolSize;
  return undefined;
}

/** The catalog order form for an item: a new order, evaluated against the current policy. */
export function newOrderPath(catalogItem: { metadata: { namespace?: string; name?: string } }): string {
  return `/catalog/${encodeURIComponent(catalogItem.metadata.namespace)}/order/${encodeURIComponent(catalogItem.metadata.name)}`;
}
