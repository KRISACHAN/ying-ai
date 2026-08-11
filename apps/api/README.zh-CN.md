# @ying-ai/api

**[English](./README.md)** | 简体中文

**ying-ai** 的后端 API 包。补充根目录 [AGENTS.md](../../AGENTS.md)。

> **AI 阅读顺序：** 本文 → [docs/ai/core/project-context.md](../../docs/ai/core/project-context.md) → 实现产品功能时再读 [`.requirements/`](../../.requirements/README.md) 下的阶段需求。

---

## 角色

| 字段         | 值                                                                                                                          |
| ------------ | --------------------------------------------------------------------------------------------------------------------------- |
| **Package**  | `@ying-ai/api`                                                                                                              |
| **Path**     | `apps/api/`                                                                                                                 |
| **规划用途** | Admin / RBAC 后端服务（[`.requirements/companion/prompts/00-basic.md`](../../.requirements/companion/prompts/00-basic.md)） |
| **当前状态** | **仅脚手架** — TypeScript 包带占位导出；尚无 HTTP server、路由或 RBAC                                                       |

**不要**把 AI Companion Core SDK 逻辑写在这里。Core 在 `packages/ai-core`。V1.0 核心调试请用 [`apps/model-runtime-demo`](../model-runtime-demo/README.zh-CN.md)，而不是本包。

---

## 目录结构

```txt
apps/api/
  README.md           # 英文
  README.zh-CN.md     # 本文
  package.json
  tsconfig.json
  src/
    index.ts          # 占位入口（导出 appName）
```

---

## 命令

在仓库根目录：

```bash
pnpm turbo run build --filter @ying-ai/api
pnpm turbo run typecheck --filter @ying-ai/api
pnpm turbo run lint --filter @ying-ai/api
```

在本目录：

```bash
pnpm typecheck    # tsc --noEmit
pnpm lint         # eslint .
pnpm build        # tsc --noEmit
pnpm clean        # rm -rf dist .turbo
```

---

## 验证

改动后：

```bash
pnpm turbo run typecheck lint --filter @ying-ai/api
```

或在 `apps/api/` 下：`pnpm typecheck && pnpm lint`。

---

## 约定

- **模块格式：** `"type": "module"`（ESM）
- **构建：** 目前仅 typecheck（`tsc --noEmit`）；尚未产出 `dist`
- 遵循根目录 ESLint / Prettier / TypeScript 配置
- 新文档正文按项目约定用中文；英文 README 便于 agent 阅读

---

## 相关路径

| 路径                                                                                 | 用途                             |
| ------------------------------------------------------------------------------------ | -------------------------------- |
| [`apps/web/`](../web/README.zh-CN.md)                                                | 规划中的用户前端（同样是脚手架） |
| [`packages/ai-core/`](../../packages/ai-core/README.zh-CN.md)                        | AI Companion Core SDK            |
| [`.requirements/companion/stages/v1.0/`](../../.requirements/companion/stages/v1.0/) | V1.0 可执行阶段规格              |
