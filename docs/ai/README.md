# AI Agent Documentation

Master onboarding for AI agents working in **ying-companion**.

## Quick Start

1. Read root [AGENTS.md](../../AGENTS.md) — cross-tool entry wizard
2. Apply universal rules from [core/](core/)
3. Load your platform adapter (see below)

## Universal Rules (all tools)

| Topic                | File                                                     |
| -------------------- | -------------------------------------------------------- |
| Operating principles | [core/principles.md](core/principles.md)                 |
| Working agreements   | [core/working-agreements.md](core/working-agreements.md) |
| Verification         | [core/verification.md](core/verification.md)             |
| Git / Lore commits   | [core/git-protocol.md](core/git-protocol.md)             |
| Monorepo commands    | [core/project-context.md](core/project-context.md)       |

## Platform Adapters

All tools start from root [AGENTS.md](../../AGENTS.md). Platform files add tool-specific behavior only.

| Tool            | Adapter doc                                          | Native assets    |
| --------------- | ---------------------------------------------------- | ---------------- |
| **Codex + OMX** | [platforms/codex-omx.md](platforms/codex-omx.md)     | `.codex/`        |
| **Cursor**      | [platforms/cursor.md](platforms/cursor.md)           | `.cursor/rules/` |
| **Antigravity** | [platforms/antigravity.md](platforms/antigravity.md) | `.agents/`       |
| **Claude Code** | [platforms/claude.md](platforms/claude.md)           | —                |

## Nested Package Context

When working in a specific app, read the nearest nested `AGENTS.md`:

- [apps/web/AGENTS.md](../../apps/web/AGENTS.md)
- [apps/api/AGENTS.md](../../apps/api/AGENTS.md)

## Extension

See [guidance-schema.md](guidance-schema.md) for how to add platforms, skills, and nested context.

## Architecture

```
AGENTS.md                    ← single entry (all tools)
    ├── docs/ai/core/        ← universal rules
    ├── docs/ai/platforms/   ← per-tool adapters
    ├── .codex/              ← Codex/OMX native assets
    ├── .cursor/rules/       ← Cursor adapter
    └── .agents/             ← Antigravity adapter
```
