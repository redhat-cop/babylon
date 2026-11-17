// Shapes returned by the catalog API order and approval endpoints
// (catalog/api/catalog_item_order.py order_view / review_view).

export type CatalogItemOrderType = 'service' | 'workshop' | 'selfPacedLab';

export type CatalogItemOrderPhase =
  | 'Submitted'
  | 'PendingApproval'
  | 'Ready'
  | 'Provisioning'
  | 'Provisioned'
  | 'Failed'
  | 'Denied'
  | 'Expired'
  | 'Cancelled'
  | 'Blocked';

export type ApprovalState = 'Pending' | 'Approved' | 'Denied' | 'Expired' | 'Revoked' | 'NotRequired';

export type SalesforceItem = { id: string; type: 'campaign' | 'opportunity' | 'project' };

export type OrderSchedule = {
  start?: string;
  stop?: string;
  end?: string;
  readyBy?: string;
  endAfter?: string;
  stopAfter?: string;
};

export type ApprovalDecision = {
  outcome: 'Approved' | 'Denied';
  decidedBy?: string;
  decidedByEmail?: string;
  decidedAt?: string;
  comment?: string;
  authority?: { basis?: string; source?: string; level?: number };
};

export type ApprovalManager = {
  state?: 'Pending' | 'Resolved' | 'Unresolved';
  reason?: string;
  message?: string;
  directManager?: { email?: string; name?: string };
};

export type OrderApproval = {
  state?: ApprovalState;
  approver?: string;
  requestedAt?: string;
  expiresAt?: string;
  satisfiedAt?: string;
  reviewUrl?: string;
  manager?: ApprovalManager;
  decision?: ApprovalDecision;
  exemption?: { source?: string; reason?: string };
  revocation?: { revokedAt?: string; reason?: string };
};

export type OrderResourceRef = {
  apiVersion?: string;
  kind: string;
  namespace: string;
  name: string;
  uid?: string;
};

export type OrderAttempt = {
  number: number;
  state: 'Dispatching' | 'Provisioning' | 'Succeeded' | 'Failed' | string;
  startedAt?: string;
  completedAt?: string;
  schedule?: OrderSchedule;
  resources: OrderResourceRef[];
  failure?: { reason?: string; message?: string };
};

export type OrderCancel = { allowed: boolean; code?: string; message?: string };

export type OrderBlocked = {
  reason: string;
  message?: string;
  recoverable?: boolean;
  since?: string;
  resumePhase?: string;
};

export type CatalogItemOrderRequest = {
  purpose?: string;
  activity?: string;
  explanation?: string;
  parameters?: Record<string, unknown>;
  salesforceItems?: SalesforceItem[];
  schedule?: OrderSchedule;
  workshop?: { count?: number; displayName?: string; description?: string; openRegistration?: boolean };
  selfPacedLab?: { poolSize?: number; displayName?: string; description?: string };
  service?: Record<string, unknown>;
};

export type CatalogItemOrder = {
  id: string;
  name: string;
  namespace: string;
  uid: string;
  createdAt?: string;
  phase: CatalogItemOrderPhase;
  orderType: CatalogItemOrderType;
  catalogItem: { name: string; namespace: string };
  requester?: string;
  submittedAt?: string;
  request: CatalogItemOrderRequest;
  approval: OrderApproval;
  policy?: {
    state?: string;
    approvalRequired?: boolean;
    matchedRules?: { id?: string; reason?: string }[];
    errors?: string[];
    evaluatedAt?: string;
  };
  blocked?: OrderBlocked | null;
  completedAt?: string | null;
  orderUrl?: string | null;
  attempts: OrderAttempt[];
  history?: { event: string; timestamp?: string; phase?: string; actor?: string; message?: string }[];
  cancel?: OrderCancel;
};

export type CatalogItemOrderList = { items: CatalogItemOrder[] };

export type ApprovalAuthority = { basis: 'administrator' | 'direct_manager' | 'management_chain'; source?: string; level?: number };

export type ApprovalReview = {
  uid: string;
  orderId: string;
  phase: CatalogItemOrderPhase;
  requester: { user?: string; email?: string };
  catalogItem: { name: string; namespace: string; displayName?: string };
  submittedAt?: string;
  request: {
    orderType?: CatalogItemOrderType;
    quantity?: number;
    durationHours?: number;
    purpose?: string;
    activity?: string;
    explanation?: string;
    schedule?: OrderSchedule;
  };
  parameters: Record<string, unknown>;
  reasons: string[];
  approval: OrderApproval;
  authority?: ApprovalAuthority;
  canDecide: boolean;
};

export type ApprovalReviewList = { items: ApprovalReview[]; continue?: string; incomplete: boolean };

export type ApprovalListState = 'pending' | 'decided' | 'all';

/** Body accepted by POST /api/catalog-item-orders. Identity is never sent. */
export type CatalogItemOrderSubmission = {
  idempotencyKey: string;
  catalogItem: { namespace: string; name: string };
  namespace: string;
  orderType: CatalogItemOrderType;
  purpose?: string;
  activity?: string;
  explanation?: string;
  salesforceItems?: SalesforceItem[];
  skipSalesforceId?: boolean;
  parameters?: Record<string, unknown>;
  schedule?: { start?: string; stop?: string; end?: string; readyBy?: string };
  service?: { autoDetach?: boolean; resourcePool?: string };
  workshop?: {
    accessPassword?: string;
    autoDetach?: boolean;
    concurrency?: number;
    count?: number;
    description?: string;
    displayName?: string;
    openRegistration?: boolean;
    resourcePool?: string;
    startDelay?: number;
  };
  selfPacedLab?: {
    accessPassword?: string;
    assignedLifespan?: string;
    concurrency?: number;
    description?: string;
    displayName?: string;
    openRegistration?: boolean;
    poolSize?: number;
    startDelay?: number;
    unassignedLifespan?: string;
  };
};
