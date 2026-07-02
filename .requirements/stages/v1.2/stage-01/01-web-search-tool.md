# AI Companion Core V1.2 - 阶段 1：Web Search Tool Adapter 与搜索闭环实施文档

## 一、阶段目标

在不修改 `packages/ai-core` 的 Provider / Tool / Workflow 边界，不引入用户系统、鉴权、搜索 RAG、网页抓取或多 Provider 自动路由的前提下，为当前 AI Companion Core 增加一个可替换的 Web Search Tool Adapter。

本阶段必须形成以下完整闭环：

```txt
用户提出需要时效、公开资料核实或外部事实的问题
↓
当前对话已开启 Web Search，且宿主基础设施可用
↓
宿主条件注册 web_search Tool
↓
V1.1 Tool Planning 决定 no_tool / tool_calls
↓
web_search 调用 Tavily
↓
Adapter 标准化来源、限制结果与裁剪不安全字段
↓
Final Response 消费标准化 Tool Result
↓
Workflow 输出 tool:call / tool:result / workflow:finish
↓
宿主可在下一阶段转换为 AI SDK UI source parts
```

本阶段交付的是：

1. Web Search 的供应商无关契约；
2. Tavily 首个实现；
3. 可注入现有 `ToolRegistry` 的 `web_search` Tool；
4. 对话级开关与宿主条件注册；
5. 搜索结果、错误、来源与 Workflow Trace 的标准化结构；
6. 搜索结果不进入长期 Memory 的工程化隔离；
7. 对应数据库 migration、API、Debug Workbench 验证能力。

本阶段不实现 AI SDK UI 聊天重构、来源卡视觉渲染或 `useChat` 接入；这些属于 V1.2 阶段 2。

---

## 二、前置基线

### 2.1 V1.0 / V1.1 已有能力

当前 `prod` 已具备：

```txt
packages/ai-core
├── CompanionCore.executeWorkflow()
├── CompanionCore.streamWorkflow()
├── ChatModel.generate() / stream()
├── ModelProfile 与 primary / fallback capabilities
├── ToolRegistry
├── Tool Planning：no_tool / tool_calls
├── Final Response 与 Tool Planning 分离
├── ChatWorkflowStreamEvent
└── Memory / Summary / Emotion / Safety / Observer 抽象

apps/model-runtime-demo
├── PostgreSQL debug conversations / messages / workflow runs
├── NDJSON Wire Event
├── 运行时模型选择与 Provider 注入
├── Tool、Trace、Runtime、Prompt、Memory、Emotion 调试展示
└── 现有 Conversation Store 与请求装配逻辑
```

本阶段必须以这些能力为基础增量实现；不得另起第二套 Tool、Workflow、流协议或对话持久化体系。

### 2.2 必须保持的边界

```txt
packages/ai-core
├── 不读取环境变量
├── 不直连 PostgreSQL
├── 不依赖 Tavily SDK、HTTP URL 搜索 API 或浏览器能力
├── 不硬编码 web_search 分支
└── 只通过 ToolRegistry.list / execute 消费工具

packages/tool-web-search
├── 定义供应商无关搜索契约
├── 实现 Tavily Adapter
├── 创建 web_search Tool
└── 不依赖 Demo 的数据库、React、Next.js Route 或 UI

apps/model-runtime-demo
├── 读取环境变量
├── 创建 WebSearchClient 与 ToolRegistry
├── 根据开关和模型能力条件注册 Tool
├── 负责 Conversation API 与 migration
└── 负责 Debug 数据展示和宿主级安全裁剪
```

---

## 三、阶段完成标准

完成本阶段后，必须满足：

- `packages/tool-web-search` 存在且不依赖 `ai-core` 以外的宿主实现；
- 供应商无关的 `WebSearchClient`、`WebSearchRequest`、`WebSearchResponse`、`WebSearchSource` 已冻结；
- Tavily 是首个实现，但后续接 Exa、Brave、Serper、Bing 或内部搜索不需要修改 Workflow、Tool Definition 或来源渲染契约；
- `web_search` 通过现有 `ToolRegistry` 注册和执行，Workflow 不出现专用搜索 if/else；
- `debug_conversations.web_search_enabled` 已持久化，默认 `false`；
- 仅在基础设施可用、当前对话开启且当前实际模型支持 Tool Calling 时注册 `web_search`；
- 关闭开关、没有 API key、模型能力不支持或 fallback 不兼容时，Planner 不得看到不可执行 Tool；
- Tool Planning 仍只输出 `no_tool` / `tool_calls`，不得生成面向用户的搜索结论；
- Tavily 响应必须标准化，最多保留 5 个来源，且不把 raw provider response、raw content、HTML 或全文写入 Prompt、UI 安全结构或长期存储；
- Final Response 可以使用标准化来源中的外部事实，并受本文件第十章事实约束；
- 本轮成功使用 `web_search` 时，Memory Extractor 仍可提取用户稳定偏好和个人经历，但不得把外部网页事实写入长期 Memory / pgvector；
- 搜索失败、无结果、参数错误、限流、超时等均转为稳定 `ToolResult`，不得向模型或前端泄漏原始错误栈；
- Debug Workbench 能观察当前搜索可用状态、查询词、工具调用、来源摘要、错误码、Provider、耗时以及模型能力；
- 现有 `executeWorkflow()`、`streamWorkflow()`、OpenAI-compatible / Ollama Adapter、Memory scope 与会话持久化不被破坏；
- 相关 package 的 typecheck、lint、build 均通过，并完成本文件定义的人工验收场景。

---

## 四、目录与职责

建议目录如下。文件名可与当前仓库保持一致，但职责边界不得变化。

```txt
packages/
├── ai-core/
│   └── 不新增 Tavily 依赖；继续只消费 ToolRegistry
│
└── tool-web-search/
    ├── src/
    │   ├── abstractions/
    │   │   └── web-search.ts
    │   ├── implementations/
    │   │   └── tavily-web-search-client.ts
    │   ├── tool/
    │   │   └── create-web-search-tool.ts
    │   ├── errors/
    │   │   └── web-search-error.ts
    │   ├── index.ts
    │   └── package.json
    └── README.md

apps/model-runtime-demo/
├── app/api/conversations/[id]/route.ts
├── app/api/chat/route.ts
├── lib/
│   ├── web-search-runtime.ts
│   ├── tool-registry-factory.ts
│   ├── debug-repository.ts
│   ├── debug-types.ts
│   └── companion-runtime.ts
├── migrations/
│   └── 000X_add_web_search_enabled.sql
└── .env.example
```

职责约束：

```txt
packages/tool-web-search
→ 负责“如何安全地搜索并把结果变成标准结构”。

apps/model-runtime-demo
→ 负责“是否允许当前对话使用搜索、如何创建 Adapter、如何保存开关与展示调试信息”。

packages/ai-core
→ 不知道 web_search 的供应商细节；只把它当成一个普通 Tool。
```

---

## 五、数据契约

### 5.1 供应商无关 Web Search 契约

`packages/tool-web-search` 必须先定义以下稳定接口：

```ts
export type WebSearchTopic = "general" | "news";
export type WebSearchTimeRange = "day" | "week" | "month" | "year";

export interface WebSearchRequest {
  query: string;
  topic?: WebSearchTopic;
  timeRange?: WebSearchTimeRange;
  includeDomains?: string[];
  excludeDomains?: string[];
}

export interface WebSearchSource {
  id: string;
  title: string;
  url: string;
  snippet: string;
  publishedAt?: string;
  score?: number;
  faviconUrl?: string;
}

export interface WebSearchResponse {
  query: string;
  sources: WebSearchSource[];
  provider: string;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

export interface WebSearchClient {
  search(input: WebSearchRequest): Promise<WebSearchResponse>;
}
```

约束：

```txt
- request 不暴露 Tavily 的 searchDepth、maxResults、rawContent 等供应商参数；
- source.id 在单次 response 内必须稳定且唯一；
- url、title、snippet 为有效来源的必填字段；
- publishedAt 必须为 ISO 字符串；
- metadata 只能承载安全、可 JSON 序列化的补充信息；
- 不在该抽象中放模型、Prompt、ToolRegistry 或 Demo UI 类型。
```

### 5.2 `web_search` Tool Definition

模型可见参数必须受控：

```ts
const webSearchDefinition: ToolDefinition = {
  name: "web_search",
  description:
    "搜索公开网页以获取近期、实时或需要核实的信息。适合新闻、当前事件、价格、天气、产品动态、公开资料核实。不要用于用户个人记忆、纯聊天或已有上下文可回答的问题。",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string" },
      topic: { type: "string", enum: ["general", "news"] },
      timeRange: { type: "string", enum: ["day", "week", "month", "year"] },
      includeDomains: { type: "array", items: { type: "string" } },
    },
    required: ["query"],
    additionalProperties: false,
  },
  metadata: { tags: ["web", "search", "external", "time-sensitive"] },
};
```

以下参数只能由宿主配置，模型不得自由决定：

```txt
searchDepth
maxResults
includeRawContent
provider retry policy
request timeout
provider-specific options
```

### 5.3 Tool Result 推荐结构

Tool Result 中必须包含足以供 Final Response、Trace 和下一阶段 UI 映射的安全信息：

```ts
interface WebSearchToolData {
  query: string;
  provider: string;
  durationMs?: number;
  sources: WebSearchSource[];
  sourceCount: number;
}
```

禁止放入：

```txt
- Tavily 原始 response；
- HTML / markdown 全文；
- raw_content；
- 供应商 token、请求 header、API key；
- 原始异常 stack；
- 任意未裁剪的 metadata。
```

---

## 六、Tavily Adapter 实现规范

### 6.1 环境变量

仅 Demo 宿主读取：

```env
TAVILY_API_KEY=
WEB_SEARCH_ENABLED=true
WEB_SEARCH_TIMEOUT_MS=10000
WEB_SEARCH_MAX_RESULTS=5
```

约束：

```txt
- packages/tool-web-search 不主动读取 process.env；
- Tavily client 配置通过构造函数注入；
- TAVILY_API_KEY 缺失不是应用启动错误；只意味着搜索基础设施不可用；
- WEB_SEARCH_ENABLED 默认视为 true，只有显式 false 才关闭基础设施；
- 会话开关默认 false，二者不能混淆。
```

### 6.2 TavilyWebSearchClient

Tavily 实现必须：

```txt
1. 将 WebSearchRequest 映射为 Tavily 搜索请求；
2. 固定宿主层 maxResults，默认最多 5；
3. 不请求 raw content；
4. 仅选择安全字段：title、url、content/snippet、published date、score；
5. 过滤非法 URL、空 title、空 snippet；
6. 对 snippet 做长度截断；
7. 统一为 WebSearchResponse；
8. 记录 provider=tavily 与 durationMs；
9. 不直接向调用者抛供应商原始异常。
```

### 6.3 URL 与来源规范化

必须执行：

```txt
- 仅保留 http / https URL；
- 使用 URL 构造器验证 URL；
- 无效 URL 丢弃；
- snippet trim 后为空则丢弃；
- title trim 后为空则使用 host 或丢弃，具体策略必须固定；
- 同一 response 内按 canonical url 去重；
- 最终 source 不超过 5 个；
- source 顺序应与 provider score / 返回顺序一致；
- source.id 可使用稳定 hash 或 query-local 序号，但同一 response 内不可重复。
```

### 6.4 错误映射

所有错误最终必须映射为稳定 domain code：

```txt
WEB_SEARCH_DISABLED
WEB_SEARCH_INVALID_QUERY
WEB_SEARCH_TIMEOUT
WEB_SEARCH_RATE_LIMITED
WEB_SEARCH_UNAUTHORIZED
WEB_SEARCH_PROVIDER_ERROR
WEB_SEARCH_NO_RESULTS
```

策略：

```txt
401 / 403 / 参数错误
→ 不重试。

网络超时、429、5xx
→ 可有限重试；次数与退避由宿主配置。

无结果
→ 不是系统异常；以可识别的 no-results Tool Result 返回。

所有失败
→ ToolResult.ok = false；
→ 不向模型或 UI 透传 provider stack、API key 或原始响应。
```

---

## 七、双层门控与宿主注册

### 7.1 门控条件

`web_search` 只有同时满足以下条件时才能注册：

```txt
基础设施层
├── TAVILY_API_KEY 存在
├── WEB_SEARCH_ENABLED !== false
└── 当前实际 ModelProfile.capabilities.toolCalling === true

业务层
└── debug_conversations.web_search_enabled === true
```

语义：

```txt
基础设施层
→ 开发者控制系统是否具备搜索能力。

对话级开关
→ 当前会话是否允许发送外部搜索请求。

默认 false
→ 避免误触、隐私预期不一致与外部请求成本。
```

关闭或不可用时，必须**不注册** `web_search`，而不是注册 Disabled Tool。Planner 不应看到不可执行工具。

### 7.2 数据库与 API

新增 migration：

```sql
ALTER TABLE debug_conversations
ADD COLUMN IF NOT EXISTS web_search_enabled BOOLEAN NOT NULL DEFAULT false;
```

Conversation API 至少支持：

```txt
GET   /api/conversations/[id]
→ 返回 webSearchEnabled。

PATCH /api/conversations/[id]
{ "webSearchEnabled": true }
→ 更新持久化会话设置。
```

发送消息时以数据库中持久化的会话开关为准；不得由每一条消息临时提交、直接信任前端布尔值。

### 7.3 Debug Runtime 可用状态

Demo 必须可展示：

```txt
enabled
user_disabled
infra_unavailable
model_unsupported
```

并能让开发者区分：

```txt
“模型没有选择搜索”
与
“模型根本看不到搜索工具”。
```

---

## 八、Workflow、Tool Planning 与 Final Response

### 8.1 不新增 Workflow 专用搜索分支

V1.2 必须沿用 V1.1 链路：

```txt
Tool Planning
├── 只产出 no_tool / tool_calls
├── 可选择 web_search
└── 不生成面向用户的最终自然语言回答

Tool Execute
├── 执行 Tavily Adapter
├── 标准化来源
└── 发出 tool:call / tool:result

Final Response
├── 消费标准化 Tool Result
├── generate 或 stream 自然语言回答
└── 仅引用真实 sources
```

禁止：

```txt
- 在 SimpleChatWorkflow 中新增 if tool.name === "web_search" 的专用业务分支；
- 先 generate 一段最终回答，再丢弃后搜索并重新生成；
- Tool Planning 直接向用户输出搜索结论；
- 让 Tool Adapter 直接调用聊天模型。
```

### 8.2 模型能力与 fallback

必须继续遵守 V1.1 Model Profile 规则：

```txt
- 当前实际模型不支持 toolCalling 时，不注册 web_search；
- primary 失败、fallback 接管时，按既有策略重新评估能力；
- fallback 不支持 toolCalling 时，Planner 不得收到 web_search；
- 默认不支持 Tool Calling 的 Ollama 配置不得尝试 web_search；
- Debug Runtime 必须能显示当前模型与搜索不可用原因。
```

---

## 九、Memory 与外部上下文隔离

### 9.1 基本原则

```txt
Web Search Result
├── 可进入本轮 Final Response 上下文
├── 可进入 Tool Result、Workflow Trace 与 Debug Run
├── 可在阶段 2 转换为 UI source parts
└── 不得写入长期 Memory / pgvector
```

### 9.2 工程化约束

成功使用 `web_search` 后，Memory Extraction 必须：

```txt
1. 在 MemoryExtractionInput 中传入：
   externalContextUsed: true
   excludedToolNames: ["web_search"]

2. 在 Extractor system prompt 中明确：
   不得将 web_search 来源中的外部公开事实写入长期记忆。

3. 不将 web_search Tool Result 作为 Extractor 的候选文本来源。

4. 仍允许提取用户明确表达的稳定偏好、个人经历、关系边界等内容。
```

禁止因为一次搜索而关闭整轮 Memory 提取；需要排除的是**外部来源事实**，不是用户自身信息。

---

## 十、外部事实与来源引用约束

对成功的 `web_search` Result，`formatToolResultForModel(result)` 或 Final Response Tool Context 必须注入等价规则：

```txt
以下内容来自外部网页搜索，仅作为本轮参考资料。

对于由这些来源支持的外部事实性信息：
- 只能基于提供的 sources 概括；
- 不得补充来源未支持的具体事实、数字、日期、结论或链接；
- 使用 [1]、[2] 等编号时，编号必须对应 sources 顺序；
- 无法从 sources 确认时，应说明信息不足或无法确认；
- 不得把来源内容伪装为用户事实、长期关系记忆或系统事实。

你仍可保持既定伴侣 Persona、自然的情绪回应和对话历史承接，
但不得把这些回应伪装成搜索结论，也不得用 Persona 补全来源未支持的外部事实。
```

无结果或失败时：

```txt
无结果
→ 可以继续给出不依赖外部事实的支持性回应或澄清问题；
→ 不得声称已查询到具体结论。

失败
→ 必须坦诚未获得可靠外部资料；
→ 可基于已有对话继续回应；
→ 不得将模型猜测包装为刚搜索到的信息。
```

---

## 十一、Workflow Run 与来源持久化关联

### 11.1 冻结关联关系

搜索来源不写入 `debug_messages`，而保存在对应 Workflow Run 的安全结果 JSON 中。因此本阶段冻结：

```txt
DebugWorkflowRun.assistantMessageId
→ DebugMessage.id
```

迁移语义：

```sql
ALTER TABLE debug_workflow_runs
ADD COLUMN IF NOT EXISTS assistant_message_id <与 debug_messages.id 相同类型> NULL
REFERENCES debug_messages(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS debug_workflow_runs_assistant_message_id_unique
ON debug_workflow_runs (assistant_message_id)
WHERE assistant_message_id IS NOT NULL;
```

约束：

```txt
- 一个 completed workflow run 最多关联一条 assistant message；
- 一条 assistant message 最多关联一个 workflow run；
- failed run、输入拒绝、未生成 assistant 文本的 run 可保持 assistantMessageId = null；
- 刷新恢复时，某条 assistant message 的来源只从其关联 workflow run 的安全结果 JSON 读取；
- 禁止按 conversationId 猜测“最近一条 run”并把来源挂到错误消息上。
```

### 11.2 原子持久化顺序

对于正常完成的 assistant 回复，宿主必须采用同一事务或等价原子语义：

```txt
1. 创建或更新 workflow run；
2. 保存 assistant message；
3. 将 workflow run.assistantMessageId 关联到该 message；
4. 保存安全的 workflow result / sources；
5. 提交事务；
6. 之后才对客户端发送成功完成语义。
```

禁止：

```txt
- 先通知客户端成功，再异步补保存关联；
- 助手消息已持久化但来源关联丢失；
- workflow run 指向不存在的 message；
- 在持久化失败时伪装 workflow:finish 为成功。
```

---

## 十二、流中止语义

V1.2 不实现服务端 AbortSignal 透传、模型取消、工具取消或已吐字续写。

冻结语义：

```txt
useChat.stop() / 客户端停止消费
→ 仅停止当前浏览器页面继续显示流。

服务端 workflow
→ 可能继续执行、完成写回并正常持久化。

重新进入会话
→ 用户可能看到该轮完整 assistant 回复及其来源。
```

因此：

```txt
- 客户端 stop 后不得据此把 run 标记为 aborted / partial；
- 只有服务端确实观测到 workflow 自身失败时，才按既有错误语义记录失败；
- 阶段 2 UI 必须避免把客户端停止显示误导为“服务端已取消”。
```

---

## 十三、实施顺序

### 13.1 子任务 01：创建独立 Package 与基础契约

内容：

```txt
- 新增 packages/tool-web-search；
- 配置 package、tsconfig、exports、README；
- 定义 WebSearchClient / Request / Response / Source；
- 定义稳定 domain error；
- 确保 package 不依赖 Demo UI 和 ai-core 实现细节。
```

完成标准：

```txt
- package 可被 Demo 引入；
- types 可独立 typecheck；
- 契约不出现 Tavily SDK 类型泄漏。
```

### 13.2 子任务 02：实现 TavilyWebSearchClient

内容：

```txt
- 构造函数注入 apiKey、timeout、retry、maxResults；
- 映射 Tavily 请求；
- 标准化 sources；
- 限制 5 条结果；
- 处理 URL、snippet、错误分类、有限重试。
```

完成标准：

```txt
- 使用真实 Tavily key 或受控 mock 均可验证；
- response 中不含 raw provider response；
- 无结果、401、429、timeout、5xx 均有稳定错误语义。
```

### 13.3 子任务 03：实现 web_search Tool Factory

内容：

```txt
- createWebSearchTool(client, options)；
- 固定模型可见参数；
- 将 Tool args 转为 WebSearchRequest；
- 返回安全 WebSearchToolData；
- 对错误映射为 ToolResult.ok=false。
```

完成标准：

```txt
- Tool 可被既有 ToolRegistry 注册；
- Tool execute 不依赖 Workflow 内部类型；
- Tool result 可被 Final Response 安全消费。
```

### 13.4 子任务 04：实现对话开关与条件注册

内容：

```txt
- migration：debug_conversations.web_search_enabled；
- repository / type / API 支持读取与 PATCH 更新；
- runtime 工厂根据 infra、conversation、ModelProfile 决定是否创建并注册 Tool；
- Debug 数据输出可用状态与原因。
```

完成标准：

```txt
- 默认新会话不开启搜索；
- 开关关闭时 Planner 看不到 Tool；
- key 缺失、infra disabled、model unsupported 时不会注册 Tool；
- fallback 能力变化不导致不可执行 Tool 泄漏给 Planner。
```

### 13.5 子任务 05：接入 Workflow、Prompt 约束与 Memory 隔离

内容：

```txt
- 复用既有 Tool Planning / Tool Execute / Final Response；
- 格式化 web_search Tool Result 的外部事实规则；
- 扩展 Memory Extraction Input 与 Extractor prompt；
- 禁止 web_search 结果进入长期 Memory 候选来源；
- 将安全 sources 写入 Workflow Trace / result JSON。
```

完成标准：

```txt
- 需要外部事实时模型可选择 web_search；
- 普通闲聊不会因为 Tool 存在而被强制搜索；
- 最终回答可正确引用来源编号；
- 用户说出的稳定偏好仍可写入 Memory；
- 搜索来源中的外部事实不会被写入 Memory。
```

### 13.6 子任务 06：完成 workflow run 关联与 Debug 验证

内容：

```txt
- migration：debug_workflow_runs.assistant_message_id；
- 实现 assistant message 与 completed run 原子关联；
- 保存来源到安全 run result；
- Debug 页面或 console 能查看 query、sources、duration、error、availability。
```

完成标准：

```txt
- 两轮连续搜索后，来源可以准确归属各自 assistant message；
- 刷新前后的来源恢复数据一致；
- 持久化失败不得伪造成功；
- stop 后服务端完成的消息与来源可在刷新后恢复。
```

---

## 十四、人工验收场景

### 场景 1：默认关闭

```txt
前置：新建 conversation。
操作：询问“今天新加坡天气怎么样？”
预期：
- webSearchEnabled=false；
- Planner 看不到 web_search；
- 不发生 Tavily 请求；
- Demo 显示 user_disabled。
```

### 场景 2：开启后可调用

```txt
前置：TAVILY_API_KEY 有效，模型 profile 支持 toolCalling，conversation 开启 web search。
操作：询问“今天新加坡天气怎么样？”
预期：
- Planner 可选择 web_search；
- Trace 出现 tool:call / tool:result；
- Tool result 有 query、provider、duration、最多 5 个 sources；
- Final Response 不把 raw provider response 直接输出。
```

### 场景 3：普通闲聊不搜索

```txt
前置：搜索已开启。
操作：输入“我今天有点累，陪我聊聊天。”
预期：
- Planner 输出 no_tool；
- 不发起 Tavily 请求；
- Companion 正常保持 Persona 与情绪回应。
```

### 场景 4：模型不支持 Tool Calling

```txt
前置：conversation 开启，Tavily key 有效，但当前实际模型 profile.toolCalling=false。
操作：发送时效性问题。
预期：
- web_search 不注册；
- Planner 看不到该 Tool；
- Debug 显示 model_unsupported；
- 不发生 Tavily 请求。
```

### 场景 5：搜索无结果 / 失败

```txt
前置：搜索开启。
操作：输入无意义或极端罕见 query，或使用受控异常 mock。
预期：
- Tool Result 有稳定 domain code；
- 最终回复坦诚未获得可靠资料；
- 不把猜测包装成搜索结论；
- 不泄漏 provider stack。
```

### 场景 6：Memory 隔离

```txt
前置：搜索开启。
操作：
1. 用户说“我喜欢五月天”；
2. 用户再询问“五月天最近有什么新闻？”并触发搜索。
预期：
- “用户喜欢五月天”可进入长期 Memory；
- 搜索新闻摘要、时间、链接、外部人物事实不得进入长期 Memory。
```

### 场景 7：来源关联正确

```txt
前置：同一 conversation 连续进行两次不同搜索。
操作：刷新页面或重新加载 conversation。
预期：
- 每条 assistant message 只显示自身 workflow run 的 sources；
- 第一轮来源不会挂到第二轮消息；
- 不按“最新 workflow run”进行错误恢复。
```

### 场景 8：客户端 stop

```txt
前置：触发较慢的搜索与流式回复。
操作：客户端停止显示。
预期：
- 当前页面不再继续展示 token；
- 不将服务端 run 伪标记为 aborted；
- 若服务端仍完成，刷新后可看到完整持久化消息与来源。
```

---

## 十五、非目标

本阶段明确不做：

```txt
- AI SDK UI useChat、UIMessage、source card 视觉实现；
- 正式产品设计与移动端适配；
- Web Search 缓存、配额、账单与自动 Provider 切换；
- 网页全文抓取、浏览器自动化、截图、OCR；
- 多来源事实裁决、引用评分、自动事实核验；
- 搜索结果入库为 RAG 或长期 Memory；
- 服务端 AbortSignal 透传与真正取消 Tool / Model 请求；
- MCP、LangChain、LangGraph、多 Agent；
- 用户系统、权限、审计与商业化。
```

---

## 十六、阶段产出与下一阶段输入

阶段 1 完成后，应存在：

```txt
packages/tool-web-search
├── 可替换搜索抽象
├── Tavily 实现
├── web_search Tool Factory
└── README

apps/model-runtime-demo
├── Web Search 对话级开关
├── 条件 Tool 注册
├── 搜索 Trace / Runtime / 来源安全数据
├── workflow run ↔ assistant message 关联
└── 可恢复来源所需的安全结果 JSON

.requirements/stages/v1.2/stage-01
└── 本实施文档与对应 review 记录
```

阶段 2 只能在阶段 1 完整通过后开始，并以以下能力为输入：

```txt
- 安全且标准化的 WebSearchSource；
- assistant message 与 workflow run 的稳定关联；
- 可在流与持久化结果中恢复的 sources；
- 已有 Core Event / Wire Event 边界；
- 已有对话级 web search enabled 状态。
```

阶段 2 负责把这些能力映射为 AI SDK UI 的 `useChat`、`UIMessage`、source parts、tool/runtime data parts 与更完整的 Debug Workbench 体验。
