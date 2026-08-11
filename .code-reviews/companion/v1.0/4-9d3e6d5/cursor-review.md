# 代码审查 — 阶段 4 长期记忆与 RAG

**日期：** 2026-06-12
**审查工具：** Cursor
**模型：** Composer
**审查范围：** HEAD 最新提交 `9d3e6d5`
**引用：** `git show 9d3e6d5efb7d34f15b075731b3fa74a7b0ece5e2`
**结论：** 建议

## 依据规范

- [`AGENTS.md`](../../AGENTS.md) — `ai-core` 纯 SDK、Provider 注入、不读 env
- [`.requirements/stages/stage-04/04-memory-system.md`](../../.requirements/stages/stage-04/04-memory-system.md) — 阶段 4 可执行规范
- [`docs/ai/core/principles.md`](../../docs/ai/core/principles.md)
- [`docs/ai/core/working-agreements.md`](../../docs/ai/core/working-agreements.md)
- [`docs/ai/core/verification.md`](../../docs/ai/core/verification.md)
- [`docs/ai/core/project-context.md`](../../docs/ai/core/project-context.md)
- [`docs/ai/core/git-protocol.md`](../../docs/ai/core/git-protocol.md)
- [`.cursor/rules/ai-guide.mdc`](../../.cursor/rules/ai-guide.mdc)
- [`.cursor/rules/project-context.mdc`](../../.cursor/rules/project-context.mdc)
- [`apps/model-runtime-demo/README.md`](../../apps/model-runtime-demo/README.md)
- [`eslint.config.mjs`](../../eslint.config.mjs)
- [`prettier.config.mjs`](../../prettier.config.mjs)

## 摘要

本次提交 26 个文件（+1263 / -53 行），实现阶段 4 长期记忆闭环：`MemoryProvider` / `MemoryExtractor` 抽象演进、`SimpleChatWorkflow` 接入 recall / extract / save、新增 `packages/memory-postgres`、demo 使用 `InMemoryMemoryProvider` 展示记忆调试面板。架构方向与规范一致——`ai-core` 不连库、`MemoryExtractor` 与 `MemoryProvider` 分离、记忆失败不打断聊天、`resolveMemoryScope` 保留 `sessionId` 兼容、extract/save 同步 `await` 后返回。

`pnpm turbo run typecheck lint --filter @ying-companion/ai-core --filter @ying-companion/memory-postgres --filter @ying-companion/model-runtime-demo` 全部通过。主要缺口：`PostgresMemoryProvider` 未接入 demo（阶段 4 PR 4 未完成）、JSONB 写入方式可能导致 `messageIds` / `metadata` 类型错误、抽取缺少规范中的超时控制。无阻塞性安全漏洞；code-reviewer 建议 COMMENT；架构状态 WATCH。

## 审查统计

- 审查文件数：26
- 问题总数：10（严重 0 / 高 1 / 中 5 / 低 4）
- code-reviewer 建议：COMMENT
- 架构状态：WATCH

## 问题清单

### 严重

无。

### 高

- [`apps/model-runtime-demo/app/api/chat/route.ts:18`] [规范: `.requirements/stages/stage-04/04-memory-system.md` §18] demo 仅注入 `InMemoryMemoryProvider`，未提供 `PostgresMemoryProvider` 联调路径

  **当前影响：** `packages/memory-postgres` 已实现但无宿主接线；阶段 4 验收项「长期记忆可持久化 / 可语义召回」无法在 demo 端到端验证，PR 4 仍待完成。

  **修复建议：** 在 demo 中按 env 切换 provider（有 `DATABASE_URL` 时用 `PostgresMemoryProvider`，否则 `InMemoryMemoryProvider`），或单独增加 memory-postgres 调试入口；`memory-postgres` 包补充 README（migration 与注入示例）。

### 中

- [`packages/memory-postgres/src/postgres-memory-provider.ts:170-172`] JSONB 列 `source_message_ids` / `metadata` 使用 `JSON.stringify` 写入

  **当前影响：** node-pg 向 JSONB 传 JS 字符串时，可能存为 JSON **字符串值**而非数组/对象；读回后 `row.source_message_ids` 类型与 `MemorySource.messageIds` 不一致，审计与 debug 会失真。

  **修复建议：** 直接传 `input.source?.messageIds ?? null` 与 `memory.metadata ?? null`，由 pg 驱动序列化 JSONB。

- [`packages/ai-core/src/implementations/memory/model-memory-extractor.ts:48-75`] [规范: `.requirements/stages/stage-04/04-memory-system.md` §9.7] 抽取无 15s 超时

  **当前影响：** 抽取模型 hang 时整轮 `executeWorkflow` 阻塞，虽不影响已生成文本的逻辑路径，但 demo 请求会长时间挂起。

  **修复建议：** 用 `AbortSignal.timeout(15_000)` 或 `Promise.race` 包装 `model.generate`，超时走 extract 失败吞错路径。

- [`packages/memory-postgres/src/postgres-memory-provider.ts:106-187`] `save` 循环内逐条 embed + insert，无事务

  **当前影响：** 中途 embedding 或 insert 失败时，前面已写入的记忆不会回滚，同轮 `skipped` / `saved` 与 DB 实际状态可能不一致。

  **修复建议：** `BEGIN` / `COMMIT` 包裹整轮 save；或记录失败并返回部分 `saved` 时在 payload 标明 `partial: true`。

- [`packages/memory-postgres/src/postgres-memory-provider.ts:113-127`] 每条记忆串行调用 embedding API

  **当前影响：** 一轮抽取 N 条记忆时 save 延迟为 N 次网络往返，成本与延迟线性增长。

  **修复建议：** V1 可接受；后续批量 embed 或并行 `Promise.all`（注意速率限制）。

- [`packages/ai-core/src/implementations/memory/in-memory-memory-provider.ts:92-97`] `sameScope` 对 `companionId` 使用严格 `===`

  **当前影响：** `undefined` 与缺失 `companionId` 一致时无问题；若一方显式传 `companionId`、另一方未传，隔离与 Postgres `IS NOT DISTINCT FROM` 语义略有差异（InMemory 更严）。demo 当前均通过 `sessionId` 推导 scope，影响有限。

  **修复建议：** 统一为「双方均无 `companionId` 或值相等」的规范化比较，与 postgres 行为对齐。

### 低

- [`packages/memory-postgres/src/postgres-memory-provider.ts:56-57`] 内部 `new Pool()` 无 `close()` / `dispose()` 生命周期

  **当前影响：** 长期运行进程（非 serverless 单次请求）可能泄漏连接；demo 与短生命周期调用可接受。

  **修复建议：** 可选 `dispose()` 或由宿主注入共享 `Pool` 并负责关闭。

- [`packages/ai-core/src/abstractions/memory.ts:99-101`] `EmbeddingProvider` 抽象位于 `ai-core`

  **当前影响：** core 本身不调用 embedding，接口略超前于阶段 4 最小需求；`memory-postgres` 依赖该类型合理。

  **修复建议：** 可保持现状；若追求更瘦 core，可迁至 `memory-postgres` 并在后续 RAG 阶段再上浮。

- [`apps/model-runtime-demo/app/api/chat/route.ts:18`] 模块级单例 `demoMemory`

  **当前影响：** 多请求共享同一 InMemory 存储，靠 `sessionId` → scope 隔离；符合 demo 预期，非生产模式。

- 阶段 4 记忆 / workflow 路径无自动化测试

  **当前影响：** 与 V1「不要求单测」一致，回归靠手动场景 §16。

  **修复建议：** 后续可为 `resolveMemoryScope`、`formatMemoriesForPrompt`、`InMemoryMemoryProvider` 补轻量单测。

## 架构关注项

- [`packages/ai-core/src/core/companion-core-factory.ts:38-42`] **WATCH** — 注入 `memory` 时默认启用 `ModelMemoryExtractor`（同主模型），未注入 `memory` 时用 `NoopMemoryExtractor`。语义清晰，但每轮聊天固定 +1 次模型调用；宿主应知晓成本翻倍。

- [`packages/ai-core/src/implementations/workflow/simple-chat-workflow.ts:140-177`] **WATCH** — extract/save 在 `return output` 之前同步 `await`，符合「失败吞掉、不 fire-and-forget」的 V1 策略；流式版本需另开分支。

- [`packages/memory-postgres/`](../../packages/memory-postgres/) **WATCH** — 包结构、migration、provider 边界正确，但与 demo / monorepo 文档未闭环；阶段 4 交付物清单中「debug app postgres 注入」尚未落地。

- **CLEAR 项：** `ai-core` 无 `pg` 依赖；`DisabledMemoryProvider` 别名保留；Observer 使用 `memory:recall|extract|save:start/end` 冒号风格；Persona Prompt 条件化已实现。

## 合成说明

- code-reviewer：**COMMENT** — 实现质量良好、typecheck/lint 通过，无严重缺陷；高优先级为 demo 未接 Postgres 与 JSONB 写入问题。
- 架构状态：**WATCH** — 分层与规范对齐，PR 4 与运维闭环待补。
- 最终结论：**建议**（依据 OMX：architect = WATCH）

## 检查项

### 安全

- [x] 无硬编码密钥；SQL 使用参数化查询；`tableName` 有标识符校验
- [x] demo LLM 代理仍无鉴权（阶段 3 已知，本地调试可接受）
- [ ] 若对外暴露 demo，需速率限制与鉴权

### 代码质量

- [x] Workflow 记忆逻辑拆分为 `recallMemories` / `extractAndSaveMemories`，可读性良好
- [x] Zod 校验抽取结果；重试 1 次
- [ ] JSONB 写入类型需修正

### 性能

- [x] recall 单次 embedding（postgres）
- [ ] save 串行 embed 可优化
- [ ] 抽取无超时

### 项目规范

- [x] `ai-core` 不读 env、不连库
- [x] `MemoryExtractor` 与 `MemoryProvider` 分离
- [x] 记忆失败不打断主链路
- [ ] 阶段 4 验收清单中 Postgres 端到端项未完全满足

### 架构

- [x] `memory-postgres` 独立包实现 `MemoryProvider`
- [x] `resolveMemoryScope` 垫片
- [ ] demo 与 postgres 包文档闭环

### 验证

- [x] `pnpm turbo run typecheck lint --filter @ying-companion/ai-core --filter @ying-companion/memory-postgres --filter @ying-companion/model-runtime-demo` — 6 tasks 全部成功
- [ ] 未执行带真实 Postgres 的联调或 §16 手动场景

## 备注

- 独立 OMX 子代理（code-reviewer / architect）在当前 Cursor Task 环境不可用，本报告由主审查 lane 按双车道清单合并撰写。
- 未审查：`.requirements/stages/stage-04/04-memory-system.md` 文档变更（若与 commit 分离）。
- 建议下一步：修复 JSONB 写入 → demo 按 env 切换 Postgres → 跑 §16 四个验证场景 → 补 `memory-postgres/README.md`。
