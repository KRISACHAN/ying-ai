# 代码审查复核 — V1.2 Stage 02 Demo AI SDK UI

**日期：** 2026-07-14
**审查工具：** Codex
**审查范围：** `.code-reviews/v1.2/1-d27c653/cursor-review.md` 及当前实现
**引用：** `.code-reviews/v1.2/1-d27c653/cursor-review.md`
**结论：** 建议

## 依据规范

- `AGENTS.md`
- `docs/ai/core/working-agreements.md`
- `docs/ai/core/verification.md`
- `.requirements/stages/v1.2/stage-02/02-demo-ai-sdk-ui-and-docs.md`
- `apps/model-runtime-demo/README.md`
- 当前实现：`conversation-workspace.tsx`、`demo-chat-transport.ts`、`chat-stream-ui-adapter.ts`、`verify-chat-ui-adapter.ts`

## 摘要

Cursor review 的主结论成立：Stage 02 主架构没有阻塞问题，但 terminal 刷新错误传播、adapter/transport 验证覆盖和 Web Search availability 状态源需要收口。本次复核已修复三项中等问题：availability 不再由客户端可变 state 回写，terminal refresh 失败不再污染 UI message stream，verifier 增加 adapter 与 transport 的本地覆盖。剩余关注主要是未来 Stop/cancelled 语义和 `DemoChatTransport` 实例稳定性，均不阻塞当前 Stage 02。

## 审查统计

- 复核问题数：7
- 已采纳并修复：3
- 不成立：2
- 保留关注：2
- 未处理：0
- code-reviewer 建议：COMMENT
- 架构状态：WATCH

## 复核结论

### 已采纳并修复

- [`apps/model-runtime-demo/app/conversation-workspace.tsx`] `modelConfig` 变更重置 `webSearchAvailability`：成立，已修复。当前实现删除了客户端 `webSearchAvailability` 可变 state，`displayedWebSearchAvailability` 只由 SSR 注入的 `initialWebSearchAvailability` 与当前模型 `capabilities.toolCalling` 派生，避免 model config 变更时回写旧状态。
- [`apps/model-runtime-demo/app/lib/demo-chat-transport.ts`] `onWorkflowTerminal` 失败被当作流协议错误：成立，已修复。Transport 现在捕获 terminal refresh 回调异常，并通过 `onWorkflowTerminalError` 通知宿主；不会再进入外层 `catch`、不会 `controller.error()` 覆盖已流出的 assistant 文本。Workspace 会显示刷新 warning。
- [`apps/model-runtime-demo/scripts/verify-chat-ui-adapter.ts`] Adapter / Transport 验证覆盖不足：成立，已补强。新增覆盖 empty sources、tool failed、output safety rejected、persistence failed、未知非 Web Search tool 不崩溃，以及 fake fetch 下的 Transport method/header/body、最后一条用户消息、空 `apiKeyOverride`、`webSearchEnabled`、Wire Event 旁路和 terminal refresh failure 不破坏流。

### 不成立

- [`apps/model-runtime-demo/app/lib/demo-ui-message.ts`] 刷新后 Chat Surface 不恢复历史 Sources 卡片：不作为缺陷。Stage 02 spec 明确说明当前流式回合才展示 Sources，历史 Sources 可在 `RunDebugPanel` 的 tool snapshot 查看，且 V1.2 不新增 Sources 持久化表。
- [`apps/model-runtime-demo/app/lib/chat-stream-ui-adapter.ts`] `.ts` 后缀 import 风格问题：不作为缺陷。该 verifier 依赖 Node `--experimental-strip-types` 直接执行 TS，`.ts` 后缀是当前脚本可执行性的必要约束；本次还将 `demo-chat-transport.ts` 的本地 import 对齐为 `.ts` 后缀，以支持 Transport verifier。

### 保留关注

- [`apps/model-runtime-demo/app/conversation-workspace.tsx`] `DemoChatTransport` 随 availability 变化重建：当前没有复现功能性问题，且 `webSearchEnabled` / model config / api key 已通过 ref 读取。后续如果 `useChat` 对 transport identity 有缓存副作用，再改为完全稳定 transport + ref 读取 availability。
- [`apps/model-runtime-demo/app/components/conversation-composer.tsx`] 未暴露 Stop / `cancelled` UI 路径：符合 Stage 02 spec。当前没有完整服务端可恢复 abort 语义，因此不展示 Stop；`cancelled` 保留为未来状态，不在本阶段强行接线。

### 未处理

无。

## 验证

- `pnpm --filter @ying-companion/model-runtime-demo typecheck`：通过
- `pnpm --filter @ying-companion/model-runtime-demo lint`：通过
- `pnpm --filter @ying-companion/model-runtime-demo verify:chat-ui-adapter`：通过
- `pnpm --filter @ying-companion/model-runtime-demo verify:stream-contract`：通过
- `pnpm --filter @ying-companion/model-runtime-demo build`：通过

## 合成说明

- code-reviewer：COMMENT。Cursor 提出的中等问题均已修复或补强验证，低优先级问题已按 spec 复核。
- 架构状态：WATCH。剩余 WATCH 为未来 transport identity 与 Stop/cancelled 语义，不影响当前 Stage 02 验收。
- 最终结论：**建议**。当前实现可继续合并；建议后续若产品化 Stop/abort，再补 cancelled UI 与端到端验证。
