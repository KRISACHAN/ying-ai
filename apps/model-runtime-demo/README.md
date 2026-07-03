# @ying-companion/model-runtime-demo

V1.0 持久化调试工作台 + **V1.1 Core Workflow Debug Workbench**。不是正式用户产品，而是本地 AI Companion Core 调试宿主：创建伴侣、配置 Persona、OpenAI-compatible / Ollama 聊天、NDJSON 流式输出、Workflow Timeline，以及长期记忆管理。

## 环境变量

```txt
OPENAI_API_KEY=
OPENAI_BASE_URL=
OPENAI_MODEL=
OPENAI_FALLBACK_MODEL=
OPENAI_PRIMARY_MAX_RETRIES=1
OPENAI_FALLBACK_MAX_RETRIES=1
OPENAI_MODEL_SUPPORTS_STREAMING=true
OPENAI_MODEL_SUPPORTS_TOOL_CALLING=false
OPENAI_MODEL_SUPPORTS_USAGE=false
OPENAI_FALLBACK_MODEL_SUPPORTS_STREAMING=true
OPENAI_FALLBACK_MODEL_SUPPORTS_TOOL_CALLING=false
OPENAI_FALLBACK_MODEL_SUPPORTS_USAGE=false
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
DATABASE_URL=
MEMORY_POSTGRES_TABLE=companion_memories
TAVILY_API_KEY=
WEB_SEARCH_BACKEND=auto
WEB_SEARCH_ENABLED=true
WEB_SEARCH_TIMEOUT_MS=10000
WEB_SEARCH_MAX_RESULTS=5
OPENAI_WEB_SEARCH_ENABLED=true
OPENAI_WEB_SEARCH_API_KEY=
OPENAI_WEB_SEARCH_MODEL=
```

`OPENAI_FALLBACK_MODEL` 为空时不启用降级。重试次数为空或非法时按 `0` 处理。能力覆盖变量为空时使用
OpenAI-compatible adapter 默认值：`streaming=true`、`toolCalling=false`、`usage=false`。只有确认当前
模型和网关支持工具调用或稳定 usage 后，才把对应能力显式设为 `true`。

V1.2 Web Search 默认按会话关闭。只有会话级 `debug_conversations.web_search_enabled = true`
且搜索 backend 可用时，宿主才会注册 `web_search` 工具；搜索注册与聊天模型的 native
`toolCalling` 能力解耦。`WEB_SEARCH_BACKEND=auto | tavily | openai-responses`，`auto`
优先 OpenAI Responses native web search，缺少官方 OpenAI 搜索配置时回退 Tavily。
`OPENAI_BASE_URL` 只属于 generic OpenAI-compatible chat adapter，不会被复用为 Responses
API endpoint。会话关闭时，即使本轮 `forceWebSearch=true` 或 backend/key 已配置，也不会注册
Tool 或发起外部请求。

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
psql -d ying_companion_dev -f apps/model-runtime-demo/migrations/0003_add_web_search_enabled.sql
psql -d ying_companion_dev -f apps/model-runtime-demo/migrations/0004_workflow_runs_assistant_message_unique.sql
```

然后填写 `apps/model-runtime-demo/.env` 中的 `OPENAI_API_KEY`、`OPENAI_MODEL` 与
`DATABASE_URL`。本地默认可使用：

```txt
DATABASE_URL=postgresql://localhost:5432/ying_companion_dev
```

首次 companion 读写会自动补齐 V1.1 Persona Profile 列，便于旧本地库继续运行；新环境和
CI 仍建议显式执行上面的 migration，确保 schema 版本可审计。V1.2 也会自动补齐
`web_search_enabled` 与 `assistant_message_id` partial unique index，显式 migration 仍是推荐路径。

打开 Next.js 输出的本地地址：

- `/`：会话历史列表。选择已有伴侣创建新会话，或进入伴侣创建页。
- `/companions/new`、`/companions/[id]/edit`：配置 Persona，包含用户显示名、建议称呼、兴趣、外貌与补充指令；服务端会在每轮聊天时将最新配置注入 `DefaultPersonaProvider`。
- `/conversations/[id]`：左侧调试工作台，右侧纯对话。刷新后消息、情绪、摘要和历史 run 仍可恢复。
- `/companions/[id]/memories`：长期记忆 CRUD。新增/修改 content 会重新 embedding；列表不展示 score，score 只在对话页本轮 recalled memories 中出现。
- `/debug/model-runtime`：阶段 1 Model Runtime 独立验证入口，查看 Provider inspection、流式输出、最终使用模型、是否降级、尝试次数与错误摘要。

对话发送经 `POST /api/conversations/[id]/messages`，响应为
`application/x-ndjson; charset=utf-8`。客户端提交 `message`、可选非敏感 `modelConfig`，
以及仅本次请求使用的 `apiKeyOverride`。服务端根据 conversation / companion 构造
`scope`、history、emotion、summaryScope 与 Provider，调用 `core.streamWorkflow()`，将 Core
Event 通过 `app/lib/chat-stream-wire.ts` 的唯一映射转换为 Wire Event。除
`workflow:finish` 外，事件实时写入 NDJSON；`workflow:finish` 只有在
`DebugRepository.completeRun()` 成功写回 assistant message、workflow run、conversation
emotion 与 preview 后才发送。旧的 `POST /api/chat` 保留为 legacy 非流式调试入口，不承载
V1.1 工作台主链路。

Conversation API 的 `GET /api/conversations/[id]` 返回 `conversation.webSearchEnabled`。
`PATCH /api/conversations/[id]` 接收 `{ "webSearchEnabled": boolean }` 并持久化对话级搜索开关。
消息发送不会信任请求体里的临时搜索开关，只读取数据库中的会话值。

V1.1 stage-07 已将持久化会话 Route 接入 `POST + fetch + ReadableStream + NDJSON`。
`app/lib/chat-stream-transport.ts` 提供 NDJSON 编码、浏览器增量解析与 Wire Event runtime
guard，覆盖半行、多行、非法 JSON、终止事件后额外事件等协议边界。

V1.1 stage-07 的工作台可在会话页选择 `openai-compatible` 或 `ollama`。非敏感模型配置存入
浏览器 `sessionStorage` 并随每次 POST body 发送；OpenAI-compatible 的 `apiKeyOverride`
只保存在当前页面 React state 与单次 POST body 中，不写入数据库、Wire Event、trace 或 Debug
Panel。模型创建仍在宿主侧 strategy registry 中完成，不修改 `ai-core` Workflow。

长期记忆抽取跟随当前聊天模型：OpenAI-compatible 通过 Vercel AI SDK structured output
生成 `ModelMemoryExtractor` 的对象结果；Ollama 通过 `format: "json"` 生成 JSON 后由同一
Zod schema 校验。写入与召回仍由 demo 注入的 `MemoryProvider` 负责，因此 Ollama 只替换
聊天/抽取模型，不提供 embedding 或数据库能力；`OPENAI_EMBEDDING_MODEL` 与
`DATABASE_URL` 仍决定真实长期记忆是否可持久化。

本地契约样例位于 `app/lib/chat-stream-contract-verifier.ts`，覆盖正常完成、空白 delta、
stream 不支持、步骤失败、output safety 拒绝、memory 写回降级与 Wire 序列化边界。
可用以下命令在控制台复现这些场景：

```bash
pnpm --filter @ying-companion/model-runtime-demo verify:stream-contract
pnpm --filter @ying-companion/model-runtime-demo verify:web-search-contract
```

- **Memory DB Panel**：展示 provider meta、DB / pgvector / 表状态、embedding 模型与向量维度、recall（含 score）。
- **滚动摘要**：Stage 8 工作台接入 `debug_conversation_summaries` 持久化摘要，但默认关闭；启用后重启 dev server 仍可恢复。
- **Prompt / Context Debug Panel**：来自 `ChatWorkflowOutput.metadata.debugContext`，展示 Effective Persona、Persona Prompt Preview、最终 system prompt、Conversation Summary、长期记忆块、Recent History 与当前用户输入。滚动摘要开启后重点查看 `summaryContext`、`recentHistory`、`summarizedMessages`、Conversation Summary、Updated Summary 与 Summary Events。
- **Tools Panel**：demo 宿主显式注入 `LocalToolRegistry`，默认注册 `get_current_time`、`search_memory`、`get_emotion_state` 三个本地工具；会话搜索开启且 backend 可用时额外注册 `web_search`。`get_current_time` 固定返回 `Asia/Shanghai` 北京时间与对应 UTC ISO，面板展示已注册工具、模型请求的 tool call、工具执行结果、是否发生二次生成与 tool observer events。
- **Web Search Runtime**：`ChatWorkflowOutput.metadata.webSearch` 展示 `enabled`、`user_disabled`、`infra_unavailable`、`backend`、`requestedBackend`、`planner`、`registered` 与不可用原因。点击“联网搜索”或用户明确要求搜索时，demo 宿主会确定性规划 `web_search`；普通场景仍只让支持 native function calling 的聊天模型自动规划。
- **scope 隔离**：工作台固定使用 `ownerType=custom`、`ownerId=local-debug-owner`，长期记忆按 `owner + companion` 隔离；删除会话不会删除长期记忆。

## 聊天状态（V1.1）

会话页每条 assistant 回合可能处于：

| 状态                 | 含义                                                        |
| -------------------- | ----------------------------------------------------------- |
| `success`            | 流式完成且持久化成功                                        |
| `degraded`           | 主回复完成，后置 Memory / Emotion / Summary 等步骤降级      |
| `partial-failed`     | 已有部分 `text:delta`，但未成功完成（无 `workflow:finish`） |
| `failed`             | 首个 delta 前失败或无可展示文本                             |
| `safety-rejected`    | 完整文本 output safety 拒绝                                 |
| `persistence-failed` | 模型输出已生成，但 DB 持久化失败；刷新后可能丢失            |

`workflow:finish` 仅在 `DebugRepository.completeRun()` 成功后发送；持久化失败走 `workflow:error` + `details.reason=persistence_failed`。

## V1.1 手工验收

主链路（需有效 API key / 本地 Ollama + 可选 Postgres）：

```txt
A. Persona：/companions/[id]/edit 配置 userAddress、hobbies、appearance → Prompt Preview 分区正确
B. OpenAI 流式：/conversations/[id] 发送消息 → NDJSON text:delta 增量 → finish 后 debug 面板完整
C. Ollama 流式：会话页 provider=ollama → 流式回复；runtime 显示 ollama 模型名
D. Ollama 记忆写回：启用 Postgres 记忆后发送明确长期事件 → Memory Events 显示 extract/save 成功
E. 工具规划：注册工具 + 支持 toolCalling 的模型 → Timeline 区分 plan / call / result / delta
F. Fallback：配置 fallback 模型 → runtime 显示实际使用模型与 capability skip
G. Safety / partial：见 verify:stream-contract 契约场景；UI 需本地确认标注文案
H. NDJSON：pnpm verify:stream-contract（chunk 边界、raw 剥离）
I. 工程：pnpm typecheck && pnpm lint && pnpm build
```

自动化契约验证：

```bash
pnpm --filter @ying-companion/model-runtime-demo verify:stream-contract
pnpm --filter @ying-companion/model-ollama verify:adapter
pnpm --filter @ying-companion/model-runtime-demo verify:web-search-contract
```

验收记录：[`.code-reviews/v1.1/acceptance/manual-verification.md`](../../.code-reviews/v1.1/acceptance/manual-verification.md)

## V1.0 持久化验收（仍有效）

```txt
1. 打开 /，创建一个伴侣，再用该伴侣创建会话。
2. 在 /conversations/[id] 连续发送两轮消息，刷新页面，确认历史消息、情绪与左侧 run 仍存在。
3. 进入 /companions/[id]/memories 手动新增一条偏好记忆，回到同伴侣新会话发送相关问题，确认左侧 recalled memories 出现该记忆与 score。
4. 删除该会话，确认 / 列表消失；再进入同伴侣记忆页，确认长期记忆仍存在。
5. 打开 /debug/model-runtime，确认阶段 1 模型运行时验证入口仍可使用。
```
