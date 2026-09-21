# Catalog Order Policy Design

## Purpose

Enforce Babylon catalog ordering policy at the Catalog API boundary so every HTTP client, including the Babylon CLI, receives the same access-control and maintenance-block decisions as the Catalog UI.

The policy applies only to user requests passing through the Catalog API. Kubernetes operators and administrators using Kubernetes directly remain governed by Kubernetes RBAC and are outside this change.

## Protected Requests

The policy runs before forwarding collection `POST` requests for these resources:

| API group | Resource | Block category | CatalogItem reference |
|---|---|---|---|
| `poolboy.gpte.redhat.com` | `resourceclaims` | service | `spec.provider.name`, resolved server-side across authorized catalog namespaces |
| `babylon.gpte.redhat.com` | `workshops` | workshop | metadata labels |
| `babylon.gpte.redhat.com` | `workshopprovisions` | workshop | `spec.catalogItem` |
| `babylon.gpte.redhat.com` | `selfpacedlabs` | workshop | metadata labels |
| `babylon.gpte.redhat.com` | `selfpacedlabprovisionitems` | workshop | `spec.catalogItem` |
| `babylon.gpte.redhat.com` | `multiworkshops` | workshop | every non-external `spec.assets[].key` entry |

Named-resource POSTs, updates, patches, deletes, unrelated resource types, and operator traffic are unchanged.

## Policy Decisions

Administrators bypass ordering blocks and CatalogItem access control, matching the current UI.

For non-admin users:

1. Read the existing system-status ConfigMap through `get_system_status_from_configmap`.
2. Reject requests covered by an active service/workshop ordering block with HTTP 403. Use the configured block message when present.
3. Parse all required CatalogItem references.
4. Reject malformed or missing authoritative references with HTTP 400. ResourceClaim and provision-resource labels are neither required nor trusted.
5. Require each explicitly referenced namespace to be present in the session's `catalogNamespaces`. Resolve a ResourceClaim provider name server-side by loading it from every authorized catalog namespace.
6. Load each authoritative CatalogItem through the Catalog API's service Kubernetes client. A ResourceClaim provider with zero matches is unavailable; more than one match is ambiguous.
7. Return a generic HTTP 403 when a referenced CatalogItem is absent, ambiguous, or unavailable to the session.
8. Apply the UI's access semantics to every referenced CatalogItem:
   - no `accessControl` object: allow;
   - matching `denyGroups`: deny, even if another list matches;
   - matching `allowGroups`: allow;
   - matching `viewOnlyGroups`: deny ordering;
   - otherwise: deny.

All referenced CatalogItems must allow ordering. MultiWorkshop assets with `type: external` do not have a CatalogItem and are skipped. A `Workshop` with `spec.provisionDisabled: true` and a matching, existing ResourceClaim owner is a management view over already-provisioned infrastructure rather than a new order; it bypasses ordering policy only after the ResourceClaim UID is validated.

The public system-status endpoint retains its existing fail-open display behavior. Ordering enforcement is strict: an absent ConfigMap is treated as no configured blocks, while status lookup errors prevent forwarding and return HTTP 503. CatalogItem lookup errors also fail closed: a 404 becomes a generic 403, while infrastructure errors return HTTP 503.

## Structure

Add `catalog/api/catalog_order_policy.py` containing:

- exact protected-resource metadata;
- request classification;
- CatalogItem reference extraction and consistency validation;
- UI-compatible access-control evaluation;
- asynchronous policy enforcement using injected system-status and CatalogItem loaders;
- typed policy exceptions carrying a safe status, reason, and audit code.

Keep `catalog/api/app.py` responsible for:

- authentication and session retrieval;
- reading the request body once;
- supplying the existing system-status loader;
- loading CatalogItems from Kubernetes;
- translating policy exceptions into aiohttp responses;
- auditing denied attempts without logging request bodies;
- forwarding only approved requests.

## Errors And Auditing

Policy failures use these response classes:

- HTTP 400: malformed request body or missing authoritative references;
- HTTP 403: active ordering block, inaccessible namespace, absent or ambiguous CatalogItem, or denied/view-only access;
- HTTP 503: CatalogItem or ResourceClaim lookup infrastructure failure.

The API emits a `catalog_order_denied` audit event containing only user, request path, policy code, and HTTP status. It never logs parameter values or the complete request body.

## Tests

Create `catalog/api/test_catalog_order_policy.py` using `unittest` and `IsolatedAsyncioTestCase`.

Coverage includes:

- exact request classification and non-target bypass;
- admin bypass without status or CatalogItem calls;
- service and workshop block mappings;
- all six protected resource payload shapes;
- MultiWorkshop multiple/external assets;
- missing and inconsistent references;
- namespace membership;
- absent, denied, view-only, allowed, and unrestricted CatalogItems;
- deny precedence over allow;
- all referenced CatalogItems must pass;
- lookup failure behavior;
- a proxy-hook test proving policy executes before Kubernetes `call_api`;
- denial audit data contains no request body.

The existing Catalog API test suite must remain green.
