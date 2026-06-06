# Cursor

Cursor-specific adapter for ying-companion.

## Entry Points

| Surface          | Path                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------ |
| **Single entry** | [AGENTS.md](../../AGENTS.md)                                                         |
| Always-on rules  | [`.cursor/rules/00-ai-guide.mdc`](../../.cursor/rules/00-ai-guide.mdc)               |
| App-scoped rules | [`.cursor/rules/10-project-context.mdc`](../../.cursor/rules/10-project-context.mdc) |
| Universal rules  | [docs/ai/core/](../core/)                                                            |

## Rules Map

Cursor loads `.cursor/rules/*.mdc` automatically. These rules **link to** `docs/ai/core/` — they do not duplicate universal content.

| Rule file                | Scope               | Purpose                                  |
| ------------------------ | ------------------- | ---------------------------------------- |
| `00-ai-guide.mdc`        | `alwaysApply: true` | Points agents to core docs and AGENTS.md |
| `10-project-context.mdc` | `apps/**`           | Monorepo layout and nested AGENTS.md     |

## Modes

- **Agent mode:** Full tool access for implementation. Follow [verification.md](../core/verification.md) before claiming completion.
- **Plan mode:** Read-only planning. Do not edit files unless the user confirms the plan.
- **Ask mode:** Read-only exploration. Answer questions without making changes.

## MCP Servers

Configure MCP servers in Cursor Settings. Project-relevant servers may include Context7 (library docs), browser automation, and others configured per user.

When MCP tools are unavailable, state what could not be done and use CLI or web fallbacks where safe.

## Nested Context

When editing files under `apps/web/` or `apps/api/`, also read the nearest nested `AGENTS.md` in that package.

## Adding Cursor Rules

1. Create `.cursor/rules/<name>.mdc` with frontmatter (`description`, `globs`, `alwaysApply`)
2. Link to `docs/ai/core/` — do not copy universal rules
3. Document the rule in this file
