# Agent Instructions

This file provides context for AI coding assistants working in the Babylon repository.

## Project overview

Babylon is Red Hat GPTE's self-service platform for catalog items, workshops, and lab environments on OpenShift. The main user-facing stack lives under `catalog/` (React UI + aiohttp API). Operators, Helm charts, and deployment docs cover the rest of the platform.

## Development skills

Follow these skills when working on catalog components:

- **Catalog UI** (`catalog/ui`): [.agents/skills/catalog-ui-dev/SKILL.md](.agents/skills/catalog-ui-dev/SKILL.md)
- **Catalog API** (`catalog/api`): [.agents/skills/catalog-api-dev/SKILL.md](.agents/skills/catalog-api-dev/SKILL.md)

## AI layout in this repo

| Path | Purpose |
|------|---------|
| [AGENTS.md](AGENTS.md) | Entry point for any coding agent |
| [.agents/skills/](.agents/skills/) | Project skills (tool-agnostic; Cursor, Claude Code, and others load this) |
| [.cursor/commands/](.cursor/commands/) | Optional Cursor-only slash commands |

Do not duplicate skills under `.cursor/skills/` — Cursor discovers `.agents/skills/` directly.

## PatternFly AI helpers (install locally)

For `catalog/ui` work, install [patternfly/ai-helpers](https://github.com/patternfly/ai-helpers) from upstream (not vendored in this repo). Prioritize the **react** and **migration** plugins.

**Cursor:** add the `patternfly/ai-helpers` plugin marketplace in Cursor settings, then enable the plugins you need.

**Claude Code:**

```text
/plugin marketplace add patternfly/ai-helpers
/plugin install react@ai-helpers
```

Optional: [PatternFly MCP server](https://github.com/patternfly/patternfly-mcp) for component docs in the editor.

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
