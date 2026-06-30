# Project Context

## Overview

**ying-companion** is a pnpm + Turborepo monorepo (TypeScript, ESLint, Prettier, Husky, commitlint).

**V1.0** delivered the core SDK, Postgres memory, and debug workbench (non-streaming). **V1.1** adds Persona profile fields, `streamWorkflow()`, model capability profiles, tool planning, `packages/model-ollama`, and NDJSON streaming in the demo.

## Layout

```
ying-companion/
├── apps/
│   ├── api/                  # @ying-companion/api
│   ├── web/                  # @ying-companion/web
│   └── model-runtime-demo/   # @ying-companion/model-runtime-demo (V1.1 NDJSON workbench)
├── packages/
│   ├── ai-core/              # @ying-companion/ai-core
│   ├── model-ollama/         # @ying-companion/model-ollama (V1.1)
│   └── memory-postgres/      # @ying-companion/memory-postgres
├── docs/ai/                  # AI agent operating rules
├── .requirements/            # Requirement and stage specs (v1.0 + v1.1)
├── .code-reviews/            # Code review archive (v1.0 + v1.1)
├── .codex/                   # Codex / OMX project scope
└── turbo.json                # Turborepo task graph
```

## Root Commands

| Command             | Purpose                              |
| ------------------- | ------------------------------------ |
| `pnpm install`      | Install workspace dependencies       |
| `pnpm dev`          | Run all dev tasks via Turbo          |
| `pnpm build`        | Build all packages                   |
| `pnpm typecheck`    | Typecheck all packages               |
| `pnpm lint`         | Lint all packages                    |
| `pnpm format`       | Prettier write                       |
| `pnpm format:check` | Prettier check                       |
| `pnpm clean`        | Clean turbo outputs and node_modules |

## Package-Scoped Commands

Use Turbo filters to target a single package:

```bash
pnpm turbo run build --filter @ying-companion/ai-core
pnpm turbo run typecheck --filter @ying-companion/model-runtime-demo
pnpm turbo run lint --filter @ying-companion/web
```

Or run scripts from the package directory:

```bash
cd apps/web && pnpm typecheck
cd packages/ai-core && pnpm build
```

### V1.1 verification scripts

```bash
pnpm --filter @ying-companion/model-ollama verify:adapter
pnpm --filter @ying-companion/model-runtime-demo verify:stream-contract
```

## Nested Agent Context

- [`packages/ai-core/README.md`](../../../packages/ai-core/README.md) — Core SDK, streaming contract
- [`packages/model-ollama/README.md`](../../../packages/model-ollama/README.md) — Ollama adapter
- [`packages/memory-postgres/README.md`](../../../packages/memory-postgres/README.md) — Postgres memory
- [`apps/model-runtime-demo/README.md`](../../../apps/model-runtime-demo/README.md) — NDJSON debug workbench
- [`apps/web/README.md`](../../../apps/web/README.md) — web app specifics
- [`apps/api/README.md`](../../../apps/api/README.md) — API specifics

## V1.1 architecture (summary)

| Layer             | Responsibility                                    |
| ----------------- | ------------------------------------------------- |
| `ai-core`         | `executeWorkflow` / `streamWorkflow`, Core events |
| `model-ollama`    | Ollama `ChatModel` adapter                        |
| `memory-postgres` | Long-term memory + embedding (host-injected)      |
| Demo              | Wire mapping, NDJSON, persistence, UI             |

Stream lifecycle and Wire boundary details: [`model-provider-strategy.md`](../model-provider-strategy.md) · demo [`chat-stream-wire.ts`](../../../apps/model-runtime-demo/app/lib/chat-stream-wire.ts).

## Tech Stack

- **Package manager:** pnpm 9.x (workspace)
- **Build orchestration:** Turborepo
- **Language:** TypeScript (ES modules)
- **Linting:** ESLint 9 flat config + typescript-eslint
- **Formatting:** Prettier
- **Git hooks:** Husky + lint-staged + commitlint (conventional commits)
