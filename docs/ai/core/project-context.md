# Project Context

## Overview

**ying-companion** is a pnpm + Turborepo monorepo (TypeScript, ESLint, Prettier, Husky, commitlint).

**V1.0** delivered the core SDK, Postgres memory, and debug workbench. **V1.1** added Persona, workflow streaming, model profiles, tool planning, Ollama, and NDJSON. **V1.2** added provider-neutral Web Search and an AI SDK UI chat surface. **V1.3** adds the independent `story-core` runtime, `story-postgres` persistence, and a playable Story Workbench with live/persisted debug data.

## Layout

```
ying-companion/
├── apps/
│   ├── api/                  # @ying-companion/api
│   ├── web/                  # @ying-companion/web
│   └── model-runtime-demo/   # @ying-companion/model-runtime-demo (Companion + V1.3 Story Workbench)
├── packages/
│   ├── ai-core/              # @ying-companion/ai-core
│   ├── model-ollama/         # @ying-companion/model-ollama (V1.1)
│   ├── memory-postgres/      # @ying-companion/memory-postgres
│   ├── tool-web-search/      # @ying-companion/tool-web-search
│   ├── tool-web-search-tavily/ # @ying-companion/tool-web-search-tavily
│   ├── story-core/           # @ying-companion/story-core
│   └── story-postgres/       # @ying-companion/story-postgres
├── docs/ai/                  # AI agent operating rules
├── .requirements/            # Requirement and stage specs (v1.0 through v1.3)
├── .code-reviews/            # Code review archive
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

### V1.2 verification scripts

```bash
pnpm --filter @ying-companion/model-ollama verify:adapter
pnpm --filter @ying-companion/model-runtime-demo verify:stream-contract
pnpm --filter @ying-companion/model-runtime-demo verify:chat-ui-adapter
pnpm --filter @ying-companion/tool-web-search verify:web-search-contract
pnpm --filter @ying-companion/model-runtime-demo verify:web-search-workflow
```

### V1.3 Story verification scripts

```bash
pnpm --filter @ying-companion/story-core verify:story-contract
pnpm --filter @ying-companion/story-core verify:story-workflow
pnpm --filter @ying-companion/story-postgres verify:story-postgres
pnpm --filter @ying-companion/story-postgres verify:story-recovery
pnpm --filter @ying-companion/model-runtime-demo verify:story-stream-contract
pnpm --filter @ying-companion/model-runtime-demo verify:story-ui-adapter
pnpm --filter @ying-companion/model-runtime-demo verify:story-workbench-planner
pnpm --filter @ying-companion/model-runtime-demo verify:story-workbench-data
```

## Nested Agent Context

- [`packages/ai-core/README.md`](../../../packages/ai-core/README.md) — Core SDK, streaming contract
- [`packages/model-ollama/README.md`](../../../packages/model-ollama/README.md) — Ollama adapter
- [`packages/memory-postgres/README.md`](../../../packages/memory-postgres/README.md) — Postgres memory
- [`packages/story-core/README.md`](../../../packages/story-core/README.md) — Story domain and workflow
- [`packages/story-postgres/README.md`](../../../packages/story-postgres/README.md) — Story persistence
- [`apps/model-runtime-demo/README.md`](../../../apps/model-runtime-demo/README.md) — AI SDK UI + NDJSON debug workbench
- [`apps/web/README.md`](../../../apps/web/README.md) — web app specifics
- [`apps/api/README.md`](../../../apps/api/README.md) — API specifics

## Current architecture (summary)

| Layer             | Responsibility                                                             |
| ----------------- | -------------------------------------------------------------------------- |
| `ai-core`         | `executeWorkflow` / `streamWorkflow`, Core events                          |
| `model-ollama`    | Ollama `ChatModel` adapter                                                 |
| `memory-postgres` | Long-term memory + embedding (host-injected)                               |
| Web Search        | Provider-neutral `web_search` tool + Tavily adapter                        |
| `story-core`      | Story Definition/State, Lore, Planner/Renderer, validator, workflow events |
| `story-postgres`  | Definition Snapshot, atomic committed turns, recovery                      |
| Demo              | Companion and Story Wire mapping, NDJSON, persistence, UI and debug panels |

Stream lifecycle and Wire boundary details: [`model-provider-strategy.md`](../model-provider-strategy.md) · demo [`chat-stream-wire.ts`](../../../apps/model-runtime-demo/app/lib/chat-stream-wire.ts). UI adaptation lives in [`chat-stream-ui-adapter.ts`](../../../apps/model-runtime-demo/app/lib/chat-stream-ui-adapter.ts) and [`demo-chat-transport.ts`](../../../apps/model-runtime-demo/app/lib/demo-chat-transport.ts).

## Tech Stack

- **Package manager:** pnpm 9.x (workspace)
- **Build orchestration:** Turborepo
- **Language:** TypeScript (ES modules)
- **Linting:** ESLint 9 flat config + typescript-eslint
- **Formatting:** Prettier
- **Git hooks:** Husky + lint-staged + commitlint (conventional commits)
