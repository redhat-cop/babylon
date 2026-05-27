# Agent Skills

Tool-agnostic development skills for the Babylon project. These guides work for humans and AI coding assistants (Cursor, GitHub Copilot, Claude Code, etc.).

## Skills

| Skill | Scope |
|-------|-------|
| [catalog-ui-dev](catalog-ui-dev/SKILL.md) | React/PatternFly UI in `catalog/ui` |
| [catalog-api-dev](catalog-api-dev/SKILL.md) | aiohttp API in `catalog/api` |

## PatternFly AI helpers

For PatternFly React work in `catalog/ui`, prefer the vendored **react** and **migration** plugins from [patternfly/ai-helpers](https://github.com/patternfly/ai-helpers) (see [.cursor-plugin/marketplace.json](../../.cursor-plugin/marketplace.json)). Babylon-specific conventions remain in `catalog-ui-dev` above.

## Related documentation

- [AGENTS.md](../../AGENTS.md) — repository-wide agent instructions
- [vendor/README.md](../../vendor/README.md) — submodule setup for AI helpers
- [catalog/Development.adoc](../../catalog/Development.adoc) — build and deploy catalog UI/API
- [docs/Deploying_Babylon.adoc](../../docs/Deploying_Babylon.adoc) — full platform deployment
