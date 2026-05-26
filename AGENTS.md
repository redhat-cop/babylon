# Agent Instructions

This file provides context for AI coding assistants working in the Babylon repository.

## Project overview

Babylon is Red Hat GPTE's self-service platform for catalog items, workshops, and lab environments on OpenShift. The main user-facing stack lives under `catalog/` (React UI + aiohttp API). Operators, Helm charts, and deployment docs cover the rest of the platform.

## Development skills

Follow these skills when working on catalog components:

- **Catalog UI** (`catalog/ui`): [.agents/skills/catalog-ui-dev/SKILL.md](.agents/skills/catalog-ui-dev/SKILL.md)
- **Catalog API** (`catalog/api`): [.agents/skills/catalog-api-dev/SKILL.md](.agents/skills/catalog-api-dev/SKILL.md)

## Local development quick start

1. `oc login` to a cluster with Babylon deployed
2. Start the catalog API from `catalog/api/` (port 8080)
3. Start the catalog UI from `catalog/ui/` with `pnpm run start:dev` (port 9000, proxies to API)

## Conventions

- Match existing code style and patterns in each component
- UI: PatternFly 6, SWR, `@app/*` path alias, routes in `src/app/routes.tsx`
- API: aiohttp routes in `app.py`, env vars for local dev (`ENVIRONMENT=development`, `BABYLON_NAMESPACE`)
- Do not commit secrets, `.env` files, or local tool caches (e.g. `.pnpm-store/`)

## Further reading

- [.agents/skills/](.agents/skills/) — component development skills
- [catalog/Development.adoc](catalog/Development.adoc) — catalog build and deploy
- [docs/Deploying_Babylon.adoc](docs/Deploying_Babylon.adoc) — platform deployment
