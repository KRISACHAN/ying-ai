# 代码审查复核 — 阶段 4 patch-0 PostgreSQL 记忆联调（commit 22f9fab）

**日期：** 2026-06-13
**审查工具：** Claude
**模型：** Opus 4.8
**审查范围：** `.code-reviews/5-22f9fab/codex-review.md` 及当前实现（HEAD 同 22f9fab，未做修复）
**引用：** `.code-reviews/5-22f9fab/codex-review.md`，`22f9fabde03acce30b5d38d980ae05a32e97490e`
**结论：** 需修改

> 说明：本次为**只读复核**，按用户要求**先不修复**，仅核验 codex 报告每项是否成立，给出处理建议与修复优先级，供后续决策。下方「未处理」即代表代码尚未改动。

## 依据规范

- `AGENTS.md`
- `docs/ai/core/principles.md`、`docs/ai/core/working-agreements.md`、`docs/ai/core/verification.md`、`docs/ai/core/project-context.md`
- `.requirements/stages/stage-04/04-memory-system-patch-0.md`（§5.3 / §8.2 / §11.4 / §14.6）
- `apps/model-runtime-demo/app/lib/memory-config.ts`、`app/api/chat/route.ts`、`app/api/memory-health/route.ts`
- `packages/memory-postgres/src/postgres-memory-provider.ts`
- `eslint.config.mjs`、`commitlint.config.mjs`

## 摘要

逐项核验后，codex 报告的 5 个问题**全部成立**，且均仍存在于当前代码中（无一已在后续提交修复）。其中 1 个中等问题被 architect 标为 BLOCK：chat 热路径每次请求都执行 `healthCheck()` 三条 DB 查询，直接违反 patch §8/§11.4「health 属启动 / 面板加载，不进 chat 热路径」。另一中等问题（health 失败回退 Noop 导致 observer 显示 `ok:true` 空结果）违反 §14.6「DB 失败时 observer 显示 error」。3 个低优先级问题（health 被模型配置阻断、旧连接池未释放、缺回归测试）均属实。结论维持 **需修改**。

## 审查统计

- 复核问题数：5
- 已采纳并修复：0
- 不成立：0
- 保留关注：1（缺自动化测试，受限于仓库无测试框架）
- 未处理：4
- code-reviewer 建议：REQUEST CHANGES
- 架构状态：BLOCK

## 复核结论

### 已采纳并修复

无。（本次按用户要求不修复。）

### 不成立

无。codex 报告 5 项经核验全部属实。

### 保留关注

- [`apps/model-runtime-demo/app/lib/memory-config.ts`] **缺自动化测试（低）** — 成立。本 commit 引入 fallback / health / scope / debugContext 等关键行为却无自动化测试。但当前仓库（`ai-core`、`memory-postgres`、demo）**均未建立测试框架**（无 `test` 脚本、无 vitest/jest 配置），patch §14 也仅要求手工验收场景。建议在补测试前先确立测试框架，或至少把 §14.3–14.6 固化为可脚本化的 smoke 步骤；在框架就绪前作为保留关注，不阻塞，但应在 fallback/observer 修复后优先补「DATABASE_URL 缺失 / health ok / health fail / chat 不触发 heavy health / debugContext 来自 workflow messages」窄测试。

### 未处理

> 以下 4 项已确认成立但本次未改动，按建议修复优先级排列。

- [`apps/model-runtime-demo/app/api/chat/route.ts:136` → `lib/memory-config.ts:142,112` → `packages/memory-postgres/src/postgres-memory-provider.ts:232`] **【BLOCK，最高优先级】chat 热路径探测 DB health** — 成立。`POST /api/chat` 每次调用 `resolveChatMemoryRuntime()`，其实现直接 `return inspectMemoryHealth()`，进而 `await runtime.provider.healthCheck()`，发起 `SELECT 1` / `pg_extension` / `to_regclass` 三条查询。这违反 patch §8/§11.4 对 health 检查位置的约束，DB 抖动会放大聊天延迟，并让聊天请求承担面板观测职责。
  **建议：** 拆分「provider 构造 / chat provider 选择 / health inspection」。`/api/memory-health` 执行实时 `healthCheck()` 并写入进程级 health snapshot；chat 路径只读 snapshot 做 provider 决策，绝不在热路径探测 DB。冷启动（无 snapshot）时可乐观使用 Postgres，让真实 recall/save 错误经 observer 暴露。

- [`apps/model-runtime-demo/app/lib/memory-config.ts:124`] **【中】health 失败回退 Noop 掩盖 observer 错误** — 成立。health 失败时返回 `NoopMemoryProvider`，其 `recall`/`save` 成功返回空集，`SimpleChatWorkflow` 走成功路径，observer 记录 `memory:*:end { ok:true }` 空结果，违反 §14.6「DB 失败时 observer 显示 error」。调试者无法从 workflow 事件区分「配置故障」与「确实没有记忆」。
  **建议：** 保留严格 fallback（不静默回 InMemory），但保留失败证据：注入 demo 级 `UnavailableMemoryProvider`，其 `recall`/`save` 抛出缓存的 health error，让 workflow 走现有 catch 发出 `memory:*:end { ok:false }`。面板 `meta.id` 用 `memory.unavailable` 与 InMemory/Postgres 区分。

- [`apps/model-runtime-demo/app/api/memory-health/route.ts:29`] **【WATCH/低】health 被模型配置阻断** — 成立。health 端点经 `loadModelConfig(process.env)` 读取完整模型配置，而 `lib/model-config.ts:8` 要求 `OPENAI_API_KEY` 与 `OPENAI_MODEL` 必填。DB/pgvector health 本不需要模型生成配置；模型配置缺失时 health 端点 500，反而无法报告 `DATABASE_URL` 缺失 / 表缺失 / pgvector 状态。
  **建议：** health 端点只读 DB 所需 env；embedding model 用 `OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small"` 展示；OpenAI API key 仅在聊天 / 保存路径真正构造 embedding 时校验。

- [`apps/model-runtime-demo/app/lib/memory-config.ts:85`] **【WATCH/低】旧连接池未释放** — 成立。env key 变化时第 85 行直接覆盖 `postgresRuntime`，未对旧 `PostgresMemoryProvider` 调 `dispose()`（`postgres-memory-provider.ts` 的 `dispose` 会 `pool.end()`）。dev 热重载或切换 `DATABASE_URL`/table/model 时可能泄露旧连接池。
  **建议：** 替换前 `await postgresRuntime.provider.dispose().catch(() => {})`（best-effort，不阻断新 runtime 构造）。

## 验证

- 本次未改动代码，未运行修复相关验证。
- 工作树确认为 clean，与 22f9fab 实现一致：`git status --short`（无输出）。
- 复核仅基于静态阅读与 `grep` 定位，逐项行号已在上文核对命中。
- 真实 PostgreSQL / pgvector §14.3–14.6 手工验收仍未执行（无可用 DB 环境）。

## 合成说明

- code-reviewer：REQUEST CHANGES
- 架构状态：BLOCK
- 最终结论：**需修改**。chat 热路径 health 耦合为 architect BLOCK，且 observer 错误可见性问题违反 §14.6，二者均未修复；其余低优先级问题成立。建议修复顺序：①拆分 health snapshot、chat 路径不探测 DB → ②Unavailable provider 保留 observer 错误 → ③health 端点解耦模型配置 → ④替换 runtime 前 dispose → ⑤待测试框架就绪补窄回归测试。
