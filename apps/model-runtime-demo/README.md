# @ying-companion/model-runtime-demo

V1.0 持久化调试工作台 + **V1.2 Core Workflow Debug Workbench** + **V1.3 Story Workbench**。不是正式用户产品，而是本地 AI Companion / Story Core 调试宿主：创建伴侣、配置 Persona、OpenAI-compatible / Ollama 聊天、AI SDK UI 聊天表面、NDJSON 流式输出、Web Search Sources、Story Mode 游玩、Workflow Timeline，以及长期记忆管理。

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
WEB_SEARCH_ENABLED=false
WEB_SEARCH_BACKEND=tavily
TAVILY_API_KEY=
```

`OPENAI_FALLBACK_MODEL` 为空时不启用降级。重试次数为空或非法时按 `0` 处理。能力覆盖变量为空时使用
OpenAI-compatible adapter 默认值：`streaming=true`、`toolCalling=false`、`usage=false`。只有确认当前
模型和网关支持工具调用或稳定 usage 后，才把对应能力显式设为 `true`。

`OLLAMA_KEEP_ALIVE` 直接传给 Ollama，必须使用合法 duration（例如 `10m`、`1h`），不能只写 `10`。
`STORY_MODEL_PROVIDER` 可单独覆盖 Story Workbench 的 provider（`openai-compatible` 或 `ollama`），
不改变 Companion Workbench 的 `MODEL_PROVIDER`；未设置时 Story 继续继承全局 provider。

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
psql -d ying_companion_dev -f apps/model-runtime-demo/migrations/0003_add_web_search_settings.sql
```

`0003_add_web_search_settings.sql` 还包含 `debug_workflow_runs` 的 assistant message 唯一索引。
Story Workbench 复用同一个 `DATABASE_URL` 和 demo 持有的 `pg.Pool`；进入 `/stories`
时会通过 `runStoryPostgresMigrations()` 自动确保 `story_sessions` / `story_states` /
`story_turns` / `story_messages` / `story_summaries` 存在。若需要显式执行，也可运行：

```bash
pnpm --filter @ying-companion/story-postgres migrate
```

`debug_conversations.web_search_enabled` 暂不作为持久化用户设置读取；V1.2 的 composer Web Search switch 只存在于当前浏览器页面状态，刷新后按宿主可用性恢复默认。

然后填写 `apps/model-runtime-demo/.env` 中的 `OPENAI_API_KEY`、`OPENAI_MODEL` 与
`DATABASE_URL`。如需启用 Web Search，还需要：

```txt
WEB_SEARCH_ENABLED=true
WEB_SEARCH_BACKEND=tavily
TAVILY_API_KEY=...
OPENAI_MODEL_SUPPORTS_TOOL_CALLING=true
```

本地默认可使用：

```txt
DATABASE_URL=postgresql://localhost:5432/ying_companion_dev
```

首次 companion 读写会自动补齐 V1.1 Persona Profile 列，便于旧本地库继续运行；新环境和
CI 仍建议显式执行上面的 migration，确保 schema 版本可审计。

打开 Next.js 输出的本地地址：

- `/`：会话历史列表。选择已有伴侣创建新会话，或进入伴侣创建页。
- `/stories`：Story Workbench 入口。显示种子故事列表，提供 Story Definition JSON 校验预览入口。
- `/stories/[storyId]/sessions`：Story Session 列表与新建存档入口。Session 创建时冻结 `definitionSnapshot`，后续恢复不读取更新后的种子定义。
- `/stories/[storyId]/sessions/[sessionId]`：Story Runtime。可发送自由文本行动，观察流式叙事、Core State、按 Attribute Schema 渲染的动态 attrs、Narrative Summary、Lore / Plan / State / Timeline Debug 信息。
- `/companions/new`、`/companions/[id]/edit`：配置 Persona，包含用户显示名、建议称呼、兴趣、外貌与补充指令；服务端会在每轮聊天时将最新配置注入 `DefaultPersonaProvider`。
- `/conversations/[id]`：AI SDK UI 聊天表面为默认主视图；composer 内的“调试”按钮打开抽屉，抽屉内展示模型配置与 `RunDebugPanel`。Web Search switch 位于发送按钮左侧，调试按钮位于发送按钮旁；刷新后消息、情绪、摘要和历史 run 仍可恢复；当前流式回合的 Sources 卡片来自结构化 `web_search` ToolResult，不从模型自然语言解析 URL。
- `/companions/[id]/memories`：长期记忆 CRUD。新增/修改 content 会重新 embedding；列表不展示 score，score 只在对话页本轮 recalled memories 中出现。
- `/debug/model-runtime`：阶段 1 Model Runtime 独立验证入口，查看 Provider inspection、流式输出、最终使用模型、是否降级、尝试次数与错误摘要。

对话发送经 `POST /api/conversations/[id]/messages`，响应为
`application/x-ndjson; charset=utf-8`。客户端通过 AI SDK UI `useChat` + 自定义
`DemoChatTransport` 提交 `message`、可选非敏感 `modelConfig`、页面级
`webSearchEnabled`，以及仅本次请求使用的 `apiKeyOverride`。缺失
`webSearchEnabled` 时服务端按 `false` 处理，避免旧调用方意外联网。服务端根据 conversation / companion 构造
`scope`、history、emotion、summaryScope 与 Provider，调用 `core.streamWorkflow()`，将 Core
Event 通过 `app/lib/chat-stream-wire.ts` 的唯一映射转换为 Wire Event。除
`workflow:finish` 外，事件实时写入 NDJSON；浏览器端 `app/lib/chat-stream-ui-adapter.ts`
把 `text:delta`、`tool:call`、`tool:result`、`workflow:*` 映射成 AI SDK UI message parts，
同时原始 Wire Events 继续旁路进入 `RunDebugPanel`。`workflow:finish` 只有在
`DebugRepository.completeRun()` 成功写回 assistant message、workflow run、conversation
emotion 与 preview 后才发送。旧的 `POST /api/chat` 保留为 legacy 非流式调试入口，不承载
V1.2 工作台主链路。

V1.1 stage-07 已将持久化会话 Route 接入 `POST + fetch + ReadableStream + NDJSON`。
`app/lib/chat-stream-transport.ts` 提供 NDJSON 编码、浏览器增量解析与 Wire Event runtime
guard，覆盖半行、多行、非法 JSON、终止事件后额外事件等协议边界。

V1.2 stage-02 保留该后端协议，不改为 `streamText()` / `toUIMessageStreamResponse()`。
主聊天消息状态由 `@ai-sdk/react` 的 `useChat` 管理；`DemoChatTransport` 把 AI SDK 的
`AbortSignal` 传给 `fetch`，但当前 UI 不展示 Stop，因为本阶段不承诺服务端可恢复的 workflow
cancellation 语义。

聊天消息列表只在 assistant 消息处于 `streaming` 生成期间自动滚动到底部；发送提交阶段、生成完成后的持久化刷新、历史消息恢复都不会强制贴底。用户滚动、触摸或指针操作消息列表时，系统自动滚动会暂停；用户停止滚动 2 秒后仅在本轮仍处于生成中时恢复贴底滚动。

V1.1 stage-07 的工作台可在调试抽屉里选择 `openai-compatible` 或 `ollama`。非敏感模型配置存入
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
pnpm --filter @ying-companion/model-runtime-demo verify:chat-ui-adapter
```

- **Memory DB Panel**：展示 provider meta、DB / pgvector / 表状态、embedding 模型与向量维度、recall（含 score）。
- **滚动摘要**：Stage 8 工作台接入 `debug_conversation_summaries` 持久化摘要，但默认关闭；启用后重启 dev server 仍可恢复。
- **Prompt / Context Debug Panel**：来自 `ChatWorkflowOutput.metadata.debugContext`，展示 Effective Persona、Persona Prompt Preview、最终 system prompt、Conversation Summary、长期记忆块、Recent History 与当前用户输入。滚动摘要开启后重点查看 `summaryContext`、`recentHistory`、`summarizedMessages`、Conversation Summary、Updated Summary 与 Summary Events。
- **Tools Panel**：demo 宿主显式注入 `LocalToolRegistry`，默认注册 `get_current_time`、`search_memory`、`get_emotion_state` 三个本地工具；`get_current_time` 固定返回 `Asia/Shanghai` 北京时间与对应 UTC ISO，面板展示已注册工具、模型请求的 tool call、工具执行结果、是否发生二次生成与 tool observer events。
- **scope 隔离**：工作台固定使用 `ownerType=custom`、`ownerId=local-debug-owner`，长期记忆按 `owner + companion` 隔离；删除会话不会删除长期记忆。

## Story Workbench（V1.3）

Story 发送经 `POST /api/story-sessions/[id]/messages`，响应为
`application/x-ndjson; charset=utf-8`。服务端通过 `app/lib/story-runtime-factory.ts`
集中构造 runtime：读取 `DATABASE_URL` 创建 / 复用 demo pool，执行 story-postgres migration，
注入 `PostgresStorySessionProvider`、`PostgresStoryStateProvider`、`PostgresStoryTurnRepository`、
`PostgresStoryMessageProvider`、`PostgresStoryTurnCommitter` 与 `PostgresStorySummaryProvider`。
Route 不直接拼装 provider，也不会让持久化 state provider 与 in-memory turn/message provider 混用。

故事列表、存档列表和恢复页面只初始化数据库 Host，不要求模型可用。发送回合时才按
`STORY_MODEL_PROVIDER`（未设置则继承 `MODEL_PROVIDER`）及对应的 OpenAI-compatible / Ollama
环境变量按需创建模型工作流。每个新回合默认
执行两次模型调用：`ModelStoryPlanner` 先生成结构化 `StoryTurnPlan`，校验通过后
`ModelStoryRenderer` 再流式生成玩家可见正文。Runtime Debug 的 `model` 字段显示当前
provider、model 与能力声明，不包含 API Key。

流式链路：

```txt
DefaultStoryWorkflow.stream()
→ Story Core Event
→ app/lib/story-stream-wire.ts
→ Story Wire Event
→ app/lib/story-stream-transport.ts NDJSON
→ app/lib/story-stream-ui-adapter.ts + Runtime Debug 面板
```

Wire 层负责把 `Date` 转成 ISO string，并把 error / raw / unknown payload 显式转成
JSON-safe 数据；浏览器端 runtime guard 会拒绝 terminal event 之后的额外事件。`story:finish`
只在 workflow 已发出 finish 后发送，UI 完成后会重新读取 `GET /api/story-sessions/[id]`
恢复最新 `messages / latestState / summary / definitionVersion`。

状态侧栏分为固定 Core State 与 Dynamic Attributes。attrs 渲染完全来自
`StoryDefinition.attributes[]`，并通过 `createStoryAttributeStorageKey()` 读取：
`story`、`player`、`character`、`scene` scope 使用同一套 renderer；`showInSidebar=false`
的字段不进默认侧栏，但 Debug 中可查看完整 attrs。`relationships` 仅在 Definition 启用时展示。

Planner 同时接收原始玩家输入、冻结的 Story Definition、当前 State、Narrative Summary、近期消息与
本轮召回 Lore；Renderer 接收已校验 Plan 和 nextState，并延续近期动作与对白。普通叙述或对话允许
`stateChanges=[]`，但仍必须生成自然的戏内反馈，不能改写成预设调查行为。离线 Fake Model / Planner /
Renderer 只用于契约验证脚本，不进入 Story Workbench 生产路径。

自动化契约验证：

```bash
pnpm --filter @ying-companion/story-core verify:story-contract
pnpm --filter @ying-companion/story-core verify:story-workflow
pnpm --filter @ying-companion/story-postgres verify:story-postgres
pnpm --filter @ying-companion/story-postgres verify:story-recovery
pnpm --filter @ying-companion/model-runtime-demo verify:story-stream-contract
pnpm --filter @ying-companion/model-runtime-demo verify:story-ui-adapter
pnpm --filter @ying-companion/model-runtime-demo verify:story-workbench-planner
```

最小手工验收：

```txt
A. /stories 显示雾港疑云与青崖试剑；JSON 导入校验入口可返回 preview / errors
B. 新建雾港 Session → Runtime 显示 openingText、当前场景与初始 attrs
C. 连续发送自由行动或对白 → 回复承接实际输入与上一轮内容，文本增量显示，Debug 中可见 Lore / Plan / Timeline / model / committed revision
D. 明确调查、交谈或移动 → 仅有 Definition 与上下文支持的物品、事件、场景或 attrs 通过 StateChange 推进
E. 新建青崖试剑 Session → 侧栏显示 combatPower / sectStanding，不显示雾港字段
F. 刷新 Runtime 页 → messages / state / revision / definitionVersion 从 Postgres 恢复
G. 自动化 validator-failure 契约 → UI Adapter 显示 validation failed，世界状态不被污染
H. 无有效模型配置 → 发送时显示明确错误；故事列表与已有存档仍可浏览
```

## Web Search（V1.2）

Web Search 的三项前置都满足时，composer switch 才可用：

```txt
WEB_SEARCH_ENABLED=true
WEB_SEARCH_BACKEND=tavily 且 TAVILY_API_KEY 有效
当前模型 capabilities.toolCalling=true
```

Switch 只表示“本轮允许 Planner 看到 web_search”；最终是否搜索仍由
`ToolPlanningProvider` 决定。关闭 switch 时，本次请求不会注册 / 注入 `web_search`。
成功搜索后的 Sources 来自 `tool:result` 里的结构化 `WebSearchResult`；失败、空结果或未搜索
时不会伪造来源。完整检索参数与 fallback 记录在 Debug Workbench 的 Web Search Log。

## 聊天状态（V1.2）

会话页每条 assistant 回合可能处于：

| 状态                     | 含义                                                        |
| ------------------------ | ----------------------------------------------------------- |
| `success`                | 流式完成且持久化成功                                        |
| `degraded`               | 主回复完成，后置 Memory / Emotion / Summary 等步骤降级      |
| `submitted`              | 请求已提交                                                  |
| `planning_tool`          | 正在判断是否需要工具                                        |
| `searching`              | Planner 已选择 `web_search`，正在搜索 Web                   |
| `streaming`              | 正在接收 `text:delta`                                       |
| `partial_failed`         | 已有部分 `text:delta`，但未成功完成（无 `workflow:finish`） |
| `output_safety_rejected` | 完整文本 output safety 拒绝                                 |
| `persistence_failed`     | 模型输出已生成，但 DB 持久化失败；刷新后可能丢失            |
| `tool_failed`            | 搜索等工具失败，但后续模型仍可能给出降级回答                |
| `failed`                 | 首个 delta 前失败或无可展示文本                             |

`workflow:finish` 仅在 `DebugRepository.completeRun()` 成功后发送；持久化失败走 `workflow:error` + `details.reason=persistence_failed`。

## V1.2 手工验收

主链路（需有效 API key / 本地 Ollama + 可选 Postgres）：

```txt
A. Persona：/companions/[id]/edit 配置 userAddress、hobbies、appearance → Prompt Preview 分区正确
B. OpenAI 流式：/conversations/[id] 发送消息 → AI SDK UI 消息增量更新且仅在 assistant streaming 期间自动贴底滚动 → 点击 composer 调试按钮后 debug 面板完整
C. Ollama 流式：会话页 provider=ollama → 流式回复；runtime 显示 ollama 模型名
D. Ollama 记忆写回：启用 Postgres 记忆后发送明确长期事件 → Memory Events 显示 extract/save 成功
E. 工具规划：注册工具 + 支持 toolCalling 的模型 → Timeline 区分 plan / call / result / delta
F. Web Search：配置 Tavily + toolCalling=true → 发送按钮左侧 switch 可用；联网问题展示搜索状态与 Sources
G. Web Search 关闭：switch off → 本轮不注册 web_search，不展示伪造 Sources
H. Fallback：配置 fallback 模型 → runtime 显示实际使用模型与 capability skip
I. Safety / partial：见 verify:stream-contract 契约场景；UI 需本地确认标注文案
J. NDJSON：pnpm verify:stream-contract（chunk 边界、raw 剥离）
K. UI Adapter：pnpm verify:chat-ui-adapter（delta、Sources、错误与协议不一致）
L. 工程：pnpm typecheck && pnpm lint && pnpm build
```

自动化契约验证：

```bash
pnpm --filter @ying-companion/model-runtime-demo verify:stream-contract
pnpm --filter @ying-companion/model-runtime-demo verify:chat-ui-adapter
pnpm --filter @ying-companion/tool-web-search verify:web-search-contract
pnpm --filter @ying-companion/model-runtime-demo verify:web-search-workflow
pnpm --filter @ying-companion/model-ollama verify:adapter
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
