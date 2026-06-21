# Project Context

## Overview

**ying-companion** is a pnpm + Turborepo monorepo (TypeScript, ESLint, Prettier, Husky, commitlint).

## Layout

```
ying-companion/
├── apps/
│   ├── api/                  # @ying-companion/api
│   ├── web/                  # @ying-companion/web
│   └── model-runtime-demo/   # @ying-companion/model-runtime-demo
├── packages/
│   └── ai-core/              # @ying-companion/ai-core
├── docs/ai/                  # AI agent operating rules
├── .requirements/            # Requirement and stage specs
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

## Nested Agent Context

- [`apps/web/README.md`](../../../apps/web/README.md) — web app specifics
- [`apps/api/README.md`](../../../apps/api/README.md) — API specifics
- [`apps/model-runtime-demo/README.md`](../../../apps/model-runtime-demo/README.md) — V1.0 debug workbench env vars and local run

## Tech Stack

- **Package manager:** pnpm 9.x (workspace)
- **Build orchestration:** Turborepo
- **Language:** TypeScript (ES modules)
- **Linting:** ESLint 9 flat config + typescript-eslint
- **Formatting:** Prettier
- **Git hooks:** Husky + lint-staged + commitlint (conventional commits)
