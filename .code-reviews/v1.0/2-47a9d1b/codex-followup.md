# Cursor Review Follow-Up — 阶段 2 Core 抽象层

**Date:** 2026-06-09  
**Review Tool:** Codex  
**Model:** GPT-5  
**Review Scope:** `.code-reviews/2-47a9d1b/cursor-review.md` and current implementation  
**Reference:** `.code-reviews/2-47a9d1b/cursor-review.md`  
**Verdict:** Advisory

## Summary

Cursor review 的结论是 Advisory：无严重 / 高危阻塞项，阶段 2 实现整体符合规格。Codex 复核后已处理两项阶段 3 前必须硬化的架构关注：Context 对外只读并浅冻结，Workflow 执行上下文不再包含 `workflow` 自身。

本 follow-up 对 Cursor review 的 6 个问题与 5 个架构关注项做逐条复核，并记录本轮补丁。

## Follow-Up Conclusions

### Accepted and Fixed

1. `CompanionCore.context` / `getProviders()` 暴露可变 Context 引用  
   位置：`packages/ai-core/src/core/companion-core.ts`

   处理结果：已修复。`CompanionCore.context` 现在是 `CompanionCoreProviderView`，`getProviders()` 返回只读 provider view；构造函数使用 `Object.freeze({ ...context })` 对 Context 做浅冻结，阻止运行时替换顶层 Provider 字段。

2. `executeWorkflow()` 向 Workflow 传入完整 `CompanionCoreContext`，包含 `workflow` 自身  
   位置：`packages/ai-core/src/core/companion-core.ts`、`packages/ai-core/src/abstractions/workflow.ts`

   处理结果：已修复。新增 `ChatWorkflowCoreContext = Readonly<Omit<CompanionCoreContext, "workflow">>`，`ChatWorkflowExecutionContext.core` 改为该收窄类型；`executeWorkflow()` 会解构排除 `workflow` 后再传给 Workflow，避免自引用重入面。

### Retained Concern

1. Demo 的 Core inspection 与模型流式调用在同一 `POST /api/model-runtime` 中  
   位置：`apps/model-runtime-demo/app/api/model-runtime/route.ts`

   复核结论：非阻塞，保留为可选调试体验改进。当前实现会在模型 stream 前先 enqueue Core inspection；只要模型配置读取成功，即使后续模型调用失败，Core inspection 仍会出现在响应流里。是否拆 `/api/core-inspect` 可留到 demo 调试需求增长时处理。

2. 包 README / JSDoc 标注 API 稳定层级

   状态：未处理。该项属于文档增强，不阻塞 Stage 2；可在阶段 3 或首次对外发布前补充。

### Not Valid

1. `export *` 扩大公开 API 面需要立即收窄

   复核结论：不作为阶段 2 缺陷处理。`.requirements/stages/stage-02/02-core-abstractions.md` §十八明确要求导出各抽象、Core factory，并建议导出默认实现；当前 `packages/ai-core/src/index.ts` 符合该规格，且仍未导出 `implementations/model/openai.ts`。后续可以补 README / JSDoc 标注稳定性层级，但不应在阶段 2 回退导出面。

2. `DefaultPersonaProvider.load(input)` 忽略 `sessionId` / `personaId` 需要立即实现

   复核结论：不作为阶段 2 缺陷处理。默认 Persona Provider 是调试用默认实现，阶段 2 目标是能力插槽成型，不接用户系统或数据库。真实按 `sessionId` / `personaId` 加载 Persona 应由后续宿主注入的 Provider 或阶段 3+ 实现承担。

3. `OpenAICompatibleModel.meta` 不包含实际配置模型名

   复核结论：不作为阶段 2 缺陷处理。Provider `meta` 用来稳定标识 Provider 类型，不用于表达每次调用的具体模型配置；阶段 1 已通过 `GenerateOutput.model` 和 `runtime.usedModel` 展示实际使用模型。把 `config.model` 混进 provider id 反而会削弱稳定性。

4. Factory 硬编码默认实现 import 需要抽注册表

   复核结论：不作为阶段 2 缺陷处理。`createCompanionCore({ ... })` 已允许完整注入替换所有 Provider；默认实现集中 import 是当前最小实现。等后续默认实现数量或测试矩阵扩大，再抽 `defaultProviders` 注册表更合适。

### Unaddressed

1. Demo 手动点击验证

   状态：未处理。真实模型调用仍依赖本地 `OPENAI_API_KEY` / provider 配置。合并前可手动运行 `pnpm --filter @ying-companion/model-runtime-demo dev` 并点击「调用模型」确认 Core inspection 与模型流同屏可见。

## Verification

本 follow-up 修改并复核了以下当前实现：

- `packages/ai-core/src/core/companion-core.ts`
- `packages/ai-core/src/abstractions/core-context.ts`
- `packages/ai-core/src/abstractions/workflow.ts`
- `packages/ai-core/src/core/companion-core-factory.ts`
- `packages/ai-core/src/index.ts`
- `packages/ai-core/src/implementations/persona/default-persona-provider.ts`
- `packages/ai-core/src/implementations/model/openai.ts`
- `apps/model-runtime-demo/app/api/model-runtime/route.ts`

验证结果：

- `pnpm --filter @ying-companion/ai-core typecheck` — passed
- `pnpm --filter @ying-companion/ai-core build` — passed
- `pnpm --filter @ying-companion/ai-core lint` — passed
- `pnpm --filter @ying-companion/model-runtime-demo typecheck` — passed
- `pnpm --filter @ying-companion/model-runtime-demo lint` — passed
- `pnpm exec prettier --check packages/ai-core/src .code-reviews/2-47a9d1b/codex-followup.md` — passed
- Node smoke against `packages/ai-core/dist` — confirmed `core.context` and `core.getProviders()` are frozen, and `ChatWorkflowExecutionContext.core` does not include `workflow` during execution.

## Stage 3 Action Items

1. 若 demo 调试继续增长，再拆分独立 Core inspection endpoint；阶段 2 当前单 endpoint 方案可接受。
2. 首次对外发布前补充 README / JSDoc，说明抽象 API 与默认实现的稳定性层级。
