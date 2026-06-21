# Cursor Review Follow-up — a013327

**Date:** 2026-06-20
**Review Tool:** Codex
**Model:** GPT-5
**Review Scope:** `.code-reviews/10-a013327/cursor-review.md` and current implementation
**Reference:** `.code-reviews/10-a013327/cursor-review.md`
**Verdict:** Advisory

## Summary

已逐项核对 Cursor review 中的 8 个发现，并修复我认为应立即处理的兼容性、验收完整性与错误摘要问题。

结论：M1/M2/M3 已修复；L2/L5 已修复；L4 判定为不成立；L1/L3 保留为非阻塞关注项。

## Follow-Up Conclusions

### Accepted and Fixed

1. **M1：恢复 `workflow:step` legacy end payload 顶层字段兼容**

   已修复。`runWorkflowStep()` 现在会继续在 `summary` 中提供规范摘要，同时把摘要字段展开到 `workflow:step` 顶层，恢复旧消费者读取 `model/runtime/toolCallCount/count` 等顶层字段的兼容性。模型生成 start 事件也恢复 `messageCount/toolsEnabled` 顶层字段。

2. **M2：demo 失败路径展示 `workflow:error.payload.trace`**

   已修复。`WorkflowTracePanel` 现在可在 `result.metadata.trace` 缺失时，从 `observerEvents` 中的 `workflow:error.payload.trace` 回退读取，并在失败响应下渲染 dedicated trace 面板。

3. **M3：补充可替换 Workflow 最小实现与验收**

   已修复。没有在 `ai-core` 内新增 mock 实现；改为在 README 展示宿主侧内联 `ChatWorkflow` 的 smoke 模式，并用 Node smoke 验证 `createCompanionCore({ workflow })` 替换路径和 `inspect()` 可见性。这样能覆盖阶段 7 场景 E，同时保持 core 干净。

4. **L2：错误摘要脱敏**

   已修复。`toSafeMessage()` 现在对常见连接串、Bearer token、`api_key/token/secret/password` 参数做 redaction，并限制摘要长度，降低 trace / Observer 扩大错误暴露面的风险。

5. **L5：`workflow:error` payload 类型化**

   已修复。新增 `WorkflowErrorEventPayload`，并在 `SimpleChatWorkflow` 发射 `workflow:error` 时使用 `satisfies` 校验载荷形状。

### Not Valid

1. **L4：`WorkflowTraceRecorder` 使用 `export class` 易误导为公共 API**

   不成立。`workflow-trace-recorder.ts` 是跨文件内部实现，必须导出给 `simple-chat-workflow.ts` 使用；`packages/ai-core/src/index.ts` 未导出该文件，且包 `exports` 只暴露 `"."`，因此不构成稳定公共 API。可保留现状。

### Retained Concern

1. **L1：`WorkflowTraceRecorder.start()` 初始状态为 `failed`，`inferTraceStatus()` 将步骤 failed 推断为 workflow degraded**

   属实但当前影响有限。关键路径异常会进入 catch 并显式 `snapshot("failed")`；成功返回路径里只有被吞掉的辅助/写回失败会表现为 degraded。建议后续通过注释或非终态内部结构降低误读。

2. **L3：demo API 默认 `includeTrace: true`**

   Core 默认仍为 false，demo 默认开启符合阶段 7 的最小可验证目标。README 已补充说明 demo 默认开启 trace 仅用于调试；后续如要降低响应体成本，可再做 UI 开关。

### Unaddressed

无。

## Suggested Fix Order

1. 可选：将 `WorkflowTraceRecorder` 的内部 pending 状态从 `"failed"` 占位改为非终态结构，降低维护误读。
2. 可选：后续在 demo UI 增加 trace 开关，避免每次调试请求都携带完整 trace。

## Verification Performed

- Read `.code-reviews/10-a013327/cursor-review.md`
- Checked `.code-reviews/README.md` follow-up format
- Inspected current implementation:
  - `packages/ai-core/src/implementations/workflow/simple-chat-workflow.ts`
  - `packages/ai-core/src/implementations/workflow/workflow-trace-recorder.ts`
  - `packages/ai-core/src/abstractions/observer.ts`
  - `apps/model-runtime-demo/app/chat-panel.tsx`
  - `apps/model-runtime-demo/app/api/chat/route.ts`
- Searched for `MockAlternativeWorkflow` / `CustomChatWorkflow` coverage
- `pnpm --filter @ying-companion/ai-core typecheck`
- `pnpm --filter @ying-companion/model-runtime-demo typecheck`
- `pnpm --filter @ying-companion/ai-core build`
- `pnpm --filter @ying-companion/ai-core lint`
- `pnpm --filter @ying-companion/model-runtime-demo lint`
- Node smoke：验证 legacy payload 顶层字段、失败 trace、宿主侧内联 Workflow 替换路径
- Node smoke：验证连接串、Bearer token、`api_key` 错误摘要 redaction
