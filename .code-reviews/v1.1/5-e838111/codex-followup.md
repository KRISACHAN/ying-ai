# 代码审查复核 — V1.1 Stage 5 工作流级流式聊天

**日期：** 2026-06-28
**审查工具：** Codex
**审查范围：** `.code-reviews/v1.1/6-e838111/cursor-review.md` 及当前实现
**引用：** `.code-reviews/v1.1/6-e838111/cursor-review.md`
**结论：** 建议

## 依据规范

- `AGENTS.md`
- `docs/ai/core/principles.md`
- `docs/ai/core/working-agreements.md`
- `docs/ai/core/verification.md`
- `docs/ai/core/project-context.md`
- `docs/ai/oh-my-codex.md`
- `.codex/skills/code-review-followup/SKILL.md`
- `.requirements/stages/v1.1/stage-05/05-streaming-workflow.md`
- `packages/ai-core/src/implementations/workflow/simple-chat-workflow.ts`
- `packages/ai-core/src/implementations/workflow/workflow-stream-emitter.ts`
- `packages/ai-core/src/core/companion-core.ts`

## 摘要

本轮复核并修复 Cursor review 中必须处理的中等问题：模型流异常现在保留安全截断的诊断 reason，`tool:execute` 不可恢复异常现在映射为 `tool_execution_failed`，并补齐 Stage 5 12 场景验收记录。另补了空白 delta 后失败的 `partialOutput` 标记。剩余问题均为维护性关注，不阻塞当前 Stage 5 主体交付。

## 审查统计

- 复核问题数：7
- 已采纳并修复：4
- 不成立：0
- 保留关注：3
- 未处理：0
- code-reviewer 建议：COMMENT
- 架构状态：WATCH

## 复核结论

### 已采纳并修复

- [`packages/ai-core/src/implementations/workflow/simple-chat-workflow.ts`] `runFinalStreamStep` 不再完全吞掉底层 stream 异常；`model_stream_failed` 的 `details.reason` 会写入经 `toSafeMessage()` 清洗后的安全诊断文本，已输出 delta 时继续带 `partialOutput=true`。
- [`packages/ai-core/src/implementations/workflow/simple-chat-workflow.ts`] `tool:execute` 不可恢复异常现在会生成失败 `tool:result`，随后以 `workflow:error(code=tool_execution_failed, step=tool:execute)` 终止；受控工具失败 `ToolResult.ok=false` 仍保留既有 degraded 语义。
- [`.code-reviews/v1.1/6-e838111/stage5-verification.md`] 已补 Stage 5 §10 的 12 场景本地 fake provider 验收记录，并额外覆盖不可恢复工具执行异常与空白 delta partial 语义。
- [`packages/ai-core/src/implementations/workflow/simple-chat-workflow.ts`] 仅空白 delta 后触发空回复失败时，现在会在 `details.partialOutput=true` 中表达已向宿主输出过内容。

### 不成立

无。Cursor review 中列出的 7 个问题均能从当时实现或 Stage 5 规范中找到依据。

### 保留关注

- [`packages/ai-core/src/implementations/workflow/simple-chat-workflow.ts`] 单文件 2144 行，`WorkflowExecutionState` 与步骤函数仍集中在同一文件。Stage 5 §2.3 是“建议”拆分，不是硬性阻塞；当前实现已抽出 `workflow-stream-emitter.ts`，后续继续演进前建议拆 `workflow-execution-state.ts` / `workflow-steps.ts`。
- [`packages/ai-core/src/implementations/workflow/simple-chat-workflow.ts`] `SafeWorkflowError` 归一化逻辑与 `packages/ai-core/src/core/companion-core.ts` 重复。当前不导致行为错误，但后续新增 error code 时存在双处维护风险，适合后续提取共享 helper。
- [`packages/ai-core/src/implementations/workflow/simple-chat-workflow.ts`] `execute()` 路径 Safety 拒绝从普通 `Error` 变为 `SafeWorkflowException`。该类仍继承 `Error`，且 message 语义保持安全拒绝；影响主要是错误对象多了结构化字段，属于兼容性关注而非当前缺陷。

### 未处理

无。

## 验证

- `pnpm --filter @ying-companion/ai-core typecheck`：通过。
- `pnpm --filter @ying-companion/ai-core lint`：通过。
- `pnpm --filter @ying-companion/ai-core build`：通过。
- 本地 Node fake provider 断言脚本：通过，覆盖 Stage 5 §10 的 12 个场景。
- 本地 Node fake provider 额外回归：通过，验证不可恢复工具异常输出 `tool:result.error.code=TOOL_EXECUTION_FAILED` 并终止为 `tool_execution_failed`。
- 本地 Node fake provider 额外回归：通过，验证仅空白 delta 后 `model_stream_failed` 带 `details.partialOutput=true`。

## 合成说明

- code-reviewer：COMMENT。必须修复项已处理，剩余为维护性建议。
- 架构状态：WATCH。核心流式架构可用，维护性风险集中在单文件体量和错误 helper 重复。
- 最终结论：**建议**。当前实现可继续推进；建议在后续阶段做结构拆分和 SafeWorkflowError helper 收敛。
