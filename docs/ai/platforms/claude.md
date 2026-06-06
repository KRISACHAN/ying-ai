# Claude Code

Claude Code adapter for ying-companion. **Entry is root [AGENTS.md](../../AGENTS.md) only** — no separate `CLAUDE.md`.

## Entry Points

| Surface          | Path                         |
| ---------------- | ---------------------------- |
| **Single entry** | [AGENTS.md](../../AGENTS.md) |
| Platform adapter | This file                    |
| Universal rules  | [docs/ai/core/](../core/)    |

## Session Startup

Claude Code reads project `AGENTS.md` (cross-tool standard). Then load:

1. [docs/ai/core/](../core/) for universal rules
2. This file for Claude-specific notes
3. Nearest nested `AGENTS.md` when working in `apps/web/` or `apps/api/`

## Behavior

- Follow [principles.md](../core/principles.md) and [verification.md](../core/verification.md) for all sessions.
- Follow [git-protocol.md](../core/git-protocol.md) when creating commits (only when requested).
- Use [project-context.md](../core/project-context.md) for monorepo commands.

## Subagents

Claude Code supports subagent delegation for bounded parallel tasks. Keep subagents scoped and verify their output before claiming completion.

## External Advisor (OMX)

The OMX `$ask` skill can invoke local Claude CLI (`claude -p`) for advisory artifacts saved under `.omx/artifacts/`. This is separate from Claude Code IDE sessions.

## Adding Claude Rules

- Universal behavior → `docs/ai/core/`
- Claude-only behavior → this file
- Do not add root-level `CLAUDE.md` — keep the single entry at `AGENTS.md`
