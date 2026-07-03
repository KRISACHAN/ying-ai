# V1.2 Stage 1 Patch：模型无关的 Web Search 触发与 Demo 最小验证

> 适用对象：`prod` 当前 V1.2 Stage 1 / Stage 2 代码。
>
> 目标：修复“用户明确要求联网搜索，但 Ollama、默认 OpenAI-compatible 或其它没有原生 Tool Calling 能力的模型仍回答无法搜索”的问题。
>
> 本补丁不修改 Tavily Provider，不将所有模型伪装为原生 Function Calling 模型，也不把搜索逻辑硬编码进 `packages/ai-core` 的 Workflow。

---

## 1. 根因

当前逻辑将 **Web Search 是否注册** 与 **当前模型是否原生支持 Tool Calling** 绑定：

```txt
conversation.webSearchEnabled
+ TAVILY_API_KEY
+ WEB_SEARCH_ENABLED
+ model.capabilities.toolCalling === true
↓
注册 web_search
```

这会导致：

```txt
Ollama / OpenAI-compatible / 其它普通文本模型
→ 默认 toolCalling=false
→ web_search 根本不注册
→ Planner 不可见
→ 即使用户说“帮我联网搜索”，模型也只能回答“我无法搜索”
```

正确分层应为：

```txt
“是否允许联网搜索”
→ 由会话开关 + Tavily 基础设施决定。

“是否能自动判断何时调用工具”
→ 由模型原生 Tool Calling 能力决定。

“用户明确要求联网搜索时能否执行”
→ 必须不依赖模型原生 Tool Calling。
```

---

## 2. 最终行为

```txt
会话 Web Search 开启
+ Tavily 可用
↓
web_search 始终注册到当前 Conversation Runtime
↓

A. 用户点击 Demo 的“联网搜索”按钮
→ 宿主确定性产出 web_search Tool Plan

B. 用户消息包含明确联网搜索意图
→ 宿主确定性产出 web_search Tool Plan

C. 用户未明确要求搜索，且模型支持原生 Tool Calling
→ 继续交给 DefaultToolPlanningProvider 自动规划

D. 用户未明确要求搜索，且模型不支持原生 Tool Calling
→ no_tool，正常聊天
```

因此：

```txt
Ollama
→ 明确搜索 / 点击搜索时可用。

GPT / OpenAI-compatible
→ 明确搜索 / 点击搜索时一定可用；支持原生 Tool Calling 时仍保留自动搜索。

其它文本模型
→ 明确搜索 / 点击搜索时可用；不需要支持 Tool Calling。
```

---

## 3. 修改范围

```txt
apps/model-runtime-demo/
├── app/lib/web-search-runtime.ts                 # 解除 Tool 注册与 toolCalling 的绑定
├── app/lib/web-search-planning-provider.ts       # 新增：宿主确定性搜索规划器
├── app/lib/companion-runtime.ts                  # 注入自定义 ToolPlanningProvider
├── app/api/conversations/[id]/messages/route.ts  # 接收 forceWebSearch
├── 对话页面的 composer / chat client              # 增加最小“联网搜索”开关
└── app/lib/*-verifier.ts                          # 新增或扩展验证

packages/ai-core/
└── 不修改公共 Workflow 行为，不按 web_search 名称写分支
```

---

## 4. Patch 01：解除 Web Search 注册与模型能力绑定

### 文件

```txt
apps/model-runtime-demo/app/lib/web-search-runtime.ts
```

### 删除的错误逻辑

删除下面这一类门控：

```ts
if (!supportsToolCalling(input.model)) {
  return { status: "model_unsupported", config };
}
```

也删除只为上述逻辑服务的：

```ts
supportsToolCalling(model)
ModelProfile import
model: ChatModel input
model_unsupported status
```

### 修改后的接口

```ts
export type WebSearchRuntimeStatus = "enabled" | "user_disabled" | "infra_unavailable";

export interface WebSearchRuntime {
  status: WebSearchRuntimeStatus;
  tool?: CreatedWebSearchTool;
  config: {
    maxResults: number;
    timeoutMs: number;
    retryCount: number;
  };
}

export function resolveWebSearchRuntime(input: {
  env: NodeJS.ProcessEnv;
  conversationEnabled: boolean;
}): WebSearchRuntime;
```

### 修改后的注册语义

```ts
export function resolveWebSearchRuntime(input: {
  env: NodeJS.ProcessEnv;
  conversationEnabled: boolean;
}): WebSearchRuntime {
  const config = readWebSearchConfig(input.env);

  if (!input.conversationEnabled) {
    return { status: "user_disabled", config };
  }

  const apiKey = readOptionalEnv(input.env, "TAVILY_API_KEY");
  const infraEnabled = input.env.WEB_SEARCH_ENABLED?.trim().toLowerCase() !== "false";

  if (apiKey === undefined || !infraEnabled) {
    return { status: "infra_unavailable", config };
  }

  const client = new TavilyWebSearchClient({
    apiKey,
    maxResults: config.maxResults,
    timeoutMs: config.timeoutMs,
    retryCount: config.retryCount,
  });

  return {
    status: "enabled",
    tool: createWebSearchTool(client, { maxResults: config.maxResults }),
    config,
  };
}
```

### 约束

```txt
- `enabled` 只表示“当前会话允许且基础设施具备搜索能力”；
- 不再表示模型是否有原生 Tool Calling；
- Runtime UI 可新增 `plannerMode` 字段，但不要继续把搜索状态写成 model_unsupported；
- `web_search` 必须继续受 conversation.webSearchEnabled 控制。
```

---

## 5. Patch 02：新增宿主级确定性搜索规划器

### 新文件

```txt
apps/model-runtime-demo/app/lib/web-search-planning-provider.ts
```

### 设计原则

```txt
- 它实现 ai-core 的 ToolPlanningProvider；
- 它不是新 Workflow；
- 它不是模型 Adapter；
- 它不改 ToolRegistry；
- 它只决定“这轮是否明确需要 host 直接发起 web_search Tool Call”；
- 未触发确定性搜索时，保留 DefaultToolPlanningProvider 的既有自动规划能力。
```

### 推荐实现

```ts
import {
  DefaultToolPlanningProvider,
  type ModelToolCall,
  type ToolPlan,
  type ToolPlanningInput,
  type ToolPlanningProvider,
} from "@ying-companion/ai-core";

export interface DemoWebSearchPlanningProviderOptions {
  forceWebSearch?: boolean;
  modelSupportsNativeToolCalling: boolean;
}

export class DemoWebSearchPlanningProvider implements ToolPlanningProvider {
  public readonly meta = {
    id: "tool-planning.demo-web-search",
    kind: "tool-planning",
    name: "Demo Web Search Planning Provider",
  } as const;

  private readonly fallbackPlanner = new DefaultToolPlanningProvider();

  public constructor(private readonly options: DemoWebSearchPlanningProviderOptions) {}

  public async plan(input: ToolPlanningInput): Promise<ToolPlan> {
    const webSearchAvailable = "web_search" in input.tools;

    if (!webSearchAvailable) {
      return this.options.modelSupportsNativeToolCalling
        ? this.fallbackPlanner.plan(input)
        : { type: "no_tool", reason: "no_tools" };
    }

    const latestUserText = getLatestUserText(input.messages);
    const requested =
      this.options.forceWebSearch === true || hasExplicitWebSearchIntent(latestUserText);

    if (requested) {
      return {
        type: "tool_calls",
        calls: [createHostWebSearchCall(latestUserText)],
      };
    }

    if (this.options.modelSupportsNativeToolCalling) {
      return this.fallbackPlanner.plan(input);
    }

    return { type: "no_tool", reason: "tool_calling_unavailable" };
  }
}

function createHostWebSearchCall(query: string): ModelToolCall {
  return {
    id: `host-web-search-${crypto.randomUUID()}`,
    name: "web_search",
    arguments: { query },
  };
}
```

### 明确搜索意图

V1.2 不做语义分类器，只做可解释的中文关键词匹配。最小词表：

```ts
const EXPLICIT_WEB_SEARCH_PATTERNS = [
  /联网搜索/iu,
  /网上搜/iu,
  /帮我搜/iu,
  /帮我查/iu,
  /搜索(?:一下|下)?/iu,
  /查一下/iu,
  /查查/iu,
  /最新(?:新闻|消息|动态|情况)/iu,
];
```

约束：

```txt
- 只检查本轮最新 user message；
- 命中时 query 默认使用完整用户输入；
- 不尝试删除“帮我查”“搜索一下”等自然语言前缀，避免把检索词剪坏；
- UI 的 forceWebSearch 优先级高于关键词；
- 不把“天气”“价格”“新闻”等名词本身视作强制搜索，避免普通闲聊被误搜；
- 模型原生 Tool Calling 的自动搜索仍保留，只是作为非强制路径。
```

### Planner Runtime 标记

建议给 `ToolPlan.runtime` 或本轮 Debug Metadata 增加安全宿主标记：

```ts
{
  planner: "host-forced-web-search" | "model-native" | "no-tool",
}
```

该字段仅用于 Debug / UI；不要伪造 `ModelRuntimeInfo.usedModel`。

---

## 6. Patch 03：在 Conversation Runtime 注入规划器

### 文件

```txt
apps/model-runtime-demo/app/lib/companion-runtime.ts
```

### 修改输入

```ts
export async function createConversationRuntime(input: {
  companion: DebugCompanion;
  conversationId: string;
  webSearchEnabled: boolean;
  forceWebSearch?: boolean;
  emotion: EmotionState | null;
  // existing fields
}): Promise<ConversationRuntime>;
```

### 修改 Web Search Runtime 创建

```ts
const webSearchRuntime = resolveWebSearchRuntime({
  env: process.env,
  conversationEnabled: input.webSearchEnabled,
});
```

不再传入 `model`。

### 注入 Provider

```ts
const modelSupportsNativeToolCalling = [model.primaryProfile, model.fallbackProfile].some(
  (profile) => profile?.capabilities.toolCalling === true,
);

const toolPlanningProvider = new DemoWebSearchPlanningProvider({
  forceWebSearch: input.forceWebSearch,
  modelSupportsNativeToolCalling,
});

const core = createCompanionCore({
  model,
  observer,
  emotion: new ModelEmotionEngine({ model }),
  memory: memoryRuntime.provider,
  summary: new PostgresDebugSummaryProvider(repository),
  tools,
  toolPlanningProvider,
  persona: new DefaultPersonaProvider(/* existing mapping */),
});
```

### 必须保持

```txt
- `createDemoTools()` 只要 webSearchRuntime.tool 存在就注册；
- Tool 的存在不再受模型原生能力影响；
- 未强制搜索且模型不支持 Tool Calling 时，Provider 返回 no_tool；
- 最终 generate / stream 不传 tools，继续只消费 Tool Result。
```

---

## 7. Patch 04：Route 接收本轮强制搜索请求

### 文件

```txt
apps/model-runtime-demo/app/api/conversations/[id]/messages/route.ts
```

### 请求体

```ts
interface ConversationMessageRequestBody {
  message?: unknown;
  modelConfig?: unknown;
  apiKeyOverride?: unknown;
  forceWebSearch?: unknown;
}
```

### 解析

```ts
const forceWebSearch = raw.forceWebSearch === true;
```

### Runtime 注入

```ts
runtime = await createConversationRuntime({
  companion: detail.companion,
  conversationId: id,
  webSearchEnabled: detail.conversation.webSearchEnabled,
  forceWebSearch,
  emotion: detail.conversation.emotion,
  repository,
  // existing model config and API key mapping
});
```

### 安全约束

```txt
- forceWebSearch 只影响本次请求；不持久化；
- conversation.webSearchEnabled 仍是外部请求总开关；
- 会话关闭时，即使请求带 forceWebSearch=true，也不注册 Tool，不发 Tavily 请求；
- Route 可以在 Web Search 未可用且 forceWebSearch=true 时返回普通聊天流，但 Debug metadata 必须标识未执行原因；
- 不要因为强制搜索不可用而直接让整轮聊天失败。
```

---

## 8. Patch 05：Demo 最小可见入口

### 目标

不重做聊天 UI，只增加一个让你能立即验证的本轮开关。

### 修改对话 composer

在当前发送区域增加：

```txt
[ 🌐 联网搜索 ]  开 / 关
```

推荐状态：

```ts
const [forceWebSearch, setForceWebSearch] = useState(false);
```

发送 body：

```ts
{
  message,
  modelConfig,
  ...(forceWebSearch ? { forceWebSearch: true } : {}),
}
```

发送完成或失败后：

```ts
setForceWebSearch(false);
```

### UI 约束

```txt
- 当前会话 webSearchEnabled=false：按钮 disabled，文案“先开启会话联网搜索”；
- 当前会话启用但 Tavily 不可用：按钮可显示不可用状态，避免用户误以为模型问题；
- forceWebSearch=true 时：发送按钮可显示“联网搜索并发送”；
- 不把该 toggle 持久化到 conversation；
- 聊天调试面板至少显示：
  - Web Search Runtime 状态；
  - 本轮 planner 模式（host-forced / model-native / no-tool）；
  - 是否注册 web_search；
  - 查询词、Tool Result、来源数量、错误码。
```

### 会话级开关入口

若 Stage 2 已有 `webSearchEnabled` Switch，则复用；没有则在会话页设置区加入最小 Switch：

```txt
允许本会话联网搜索：开 / 关
```

它调用既有：

```txt
PATCH /api/conversations/[id]
{ "webSearchEnabled": true }
```

---

## 9. Patch 06：验证

新增或扩展：

```txt
apps/model-runtime-demo/app/lib/web-search-planning-verifier.ts
```

并提供：

```bash
pnpm --filter @ying-companion/model-runtime-demo verify:web-search-planning
```

必须覆盖：

```txt
1. conversationEnabled=false
   → 不注册 web_search。

2. conversationEnabled=true + Tavily 可用 + model.toolCalling=false
   → 仍注册 web_search。

3. model.toolCalling=false + forceWebSearch=true
   → host 生成 web_search Tool Call。

4. model.toolCalling=false + 文本“帮我联网搜索今天新加坡天气”
   → host 生成 web_search Tool Call。

5. model.toolCalling=false + 普通聊天
   → no_tool。

6. model.toolCalling=true + 普通时效问题
   → 委托 DefaultToolPlanningProvider。

7. forceWebSearch=true 但 conversationEnabled=false
   → 不调用 Tavily；不产生 web_search Tool Call；聊天仍可完成。

8. primary 不可用且 fallback 不支持原生 Tool Calling
   → forceWebSearch 仍可执行搜索；最终回复使用 fallback 生成。

9. source 中含试图改变角色或请求额外操作的内容
   → 最终模型仅把它当外部资料，不执行额外操作。
```

手工验证最短路径：

```txt
1. 配置 TAVILY_API_KEY；
2. 在会话页打开“允许本会话联网搜索”；
3. provider 选择 Ollama；
4. 点“🌐 联网搜索”；
5. 输入“今天新加坡天气怎么样？”；
6. 观察 Tool Panel 出现 web_search、查询词与来源；
7. 最终回复正常流式生成，而非“我无法搜索”。
```

---

## 10. 非目标

```txt
- 不强制让所有模型 capability.toolCalling=true；
- 不改变 Ollama Adapter 的原生 Tool Calling 实现；
- 不在 ai-core Workflow 写搜索专用分支；
- 不让最终回复阶段重新携带 tools；
- 不把 forceWebSearch 持久化；
- 不做复杂意图分类器、自动搜索配额、缓存、RAG 或服务端取消。
```

---

## 11. 验收结论

完成后，Web Search 的可用性由：

```txt
Tavily 基础设施 + 当前会话授权
```

决定；模型原生 Tool Calling 只影响：

```txt
模型能否自动选择何时联网
```

用户通过明确自然语言或 Demo 的“联网搜索”开关，必须能够在 Ollama、GPT 和其它模型下稳定触发搜索。
