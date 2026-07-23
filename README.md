# ying-companion

Enterprise AI companion monorepo — admin backend, user-facing frontend, and a **pluggable AI Companion Core SDK**. Built with pnpm workspaces and Turborepo.

> **Using an AI coding assistant?** See [AGENTS.md](AGENTS.md). This file is for humans.

---

## What & why

The goal is a **pluggable AI companion core** that product apps (admin API + user web) can embed. V1 focuses on the SDK itself — no auth, user accounts, or deployment yet. Scope details: [`.requirements/prompts/02-execution.md`](.requirements/prompts/02-execution.md).

**Current milestone:** **V1.3 is complete** — the V1.0–V1.2 Companion SDK remains compatible, and Story Mode now provides a separate story domain/runtime, PostgreSQL recovery, model-backed planning/rendering, schema-driven state, NDJSON streaming, and a playable/debuggable Story Workbench. Specs: [`.requirements/stages/v1.3/`](.requirements/stages/v1.3/) · Plan: [`.requirements/prompts/06-v1.3-story-mode-plan.md`](.requirements/prompts/06-v1.3-story-mode-plan.md).

---

## Architecture

| Part                  | Path                                                                                                                            | Status                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **AI Core SDK**       | [`packages/ai-core`](packages/ai-core/)                                                                                         | V1.1 — `executeWorkflow()` + `streamWorkflow()`, tool planning, profiles |
| **Ollama adapter**    | [`packages/model-ollama`](packages/model-ollama/)                                                                               | V1.1 — local `ChatModel` adapter                                         |
| **Memory (Postgres)** | [`packages/memory-postgres`](packages/memory-postgres/)                                                                         | V1.0 — pgvector long-term memory                                         |
| **Web Search Tool**   | [`packages/tool-web-search`](packages/tool-web-search/) + [`packages/tool-web-search-tavily`](packages/tool-web-search-tavily/) | V1.2 — provider-neutral search DTO/tool + Tavily adapter                 |
| **Story Core SDK**    | [`packages/story-core`](packages/story-core/)                                                                                   | V1.3 — Story workflow, Lore, planner/renderer, state validation          |
| **Story Postgres**    | [`packages/story-postgres`](packages/story-postgres/)                                                                           | V1.3 — snapshot sessions and atomic turn persistence                     |
| **Debug workbench**   | [`apps/model-runtime-demo`](apps/model-runtime-demo/)                                                                           | V1.3 — Companion chat + playable Story Workbench                         |
| **Product API**       | [`apps/api`](apps/api/)                                                                                                         | Scaffold — planned RBAC backend                                          |
| **Product web**       | [`apps/web`](apps/web/)                                                                                                         | Scaffold — planned user frontend                                         |

```mermaid
flowchart LR
  subgraph product [Product layer - planned]
    Web[apps/web]
    API[apps/api]
  end
  subgraph core [Core SDK]
    AiCore[packages/ai-core]
    StoryCore[packages/story-core]
    Ollama[packages/model-ollama]
  end
  subgraph debug [Debug host]
    Demo[apps/model-runtime-demo]
  end
  Web --> AiCore
  API --> AiCore
  Demo --> AiCore
  Demo --> Ollama
  Demo --> MemoryPostgres[packages/memory-postgres]
  Demo --> StoryCore
  Demo --> StoryPostgres[packages/story-postgres]
```

**Boundary:** `ai-core` is a pure SDK — no env vars, HTTP, NDJSON, or database. The demo app owns provider config, Wire Event mapping, persistence, and UI.

---

## Repository layout

```txt
ying-companion/
├── apps/
│   ├── api/                  @ying-companion/api
│   ├── web/                  @ying-companion/web
│   └── model-runtime-demo/   @ying-companion/model-runtime-demo
├── packages/
│   ├── ai-core/              @ying-companion/ai-core
│   ├── model-ollama/         @ying-companion/model-ollama
│   ├── memory-postgres/      @ying-companion/memory-postgres
│   ├── story-core/           @ying-companion/story-core
│   └── story-postgres/       @ying-companion/story-postgres
├── docs/ai/                  Agent operating rules (see AGENTS.md)
├── .requirements/            Requirements & stage task specs
├── .code-reviews/            Code review archive
├── AGENTS.md                 AI agent entry
└── turbo.json
```

Package READMEs: [ai-core](packages/ai-core/README.md) · [model-ollama](packages/model-ollama/README.md) · [memory-postgres](packages/memory-postgres/README.md) · [story-core](packages/story-core/README.md) · [story-postgres](packages/story-postgres/README.md) · [model-runtime-demo](apps/model-runtime-demo/README.md) · [web](apps/web/README.md) · [api](apps/api/README.md)

---

## Roadmap

**V1.0** (frozen): [`.requirements/prompts/03-v1.0-plan.md`](.requirements/prompts/03-v1.0-plan.md) · [stages](.requirements/stages/v1.0/) · [reviews](.code-reviews/v1.0/)

**V1.1** (complete):

```txt
Stage 1  Persona profile
Stage 2  Stream / Wire contract
Stage 3  Model profiles & tool planning
Stage 4  Workflow step refactor
Stage 5  Streaming workflow
Stage 6  Ollama adapter
Stage 7  Debug workbench (NDJSON)
Stage 8  Documentation & review
```

Full plan: [`.requirements/prompts/04-v1.1-plan.md`](.requirements/prompts/04-v1.1-plan.md) · Stage specs: [`.requirements/stages/v1.1/`](.requirements/stages/v1.1/)

**V1.2** (complete):

```txt
Stage 1  Web Search Tool + Tavily adapter
Stage 2  Demo AI SDK UI, Sources display, docs sync
```

Full plan: [`.requirements/prompts/05-v1.2-plan.md`](.requirements/prompts/05-v1.2-plan.md) · Stage specs: [`.requirements/stages/v1.2/`](.requirements/stages/v1.2/)

**V1.3** (complete):

```txt
Stage 1  Story domain and runtime foundation
Stage 2  Narrative workflow, Lore, and PostgreSQL persistence
Stage 3  Story Workbench and release closure
```

Full plan: [`.requirements/prompts/06-v1.3-story-mode-plan.md`](.requirements/prompts/06-v1.3-story-mode-plan.md) · Stage specs: [`.requirements/stages/v1.3/`](.requirements/stages/v1.3/)

---

## Prerequisites

- Node.js (LTS recommended)
- [pnpm 9](https://pnpm.io/) — version pinned in `package.json` → `packageManager`
- For full debug workbench: local PostgreSQL + pgvector (see demo README)
- For Ollama chat: [Ollama](https://ollama.com/) running locally with a pulled model

---

## Getting started

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm build
```

| Command             | Purpose                                 |
| ------------------- | --------------------------------------- |
| `pnpm dev`          | Run all `dev` tasks via Turbo           |
| `pnpm build`        | Build all packages                      |
| `pnpm typecheck`    | Typecheck the workspace                 |
| `pnpm lint`         | Lint the workspace                      |
| `pnpm format`       | Format with Prettier                    |
| `pnpm format:check` | Check formatting                        |
| `pnpm clean`        | Remove Turbo outputs and `node_modules` |

**Single package:**

```bash
pnpm turbo run typecheck --filter @ying-companion/ai-core
pnpm turbo run lint --filter @ying-companion/model-runtime-demo
```

More commands: [docs/ai/core/project-context.md](docs/ai/core/project-context.md).

---

## Run the Debug Workbench

The Next.js demo hosts both the **Core Workflow Debug Workbench** and the V1.3 **Story Workbench**. The Companion surface covers Persona, memory, emotion, tools, Web Search and Sources; Story Mode adds story selection/import, persistent sessions, streamed narrative, dynamic state, and live/persisted workflow debugging.

```bash
cp apps/model-runtime-demo/.env.example apps/model-runtime-demo/.env
# Set OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL, DATABASE_URL (see demo README)
# Optional Web Search: WEB_SEARCH_ENABLED=true, WEB_SEARCH_BACKEND=tavily, TAVILY_API_KEY, toolCalling=true

pnpm --filter @ying-companion/model-runtime-demo dev
```

Open the URL from the terminal:

- `/` — conversation list; create companions and sessions
- `/conversations/[id]` — **AI SDK UI streaming chat** (chat-first view, composer Web Search switch, composer Debug action, optional Web Search Sources)
- `/companions/new` — Persona config (user address, hobbies, appearance, …)
- `/debug/model-runtime` — legacy model runtime smoke test
- `/stories` — Story Definition registry/import and Story Session entry
- `/stories/[storyId]/sessions/[sessionId]` — playable Story Runtime with state and Debug panels

Full env reference: [apps/model-runtime-demo/README.md](apps/model-runtime-demo/README.md).

### Model providers

| Provider          | Config location                   | Notes                                          |
| ----------------- | --------------------------------- | ---------------------------------------------- |
| OpenAI-compatible | Demo session UI + `.env` defaults | API key only in page memory & POST body        |
| Ollama            | Demo session UI (`host`, `model`) | Requires local Ollama; see model-ollama README |

Embedding for long-term memory remains a **separate** `EmbeddingProvider` (typically OpenAI via `memory-postgres`), independent of the chat provider.

---

## Current limitations (V1.3)

Not in this release:

- User system, auth, multi-tenant isolation, production deployment
- Stop generation, reconnect/resume, WebSocket/SSE as primary transport
- Streaming multi-turn tool loop; token-level output safety
- Ollama embedding provider
- Tavily Extract/Crawl/Map/Research, deep browsing, search history, source persistence
- Story Definition import is process-local; created sessions retain an immutable snapshot, but imported catalog entries disappear after restart
- No visual story authoring studio, story marketplace, branching editor, or Companion Persona/Memory integration with Story Mode

Details: [`.code-reviews/v1.1/conclusion.md`](.code-reviews/v1.1/conclusion.md).

---

## Tech stack

| Layer     | Tools                                                            |
| --------- | ---------------------------------------------------------------- |
| Workspace | pnpm 9, Turborepo, TypeScript                                    |
| Quality   | ESLint 9 (flat config), Prettier, Husky, lint-staged, commitlint |
| AI Core   | Vercel AI SDK (OpenAI-compatible); Ollama npm in `model-ollama`  |
| Debug UI  | Next.js 15, AI SDK UI, NDJSON over POST                          |

---

## Contributing

- **Commits:** conventional format, Chinese messages — [docs/ai/core/git-protocol.md](docs/ai/core/git-protocol.md)
- **Hooks:** Husky runs lint-staged and commitlint on commit
- **Style:** root ESLint + Prettier configs apply workspace-wide

Requirement and design docs are written in **Chinese**; code and paths stay as in the repo.

**Read path:** humans start here → AI tools start at [AGENTS.md](AGENTS.md).
