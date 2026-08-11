# @ying-ai/story-architect

**English** | [简体中文](./README.zh-CN.md)

An independent AI-assisted novel authoring application in the `ying-ai` monorepo. Starting from a one-line idea, it guides an author through worldbuilding, characters, outline, and chapter drafting.

This app was migrated from the standalone `ying-story-architect` repository. It intentionally remains application-local: it does not depend on `@ying-ai/story-core`, and it keeps its existing Next.js, Vercel AI SDK, and Prisma architecture.

## Stack

- Next.js 16 App Router, React 19, and TypeScript
- Vercel AI SDK with an OpenAI-compatible provider
- PostgreSQL with Prisma
- Tailwind CSS 4 and local shadcn-style UI components

## Local setup

```bash
cp apps/story-architect/.env.example apps/story-architect/.env
pnpm install
pnpm --filter @ying-ai/story-architect exec prisma db push
pnpm --filter @ying-ai/story-architect dev
```

The app runs at `http://localhost:3001` so it can coexist with `apps/model-runtime-demo` on port 3000.

Required environment variables are documented in [`.env.example`](./.env.example). Product requirements and the original staged plan live in [`.requirements/story-architect`](../../.requirements/story-architect/README.md).

## Verification

```bash
pnpm --filter @ying-ai/story-architect lint
pnpm --filter @ying-ai/story-architect typecheck
pnpm --filter @ying-ai/story-architect build
```

## Boundary

This application is an authoring workflow. `packages/story-core` is an interactive story runtime for players. Do not merge their domain models merely because both use the word “story”; shared capabilities should only be extracted after a concrete cross-app use case exists.
