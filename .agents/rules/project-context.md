# Apps Package Context

Apply when working under `apps/**`.

This is the **ying-ai** pnpm + Turborepo monorepo.

- Root commands: see [docs/ai/core/project-context.md](../../docs/ai/core/project-context.md)
- `apps/model-runtime-demo`: read [apps/model-runtime-demo/README.md](../../apps/model-runtime-demo/README.md)
- `apps/story-architect`: read [apps/story-architect/README.md](../../apps/story-architect/README.md)

Knowledge workspace code lives in the sibling repo `ying-knowledge`, not under this monorepo.

Use Turbo filters for package-scoped tasks:

```bash
pnpm turbo run <task> --filter @ying-ai/<package>
```
