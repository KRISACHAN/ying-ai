# 代码审查复核 — V1.1 Stage 7 会话流式工作台

**日期：** 2026-06-30
**审查工具：** Codex
**模型：** GPT-5
**审查范围：** `.code-reviews/v1.1/7-a56d5af/cursor-review.md` 及当前实现
**引用：** `.code-reviews/v1.1/7-a56d5af/cursor-review.md`
**结论：** 批准

## 依据规范

- `.codex/skills/code-review-followup/SKILL.md`
- `AGENTS.md`
- `docs/ai/core/verification.md`
- `docs/ai/core/working-agreements.md`
- `.requirements/stages/v1.1/stage-07/07-debug-workbench-streaming.md`
- `.code-reviews/v1.1/8-a56d5af/cursor-review.md`
- 当前实现：
  - `apps/model-runtime-demo/app/api/conversations/[id]/messages/route.ts`
  - `apps/model-runtime-demo/app/conversation-workspace.tsx`
  - `apps/model-runtime-demo/app/lib/debug-repository.ts`
  - `apps/model-runtime-demo/app/lib/model-config.ts`
  - `apps/model-runtime-demo/app/lib/chat-stream-wire.ts`
  - `apps/model-runtime-demo/app/run-debug-panel.tsx`
  - `.gitignore`

## 摘要

Cursor review 的 3 个中等问题均已修复：持久化失败补充二次写失败兜底，Core `workflow:error` 后会聚合并持久化 partial 文本快照，sessionStorage 恢复改为复用 `validateDebugModelConfig()`。低优先级的 `retry.initialDelayMs` 已从 demo 请求类型与 validator 中移除，避免继续暴露未生效配置项。

2 个低优先级发现不成立：Stage 7 明确允许 Wire 层 `SafeErrorDetails = Record<string, JsonValue>`，且当前 HEAD 对应提交统计不包含 `.gitignore` 变更。复核后的有效问题均已处理，并通过 typecheck、lint、stream contract verifier。

## 审查统计

- 复核问题数：6
- 已采纳并修复：4
- 不成立：2
- 保留关注：0
- 未处理：0
- code-reviewer 建议：APPROVE
- 架构状态：CLEAR

## 复核结论

### 已采纳并修复

- [`apps/model-runtime-demo/app/api/conversations/[id]/messages/route.ts`] `markRunPersistenceFailure()` 未单独兜底的问题已修复。`completeRun()` 失败后仍尝试写入 failed run；若 `markRunPersistenceFailure()` 也失败，Route 会吞掉二次写失败并继续向浏览器发送 `workflow_failed + details.reason=persistence_failed`，保持 Stage 7 §7.3 要求的终止语义。

- [`apps/model-runtime-demo/app/api/conversations/[id]/messages/route.ts`、`apps/model-runtime-demo/app/lib/debug-repository.ts`、`apps/model-runtime-demo/app/run-debug-panel.tsx`] Core `workflow:error` 后未保存 partial 文本快照的问题已修复。Route 在流式循环中聚合 `text:delta`，`failRun()` 支持可选 `partialOutputText`，并写入 `debug_context_json.partial_output_text` 与 `workflow_id`；Debug Panel 增加 `Partial Output Text` 展示，刷新后仍可回看失败前已流出的文本。

- [`apps/model-runtime-demo/app/conversation-workspace.tsx`] sessionStorage 恢复未校验 `DebugModelConfig` 的问题已修复。客户端恢复缓存时改为调用 `validateDebugModelConfig(JSON.parse(stored))`；脏缓存会被清除并回退 `defaultModelConfig`，避免首次 POST 才暴露配置错误。

- [`apps/model-runtime-demo/app/lib/model-config.ts`] `retry.initialDelayMs` 读取但未使用的问题已修复。由于 `ai-core` 的 OpenAI-compatible retry 契约目前只支持 `primaryMaxRetries` / `fallbackMaxRetries`，本次没有扩展公共契约，而是从 demo `DebugModelConfig` 与 `readOptionalRetry()` 中移除该未生效字段。

### 不成立

- [`apps/model-runtime-demo/app/lib/chat-stream-wire.ts`] `SafeErrorDetails = Record<string, JsonValue>` 不构成当前阶段问题。Stage 7 §8.2 明确要求 `workflow:error.error.details` 是 JSON-safe plain object，并给出 `type SafeErrorDetails = Record<string, JsonValue>`；同时规则明确 `{ reason: "persistence_failed" }` 可表达，parser 应校验 JSON-safe object，而不是只允许 primitive。当前实现与 Stage 7 Wire 边界一致；Core 层 `SafeWorkflowError` 没有因此扩展错误码。

- [`.gitignore`] “同 commit 混入 Playwright CLI ignore 规则”不适用于当前复核对象。Cursor review 引用的是 `a56d5af`，当前 HEAD 为 `a4768b6`；`git show --stat --oneline --no-renames a4768b6` 显示 15 个变更文件，不包含 `.gitignore`。当前工作区 `.gitignore:158-162` 确有 Playwright CLI ignore 规则，但它不在当前提交统计内，因此不能作为本次 Stage 7 代码变更问题。

### 保留关注

无。

### 未处理

无。

## 验证

- `sed -n '1,260p' .codex/skills/code-review-followup/SKILL.md`：通过，已读取 follow-up 工作流与模板。
- `sed -n '1,260p' .code-reviews/v1.1/8-a56d5af/cursor-review.md`：通过，已读取 Cursor review 全部问题清单。
- `rg -n "persistence_failed|partial_output_text|SafeErrorDetails|details.reason|markRunPersistenceFailure|failRun" .requirements/stages/v1.1/stage-07/07-debug-workbench-streaming.md`：通过，已定位 Stage 7 关键验收语义。
- `git show --stat --oneline --no-renames a4768b6`：通过，确认当前 HEAD 统计不包含 `.gitignore`。
- `pnpm typecheck`：通过，6 个 package typecheck successful。
- `pnpm --filter @ying-companion/model-runtime-demo verify:stream-contract`：通过，8/8 stream contract 场景 successful。
- `pnpm lint`：通过，6 个 package lint successful。
- browser smoke：未运行；本轮修复集中在服务端错误路径、配置恢复与 Debug Panel 展示，已用类型检查、lint 和 stream contract verifier 覆盖代码级回归。

## 合成说明

- code-reviewer：APPROVE。有效发现均已修复，不成立项已按 Stage 7 与当前 commit 证据驳回。
- 架构状态：CLEAR。Core/Wire/HTTP/React 边界未扩张，修复均限定在 demo 宿主层。
- 最终结论：**批准**。Cursor review 中可执行问题已处理，验证通过。
