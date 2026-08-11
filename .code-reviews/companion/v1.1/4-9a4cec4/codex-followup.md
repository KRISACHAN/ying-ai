# 代码审查复核 — V1.1 Stage 4 SimpleChatWorkflow 步骤函数化重构

**日期：** 2026-06-27
**审查工具：** Codex
**审查范围：** `.code-reviews/v1.1/4-9a4cec4/cursor-review.md` 及当前实现
**引用：** `.code-reviews/v1.1/4-9a4cec4/cursor-review.md`
**结论：** 建议

## 依据规范

- `AGENTS.md`
- `docs/ai/core/working-agreements.md`
- `docs/ai/core/verification.md`
- `.requirements/stages/v1.1/stage-04/04-workflow-step-refactor.md`
- `.codex/skills/code-review-followup/SKILL.md`

## 摘要

Cursor review 的高优先级问题成立：`DefaultToolPlanningProvider` 仍可通过构造期
`model` 覆盖本次 `ToolPlanningInput.model`，违反 Stage 4 request-scoped model 约束。
本次已修复为无状态 runtime 行为，`plan()` 始终使用 `input.model.generate()`。
同时修正了 `SimpleChatWorkflow` 类级注释和 `toToolPlanningState()` 调用语义。README 同步与
`simple-chat-workflow.ts` 拆文件属于非阻塞维护项，建议在 Stage 5 / Stage 8 文档收口时处理。

## 审查统计

- 复核问题数：5
- 已采纳并修复：3
- 不成立：0
- 保留关注：2
- 未处理：0
- code-reviewer 建议：COMMENT
- 架构状态：WATCH

## 复核结论

### 已采纳并修复

- [`packages/ai-core/src/implementations/tool-planning/default-tool-planning-provider.ts`]
  采纳高优先级问题。已删除 `private readonly model` 与 `(this.model ?? input.model)` 分支；
  构造器仅保留兼容签名但不参与 runtime。默认 planner 现在始终调用本次请求传入的
  `input.model.generate()`。
- [`packages/ai-core/src/implementations/workflow/simple-chat-workflow.ts`]
  采纳类级注释问题。已补齐 `Prompt.build`、`ToolRegistry.execute` 与 `final generate`，
  避免后续维护者误读 Stage 4 编排顺序。
- [`packages/ai-core/src/implementations/workflow/simple-chat-workflow.ts`]
  采纳 `toToolPlanningState(normalized, "execution_failed")` 可读性问题。成功路径不再传入
  `execution_failed`，该来源只保留在真正的 planner 执行失败路径。

### 不成立

无。

### 保留关注

- [`packages/ai-core/README.md`]
  README 的 V1 工具循环描述仍有 Stage 3 / Stage 4 混合语境。该问题不影响当前代码行为，
  但会影响后续读者理解；建议在 Stage 8 文档同步阶段统一更新，避免只局部修改导致文档前后不一致。
- [`packages/ai-core/src/implementations/workflow/simple-chat-workflow.ts`]
  单文件体量较大这一点成立，但 Stage 4 文档将 `workflow-steps.ts` / `workflow-execution-state.ts`
  标为可选。本次先不拆文件，建议在 Stage 5 复用步骤实现 `stream()` 前处理，避免双路径漂移。

### 未处理

无。

## 验证

- `pnpm --filter @ying-companion/ai-core typecheck`：通过
- `pnpm --filter @ying-companion/ai-core lint`：通过
- `pnpm --filter @ying-companion/ai-core build`：通过
- `node --input-type=module -e "<DefaultToolPlanningProvider request-scoped model smoke>"`：通过。
  使用旧构造写法传入 stale model，同时在 `plan(input)` 传入 current model；结果只调用 current model，
  确认构造期 model 不再覆盖本次请求模型。

## 合成说明

- code-reviewer：COMMENT
- 架构状态：WATCH
- 最终结论：**建议**。阻塞项已修复并通过目标验证；剩余两项为文档同步与文件拆分维护关注，不阻塞 Stage 4 行为正确性。
