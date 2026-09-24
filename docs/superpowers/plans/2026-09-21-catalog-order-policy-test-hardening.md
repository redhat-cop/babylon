# Catalog Order Policy Test Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand regression coverage for Catalog API order policy boundaries and correct the ResourceClaim lookup failure audit mapping exposed by that coverage.

**Architecture:** Extend the existing `test_catalog_order_policy.py` unit and proxy-integration fixtures. Tests exercise the policy module directly where its inputs are deterministic, and the aiohttp proxy boundary where audit logging and CatalogItem visibility must be asserted. ResourceClaim loader transport exceptions become policy errors before reaching the generic CatalogItem loader handler.

**Tech Stack:** Python 3.12, aiohttp, standard-library `unittest` and `unittest.mock`.

**Spec:** `docs/superpowers/specs/2026-09-21-catalog-order-policy-design.md`

## Global Constraints

- Do not alter caching, Kubernetes operators, CRDs, or client payload contracts.
- Ruling: map ResourceClaim loader transport failures to `resource_claim_lookup_failed` — proxy integration coverage showed they were misclassified as CatalogItem failures — the cost of a wrong ruling is only an audit-code mismatch.
- Preserve the administrator bypass and existing ResourceClaim-to-Workshop conversion model.
- Do not include request bodies or parameter values in denial audit records.
- Leave the untracked `cli/` directory untouched.
- Do not commit or push.

---

### Task 1: Policy Boundary Tests

**Files:**
- Modify: `catalog/api/catalog_order_policy.py`
- Modify: `catalog/api/test_catalog_order_policy.py`

**Interfaces:**
- Exercises `classify_order_request`, `extract_catalog_item_references`, and `enforce_catalog_order_policy`.
- Produces regression coverage only; production interfaces remain unchanged.

- [x] **Step 1: Add owner-reference and ResourceClaim lookup tests**

Cover absent, duplicate, wrong-kind, missing-name, and missing-UID ResourceClaim owners. Cover absent callback, 404/`None`, and lookup exception outcomes. Assert the documented 400, 403, or 503 error code and that the normal CatalogItem/status loaders are not used for valid conversion attachment requests.

- [x] **Step 2: Run the new owner-reference tests**

Run: `python3 -m unittest test_catalog_order_policy.TestCatalogOrderPolicy -v`

Expected: all existing and new conversion-policy tests pass.

- [x] **Step 3: Add path, reference, namespace, and status boundary tests**

Cover collection versus named/trailing paths, malformed and duplicate `catalogNamespaces`, non-object MultiWorkshop assets, external assets with irrelevant malformed fields, empty or malformed access-control group lists, non-string session groups, non-dict status values, and blank status messages.

- [x] **Step 4: Run direct policy tests**

Run: `python3 -m unittest test_catalog_order_policy.TestOrderClassification test_catalog_order_policy.TestReferenceExtraction test_catalog_order_policy.TestCatalogItemAccess test_catalog_order_policy.TestCatalogOrderPolicy -v`

Expected: all direct policy tests pass.

### Task 2: Proxy Visibility And Audit Tests

**Files:**
- Modify: `catalog/api/test_catalog_order_policy.py`

**Interfaces:**
- Exercises `openshift_api_proxy` using `FakeRequest`, `FakeApiClient`, and `FakeKubernetesResponse`.
- Asserts filtering through `catalog_item_is_visible`, policy denial audit records, and successful `audit_log_api_action` calls.

- [x] **Step 1: Add CatalogItem list and item visibility integration tests**

Use proxy responses with allowed, view-only, denied, and malformed-access-control CatalogItems. Assert non-admin lists retain only visible entries; non-admin denied single items return 404; administrators receive unfiltered results.

- [x] **Step 2: Add proxy audit and failure tests**

Assert policy-generated 503s and loader transport failures produce one `catalog_order_denied` record, do not call Kubernetes forwarding, and do not emit an `api_action`. Assert an allowed protected POST emits one `api_action` with actor, effective user, method, path, status, and body.

- [x] **Step 3: Run proxy integration tests**

Run: `python3 -m unittest test_catalog_order_policy.TestProxyIntegration -v`

Expected: all proxy integration tests pass.

### Task 3: Full Verification And Review

**Files:**
- Verify: `catalog/api/test_catalog_order_policy.py`

- [x] **Step 1: Run the complete Catalog API unit suite**

Run from `catalog/api`: `python3 -m unittest discover -p 'test_*.py' -v`

Expected: all tests pass.

- [x] **Step 2: Compile Python sources and inspect the diff**

Run from `catalog/api`: `python3 -m compileall -q .`; then from repository root run `git diff --check`, `jj diff --summary`, and `jj status`.

Expected: compilation succeeds; the diff contains the policy implementation, focused ResourceClaim failure mapping, tests, and approved documentation.

- [x] **Step 3: Request independent review**

Review test relevance, expected failure modes, audit assertions, and whether tests preserve the documented ResourceClaim conversion exception.
