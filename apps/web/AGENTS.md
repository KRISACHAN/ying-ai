# @ying-companion/web

Package-local context for the web app. Supplements root [AGENTS.md](../../AGENTS.md).

## Package

- **Name:** `@ying-companion/web`
- **Path:** `apps/web/`

## Commands

From repo root:

```bash
pnpm turbo run build --filter @ying-companion/web
pnpm turbo run typecheck --filter @ying-companion/web
pnpm turbo run lint --filter @ying-companion/web
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
