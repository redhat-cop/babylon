# Catalog item orders and approval policies

Status: implemented behind an opt-in flag (GPTEINFRA-18188). Disabled by default.

`CatalogItemOrder` is a durable order created by the catalog API before provisioning. A controller evaluates the catalog item's approval policy and creates provisioning resources only when approval is satisfied or not required. Pending orders create no ResourceClaim, Workshop, WorkshopProvision, SelfPacedLab or SelfPacedLabProvisionItem, so they never allocate pooled environments.

> **Not enforced on legacy paths yet.** Direct ResourceClaim/Workshop creation through the catalog UI, the Kubernetes proxy, the CLI or `kubectl` does not consult approval policies. Do not configure `approval_policy` on production items until GPTEINFRA-18191 enforces it on those paths.

## Components

| Component | Location | Responsibility |
|---|---|---|
| Policy compiler and evaluator | `client/python/babylon_async/src/babylon_async/approval_policy.py`, vendored byte-for-byte as `catalog/api/approval_policy.py` | Validates AgnosticV policy, publishes it, evaluates it. Standard library only; never evaluates code or templates. |
| Policy publication | `AgnosticVComponent.get_catalog_item_definition` (client library, used by agnosticv-operator) | Publishes `__meta__.catalog.approval_policy` to `CatalogItem.spec.approvalPolicy`. |
| Order model | `catalog/api/catalog_item_order.py` | Request normalization, digests, resource naming, schedule resolution, cancel/retry rules, approval decision contract. |
| Provisioning adapters | `catalog/api/catalog_item_order_adapters.py` | Server-side equivalents of the UI resource construction in `catalog/ui/src/app/api.ts`. |
| Order API | `catalog/api/catalog_item_order_service.py`, routes in `catalog/api/app.py` | Authenticated submit, get, list, cancel, retry. |
| Controller | `catalog/api/catalog_item_order_controller.py` | Reconciliation, dispatch, monitoring, retries. |
| CRDs | `helm/crds/catalogitemorders.babylon.gpte.redhat.com.yaml`, `approvalPolicy` in `helm/crds/catalogitems.babylon.gpte.redhat.com.yaml` | Schema, immutability, status subresource. |
| Deployment | `catalog/helm/templates/order-controller/`, `catalog/helm/templates/api/` | Controller Deployment, service accounts, RBAC. |

### API version

`babylon.gpte.redhat.com/v1`, following every other Babylon CRD. The policy document carries its own schema version (`version: v1`) and the evaluator records `evaluatorVersion`, so policy semantics can evolve independently of the CRD version.

### Controller placement

The controller is a separate Deployment (`babylon-catalog-order-controller`) that runs `catalog_item_order_controller.py` from the catalog API image. It shares the policy evaluator, normalization and adapters with the API without a second copy, while keeping its own service account: only the controller can create provisioning resources, and the API service account only gains order create/read and status update. It is not run inside the API process because the API runs several gunicorn workers and replicas.

The controller uses a list/watch loop with a periodic resync (default 60 s) instead of kopf, so that every status write can use a `resourceVersion` precondition. Multiple replicas are safe, but one is the default.

## Enabling

```bash
helm template catalog/helm \
  --set catalogItemOrders.enabled=true \
  --set catalogItemOrders.controller.catalogBaseUrl=https://catalog.example.com
```

`catalogItemOrders.enabled` sets `CATALOG_ITEM_ORDERS_ENABLED=true` on the API, adds API RBAC, and deploys the controller. The `CatalogItemOrder` CRD ships with the main `helm` chart. Deploy the agnosticv-operator with client library `python-client-library-v0.3.4` or later before relying on `approvalPolicy`; an older operator does not publish the field.

| Controller environment | Default | Meaning |
|---|---|---|
| `CATALOG_BASE_URL` | unset | Catalog URL for `babylon.gpte.redhat.com/url` annotations and review links. |
| `ORDER_REVIEW_BASE_URL` | `CATALOG_BASE_URL` | Base of `status.approval.reviewUrl` (`<base>/approvals/<order uid>`). |
| `ORDER_APPROVAL_EXPIRES_AFTER` | `72h` | Pending approval lifetime when the policy does not set one. |
| `ORDER_RETRY_WINDOW` | `72h` | Retry window when the policy does not set one. |
| `ORDER_RETRY_MAX_ATTEMPTS` | `3` | Total attempts, including the initial one, when the policy does not set it. |
| `SALESFORCE_API` | in-cluster Reporting API | Reporting API URL for manager resolution (Helm: `catalogItemOrders.controller.reportingApiUrl`); token `SALESFORCE_AUTHORIZATION_TOKEN` from `salesforceApi.secretName`, as for the catalog API. |
| `ORDER_RETENTION` | `30d` | Delete completed orders this long after `status.completedAt`; empty disables. Helm: `catalogItemOrders.controller.retention`. |
| `ORDER_CONTROLLER_RESYNC_INTERVAL` | `60` | Seconds between full resyncs; also how often child resource status is checked. |
| `WORKSHOP_FAIL_PERCENTAGE_THRESHOLD`, `SELFPACEDLAB_FAIL_PERCENTAGE_THRESHOLD` | `60` | Same thresholds the workshop and self-paced lab managers use to stop provisioning. |

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
      retry:
        window: 72h                    # 0 to 30d, measured from approval
        max_attempts: 3                # 1 to 10, including the initial attempt
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
- The published policy has a digest of its semantic content (provenance excluded). Digests treat whole-number floats as integers, because Kubernetes returns a stored `48.0` as `48`. The order records the digest and a snapshot. A different digest at decision, dispatch or retry time prevents reuse of the earlier evaluation.
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

Approval reuse for retries:

```yaml
approval_policy:
  version: v1
  default: manager_required
  approval:
    expires_after: 72h
  retry:
    window: 72h        # retries allowed until 72 hours after the approval decision
    max_attempts: 3    # the initial attempt plus two retries
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
    retry: {window: 72h, maxAttempts: 3}
    rules:
    - id: gpu
      when: {field: parameters.gpu_enabled, op: eq, value: true}
      require: manager
      reason: GPU environments require manager approval.
```

The controller revalidates the published policy and its digest, so a hand-edited CatalogItem blocks rather than bypasses approval.

## Order API

All endpoints require a catalog API session and return `404` while `CATALOG_ITEM_ORDERS_ENABLED` is false. Identity comes from the session; admin impersonation headers are rejected. Errors are `{"error": "<code>", "message": "..."}`.

| Endpoint | Result |
|---|---|
| `POST /api/catalog-item-orders` | `202` new order, `200` idempotent replay, `409 idempotency_key_conflict` |
| `GET /api/catalog-item-orders[?namespace=]` | Requester's orders (admins may list a namespace) |
| `GET /api/catalog-item-orders/{namespace}/{name}` | Order view; `404` if not the requester's |
| `POST /api/catalog-item-orders/{namespace}/{name}/cancel` | `200` cancelled; `409 dispatch_started` once an attempt exists |
| `POST /api/catalog-item-orders/{namespace}/{name}/retry` | `202` retry accepted; `409` with the ineligibility reason |

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
- `namespace` must be one of the requester's service namespaces, and a SelfSubjectAccessReview must allow the requester to create the order type's first resource kind there (for example `selfpacedlabs`), the same check the controller repeats at dispatch. The catalog item must be in a session catalog namespace. Existing ordering blocks and catalog access control apply at submission (admins bypass them, as in the proxy policy) and again at dispatch.
- The order name is `order-` plus a digest of requester uid, namespace and idempotency key, so idempotency is scoped to requester and namespace. Reusing a key with a different body returns `409`.
- Defaults match the catalog UI: lifespan end from `lifespan.default`, auto-stop from `runtime.default` unless stop is not supported or the runtime contains `999h`. Without an explicit start, these defaults are stored as `schedule.endAfter` / `schedule.stopAfter` and resolved when each attempt is dispatched (`status.attempts[].schedule`), so waiting for approval does not shorten the runtime or lifespan. Explicit start, stop and end times stay absolute; workshop count 1, concurrency 10 (1 for multi-user), start delay 30, generated access password; self-paced lab pool size 5, assigned lifespan 4h, unassigned lifespan from `runtime.default`.
- Parameters are validated against each parameter's `openAPIV3Schema` (type, enum, bounds, length, pattern). Unknown and reserved names (`purpose`, `purpose_activity`, `purpose_explanation`, `salesforce_id`) are rejected.
- `orderType` must be `service`, `workshop` or `selfPacedLab`. These are rejected before any lookup or resource creation: `multiWorkshop`, `multiuserServiceWorkshop`, `externalUrl` (and any catalog item with `externalUrl`), `whiteGloveRequest`. Workshop and self-paced lab orders are rejected for items with `workshopUiDisabled`.
- Responses never include workshop access passwords.

## CatalogItemOrder resource

`spec` is immutable and server-derived: requester (user, uid, and email when the OpenShift user name is an address; request headers are not trusted for this), catalog item reference with uid, resourceVersion and a digest of provisioning-relevant fields (`materialDigest`), order type, normalized request with effective defaults, `submittedAt`, idempotency key digest, submission digest and `requestDigest`. Immutability is enforced by a `self == oldSelf` validation rule and, for fields that rule cannot see (`request.parameters`), by the controller blocking any order whose `metadata.generation` is not 1 or whose `requestDigest` does not match.

Users have no RBAC on `catalogitemorders`; the catalog API proxy also rejects writes to them. `babylon-cluster-reader` and `babylon-cluster-admin` have read-only access. Provisioning resources carry `babylon.gpte.redhat.com/catalog-item-order`, `-order-uid` and `-order-attempt` labels and have **no ownerReference to the order**, so deleting an order never deletes an environment.

### Retention

The controller sets `status.completedAt` when an order completes: `Provisioned`, `Denied`, `Expired`, `Cancelled`, `Failed`, or `Blocked` without automatic recovery. A retry clears it. On each resync the controller deletes orders whose `completedAt` is older than `ORDER_RETENTION` (default `30d`), except:

- pending or in-progress orders, including recoverable blocks, which are never deleted;
- failed orders that are still eligible for a retry;
- orders with any recorded provisioning resource still present (matched by uid), so the order outlives the environment it authorized and is deleted on a later resync after that environment is gone.

Deletion uses uid and resourceVersion preconditions, so an order updated after it was read (for example by a retry request) is not deleted. Completed orders without `completedAt` get it set on the next resync, and the retention clock starts then. Deleting the namespace also deletes its orders.

### Lifecycle

```text
Submitted ─┬─> PendingApproval ─┬─> Ready ─> Provisioning ─┬─> Provisioned
           │                    ├─> Denied                 └─> Failed ─(retry)─> Ready
           │                    └─> Expired
           ├─> Ready (approval not required)
           └─> Blocked
Submitted, PendingApproval, Ready, Blocked (before any attempt) ─(cancel)─> Cancelled
```

| Phase | Meaning |
|---|---|
| `Submitted` | Accepted; the controller has not evaluated it yet (no status). |
| `PendingApproval` | Waiting for a trusted decision until `status.approval.expiresAt`. No resources exist. |
| `Ready` | Approved or approval not required; the controller rechecks restrictions before dispatch. |
| `Provisioning` | An attempt was claimed. Its resources are created (`Dispatching`) and monitored (`Provisioning`). |
| `Provisioned` | All resources for the attempt reported successful provisioning. Terminal for the order. |
| `Failed` | Controller-verified failure of the latest attempt. May be retried within limits. |
| `Denied` | Decision was denial, or approval was revoked while pending. Terminal. |
| `Expired` | No decision before expiry. Terminal. |
| `Cancelled` | Cancelled by the requester before dispatch. Terminal. |
| `Blocked` | See `status.blocked`. Recoverable blocks resume automatically; others require a new order. |

| Block reason | Recoverable | Resumes at |
|---|---|---|
| `PolicyInvalid`, `PolicyEvaluationFailed`, `CatalogItemUnavailable` (before evaluation) | yes | `Submitted` (fresh evaluation) |
| `OrderingBlocked`, `CatalogItemAccessDenied`, `NamespaceAccessDenied`, `CatalogItemUnavailable` (at dispatch) | yes | `Ready` |
| `PolicyChanged`, `CatalogItemChanged`, `CatalogItemReplaced`, `ScheduleExpired`, `ApprovalRevoked`, `OrderIntegrity`, `NameCollision` | no | submit a new order |

When a policy changes before dispatch of an order that needed no approval, the order is re-evaluated from `Submitted`, because no approval exists that could be reused.

Conditions: `PolicyEvaluated`, `ApprovalSatisfied`, `Dispatched`, `Provisioned`, `RetryAllowed`, `Ready`. `status.history` keeps the last 50 events with actor and timestamp; `status.attempts` keeps every attempt with its resources and failure. Both survive cleanup of failed resources.

### Dispatch checks

Before claiming an attempt the controller verifies: valid, unrevoked approval; catalog item uid, material digest and policy digest unchanged; schedule end and auto-stop still in the future; and, for non-admin requesters (admin determined by SubjectAccessReview), the system status ordering block for the order type and catalog item access control using the requester's current groups. It also requires a SubjectAccessReview allowing the requester to create the first resource kind in the target namespace.

### Durability

- Every status change is a full status replace with the read `resourceVersion`. Conflicts re-read and re-evaluate.
- Dispatch is claimed by recording the attempt, its resolved schedule and its planned resource names before creating anything. Names are `<catalog item name>-<8 random hex digits>`, matching the UI name shape. The suffix is unpredictable and planned names are hidden from the order API until the resources exist, so a requester cannot pre-create an object under a planned name.
- Creation is by planned name. Before the controller has recorded a uid, an existing object is used only if its order uid and attempt labels match; otherwise the order blocks with `NameCollision` and the object is not modified. Once created, the recorded uid is authoritative for monitoring and cleanup, because requesters can edit labels on their resources. Cleanup deletes with a uid precondition and never deletes a replacement object.
- When creation resumes after the claim (restart, persistent API errors), the controller reruns every dispatch check before creating a missing resource. If nothing was created yet the attempt is withdrawn (`DispatchAborted`) and the order blocks or returns to `Failed`; if some resources exist the attempt fails as `DispatchAborted`.
- After a crash or failed status write the next reconcile finds already-created resources by name, so no duplicates are created. Parent/child creation (Workshop then WorkshopProvision) resumes the same plan.
- API cancellation and the dispatch claim both write status with a `resourceVersion` precondition, so exactly one succeeds. Once an attempt exists, cancel returns `409 dispatch_started`.
- Transient API errors leave the order unchanged and are retried on the next event or resync.

### Outcome detection

| Order type | Provisioned | Failed |
|---|---|---|
| service | Every AnarchySubject in the ResourceClaim finished provisioning | Any state ending `-failed`, or `provision-error`/`provision-cancelled` (same as workshop-manager) |
| workshop | WorkshopProvision `activeCount >= count` | No instances provisioning and `failedCount/count` at the workshop-manager threshold |
| selfPacedLab | `readyCount + assignedCount >= poolSize` | No instances provisioning and the failed share at the self-paced lab manager threshold |

Resource creation rejected by the API server (4xx other than 409/429) fails the attempt as `CreateRejected` (retryable). Resources deleted before provisioning completes fail the attempt as `ResourcesDeleted` (not retryable).

## Retry semantics

A retry reuses the existing approval only when all of these hold:

1. The order is `Failed` and the latest attempt failure was verified by the controller and is retryable.
2. No attempt ever succeeded, and no attempt is active.
3. The approval is `Approved` or `NotRequired` and not revoked.
4. The current time is within `window` of `status.approval.satisfiedAt` (the approval decision time, or the evaluation time when approval was not required).
5. Fewer than `maxAttempts` attempts exist. `maxAttempts` includes the initial attempt.
6. The catalog item uid, material digest and policy digest are unchanged.

Limits come from the policy (`retry.window`, `retry.max_attempts`) or the controller defaults, and are snapshotted into `status.policy.retryLimits` at evaluation. The request is fixed by the immutable spec, so a retry is always the same request.

Flow: `POST .../retry` records `status.retry`. The controller rechecks eligibility, deletes the failed attempt's resources by recorded uid (`CleaningUp`), waits until they are gone (`CleanedUp`), returns the order to `Ready`, reruns the dispatch checks and claims a new attempt with new names and a freshly resolved schedule. Eligibility is checked again at dispatch. If any check fails the retry request is dropped and recorded as `RetryRejected`; the requester must submit a new order, which is evaluated afresh. Failed resources are kept until a retry cleans them up or the requester deletes them.

## Manager approval (GPTEINFRA-18189)

### Manager resolution

While an order is `PendingApproval`, the controller looks up the requester in the Reporting API (`GET /users/by-email/{email}`, the requester email encoded as one path segment, existing `SALESFORCE_API` URL and `SALESFORCE_AUTHORIZATION_TOKEN`). It records only what the notification needs:

```yaml
status:
  approval:
    manager:
      source: reporting-api
      state: Resolved            # Pending | Resolved | Unresolved
      resolvedAt: "2026-10-27T10:00:00Z"
      directManager: {email: dana.manager@example.com, name: Dana Manager}
      attempts: 1
```

Response contract (Reporting API v1.10.3; excerpt in `catalog/api/fixtures/reporting_api/users_by_email_contract.json`):

- `manager` is the direct manager as a full user object, or `null` (declared default `[]`, treated as no manager).
- `manager_levels` is a list of records, each describing one user (`user_email`, `active`) and that user's management chain in `level_1_email` … `level_14_email`.

Eligible approvers are the direct manager's email and every `level_N_email` of the requester's single active record (never the requester). This is set membership: the schema does not say whether level 1 is the top or the nearest level, and nothing depends on that. Inactive records are ignored, and more than one active record makes the chain unavailable (the direct manager still applies). Job titles, `is_manager` and array lengths are not used.

Failures leave approval pending and set `state: Unresolved` with `reason`, `message` and a `ManagerResolved=False` condition:

| Reason | Retried | Meaning |
|---|---|---|
| `ManagerLookupUnavailable` | yes | Reporting API error, timeout or HTTP status other than 200/404 |
| `RequesterNotFound` | yes | Reporting API returned 404 |
| `InvalidManagerData` | yes | Response did not match the contract |
| `DirectManagerMissing` | yes | No direct manager; chain managers and administrators can still review |
| `RequesterEmailMissing` | no | The OpenShift user name is not an email; an administrator must review |
| `ManagerLookupNotConfigured` | no | Controller has no Reporting API client |

Retries back off from 1 minute, doubling to a 30-minute cap, and never extend `approval.expiresAt`. Resolution only chooses the email recipient; it is not authorization.

### Who can decide

| Actor | Can decide | Authority recorded |
|---|---|---|
| Requester's direct manager (Reporting API, at decision time) | yes | `direct_manager` |
| Anyone in the requester's active management chain (Reporting API, at decision time) | yes | `management_chain` with `level` |
| Administrator (server-side role check from the session), any namespace, also during Reporting API outages | yes | `administrator` |
| The requester, **including when the requester is an administrator** | no | — |
| Anyone else | no | — |

Self-decision is the one exception to "administrators can decide all requests": an administrator cannot approve or deny their own order, matched by user name or email. The relationship is looked up again for every decision, so a changed manager or a cached notification recipient grants nothing. If the Reporting API is unavailable, non-administrators get `503 manager_lookup_unavailable` and nothing is recorded; a 404 or malformed response grants no authority.

Each decision records `status.approval.decision`: `outcome`, `decidedBy` (user name), `decidedByEmail`, `decidedAt`, `comment`, `authority` (`basis`, `source`, `level`), `requestDigest`, `policyDigest` and `source: catalog-api`. The controller rejects decisions without a recognized authority basis, then performs the `Ready` or `Denied` transition and all provisioning. Approval reuse for provisioning retries is unchanged and sends no new approval request.

### Approvals API (for GPTEINFRA-18190)

All routes require a catalog API session, return `404` while `CATALOG_ITEM_ORDERS_ENABLED` is false, and reject `Impersonate-User`. Errors are `{"error": "<code>", "message": "..."}`. The UI review page at `/approvals/<order uid>` (the `status.approval.reviewUrl`) should call the review route; opening it never records a decision.

| Route | Purpose |
|---|---|
| `GET /api/catalog-item-order-approvals?limit=50&continue=<token>` | Pending orders the caller may decide, oldest request first. Administrators see all pending orders. |
| `GET /api/catalog-item-order-approvals/{uid}` | Review summary for one order, pending or already decided. |
| `POST /api/catalog-item-order-approvals/{uid}/approve` | Record approval. Body: `{"comment": "optional, ≤ 2048 chars"}`. |
| `POST /api/catalog-item-order-approvals/{uid}/deny` | Record denial. Same body. |

List response: `{"items": [<review>], "continue": "<token, only if more>", "incomplete": false}`. `incomplete: true` means some requesters could not be checked because the Reporting API was unavailable. `limit` is 1–200.

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
| 403 | `self_decision` | Caller is the requester (administrators included) |
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

The notifier operator watches CatalogItemOrders when `CATALOG_ITEM_ORDER_NOTIFICATIONS_ENABLED=true` (Helm: `notifier.catalogItemOrders.enabled`, or `catalogItemOrders.enabled` in `notifier/helm`). It only reads orders; its RBAC is `get`/`list`/`watch` on `catalogitemorders`, with no access to status, so it cannot affect approval.

| Event | Recipient | Template | When |
|---|---|---|---|
| Approval request | Resolved direct manager | `catalog-item-order-approval-request` | Pending, undecided, unexpired, manager resolved |
| Approved | Requester | `catalog-item-order-approved` | `approval.state: Approved` |
| Denied | Requester | `catalog-item-order-denied` | `Denied`, or `Revoked` |
| Expired | Requester | `catalog-item-order-expired` | `Expired` |

Higher managers are not emailed; they use the same review link or the approvals list. Emails use the existing branding, MJML rendering, plain-text alternative, EmailSender, SMTP settings and `ONLY_SEND_TO`. They include the requester, catalog item, purpose and activity, explanation, order type and quantity, schedule, approval reasons, expiry and the review or order link (`status.orderUrl`, `<CATALOG_BASE_URL>/orders/<namespace>/<name>`). Untrusted values are escaped and no email contains a credential. The approved email does not claim provisioning has started.

Delivery is tracked in Redis per order uid, event, approval cycle and recipient. A send takes an atomic claim (10-minute lease), re-reads the order and skips obsolete approval requests (decided, cancelled, expired), and records the key as sent only after the SMTP server accepts the message. Failures release the claim and retry in-process with exponential backoff (up to 8 attempts) without waiting for a new Kubernetes event; after that a `ApprovalNotificationFailed` warning event is posted and the next watch event tries again. Events older than 7 days are not sent, so losing Redis state does not resend old mail. Delivery is at least once: a crash after the SMTP server accepted a message but before it was recorded resends it after the lease expires.

### Exemptions

The exemption-provider extension point (`CatalogItemOrderController(exemptions=...)`) remains disabled: the shipped `NoApprovalExemptions` never exempts. The Reporting API provides `level_1` … `level_14` chain fields, but whether a level threshold applies to the requester or an ancestor, the numbering direction and the comparison are undefined. No AgnosticV syntax or default exists for exemptions, and missing hierarchy data never exempts an order.

## Contracts for dependent tickets

### GPTEINFRA-18190: UI

Use the [Approvals API](#approvals-api-for-gpteinfra-18190) for the review page (`/approvals/<order uid>`, linked from emails) and the manager panel. Submit with `POST /api/catalog-item-orders` and a client-generated idempotency key per form submission; show `phase`, `approval` (state, matched rule reasons, expiry), `blocked`, `attempts` and `retry` from the order view; follow `attempts[-1].resources` to the existing service/workshop pages. The UI path stays disabled until the feature flag is on.

### GPTEINFRA-18191: client migration and enforcement

Approval is enforced only for orders submitted through this API. Legacy UI submission, the proxy, CLI, automation and direct Kubernetes writes still create provisioning resources without consulting policies. Enforcement must cover every path that can create or scale ResourceClaims, Workshops, WorkshopProvisions, SelfPacedLabs, SelfPacedLabProvisionItems and MultiWorkshops for governed items (for example admission checks that verify order labels against an order and its approval). Order labels alone are not proof of approval. The unsupported order types listed above must remain blocked for governed items until migrated.

### GPTEINFRA-18192: pilot

Start with service items in a non-production stage, with the flag enabled and `catalogBaseUrl` set, after 18189 can record decisions.

## Known limitations

- Orders on behalf of another user and admin impersonation are not supported.
- Resource `demo.redhat.com/requester` annotations use the requester email when known, otherwise the user name; the UI used the namespace requester or the session email.
- Workshop and self-paced lab provisions receive effective parameter values including defaults, as services already do, so the provisioned values are those that were evaluated.
- Salesforce ID validation remains a UI concern; the API validates only the shape of `salesforceItems`.
- Manager authority requires OpenShift user names that are email addresses, matching how the catalog API already identifies users to the Reporting API. Other users can only be handled by administrators.
- Approval review by uid and the approvals list read all orders and filter in the API; this scales with the number of orders kept by retention.
- Completed orders are deleted after 30 days and their history goes with them. Archiving approval records elsewhere (for example the reporting database) is not implemented.
