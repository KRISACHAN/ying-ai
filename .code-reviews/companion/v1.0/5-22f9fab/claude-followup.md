# 代码审查复核 — 阶段 4 patch-0 PostgreSQL 记忆联调（commit 22f9fab）

**日期：** 2026-06-13
**审查工具：** Claude
**模型：** Opus 4.8
**审查范围：** `.code-reviews/5-22f9fab/codex-review.md` 及当前实现（已在 22f9fab 之上应用修复）
**引用：** `.code-reviews/5-22f9fab/codex-review.md`，`22f9fabde03acce30b5d38d980ae05a32e97490e`
**结论：** 建议

> 说明：先前为只读复核（仅核验、不修复）；本轮按用户指示**已对 codex 报告的全部成立问题应用修复**。下方各项记录修复内容与验证证据；唯一保留项为「缺自动化测试」，受限于仓库尚无测试框架。

## 依据规范

- `AGENTS.md`
- `docs/ai/core/principles.md`、`docs/ai/core/working-agreements.md`、`docs/ai/core/verification.md`、`docs/ai/core/project-context.md`
- `.requirements/stages/stage-04/04-memory-system-patch-0.md`（§5.3 / §8.2 / §11.4 / §14.6）
- `apps/model-runtime-demo/app/lib/memory-config.ts`、`app/api/chat/route.ts`、`app/api/memory-health/route.ts`、`app/chat-panel.tsx`、`README.md`
- `packages/memory-postgres/src/postgres-memory-provider.ts`
- `eslint.config.mjs`、`commitlint.config.mjs`

## 摘要

codex 报告的 5 个问题经核验全部成立。本轮已修复 4 个：①chat 热路径不再探测 DB，改为读取 `/api/memory-health` 写入的进程级 health snapshot（解 BLOCK，§8/§11.4）；②health 失败改用 demo 级 `UnavailableMemoryProvider`，recall/save 抛错使 workflow 走 catch、observer 发出 `memory:*:end { ok:false }`（§14.6）；③`/api/memory-health` 不再依赖完整模型生成配置，`OPENAI_MODEL`/`OPENAI_API_KEY` 缺失时仍能报告 DB 状态；④切换 env key 时先 `dispose()` 旧连接池再重建。第 5 项（缺自动化测试）因仓库无测试框架保留为关注项。结论降为 **建议**。

## 审查统计

- 复核问题数：5
- 已采纳并修复：4
- 不成立：0
- 保留关注：1（缺自动化测试，受限于仓库无测试框架）
- 未处理：0
- code-reviewer 建议：APPROVE（功能层面）/ 待补回归测试
- 架构状态：CLEAR

## 复核结论

### 已采纳并修复

- [`apps/model-runtime-demo/app/lib/memory-config.ts` / `app/api/chat/route.ts:136`] **【原 BLOCK】chat 热路径探测 DB health** — 已修复。引入进程级 `healthSnapshot`：`inspectMemoryHealth()`（仅 `/api/memory-health` 调用）执行实时 `healthCheck()` 并写入 snapshot；`resolveChatMemoryRuntime()` 改为**只读 snapshot**，不再调用 `healthCheck()`。chat 路径按 snapshot 决策（缺 URL→InMemory；error→Unavailable；connected→Postgres；冷启动无 snapshot→乐观用 Postgres，让真实 recall/save 错误经 observer 暴露）。`resolveChatMemoryRuntime` 签名去掉 `modelConfig` 参数。

- [`apps/model-runtime-demo/app/lib/memory-config.ts`] **【中】health 失败掩盖 observer 错误** — 已修复。新增 demo 级 `UnavailableMemoryProvider`（`meta.id: memory.unavailable`），其 `recall`/`save` 抛出缓存的 health error。health 失败时（inspect 与 chat 两条路径）均注入该 provider，`SimpleChatWorkflow` 走现有 catch，发出 `memory:recall:end` / `memory:save:end` 的 `ok:false`。面板状态文案与 README 同步更新为「Unavailable 严格回退，observer 可见 DB 错误」。

- [`apps/model-runtime-demo/app/api/memory-health/route.ts:29`] **【低/WATCH】health 被模型配置阻断** — 已修复。新增 `readMemoryEnvConfig()` 只读取 `DATABASE_URL` / `OPENAI_EMBEDDING_MODEL` / `MEMORY_POSTGRES_TABLE` / 可选 `OPENAI_API_KEY` / `OPENAI_BASE_URL`，不再经 `loadModelConfig`（后者要求 `OPENAI_MODEL`/`OPENAI_API_KEY` 必填）。embedding model 用默认值兜底展示；apiKey 仅在 chat/save 真正构造 embedding 时才需要。health 端点在模型配置缺失时仍能报告 DB/pgvector/表状态。

- [`apps/model-runtime-demo/app/lib/memory-config.ts:85`（原）] **【低/WATCH】旧连接池未释放** — 已修复。`resolvePostgresRuntime()` 在 key 变化、替换 `postgresRuntime` 前先 `await postgresRuntime.provider.dispose().catch(() => {})`（best-effort，dispose 失败不阻断新 runtime 构造）。

### 不成立

无。

### 保留关注

- [`apps/model-runtime-demo/app/lib/memory-config.ts`] **缺自动化测试（低）** — 成立但暂不阻塞。仓库 `ai-core` / `memory-postgres` / demo 均无测试框架（无 `test` 脚本、无 vitest/jest 配置），patch §14 亦仅要求手工验收。建议在确立测试框架后优先补：`DATABASE_URL` 缺失 / health ok / health fail（snapshot=error→chat 用 Unavailable，observer `ok:false`） / chat 路径不触发 `healthCheck` / `debugContext` 来自 workflow messages 等窄合同测试。

## 验证

- `pnpm typecheck`：通过（5/5 包）。
- `pnpm lint`：通过（5/5 包；`UnavailableMemoryProvider` 的未用参数按仓库 `void input` 惯例处理，避开 `no-unused-vars`）。
- `pnpm --filter @ying-companion/model-runtime-demo build`：通过；`/api/chat` 与 `/api/memory-health` 均为 dynamic 路由，正常注册。
- `ai-core` 边界未变：未引入 `pg`/`pgvector`/`drizzle`，未读取 `DATABASE_URL`，`resolveMemoryScope` 签名未动。
- 真实 PostgreSQL / pgvector §14.3–14.6 手工验收仍未执行（无可用 DB 环境）；建议合并前在本地按 README 跑通保存 / 召回 / 隔离 / 失败不阻塞四类场景。

## 合成说明

- code-reviewer：APPROVE（功能与边界问题已修复）
- 架构状态：CLEAR（chat 热路径不再耦合 health 探测）
- 最终结论：**建议**。原 BLOCK 与中等问题均已修复并通过 typecheck/lint/build；唯一保留项为自动化测试（受限于无测试框架）。建议补齐窄回归测试并完成 §14 真实 DB 手工验收后再正式合并。
