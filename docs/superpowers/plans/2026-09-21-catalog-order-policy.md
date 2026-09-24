# Catalog Order Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce CatalogItem access controls and system ordering blocks for all catalog-derived order requests passing through the Catalog API.

**Architecture:** A dedicated policy module classifies Kubernetes collection POSTs, validates authoritative CatalogItem references, and applies block/access rules before the existing proxy forwards a request. `app.py` supplies authenticated session data and Kubernetes loaders, translates safe policy exceptions, and audits denials.

**Tech Stack:** Python 3.12, aiohttp, kubernetes-asyncio, standard-library `unittest` and `unittest.mock`.

**Spec:** `docs/superpowers/specs/2026-09-21-catalog-order-policy-design.md`

## Global Constraints

- Preserve the administrator bypass used by the Catalog UI.
- Do not change Kubernetes operators, CRDs, or client payload contracts.
- Do not enforce policy on PATCH, PUT, DELETE, named POST endpoints, or unrelated resources.
- Never include request bodies or parameter values in denial audit records.
- Leave the untracked `cli/` directory untouched.
- Do not commit or push.

---

### Task 1: Classify Orders And Extract CatalogItem References

**Files:**
- Create: `catalog/api/catalog_order_policy.py`
- Create: `catalog/api/test_catalog_order_policy.py`

**Interfaces:**
- Produces `classify_order_request(method: str, path: str) -> OrderRequest | None`.
- Produces `extract_catalog_item_references(order: OrderRequest, body: object) -> tuple[CatalogItemReference, ...]`.
- Raises `CatalogOrderPolicyError(status, code, reason)` for malformed or inconsistent payloads.

- [ ] **Step 1: Write failing classification and extraction tests**

Cover exact collection POSTs for ResourceClaim, Workshop, WorkshopProvision, SelfPacedLab, SelfPacedLabProvisionItem, and MultiWorkshop. Cover named paths, non-POST methods, unrelated resources, missing labels, provider/spec mismatches, multiple assets, and external assets.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `python3 -m unittest test_catalog_order_policy.TestOrderClassification test_catalog_order_policy.TestReferenceExtraction -v`

Expected: import or assertion failures because the policy module/functions do not exist.

- [ ] **Step 3: Implement exact classification and reference extraction**

Use the existing `audit.parse_k8s_path` parser. Match exact API groups and collection resources. Read labels `babylon.gpte.redhat.com/catalogItemName` and `babylon.gpte.redhat.com/catalogItemNamespace`; cross-check `spec.provider.name` or `spec.catalogItem` where defined. Use `spec.assets[].key` for MultiWorkshop CatalogItem names. Deduplicate references while preserving deterministic order.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `python3 -m unittest test_catalog_order_policy.TestOrderClassification test_catalog_order_policy.TestReferenceExtraction -v`

Expected: PASS.

### Task 2: Enforce Access And Ordering Blocks

**Files:**
- Modify: `catalog/api/catalog_order_policy.py`
- Modify: `catalog/api/test_catalog_order_policy.py`

**Interfaces:**
- Produces `catalog_item_allows_ordering(catalog_item: dict, groups: list[str]) -> bool`.
- Produces `async enforce_catalog_order_policy(method, path, body, session, get_system_status, get_catalog_item) -> None`.

- [ ] **Step 1: Write failing access and async policy tests**

Test unrestricted access, deny precedence, matching allow, view-only rejection, unmatched rejection, admin bypass, both ordering blocks, namespace membership, missing items, all-MultiWorkshop-references behavior, and loader errors.

- [ ] **Step 2: Run the policy tests and verify RED**

Run: `python3 -m unittest test_catalog_order_policy.TestCatalogItemAccess test_catalog_order_policy.TestCatalogOrderPolicy -v`

Expected: missing implementation or incorrect decisions.

- [ ] **Step 3: Implement minimal policy enforcement**

Call the injected strict status loader once per protected request and CatalogItem loader once per unique reference. Treat an absent status ConfigMap as unblocked but propagate status read failures. Return safe policy errors with HTTP status/code/reason; allow expected loader transport exceptions to be translated to service-unavailable by the integration layer.

- [ ] **Step 4: Run policy tests and verify GREEN**

Run: `python3 -m unittest test_catalog_order_policy.TestCatalogItemAccess test_catalog_order_policy.TestCatalogOrderPolicy -v`

Expected: PASS.

### Task 3: Integrate Policy Before Kubernetes Proxy Forwarding

**Files:**
- Modify: `catalog/api/app.py`
- Modify: `catalog/api/test_catalog_order_policy.py`

**Interfaces:**
- Adds a CatalogItem loader backed by `custom_objects_api.get_namespaced_custom_object`.
- Calls `enforce_catalog_order_policy` after reading the body and before `api_client.call_api`.
- Converts policy errors to HTTP 400/403 and Kubernetes infrastructure errors to HTTP 503.
- Audits denials as `catalog_order_denied` without request bodies.

- [ ] **Step 1: Write a failing proxy integration test**

Use an aiohttp-compatible fake request plus patched authentication/session/API clients. Assert a denied policy call prevents `api_client.call_api`, returns the expected aiohttp exception, and emits only safe audit metadata.

- [ ] **Step 2: Run the integration test and verify RED**

Run: `python3 -m unittest test_catalog_order_policy.TestProxyIntegration -v`

Expected: proxy forwards or integration hook is absent.

- [ ] **Step 3: Add the proxy hook and safe error translation**

Read JSON once, execute the policy before forwarding, reuse the parsed body for Kubernetes, and preserve all existing proxy and audit behavior for allowed/non-target requests.

- [ ] **Step 4: Run the integration test and verify GREEN**

Run: `python3 -m unittest test_catalog_order_policy.TestProxyIntegration -v`

Expected: PASS.

### Task 4: Full Verification And Review

**Files:**
- Verify: `catalog/api/catalog_order_policy.py`
- Verify: `catalog/api/test_catalog_order_policy.py`
- Verify: `catalog/api/app.py`

- [x] **Step 1: Run the complete Catalog API unit suite**

Run from `catalog/api`: `python3 -m unittest discover -p 'test_*.py' -v`

Expected: all tests PASS.

- [x] **Step 2: Compile Python sources**

Run from `catalog/api`: `python3 -m compileall -q .`

Expected: exit 0.

- [x] **Step 3: Check the working-copy diff**

Run: `git diff --check`, `jj diff --summary`, and `jj status`.

Expected: only the policy implementation, tests, approved docs, and `app.py` are changed; the untracked CLI directory remains untouched.

- [x] **Step 4: Request independent code review**

Review policy coverage, bypass resistance, compatibility with every protected payload, failure behavior, audit safety, and test quality. Address all P1/P2 findings before completion.
