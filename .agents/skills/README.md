# Agent Skills

Canonical, tool-agnostic skills for the Babylon project. Cursor loads `.agents/skills/` automatically; Claude Code and other agents can use the same paths.

## Skills

| Skill | Scope |
|-------|-------|
| [catalog-ui-dev](catalog-ui-dev/SKILL.md) | React/PatternFly UI in `catalog/ui` |
| [catalog-api-dev](catalog-api-dev/SKILL.md) | aiohttp API in `catalog/api` |
| [autocommit](autocommit/SKILL.md) | Semantic conventional commits (`/autocommit` in Cursor) |

## PatternFly AI helpers

Babylon skills cover this repo’s conventions. For upstream PatternFly React standards, tests, and migration checks, install [patternfly/ai-helpers](https://github.com/patternfly/ai-helpers) locally (see [AGENTS.md](../../AGENTS.md#patternfly-ai-helpers-install-locally)).

## Related documentation

- [AGENTS.md](../../AGENTS.md) — repository-wide agent instructions
- [catalog/Development.adoc](../../catalog/Development.adoc) — build and deploy catalog UI/API
- [docs/Deploying_Babylon.adoc](../../docs/Deploying_Babylon.adoc) — full platform deployment
