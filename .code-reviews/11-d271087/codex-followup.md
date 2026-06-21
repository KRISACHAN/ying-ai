# Cursor Review Follow-Up — Stage 8 持久化调试工作台

**Date:** 2026-06-21  
**Review Tool:** Codex  
**Model:** GPT-5  
**Review Scope:** `.code-reviews/11-d271087/cursor-review.md` and local follow-up fixes  
**Reference:** `.code-reviews/11-d271087/cursor-review.md`  
**Verdict:** Addressed Locally

## Follow-Up Summary

Cursor 的审查结论总体有效。本轮已按其 High / Medium 主要风险补齐：

- 模型已成功但持久化失败时，workflow run 会保存 trace、observer events、debugContext、
  memory/emotion/tool snapshots，并标记为 `failed`。
- 该场景的 API 会返回 `ephemeralOutput`，前端展示临时 assistant 输出并标注“刷新后可能丢失”。
- 补偿写回失败不再被 `.catch(() => {})` 静默吞掉，响应会带出“失败状态写回也失败”的安全摘要。
- run selector 已迁移到左侧调试工作台，右侧只保留消息流、错误和输入框。
- Stage 8 工作台摘要默认关闭；README 明确 DB 要求、legacy `/api/chat` 边界和摘要语义。
- `user_address` / `userAddress` 已补进 Stage 8 规格说明。

## Addressed Items

1. **High：持久化失败路径未保存完整 debug 快照**
   - 已扩展 `DebugRepository.markRunPersistenceFailure()`，接收 `output` 与 `observerEvents`。
   - 现在写入 `workflow_id`、`model`、`trace_json`、`observer_events_json`、
     `debug_context_json`、`memory_snapshot_json`、`emotion_snapshot_json`、
     `tool_snapshot_json` 与 `error_summary`。
   - 保留 user message 为 pending，不伪造 completed assistant message。

2. **High：持久化失败响应未返回临时模型输出**
   - `POST /api/conversations/[id]/messages` 现在在模型已输出但持久化失败时返回
     `ephemeralOutput.text/model/trace`。
   - `ConversationWorkspace` 会展示一条本地 assistant 消息，状态为 failed，错误摘要为
     “临时输出，刷新后可能丢失”。

3. **High：补偿写回失败被静默吞掉**
   - 移除了 messages route 中 `failRun(...).catch(() => {})` 与
     `markRunPersistenceFailure(...).catch(() => {})`。
   - 若失败状态写回也失败，API 返回包含二次失败安全摘要的 500。

4. **中：旧 `/api/chat` 与 `chat-panel.tsx` 双轨边界不清**
   - README 已说明 `/api/chat` 是 legacy 调试入口，仍接受客户端 scope / history / emotion，
     Stage 8 不依赖它作为状态真相。
   - `apps/model-runtime-demo/app/api/chat/route.ts` 增加 deprecated 注释。

5. **中：run 选择器在右侧 chat pane**
   - run selector 已移入 `RunDebugPanel` 左侧调试工作台。
   - `.chat-pane` 改为 `minmax(0, 1fr) auto auto`，右侧输入框不再被左侧内容高度拖开。

6. **中：summary 默认开启且无 UI 开关**
   - `DEFAULT_SUMMARY_OPTIONS.enabled` 已改为 `false`。
   - README 已改为“接入持久化摘要，但默认关闭；启用后可恢复”。

7. **中：README 对 `DATABASE_URL` 的说明混合两层语义**
   - README 已明确 Stage 8 工作台需要 `DATABASE_URL` 和 debug workspace migration。
   - memory provider 的 InMemory 降级说明限定为聊天运行时 provider 与 legacy `/api/chat`。

8. **低：Stage 8 规格未记录 `userAddress` 扩展字段**
   - `.requirements/stages/stage-08/08-debug-ui-and-observability.md` 已补充
     `user_address` 字段和 persona 映射。

## Retained Follow-Up

1. **migration 中 `user_address` 看似重复声明**
   - 当前保留 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS user_address TEXT`。
   - 原因：这是本地 dev migration，部分本地库可能已经跑过早期 0001；保留该语句可回填旧表。
   - 已加 SQL 注释说明这是兼容性 backfill，不是重复误写。

2. **`debug-repository.ts` 单文件过大**
   - 仍是维护性问题，但本轮不拆分，以避免扩大 diff 和引入无关重构风险。

## Verification

已通过：

```bash
pnpm --filter @ying-companion/model-runtime-demo typecheck
pnpm --filter @ying-companion/model-runtime-demo lint
pnpm --filter @ying-companion/model-runtime-demo build
```

备注：`pnpm exec prettier --write ...` 已格式化 TS/CSS/MD 文件；SQL 文件没有配置 Prettier parser，
因此未用 Prettier 格式化。
