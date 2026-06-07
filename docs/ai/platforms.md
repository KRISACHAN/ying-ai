# Platform Adapters

All AI tools share the same operating contract in this repo. Requirements do not differ by IDE — only **where native assets live** does.

## Read Path

```txt
1. AGENTS.md
2. docs/ai/core/          ← universal rules (all tools)
3. docs/ai/oh-my-codex.md ← OMX orchestration (when using .codex/ — all tools)
4. Native tool assets     ← see table below
5. .requirements/ | apps/*/README.md | .code-reviews/   ← task context
```

**Precedence:** user prompt → nearest package `README.md` → `AGENTS.md` → `docs/ai/core/` → `docs/ai/oh-my-codex.md` (when `.codex/` applies) → native tool assets. Details: [guidance-schema.md](guidance-schema.md).

Do **not** duplicate `docs/ai/core/` rules in native files — link instead.

---

## Tool Map

| Tool            | Repo entry redirect                      | Native assets                                                                                | Orchestration doc                                               |
| --------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| **Cursor**      | —                                        | [`.cursor/rules/`](../../.cursor/rules/)                                                     | [oh-my-codex.md](oh-my-codex.md) when invoking `.codex/` skills |
| **Codex + OMX** | —                                        | [`.codex/`](../../.codex/) — `skills/`, `agents/`, `prompts/`                                | [oh-my-codex.md](oh-my-codex.md)                                |
| **Antigravity** | [GEMINI.md](../../GEMINI.md) → AGENTS.md | [`.agents/skills/`](../../.agents/skills/), [`.agents/workflows/`](../../.agents/workflows/) | [oh-my-codex.md](oh-my-codex.md) when invoking `.codex/` skills |
| **Claude Code** | [CLAUDE.md](../../CLAUDE.md) → AGENTS.md | —                                                                                            | [oh-my-codex.md](oh-my-codex.md) when invoking `.codex/` skills |

When editing under `apps/` or `packages/`, read the nearest package `README.md`.

**`.codex/` has no README** — orchestration lives in [oh-my-codex.md](oh-my-codex.md); skills/agents/prompts stay under `.codex/`.

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

| Platform           | Where to add                                              | Document in                                   |
| ------------------ | --------------------------------------------------------- | --------------------------------------------- |
| Codex / OMX        | `.codex/skills/<name>/SKILL.md`                           | [oh-my-codex.md](oh-my-codex.md) + this table |
| Cursor             | `.cursor/rules/<name>.mdc` or `.cursor/skills/`           | This file (tool table)                        |
| Antigravity        | `.agents/skills/<name>.md`, `.agents/workflows/<name>.md` | This file (tool table)                        |
| Universal behavior | `docs/ai/core/<topic>.md` only                            | — no tool syntax                              |

## Adding a New Tool

1. Add a `.<tool>/` native directory (or document that the tool uses AGENTS.md only).
2. Add a row to the tool table above and to [AGENTS.md](../../AGENTS.md).
3. Optional repo-root redirect file (e.g. `CLAUDE.md` → `AGENTS.md`).
