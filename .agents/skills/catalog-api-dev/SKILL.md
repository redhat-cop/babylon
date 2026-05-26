# Catalog API Development

Development guide for the Babylon catalog API in `catalog/api/`. Intended for humans and AI coding assistants.

## Overview

The catalog API is an **aiohttp** BFF (backend-for-frontend). It authenticates users, manages sessions, proxies Kubernetes API requests, and integrates with admin, ratings, reporting, and sandbox services.

## Prerequisites

- Python 3 with `venv`
- **`oc login`** to a cluster with Babylon deployed — all K8s access uses your authenticated user
- Catalog UI dev server (optional) proxies to this API on port 8080

## Local setup

From `catalog/api/`:

```bash
python3 -m venv api-venv
. api-venv/bin/activate
pip install -r requirements.txt
```

## Start locally

```bash
oc login --server=<cluster-url>
export BABYLON_NAMESPACE=babylon-config   # or babylon-catalog per README
export ENVIRONMENT=development
export INTERFACE_NAME=rhpds              # optional; filters catalog namespaces
python3 app.py                           # listens on :8080 (aiohttp default)
```

Then start the UI (`pnpm run start:dev` in `catalog/ui`) — it proxies `/api`, `/apis`, `/auth` to `localhost:8080`.

## Key environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `BABYLON_NAMESPACE` | Yes (local) | Babylon config namespace |
| `ENVIRONMENT` | Yes | Set to `development` for local dev |
| `INTERFACE_NAME` | No | Filter namespaces by interface label |
| `REDIS_PASSWORD` | No | Enable Redis session/cache (also `REDIS_SERVER`, `REDIS_PORT`, `REDIS_USER`) |
| `ADMIN_API` | No | Admin service URL (default: in-cluster) |
| `RATINGS_API` | No | Ratings service URL |
| `SALESFORCE_API` | No | Reporting/Salesforce API URL |
| `SANDBOX_API` | No | Sandbox API URL |
| `LOGGING_LEVEL` | No | Default `INFO` |
| `SESSION_LIFETIME` | No | Session TTL in seconds (default 600) |

## Auth in development

When `ENVIRONMENT=development`:
- No `Impersonate-User` headers — API uses the `oc`-authenticated user directly
- User resolved via OpenShift `users/~` if no `X-Forwarded-User` header
- Roles computed from K8s RBAC (admin, userSupport, etc.)

In production, the API impersonates users via session headers.

## Route structure

| Prefix | Handler | Purpose |
|--------|---------|---------|
| `/auth/session` | Session management | Current user, roles, namespaces |
| `/auth/cli-redirect` | CLI auth redirect | |
| `/api/*` | BFF endpoints | Ratings, incidents, Salesforce, workshops, system status |
| `/apis/*` | K8s proxy | CRDs (catalogitems, workshops, resourceclaims, etc.) |

Key files:
- `app.py` — routes, auth, K8s proxy, startup/shutdown
- `hotfix.py` — `HotfixKubeApiClient` wrapper
- `config.py` — gunicorn settings (production)

## Adding endpoints

1. Add route decorator in `app.py`: `@routes.get("/api/...")` or `@routes.post(...)`
2. Use `get_session(request)` for authenticated access
3. Use `proxy_api_client(session)` for K8s calls (respects dev vs prod impersonation)
4. Use `api_proxy()` for downstream HTTP services (admin, ratings, reporting)
5. Add corresponding `apiPaths` entry in `catalog/ui/src/app/api.ts` for UI consumption

## Downstream services

The API calls external services by default using in-cluster DNS. For local dev against remote services, override via env vars:

```bash
export ADMIN_API=https://<admin-route>
export RATINGS_API=https://<ratings-route>
```

Some reporting endpoints require `SALESFORCE_AUTHORIZATION_TOKEN`.

## Startup behavior

`on_startup` in `app.py`:
1. Loads kubeconfig (local) or in-cluster config
2. Requires `BABYLON_NAMESPACE` when running locally
3. Reads OpenShift console URL from `console-public` ConfigMap
4. Optionally connects to Redis if `REDIS_PASSWORD` is set

## Build & deploy

See `catalog/Development.adoc`:

```bash
oc process -f build-template.yaml | oc apply -f -
oc start-build --follow babylon-catalog-api --from-dir=..
```

Helm deploy with image override:

```bash
helm template helm --include-crds \
  --set api.image.override="$(oc get is babylon-catalog-api -o jsonpath='{.status.tags[0].items[0].dockerImageReference}')" \
  ... | oc apply -f -
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `Unable to determine babylon namespace` | Set `BABYLON_NAMESPACE` |
| 401 on all requests | Run `oc login`; check token hasn't expired |
| UI can't reach API | Confirm API on :8080; check webpack proxy in `catalog/ui/webpack.dev.js` |
| Redis errors | Redis is optional locally — omit `REDIS_PASSWORD` or port-forward Redis from cluster |
