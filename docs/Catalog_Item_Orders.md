# Catalog item orders and approval policies

Status: implemented (GPTEINFRA-18188). Always enabled; there is no feature flag.

`CatalogItemOrder` is a durable order created by the catalog API before provisioning. A controller evaluates the catalog item's approval policy and creates provisioning resources only when approval is satisfied or not required. Pending orders create no ResourceClaim, Workshop, WorkshopProvision, SelfPacedLab or SelfPacedLabProvisionItem, so they never allocate pooled environments.

> **Users cannot create ResourceClaims or WorkshopProvisions directly.** Only the order controller (after any required approval), the Babylon operators and administrators can, so `kubectl`, the Kubernetes proxy and older CLI versions cannot bypass approval. By design, MultiWorkshops, white glove fulfilment by administrators, scaling or editing an existing workshop, and multi-user service conversion still do not request approval. See [Who can create provisioning resources](#who-can-create-provisioning-resources).

## Components

| Component | Location | Responsibility |
|---|---|---|
| Policy compiler and evaluator | `client/python/babylon_async/src/babylon_async/approval_policy.py`, vendored byte-for-byte as `catalog/api/approval_policy.py` | Validates AgnosticV policy, publishes it, evaluates it. Standard library only; never evaluates code or templates. |
| Policy publication | `AgnosticVComponent.get_catalog_item_definition` (client library, used by agnosticv-operator) | Publishes `__meta__.catalog.approval_policy` to `CatalogItem.spec.approvalPolicy`. |
| Order model | `catalog/api/catalog_item_order.py` | Request normalization, digests, resource naming, schedule resolution, cancel rules, approval decision contract. |
| Provisioning adapters | `catalog/api/catalog_item_order_adapters.py` | Server-side equivalents of the UI resource construction in `catalog/ui/src/app/api.ts`. |
| Order API | `catalog/api/catalog_item_order_service.py`, routes in `catalog/api/app.py` | Authenticated submit, get, list, cancel. |
| Controller | `catalog/api/catalog_item_order_controller.py` | Reconciliation, dispatch, monitoring. |
| CRDs | `helm/crds/catalogitemorders.babylon.gpte.redhat.com.yaml`, `approvalPolicy` in `helm/crds/catalogitems.babylon.gpte.redhat.com.yaml` | Schema, immutability, status subresource. |
| Deployment | `catalog/helm/templates/order-controller/`, `catalog/helm/templates/api/` | Controller Deployment, service accounts, RBAC. |

### API version

`babylon.gpte.redhat.com/v1`, following every other Babylon CRD. The policy document carries its own schema version (`version: v1`) and the evaluator records `evaluatorVersion`, so policy semantics can evolve independently of the CRD version.

### Controller placement

The controller is a separate Deployment (`babylon-catalog-order-controller`) that runs `catalog_item_order_controller.py` from the catalog API image. It shares the policy evaluator, normalization and adapters with the API without a second copy, while keeping its own service account: only the controller can create provisioning resources, and the API service account only gains order create/read and status update. It is not run inside the API process because the API runs several gunicorn workers and replicas.

The controller uses a list/watch loop with a periodic resync (default 60 s) instead of kopf, so that every status write can use a `resourceVersion` precondition. Multiple replicas are safe, but one is the default.

## Deployment

```bash
helm template catalog/helm \
  --set catalogItemOrders.controller.catalogBaseUrl=https://catalog.example.com
```

The catalog chart always deploys the order controller and grants the API its order RBAC; there is no feature flag. The `CatalogItemOrder` CRD ships with the main `helm` chart, so deploy it before or with the catalog chart. Deploy the agnosticv-operator with client library `python-client-library-v0.3.11` or later before relying on `approvalPolicy`; an older operator does not publish the field. The AgnosticV repository schema (`.schemas/babylon.yaml` in `rhpds/agnosticv`) must also allow `__meta__.catalog.approval_policy`: `agnosticv --merge`, which the operator runs for every item, rejects unknown `__meta__.catalog` keys, so an item with a policy would fail to merge and not be published.

| Controller environment | Default | Meaning |
|---|---|---|
| `CATALOG_BASE_URL` | unset | Catalog URL for `babylon.gpte.redhat.com/url` annotations and review links. |
| `ORDER_REVIEW_BASE_URL` | `CATALOG_BASE_URL` | Base of `status.approval.reviewUrl` (`<base>/approvals/<order uid>`). |
| `ORDER_APPROVAL_EXPIRES_AFTER` | `72h` | Pending approval lifetime when the policy does not set one. |
| `SALESFORCE_API` | in-cluster Reporting API | Reporting API URL for manager resolution (Helm: `catalogItemOrders.controller.reportingApiUrl`); token `SALESFORCE_AUTHORIZATION_TOKEN` from `salesforceApi.secretName`, as for the catalog API. |
| `ORDER_RETENTION` | `30d` | Delete completed orders this long after `status.completedAt`; empty disables. Helm: `catalogItemOrders.controller.retention`. |
| `ORDER_CONTROLLER_RESYNC_INTERVAL` | `60` | Seconds between full resyncs; also how often child resource status is checked. |

## AgnosticV approval policy

Location: `__meta__.catalog.approval_policy`. Absent means no approval is required, as today.

```yaml
__meta__:
  catalog:
    approval_policy:
      version: v1                      # required; only v1 is supported
      default: manager_required        # optional: not_required (default) | manager_required
      default_reason: All orders of this item require manager approval.
      approval:
        approver: requester_manager    # only supported approver
        expires_after: 72h             # 1h to 30d
      rules:
        <rule_id>:                     # ^[a-z0-9]([a-z0-9_-]{0,61}[a-z0-9])?$, "default" is reserved
          when: <condition>
          require: manager             # only supported requirement
          reason: Shown to requester and approver.
          disabled: false
          disabled_reason: Required when disabled is true.
```

### Conditions

```yaml
all: [<condition>, ...]                   # AND, 1-20 entries
any: [<condition>, ...]                   # OR, 1-20 entries
{field: <field>, op: <op>, value: <literal>}
```

| Field | Type | Value |
|---|---|---|
| `request.order_type` | string | `service`, `workshop` or `selfPacedLab` |
| `request.purpose` | string | Exact purpose option name from the item's `purpose` parameter |
| `request.activity` | string | Activity defined by the selected purpose option |
| `request.quantity` | integer | 1 for services, workshop instance count, self-paced lab pool size |
| `request.duration_hours` | number | Requested lifespan: the default lifespan, or end minus start (or submission time) for explicit times |
| `parameters.<name>` | declared parameter type | Effective value: submitted value, else schema default, else `value` |

`parameters.purpose`, `parameters.purpose_activity`, `parameters.purpose_explanation` and `parameters.salesforce_id` are rejected: those values come from order fields, so use `request.purpose` and `request.activity`. For catalog items without purpose options, purpose and activity are free text, so any rule that references `request.purpose` or `request.activity` blocks the order instead of evaluating; this keeps `ne`/`not_in` from being satisfied by arbitrary text.

| Operator | Literal | Notes |
|---|---|---|
| `eq`, `ne` | string, number or boolean | Same type as the field |
| `in`, `not_in` | non-empty list (≤ 50) of one type | |
| `gt`, `gte`, `lt`, `lte` | number | Numeric fields only |
| `exists` | optional boolean (default `true`) | Tests whether the input has a value |

Typing is strict: no string-to-number coercion, and booleans are not numbers. A comparison against an absent optional value is false; use `exists` explicitly. All branches are evaluated, so a type error anywhere blocks even if another branch matched. Limits: 50 rules, depth 5, 200 nodes.

### Semantics

- Every enabled rule is evaluated. Any match, or `default: manager_required`, requires one manager approval; all matched reasons are recorded.
- A policy that is invalid, uses an unsupported version, operator or field, references a parameter the item does not define, or fails at runtime because of an input type **blocks the order** with the error. It never allows provisioning.
- The published policy has a digest of its semantic content (provenance excluded). Digests treat whole-number floats as integers, because Kubernetes returns a stored `48.0` as `48`. The order records the digest and a snapshot. A different digest at decision or dispatch time prevents reuse of the earlier evaluation.
- Form JavaScript conditions on parameters (`formDisableCondition`, `formHideCondition`, `formRequireCondition`, `validation`) are not evaluated by the backend.

### Merge safety

AgnosticV merges shared includes into item files. The policy schema is designed so merging cannot silently drop a requirement:

- `rules` must be a mapping keyed by rule id. Lists are rejected because a child list replaces the inherited one wholesale. Mappings merge additively.
- A rule cannot be switched to "allow"; `require` only accepts `manager`. Removing an inherited rule requires `disabled: true` with `disabled_reason`, and the disabled rule stays visible in the CatalogItem and the order.
- An explicit `default: not_required` (the way a child overrides an inherited `manager_required`) requires `default_override_reason`, which is published.
- `approval_policy: null`, unknown keys and mixed condition nodes produced by a merge are invalid and block.

### Examples

Unconditional approval:

```yaml
approval_policy:
  version: v1
  default: manager_required
  default_reason: All orders of this item require manager approval.
  approval:
    expires_after: 72h
```

Conditional AND/OR approval:

```yaml
approval_policy:
  version: v1
  rules:
    large_training:
      when:
        all:
        - field: request.purpose
          op: in
          value: [Training - Internal, Other]
        - any:
          - field: parameters.num_users
            op: gte
            value: 20
          - field: request.duration_hours
            op: gt
            value: 48
      require: manager
      reason: Large or long training environments require manager approval.
    gpu:
      when:
        field: parameters.gpu_enabled
        op: eq
        value: true
      require: manager
      reason: GPU environments require manager approval.
```

### Published form

`CatalogItem.spec.approvalPolicy` uses camelCase keys and a sorted rule list:

```yaml
spec:
  approvalPolicy:
    state: Valid                       # or Invalid with errors
    version: v1
    evaluatorVersion: v1
    digest: sha256:...
    source: {agnosticvRepo: agnosticv, path: tests/item/prod.yaml, gitCommit: 1a2b3c}
    default: not_required
    approval: {approver: requester_manager, expiresAfter: 72h}
    rules:
    - id: gpu
      when: {field: parameters.gpu_enabled, op: eq, value: true}
      require: manager
      reason: GPU environments require manager approval.
```

The controller revalidates the published policy and its digest, so a hand-edited CatalogItem blocks rather than bypasses approval.

## Order API

All endpoints require a catalog API session. Identity comes from the session; admin impersonation headers are rejected. Errors are `{"error": "<code>", "message": "..."}`.

| Endpoint | Result |
|---|---|
| `POST /api/catalog-item-orders` | `202` new order, `200` idempotent replay, `409 idempotency_key_conflict` |
| `GET /api/catalog-item-orders[?namespace=]` | Requester's orders (admins may list a namespace) |
| `GET /api/catalog-item-orders/{namespace}/{name}` | Order view; `404` if not the requester's |
| `POST /api/catalog-item-orders/{namespace}/{name}/cancel` | `200` cancelled; `409 dispatch_started` once an attempt exists |

```json
POST /api/catalog-item-orders
{
  "idempotencyKey": "9d7f0c1e-4f7a-4c0e-9b8e-2f1d7e5a6b3c",
  "catalogItem": {"namespace": "babylon-catalog-prod", "name": "tests.test-item.prod"},
  "namespace": "user-alice",
  "orderType": "workshop",
  "purpose": "Training - Internal",
  "explanation": "Partner enablement",
  "salesforceItems": [{"id": "701...", "type": "campaign"}],
  "parameters": {"num_users": 25},
  "schedule": {"start": "2026-11-02T09:00:00Z", "end": "2026-11-04T18:00:00Z"},
  "workshop": {"count": 10, "displayName": "OpenShift workshop"}
}
```

Rules:

- Unknown fields, including `requester`, `metadata`, `spec`, `status` or approval fields, are rejected. The body never carries identity, approval state or manifests.
- `namespace` must be one of the requester's service namespaces; administrators may order into any namespace (see [Known limitations](#known-limitations) for how those orders are attributed). In both cases a SelfSubjectAccessReview must allow the requester the custom `order` verb, or `create`, on the order type's first resource kind there (`resourceclaims`, `workshops` or `selfpacedlabs`), the same check the controller repeats at dispatch. See [Who can create provisioning resources](#who-can-create-provisioning-resources). The catalog item must be in a session catalog namespace. Existing ordering blocks and catalog access control apply at submission (admins bypass them, as in the proxy policy) and again at dispatch.
- The order name is `order-` plus a digest of requester uid, namespace and idempotency key, so idempotency is scoped to requester and namespace. Reusing a key with a different body returns `409`.
- Defaults match the catalog UI: lifespan end from `lifespan.default`, auto-stop from `runtime.default` unless stop is not supported or the runtime contains `999h`. Without an explicit start, these defaults are stored as `schedule.endAfter` / `schedule.stopAfter` and resolved when each attempt is dispatched (`status.attempts[].schedule`), so waiting for approval does not shorten the runtime or lifespan. Explicit start, stop and end times stay absolute; workshop count 1, concurrency 10 (1 for multi-user), start delay 30, generated access password; self-paced lab pool size 5, assigned lifespan 4h, unassigned lifespan from `runtime.default`.
- Parameters are validated against each parameter's `openAPIV3Schema` (type, enum, bounds, length, pattern). Unknown and reserved names (`purpose`, `purpose_activity`, `purpose_explanation`, `salesforce_id`) are rejected.
- `orderType` must be `service`, `workshop` or `selfPacedLab`. These are rejected before any lookup or resource creation: `multiWorkshop`, `multiuserServiceWorkshop`, `externalUrl` (and any catalog item with `externalUrl`), `whiteGloveRequest`. Workshop and self-paced lab orders are rejected for items with `workshopUiDisabled`.
- Responses never include workshop access passwords.

The order view (submit, get, list, cancel) also carries a field for the UI:

- `cancel`: `{"allowed": true}` or `{"allowed": false, "code": "dispatch_started" | "order_finished", "message": "..."}`, computed by the same rule the cancel endpoint enforces. It is advisory; the endpoint re-checks with a `resourceVersion` precondition.

## CatalogItemOrder resource

`spec` is immutable and server-derived: requester (user, uid, and email when the OpenShift user name is an address; request headers are not trusted for this), catalog item reference with uid, resourceVersion and a digest of provisioning-relevant fields (`materialDigest`), order type, normalized request with effective defaults, `submittedAt`, idempotency key digest, submission digest and `requestDigest`. Immutability is enforced by a `self == oldSelf` validation rule and, for fields that rule cannot see (`request.parameters`), by the controller blocking any order whose `metadata.generation` is not 1 or whose `requestDigest` does not match.

Users have no RBAC on `catalogitemorders`; the catalog API proxy also rejects writes to them. `babylon-cluster-reader` and `babylon-cluster-admin` have read-only access. Provisioning resources carry `babylon.gpte.redhat.com/catalog-item-order`, `-order-uid` and `-order-attempt` labels and have **no ownerReference to the order**, so deleting an order never deletes an environment.

### Retention

The controller sets `status.completedAt` when an order completes: `Approved` once its resources exist, `Denied`, `Expired`, `Cancelled`, or `Blocked` without automatic recovery. On each resync the controller deletes orders whose `completedAt` is older than `ORDER_RETENTION` (default `30d`), except:

- pending or in-progress orders, including recoverable blocks, which are never deleted;
- orders with any recorded provisioning resource still present (matched by uid), so the order outlives the environment it authorized and is deleted on a later resync after that environment is gone.

Deletion uses uid and resourceVersion preconditions, so an order updated after it was read (for example by a cancellation) is not deleted. Completed orders without `completedAt` get it set on the next resync, and the retention clock starts then. Deleting the namespace also deletes its orders.

### Lifecycle

```text
Submitted ─┬─> PendingApproval ─┬─> Approved   (resources created, then complete)
           │                    ├─> Denied
           │                    └─> Expired
           ├─> Approved (approval not required)
           └─> Blocked
Submitted, PendingApproval, Approved (before creation starts), Blocked ─(cancel)─> Cancelled
```

| Phase | Meaning |
|---|---|
| `Submitted` | Accepted; the controller has not evaluated it yet (no status). |
| `PendingApproval` | Waiting for a trusted decision until `status.approval.expiresAt`. No resources exist. |
| `Approved` | Approved, or approval not required (`approval.state: NotRequired`). The controller rechecks restrictions, claims the dispatch (attempt `Dispatching`) and creates the service, workshop or lab, retrying creation errors (the `Dispatched` condition shows the last error). Once they exist (attempt `Created`, `completedAt` set) the order is complete and links to them. It does not follow provisioning. |
| `Denied` | Decision was denial, or approval was revoked while pending. Terminal. |
| `Expired` | No decision before expiry. Terminal. |
| `Cancelled` | Cancelled by the requester before dispatch. Terminal. |
| `Blocked` | See `status.blocked`. Recoverable blocks resume automatically; others require a new order. |

| Block reason | Recoverable | Resumes at |
|---|---|---|
| `PolicyInvalid`, `PolicyEvaluationFailed`, `CatalogItemUnavailable` (before evaluation) | yes | `Submitted` (fresh evaluation) |
| `OrderingBlocked`, `CatalogItemAccessDenied`, `NamespaceAccessDenied`, `CatalogItemUnavailable` (at dispatch) | yes | `Approved` |
| `PolicyChanged`, `CatalogItemChanged`, `CatalogItemReplaced`, `ScheduleExpired`, `ApprovalRevoked`, `OrderIntegrity`, `NameCollision` | no | submit a new order |

When a policy changes before dispatch of an order that needed no approval, the order is re-evaluated from `Submitted`, because no approval exists that could be reused.

Conditions: `PolicyEvaluated`, `ApprovalSatisfied`, `Dispatched`, `Ready`. `status.history` keeps the last 50 events with actor and timestamp; `status.attempts` keeps every attempt with its resources and failure.

### Dispatch checks

Before claiming an attempt the controller verifies: valid, unrevoked approval; catalog item uid, material digest and policy digest unchanged; schedule end and auto-stop still in the future; and, for non-admin requesters (admin determined by SubjectAccessReview), the system status ordering block for the order type and catalog item access control using the requester's current groups. It also requires a SubjectAccessReview allowing the requester the `order` verb, or `create`, on the first resource kind in the target namespace.

### Durability

- Every status change is a full status replace with the read `resourceVersion`. Conflicts re-read and re-evaluate.
- Dispatch is claimed by recording the attempt, its resolved schedule and its planned resource names before creating anything. Names are `<catalog item name>-<8 random hex digits>`, matching the UI name shape. The suffix is unpredictable and planned names are hidden from the order API until the resources exist, so a requester cannot pre-create an object under a planned name.
- Creation is by planned name. Before the controller has recorded a uid, an existing object is used only if its order uid and attempt labels match; otherwise the order blocks with `NameCollision` and the object is not modified. Once created, the recorded uid is authoritative for monitoring and cleanup, because requesters can edit labels on their resources. Cleanup deletes with a uid precondition and never deletes a replacement object.
- When creation resumes after the claim (restart, persistent API errors), the controller reruns every dispatch check before creating a missing resource. If nothing was created yet the attempt is withdrawn (`DispatchAborted`) and the order blocks; if some resources exist, the controller keeps trying and records the problem in the `Dispatched` condition.
- After a crash or failed status write the next reconcile finds already-created resources by name, so no duplicates are created. Parent/child creation (Workshop then WorkshopProvision) resumes the same plan.
- API cancellation and the dispatch claim both write status with a `resourceVersion` precondition, so exactly one succeeds. Once an attempt exists, cancel returns `409 dispatch_started`.
- Transient API errors leave the order unchanged and are retried on the next event or resync.

### After creation

The order ends when its resources exist. It does not monitor provisioning: success, failure and deletion of the service, workshop or lab are shown on their own pages. Resource creation rejected by the API server (4xx other than 409/429), an unavailable catalog item, or a failed dispatch check after some resources exist leave the order `Approved` without `completedAt`; the controller retries on every reconcile and records the reason in the `Dispatched` condition without rewriting status for the same error. There is no retry of provisioning: to try again after a failed environment, the requester places a new order, which is evaluated afresh. The policy schema has no `retry` section; a policy that sets one is invalid.

## Manager approval (GPTEINFRA-18189)

### Manager resolution

While an order is `PendingApproval`, the controller looks up the requester in the Reporting API (`GET /users/by-email/{email}?details=true`, the requester email encoded as one path segment, existing `SALESFORCE_API` URL and `SALESFORCE_AUTHORIZATION_TOKEN`). It records only what the notification needs:

```yaml
status:
  approval:
    manager:
      source: reporting-api
      state: Resolved            # Pending | Resolved | Unresolved (retrying) | Failed (not retried)
      resolvedAt: "2026-10-27T10:00:00Z"
      directManager: {email: dana.manager@example.com, name: Dana Manager}
      attempts: 1
```

Response contract (Reporting API v1.10.3; excerpt in `catalog/api/fixtures/reporting_api/users_by_email_contract.json`):

- `manager` is the direct manager as a full user object, or `null` (declared default `[]`, treated as no manager).
- `manager_levels` is a list of records, each describing one user (`user_email`, `active`) and that user's management chain in `level_1_email` … `level_14_email`.
- `details=true` is required. Without it, the live API returns `manager`, `manager_levels` and `reports` empty even when `supervisor_number` shows the user has a manager (observed 2026-11-17; sanitized copies of both responses are in `catalog/api/fixtures/reporting_api/live_user_by_email*.json`).
- In live data, `level_1` is the top of the organization, the levels descend toward the user, and the deepest filled level is the user themselves. Unused levels are `null`.

Eligible approvers are the direct manager's email and every `level_N_email` of the requester's single active record (never the requester). This is set membership and does not depend on level order, which the schema does not define (live data has level 1 at the top). Because the chain reaches the top of the organization, every manager above the requester is eligible. Inactive records are ignored, and more than one active record makes the chain unavailable (the direct manager still applies). Job titles, `is_manager` and array lengths are not used.

Failures leave approval pending with `reason`, `message` and a `ManagerResolved=False` condition. While the lookup is retried, `state` is `Unresolved`; once it will not be retried, `state` is `Failed`, the message says that no approval request was sent and an administrator must review the request, and a `ManagerLookupFailed` history event is recorded. The order page shows a "Your manager could not be found" warning and the approval review page shows the message to administrators.

| Reason | Retried | Meaning |
|---|---|---|
| `ManagerLookupUnavailable` | until the approval expires | Reporting API error, timeout or HTTP status other than 200/404 |
| `RequesterNotFound` | 3 attempts, then `Failed` | Reporting API returned 404 |
| `InvalidManagerData` | 3 attempts, then `Failed` | Response did not match the contract |
| `DirectManagerMissing` | 3 attempts, then `Failed` | No direct manager; chain managers and administrators can still review |
| `RequesterEmailMissing` | no, `Failed` | The OpenShift user name is not an email; an administrator must review |
| `ManagerLookupNotConfigured` | no, `Failed` | Controller has no Reporting API client |

Retries back off from 1 minute, doubling to a 30-minute cap (so the 3 attempts for requester data problems span about 3 minutes), and never extend `approval.expiresAt`. A `Failed` lookup does not block the order: administrators, and managers in the reporting chain when the Reporting API knows one, can still decide until it expires. Resolution only chooses the email recipient; it is not authorization.

### Who can decide

| Actor | Can decide | Authority recorded |
|---|---|---|
| Requester's direct manager (Reporting API, at decision time) | yes | `direct_manager` |
| Anyone in the requester's active management chain (Reporting API, at decision time) | yes | `management_chain` with `level` |
| Administrator (server-side role check from the session), any namespace, also during Reporting API outages, including their own orders | yes | `administrator` |
| The requester, unless they are an administrator | no | — |
| Anyone else | no | — |

Administrators can decide every request, including their own; such a decision is recorded with the `administrator` basis and the administrator as `decidedBy`, so it is auditable. Other requesters cannot decide their own orders, matched by user name or email. The relationship is looked up again for every decision, so a changed manager or a cached notification recipient grants nothing. If the Reporting API is unavailable, non-administrators get `503 manager_lookup_unavailable` and nothing is recorded; a 404 or malformed response grants no authority.

Each decision records `status.approval.decision`: `outcome`, `decidedBy` (user name), `decidedByEmail`, `decidedAt`, `comment`, `authority` (`basis`, `source`, `level`), `requestDigest`, `policyDigest` and `source: catalog-api`. The controller rejects decisions without a recognized authority basis, then performs the `Approved` or `Denied` transition and creates the resources.

### Approvals API (for GPTEINFRA-18190)

All routes require a catalog API session and reject `Impersonate-User`. Errors are `{"error": "<code>", "message": "..."}`. The UI review page at `/approvals/<order uid>` (the `status.approval.reviewUrl`) should call the review route; opening it never records a decision.

| Route | Purpose |
|---|---|
| `GET /api/catalog-item-order-approvals?state=pending&limit=50&continue=<token>` | Approval requests the caller may review. `state` is `pending` (default; undecided requests, oldest first), `decided` (no longer pending: approved, denied, expired, revoked or cancelled) or `all` (newest first). Orders that never required approval are not listed. Administrators see every request. |
| `GET /api/catalog-item-order-approvals/{uid}` | Review summary for one order, pending or already decided. |
| `POST /api/catalog-item-order-approvals/{uid}/approve` | Record approval. Body: `{"comment": "optional, ≤ 2048 chars"}`. |
| `POST /api/catalog-item-order-approvals/{uid}/deny` | Record denial. Same body. |

List response: `{"items": [<review>], "continue": "<token, only if more>", "incomplete": false}`. `incomplete: true` means some requesters could not be checked because the Reporting API was unavailable. `limit` is 1–200; an unknown `state` returns `400 invalid_state`. `canDecide` is false once `approval.expiresAt` has passed, even before the controller marks the order `Expired`.

Review shape (also returned by approve and deny):

```json
{
  "uid": "…", "orderId": "user-alice/order-…", "phase": "PendingApproval",
  "requester": {"user": "alice@example.com", "email": "alice@example.com"},
  "catalogItem": {"name": "tests.item.prod", "namespace": "babylon-catalog-prod", "displayName": "Test Item"},
  "submittedAt": "…",
  "request": {"orderType": "workshop", "quantity": 12, "durationHours": 72.0, "purpose": "…", "activity": "…",
              "explanation": "…", "schedule": {"endAfter": "3d", "stopAfter": "4h"}},
  "parameters": {"num_users": 25},
  "reasons": ["Large workshops need approval."],
  "approval": {"state": "Pending", "requestedAt": "…", "expiresAt": "…", "reviewUrl": "…",
               "manager": {"state": "Resolved", "directManager": {"email": "…", "name": "…"}},
               "decision": {"…": "present once decided"}},
  "authority": {"basis": "direct_manager", "source": "reporting-api"},
  "canDecide": true
}
```

`parameters` omits names that look sensitive (password, secret, token, credential, private, key) and parameters whose schema uses `format: password`. Workshop access passwords are never included.

| Status | Code | When |
|---|---|---|
| 200 | — | Decision recorded, or the same actor repeats the same decision (idempotent, also after the controller transition) |
| 400 | `invalid_request`, `invalid_comment`, `invalid_limit`, `invalid_continue`, `invalid_json`, `impersonation_not_supported` | Malformed request |
| 403 | `self_decision` | Caller is the requester and not an administrator |
| 403 | `not_authorized` | Caller is not an eligible approver |
| 403 | `cross_site_request` | `Origin` header does not match the catalog host |
| 404 | `order_not_found` | No order with that uid |
| 409 | `already_decided` | A different decision exists |
| 409 | `not_pending`, `expired` | Order is no longer pending (cancelled, decided, expired) |
| 409 | `request_changed`, `policy_changed` | Order, catalog item or approval policy changed since approval was requested |
| 409 | `order_conflict` | Concurrent updates; reload and retry |
| 415 | `unsupported_media_type` | Decision body is not `application/json` |
| 503 | `manager_lookup_unavailable` | Reporting API unavailable for a non-administrator |

Decisions are written with a `resourceVersion` precondition and re-read and revalidated on conflict, so concurrent approve/deny and cancel/expiry races have exactly one outcome. Session tokens travel in the `Authentication` request header, which cross-site forms cannot send; decisions additionally require a JSON body and a same-origin `Origin` when present.

### Approval emails

The notifier operator always watches CatalogItemOrders; there is no switch, so deploy it with the CRD. Use `ONLY_SEND_TO` to restrict recipients in non-production environments. It only reads orders; its RBAC is `get`/`list`/`watch` on `catalogitemorders`, with no access to status, so it cannot affect approval.

| Event | Recipient | Template | When |
|---|---|---|---|
| Approval request | Resolved direct manager | `catalog-item-order-approval-request` | Pending, undecided, unexpired, manager resolved |
| Approved | Requester | `catalog-item-order-approved` | `approval.state: Approved` |
| Denied | Requester | `catalog-item-order-denied` | `Denied`, or `Revoked` |
| Expired | Requester | `catalog-item-order-expired` | `Expired` |

Higher managers are not emailed; they use the same review link or the approvals list. Emails use the existing branding, MJML rendering, plain-text alternative, EmailSender, SMTP settings and `ONLY_SEND_TO`. They include the requester, catalog item, purpose and activity, explanation, order type and quantity, schedule, approval reasons, expiry and the review or order link (`status.orderUrl`, `<CATALOG_BASE_URL>/orders/<namespace>/<name>`). Untrusted values are escaped and no email contains a credential. The approved email does not claim provisioning has started.

Delivery is tracked in Redis per order uid, event, approval cycle and recipient. A send takes an atomic claim (10-minute lease), re-reads the order and skips obsolete approval requests (decided, cancelled, expired), and records the key as sent only after the SMTP server accepts the message. Failures release the claim and retry in-process with exponential backoff (up to 8 attempts) without waiting for a new Kubernetes event; after that a `ApprovalNotificationFailed` warning event is posted and the next watch event tries again. Events older than 7 days are not sent, so losing Redis state does not resend old mail. Delivery is at least once: a crash after the SMTP server accepted a message but before it was recorded resends it after the lease expires.

### Exemptions

Requesters who are senior managers skip manager approval. When a policy requires approval from `requester_manager`, the controller looks up the requester (the same `?details=true` call used for manager resolution) and exempts the order only if:

- the Reporting API marks the requester `is_manager: true`, and
- the requester's own email appears exactly once in their single active `manager_levels` record, at level `catalogItemOrders.controller.managerExemptionMaxLevel` (default `5`) or above. Level 1 is the top of the organization, so "above" means a lower number.

For example, a manager at level 5 is exempt, and an employee at level 6, or a manager at level 6, still needs approval.

The check runs once, when the policy is evaluated. A lookup failure, a missing or repeated requester level, or more than one active record never exempts: the order goes to `PendingApproval` as usual. An exempt order records `status.approval.state: NotRequired` with `status.approval.exemption` (`source: reporting-api-manager-level` and a reason naming the level), so it can be audited. Set `managerExemptionMaxLevel` empty to disable exemptions (`ORDER_MANAGER_EXEMPTION_MAX_LEVEL` in the controller). Exemptions are global, not per catalog item, and there is no AgnosticV syntax for them.

Level numbering comes from live data; the Reporting API schema does not define it.

## Client migration (GPTEINFRA-18191)

Clients that order services and workshops submit a `CatalogItemOrder` through the order API and follow it, instead of creating ResourceClaims, Workshops or WorkshopProvisions themselves.

### Babylon CLI

| Command | Before | Now |
|---|---|---|
| `babylon service order <item>` | POST a ResourceClaim through the proxy | POST `/api/catalog-item-orders` (`orderType: service`), then poll the order |
| `babylon workshop create <item> --seats N` | POST a Workshop, then a WorkshopProvision | POST one `workshop` order (`count` and `concurrency` = N, concurrency at most 100) |
| `babylon order list` / `status <name>` / `cancel <name>` | — | New: follow and cancel orders |

Behaviour and compatibility:

- **Waiting.** Both ordering commands wait up to `--wait` (default `60s`; `0` returns right after submitting). They return as soon as the resource exists, approval is required, or the order ends.
- **Output when created.** The table, JSON and YAML output is the created ResourceClaim or Workshop, as before, so scripts that read it keep working when no approval is needed. Table output also shows the order name.
- **Output otherwise.** If approval is required, or the order is still processing when `--wait` ends, the output is the **order view** (see [Order API](#order-api)), not a ResourceClaim or Workshop, and the exit status is 0. Scripts that order governed items must check `.phase` (or `.kind`) before reading resource fields. Denied, expired, cancelled and permanently blocked orders exit non-zero.
- **End date.** `--end-date` durations (`72h`) are counted from submission and sent as an absolute `schedule.end`, so waiting for approval uses part of them. Without `--end-date`, the catalog default lifespan starts when the resource is created.
- **Purpose.** `--purpose` (new on `workshop create`), else a `purpose` parameter or catalog default, else `Development`, as before. It is sent as the order `purpose`, not as a parameter. Items whose purpose parameter has `x-form-options` (most catalog items) require one of those option names, so the old `Development` fallback no longer works for them: the CLI lists the valid options and asks for `--purpose`. `--explanation` (or `--param purpose_explanation=…`) provides the explanation some purposes require. `--param purpose_activity=…` and `--param salesforce_id=…` are rejected because the catalog derives them.
- **Parameters.** Only `--param` values are sent; the API applies catalog defaults, as for UI orders.
- **Workshop passwords.** Order responses never include access passwords, so the CLI generates one when `--access-password` is not given and prints it once the workshop exists.
- **Retries.** A submission is resent with the same idempotency key after a network or gateway error; the API returns the existing order instead of creating another.
- **Older CLI versions** create resources directly, which users are no longer allowed to do: `service order` and `workshop create` fail with `403 Forbidden` (`cannot create resource "resourceclaims"` / `"workshopprovisions"`). Upgrade to the release that contains this change.

### Automation and other HTTP clients

Use the CLI (`-o json`) or call the order API directly with a catalog API session: the same oauth-proxy cookie and `Authentication: Bearer <session token>` header the CLI uses. Submit with a random `idempotencyKey`, reuse it when resending after a transport error, then poll `statusUrl` until `phase` is `PendingApproval` or the order is final. A created resource is the entry in `attempts[].resources` with a `uid`.

### Python client library

`babylon_async` is the Kubernetes client the Babylon operators use with their own service accounts; nothing uses it to order on behalf of a user. It has no order helpers on purpose: users have no RBAC on `catalogitemorders`, and orders must go through the catalog API so the requester comes from the authenticated session.

### Who can create provisioning resources

Users have no `create` on ResourceClaims and WorkshopProvisions, the resources that start environments:

| Role | ResourceClaims | WorkshopProvisions | Workshops, MultiWorkshops |
|---|---|---|---|
| `babylon-user-service-access` (aggregated to `edit`) | `order`, get, list, watch, patch, update, delete | get, list, watch, patch, update, delete | create, `order` (workshops), … |
| `babylon-workshop-admin` (aggregated to `admin`) | — | get, list, watch, patch, update, delete | create, `order` (workshops), … |
| `babylon-cluster-admin` | create, `order`, … | create, … | create, `order` (workshops), … |

- They are created by the **order controller** (orders from the catalog UI and the CLI, after any required approval), **workshop-manager** (MultiWorkshops and workshop seats) and **administrators** (white glove fulfilment). `kubectl`, the Kubernetes proxy and older CLI versions get `403 Forbidden`.
- `order` is a custom RBAC verb: no API request uses it. The catalog API (at submission) and the order controller (at dispatch) accept `order` or `create` on the order type's first resource kind. `create` still counts so that roles defined outside Babylon that grant it (for example administrator roles) keep working; anyone with `create` could create the resource directly anyway.
- Self-paced labs are unchanged and administrator-only: the order form offers them only to administrators, and no user role grants `create` or `order` on `selfpacedlabs` or `selfpacedlabprovisionitems`, so users can neither order nor create them.
- Users keep `patch`, `update` and `delete` for start, stop, retire, delete and workshop scaling, and `create` on Workshops (a Workshop alone provisions nothing; multi-user service conversion creates one) and MultiWorkshops.
- `WorkshopProvision.spec.catalogItem` is immutable (CRD validation rule), so a provision cannot be pointed at a catalog item that requires approval.
- RBAC lives in the main `helm` chart. User namespaces get these permissions through the standard `edit`/`admin` aggregation; any other role bound in user namespaces that grants `create` on these resources (for example from another chart) would reopen direct creation. Check with `oc auth can-i create resourceclaims -n <user-namespace> --as <user>`.

Paths that still do not request approval, by design:

- MultiWorkshop creation: users create the MultiWorkshop and workshop-manager provisions its assets;
- white glove fulfilment, which only administrators can perform;
- scaling or editing an existing workshop (`count`, `concurrency`, `parameters` on its WorkshopProvision), and converting a multi-user service into a workshop;
- changing parameter values of an existing ResourceClaim, where the ResourceProvider allows updates;
- external URL items, which provision nothing.

## Contracts for dependent tickets

### GPTEINFRA-18190: UI

Implemented in `catalog/ui/src/app/CatalogItemOrders/`, always on.

| Route | Page |
|---|---|
| `/orders/<namespace>/<name>/placing` | Waiting page after submitting (see Submission below). |
| `/orders` | My Services → Orders in the navigation (My Services is a group with Services and Orders). Lists the requester's orders, refreshing every 8 s while any order is active. |
| `/orders/<namespace>/<name>` | Order detail (`status.orderUrl`) for orders that needed approval: status (waiting, approved by whom, denied, expired, cancelled), approval reason, manager, expiry, review link, schedule, parameters and history; Cancel when `cancel.allowed`, and a link to the service, workshop or lab once it exists. |
| `/approvals`, `/approvals/<uid>` | Manager panel and review page (`status.approval.reviewUrl`). Opening a link only reads the review; Approve and Deny need a confirmation with an optional comment. |
| `/admin/approvals`, `/admin/approvals/<uid>` | Administrator view, sharing the list and review components, with a Pending / Decided / All filter. |

Behavior:

- **Submission.** The catalog order form submits one `CatalogItemOrder` and opens a waiting page (`/orders/<namespace>/<name>/placing`) that polls the order and replaces itself with the created service, workshop or lab when no approval is needed, or with the order page as soon as approval is needed (or the order is blocked, denied, ...). After 30 seconds it says it is still working and links to My Services, and keeps checking. Orders that need no approval never show an order page and are not listed in Orders or in the approval lists. The form never calls the direct ResourceClaim, Workshop or SelfPacedLab helpers and sends no white glove or Jira "provisioning started" updates. The idempotency key is reused for the same request body (double clicks, transport retries, and a manual resubmit after an ambiguous failure) and replaced when the request changes. Transport failures and `503 order_backend_unavailable` are retried twice with the same key. When the user keeps the catalog default runtime and lifespan without a start time, `stop` and `end` are omitted so the defaults apply at dispatch.
- **Direct flows kept.** External URL items (nothing is provisioned; the request is recorded and the external site opens) and white glove orders (fulfilment from a white glove request, or the admin White-Glove Support switch) keep the previous direct flow. White glove requests are created by users but fulfilled only by administrators, so only administrators get that direct flow; a `?wgr=` link never lets anyone else skip approval. MultiWorkshop creation and converting a multi-user service into a workshop also keep the direct flow. Ordering while impersonating is explained and disabled, because the order API records the authenticated requester.
- **Reorder** on services and workshops opens the order form for the same item, which is a new order evaluated afresh.
- **Errors.** Backend `error`/`message` are shown as returned; a 403 is not treated as a disabled account. Stale approval decisions (`already_decided`, `not_pending`, `expired`, `request_changed`, `policy_changed`, `order_conflict`) reload the request instead of replaying the decision; `manager_lookup_unavailable` is shown as temporary.
- **Identity.** Order and approval SWR keys include the signed-in user, so cached privileged data is never shown to another identity. Approval authority always comes from the API; the UI never uses the displayed or impersonated email.
- **Deep links.** oauth-proxy returns unauthenticated users to the requested URL after login, and the session retry in `api.ts` now stays on the current path instead of redirecting to `/`.

The direct flows above do not request approval; see [Who can create provisioning resources](#who-can-create-provisioning-resources).

### GPTEINFRA-18192: pilot

Start by setting `approval_policy` on service items in a non-production stage, with `catalogBaseUrl` set, after 18189 can record decisions.

## Known limitations

- Orders on behalf of another user and admin impersonation are not supported.
- An administrator ordering into another user's namespace is the requester: the order, the approval request (to the administrator's manager, and the administrator may approve it), the resource's `demo.redhat.com/requester` annotation and the service emails are the administrator's. The namespace owner sees the created service but not the order. White glove fulfilment keeps attributing the service to the namespace owner.
- Resource `demo.redhat.com/requester` annotations use the requester email when known, otherwise the user name; the UI used the namespace requester or the session email.
- Workshop and self-paced lab provisions receive effective parameter values including defaults, as services already do, so the provisioned values are those that were evaluated.
- Salesforce ID validation remains a UI concern; the API validates only the shape of `salesforceItems`.
- Manager authority requires OpenShift user names that are email addresses, matching how the catalog API already identifies users to the Reporting API. Other users can only be handled by administrators.
- Approval review by uid and the approvals list read all orders and filter in the API; this scales with the number of orders kept by retention.
- Completed orders are deleted after 30 days and their history goes with them. Archiving approval records elsewhere (for example the reporting database) is not implemented.
