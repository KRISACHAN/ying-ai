# @ying-companion/model-runtime-demo

阶段 1～8 的 Next.js 调试应用。它不是正式用户产品，而是本地 AI Companion Core
调试工作台：创建伴侣、创建/继续/删除会话、持久化消息/情绪/摘要、回看 Workflow
Trace，并在独立页面管理长期记忆。

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

V1.1 Persona Profile 字段保存在 `debug_companions`：

- `user_display_name TEXT`：用户显示名；
- `user_address TEXT`：伴侣对用户的建议日常称呼；
- `profile JSONB`：当前包含 `hobbies?: string[]`；
- `appearance JSONB`：当前包含 `heightCm`、`weightKg`、`hair`、`bodyType`、`additionalTraits`。

Stage 8 工作台（`/`、`/conversations/*`、`/companions/*`）需要 `DATABASE_URL`
和 `apps/model-runtime-demo/migrations/0001_create_debug_workspace.sql`，否则会直接报错。下面的长期记忆降级策略仅适用于聊天运行时的 memory provider，以及 legacy `/api/chat` 调试入口。

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
psql -d ying_companion_dev -f apps/model-runtime-demo/migrations/0001_create_debug_workspace.sql
psql -d ying_companion_dev -f apps/model-runtime-demo/migrations/0002_extend_debug_companion_persona.sql
```

然后填写 `apps/model-runtime-demo/.env` 中的 `OPENAI_API_KEY`、`OPENAI_MODEL` 与
`DATABASE_URL`。本地默认可使用：

```txt
DATABASE_URL=postgresql://localhost:5432/ying_companion_dev
```

首次 companion 读写会自动补齐 V1.1 Persona Profile 列，便于旧本地库继续运行；新环境和
CI 仍建议显式执行上面的 migration，确保 schema 版本可审计。

打开 Next.js 输出的本地地址：

- `/`：会话历史列表。选择已有伴侣创建新会话，或进入伴侣创建页。
- `/companions/new`、`/companions/[id]/edit`：配置 Persona，包含用户显示名、建议称呼、兴趣、外貌与补充指令；服务端会在每轮聊天时将最新配置注入 `DefaultPersonaProvider`。
- `/conversations/[id]`：左侧调试工作台，右侧纯对话。刷新后消息、情绪、摘要和历史 run 仍可恢复。
- `/companions/[id]/memories`：长期记忆 CRUD。新增/修改 content 会重新 embedding；列表不展示 score，score 只在对话页本轮 recalled memories 中出现。
- `/debug/model-runtime`：阶段 1 Model Runtime 独立验证入口，查看 Provider inspection、流式输出、最终使用模型、是否降级、尝试次数与错误摘要。

对话发送经 `POST /api/conversations/[id]/messages`，客户端只提交 `message`。
服务端根据 conversation / companion 构造 `scope`、history、emotion、summaryScope 与
Provider，调用 `core.executeWorkflow()` 后短事务写回 assistant message、workflow run、
conversation emotion 与 preview。旧的 `POST /api/chat` 保留为兼容调试入口，但 Stage 8
工作台不再依赖浏览器 state 作为关键状态真相；该 legacy 入口仍接受客户端 scope /
history / emotion，仅用于阶段 1～7 的手动验证，后续会移除或隔离。

V1.1 stage-02 已在 Core 中冻结 `streamWorkflow()` 与 `ChatWorkflowStreamEvent` 契约，并在
demo 宿主层新增 `app/lib/chat-stream-wire.ts` 作为 Core Event 到 JSON-safe Wire Event 的单一
映射边界。当前阶段不改造聊天 Route，也不写真实 NDJSON；后续阶段会基于该映射接入
`POST + fetch + ReadableStream + NDJSON`。

本地契约样例位于 `app/lib/chat-stream-contract-verifier.ts`，覆盖正常完成、空白 delta、
stream 不支持、步骤失败、output safety 拒绝、memory 写回降级与 Wire 序列化边界。

- **Memory DB Panel**：展示 provider meta、DB / pgvector / 表状态、embedding 模型与向量维度、recall（含 score）。
- **滚动摘要**：Stage 8 工作台接入 `debug_conversation_summaries` 持久化摘要，但默认关闭；启用后重启 dev server 仍可恢复。
- **Prompt / Context Debug Panel**：来自 `ChatWorkflowOutput.metadata.debugContext`，展示 Effective Persona、Persona Prompt Preview、最终 system prompt、Conversation Summary、长期记忆块、Recent History 与当前用户输入。滚动摘要开启后重点查看 `summaryContext`、`recentHistory`、`summarizedMessages`、Conversation Summary、Updated Summary 与 Summary Events。
- **Tools Panel**：demo 宿主显式注入 `LocalToolRegistry`，默认注册 `get_current_time`、`search_memory`、`get_emotion_state` 三个本地工具；`get_current_time` 固定返回 `Asia/Shanghai` 北京时间与对应 UTC ISO，面板展示已注册工具、模型请求的 tool call、工具执行结果、是否发生二次生成与 tool observer events。
- **scope 隔离**：工作台固定使用 `ownerType=custom`、`ownerId=local-debug-owner`，长期记忆按 `owner + companion` 隔离；删除会话不会删除长期记忆。

## Stage 8 手工验收

```txt
1. 打开 /，创建一个伴侣，再用该伴侣创建会话。
2. 在 /conversations/[id] 连续发送两轮消息，刷新页面，确认历史消息、情绪与左侧 run 仍存在。
3. 进入 /companions/[id]/memories 手动新增一条偏好记忆，回到同伴侣新会话发送相关问题，确认左侧 recalled memories 出现该记忆与 score。
4. 删除该会话，确认 / 列表消失；再进入同伴侣记忆页，确认长期记忆仍存在。
5. 打开 /debug/model-runtime，确认阶段 1 模型运行时验证入口仍可使用。
```
