---
name: catalog-ui-dev
description: >-
  Develop the Babylon catalog React UI (catalog/ui). Covers pnpm/webpack dev
  server, API proxy setup, PatternFly conventions, routes, SWR data fetching,
  and test/lint commands. Use when working on catalog UI, React components,
  webpack, pnpm, or frontend changes in catalog/ui.
---

# Catalog UI Development

## Prerequisites

- **Node.js 22+** (CI uses Node 22; pnpm 11 requires modern Node)
- **pnpm 11** (declared in `catalog/ui/package.json` as `packageManager`)
- **Catalog API running on port 8080** — the UI dev server proxies API calls there

## Local dev workflow

All commands run from `catalog/ui/`:

```bash
pnpm install
pnpm run start:dev    # webpack-dev-server → http://localhost:9000
```

The catalog API must be running separately (see `catalog-api-dev` skill). Webpack proxies `/api`, `/apis`, and `/auth` to `http://localhost:8080` (see `webpack.dev.js`).

## Commands

| Command | Purpose |
|---------|---------|
| `pnpm run start:dev` | Dev server with HMR on :9000 |
| `pnpm run build` | Production webpack build → `dist/` |
| `pnpm run start` | Serve production build on :8080 |
| `pnpm run test` | Jest unit tests |
| `pnpm run lint` | ESLint |
| `pnpm run type-check` | TypeScript (`tsc --noEmit`) |
| `pnpm run format` | Prettier |
| `pnpm run ci-checks` | type-check + lint + test (matches CI intent) |

CI (`.github/workflows/catalog-ui-pr.yaml`) runs `pnpm install --frozen-lockfile && pnpm run test` on Node 22.

## Project layout

```
catalog/ui/
├── src/app/
│   ├── routes.tsx          # React Router route definitions
│   ├── api.ts              # fetcher, apiPaths, API helpers
│   ├── AppLayout/          # Shell layout
│   ├── Dashboard/          # Home
│   ├── Catalog/            # Catalog browse & order
│   ├── Services/           # My Services
│   ├── Admin/              # Anarchy, pools, incidents, ratings, etc.
│   ├── Workshops/          # Workshop management
│   └── MultiWorkshops/     # Multi-workshop flows
├── webpack.dev.js          # Dev server + proxy config
└── package.json
```

## Conventions

### Path alias

TypeScript path alias `@app/*` → `src/app/*` (see `tsconfig.json`). Use it for imports:

```typescript
import Dashboard from '@app/Dashboard';
```

### Routing

Add routes in `src/app/routes.tsx` as `IAppRoute` entries. Use `React.lazy()` for code splitting (existing pattern). Admin routes live under `/admin/*`.

### Data fetching

- Use **SWR** (`swr`, `swr/immutable`, `swr/infinite`) for server state
- Use `fetcher` from `@app/api` for authenticated API calls
- Define new API paths in `apiPaths` object in `@app/api.ts` — do not hardcode URLs in components
- K8s CRD paths use `/apis/babylon.gpte.redhat.com/v1/...` or `/apis/poolboy.gpte.redhat.com/v1/...`
- BFF paths use `/api/...` (proxied through catalog API)

### UI components

- **PatternFly 6** (`@patternfly/react-core`, `@patternfly/react-table`, etc.)
- Co-locate `.spec.tsx` tests with components
- Use existing shared components in `src/app/components/` before creating new ones

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `Invalid host defined options` from pnpm | Upgrade to Node 22+ |
| API calls fail / 401 | Ensure catalog API is running and `oc login` is active |
| `EMFILE: too many open files` | macOS file watcher limit; non-fatal, app still compiles |
| Proxy errors | Confirm API listens on :8080, not another port |

## Build & deploy

See `catalog/Development.adoc` for OpenShift build/deploy:

```bash
oc process -f build-template.yaml | oc apply -f -
oc start-build --follow babylon-catalog-ui --from-dir=..
```
