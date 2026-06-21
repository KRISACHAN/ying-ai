# 代码审查 — Stage 8 持久化调试工作台（commit d271087）

**日期：** 2026-06-21  
**审查工具：** Cursor  
**模型：** Composer  
**审查范围：** commit `d271087`（`feat(model-runtime-demo): 添加持久化调试工作台`）  
**引用：** `git show d271087` · 30 files · +3926 / -18  
**结论：** 需修改

## 依据规范

- [AGENTS.md](../../AGENTS.md)
- [docs/ai/core/principles.md](../../docs/ai/core/principles.md)
- [docs/ai/core/working-agreements.md](../../docs/ai/core/working-agreements.md)
- [docs/ai/core/verification.md](../../docs/ai/core/verification.md)
- [docs/ai/core/project-context.md](../../docs/ai/core/project-context.md)
- [.requirements/stages/stage-08/08-debug-ui-and-observability.md](../../.requirements/stages/stage-08/08-debug-ui-and-observability.md)
- [apps/model-runtime-demo/README.md](../../apps/model-runtime-demo/README.md)
- [.cursor/rules/ai-guide.mdc](../../.cursor/rules/ai-guide.mdc)
- [eslint.config.mjs](../../eslint.config.mjs) · [prettier.config.mjs](../../prettier.config.mjs)

## 摘要

Codex 在 `apps/model-runtime-demo` 内交付了 Stage 8 的主体能力：debug 表 migration、事务 A/B/C 写回、`LOCAL_DEBUG_OWNER`（`custom`）、伴侣/会话/消息 CRUD、左调试右对话布局、长期记忆管理页与 `CompanionMemoryAdminRepository`，且**未修改 `packages/ai-core`**。lint / typecheck 已通过。

整体架构与 Stage 8 规格高度对齐，可作为调试工作台使用。但在**持久化失败路径**、**遗留 `/api/chat` 双轨**、以及**部分 UI/规格细节**上仍有需修复项，建议合并前处理 High 级问题。

> **OMX 说明：** Cursor Task 工具不支持 `code-reviewer` / `architect` 子 agent 并行委托；以下 code-reviewer 与 architect 结论由本审查按双车道维度集成完成。

## 审查统计

- 审查文件数：30（重点深读 ~15）
- 问题总数：11（严重 0 / 高 3 / 中 5 / 低 3）
- code-reviewer 建议：**REQUEST CHANGES**
- 架构状态：**WATCH**

## 问题清单

### 严重

无。

### 高

- [`apps/model-runtime-demo/app/api/conversations/[id]/messages/route.ts:102-121`] Core 已成功、`completeRun` 失败时，`markRunPersistenceFailure` 仅 UPDATE `workflow_runs.status/error_summary`，**未持久化本轮 trace / observer / debugContext**。

  **当前影响：** 调试工作台在「模型成功、写库失败」场景下丢失最有价值的排障数据，与 Stage 8「每轮可回看调试信息」目标冲突。

  **修复建议：** 扩展 `markRunPersistenceFailure`（或新增事务 C 变体），在 user 保持 `pending` 的前提下，将已生成的 `output` / `observerEvents` 写入 `workflow_runs` 的 JSON 快照字段；响应体按 §9.2 附带临时 `output.text`（及可选 trace 摘要）。

- [`apps/model-runtime-demo/app/api/conversations/[id]/messages/route.ts:113-120`] §9.2 要求持久化失败时「可在当前页面临时展示生成文本」；当前 500 响应**仅返回 error.message**，不含模型输出。

  **修复建议：** `{ ok: false, error, ephemeralOutput?: { text, model, trace? } }`，前端在 `conversation-workspace.tsx` 显著提示「刷新后可能丢失」并展示文本。

- [`apps/model-runtime-demo/app/api/conversations/[id]/messages/route.ts:91-99`] `failRun` / `markRunPersistenceFailure` 使用 `.catch(() => {})` 静默吞错。

  **当前影响：** 若事务 C 也失败，DB 可能长期残留 `user=pending` + `run=running`，刷新后 UI 与真实状态不一致。

  **修复建议：** 至少记录服务端 error；对无法回写 failed 态的情况返回明确 500，避免假装已处理。

### 中

- [`apps/model-runtime-demo/app/chat-panel.tsx`] + [`apps/model-runtime-demo/app/api/chat/route.ts`] 旧聊天链路（805 行 ChatPanel + 客户端可控 scope/history/emotion）**仍完整保留但未接入新 UI**。

  [规范: Stage 8 §6.3] 新 API 已正确收紧信任边界，旧 API 仍允许客户端传 scope，形成**双轨调试入口**，增加维护成本与安全混淆风险。

  **修复建议：** 明确 deprecate：旧 route 顶部加注释 + README 标注移除计划；或拆到 `/debug/legacy-chat` 并限制仅本地；长期应删除 `chat-panel.tsx` 或改为调用新 messages API。

- [`apps/model-runtime-demo/app/conversation-workspace.tsx:85-94`] 持久化失败时前端把 optimistic 消息标为 `failed`，但服务端 user message 仍为 `pending`（§9.2）。

  **当前影响：** 刷新后同一轮显示从 failed 变为 pending，用户困惑。

  **修复建议：** 持久化失败分支保留 `pending` 或单独 `persist_failed` 展示态，并与服务端一致。

- [`apps/model-runtime-demo/app/conversation-workspace.tsx:172-189`] 「本轮 run」选择器放在**右侧 chat-pane**，Stage 8 §5.4 期望 run 切换在**左侧调试工作台**。

  **修复建议：** 将 run selector 移入 `RunDebugPanel`；assistant 消息点击仍联动左侧。

- [`apps/model-runtime-demo/app/lib/companion-runtime.ts:23-27`] `DEFAULT_SUMMARY_OPTIONS.enabled: true` 写死，新 UI **无 summary 开关**（旧 ChatPanel 有）。

  [规范: Stage 8] 规格允许默认关闭以控成本；当前行为增加每轮 LLM 摘要调用，且无法在 UI 验证「关闭摘要」路径。

  **修复建议：** 恢复默认 `enabled: false`，或在对话页/调试栏提供开关并持久化到 conversation 级配置。

- [`apps/model-runtime-demo/README.md:25-27`] vs [`apps/model-runtime-demo/app/lib/debug-db.ts:10-12`] README 仍描述 `DATABASE_URL` 缺失时 InMemory 记忆 fallback，但 Stage 8 宿主表**强制要求** `DATABASE_URL`（否则 `getDebugPool` 抛错）。

  **修复建议：** README 区分「Stage 8 工作台最低要求」与「仅 memory provider fallback」两层说明。

### 低

- [`apps/model-runtime-demo/migrations/0001_create_debug_workspace.sql:8-8,20-21`] `user_address` 在 CREATE TABLE 与 `ADD COLUMN IF NOT EXISTS` 重复定义，migration 可读性略差（功能上无害）。

- [`apps/model-runtime-demo/app/lib/debug-repository.ts`] 单文件 ~1000 行，repository + summary provider + 快照序列化耦合，后续 08-06+ 迭代时可拆分为 `message-run-repository` / `summary-store`。

- [`apps/model-runtime-demo/app/companion-form.tsx:22-23`] 新增 `userAddress`（用户称呼）未写入 Stage 8 规格文档，属合理产品扩展；建议在 `.requirements/stages/stage-08/` 补一句或标为 demo 扩展字段。

## 架构关注项

- **WATCH** — [`apps/model-runtime-demo/app/lib/debug-db.ts:7-18`] 全局单例 `Pool` 与 `DebugRepository` / `CompanionMemoryAdminRepository` 共用，边界清晰；但 Stage 8 **硬依赖 Postgres**，与 README 中「无 DB 仍可部分调试」叙述不一致，需在文档层统一预期。

- **WATCH** — 新旧双 API（`/api/conversations/.../messages` vs `/api/chat`）长期并存会增加宿主边界漂移风险；Stage 8 完成后应收敛为单入口。

- **CLEAR（对齐项）**
  - 事务 A/B/C：`createPendingRun` / `completeRun` / `failRun` 实现与 §4.6 一致
  - `workflow_runs → messages` 单向关联，无 `debug_messages.workflow_run_id`
  - `getCompletedHistory` 仅 `status=completed`，pending/failed 不进 Core history
  - `CompanionMemoryAdminRepository`：content 变更 re-embed、scope 删除、type+content 去重
  - 左调试右对话：`.conversation-grid` + `RunDebugPanel` 在 DOM/CSS 顺序正确
  - 删除会话 CASCADE 宿主表，不触达 `companion_memories`
  - `packages/ai-core` 本 commit 无改动

## 合成说明

- code-reviewer：**REQUEST CHANGES**（持久化失败路径与遗留双轨 API）
- 架构状态：**WATCH**（整体宿主/Core 边界正确，文档与 API 收敛需跟进）
- 最终结论：**需修改**（无 CRITICAL，但 3 项 High 应在合并前或紧随 08-05 修复）

## 检查项

### 安全

- [x] 新 messages API 不接受客户端 scope/history/emotion
- [ ] 旧 `/api/chat` 仍接受客户端 scope — 本地调试可接受，但应 deprecate
- [x] API 响应未见硬编码密钥；错误摘要走 `toSafeErrorMessage`

### 代码质量

- [x] TypeScript / ESLint 通过（`pnpm turbo run lint typecheck --filter @ying-companion/model-runtime-demo`）
- [ ] 遗留 `chat-panel.tsx` 未使用，增加维护负担

### 性能

- [x] 历史消息 LIMIT 50；run 列表按需拉详情
- [ ] 摘要默认开启可能增加每轮 LLM 成本（中）

### 项目规范

- [x] ai-core 未读 env、未连 DB
- [x] Stage 8 核心数据模型与事务规则基本符合
- [ ] §9.2 临时展示生成文本未实现
- [ ] Summary 默认策略与规格「默认关闭」建议不一致

### 架构

- [x] 宿主持久化与 Core 编排分离清晰
- [x] 长期记忆 CRUD 经 AdminRepository，未在 route 内拼 SQL
- [ ] 双 API 入口 — WATCH

### 验证

- [x] lint + typecheck 已执行通过
- [ ] Stage 8 手工验收清单（README §Stage 8）未在本审查中运行时验证

## 备注

- 审查 commit：`d27108789f18a2cef825a626ed763f08fe9a6e5d`
- OMX 并行子 agent 在 Cursor 中不可用；本报告已集成 code-reviewer + architect 维度。
- 未审查范围：`packages/ai-core`（本 commit 无变更）、生产部署与安全加固。
- 建议验证命令：
  ```bash
  psql -d ying_companion_dev -f apps/model-runtime-demo/migrations/0001_create_debug_workspace.sql
  pnpm --filter @ying-companion/model-runtime-demo dev
  # 按 README Stage 8 手工验收 1～5
  ```
