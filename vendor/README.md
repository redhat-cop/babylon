# Vendored dependencies

## patternfly-ai-helpers

Git submodule: [patternfly/ai-helpers](https://github.com/patternfly/ai-helpers) — PatternFly AI plugins (skills and agents) for Cursor and Claude Code.

After cloning Babylon, initialize submodules:

```bash
git submodule update --init vendor/patternfly-ai-helpers
```

Cursor discovers plugins via [`.cursor-plugin/marketplace.json`](../.cursor-plugin/marketplace.json) at the repository root. Claude Code can use the same plugins from this repo or install from the upstream marketplace:

```bash
/plugin marketplace add patternfly/ai-helpers
/plugin install react@ai-helpers
```

To bump the submodule to a newer upstream commit:

```bash
cd vendor/patternfly-ai-helpers
git fetch origin && git checkout main && git pull
cd ../..
git add vendor/patternfly-ai-helpers
```

For component docs in the editor, also consider the [PatternFly MCP server](https://github.com/patternfly/patternfly-mcp).
