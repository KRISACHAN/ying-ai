# 代码审查复核 — Cursor staged 报告跟进

**日期：** 2026-06-06
**审查范围：** `docs/code-reviews/0-staged.md` 及当前工作区相关实现
**引用：** `docs/code-reviews/0-staged.md`
**结论：** 建议

## 依据规范

- [AGENTS.md](../../AGENTS.md)
- [docs/ai/core/principles.md](../ai/core/principles.md)
- [docs/ai/core/working-agreements.md](../ai/core/working-agreements.md)
- [docs/ai/core/verification.md](../ai/core/verification.md)
- [docs/ai/core/project-context.md](../ai/core/project-context.md)
- [.cursor/rules/00-ai-guide.mdc](../../.cursor/rules/00-ai-guide.mdc)
- [.cursor/rules/10-project-context.mdc](../../.cursor/rules/10-project-context.mdc)
- [eslint.config.mjs](../../eslint.config.mjs)
- [prettier.config.mjs](../../prettier.config.mjs)
- [docs/requirements/stages/stage-01/01-model-runtime.md](../requirements/stages/stage-01/01-model-runtime.md)

## 摘要

Cursor 报告的主要方向成立：`ai-core` 的公开 API 应收窄，未落地的 `provider?` 占位不应提前暴露，`tools` 入参在 Tool System 阶段前不应裸断言给 AI SDK。已按这些问题修复，并补充流式 usage final chunk。

`zod` 未使用依赖这一条不成立：AI SDK 6 与 `@ai-sdk/openai-compatible` 将 `zod` 声明为 peer dependency，移除后 pnpm 明确报告 missing peer，因此保留为直接依赖用于满足 peer。

## 审查统计

- 复核问题数：10
- 采纳并修复：5
- 判定不成立：1
- 保留为非阻塞关注：4
- code-reviewer 建议：COMMENT
- 架构状态：WATCH

## 复核结论

### 已采纳并修复

- [packages/ai-core/src/index.ts] 移除 `OpenAICompatibleModel` 对外导出，仅暴露 `createModel`、`CreateModelOptions` 和 Core DTO。
- [packages/ai-core/src/factories/model.factory.ts] 移除未使用的 `provider?` 占位字段。
- [packages/ai-core/src/abstractions/model.ts] 保留 `tools` 入参作为 TODO 占位，但阶段 1 不传给 Provider，不执行工具。
- [packages/ai-core/src/implementations/model/openai.ts] 移除 `tools as ToolSet` 裸断言。
- [packages/ai-core/src/abstractions/model.ts] 为 `GenerateStreamChunk` 增加可选 `usage`，流结束后输出 final usage chunk。

### 不成立

- [packages/ai-core/package.json] `zod` 不是普通未使用依赖，而是 AI SDK 相关包的 peer dependency。移除后 pnpm 报告 `missing peer zod`，因此应保留。

### 保留关注

- `OpenAICompatibleConfig` 仍作为内部配置存在，但不再从包入口导出。
- 当前仍采用 CommonJS 构建，这是为了满足源码无后缀 import 且不引入 post-build 重写脚本；后续若统一 ESM，需要另起模块格式迁移。
- provider 实例每次请求创建一次，影响很低，可等出现性能证据后再缓存。
- demo 与 lockfile 当前在工作区内，提交前需要与本阶段变更一起纳入同批变更。

## 验证

- `pnpm --filter @ying-companion/ai-core typecheck`：通过
- `pnpm --filter @ying-companion/ai-core lint`：通过
- `pnpm --filter @ying-companion/ai-core build`：通过
- `pnpm --filter @ying-companion/model-runtime-demo typecheck`：通过
- `pnpm --filter @ying-companion/model-runtime-demo lint`：通过
- `pnpm --filter @ying-companion/model-runtime-demo build`：通过
- `pnpm typecheck`：通过
- `pnpm lint`：通过
- `pnpm build`：通过
- `curl -N -sS -X POST http://localhost:3000/api/model-runtime`：返回流式模型文本

## 合成说明

- code-reviewer：COMMENT
- 架构状态：WATCH
- 最终结论：**建议**。Cursor 报告中阻塞项已处理；剩余项属于提交组织与后续架构关注，不阻塞当前实现继续推进。
