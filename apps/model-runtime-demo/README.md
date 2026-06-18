# @ying-companion/model-runtime-demo

阶段 1～6 的 Next.js 调试应用，只负责输出环境变量读取结果、Core 初始化信息、模型响应、重试与降级结果，以及聊天、记忆、情绪、工具调用主链路的可观测输出。

## 环境变量

```txt
OPENAI_API_KEY=
OPENAI_BASE_URL=
OPENAI_MODEL=
OPENAI_FALLBACK_MODEL=
OPENAI_PRIMARY_MAX_RETRIES=1
OPENAI_FALLBACK_MAX_RETRIES=1
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
DATABASE_URL=
MEMORY_POSTGRES_TABLE=companion_memories
```

`OPENAI_FALLBACK_MODEL` 为空时不启用降级。重试次数为空或非法时按 `0` 处理。

长期记忆 provider 按以下固定策略选择（不静默回退，便于区分「真连上 Postgres」与「配置错误」）：

- `DATABASE_URL` 缺失：使用进程内 `InMemoryMemoryProvider`（重启丢失），面板显示 `disabled`；
- `DATABASE_URL` 存在且 health 通过：使用 `PostgresMemoryProvider`，面板显示 `connected` / pgvector enabled；
- `DATABASE_URL` 存在但 health 失败（连接 / pgvector / 表缺失）：严格使用 demo 级 `UnavailableMemoryProvider`（recall/save 抛出 health error），面板显示 `error` 与具体原因，聊天仍可用，且 Observer Events 中本轮 `memory:*:end` 显示 `ok:false`，便于区分配置故障与「确实没有记忆」。

使用 PostgreSQL 前先按
[`packages/memory-postgres/README.md`](../../packages/memory-postgres/README.md)
准备本地 PostgreSQL + pgvector，并执行
`packages/memory-postgres/migrations/0001_create_companion_memories.sql`，确保 `pgvector` 可用、
`companion_memories` 表存在，且 embedding 维度与 `OPENAI_EMBEDDING_MODEL` 一致
（`text-embedding-3-small` → `vector(1536)`）。Demo 应用会读取 `DATABASE_URL` 创建并持有
`pg.Pool`，再注入 `PostgresMemoryProvider`；provider 不创建也不关闭连接池。

health 状态由 `GET /api/memory-health` 在页面加载与每轮聊天后刷新，并写入进程级 snapshot；chat 请求路径只读该 snapshot 选择 provider，不再探测 DB（patch-0 §8/§11.4）。冷启动尚无 snapshot 时，chat 会乐观使用 Postgres，真实 recall/save 错误经 Observer 暴露，页面下次刷新 health 后即对齐。

## 本地运行

```bash
cp apps/model-runtime-demo/.env.example apps/model-runtime-demo/.env
pnpm --filter @ying-companion/model-runtime-demo dev
```

启用真实 PostgreSQL 记忆的最短路径：

```bash
createdb ying_companion_dev
psql -d ying_companion_dev -f packages/memory-postgres/migrations/0001_create_companion_memories.sql
```

然后填写 `apps/model-runtime-demo/.env` 中的 `OPENAI_API_KEY`、`OPENAI_MODEL` 与
`DATABASE_URL`。本地默认可使用：

```txt
DATABASE_URL=postgresql://localhost:5432/ying_companion_dev
```

打开 Next.js 输出的本地地址：

- 「AI Core 调试输出」点击「调用模型」查看 Core Provider inspection、流式输出、最终使用模型、是否降级、尝试次数与错误摘要。
- 「聊天主链路调试」输入消息后发送，经服务端 `app/api/chat` 路由调用 `core.executeWorkflow()`，展示最终回复、长期记忆召回 / 抽取 / 保存结果、Persona / Safety / 模型原始输出，以及服务端收集后回传的 Observer 事件。history 由页面维护并随请求传入，Core 不保存。
  - **Memory DB Panel**：展示 provider meta、DB / pgvector / 表状态、embedding 模型与向量维度、recall（含 score）。
  - **滚动摘要控件**：默认关闭（`summaryOptions.enabled=false`）。启用后使用 demo 进程内 `InMemorySummaryProvider` 保存当前会话摘要，重启、热重载、多 worker 下不保证保留或一致，不是生产持久化方案。`recentMessageLimit` 必须小于 `summarizeTriggerMessageCount`，用于验证旧消息压缩成 summary、Prompt 只保留 summary + recent history。
  - **Prompt / Context Debug Panel**：来自 `ChatWorkflowOutput.metadata.debugContext`，100% 还原本轮发给模型的 system prompt、Conversation Summary、长期记忆块、Recent History 与当前用户输入。滚动摘要开启后重点查看 `summaryContext`、`recentHistory`、`summarizedMessages`、Conversation Summary、Updated Summary 与 Summary Events。
  - **Tools Panel**：demo 宿主显式注入 `LocalToolRegistry`，默认注册 `get_current_time`、`search_memory`、`get_emotion_state` 三个本地工具；面板展示已注册工具、模型请求的 tool call、工具执行结果、是否发生二次生成与 tool observer events。
  - **scope 切换**：页面可改 `sessionId` 与 `companionId`，请求体显式传 `scope`，用于验证记忆隔离（不同 ownerId / companionId 不互相召回）。
