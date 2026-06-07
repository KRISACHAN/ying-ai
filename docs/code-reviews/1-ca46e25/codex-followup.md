# 代码审查复核 — Model Runtime 重试与降级

**日期：** 2026-06-07
**审查范围：** `docs/code-reviews/1-staged-model-runtime-retry-fallback/cursor-review.md` 及当前实现
**引用：** `docs/code-reviews/1-staged-model-runtime-retry-fallback/cursor-review.md`
**结论：** 建议

## 依据规范

- [AGENTS.md](../../../AGENTS.md)
- [docs/ai/core/principles.md](../../ai/core/principles.md)
- [docs/ai/core/working-agreements.md](../../ai/core/working-agreements.md)
- [docs/ai/core/verification.md](../../ai/core/verification.md)
- [docs/ai/core/project-context.md](../../ai/core/project-context.md)
- [.cursor/rules/00-ai-guide.mdc](../../../.cursor/rules/00-ai-guide.mdc)
- [eslint.config.mjs](../../../eslint.config.mjs)
- [prettier.config.mjs](../../../prettier.config.mjs)
- [docs/requirements/stages/stage-01/01-model-runtime.md](../../requirements/stages/stage-01/01-model-runtime.md)
- [docs/requirements/stages/stage-01/01-model-runtime-patch-2.md](../../requirements/stages/stage-01/01-model-runtime-patch-2.md)

## 摘要

Cursor 报告的核心判断成立：Provider 重复构造可以直接优化，`ModelRuntimeError` 不应混在纯模型 DTO 文件里，`input.model` 只覆盖 primary plan 的语义也需要明确说明。已修复高优先级问题、中级别边界问题和两个低成本低级别问题。

保留的关注项是运行时工具函数的复用边界：当前只有一个 OpenAI-compatible 实现，先保持模块私有；等 Stage 2 引入多 Provider 或共享 Runtime 包装器时再抽到独立 runtime 模块。

## 审查统计

- 复核问题数：6
- 已采纳并修复：5
- 保留为后续关注：1
- code-reviewer 建议：COMMENT
- 架构状态：WATCH

## 复核结论

### 已采纳并修复

- [packages/ai-core/src/implementations/model/openai.ts] 缓存 `createOpenAICompatible` 返回的 provider factory。Provider 配置随模型实例固定，不再在每次 retry / fallback attempt 中重复创建。
- [packages/ai-core/src/errors/model-runtime-error.ts] 新增错误类文件，并将 `ModelRuntimeError` 从 `abstractions/model.ts` 迁出。`abstractions/model.ts` 只保留接口、类型和 DTO。
- [packages/ai-core/src/abstractions/model.ts] 为 `GenerateInput.model` 增加 JSDoc，说明它只覆盖本次调用的 primary model，不覆盖配置中的 fallback model。
- [packages/ai-core/src/implementations/model/openai.ts] 在 `createAttemptPlans` 中补充注释，说明 per-call model override 只影响 primary plan。
- [apps/model-runtime-demo/app/api/model-runtime/route.ts] 将 `loadModelConfig` 和 `createModel` 移入 `ReadableStream.start` 的 `try` 中。缺失必填 env 时，demo 会以流式文本展示错误，而不是让 Next.js 返回原始 500。
- [apps/model-runtime-demo/app/api/model-runtime/route.ts] `formatRuntimeErrors` 改为接收 `ModelRuntimeErrorItem[]`，不再使用 `ModelRuntimeInfo["errors"]`。
- [packages/ai-core/src/implementations/model/openai.ts] 提取 `MAX_ERROR_MESSAGE_LENGTH` 常量，替代错误摘要截断长度魔术数字。

### 保留关注

- [packages/ai-core/src/implementations/model/openai.ts] `normalizeMaxRetries`、`getMaxAttempts`、`createRuntimeState`、`recordAttempt` 等工具函数暂时保留为 OpenAI-compatible 实现内部私有函数。当前阶段只有一个 provider 实现，提前抽共享 runtime 模块会增加不必要抽象；Stage 2 如果引入多 Provider，再统一迁移到 runtime helper。

## 验证

- `pnpm --filter @ying-companion/ai-core typecheck`：通过
- `pnpm --filter @ying-companion/ai-core lint`：通过
- `pnpm --filter @ying-companion/model-runtime-demo typecheck`：通过
- `pnpm --filter @ying-companion/model-runtime-demo lint`：通过
- `pnpm typecheck`：通过
- `pnpm lint`：通过
- `pnpm build`：通过
- `curl -N -sS -X POST http://localhost:3000/api/model-runtime`：返回流式模型文本与 runtime 结果

## 合成说明

- code-reviewer：COMMENT
- 架构状态：WATCH
- 最终结论：**建议**。Cursor 报告中的阻塞项已处理；剩余 WATCH 项属于 Stage 2 多 Provider 扩展时的复用边界，不阻塞当前阶段合并。
