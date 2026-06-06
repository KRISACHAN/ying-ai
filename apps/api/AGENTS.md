# @ying-companion/api

Package-local context for the API. Supplements root [AGENTS.md](../../AGENTS.md).

## Package

- **Name:** `@ying-companion/api`
- **Path:** `apps/api/`

## Commands

From repo root:

```bash
pnpm turbo run build --filter @ying-companion/api
pnpm turbo run typecheck --filter @ying-companion/api
pnpm turbo run lint --filter @ying-companion/api
```

From this directory:

```bash
pnpm typecheck    # tsc --noEmit
pnpm lint         # eslint .
pnpm build        # tsc --noEmit
pnpm clean        # rm -rf dist .turbo
```

## Verification

After changes, run `pnpm typecheck` and `pnpm lint` from this package or via Turbo filter.
