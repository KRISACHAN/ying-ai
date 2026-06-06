# ying-companion

pnpm + Turborepo monorepo for the ying-companion project.

## Getting Started

```bash
pnpm install
pnpm dev        # run all dev tasks
pnpm build      # build all packages
pnpm typecheck  # typecheck all packages
pnpm lint       # lint all packages
```

## AI Agent Setup

This repo uses **AGENTS.md as the single entry** for all AI tools (Codex, Cursor, Antigravity, Claude Code).

| Start here                                               | Purpose                                      |
| -------------------------------------------------------- | -------------------------------------------- |
| [AGENTS.md](AGENTS.md)                                   | **Single entry** — all tools read this first |
| [docs/ai/README.md](docs/ai/README.md)                   | Full AI onboarding                           |
| [docs/ai/guidance-schema.md](docs/ai/guidance-schema.md) | Extension contract                           |

### By Tool

| Tool        | Adapter                                                                           |
| ----------- | --------------------------------------------------------------------------------- |
| Codex + OMX | [docs/ai/platforms/codex-omx.md](docs/ai/platforms/codex-omx.md) + `.codex/`      |
| Cursor      | [docs/ai/platforms/cursor.md](docs/ai/platforms/cursor.md) + `.cursor/rules/`     |
| Antigravity | [docs/ai/platforms/antigravity.md](docs/ai/platforms/antigravity.md) + `.agents/` |
| Claude Code | [docs/ai/platforms/claude.md](docs/ai/platforms/claude.md)                        |

Universal rules (principles, verification, git protocol) live in [docs/ai/core/](docs/ai/core/).

## Layout

```
apps/web/    @ying-companion/web
apps/api/    @ying-companion/api
packages/    shared packages
docs/ai/     AI agent documentation
```
