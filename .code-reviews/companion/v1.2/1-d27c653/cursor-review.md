# 代码审查 — V1.2 Stage 02 Demo AI SDK UI（HEAD d27c653）

**日期：** 2026-07-12  
**审查工具：** Cursor  
**模型：** Composer  
**审查范围：** HEAD 最新提交 `d27c653`（Codex 完成的 Stage 02 实现）  
**引用：** `git show d27c653bef2c820887e2a2fd75d9abbac64741b7`（23 文件，+1845 / -487 行）  
**结论：** 建议

## 依据规范

- [AGENTS.md](../../../AGENTS.md)
- [docs/ai/core/principles.md](../../../docs/ai/core/principles.md)
- [docs/ai/core/working-agreements.md](../../../docs/ai/core/working-agreements.md)
- [docs/ai/core/verification.md](../../../docs/ai/core/verification.md)
- [docs/ai/core/project-context.md](../../../docs/ai/core/project-context.md)
- [.cursor/rules/ai-guide.mdc](../../../.cursor/rules/ai-guide.mdc)
- [.requirements/stages/v1.2/stage-02/02-demo-ai-sdk-ui-and-docs.md](../../../.requirements/stages/v1.2/stage-02/02-demo-ai-sdk-ui-and-docs.md)
- [apps/model-runtime-demo/README.md](../../../apps/model-runtime-demo/README.md)
- [eslint.config.mjs](../../../eslint.config.mjs) · [prettier.config.mjs](../../../prettier.config.mjs)

## 摘要

Codex 在 `d27c653` 完成了 Stage 02 主交付：`useChat` + `DemoChatTransport` + `ChatStreamUIAdapter` 替换手写 NDJSON 状态机；拆分 Chat Surface 组件；实现页面级 `webSearchEnabled` 请求开关与 Sources 展示；更新文档与 `verify:chat-ui-adapter`。架构与 stage-02 spec 高度一致，**ai-core 未引入 AI SDK 类型**，Wire Event 仍旁路进 `RunDebugPanel`。本地 `typecheck` / `lint` / `build` / `verify:stream-contract` / `verify:chat-ui-adapter` 均已通过。无 CRITICAL/HIGH 阻塞项；剩余为验证覆盖不足、availability 状态机遗留问题，以及持久化刷新失败时的错误传播，建议在合并前记录 WATCH 并补真实 E2E 证据。

## 审查统计

- 审查文件数：23（重点细读 15 个源文件 / 脚本 / 文档）
- 问题总数：7（严重 0 / 高 0 / 中 3 / 低 4）
- code-reviewer 建议：COMMENT
- 架构状态：WATCH

## 问题清单

### 严重

无。

### 高

无。

### 中

- [`apps/model-runtime-demo/app/conversation-workspace.tsx:168-184`] **modelConfig 变更仍会重置 `webSearchAvailability`**

  Stage 01 review 已指出：`useEffect` 在 `toolCalling=true` 时无条件 `setWebSearchAvailability(initialWebSearchAvailability)`，会覆盖运行时状态。Stage 02 重构后该逻辑仍在，且移除了 finish 时对 `readWebSearchAvailability(event.output.metadata)` 的同步。

  **当前影响：** 用户编辑 model 配置后，availability badge 可能短暂回到 SSR 初值，与最近一次 workflow 实际 availability 不一致。

  **修复建议：** 仅在 `toolCalling` 从 true→false 时强制降级；或在客户端用 env 等价逻辑重算，而非回写 `initialWebSearchAvailability`。

- [`apps/model-runtime-demo/app/lib/demo-chat-transport.ts:90-92`] **`onWorkflowTerminal` 失败会把持久化刷新错误当成流协议错误**

  `refreshConversationState()` 失败会 `throw`；Transport 在 `workflow:finish` / `workflow:error` 后 `await onWorkflowTerminal()`，异常进入外层 `catch`，向 UI 推送 `protocol_error` / `发送失败`，与 spec「刷新失败不得抹掉已流出文本」的精神不符。

  **修复建议：** `onWorkflowTerminal` 内部 try/catch，刷新失败只 surface warning（或写入 message metadata），不要 `controller.error()` 覆盖已成功流出的 assistant 文本。

- [`apps/model-runtime-demo/scripts/verify-chat-ui-adapter.ts`] **Adapter 验证覆盖明显少于 stage-02 spec §17.1**

  当前仅覆盖：成功搜索 + text 聚合、partial_failed、protocol_error。缺少：`output_safety_rejected`、`persistence_failed`、`tool_failed`、`cancelled`、空 sources、未知 part 不崩溃、Transport body/header 等。

  **修复建议：** 按 spec 列表补全纯函数断言；Transport 可单独小脚本或扩展现有 verifier。

### 低

- [`apps/model-runtime-demo/app/lib/demo-ui-message.ts:38-74`] **刷新后 Chat Surface 不恢复历史 Sources 卡片**

  与 spec 一致（仅保证当前流式回合 Sources；历史在 Debug `toolSnapshot`）。建议在 Demo README 已说明的前提下，视为已知限制而非缺陷。

- [`apps/model-runtime-demo/app/conversation-workspace.tsx:90-107`] **`DemoChatTransport` 随 availability 变化重建**

  `useMemo` 依赖 `displayedWebSearchAvailability.available`；`webSearchEnabled` 已通过 ref 传入，一般无问题。若未来 transport 实例变化与 `useChat` 内部缓存交互异常，可改为稳定 transport + ref 读取全部动态配置。

- [`apps/model-runtime-demo/app/lib/chat-stream-ui-adapter.ts:9-13`] **import 带 `.ts` 后缀**

  依赖 `verify:chat-ui-adapter` 的 `--experimental-strip-types`；Next/tsc 路径正常。可接受，但与其他文件风格不一致。

- [`apps/model-runtime-demo/app/components/conversation-composer.tsx`] **未暴露 Stop；`cancelled` 状态无 UI 路径**

  符合 spec §3.3（abort 语义未完整产品化前不展示 Stop）。`DemoTurnStatus` 含 `cancelled` 但当前无 `useChat.stop()` 接线，属预留。

## 架构关注项

- [`apps/model-runtime-demo/app/lib/demo-chat-transport.ts` + `chat-stream-ui-adapter.ts`] **CLEAR — 双通道架构正确**

  NDJSON → Adapter → `UIMessageChunk`；`onWireEvent` 旁路 `streamEvents[]`；未从 UIMessage 反推 Debug。`reconnectToStream()` 返回 `null`；`AbortSignal` 传给 `fetch`。

- [`apps/model-runtime-demo/app/lib/companion-runtime.ts:88-95,317-319`] **CLEAR — 页面级 Web Search 门控**

  `webSearchEnabled === true` 且 env 满足时注册 `web_search`；与 spec §8「availability + 页面 Toggle」分层一致。`attachProviderMetadata` 仍将 `webSearchAvailability` 写入 output metadata。

- [`apps/model-runtime-demo/app/lib/web-search-result-metadata.ts`] **WATCH — DTO 派生从 `web-search-runtime` 拆出**

  职责清晰；`web-search-runtime.ts` re-export 保持兼容。Adapter 只消费派生函数，未重写 normalize。

- [`apps/model-runtime-demo/app/conversation-workspace.tsx:354-402`] **WATCH — Debug 改为抽屉而非常驻侧栏**

  spec §13.1 描述桌面「Debug Pane + Chat Pane」并列；实现为 Chat 主视图 + 可打开 Debug 抽屉。功能完整，但与 spec 字面布局略有偏差，文档已部分反映。

- [`packages/ai-core`] **CLEAR — 边界未破坏**

  本 commit 未修改 ai-core；AI SDK 依赖仅在 `model-runtime-demo`。

## 合成说明

- code-reviewer：COMMENT（主路径与 spec 对齐；验证与 refresh 错误处理有改进空间）
- 架构状态：WATCH（availability 状态机、terminal 刷新错误传播、验证覆盖、Debug 布局与 spec 字面差异）
- 最终结论：**建议**（依据 OMX：architect = WATCH → 建议；可合并，跟踪 WATCH 与真实 E2E）

## 检查项

### 安全

- [x] 无硬编码密钥；`apiKeyOverride` 仅请求体
- [x] Sources URL 安全解析（`http`/`https` only，`rel="noopener noreferrer"`）
- [x] snippet 纯文本渲染，无 `dangerouslySetInnerHTML`
- [x] 错误信息不泄漏 stack / raw provider response

### 代码质量

- [x] `ConversationWorkspace` 职责下沉到 Transport / Adapter / 组件
- [x] TypeScript 类型完整；无 `any`
- [ ] Adapter 验证场景少于 spec

### 性能

- [x] 流式增量通过 `text-delta` chunk，无组件内二次拼接
- [x] `message-list` 自动滚动带用户滚动暂停，合理

### 项目规范

- [x] ai-core 不依赖 AI SDK UI
- [x] NDJSON Wire 协议未改
- [x] Host 不回写 Core Output
- [x] ESLint / typecheck / build 通过

### 架构

- [x] useChat + Custom Transport 完整接入（非半接入）
- [ ] 持久化刷新失败时的 UX 与 spec 不完全一致
- [x] 状态：WATCH（无 BLOCK）

### 验证

- [x] `pnpm --filter @ying-companion/model-runtime-demo typecheck` — 通过
- [x] `pnpm --filter @ying-companion/model-runtime-demo lint` — 通过
- [x] `pnpm --filter @ying-companion/model-runtime-demo build` — 通过
- [x] `pnpm --filter @ying-companion/model-runtime-demo verify:stream-contract` — 8/8 通过
- [x] `pnpm --filter @ying-companion/model-runtime-demo verify:chat-ui-adapter` — 通过
- [ ] `verify:web-search-contract` / `verify:web-search-workflow` — 未执行（需真实 `.env`）
- [ ] 浏览器场景 A～I — 未在本审查中执行

## 备注

- 审查对象：Codex 实现 commit `d27c653`（`feat: demo ai sdk ui 与文档收口`），working tree clean。
- OMX dual-lane：由主 agent 独立完成 code-reviewer + architect 双车道并合成（无单独子 agent 报告文件）。
- 合并 / 发布前建议：
  ```bash
  pnpm --filter @ying-companion/tool-web-search-tavily verify:web-search-contract
  pnpm --filter @ying-companion/model-runtime-demo verify:web-search-workflow
  pnpm --filter @ying-companion/model-runtime-demo dev
  ```
  并走查场景 B（Toggle 关闭不搜索）、D（实时搜索 + Sources）、I（刷新不重复消息）。
