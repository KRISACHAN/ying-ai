# @ying-ai/api

**English** | [简体中文](./README.zh-CN.md)

Backend API package for **ying-ai**. Supplements root [AGENTS.md](../../AGENTS.md).

> **AI read order:** This README → [docs/ai/core/project-context.md](../../docs/ai/core/project-context.md) → stage requirements under [`.requirements/`](../../.requirements/README.md) when implementing product features.

---

## Role

| Field               | Value                                                                                                                             |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Package**         | `@ying-ai/api`                                                                                                                    |
| **Path**            | `apps/api/`                                                                                                                       |
| **Planned purpose** | Admin / RBAC backend service ([`.requirements/companion/prompts/00-basic.md`](../../.requirements/companion/prompts/00-basic.md)) |
| **Current status**  | **Scaffold only** — TypeScript package with placeholder export; no HTTP server, routes, or RBAC yet                               |

Do **not** put AI Companion Core SDK logic here. Core lives in `packages/ai-core`. V1.0 core debugging uses [`apps/model-runtime-demo`](../model-runtime-demo/README.md), not this package.

---

## Layout

```txt
apps/api/
  README.md           # This file
  package.json
  tsconfig.json
  src/
    index.ts          # Placeholder entry (exports appName)
```

---

## Commands

From repo root:

```bash
pnpm turbo run build --filter @ying-ai/api
pnpm turbo run typecheck --filter @ying-ai/api
pnpm turbo run lint --filter @ying-ai/api
```

From this directory:

```bash
pnpm typecheck    # tsc --noEmit
pnpm lint         # eslint .
pnpm build        # tsc --noEmit
pnpm clean        # rm -rf dist .turbo
```

---

## Verification

After changes:

```bash
pnpm turbo run typecheck lint --filter @ying-ai/api
```

Or from `apps/api/`: `pnpm typecheck && pnpm lint`.

---

## Conventions

- **Module format:** `"type": "module"` (ESM)
- **Build:** typecheck-only for now (`tsc --noEmit`); no `dist` output yet
- Follow root ESLint / Prettier / TypeScript settings
- Prose in new docs: Chinese per project convention; this README is English for agent readability

---

## Related Paths

| Path                                                                                 | Purpose                                      |
| ------------------------------------------------------------------------------------ | -------------------------------------------- |
| [`apps/web/`](../web/README.md)                                                      | Planned user-facing frontend (also scaffold) |
| [`packages/ai-core/`](../../packages/ai-core/)                                       | AI Companion Core SDK                        |
| [`.requirements/companion/stages/v1.0/`](../../.requirements/companion/stages/v1.0/) | V1.0 executable stage specs                  |
