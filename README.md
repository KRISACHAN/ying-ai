# ying-companion

Enterprise AI companion monorepo — admin backend, user-facing frontend, and a **pluggable AI Companion Core SDK**. Built with pnpm workspaces and Turborepo.

> **Using an AI coding assistant?** See [AGENTS.md](AGENTS.md). This file is for humans.

---

## What & why

The goal is a **pluggable AI companion core** that product apps (admin API + user web) can embed. V1 focuses on the SDK itself — no auth, user accounts, or deployment yet. Scope details: [`.requirements/prompts/02-execution.md`](.requirements/prompts/02-execution.md).

**Current milestone:** [Stage 1 — Model Runtime](.requirements/stages/stage-01/01-model-runtime.md).

---

## Architecture

| Part                  | Path                                                  | Status                                                         |
| --------------------- | ----------------------------------------------------- | -------------------------------------------------------------- |
| **AI Core SDK**       | [`packages/ai-core`](packages/ai-core/)               | Stage 1 done — Model Runtime (generate/stream, retry/fallback) |
| **Runtime debug app** | [`apps/model-runtime-demo`](apps/model-runtime-demo/) | Next.js app to exercise Stage 1 locally                        |
| **Product API**       | [`apps/api`](apps/api/)                               | Scaffold — planned RBAC backend                                |
| **Product web**       | [`apps/web`](apps/web/)                               | Scaffold — planned user frontend                               |

```mermaid
flowchart LR
  subgraph product [Product layer - planned]
    Web[apps/web]
    API[apps/api]
  end
  subgraph core [Core SDK - V1 focus]
    AiCore[packages/ai-core]
  end
  subgraph debug [Verification]
    Demo[apps/model-runtime-demo]
  end
  Web --> AiCore
  API --> AiCore
  Demo --> AiCore
```

---

## Repository layout

```txt
ying-companion/
├── apps/
│   ├── api/                  @ying-companion/api
│   ├── web/                  @ying-companion/web
│   └── model-runtime-demo/   @ying-companion/model-runtime-demo
├── packages/
│   └── ai-core/              @ying-companion/ai-core
├── docs/ai/                  Agent operating rules (see AGENTS.md)
├── .requirements/            Requirements & stage task specs
├── .code-reviews/            Code review archive
├── AGENTS.md                 AI agent entry
└── turbo.json
```

Package READMEs: [web](apps/web/README.md) · [api](apps/api/README.md) · [model-runtime-demo](apps/model-runtime-demo/README.md)

---

## Roadmap (V1)

From [`.requirements/prompts/03-plan.md`](.requirements/prompts/03-plan.md):

```txt
Stage 1  Model Runtime              ← current
Stage 2  Core abstractions & DI
Stage 3  Chat main loop
Stage 4  Memory (structured + vector RAG)
Stage 5  Emotion state machine
Stage 6  Tool calling
Stage 7  Workflow orchestration
Stage 8  Debug UI & observability
```

Stage specs: [`.requirements/stages/`](.requirements/README.md).

---

## Prerequisites

- Node.js (LTS recommended)
- [pnpm 9](https://pnpm.io/) — version pinned in `package.json` → `packageManager`

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

## Run the Model Runtime demo

The fastest way to see Stage 1 working: a Next.js app that reads env vars, calls `@ying-companion/ai-core`, and shows streaming output plus retry/fallback info.

```bash
cp apps/model-runtime-demo/.env.example apps/model-runtime-demo/.env
# Set OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL
# Optional: OPENAI_FALLBACK_MODEL, retry counts — see demo README

pnpm --filter @ying-companion/model-runtime-demo dev
```

Open the URL from the terminal and use **「调用模型」**. Full env reference: [apps/model-runtime-demo/README.md](apps/model-runtime-demo/README.md).

---

## Tech stack

| Layer     | Tools                                                            |
| --------- | ---------------------------------------------------------------- |
| Workspace | pnpm 9, Turborepo, TypeScript                                    |
| Quality   | ESLint 9 (flat config), Prettier, Husky, lint-staged, commitlint |
| AI Core   | Vercel AI SDK, OpenAI-compatible provider abstraction            |
| Debug UI  | Next.js 15 (`apps/model-runtime-demo`)                           |

---

## Contributing

- **Commits:** conventional format, Chinese messages — [docs/ai/core/git-protocol.md](docs/ai/core/git-protocol.md)
- **Hooks:** Husky runs lint-staged and commitlint on commit
- **Style:** root ESLint + Prettier configs apply workspace-wide

Requirement and design docs are written in **Chinese**; code and paths stay as in the repo.
