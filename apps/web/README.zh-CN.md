# @ying-ai/web

**[English](./README.md)** | 简体中文

**ying-ai** 的前端 Web 包。补充根目录 [AGENTS.md](../../AGENTS.md)。

> **AI 阅读顺序：** 本文 → [docs/ai/core/project-context.md](../../docs/ai/core/project-context.md) → 实现产品功能时再读 [`.requirements/`](../../.requirements/README.md) 下的阶段需求。

---

## 角色

| 字段         | 值                                                                                                                       |
| ------------ | ------------------------------------------------------------------------------------------------------------------------ |
| **Package**  | `@ying-ai/web`                                                                                                           |
| **Path**     | `apps/web/`                                                                                                              |
| **规划用途** | 面向用户的前端应用（[`.requirements/companion/prompts/00-basic.md`](../../.requirements/companion/prompts/00-basic.md)） |
| **当前状态** | **仅脚手架** — TypeScript 包带占位导出；尚无框架应用、页面或 UI                                                          |

**不要**与 [`apps/model-runtime-demo`](../model-runtime-demo/README.zh-CN.md) 混淆。后者是 **V1.0 AI Core 调试工作台**（Next.js），与本生产向 Web 包分离。

V1 规划说明（[`.requirements/companion/prompts/02-execution.md`](../../.requirements/companion/prompts/02-execution.md)）：调试 UI 与最终产品 UI 长期可保持为不同应用。

---

## 目录结构

```txt
apps/web/
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
pnpm turbo run build --filter @ying-ai/web
pnpm turbo run typecheck --filter @ying-ai/web
pnpm turbo run lint --filter @ying-ai/web
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
pnpm turbo run typecheck lint --filter @ying-ai/web
```

或在 `apps/web/` 下：`pnpm typecheck && pnpm lint`。

---

## 约定

- **模块格式：** `"type": "module"`（ESM）
- **构建：** 目前仅 typecheck（`tsc --noEmit`）；尚未产出打包后的应用
- 遵循根目录 ESLint / Prettier / TypeScript 配置
- 新文档正文按项目约定用中文；英文 README 便于 agent 阅读

---

## 相关路径

| 路径                                                                                 | 用途                                       |
| ------------------------------------------------------------------------------------ | ------------------------------------------ |
| [`apps/api/`](../api/README.zh-CN.md)                                                | 规划中的 Admin / RBAC 后端（同样是脚手架） |
| [`apps/model-runtime-demo/`](../model-runtime-demo/README.zh-CN.md)                  | V1.0 AI Core 调试工作台（Next.js）         |
| [`.requirements/companion/stages/v1.0/`](../../.requirements/companion/stages/v1.0/) | V1.0 可执行阶段规格                        |
