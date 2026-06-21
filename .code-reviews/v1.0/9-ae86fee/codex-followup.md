# Cursor Review Follow-up — feat(ai-core): 接入本地工具调用系统

**Date:** 2026-06-18
**Review Tool:** Codex
**Model:** GPT-5
**Review Scope:** `.code-reviews/9-ae86fee/cursor-review.md` and current implementation
**Reference:** `.code-reviews/9-ae86fee/cursor-review.md`
**Verdict:** Advisory

## Summary

已逐项核对 Cursor review，并修复其中可直接落地的实现与文档问题。结论：Cursor review 的总体判断成立，本 commit 没有阻塞级缺陷；核心工具闭环保持可用，`ai-core` 仍保持纯 SDK 边界。

本轮 follow-up 未回复 GitHub、未 resolve review thread。

## Follow-Up Conclusions

### Accepted and Fixed

1. `ChatWorkflowDebugContext.messages` 语义与工具二次生成不一致。
   - 处理：注释已改为“首次传入 `model.generate` 的 messages”；二次生成输入继续通过 `toolFollowUpMessages` 暴露。
   - Demo：Prompt Debug Panel 已拆分展示 `Initial Generate Messages` 与 `Final Generate Messages`。
   - 文件：`packages/ai-core/src/abstractions/workflow.ts`、`apps/model-runtime-demo/app/chat-panel.tsx`

2. Demo `get_emotion_state` 返回 workflow 前情绪快照。
   - 处理：Workflow 执行工具时通过 `ToolExecuteInput.metadata.currentEmotion` 注入本轮 `emotionResult.next`。
   - Demo 工具：`get_emotion_state` 优先读取执行时 metadata，缺失时才回退到请求前情绪。
   - 文件：`packages/ai-core/src/implementations/workflow/simple-chat-workflow.ts`、`apps/model-runtime-demo/app/api/chat/route.ts`

3. follow-up generate 再次返回 `toolCalls` 时缺少明确 dropped 标记。
   - 处理：`GenerateWithToolsResult` 新增 `droppedToolCalls` 与 `toolCallsDropped`。
   - 输出：写入 `ChatWorkflowOutput.metadata`、`debugContext.droppedToolCalls`，observer 的 follow-up end payload 也带 `toolCallsDropped`。
   - Demo：Tools Panel 展示 dropped tool calls。
   - 文件：`packages/ai-core/src/implementations/workflow/simple-chat-workflow.ts`、`packages/ai-core/src/abstractions/workflow.ts`、`apps/model-runtime-demo/app/chat-panel.tsx`

4. 有工具时未追加轻量工具能力说明到 system prompt。
   - 处理：`ToolRegistry.list` 提前到 system prompt 构建前执行；有工具定义时追加简短工具说明，提醒模型可调用工具且不要暴露内部工具调用过程。
   - 文件：`packages/ai-core/src/implementations/workflow/simple-chat-workflow.ts`

5. Workflow 与 EmptyToolRegistry 注释过期。
   - 处理：Workflow 类注释更新为阶段 3～6 与工具循环顺序；`EmptyToolRegistry` 注释改为默认空工具注册表语义。
   - 文件：`packages/ai-core/src/implementations/workflow/simple-chat-workflow.ts`、`packages/ai-core/src/implementations/tool/empty-tool-registry.ts`

6. `format-tool-results.ts` 模型侧 JSON 摘要可能与领域层结构混淆。
   - 处理：补充注释，说明返回值是 tool role content，不是 `ToolResult` 结构。
   - 文件：`packages/ai-core/src/implementations/tool/format-tool-results.ts`

7. README 中 stage-06 工具流程说明滞后。
   - 处理：同步当前 `SimpleChatWorkflow` 行为，说明工具列表先于 prompt 构建、V1 只执行 1 轮工具、二次生成后仍返回的 `toolCalls` 会进入 dropped 调试字段。
   - 补充：新增 `LocalToolRegistry` 快速示例，说明 `toolResults` 与 `toolCallsDropped`。
   - 文件：`packages/ai-core/README.md`

### Not Valid

1. `format-tool-results.ts` 中模型侧 JSON 摘要包含顶层 `ok` 字段不构成规范违例。
   - 复核结论：当前实现没有把 `ok` / `error` 嵌入 `ToolResult.result`；`formatToolResultForModel()` 只是生成传给模型的 tool role 文本摘要。
   - 本轮已补注释降低误解。

2. `tool-adapter` / `format-tool-results` 从 public API 导出当前不是阻塞问题。
   - 复核结论：这些导出确实扩大了 API 面，但没有破坏当前 stage-06 验收；属于阶段 7 API 稳定性关注项。

### Retained Concern

1. 自动化回归测试仍缺失。
   - 当前验证主要覆盖 typecheck / build / lint；尚无 `LocalToolRegistry`、adapter、工具失败路径、tool role 映射、workflow 工具循环单测。
   - 建议阶段 7 前至少补最小单测或 smoke test 覆盖 NOT_FOUND、handler throw、invalid JSON、follow-up messages。

2. 工具 adapter / formatter 的 public export 面仍偏宽。
   - 当前为便于 demo 和调试保留导出；阶段 7 可以按稳定 API 边界收敛。

### Unaddressed

无阻塞项未处理。保留关注均为后续质量改进，不影响 stage-06 当前验收。

## Suggested Response Draft

```text
感谢 review，结论接受为 advisory。

已按建议处理：
1. 修正 debugContext.messages 语义，并在 demo 区分首次/最终 generate messages；
2. get_emotion_state 改为读取工具执行时 metadata 中的当前情绪；
3. 二次 generate 再返回 toolCalls 时输出 dropped 标记和 droppedToolCalls；
4. 有工具时补轻量 system prompt 工具说明；
5. 同步 Workflow / EmptyToolRegistry 过期注释；
6. 补充 tool result formatter 注释，避免把模型侧摘要误认为 ToolResult 结构；
7. 同步 ai-core README 的 stage-06 工具流程和本地工具示例。

保留关注：工具链路自动化测试和阶段 7 API 导出面收敛。
```

## Verification

- `pnpm --filter @ying-companion/ai-core typecheck`
- `pnpm --filter @ying-companion/model-runtime-demo typecheck`
- `pnpm --filter @ying-companion/ai-core build`
- `pnpm --filter @ying-companion/model-runtime-demo lint`
- `pnpm prettier --check .code-reviews/9-ae86fee/codex-followup.md`
- `pnpm prettier --check packages/ai-core/README.md`
