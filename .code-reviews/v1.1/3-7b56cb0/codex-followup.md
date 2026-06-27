# 代码审查复核 — V1.1 Stage 3 模型能力档案与工具规划

**日期：** 2026-06-27  
**审查工具：** Codex  
**审查范围：** `.code-reviews/v1.1/3-7b56cb0/cursor-review.md` 及当前实现  
**引用：** `.code-reviews/v1.1/3-7b56cb0/cursor-review.md`  
**结论：** 批准

## 依据规范

- `AGENTS.md`
- `docs/ai/core/principles.md`
- `docs/ai/core/working-agreements.md`
- `docs/ai/core/verification.md`
- `.requirements/stages/v1.1/stage-03/03-model-provider-strategy.md`
- `.codex/skills/code-review-followup/SKILL.md`

## 摘要

Cursor review 的两个错误语义问题成立，已在本次修复：混合 “capability skip + runtime failure” 场景现在优先抛出 `ModelRuntimeError`，并保留 `capabilitySkips`；旧 `GenerateInput.model` 单次模型覆盖入口按用户决策移除，模型选择统一收敛到宿主 factory / registry。低优先级维护项也已收口：demo registry 改为单例、能力判断抽为共享 helper、`ToolPlanningInput` 不再暴露模型覆盖字段。验证覆盖 typecheck、lint、build、stream contract，以及针对错误语义的无外网 smoke。

## 审查统计

- 复核问题数：6
- 已采纳并修复：6
- 不成立：0
- 保留关注：0
- 未处理：0
- code-reviewer 建议：APPROVE
- 架构状态：CLEAR

## 复核结论

### 已采纳并修复

- [`packages/ai-core/src/implementations/model/openai.ts`] 修复 `createFinalModelError()` 分类顺序：存在真实请求失败 `state.errors` 时返回 `ModelRuntimeError`，能力 skip 作为附加上下文保留；只有所有候选均因能力不足被跳过时才返回 `ModelCapabilityUnavailableError`。
- [`packages/ai-core/src/abstractions/model.ts`] 移除 `GenerateInput.model` 与 `modelProfileOverride`，不再保留旧的单次模型覆盖兼容路径；demo 阶段如需切换模型，应同步修改宿主 factory / registry 配置。
- [`.code-reviews/v1.1/3-7b56cb0/codex-followup.md`] 补充本次复核、修复与验证记录，作为 Stage 3 review 归档证据。
- [`apps/model-runtime-demo/app/lib/model-factory.ts`] 将默认 model adapter registry 改为模块级单例，避免每次请求重复注册 strategy。
- [`packages/ai-core/src/abstractions/tool-planning.ts`] 移除 `ToolPlanningInput.model`，默认规划器不再暴露单次模型覆盖入口。
- [`packages/ai-core/src/abstractions/model.ts`] 新增 `modelProfileSatisfiesCapabilities()`，OpenAI adapter 和 demo strict 校验共用该能力判断 helper，避免重复逻辑漂移。

### 不成立

无。

### 保留关注

无。

### 未处理

无。

## 验证

- `pnpm --filter @ying-companion/ai-core typecheck`：通过
- `pnpm --filter @ying-companion/model-runtime-demo typecheck`：通过
- `pnpm --filter @ying-companion/ai-core lint`：通过
- `pnpm --filter @ying-companion/model-runtime-demo lint`：通过
- `pnpm --filter @ying-companion/ai-core build`：通过
- `node --input-type=module -e "<ModelRuntimeError smoke>"`：通过，确认 mixed skip/runtime failure 返回 `ModelRuntimeError`，并携带 skipped primary profile
- `pnpm --filter @ying-companion/model-runtime-demo build`：通过
- `pnpm --filter @ying-companion/model-runtime-demo verify:stream-contract`：通过

## 合成说明

- code-reviewer：APPROVE
- 架构状态：CLEAR
- 最终结论：**批准**。Cursor review 中的有效问题均已修复，并通过目标验证与 smoke 场景确认。
