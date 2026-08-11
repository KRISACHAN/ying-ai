# @ying-ai/web

**English** | [简体中文](./README.zh-CN.md)

Frontend web package for **ying-ai**. Supplements root [AGENTS.md](../../AGENTS.md).

> **AI read order:** This README → [docs/ai/core/project-context.md](../../docs/ai/core/project-context.md) → stage requirements under [`.requirements/`](../../.requirements/README.md) when implementing product features.

---

## Role

| Field               | Value                                                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Package**         | `@ying-ai/web`                                                                                                                        |
| **Path**            | `apps/web/`                                                                                                                           |
| **Planned purpose** | User-facing frontend application ([`.requirements/companion/prompts/00-basic.md`](../../.requirements/companion/prompts/00-basic.md)) |
| **Current status**  | **Scaffold only** — TypeScript package with placeholder export; no framework app, pages, or UI yet                                    |

Do **not** confuse with [`apps/model-runtime-demo`](../model-runtime-demo/README.md). That Next.js app is the **V1.0 AI Core debug workbench** and is separate from this production-oriented web package.

V1 planning note ([`.requirements/companion/prompts/02-execution.md`](../../.requirements/companion/prompts/02-execution.md)): debug UI and final product UI may remain separate apps long term.

---

## Layout

```txt
apps/web/
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
pnpm turbo run build --filter @ying-ai/web
pnpm turbo run typecheck --filter @ying-ai/web
pnpm turbo run lint --filter @ying-ai/web
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
pnpm turbo run typecheck lint --filter @ying-ai/web
```

Or from `apps/web/`: `pnpm typecheck && pnpm lint`.

---

## Conventions

- **Module format:** `"type": "module"` (ESM)
- **Build:** typecheck-only for now (`tsc --noEmit`); no bundled app output yet
- Follow root ESLint / Prettier / TypeScript settings
- Prose in new docs: Chinese per project convention; this README is English for agent readability

---

## Related Paths

| Path                                                                                 | Purpose                                      |
| ------------------------------------------------------------------------------------ | -------------------------------------------- |
| [`apps/api/`](../api/README.md)                                                      | Planned admin / RBAC backend (also scaffold) |
| [`apps/model-runtime-demo/`](../model-runtime-demo/README.md)                        | V1.0 AI core debug workbench (Next.js)       |
| [`.requirements/companion/stages/v1.0/`](../../.requirements/companion/stages/v1.0/) | V1.0 executable stage specs                  |
