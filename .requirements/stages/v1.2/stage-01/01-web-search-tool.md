# AI Companion Core V1.2 - 阶段 1：Web Search Tool 实施文档

## 一、阶段目标

以 Tavily 作为首个可拔插 Search Provider，完成一个可开关、可规划、可执行、可追踪的 `web_search` Tool。

本阶段的目标不是“让每条消息都联网”，而是让现有 `ToolPlanningProvider` 在满足前置条件时，能够根据用户意图决定是否调用 `web_search`，并生成简洁可搜的 query。

完成后，现有链路应为：

```txt
用户输入
↓
Tool Planning
↓
no_tool / web_search tool_call
↓
WebSearchProvider（首个实现：TavilyWebSearchProvider）
↓
标准化 WebSearchResult
↓
Tool Context
↓
最终回答（generate / stream）
↓
tool:result / Trace / Wire Event 可观测
```

本阶段仅实施搜索 Tool 与工作流接入，不实施 AI SDK UI 主聊天界面、不重写 ConversationWorkspace、不做 Sources 卡片 UI。

---

## 二、前置基线

V1.1 已具备：

```txt
packages/ai-core
├── ToolRegistry / ToolProvider
├── ToolPlanningProvider
├── SimpleChatWorkflow
├── executeWorkflow() / streamWorkflow()
├── tool:call / tool:result / workflow:* 事件
└── Core Event 与 Wire Event 边界

apps/model-runtime-demo
├── 模型 Provider / capability 配置
├── Web Search Toggle 的宿主配置入口（如尚未完成则本阶段补齐）
├── NDJSON Wire Stream
└── Debug Workbench / Timeline
```

本阶段必须延续以下边界：

```txt
- ai-core 不读取 TAVILY_API_KEY。
- ai-core 不依赖 Tavily SDK、Tavily HTTP API 或 Tavily 类型。
- SimpleChatWorkflow 不得直接调用 Tavily。
- Web Search 必须经现有 Tool Planning → Tool Registry → Tool Execute 路径运行。
- 搜索结果不写入长期 Memory、Summary 或 Persona。
- executeWorkflow() 与 streamWorkflow() 均保持兼容。
- 阶段 2 只能消费本阶段稳定产出的 ToolResult / Wire Event；本阶段不为 UI 修改 ai-core 协议。
```

---

## 三、阶段完成标准

完成本阶段后，必须满足：

```txt
- 新增 packages/tool-web-search（Provider 无关 core），且可独立 typecheck / lint / build。
- 新增 packages/tool-web-search-tavily（Tavily adapter），且可独立 typecheck / lint / build / verify。
- Tavily API Key 只由 Demo Host 读取，再经工厂注入 TavilyWebSearchProvider。
- Web Search 关闭、Provider 未就绪、当前模型 toolCalling=false 时，模型不可见 web_search。
- 开启 Web Search 且三项前置满足时，Tool Planning 可以按用户意图生成 web_search tool_call。
- web_search 参数仅暴露 query（检索工程参数由 adapter 内策略层决定）。
- Provider 响应被标准化为 Provider 无关的 WebSearchResult。
- 最终回答能通过既有 Tool Context 使用搜索结果。
- tool:call、tool:result、Trace、Wire Event 能观察到搜索行为、query、结果摘要与失败状态。
- 搜索失败、空结果、未配置 Key 都不会伪造成功或伪造 Sources。
- Host 能从成功的 web_search ToolResult 派生 DemoWorkflowWebSearchMetadata；不得回写 Core ChatWorkflowOutput。
- 原有时间、情绪、Memory Search 等工具不回归。
- 配置 `apps/model-runtime-demo/.env` 后，`tool-web-search-tavily` 的 `verify:web-search-contract` 与 demo 的 `verify:web-search-workflow` 均通过（阶段完成门禁）。
```

---

## 四、目录与职责

建议目录如下；文件名可按现有仓库约定微调，但职责边界不得改变。

```txt
packages/tool-web-search/
├── src/
│   ├── types.ts
│   ├── normalize-web-search-input.ts
│   ├── result-quality.ts
│   ├── format-web-search-for-model.ts
│   ├── web-search-provider-error.ts
│   ├── web-search-tool.ts
│   └── index.ts
├── package.json
└── README.md

packages/tool-web-search-tavily/
├── src/
│   ├── tavily-web-search-provider.ts
│   ├── normalize-tavily-result.ts
│   ├── normalize-retrieval-query.ts
│   ├── extract-event-dates.ts
│   ├── search-strategy.ts
│   ├── tavily-search-defaults.ts
│   ├── tavily-web-search-error.ts
│   └── index.ts
├── scripts/
│   ├── verify-web-search-contract.mjs
│   └── search-strategy.test.mjs
├── package.json
└── README.md

apps/model-runtime-demo/
├── app/
│   ├── api/conversations/[id]/messages/route.ts   # 主聊天路径（NDJSON stream）
│   └── ...
├── lib/
│   ├── companion-runtime.ts            # createDemoTools()：条件注册 web_search
│   ├── web-search-runtime.ts           # 可用性判断、Provider 工厂、Tool 装配、Metadata 派生
│   ├── web-search-debug-log.ts         # 客户端安全的 Web Search Log 解析（不含 Tavily import）
│   ├── chat-stream-wire.ts             # 既有 Wire 映射；本阶段不改动 Core 事件类型
│   └── ...
└── scripts/
    └── verify-web-search-workflow.mjs    # 真实 E2E：Tavily + 模型 + 完整 workflow
```

职责：

```txt
packages/tool-web-search
→ Provider 无关 DTO、Tool Definition、质量门控、Tool Result 格式化。

packages/tool-web-search-tavily
→ Tavily HTTP adapter、响应 normalize、检索策略、contract verify。

apps/model-runtime-demo
→ 读取 env、按 WEB_SEARCH_BACKEND 选择 Provider、构造 ToolRegistry、显示可用状态、Metadata 派生与验证脚本。

packages/ai-core
→ 只按现有 Tool Planning / Tool Execute / Tool Context 契约工作；不认识 Tavily。
```

主路径与 Legacy 边界：

```txt
- 主路径：/conversations/[id] → createConversationRuntime() → companion-runtime.ts 的 createDemoTools()
- Legacy：/api/chat + chat-panel.tsx 内有重复的 createDemoTools()；本阶段不双轨维护，仅保证主路径可用
- 若后续抽取共享 tool factory，属于重构优化，不是本阶段阻塞项
```

---

## 五、Web Search 数据契约

### 5.1 Provider 无关的公开类型

`packages/tool-web-search/src/types.ts` 必须导出：

```ts
export type WebSearchProviderId = string;

export interface WebSearchInput {
  query: string;
  maxResults?: number;
}

export interface WebSearchRetrievalRequest {
  attempt: number;
  reason: string;
  provider: WebSearchProviderId;
  params: Record<string, string | number | boolean>;
}

export interface WebSearchRetrievalMetadata {
  attempts: number;
  primaryReason: string;
  fallbackUsed: boolean;
  retrievalQuery?: string;
  requests?: WebSearchRetrievalRequest[];
}

export interface WebSearchSource {
  id: string;
  title: string;
  url: string;
  snippet: string;
  score?: number;
  faviconUrl?: string;
  publishedAt?: string;
}

export interface WebSearchResult {
  provider: WebSearchProviderId;
  query: string;
  sources: WebSearchSource[];
  responseTimeMs?: number;
  usage?: {
    credits?: number;
    requestId?: string;
  };
  retrieval?: WebSearchRetrievalMetadata;
}

export interface WebSearchProvider {
  readonly id: WebSearchProviderId;
  search(input: WebSearchInput): Promise<WebSearchResult>;
}
```

约束：

```txt
- provider 不能写死为 "tavily" 联合类型；Tavily 仅是首个实现（Adapter 返回值可为 "tavily" 字符串）。
- WebSearchResult 不携带 Tavily 原始响应。
- snippet 必须限长：normalize 阶段截断至最多 400 字符（超出追加 "…"）；不得写入 raw HTML、raw_content 或无限制文本。
- query 在 Tool 层校验：trim 后非空，最长 256 字符；超长返回 TOOL_INVALID_ARGUMENTS。
- source.id 由 normalize 生成：优先使用 url 的稳定短 hash；无 url 时回退 `source-${index}`。
- publishedAt 仅在 Provider 确实可靠提供时填写；无法解析时省略，不伪造。
- Search DTO 不进入 ai-core 的公共抽象定义。
```

### 5.2 Tavily 默认请求策略

Tavily Search API 首版默认使用：

```txt
search_depth = basic
max_results = 5
include_answer = false
include_raw_content = false
include_images = false
include_favicon = true
include_usage = true
start_date = 当年 01-01（默认，见 tavily-search-defaults.ts）
auto_parameters = true（英文默认）；中文 CJK 查询 primary 为 false
```

说明：

```txt
- 最终回答由 Companion 模型生成，不直接采用 Tavily answer。
- 不请求 raw_content，避免上下文不可控膨胀。
- 标题、URL、摘要、分数与 favicon 用于 Tool Context、Trace 和后续 Sources UI。
- Tavily usage 只用于 Debug / Host Metadata，不进入长期记忆。
- topic / start_date / country / auto_parameters 不由 Planner 选择，而由 Tavily adapter 内检索策略层决定。
- 显式固定 search_depth=basic，控制成本。
- Planner 误写的过旧年份（如 2023）在 adapter 的 normalizeRetrievalQuery 中剥离，不进入 Tavily 请求。
```

Tavily Search API 支持 `query`、`topic`、`start_date`、`end_date`、`time_range`、`country`、`max_results`、`include_favicon`、`auto_parameters` 等参数；首版 primary 默认使用 `start_date=YYYY-01-01` 限制当年内容，`topic` 可取 general/news/finance，`country` 仅在 topic=general 时可用。

### 5.3 Tavily adapter 检索策略层

位于 `packages/tool-web-search-tavily/src/search-strategy.ts`；质量门控 `evaluateSearchQuality` 位于 core 包；来源排序与日期解析位于 `extract-event-dates.ts` + `normalize-tavily-result.ts`：

```txt
Query 预处理（normalizeRetrievalQuery）：
- 剥离 query 中早于当前年的四位数年份（防止 Planner 注入 2023 等旧年份）

Primary 策略（resolvePrimarySearchStrategy）：
- 默认 general + start_date=当年-01-01 + basic
- 查询含 CJK → general + country=china + auto_parameters=false + start_date
- 明确财经词 → finance + start_date
- 明确突发新闻词 → news + start_date

来源后处理（normalizeTavilyResult）：
- 从 title/snippet 解析具体日期（如 2026.07.27、7月27日）
- 优先排列「今天及以后」且未标记延期/取消的场次
- 票务页（含 时间：/大麦 等）略加权

质量门控（evaluateSearchQuality）：
- sources 为空 → poor
- top score < 0.15 → poor
- 查询含 CJK 但 top-3 结果无 CJK → poor

Fallback（resolveFallbackSearchStrategy）：
- primary 质量 poor 时，最多再搜一次
- 强制 general、清除 start_date；中文保留 country=china；auto_parameters=true
- 每次搜索最多 2 次 Tavily 调用，均为 basic
- retrieval.requests 记录每次真实 HTTP 参数，供 Debug 展示
```

---

## 六、web_search Tool 定义

### 6.1 工具名与参数

工具名固定：

```txt
web_search
```

工具参数 Schema：

```ts
{
  query: string;
}
```

参数约束：

```txt
- query trim 后不能为空；最长 256 字符，超出返回 TOOL_INVALID_ARGUMENTS。
- topic / start_date / country / search_depth 不暴露给模型；由 Tavily adapter 检索策略层决定。
- maxResults 不暴露给模型；首版固定为 5（与 Tavily 默认策略一致）。
```

### 6.2 Tool Description 要求

不新增平行的 Search Planner，也不在 Workflow 写关键词规则。

`web_search` 的 Tool Definition description 必须足够清晰，让既有 `ToolPlanningProvider` 能同时完成：

```txt
- 是否需要联网；
- query 改写。
```

description 必须明确：

```txt
- 仅用于依赖最新、实时、外部或可变信息的问题。
- 适用于新闻、天气、市场、价格、产品更新、当前人物/职位、近期事件等。
- 不应用于纯聊天、稳定常识、纯代码概念解释，除非用户明确要求检索或验证。
- query 应简洁、可检索、去除无意义口语。
- query 不得包含年份；时效由系统处理（Planner 不得注入 2023 等旧年份）。
- 检索参数（topic、start_date、地域）由 adapter 策略层处理，Planner 不得自行选择。
- 不能以 web_search 产出最终面向用户的自然语言答案；它只返回检索资料。
```

示例：

```txt
用户：最近 OpenAI 有什么值得关注的吗？
→ web_search({ query: "OpenAI latest news" })

用户：新加坡今天的天气如何？
→ web_search({ query: "Singapore weather today" })

用户：范玮琪最新的演唱会是什么时候？
→ web_search({ query: "范玮琪 最新 演唱会" })

用户：解释 Promise.all。
→ no_tool
```

---

## 七、Host 装配与可用性

### 7.1 三项前置

`web_search` 仅在以下条件同时满足时注册并注入：

```txt
1. webSearchEnabled = true（即 `WEB_SEARCH_ENABLED=true`）；
2. TAVILY_API_KEY 存在且 Provider 构造成功；
3. 当前有效模型 profile.capabilities.toolCalling = true。
```

任一条件不满足时：

```txt
- 不注册 web_search。
- Tool Planning 不可看到或选择 web_search。
- 聊天继续使用原有工具集合。
- Demo / Debug 返回明确 unavailable reason，而不是静默失败。
```

### 7.1.1 Toggle 与 env 来源

首版 Toggle 落点（本阶段不要求 ConversationWorkspace UI 重做）：

```txt
apps/model-runtime-demo/.env
├── TAVILY_API_KEY=...              # Provider 凭证；缺失 → missing_api_key
├── WEB_SEARCH_ENABLED=true|false   # 宿主开关；默认 false；缺失视为 false
└── OPENAI_MODEL_SUPPORTS_TOOL_CALLING=true   # 工作流 E2E 验证必需

可选预留（本阶段仅支持 tavily，非 tavily 值视为不可用）：
└── WEB_SEARCH_BACKEND=tavily
```

读取与注入落点：

```txt
web-search-runtime.ts
→ resolveWebSearchAvailability(env, modelCapabilities)
→ createWebSearchToolIfAvailable(...)

companion-runtime.ts → createDemoTools()
→ 在三项前置满足时 tools.register(web_search)
→ 不满足时不注册，并把 availability 挂入 runtime / debug 上下文
```

本阶段不要求请求体 `webSearchEnabled` 覆盖；阶段 2 UI 可再扩展运行时 Toggle。

建议 Host 侧可用性结构：

```ts
type WebSearchAvailability =
  | { available: true }
  | {
      available: false;
      reason:
        | "disabled"
        | "missing_api_key"
        | "tool_calling_unsupported"
        | "unsupported_backend"
        | "provider_initialization_failed";
    };
```

### 7.2 环境变量边界

```txt
apps/model-runtime-demo
→ 读取 TAVILY_API_KEY、WEB_SEARCH_BACKEND。
→ 经 createWebSearchProviderFromEnv() 构造 TavilyWebSearchProvider。
→ 经 createWebSearchTool({ provider }) 构造 web_search Tool。
→ 注入现有 ToolRegistry / ToolProvider。

packages/tool-web-search
→ 接收 WebSearchProvider 实例。
→ 不直接读取 process.env，也不绑定具体 vendor。

packages/tool-web-search-tavily
→ 实现 TavilyWebSearchProvider；不直接读取 process.env。

packages/ai-core
→ 不读取环境变量，也不感知 Tavily。
```

---

## 八、执行、结果与失败语义

### 8.1 正常执行

```txt
Tool Planning 产出 web_search tool_call
↓
ToolRegistry 执行 WebSearchTool
↓
TavilyWebSearchProvider.search()
↓
normalizeTavilyResult()
↓
WebSearchResult
↓
格式化为模型可读 Tool Context
↓
最终 generate / stream 回答
```

### 8.1.1 模型可读结果与 ai-core 边界

`formatWebSearchForModel()` 在 `packages/tool-web-search` 内实现，**不修改** ai-core 的 `formatToolResultForModel()`。

推荐落点：`web-search-tool.ts` 的 handler 在 normalize 后构造 `ToolResult.result`：

```ts
interface WebSearchToolModelPayload {
  usageInstructions: string; // 通用事实使用约束 + 当天日期（见下）
  search: WebSearchResult; // 结构化来源，供 Debug / Metadata 派生
}
```

`usageInstructions` 必须保持跨领域通用：

```txt
- 下列内容来自外部 Web Search，不是系统内置知识；
- Today is YYYY-MM-DD（运行时当天日期）；涉及今天、最新、当前、最近等相对时间时，以该日期理解；
- 仅使用 search.sources 能够支持的事实；
- 不得虚构 URL、标题、发布时间、人物、状态、分数、具体数字或引用；
- 来源彼此冲突时，应明确说明冲突，不得自行补全结论；
- 搜索结果不足以确认时，应说明信息不足或不确定，不得猜测；
- Provider answer（如存在）仅作辅助信息，不是唯一事实来源；
- 最终面向用户的自然语言回复由 Companion 基于结构化 search.sources 组织。
```

以下内容仍保留在 Tavily Adapter 的检索策略与结果排序中，但**不属于**模型层通用 `usageInstructions`：

```txt
- 从候选来源中识别并排序未来事件日期；
- 对延期、取消、票务等文本做检索质量与来源排序处理；
- 针对特定查询做 CJK、财经、新闻、时间窗口与 fallback 策略。
```

ai-core 的 `buildToolFollowUpMessages()` → `formatToolResultForModel()` 会对 `result` 做 JSON 序列化传给模型；因此**禁止**在 `SimpleChatWorkflow` 或 `persona-prompt-builder` 中写 `if (name === "web_search")` 特判。

`DemoWorkflowWebSearchMetadata` 从 `ToolResult.result.search`（或等价的 `WebSearchResult` 字段）派生，不依赖模型正文。

### 8.2 成功、空结果、失败

```txt
成功
→ ToolResult success（ok: true），result 为 WebSearchToolModelPayload（含 usageInstructions + search）。

空结果
→ 仍视为 ToolResult success，但 search.sources=[]。
→ 最终模型不得声称“找到了资料”。

失败（401 / 429 / timeout / 5xx / 网络错误）
→ ToolResult failure（ok: false）。
→ error.code 统一为 TOOL_EXECUTION_FAILED；message 为安全摘要，不含 API Key、原始 response body。
→ Trace / Timeline 可见 provider、错误类别与安全请求摘要。
→ 最终模型可诚实说明无法完成联网检索，或继续普通回答。
→ 不展示伪造 Sources。
```

Tavily HTTP 错误映射（首版）：

```txt
401 / 403        → "Tavily authentication failed"
429              → "Tavily rate limit exceeded"
408 / timeout    → "Tavily request timed out"
5xx              → "Tavily service unavailable"
网络 / 解析失败   → "Tavily request failed"
```

首版不做：

```txt
- Tavily 自动重试策略以外的第二搜索 Provider fallback；
- Tavily → Brave / Exa / OpenAI Web Search 自动切换；
- 搜索后自动二次深读 URL；
- 自动循环搜索直到模型满意。
```

---

## 九、可观测性与 Host Metadata

Core 继续产生既有：

```txt
tool:call
tool:result
workflow:finish
workflow:error
Trace / Debug Context
```

对成功的 `web_search`，Demo Host 在 `web-search-runtime.ts` 提供 `deriveWebSearchMetadataFromToolResult()`，从成功 ToolResult 派生（可在 messages route 或 Debug 层调用；**不修改** `chat-stream-wire.ts` 的 Core→Wire 基础映射）：

```ts
interface DemoWorkflowWebSearchMetadata {
  query: string;
  provider: WebSearchProviderId;
  sources: WebSearchSource[];
  responseTimeMs?: number;
  usage?: {
    credits?: number;
    requestId?: string;
  };
  retrieval?: WebSearchRetrievalMetadata;
}
```

Demo `RunDebugPanel` 提供 **Web Search Log**（`web-search-debug-log.ts`）：

```txt
- Planner query / arguments（来自 tool:call）
- retrieval.retrievalQuery（系统修正后的 Tavily query，若有）
- retrieval.requests[]（每次 Tavily HTTP 请求的完整 params）
- source 数量与 retrieval 元数据
```

严格边界：

```txt
- DemoWorkflowWebSearchMetadata 只属于 Host / Wire DTO / UI State。
- 不扩写、不回写、不修改 Core ChatWorkflowOutput.metadata。
- Sources 必须来自结构化 ToolResult，不得从模型自然语言用正则提取 URL。
- 搜索失败时，UI / Debug 从 tool:result failure 或 Trace 获取状态。
```

本阶段只保证 Wire 中可获得稳定搜索信息；Sources UI 卡片由阶段 2 实现。

---

## 十、实施顺序

### 10.1 建立双包与契约

1. 新增 `packages/tool-web-search`（core）与 `packages/tool-web-search-tavily`（Tavily adapter）及各自 README。
2. core 定义 Provider 无关 DTO 与 `createWebSearchTool()`。
3. Tavily adapter 定义 HTTP、normalize、检索策略与错误归一化。
4. 在 tavily 包添加 `verify-web-search-contract.mjs`：从 Demo `.env` 读取 `TAVILY_API_KEY`，真实调用 Tavily 并断言 normalize 结果。

### 10.2 实现 Tavily Provider 与 Tool

1. 实现 `TavilyWebSearchProvider`（`tool-web-search-tavily`）。
2. 实现 Tavily Response → `WebSearchResult` 的 normalize。
3. Host 使用 `createWebSearchTool({ provider })` 注册工具（不再使用 `createTavilyWebSearchTool`）。
4. 模型可读 Tool Context 格式化保留在 core 包。
5. 确保 Tavily 特有响应类型不越过 adapter 包边界。

### 10.3 接入 Demo Host

1. 新增 `web-search-runtime.ts`（仅服务端）：`resolveWebSearchAvailability`、`createWebSearchToolIfAvailable`、`deriveWebSearchMetadataFromToolResult`。
2. 新增 `web-search-debug-log.ts`（客户端安全）：从 Wire/ToolResult 解析 Web Search Log，不得 import `tool-web-search-tavily`。
3. `next.config.ts` 将 search 包列入 `serverExternalPackages`，避免客户端 bundle 拉入 Tavily。
4. 扩展 `companion-runtime.ts` 的 `createDemoTools()`：读取 `TAVILY_API_KEY`、`WEB_SEARCH_ENABLED` 与当前 model capabilities。
5. 更新 `apps/model-runtime-demo/.env.example`：补充 `TAVILY_API_KEY`、`WEB_SEARCH_ENABLED`、`OPENAI_MODEL_SUPPORTS_TOOL_CALLING` 说明。
6. 仅在三项前置满足时注册 `web_search`。
7. 将 `WebSearchAvailability` 写入 Debug Context；`RunDebugPanel` 展示 Web Search Log（搜索引擎请求参数）。

### 10.4 工作流与事件验证

1. 跑通 `pnpm --filter @ying-companion/tool-web-search-tavily verify:web-search-contract`。
2. 跑通 `pnpm --filter @ying-companion/model-runtime-demo verify:web-search-workflow`。
3. 验证 Tool Planning 在 Tool 可见时能生成 `web_search`。
4. 验证 Tool 执行结果进入 `buildToolFollowUpMessages()`。
5. 验证 `executeWorkflow()` 与 `streamWorkflow()` 都能走完整搜索链路。
6. 验证成功 / 空结果 / 失败均有正确 `tool:result` 与 Trace。
7. 验证 Host 可从 ToolResult 派生 Metadata，且不改写 Core Output。

---

## 十一、验证方案

> V1.2 阶段 1 **不考虑 CI**。阶段完成门禁 = 配置真实 `.env` 后两个 verify 脚本通过 + 下方人工走查记录。
> mock / fake 仅可作为开发辅助，**不能**单独作为 stage done 依据。

### 11.1 Env 来源（固定）

```txt
apps/model-runtime-demo/.env
├── TAVILY_API_KEY=...                        # verify:web-search-contract 必需
├── WEB_SEARCH_ENABLED=true                   # verify:web-search-workflow 必需
├── OPENAI_API_KEY=...
├── OPENAI_MODEL=...
└── OPENAI_MODEL_SUPPORTS_TOOL_CALLING=true   # verify:web-search-workflow 必需
```

脚本须 fail fast：Key 缺失或 `WEB_SEARCH_ENABLED` 不为 true 时，打印「请配置 apps/model-runtime-demo/.env」并 exit 1；**禁止静默 skip**。

dotenv 加载约定：两个 verify 脚本均从 `apps/model-runtime-demo/.env` 读取（与 Demo 宿主同一份配置）；参考 `packages/model-ollama/scripts/verify-ollama-adapter.mjs` 的加载方式。

### 11.2 `verify:web-search-contract`（阶段完成门禁 1/2）

```txt
位置：packages/tool-web-search-tavily/scripts/verify-web-search-contract.mjs
命令：pnpm --filter @ying-companion/tool-web-search-tavily verify:web-search-contract

步骤：
1. 加载 apps/model-runtime-demo/.env 中的 TAVILY_API_KEY
2. 用固定探针 query 发起真实 Tavily Search：
   - 英文探针："OpenAI latest news"（query-only）
   - 中文探针："范玮琪 最新 演唱会"（断言 sources 与艺人/演唱会相关）
3. 断言：
   - HTTP 成功且返回可解析 JSON
   - normalize 后 WebSearchResult.sources.length >= 1
   - 每条 source 含 id、title、url、snippet（snippet <= 400 字符，无 raw_content）
   - provider === "tavily"
   - retrieval 元数据存在（attempts >= 1；requests[] 含每次 Tavily params）
   - usage / responseTimeMs 存在则断言类型，不存在不伪造
4. 打印脱敏摘要（query、source 数、credits），不打印完整 API key
```

### 11.3 `verify:web-search-workflow`（阶段完成门禁 2/2）

```txt
位置：apps/model-runtime-demo/scripts/verify-web-search-workflow.mjs
命令：pnpm --filter @ying-companion/model-runtime-demo verify:web-search-workflow

步骤：
1. 加载 apps/model-runtime-demo/.env（TAVILY_API_KEY + WEB_SEARCH_ENABLED + OPENAI_* + toolCalling=true）
2. 经 createConversationRuntime / streamWorkflow 等价 Host 路径，对固定实时性问题执行完整流：
   探针 A："最近 OpenAI 有什么值得关注的吗？"
   探针 C："范玮琪最新的演唱会是什么时候？"
3. 断言（探针 A / C）：
   - 出现 tool:call 且 name === "web_search"
   - tool:call.arguments 仅含 query（query-only）
   - tool:result 含 JSON-safe WebSearchResult（sources.length >= 1）
   - 探针 C sources 与范玮琪/演唱会相关
   - deriveWebSearchMetadataFromToolResult 可产出 DemoWorkflowWebSearchMetadata
   - 收到 text:delta 与 workflow:finish；最终 output.text 非空
4. 探针 B："解释 Promise.all"（no_tool）
   - 断言未出现 web_search tool:call
5. Planner 未调用 web_search 时 fail fast；不得把 mock 当通过证据
```

### 11.4 人工走查（补充证据）

在 verify 脚本通过后，浏览器手工确认（写入 `.code-reviews/v1.2/stage-01` 验收记录）：

```txt
A. 近期信息（同探针 A）
   → Timeline 可见 plan / call / result；Debug 可读 query 与 sources

B. 非搜索问题（同探针 B）
   → Planner no_tool；Tavily 不被调用

C. WEB_SEARCH_ENABLED=false
   → web_search 未注册；availability.reason=disabled

D. OPENAI_MODEL_SUPPORTS_TOOL_CALLING=false
   → web_search 未注册；availability.reason=tool_calling_unsupported

E. 无效 TAVILY_API_KEY（临时改 .env）
   → tool:result failure 可见；不伪造 Sources
```

### 11.5 开发辅助（可选，非完成门禁）

本地开发可用 fake Tavily client 调试 normalize / 参数校验 / availability 分支；不纳入 stage done 判定，本阶段也不为 CI 单独设计。

---

## 十二、非目标与禁止项

本阶段禁止：

```txt
- 在 ai-core 内 import tavily 或直接发 HTTP 请求。
- 在 SimpleChatWorkflow 中新增 Tavily / web_search 特判 if/else。
- 新增平行 Search Planner。
- 用关键词规则替代 Tool Planning。
- 把 Tavily 原始 response / raw_content 直接塞给模型。
- 把搜索结果写入长期 Memory。
- 把 Sources 写回 ChatWorkflowOutput.metadata。
- 通过正则扫描模型文本构造 Sources。
- 为本阶段提前实现 AI SDK UI 主聊天界面。
- 为本阶段新增多 Provider 路由、MCP、深度研究 Agent 或浏览器自动化。
```

---

## 十三、阶段交付物

```txt
1. packages/tool-web-search（Provider 无关 core）
2. packages/tool-web-search-tavily（TavilyWebSearchProvider）
3. Host 侧 env、WEB_SEARCH_BACKEND 工厂、Availability 与 Tool 注入
4. Tool Planning → WebSearchProvider → Tool Context → Final Response 的完整链路
5. Core Event / Trace / Wire 中的搜索可观测信息
6. verify:web-search-contract（tavily 包）/ verify:web-search-workflow（demo）脚本与验收记录
7. apps/model-runtime-demo/.env.example 更新（TAVILY_API_KEY、WEB_SEARCH_ENABLED、WEB_SEARCH_BACKEND、toolCalling 说明）
8. 两份 package README
9. .code-reviews/v1.2/stage-01 的执行与 Review 文档
```
