# 代码审查复核 — 阶段 4 长期记忆与 RAG

**日期：** 2026-06-12
**审查工具：** Codex
**模型：** GPT-5
**审查范围：** `.code-reviews/4-9d3e6d5/cursor-review.md` 及当前实现
**引用：** `.code-reviews/4-9d3e6d5/cursor-review.md`
**结论：** 建议

## 依据规范

- `AGENTS.md`：ai-core 纯 SDK、按阶段规格执行、验证后再声明完成
- `.codex/skills/code-review-followup/SKILL.md`：逐条复核、分类、写入 `{model}-followup.md`
- `.code-reviews/4-9d3e6d5/cursor-review.md`：本次复核对象
- `.requirements/stages/stage-04/04-memory-system.md`：长期记忆、RAG、PostgreSQL + pgvector、demo 可观测验收
- `docs/ai/core/verification.md`：验证命令与证据要求
- 当前代码：
  - `apps/model-runtime-demo/app/api/chat/route.ts`
  - `packages/ai-core/src/implementations/memory/model-memory-extractor.ts`
  - `packages/ai-core/src/implementations/memory/in-memory-memory-provider.ts`
  - `packages/memory-postgres/src/postgres-memory-provider.ts`

## 摘要

Cursor review 的总体判断成立：Stage 04 的 core 分层方向正确，`ai-core` 没有引入数据库依赖，workflow 已接入 recall / extract / save，且目标包 typecheck/lint 通过。本轮已修复 demo PostgreSQL provider 接线、JSONB 写入、抽取超时、Postgres save 事务与 provider 生命周期。仍保留的关注点是 save 批量 embedding 优化和自动化测试覆盖；真实 PostgreSQL / pgvector 联调仍需要可用数据库环境。

## 审查统计

- 复核问题数：10
- 已采纳并修复：5
- 不成立：3
- 保留关注：2
- 未处理：0
- code-reviewer 建议：COMMENT
- 架构状态：WATCH

## 复核结论

### 已采纳并修复

- `apps/model-runtime-demo/app/api/chat/route.ts`、`apps/model-runtime-demo/package.json`、`apps/model-runtime-demo/.env.example`、`apps/model-runtime-demo/README.md`：已补 demo PostgreSQL provider 接线路径。`DATABASE_URL` 为空时继续使用 `InMemoryMemoryProvider`；存在 `DATABASE_URL` 时使用 `PostgresMemoryProvider + OpenAIEmbeddingProvider`，并通过 `OPENAI_EMBEDDING_MODEL` / `MEMORY_POSTGRES_TABLE` 配置 embedding 模型与表名。demo `dev` / `build` 脚本也会先构建 `ai-core` 与 `memory-postgres`。
- `packages/memory-postgres/src/postgres-memory-provider.ts`：已修复 JSONB 写入。`source_message_ids` 直接传 `input.source?.messageIds ?? null`，`metadata` 直接传 `memory.metadata ?? null`，由 `pg` 负责 JSONB 序列化，避免把数组/对象写成 JSON 字符串值。
- `packages/ai-core/src/implementations/memory/model-memory-extractor.ts`：已补抽取超时。`ModelMemoryExtractorOptions.timeoutMs` 默认 `15_000`，超时会抛出安全摘要错误，并走 workflow 现有的 extract 失败吞错路径。
- `packages/memory-postgres/src/postgres-memory-provider.ts`：已给同轮 `save` 增加 `BEGIN` / `COMMIT` / `ROLLBACK`。中途 embedding 或 insert 失败时不会留下同轮部分写入。
- `packages/memory-postgres/src/postgres-memory-provider.ts`：已增加 `dispose()` 生命周期方法。provider 自建 `Pool` 时 `dispose()` 会关闭连接；宿主注入共享 `Pool` 时不越权关闭。

### 不成立

- `packages/ai-core/src/implementations/memory/in-memory-memory-provider.ts`：Cursor 对 `sameScope` 的担忧不成立。当前逻辑要求 `ownerType`、`ownerId`、`companionId` 全部一致；双方都无 `companionId` 时匹配，一方有值另一方无值时不匹配。这与 `PostgresMemoryProvider` 当前使用的 `companion_id IS NOT DISTINCT FROM $4` 严格 scope 语义一致。
- `packages/ai-core/src/abstractions/memory.ts`：`EmbeddingProvider` 位于 `ai-core` 不违背 Stage 04。规格 §10.2 明确允许 embedding 抽象放在 `packages/ai-core`，具体实现不放入 `ai-core` 即可；当前具体 OpenAI-compatible embedding 实现在 `packages/memory-postgres`。
- `apps/model-runtime-demo/app/api/chat/route.ts`：模块级 `demoMemory` 对 demo 是合理设计。它用 `sessionId -> MemoryScope` 隔离请求，并且页面文案明确说明长期记忆由服务端内存 provider 维护、重启即丢失；不是生产存储方案。

### 保留关注

- `packages/memory-postgres/src/postgres-memory-provider.ts`：`save` 中逐条 embed + insert 问题成立。Stage 04 规格写的是“尽量批量 embed”，当前实现可作为 V1 最小可用版本，但延迟会随记忆条数线性增长。建议后续扩展 `EmbeddingProvider` 支持 batch，或在 provider 内受控并发。
- 阶段 4 自动化测试缺失问题成立但不阻塞当前用户约束。用户 V1 明确“不需要单元测试与 e2e，只需要功能没有问题”；仍建议后续补轻量单测覆盖 `resolveMemoryScope`、`formatMemoriesForPrompt`、`InMemoryMemoryProvider` 和 JSONB 映射。

### 未处理

无。

## 验证

- `pnpm turbo run typecheck lint --filter @ying-companion/ai-core --filter @ying-companion/memory-postgres --filter @ying-companion/model-runtime-demo`：通过，6 tasks successful。
- `pnpm --filter @ying-companion/ai-core --filter @ying-companion/memory-postgres build`：通过。
- `pnpm --filter @ying-companion/model-runtime-demo build`：通过，Next.js production build 成功。
- `pnpm exec prettier --check apps/model-runtime-demo/app/api/chat/route.ts apps/model-runtime-demo/package.json apps/model-runtime-demo/README.md packages/ai-core/src/implementations/memory/model-memory-extractor.ts packages/memory-postgres/src/postgres-memory-provider.ts .code-reviews/4-9d3e6d5/codex-followup.md`：通过。
- 未运行真实 PostgreSQL / pgvector 联调：本轮未配置数据库连接，未执行 migration。
- 未运行 Stage 04 §16 手动场景：需要有效模型与可选数据库环境。

## 合成说明

- code-reviewer：COMMENT。高优先级交付缺口与 JSONB 类型问题已修复，仍有非阻塞优化项。
- 架构状态：WATCH。`ai-core` 边界清晰，`memory-postgres` 独立包方向正确；真实 PostgreSQL / pgvector 环境联调仍需补证据。
- 最终结论：**建议**。本轮修复了 Cursor review 中需要优先处理的问题，但仍建议在可用数据库环境下跑 Stage 04 §16 场景后再视为完全批准。
