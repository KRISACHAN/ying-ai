# Platform Adapters

All AI tools share the same operating contract in this repo. Requirements do not differ by IDE — only **where native assets live** does.

## Read Path

```txt
1. AGENTS.md
2. docs/ai/core/          ← universal rules (all tools)
3. .agents/rules/         ← project rules (canonical)
4. Native tool assets     ← see table below
5. .requirements/ | apps/*/README.md | .code-reviews/   ← task context
```

**Precedence:** user prompt → nearest package `README.md` → `AGENTS.md` → `docs/ai/core/` → `.agents/rules/` → native tool assets. Details: [guidance-schema.md](guidance-schema.md).

Do **not** duplicate `docs/ai/core/` rules in native files — link instead.

---

## Tool Map

| Tool            | Repo entry redirect                      | Native assets                                                                                                                          |
| --------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Codex**       | —                                        | [`.codex/rules/`](../../.codex/rules/) (→ `.agents/rules/`), [`.codex/skills/`](../../.codex/skills/)                                  |
| **Cursor**      | —                                        | [`.cursor/rules/`](../../.cursor/rules/) → `.agents/rules/`                                                                            |
| **Claude Code** | [CLAUDE.md](../../CLAUDE.md) → AGENTS.md | [`.claude/CLAUDE.md`](../../.claude/CLAUDE.md), [`.claude/rules/`](../../.claude/rules/), [`.claude/skills/`](../../.claude/skills/)   |
| **Antigravity** | [GEMINI.md](../../GEMINI.md) → AGENTS.md | [`.agents/rules/`](../../.agents/rules/), [`.agents/skills/`](../../.agents/skills/), [`.agents/workflows/`](../../.agents/workflows/) |

When editing under `apps/` or `packages/`, read the nearest package `README.md`.

**Canonical project rules** live in [`.agents/rules/`](../../.agents/rules/). Tool adapters: Codex (`.codex/rules/`), Cursor (`.cursor/rules/*.mdc`), Claude Code (`.claude/rules/*.md` with optional `paths` frontmatter).

**Shared skills** (`code-review`, `code-review-followup`, `git-commit`) live in [`.agents/skills/`](../../.agents/skills/) and [`.claude/skills/`](../../.claude/skills/).

---

## Shared Behavior (all tools)

- Follow [verification.md](core/verification.md) before claiming completion.
- Follow [git-protocol.md](core/git-protocol.md) when creating commits (only when requested).
- Use [project-context.md](core/project-context.md) for monorepo commands.
- Bounded parallel work (subagents / delegation) is allowed when it improves quality; verify output before claiming done.

**IDE modes** (Cursor and similar): Agent = implement; Plan = read-only until user confirms; Ask = explore without edits.

**MCP:** Configure per user in tool settings. If MCP is unavailable, state the gap and use CLI or other safe fallbacks.

---

## Adding Native Assets

| Platform           | Where to add                                                          | Document in                                                |
| ------------------ | --------------------------------------------------------------------- | ---------------------------------------------------------- |
| All tools (rules)  | `.agents/rules/<name>.md` (canonical)                                 | This file + [AGENTS.md](../../AGENTS.md)                   |
| Codex              | `.codex/rules/<name>.md` (adapter), `.codex/skills/<name>/SKILL.md`   | This file (tool table)                                     |
| Cursor             | `.cursor/rules/<name>.mdc` (adapter → `.agents/rules/`)               | This file (tool table)                                     |
| Claude Code        | `.claude/rules/<name>.md` (adapter), `.claude/skills/<name>/SKILL.md` | This file + [`.claude/CLAUDE.md`](../../.claude/CLAUDE.md) |
| Antigravity        | `.agents/skills/<name>/SKILL.md`, `.agents/workflows/<name>.md`       | This file (tool table)                                     |
| Universal behavior | `docs/ai/core/<topic>.md` only                                        | — no tool syntax                                           |

## Adding a New Tool

1. Add a `.<tool>/` native directory (or document that the tool uses AGENTS.md only).
2. Add a row to the tool table above and to [AGENTS.md](../../AGENTS.md).
3. Optional repo-root redirect file (e.g. `CLAUDE.md` → `AGENTS.md`).
