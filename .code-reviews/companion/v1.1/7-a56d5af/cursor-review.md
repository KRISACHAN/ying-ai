# 代码审查 — V1.1 Stage 7 会话流式工作台（a56d5af）

**日期：** 2026-06-30
**审查工具：** Cursor
**模型：** Composer
**审查范围：** HEAD commit `a56d5af`
**引用：** `git show a56d5aff1a9ac68c6cd6b46366171b649ee39b1f` · 16 files · +1478 / -261
**结论：** 建议

---

## 依据规范

- [`AGENTS.md`](../../../AGENTS.md)
- [`docs/ai/core/principles.md`](../../../docs/ai/core/principles.md)
- [`docs/ai/core/working-agreements.md`](../../../docs/ai/core/working-agreements.md)
- [`docs/ai/core/verification.md`](../../../docs/ai/core/verification.md)
- [`docs/ai/core/project-context.md`](../../../docs/ai/core/project-context.md)
- [`.cursor/rules/ai-guide.mdc`](../../../.cursor/rules/ai-guide.mdc)
- [`.cursor/rules/project-context.mdc`](../../../.cursor/rules/project-context.mdc)
- [`apps/model-runtime-demo/README.md`](../../../apps/model-runtime-demo/README.md)
- [`.requirements/stages/v1.1/stage-07/07-debug-workbench-streaming.md`](../../../.requirements/stages/v1.1/stage-07/07-debug-workbench-streaming.md)
- [`eslint.config.mjs`](../../../eslint.config.mjs)
- [`prettier.config.mjs`](../../../prettier.config.mjs)

> **双车道说明：** 本次由 Cursor 按 code-reviewer + architect 维度集成审查；未使用独立子 agent 委托。

---

## 摘要

Commit `a56d5af` 完成了 V1.1 Stage 7 的主交付：`POST /api/conversations/[id]/messages` 从 `executeWorkflow()` + JSON 升级为 `streamWorkflow()` + NDJSON；新增 `chat-stream-transport.ts`（encode / 增量 parse / runtime guard）；`conversation-workspace.tsx` 引入 `ChatTurnStatus`、sessionStorage 模型配置、流式 Timeline；`model-factory` 注册 Ollama strategy；持久化失败通过 `workflow_failed + details.reason=persistence_failed` 表达；`workflow:finish` 仅在 `completeRun()` 成功后发送。

`pnpm typecheck`、`pnpm lint` 全量通过；`pnpm --filter @ying-companion/model-runtime-demo verify:stream-contract` 8/8 场景通过。整体符合 Stage 7 架构边界（未改 `ai-core`），未发现 API key 落库或 Wire 泄露。主要遗留是：**partial failure 未写入 run 快照**、**`markRunPersistenceFailure` 失败时错误语义可能漂移**、以及 Wire `details` 类型相对 Stage 2 略有扩展。

---

## 审查统计

- 审查文件数：16（commit 内）+ 关联 spec
- 问题总数：6（严重 0 / 高 0 / 中 3 / 低 3）
- code-reviewer 建议：**COMMENT**
- 架构状态：**WATCH**

---

## 问题清单

### 严重

无。

### 高

无。

### 中

- [`apps/model-runtime-demo/app/api/conversations/[id]/messages/route.ts:211-233`] **`markRunPersistenceFailure()` 未单独兜底** — `completeRun()` 失败后直接 `await markRunPersistenceFailure(...)`，若后者也抛错，会落入外层 `catch` 并发送 `details.reason=route_internal_failed`，而不是预期的 `persistence_failed`。

  **当前影响：** 数据库短暂不可用或写回冲突时，浏览器可能看到泛化 route 错误，UI 无法稳定进入 `persistence-failed` 状态。

  **修复建议：** 对 `markRunPersistenceFailure` 单独 try/catch；失败时仍发送 `workflow_failed + reason=persistence_failed`（或至少保留 persistence 语义），并记录 secondary failure 到 `error.message` / observer。

- [`apps/model-runtime-demo/app/api/conversations/[id]/messages/route.ts:183-194`] **Core `workflow:error` 后未保存 partial 文本快照** — `failRun()` 只写 observer/trace/error_summary，未按 Stage 7 §7.4 写入 `partial_output_text` 或等价 debug 字段。

  **当前影响：** partial-failed 轮在页面内可见 delta，但刷新后 run 详情无法回看已生成文本，Debug Panel 诊断能力不完整。

  **修复建议：** Route 在流式循环中聚合 delta；`failRun` / repository 扩展可选 `partialOutputText` 字段写入 `workflow_runs` JSON 快照。

- [`apps/model-runtime-demo/app/conversation-workspace.tsx:558-567`] **sessionStorage 恢复未校验 `DebugModelConfig`** — `JSON.parse(stored)` 直接 cast，无 `validateDebugModelConfig`。

  **当前影响：** 脏缓存可能导致首次 POST 400；虽服务端会拒绝，但用户体验与 Stage 7「配置表单可恢复」预期不一致。

  **修复建议：** 读取后调用 `validateDebugModelConfig`，失败则回退 `defaultModelConfig` 并清缓存。

### 低

- [`apps/model-runtime-demo/app/lib/model-config.ts:276-284`] **`retry.initialDelayMs` 读取但未使用** — Debug 表单若暴露该字段，配置不会生效；OpenAI/Ollama factory 均无对应映射。

  **修复建议：** 要么从 UI/类型移除，要么在 resolve 时映射到实际 adapter 字段并注明 Ollama/OpenAI 差异。

- [`apps/model-runtime-demo/app/lib/chat-stream-wire.ts:13`] **`SafeErrorDetails = Record<string, JsonValue>` 相对 Stage 2 扁平 primitive 有所扩展** — transport guard 允许嵌套 JSON-safe object；当前 `{ reason: "persistence_failed" }` 无问题，但与 Stage 2 `SafeWorkflowError.details` 字面契约略有不一致。

  **修复建议：** 文档化「Wire 层 details 可 JSON-safe 嵌套，Core 层仍 flat primitive」；或 guard 收敛为 flat primitive 与 Stage 2 完全一致。

- [`.gitignore:157-163`] **同 commit 混入 Playwright CLI ignore 规则** — 与 Stage 7 功能无直接关系，增加 review 噪音。

  **修复建议：** 后续独立 chore commit 更利于 bisect。

---

## 架构关注项

- [`apps/model-runtime-demo/app/api/conversations/[id]/messages/route.ts`] **WATCH** — Route / `streamConversation` / `enqueue` 分层清晰；`workflow:finish` 延迟发送、`persistence_failed` 语义、已开始流后统一 `workflow:error` 终止，均符合 Stage 7。建议将 stream 状态（delta 聚合、workflowId）收成小型 helper，避免后续加 wire_mapping_failed / abort 时再膨胀。

- [`apps/model-runtime-demo/app/lib/chat-stream-transport.ts` + `chat-stream-contract-verifier.ts`] **CLEAR** — encode / parse / validate 三件套复用同一 guard；contract verifier 新增 NDJSON 分片场景，可重复验证。

- [`apps/model-runtime-demo/app/lib/companion-runtime.ts:67-71`] **CLEAR** — `resolveDebugModelConfig(body?, env, secrets)` 作为唯一服务端 merge 入口；`debugModelConfig` 注入 metadata 且不含 apiKey，边界正确。

- [`apps/model-runtime-demo/app/conversation-workspace.tsx`] **WATCH** — 浏览器 sessionStorage + POST body + 服务端 env 的三层配置模型实现正确；`localTurnId` 防串线、delta 与 finish 文本一致性校验、error 状态映射均到位。Timeline 仅保留当前轮 wire events，刷新后依赖 DB trace——对 Debug Workbench 可接受，但应在 Stage 8 文档注明。

---

## 合成说明

- code-reviewer：**COMMENT**（无严重/高问题；3 个中等问题建议合入前或紧随 patch 修复）
- 架构状态：**WATCH**（边界清晰，有少量 spec 缺口与 Route 错误路径需补强）
- 最终结论：**建议**（依据 OMX 合成规则：architect=WATCH → 建议）

---

## 检查项

### 安全

- [x] API key 仅 POST body + env；未写入 sessionStorage / DB / Wire / trace
- [x] `debugModelConfig` metadata 不含 secrets
- [x] NDJSON 流开始后不切换 JSON 泄露内部 stack
- [ ] partial failure 持久化快照（中，未完全实现）

### 代码质量

- [x] Wire 映射单一入口；Transport 与 UI 分离
- [ ] sessionStorage 恢复缺校验（中）
- [ ] 未使用配置字段 `initialDelayMs`（低）

### 性能

- [x] 流式 enqueue 逐事件写入；无整段缓冲 finish 前全量文本
- [x] 前端 delta 增量 append，无全量重渲染历史

### 项目规范

- [x] 未修改 `packages/ai-core` 公共契约
- [x] `pnpm typecheck` / `pnpm lint` 通过
- [x] README 已同步 Stage 7 行为
- [x] Ollama 经 `model-factory` strategy 注册，无反向依赖

### 架构

- [x] Core Event / Wire Event / HTTP / React 边界明确
- [x] `workflow:finish` 语义 = Core 成功 + Demo 持久化成功
- [ ] partial-failed run 快照（WATCH）

### 验证

- [x] `pnpm typecheck` — 6 tasks successful
- [x] `pnpm lint` — 6 tasks successful
- [x] `pnpm --filter @ying-companion/model-runtime-demo verify:stream-contract` — 8/8 ok
- [ ] 浏览器 OpenAI/Ollama 实流、持久化失败人工场景（未在本审查中执行）

---

## 备注

**Stage 7 完成度（相对 spec）：**

| 项                                  | 状态                   |
| ----------------------------------- | ---------------------- |
| NDJSON Route + deferred finish      | ✅                     |
| persistence_failed 语义             | ✅（缺 mark 失败兜底） |
| OpenAI/Ollama 配置 + sessionStorage | ✅                     |
| ChatTurnStatus + Timeline           | ✅                     |
| partial_output_text on failRun      | ❌                     |
| 人工验收记录 / Stage 7 review 归档  | 待执行（07-06）        |

**建议后续验证：**

```bash
pnpm typecheck && pnpm lint
pnpm --filter @ying-companion/model-runtime-demo verify:stream-contract
# 本地：/conversations/[id] 实流 + 刷新 + Ollama 切换 + DEBUG 触发 persistence failure
```
