# V1.2 Stage 1 Patch 0：多模型 Web Search 与 OpenAI Responses Native Search

> 适用对象：`prod` 当前 V1.2 Stage 1 / Stage 2 代码。
>
> 目标：让 Ollama、`OPENAI_MODEL`、其它 OpenAI-compatible 模型在用户明确要求时都能稳定联网；同时让配置了官方 OpenAI 凭据的环境优先使用 **OpenAI Responses API 内建 Web Search**，而非把它误当作普通 Function Calling。

---

## 1. 对上一版 Patch 的纠正

上一版只解决了“模型不支持原生 Tool Calling 时，宿主强制触发 Tavily 搜索”的问题，但遗漏了一个事实：

```txt
当前 OPENAI_MODEL
→ provider = openai-compatible
→ @ai-sdk/openai-compatible + generateText / streamText
→ 通用 OpenAI-compatible 路径
→ 不是 OpenAI 官方 Responses API 调用
→ 因此不会自动获得 OpenAI 内建 Web Search。
```

`OPENAI_BASE_URL` 可能指向官方 OpenAI，也可能指向任意兼容网关；不能因为模型名或 base URL 看起来像 OpenAI，就假设它支持 Responses Web Search。

正确目标不是只做 Tavily，也不是把所有模型虚假标为 `toolCalling=true`，而是引入两个可替换的搜索后端：

```txt
WebSearchClient
├── TavilyWebSearchClient
│   └── 适用于所有聊天模型：Ollama / OpenAI-compatible / 其它模型
│
└── OpenAIResponsesWebSearchClient
    └── 使用 OpenAI 官方 Responses API 的内建 web_search
    └── 适用于配置了官方 OpenAI 凭据的宿主
```

两者都输出同一个 `WebSearchResponse`，都复用已有：

```txt
web_search Tool
→ ToolRegistry
→ Tool Result
→ Final Response
→ Workflow Snapshot / UI 来源
```

因此：

```txt
聊天模型
≠
搜索 Provider
```

Ollama 可以用 Tavily，也可以用 OpenAI Responses Web Search；最终生成仍由 Ollama 完成。

---

## 2. 最终策略

### 2.1 两层能力拆分

```txt
A. 聊天模型能力
- 是否支持原生 Function Calling
- 只影响“模型能否自动决定调用工具”

B. 搜索 Provider 能力
- Tavily 或 OpenAI Responses Native Web Search 是否可用
- 决定“用户明确要求时系统是否能真正联网”
```

用户明确要求搜索时，绝不能依赖 A。

### 2.2 Web Search Backend 选择

新增宿主配置：

```txt
WEB_SEARCH_BACKEND=auto | tavily | openai-responses
```

语义：

```txt
tavily
→ 只使用 TAVILY_API_KEY。

openai-responses
→ 只使用官方 OpenAI Responses API；不可用时不偷偷改走 Tavily，明确报告 infra_unavailable。

auto
→ 优先 OpenAI Responses；不可用时回退 Tavily；两者都不可用则 infra_unavailable。
```

`auto` 的优先顺序：

```txt
1. OPENAI_WEB_SEARCH_ENABLED !== false
2. 有可用的官方 OpenAI API Key
3. OPENAI_WEB_SEARCH_MODEL 已配置，或可安全继承 OPENAI_MODEL
4. OpenAI Responses Client 初始化成功
→ 使用 openai-responses

否则：
5. TAVILY_API_KEY 存在且 WEB_SEARCH_ENABLED !== false
→ 使用 tavily

否则：infra_unavailable
```

### 2.3 官方 OpenAI 与 generic OpenAI-compatible 的显式边界

新增环境变量：

```env
# 搜索后端；默认 auto
WEB_SEARCH_BACKEND=auto

# OpenAI Responses Native Web Search
OPENAI_WEB_SEARCH_ENABLED=true
OPENAI_WEB_SEARCH_API_KEY=
OPENAI_WEB_SEARCH_MODEL=
```

约束：

```txt
- OPENAI_WEB_SEARCH_API_KEY 为空时，可回退读取 OPENAI_API_KEY；
- OPENAI_WEB_SEARCH_MODEL 为空时，可回退读取 OPENAI_MODEL；
- OPENAI_WEB_SEARCH_API_KEY 只能用于官方 OpenAI API；
- 不复用 OPENAI_BASE_URL；该变量是 generic OpenAI-compatible Chat Adapter 的 endpoint，可能不是 Responses API；
- 不根据模型字符串、base URL 或“看起来像 GPT”自动推断 Responses API 兼容性；
- 若用户选择 openai-responses，但 key / model 不可用，状态必须是 infra_unavailable，而非静默切换 Provider。
```

这样 `OPENAI_MODEL` 可以成为 OpenAI Native Search 的默认搜索模型，但前提是明确启用了官方 Responses 搜索配置；它不再被错误理解为“所有 OpenAI-compatible endpoint 都有内建搜索”。

---

## 3. 修改范围

```txt
packages/tool-web-search/
├── src/abstractions/web-search.ts
├── src/implementations/tavily-web-search-client.ts
├── src/implementations/openai-responses-web-search-client.ts   # 新增
├── src/implementations/web-search-client-factory.ts            # 新增或等价实现
├── src/tool/create-web-search-tool.ts
├── src/index.ts
├── package.json                                                 # 添加官方 openai SDK
└── scripts/verify-web-search-contract.mjs

apps/model-runtime-demo/
├── app/lib/web-search-runtime.ts
├── app/lib/web-search-planning-provider.ts                      # 新增
├── app/lib/companion-runtime.ts
├── app/lib/model-config.ts
├── app/api/conversations/[id]/messages/route.ts
├── 对话 composer / runtime debug panel
└── .env.example / README.md

packages/ai-core/
└── 不新增 OpenAI、Tavily 或搜索 Provider 依赖；不按 web_search 名称硬编码 Workflow 分支。
```

---

## 4. Patch 01：统一 WebSearchClient，不修改 Core

### 4.1 契约调整

OpenAI Responses 的原生引用并不保证提供 Tavily 风格的网页摘要。因此 `WebSearchSource.snippet` 不能继续作为强制字段。

修改为：

```ts
export interface WebSearchSource {
  id: string;
  title: string;
  url: string;
  snippet?: string;
  publishedAt?: string;
  score?: number;
  faviconUrl?: string;
}

export interface WebSearchResponse {
  query: string;
  sources: WebSearchSource[];
  provider: "tavily" | "openai-responses" | string;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}
```

规则：

```txt
- title、url 仍为有效来源的必填字段；
- snippet 有则展示，无则 UI 显示标题 / host，不制造伪摘要；
- 不因 OpenAI native citation 缺少 excerpt 而丢弃真实来源；
- Tool Result 与 UI 必须能处理 optional snippet。
```

### 4.2 OpenAIResponsesWebSearchClient

新增：

```txt
packages/tool-web-search/src/implementations/openai-responses-web-search-client.ts
```

它实现 `WebSearchClient`，并通过 OpenAI 官方 SDK 调用 Responses API 的内建 Web Search。

构造参数：

```ts
interface OpenAIResponsesWebSearchClientOptions {
  apiKey: string;
  model: string;
  timeoutMs: number;
  maxResults: number;
}
```

调用语义：

```txt
- 使用 Responses API；
- tools 中显式启用 OpenAI Web Search；
- 对用户 query 强制要求先执行网页搜索，不允许只凭模型已有知识回答；
- 请求 OpenAI 返回可恢复来源的 Web Search sources / URL citations；
- 提取官方返回的来源、URL citation 或 web search action sources；
- 标准化为 WebSearchSource[]；
- 不持久化完整 Responses 原始对象。
```

实现要求：

```txt
- 具体 tool type、include 字段和 SDK response shape 必须以实现当日 OpenAI 官方文档为准；
- 不能从模型回答正文正则猜 URL；
- 来源只能取自 Responses API 的结构化 citation / source 数据；
- 若 API 返回回答但没有任何可用来源，返回 WEB_SEARCH_NO_RESULTS 或 PROVIDER_ERROR，不把“无来源回答”伪装为可引用搜索结果；
- 记录 provider=openai-responses、durationMs、search model；
- 映射认证、限流、超时和 Provider 错误为既有稳定 domain code；
- 401 / 403 / 参数错误不重试；网络、429、5xx 可有限重试；
- 不泄漏 API key、原始 response、内部 reasoning 或异常 stack。
```

### 4.3 Provider Factory

新增或扩展：

```txt
packages/tool-web-search/src/implementations/web-search-client-factory.ts
```

它只负责按宿主已经解析好的配置创建 Client：

```ts
export type WebSearchBackend = "tavily" | "openai-responses";

export interface ResolvedWebSearchBackend {
  backend: WebSearchBackend;
  client: WebSearchClient;
}
```

不在该 package 读取环境变量。

---

## 5. Patch 02：Demo Runtime 独立选择搜索 Provider

### 文件

```txt
apps/model-runtime-demo/app/lib/web-search-runtime.ts
```

删除错误的前置条件：

```ts
if (!supportsToolCalling(input.model)) {
  return { status: "model_unsupported", config };
}
```

`resolveWebSearchRuntime()` 不再接收 `model: ChatModel`。搜索注册与 ChatModel 原生 Tool Calling 解耦。

推荐类型：

```ts
export type WebSearchRuntimeStatus =
  | "enabled"
  | "user_disabled"
  | "infra_unavailable";

export type WebSearchBackend = "tavily" | "openai-responses";

export interface WebSearchRuntime {
  status: WebSearchRuntimeStatus;
  backend?: WebSearchBackend;
  tool?: CreatedWebSearchTool;
  config: {
    requestedBackend: "auto" | WebSearchBackend;
    maxResults: number;
    timeoutMs: number;
    retryCount: number;
  };
  reason?: "missing_openai_responses_config" | "missing_tavily_config" | "user_disabled";
}
```

后端决策伪代码：

```ts
const requestedBackend = readWebSearchBackend(env); // auto | tavily | openai-responses

if (!conversationEnabled) return userDisabled;

if (requestedBackend === "openai-responses") {
  return tryCreateOpenAIResponsesRuntime() ?? infraUnavailable;
}

if (requestedBackend === "tavily") {
  return tryCreateTavilyRuntime() ?? infraUnavailable;
}

return (
  tryCreateOpenAIResponsesRuntime() ??
  tryCreateTavilyRuntime() ??
  infraUnavailable
);
```

### 搜索 Provider 与最终聊天模型组合

必须支持：

```txt
聊天模型                    搜索后端
────────────────────────────────────────────
Ollama                      Tavily
Ollama                      OpenAI Responses
OpenAI-compatible gateway   Tavily
OpenAI-compatible gateway   OpenAI Responses
Official OPENAI_MODEL       OpenAI Responses
Official OPENAI_MODEL       Tavily
```

这才是“无论 Ollama、GPT 还是其它模型都能搜索”的正确含义。

---

## 6. Patch 03：保留模型自动规划，新增宿主确定性规划

### 新文件

```txt
apps/model-runtime-demo/app/lib/web-search-planning-provider.ts
```

该 Provider 继续是宿主层 `ToolPlanningProvider`，不引入新 Workflow。

策略：

```txt
1. web_search 未注册
   → 对支持原生 Tool Calling 的模型交给 DefaultToolPlanningProvider；
   → 其它模型 no_tool。

2. forceWebSearch=true
   → 直接生成 web_search Tool Call。

3. 用户明确写“联网搜索 / 网上搜 / 帮我查 / 搜索一下”等
   → 直接生成 web_search Tool Call。

4. 没有明确要求，模型支持 native function calling
   → 交给 DefaultToolPlanningProvider 自动规划。

5. 没有明确要求，模型不支持 native function calling
   → no_tool。
```

关键区分：

```txt
OpenAI Responses Native Web Search
→ 是 WebSearchClient 的执行 Provider。

DefaultToolPlanningProvider 的 native tool calling
→ 是聊天模型是否自动产生 Tool Plan 的能力。

两者独立，不能混为一个 capability。
```

明确搜索意图只做可解释关键词；Demo 的 force 开关优先级最高。

---

## 7. Patch 04：Conversation Runtime 与 Route

### `companion-runtime.ts`

`resolveWebSearchRuntime`：

```ts
const webSearchRuntime = resolveWebSearchRuntime({
  env: process.env,
  conversationEnabled: input.webSearchEnabled,
});
```

不再传 model。

保留模型原生 Tool Calling 判断，但仅供 Planner 决策：

```ts
const modelSupportsNativeToolCalling = [model.primaryProfile, model.fallbackProfile].some(
  (profile) => profile?.capabilities.toolCalling === true,
);

const toolPlanningProvider = new DemoWebSearchPlanningProvider({
  forceWebSearch: input.forceWebSearch,
  modelSupportsNativeToolCalling,
});
```

`createDemoTools()` 只要 `webSearchRuntime.tool` 存在就注册。

### `messages/route.ts`

请求体增加：

```ts
interface ConversationMessageRequestBody {
  message?: unknown;
  modelConfig?: unknown;
  apiKeyOverride?: unknown;
  forceWebSearch?: unknown;
}
```

`forceWebSearch` 只影响本轮 Runtime，不持久化。会话总开关仍只读取数据库：

```txt
conversation.webSearchEnabled=false
→ 即使 forceWebSearch=true，也不注册 Tool、不调用任何搜索 Provider。
```

---

## 8. Patch 05：Demo 最小可见效果

在 composer 添加本轮 toggle：

```txt
[ 🌐 联网搜索 ]
```

发送时：

```ts
{
  message,
  modelConfig,
  ...(forceWebSearch ? { forceWebSearch: true } : {}),
}
```

发送结束后重置为 false。

会话级 `webSearchEnabled` 保持独立：

```txt
- 会话总开关关闭：本轮按钮 disabled，提示“先开启本会话联网搜索”；
- 搜索 Provider 不可用：按钮显示不可用原因；
- 本轮强制搜索：发送按钮文案“联网搜索并发送”；
- 不把 force 状态写入数据库。
```

Debug Panel 至少展示：

```txt
Web Search Runtime
├── enabled / user_disabled / infra_unavailable
├── backend: tavily | openai-responses
├── requestedBackend: auto | tavily | openai-responses
├── planner: host-forced | explicit-intent | model-native | no-tool
├── registered: true / false
├── query
├── sourceCount
└── metadata.code（失败时）
```

来源卡必须显示 `provider`；这能直观看出本轮是 Tavily 还是 OpenAI Responses 搜索。

---

## 9. 验证

### 自动验证

新增或扩展：

```bash
pnpm --filter @ying-companion/tool-web-search verify:web-search-contract
pnpm --filter @ying-companion/model-runtime-demo verify:web-search-planning
```

必须覆盖：

```txt
1. Tavily client 标准化来源。
2. OpenAI Responses client 从结构化 citation / source 数据标准化来源。
3. OpenAI Responses 无可用来源时不伪造 sources。
4. auto 优先 OpenAI Responses，缺失时回退 Tavily。
5. 强制 openai-responses 缺配置时是 infra_unavailable，不静默切 Tavily。
6. Ollama + Tavily + forceWebSearch：产生 web_search Tool Call。
7. Ollama + OpenAI Responses + forceWebSearch：产生 web_search Tool Call。
8. OpenAI-compatible gateway + Tavily + forceWebSearch：产生 web_search Tool Call。
9. Official OPENAI_MODEL + OpenAI Responses + forceWebSearch：产生 web_search Tool Call。
10. 不支持 native function calling 的模型，普通闲聊为 no_tool。
11. 支持 native function calling 的模型，非强制场景继续走 DefaultToolPlanningProvider。
12. 会话总开关关闭时，任何 backend 与 forceWebSearch 都不得发起外部请求。
13. 包含间接指令的来源仍只作为不可信资料，不改变角色、权限、任务范围或触发额外动作。
```

### 最短手工验证

```txt
A. Ollama + Tavily
1. WEB_SEARCH_BACKEND=tavily
2. 开启会话搜索
3. 点击“联网搜索”
4. 问“今天新加坡天气怎么样？”
5. 预期：Tool Panel 看到 web_search；backend=tavily；最终回复正常。

B. OpenAI Native Search
1. WEB_SEARCH_BACKEND=openai-responses
2. 配置 OPENAI_WEB_SEARCH_API_KEY 和 OPENAI_WEB_SEARCH_MODEL
3. 开启会话搜索
4. 点击“联网搜索”
5. 预期：backend=openai-responses；来源来自结构化 Responses citation/source；最终聊天模型可为 OPENAI_MODEL 或 Ollama。

C. Auto fallback
1. WEB_SEARCH_BACKEND=auto
2. 移除 OpenAI Responses 配置，仅保留 TAVILY_API_KEY
3. 预期：backend=tavily。
```

---

## 10. 非目标

```txt
- 不把 OpenAI Responses API 伪装成 generic OpenAI-compatible endpoint；
- 不强制所有模型 toolCalling=true；
- 不把 OpenAI/Tavily SDK 放入 ai-core；
- 不让最终回复阶段再次传 tools；
- 不把 forceWebSearch 持久化；
- 不做多 Provider 并发搜索、结果裁决、缓存、配额、RAG 或服务端取消。
```

---

## 11. 验收结论

完成后：

```txt
“是否能够联网”
→ 会话开关 + 搜索 Backend 配置决定。

“使用 Tavily 还是 OpenAI 原生 Web Search”
→ WEB_SEARCH_BACKEND 决定。

“最终由谁聊天回答”
→ 当前选择的聊天模型决定。

“模型能否自动判断是否搜索”
→ 仅由该聊天模型的 native function calling 能力决定。
```

用户通过 Demo 的“联网搜索”开关或明确自然语言请求，必须能在 Ollama、`OPENAI_MODEL` 和其它模型路径下稳定获得真实外部搜索结果。