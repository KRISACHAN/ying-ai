# Project Context

## Overview

**ying-companion** is a pnpm + Turborepo monorepo (TypeScript, ESLint, Prettier, Husky, commitlint).

## Layout

```
ying-companion/
├── apps/
│   ├── web/          # @ying-companion/web
│   └── api/          # @ying-companion/api
├── packages/         # shared packages (scaffold)
├── docs/ai/          # AI agent documentation (this tree)
├── .codex/           # Codex / OMX project scope
└── turbo.json        # Turborepo task graph
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

Use Turbo filters to target a single app:

```bash
pnpm turbo run build --filter @ying-companion/web
pnpm turbo run typecheck --filter @ying-companion/api
pnpm turbo run lint --filter @ying-companion/web
```

Or run scripts from the package directory:

```bash
cd apps/web && pnpm typecheck
cd apps/api && pnpm lint
```

## Nested Agent Context

- [`apps/web/AGENTS.md`](../../../apps/web/AGENTS.md) — web app specifics
- [`apps/api/AGENTS.md`](../../../apps/api/AGENTS.md) — API specifics

## Tech Stack

- **Package manager:** pnpm 9.x (workspace)
- **Build orchestration:** Turborepo
- **Language:** TypeScript (ES modules)
- **Linting:** ESLint 9 flat config + typescript-eslint
- **Formatting:** Prettier
- **Git hooks:** Husky + lint-staged + commitlint (conventional commits)
