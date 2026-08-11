# Project Context

## Overview

**ying-ai** is a pnpm + Turborepo monorepo that hosts multiple independent AI apps (`apps/*`) built on shared, reusable AI capabilities and SDKs (`packages/*`). TypeScript, ESLint, Prettier, Husky, and commitlint apply workspace-wide.

**Adding a new app:** create `apps/<name>` with its own `package.json` (`@ying-ai/<name>`) and `README.md`; reuse `packages/*` where it fits, or add a new `packages/<capability-name>` once logic is shared by 2+ apps. No workspace config changes are needed — `pnpm-workspace.yaml` already globs `apps/*` and `packages/*`.

**First app — Companion SDK** (`apps/model-runtime-demo` + `packages/ai-core`, `model-ollama`, `memory-postgres`, `tool-web-search*`, `story-core`, `story-postgres`): **V1.0** delivered the core SDK, Postgres memory, and debug workbench. **V1.1** added Persona, workflow streaming, model profiles, tool planning, Ollama, and NDJSON. **V1.2** added provider-neutral Web Search and an AI SDK UI chat surface. **V1.3** added the independent `story-core` runtime, `story-postgres` persistence, and a playable Story Workbench with live/persisted debug data.

## Layout

```txt
ying-ai/
├── apps/                      # Independent AI apps — one per folder
│   ├── api/                  # @ying-ai/api (scaffold)
│   ├── web/                  # @ying-ai/web (scaffold)
│   └── model-runtime-demo/   # @ying-ai/model-runtime-demo — Companion SDK + Story Mode (first app)
├── packages/                  # Reusable AI capabilities/SDKs — shared across apps
│   ├── ai-core/              # @ying-ai/ai-core
│   ├── model-ollama/         # @ying-ai/model-ollama
│   ├── memory-postgres/      # @ying-ai/memory-postgres
│   ├── tool-web-search/      # @ying-ai/tool-web-search
│   ├── tool-web-search-tavily/ # @ying-ai/tool-web-search-tavily
│   ├── story-core/           # @ying-ai/story-core
│   └── story-postgres/       # @ying-ai/story-postgres
├── docs/ai/                  # AI agent operating rules
├── .requirements/            # Requirement and stage specs (per app; Companion SDK covers v1.0-v1.3)
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
pnpm turbo run build --filter @ying-ai/ai-core
pnpm turbo run typecheck --filter @ying-ai/model-runtime-demo
pnpm turbo run lint --filter @ying-ai/web
```

Or run scripts from the package directory:

```bash
cd apps/web && pnpm typecheck
cd packages/ai-core && pnpm build
```

### V1.2 verification scripts

```bash
pnpm --filter @ying-ai/model-ollama verify:adapter
pnpm --filter @ying-ai/model-runtime-demo verify:stream-contract
pnpm --filter @ying-ai/model-runtime-demo verify:chat-ui-adapter
pnpm --filter @ying-ai/tool-web-search verify:web-search-contract
pnpm --filter @ying-ai/model-runtime-demo verify:web-search-workflow
```

### V1.3 Story verification scripts

```bash
pnpm --filter @ying-ai/story-core verify:story-contract
pnpm --filter @ying-ai/story-core verify:story-workflow
pnpm --filter @ying-ai/story-postgres verify:story-postgres
pnpm --filter @ying-ai/story-postgres verify:story-recovery
pnpm --filter @ying-ai/model-runtime-demo verify:story-stream-contract
pnpm --filter @ying-ai/model-runtime-demo verify:story-ui-adapter
pnpm --filter @ying-ai/model-runtime-demo verify:story-workbench-planner
pnpm --filter @ying-ai/model-runtime-demo verify:story-workbench-data
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
