# CatalogItem Raw Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore shared CatalogItem GET caching without sharing user-filtered responses.

**Architecture:** The explicit CatalogItem proxy routes authorize the requester before reading a cache of raw Kubernetes responses fetched through `app_api_client`. Each request parses a fresh copy of the cached payload, applies CatalogItem visibility based on the current session, removes managed fields, and creates its own gzip response.

**Tech Stack:** Python 3.12, aiohttp, kubernetes-asyncio, standard-library `unittest` and `unittest.mock`.

**Spec:** `docs/superpowers/specs/2026-09-21-catalog-order-policy-design.md`

## Global Constraints

- Cache only successful raw GET responses from the non-impersonated application client.
- Require current impersonated Kubernetes `list` or named `get` access, plus session catalog namespace authorization, before any cache read or Kubernetes request.
- Cache keys include request path, query parameters, and forwarded `Accept` header.
- Never cache or return a filtered, user-specific response.
- Ruling: retain the existing 60-second TTL for ACL freshness; the product owner accepted that bounded delay.
- Bound cache capacity with `RESPONSE_CACHE_MAX_ENTRIES`; a nonpositive value disables the cache.
- Bound raw cache bytes with `RESPONSE_CACHE_MAX_BYTES` and concurrent cache fills with `RESPONSE_CACHE_MAX_IN_FLIGHT`; expose all cache limits through Helm.
- Preserve current CatalogItem visibility, admin bypass, managed-field stripping, headers, gzip encoding, and HTTP behavior.
- Leave generic Kubernetes proxy routes, Kubernetes operators, CRDs, and client payload contracts unchanged.
- Leave the untracked `cli/` directory untouched.
- Do not commit or push.

---

### Task 1: Cache Raw CatalogItem Responses

**Files:**
- Modify: `catalog/api/app.py`
- Modify: `catalog/api/test_catalog_order_policy.py`
- Modify: `helm/templates/catalog/interfaces/api/deployment.yaml`
- Modify: `helm/values.yaml`

**Interfaces:**
- The two explicit CatalogItem GET routes continue to call `openshift_api_proxy_with_cache(request)`.
- Uses `app_api_client.call_api(..., _preload_content=False)` for raw cache misses.
- Produces a user-filtered `aiohttp.web.Response` without invoking `proxy_api_client`.

- [x] **Step 1: Write failing cache integration tests**

Add tests that prove a first authorized CatalogItem list request calls `app_api_client` once; a second request with different groups reuses the raw cache but gets a different filtered list; a denied namespace does not access the cache/client; and an administrator receives unfiltered items from the same cached raw payload.

- [x] **Step 2: Run the cache tests and verify RED**

Run: `/tmp/opencode/babylon-catalog-api-venv/bin/python -m unittest test_catalog_order_policy.TestProxyIntegration -v`

Expected: cache assertions fail because the route delegates to the impersonated generic proxy and does not cache raw data.

- [x] **Step 3: Implement the minimal raw response cache**

Add helpers to construct a canonical cache key and load a successful raw response through `app_api_client`. Store immutable raw body bytes, status, headers, and timestamp in `response_cache`; preserve the existing expiry cleaner. In `openshift_api_proxy_with_cache`, authorize namespace, load raw data, parse/filter a fresh JSON value, strip managed fields, and build a gzip response with unsafe upstream representation headers removed.

- [x] **Step 4: Run cache integration tests and verify GREEN**

Run: `/tmp/opencode/babylon-catalog-api-venv/bin/python -m unittest test_catalog_order_policy.TestProxyIntegration -v`

Expected: all proxy integration tests pass.

### Task 2: Full Verification And Review

**Files:**
- Verify: `catalog/api/app.py`
- Verify: `catalog/api/test_catalog_order_policy.py`

- [x] **Step 1: Run the complete Catalog API unit suite**

Run from `catalog/api`: `/tmp/opencode/babylon-catalog-api-venv/bin/python -m unittest discover -p 'test_*.py' -v`

Expected: all tests pass.

- [x] **Step 2: Compile Python sources and inspect the diff**

Run from `catalog/api`: `/tmp/opencode/babylon-catalog-api-venv/bin/python -m compileall -q .`; then from repository root run `git diff --check`, `jj diff --summary`, and `jj status`.

Expected: compilation succeeds; the diff contains the CatalogItem raw cache, its tests, and approved documentation.

- [x] **Step 3: Request independent review**

Review cache key isolation, namespace authorization ordering, use of the service-account client, response header handling, cache expiration, and per-request visibility filtering.
