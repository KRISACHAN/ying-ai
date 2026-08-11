# @ying-ai/story-architect

[English](./README.md) | **简体中文**

`ying-ai` monorepo 中的独立 AI 小说创作应用。用户从一句故事灵感开始，通过多轮 AI 对话依次完成世界观、人物、故事大纲和章节初稿。

本应用从独立的 `ying-story-architect` 仓库迁入。迁移后继续保持应用级边界：不依赖 `@ying-ai/story-core`，保留现有 Next.js、Vercel AI SDK 与 Prisma 架构。

## 技术栈

- Next.js 16 App Router、React 19、TypeScript
- Vercel AI SDK 与 OpenAI 兼容模型接口
- PostgreSQL 与 Prisma
- Tailwind CSS 4 与本地 shadcn 风格 UI 组件

## 本地启动

```bash
cp apps/story-architect/.env.example apps/story-architect/.env
pnpm install
pnpm --filter @ying-ai/story-architect exec prisma db push
pnpm --filter @ying-ai/story-architect dev
```

应用默认运行在 `http://localhost:3001`，可以和使用 3000 端口的 `apps/model-runtime-demo` 同时启动。

环境变量见 [`.env.example`](./.env.example)，产品需求与原始阶段计划见 [`.requirements/story-architect`](../../.requirements/story-architect/README.md)。

## 验证命令

```bash
pnpm --filter @ying-ai/story-architect lint
pnpm --filter @ying-ai/story-architect typecheck
pnpm --filter @ying-ai/story-architect build
```

## 应用边界

本应用面向作者的创作流程；`packages/story-core` 是面向玩家的交互式故事运行时。不要因为两者都使用 Story 命名就合并领域模型；只有出现明确的跨应用复用场景后，才将能力抽取到 `packages/*`。
