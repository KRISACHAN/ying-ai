# AI Companion Core V1.1 - 阶段 6：Ollama Model Adapter 实施文档

## 一、阶段目标

在 Stage 1～5 已完成 Persona 扩展、V1.1 流协议、模型能力档案、工具规划、工作流步骤函数化与真实流式工作流的基础上，新增一个独立的 Ollama ChatModel Adapter。

本阶段交付的是：

```txt
packages/model-ollama
├── OllamaChatModel
├── Ollama 配置与工厂
├── ChatMessage / Tool / ToolResult 映射
├── generate() 适配
├── stream() 适配
├── retry / fallback / capability 筛选
└── 统一 ModelRuntimeInfo
```

目标不是让 `ai-core` 知道 Ollama，而是让宿主能够像注入 OpenAI-compatible 模型一样注入 Ollama：

```ts
import { createOllamaChatModel } from "@ying-companion/model-ollama";
import { createCompanionCore } from "@ying-companion/ai-core";

const model = createOllamaChatModel({
  model: "<本地已安装模型>",
  host: "http://127.0.0.1:11434",
});

const core = createCompanionCore({ model });
```

本阶段完成后，以下 Core 调用形式必须保持不变：

```ts
await core.executeWorkflow(input);

for await (const event of core.streamWorkflow(input)) {
  // 消费 Workflow 级流事件
}
```

> 核心原则：Ollama 是一个外部 SDK Adapter，不是 `ai-core` 的内置分支。Workflow 只能依据本次调用实际生效的 `ModelProfile` 与 `requiredCapabilities` 行为，不得判断 `provider === "ollama"`。

---

## 二、前置基线

### 2.1 已完成阶段能力

```txt
Stage 1：Persona Profile
├── userDisplayName / userAddress
├── profile.hobbies / appearance
├── buildPersonaPrompt()
└── normalizeCompanionPersona()

Stage 2：V1.1 契约与流事件
├── executeWorkflow()
├── streamWorkflow()
├── ChatWorkflow.stream?()
├── ChatWorkflowStreamEvent
└── Core Event / Wire Event 分离

Stage 3：模型策略与工具规划
├── ModelProfile / ModelCapabilities
├── RequiredModelCapabilities
├── ModelRuntimeInfo / capabilitySkips
├── ToolPlanningProvider
└── ToolPlan = no_tool | tool_calls

Stage 4：工作流步骤函数化
├── WorkflowExecutionState
├── Tool Plan → Tool Execute → Final Generate
└── executeWorkflow() 兼容重构

Stage 5：工作流级流式聊天
├── SimpleChatWorkflow.stream()
├── Final Response → ChatModel.stream()
├── text:delta × N
└── workflow:finish / workflow:error
```

Stage 6 只能消费以上已经冻结的契约，不得重新定义：

```txt
- ChatModel
- GenerateInput / GenerateOutput / GenerateStreamChunk
- ModelProfile / ModelCapabilities
- RequiredModelCapabilities
- ModelRuntimeInfo
- ModelCapabilitySkipItem
- ModelToolCall
- ChatWorkflowStreamEvent
```

### 2.2 当前 ChatModel 契约

当前 `packages/ai-core/src/abstractions/model.ts` 已定义：

```ts
export interface ChatModel extends CoreProvider {
  readonly primaryProfile: ModelProfile;
  readonly fallbackProfile?: ModelProfile;

  generate(input: GenerateInput): Promise<GenerateOutput>;
  stream(input: GenerateInput): AsyncIterable<GenerateStreamChunk>;
}

export interface ModelProfile {
  provider: string;
  model: string;
  capabilities: ModelCapabilities;
}

export interface ModelCapabilities {
  streaming: boolean;
  toolCalling: boolean;
  usage: boolean;
}
```

`GenerateInput` 已支持：

```ts
export interface GenerateInput {
  messages: ChatMessage[];
  tools?: Record<string, unknown>;
  temperature?: number;
  maxTokens?: number;
  requiredCapabilities?: RequiredModelCapabilities;
}
```

因此 Stage 6 的 Adapter 只需要实现上述抽象；不得为了 Ollama 修改 Workflow 的公开调用方式。

### 2.3 官方 SDK 基线

本阶段使用官方 JavaScript SDK：

```txt
npm package：ollama
SDK：ollama-js
```

其 `chat()` 支持：

```txt
- model
- messages
- stream: true（返回 AsyncGenerator）
- tools
- keep_alive
- options
- 自定义 host
```

默认本地 Ollama Host 为：

```txt
http://127.0.0.1:11434
```

官方 SDK 的 `stream: true` 返回异步生成器，可自然映射为 `AsyncIterable<GenerateStreamChunk>`。本阶段只使用 `chat()`；不使用 `generate()` endpoint。

> 不允许使用 `ollama/browser`。本 Adapter 是服务端 / Node.js 运行时 Adapter；浏览器端不得直接连接本地模型服务，也不得持有模型配置中的私密信息。

---

## 三、阶段完成标准

完成本阶段后，必须满足：

- 新增独立 workspace package：`packages/model-ollama`；
- `packages/ai-core` 不新增 `ollama` 运行时依赖，不 import Ollama SDK；
- `packages/model-ollama` 仅依赖 `@ying-companion/ai-core` 的公开类型与官方 `ollama` SDK；
- `OllamaChatModel` 实现完整 `ChatModel`：`generate()` 与 `stream()`；
- `generate()` 能把 Core `ChatMessage[]` 映射为 Ollama chat 请求，并映射统一 `GenerateOutput`；
- `stream()` 能把 Ollama AsyncGenerator 映射为 Core `GenerateStreamChunk`；
- `stream()` 仅在首个非空文本 delta 之前允许 retry / fallback；已经输出可见文本后不得切换模型继续生成；
- Adapter 必须按 `requiredCapabilities` 过滤 primary / fallback 候选；
- primary / fallback 不满足调用所需能力时，必须记录 `capabilitySkips`，不得发起不兼容请求；
- 当所有候选都不满足能力时，抛出与 Stage 3 一致的模型能力不可用错误；
- `primaryProfile` 与 `fallbackProfile` 代表具体 Ollama 模型，而不是泛化的 `ollama` Provider；
- `provider` 固定为 `"ollama"`，仅用于 runtime / UI 展示；Workflow 不得据此分支；
- 默认不假定任意 Ollama 模型支持 tool calling；工具能力必须由具体模型配置或显式 override 决定；
- `usage` 仅在 SDK 响应确实提供且宿主将具体模型声明为稳定支持时才可作为 required capability；
- 工具调用返回值能够映射为 `ModelToolCall[]`，但模型声明不支持 tool calling 时不得传入 `tools`；
- `raw` 只在 Core 内部保留为调试字段，不得假定可 JSON 序列化；
- 运行时信息必须统一返回 `ModelRuntimeInfo`，包括最终使用模型、retry、fallback、错误与能力跳过；
- Stage 6 不实现 Demo UI、HTTP Route、NDJSON 消费、环境变量表单与 Provider 下拉框；这些属于 Stage 7；
- Stage 6 不实现 Ollama Embedding Provider；现有 RAG EmbeddingProvider 保持独立；
- `packages/model-ollama`、`packages/ai-core` 与 Demo 受影响引用的 typecheck、lint、build 通过；
- 至少完成本文件定义的人工验收，并将结果归档到 `.code-reviews/v1.1/`。

---

## 四、范围与非目标

### 4.1 本阶段必须做

```txt
1. 创建 packages/model-ollama workspace package
2. 定义 OllamaChatModelOptions 与具体模型档案解析规则
3. 实现 Core → Ollama 的消息映射
4. 实现 Core Tool Definition → Ollama Tool 的映射
5. 实现 Ollama tool_calls → ModelToolCall[] 的映射
6. 实现 generate()
7. 实现 stream()
8. 实现 retry / fallback / capability 筛选 / runtime 归一化
9. 暴露稳定 package API
10. 提供不依赖 Demo UI 的本地人工验证入口
11. 完成 Stage 6 Review
```

### 4.2 本阶段明确不做

```txt
- 修改 ai-core Workflow 的业务编排
- 修改 SimpleChatWorkflow.stream() 的事件协议
- 修改 ChatWorkflowStreamEvent 或 Wire Event
- HTTP Route、POST + fetch、NDJSON 编解码
- React 流式 UI、Provider 配置表单、Demo Provider 选择器
- Ollama EmbeddingProvider
- 浏览器端直连 Ollama
- Ollama Cloud API / OLLAMA_API_KEY 的产品化支持
- 跨 Provider fallback（例如 Ollama → OpenAI-compatible）
- 自动探测某模型是否支持 tool calling / streaming 并将探测结果持久化
- 用户取消、AbortSignal、断线恢复、token replay
- 流中工具调用、流式多轮 Tool Loop
- 通过模型名称字符串硬编码能力白名单
- 在 ai-core 中增加任何 Ollama 专有分支
```

> Stage 6 可以在最小验证脚本中手动构造 `OllamaChatModel`，但不得为了方便而提前完成 Stage 7 的 Demo 配置页面或网络传输层。

---

## 五、目录与职责

建议目录如下。实际文件名可随仓库既有规范调整，但职责边界不得改变。

```txt
packages/model-ollama/
├── package.json
├── tsconfig.json
├── README.md                         # 包级使用说明；Stage 8 再补完整项目文档
└── src/
    ├── index.ts                      # 稳定公共导出
    ├── ollama-chat-model.ts          # ChatModel 实现
    ├── ollama-options.ts             # Options / config / 默认值
    ├── ollama-message-mapper.ts      # ChatMessage ↔ Ollama message
    ├── ollama-tool-mapper.ts         # Core tool definition / tool call 映射
    ├── ollama-runtime-mapper.ts      # usage / raw / runtime 的归一化
    ├── ollama-retry.ts               # retry / backoff 小型纯逻辑（如需要）
    └── errors.ts                     # Adapter 私有错误（如需要）

packages/ai-core/
└── src/
    └── abstractions/model.ts          # 仅消费既有公开契约；原则上不应为 Stage 6 改动

apps/model-runtime-demo/
└── app/lib/
    └── model-factory.ts               # Stage 7 才注册 createOllamaModelStrategy
```

职责边界：

```txt
packages/ai-core
→ 定义 ChatModel 与模型能力抽象。
→ 不知道 Ollama SDK、host、keepAlive、模型安装状态。

packages/model-ollama
→ 负责所有 Ollama SDK 调用与协议适配。
→ 不读取 process.env。
→ 不依赖 React、Next.js、HTTP Route、Demo 数据库。
→ 不编排 Persona / Memory / Emotion / Tool Workflow。

apps/model-runtime-demo
→ Stage 7 才负责读取 UI / env 配置。
→ Stage 7 才通过 ModelAdapterRegistry 注册 Ollama Strategy。
→ 不复制 Ollama SDK 映射与 retry/fallback 逻辑。
```

依赖方向必须保持：

```txt
apps/model-runtime-demo
  ↓
packages/model-ollama
  ↓
packages/ai-core

packages/ai-core
  ✕ 不得反向依赖 model-ollama
packages/model-ollama
  ✕ 不得依赖 apps/model-runtime-demo
```

---

## 六、Package 与公开 API 设计

### 6.1 Package 名称

建议使用：

```txt
@ying-companion/model-ollama
```

原因：

```txt
model-ollama
→ 说明这是 Chat Model Adapter。
→ 不暗示它包含 Embedding、Memory、RAG 或 Workflow。
→ 与未来 model-anthropic / model-gemini 等 Adapter 保持一致。
```

### 6.2 Package dependencies

`package.json` 应遵守：

```txt
runtime dependencies
├── @ying-companion/ai-core
└── ollama

dev dependencies
├── typescript
├── eslint / prettier（遵循根项目约定）
└── 既有 workspace 构建工具
```

禁止：

```txt
- 将 ollama 写入 packages/ai-core/package.json
- 将 apps/model-runtime-demo 写为 model-ollama dependency
- 依赖 pg / drizzle / memory-postgres
- 依赖 next / react
- 引入 @ai-sdk/* 仅为了复制 OpenAI Adapter 的实现
```

### 6.3 推荐公开 API

```ts
export interface OllamaChatModelOptions {
  /** 具体 Ollama 模型，例如本地已安装的模型名称。 */
  model: string;

  /** Ollama 服务地址；未传时由 Adapter 使用官方默认本地地址。 */
  host?: string;

  /** 模型加载保持策略，透传为 Ollama chat 的 keep_alive。 */
  keepAlive?: string | number;

  /** 最多重试次数；仅针对尚未可见输出的调用。 */
  maxRetries?: number;

  /** 重试退避基础时间；具体单位与默认值必须在实现中固定并文档化。 */
  retryDelayMs?: number;

  /** 同一 Ollama host 的备用模型；不做跨 Provider fallback。 */
  fallback?: OllamaFallbackModelOptions;

  /** primary 具体模型能力覆盖。 */
  primaryProfileOverride?: ModelProfileOverride;
}

export interface OllamaFallbackModelOptions {
  model: string;
  profileOverride?: ModelProfileOverride;
}

export class OllamaChatModel implements ChatModel {
  readonly primaryProfile: ModelProfile;
  readonly fallbackProfile?: ModelProfile;

  generate(input: GenerateInput): Promise<GenerateOutput>;
  stream(input: GenerateInput): AsyncIterable<GenerateStreamChunk>;
}

export function createOllamaChatModel(
  options: OllamaChatModelOptions,
): ChatModel;
```

说明：

```txt
- options.model 是 primary 具体模型名称，不是 provider 名称。
- fallback 只允许同一个 Ollama host 下的第二个模型。
- 跨 Provider fallback 需要一个更高层 Model Router，属于未来版本，不在 Stage 6 模拟实现。
- host 只是 Adapter 配置，不进入 ai-core，也不应在 Core runtime 中被展示为业务字段。
- provider 与 model 由实际 Adapter options 推导，不能由 profile override 伪造。
- profile override 只能覆盖 capabilities 字段，沿用 Stage 3 的 ModelProfileOverride 约束。
```

### 6.4 默认模型档案

建议 Adapter 建立 primary profile：

```ts
const primaryProfile: ModelProfile = {
  provider: "ollama",
  model: options.model,
  capabilities: {
    streaming: true,
    toolCalling: false,
    usage: false,
  },
};
```

然后再合并：

```ts
primaryProfileOverride?.capabilities
```

默认策略必须明确：

```txt
streaming
→ 默认 true。
→ Ollama chat stream API 可以返回 AsyncGenerator；本 Adapter 具备流适配能力。
→ 若宿主明确声明某个具体模型 / 网关不支持稳定流，可 override 为 false。

toolCalling
→ 默认 false。
→ SDK 支持 tools 不代表当前具体本地模型可靠支持 tools。
→ 只有宿主明确为该具体模型设置 toolCalling: true 时，Workflow 才会进行工具规划。

usage
→ 默认 false。
→ Ollama 响应可能包含评估计数，但不同模型 / 网关 / 版本下未必稳定。
→ Adapter 可尽力映射 usage；但 requiredCapabilities.usage 不得默认通过。
```

这不是削弱 Ollama，而是遵守 Stage 3 原则：

> 能力属于具体模型候选，而不是 Adapter 或 Provider 名称。

---

## 七、消息与参数映射

### 7.1 使用 chat()，不使用 generate()

Core 已经拥有结构化 `ChatMessage[]`，因此 Adapter 必须调用：

```ts
client.chat({
  model,
  messages,
  ...
});
```

禁止把多轮 messages 拼成单一字符串后调用 Ollama `generate()` endpoint。

原因：

```txt
- 会丢失 system / user / assistant / tool 角色边界；
- 会使工具规划、工具结果与后续模型行为不可控；
- 会让 Prompt 调试与跨 Provider 行为漂移；
- 与 ChatModel 的既有消息抽象不一致。
```

### 7.2 ChatMessage 映射规则

Core 输入：

```ts
export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: ModelToolCall[];
}
```

Adapter 必须有单一、可单独人工验证的映射函数：

```ts
function toOllamaMessages(messages: ChatMessage[]): OllamaMessage[];
```

映射原则：

```txt
system
→ Ollama system message。

user
→ Ollama user message。

assistant
→ Ollama assistant message。
→ 若 Core assistant message 含 toolCalls，必须映射为 SDK / API 支持的 assistant tool call 表达。

tool
→ 使用官方 SDK 当前版本支持的 tool result 表达。
→ 必须保留工具名称、结果内容以及可关联信息。
→ 不能把 tool result 伪装成普通 user message。
```

实现前必须：

```txt
1. 锁定 package.json 中的 ollama 版本范围；
2. 阅读该版本安装后的 TypeScript 类型；
3. 以该版本的 ChatRequest / Message / ToolCall 类型为唯一实现依据；
4. 不根据网络文章或旧版 SDK 示例猜测 tool result 字段。
```

### 7.3 内容约束

```txt
- `content` 必须保持原文，不 trim，不擅自合并相邻 message。
- 空 content 是否允许由 Core 契约与 SDK 类型共同决定；不得为了“清理”删除具备 toolCalls 的 assistant message。
- 不支持的 Core message 形态必须在 Adapter 边界抛出带上下文的错误，而不是静默改变角色。
- raw SDK response 不得回填到 ChatMessage。
```

### 7.4 参数映射

Core 参数与 Ollama chat 请求映射：

```txt
GenerateInput                       → Ollama chat request
────────────────────────────────────────────────────────────
model（Adapter 实际候选模型）       → model
doc messages                         → messages
input.temperature                    → options.temperature（如 SDK 当前版本支持）
input.maxTokens                      → options.num_predict（如 SDK 当前版本支持）
options.keepAlive                    → keep_alive
input.tools                           → tools
```

约束：

```txt
- 不得把 GenerateInput.model 重新引入为临时切换候选模型的入口；当前 ChatModel 实例的 primary / fallback 才决定模型候选。
- temperature / maxTokens 均为 optional；未传时不得塞入虚构默认值覆盖 Ollama 默认行为。
- 仅在 SDK 类型确认支持时映射 options.temperature / options.num_predict。
- keepAlive 由 Adapter options 管理，不从 Workflow 动态注入。
- 流式与非流式调用使用相同的参数映射函数，避免行为漂移。
```

---

## 八、工具定义与工具调用映射

### 8.1 与 Stage 3 / 4 / 5 的关系

Stage 4 已将工作流改为：

```txt
Tool:list
↓
Tool:plan
↓
Tool:execute（如有 tool_calls）
↓
Final Generate / Final Stream（不再传入 tools）
```

因此 Stage 6 对工具的责任是：

```txt
工具规划调用
→ 让 Ollama 具体模型在支持 toolCalling 时返回结构化工具调用。

最终回答调用
→ 不传 tools。
→ 不允许 Ollama 在 final generate / final stream 中再发起未规划工具调用。
```

### 8.2 tools 传递规则

```txt
input.tools === undefined 或空对象
→ 不传 tools。

input.tools 非空
且本次实际候选 profile.capabilities.toolCalling === true
→ 映射为 Ollama SDK tools。

input.tools 非空
但候选不支持 toolCalling
→ 该候选不满足 requiredCapabilities.toolCalling。
→ 不得向它发送 tools。
→ 由统一 capability 筛选决定 fallback 或抛出能力不可用错误。
```

### 8.3 Core 工具定义映射

Core 的 `tools` 当前是 Adapter 适配前的抽象对象：

```ts
tools?: Record<string, unknown>;
```

本阶段不得在 Ollama Adapter 内重新定义全局 Tool Schema。

实施要求：

```txt
- 先识别 Stage 3 DefaultToolPlanningProvider / 现有 OpenAI-compatible Adapter 的工具输入具体形状；
- 将同一抽象工具定义映射为 SDK 当前版本接受的 Ollama Tool[]；
- 参数 schema 必须保留 JSON Schema 语义；
- 禁止将 tool 参数 schema stringify 成 prompt 文本作为替代；
- 无法映射的工具定义必须在规划调用前明确失败或降级，不能静默让模型忽略。
```

### 8.4 ModelToolCall 映射

Adapter 应将 Ollama assistant 的 tool calls 归一为：

```ts
interface ModelToolCall {
  id?: string;
  name: string;
  arguments: unknown;
}
```

约束：

```txt
- name 必须是工具注册名。
- arguments 必须保持结构化对象；不得在 Adapter 中 stringify 后交给 Workflow。
- 若 Ollama SDK 返回的 arguments 是 JSON 字符串，Adapter 必须在单一 mapper 中安全 parse。
- parse 失败必须以明确错误或 invalid-plan 路径处理；不得把无效 arguments 当作 {}。
- id 若 SDK 未提供，可保持 undefined；不得自行伪造会与真实 SDK id 混淆的标识。
- 多个 tool calls 的原始顺序必须保留。
```

### 8.5 能力声明优先于 SDK 理论支持

即使 Ollama SDK 支持传 `tools`，也不得得出：

```txt
所有 Ollama 模型都支持 tool calling
```

正确规则：

```txt
SDK 能传 tools
≠
具体模型可靠支持 tools

具体 ModelProfile.toolCalling === true
→ 本次模型候选才允许参与工具规划。
```

---

## 九、能力筛选、重试与 Fallback

### 9.1 候选顺序

Ollama Adapter 的候选集合固定为：

```txt
1. primaryProfile
2. fallbackProfile（可选；同一 Ollama host）
```

每次调用必须根据：

```ts
input.requiredCapabilities
```

先筛选候选，再发起网络请求。

推荐纯函数：

```ts
function selectEligibleCandidates(
  candidates: readonly OllamaModelCandidate[],
  required: RequiredModelCapabilities | undefined,
): CandidateSelectionResult;
```

### 9.2 能力筛选语义

```txt
requiredCapabilities 未传
→ primary 可尝试；失败后可 retry / fallback。

requiredCapabilities.streaming = true
→ 只有 streaming=true 的候选可参与 stream 调用。

requiredCapabilities.toolCalling = true
→ 只有 toolCalling=true 的候选可参与工具规划调用。

requiredCapabilities.usage = true
→ 只有 usage=true 的候选可参与调用。

所有候选均不满足
→ 不发起 Ollama 请求。
→ runtime 记录 capabilitySkips。
→ 抛出 Stage 3 定义的能力不可用错误。
```

禁止：

```txt
- 因为“可能可以试一下”而向不支持工具的 fallback 传 tools；
- 因为“可以先完整返回”而在 stream 调用中回退 generate() 后伪造流；
- 因为 usage 不存在就阻断正常聊天（除非调用者显式 required usage）；
- 以 provider 名称而不是 profile capabilities 选择流程。
```

### 9.3 generate() 重试与 fallback

`generate()` 应遵循：

```txt
筛选可用候选
↓
primary：最多 maxRetries + 1 次尝试
↓
primary 最终失败
↓
fallback：最多 maxRetries + 1 次尝试（如存在且符合能力）
↓
成功：返回 GenerateOutput + ModelRuntimeInfo
失败：抛出最终模型错误，包含安全错误摘要
```

runtime 至少包含：

```txt
usedModel
usedProfile
fallbackUsed
primaryAttempts
fallbackAttempts
errors
capabilitySkips
```

错误记录要求：

```txt
- 不记录 API key、Authorization、完整 prompt、完整 message 内容；
- 可记录 model、attempt、phase、错误名称或安全截断 message；
- host 不应作为对外错误中必须显示的字段；Debug 宿主如需展示，应自行做安全处理。
```

### 9.4 stream() 的 retry / fallback 边界

`stream()` 必须严格区分“首个可见文本前”和“首个可见文本后”。

```txt
阶段 A：尚未发送第一个非空 text chunk
→ 可重试 primary。
→ 可切换到满足能力的 fallback。
→ 不向 Workflow 发送任何可见 text:delta。

阶段 B：已产出至少一个非空 text chunk
→ 不得 retry。
→ 不得切换 fallback。
→ 不得重启一条新流并拼接。
→ 原始异常向上抛出。
→ Stage 5 Workflow 负责发送 workflow:error，并保持 partial failure 语义。
```

这里的“可见文本”定义为：

```txt
chunk.text.length > 0
```

空字符串 finish chunk 不意味着已经可见输出。

### 9.5 stream() 伪代码语义

```ts
async *stream(input: GenerateInput): AsyncIterable<GenerateStreamChunk> {
  const selection = selectEligibleCandidates(...);
  let visibleTextStarted = false;

  for (const candidate of selection.eligibleCandidates) {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const response = await client.chat({
          model: candidate.profile.model,
          stream: true,
          ...mapInput(input, candidate),
        });

        for await (const part of response) {
          const chunk = mapStreamPart(part, runtimeContext);
          if (chunk.text.length > 0) {
            visibleTextStarted = true;
          }
          yield chunk;
        }

        return;
      } catch (error) {
        if (visibleTextStarted) {
          throw error;
        }
        // 仅此处可 retry / fallback
      }
    }
  }

  throw finalError;
}
```

这是语义示意，不要求逐字照抄。实现必须避免：

```txt
- 已经 yield 文本后 catch 并再 yield fallback 文本；
- 失败后重复发送已输出内容；
- 在 stream 结束后漏掉 runtime / usage finish chunk；
- 成功自然结束但没有记录实际 usedProfile。
```

---

## 十、generate() 实施规范

### 10.1 调用形式

```ts
const response = await client.chat({
  model: candidate.profile.model,
  messages: toOllamaMessages(input.messages),
  stream: false,
  ...mapOllamaRequestOptions(input, candidate),
});
```

### 10.2 输出映射

```ts
function toGenerateOutput(
  response: OllamaChatResponse,
  runtime: ModelRuntimeInfo,
): GenerateOutput {
  return {
    text: response.message.content ?? "",
    model: runtime.usedModel,
    raw: response,
    toolCalls: mapOllamaToolCalls(response.message.tool_calls),
    usage: mapOllamaUsage(response),
    runtime,
  };
}
```

约束：

```txt
- `GenerateOutput.model` 必须等于实际 usedProfile.model，不得固定返回 primary model。
- 完整结果没有 tool calls 时，不得返回空数组作为伪信号；沿用现有 Adapter 约定。
- usage 未知时可省略；不得伪造 0。
- raw 必须保留官方响应对象，仅供 Core Debug / Adapter 诊断；不得假定可通过 Wire Event 透传。
- 非流式 tool planning 的 runtime 与最终自然语言 generate 的 runtime 是两次独立调用；Workflow Debug Context 必须由既有流程区分，不得覆盖混淆。
```

---

## 十一、stream() 实施规范

### 11.1 调用形式

```ts
const response = await client.chat({
  model: candidate.profile.model,
  messages: toOllamaMessages(input.messages),
  stream: true,
  ...mapOllamaRequestOptions(input, candidate),
});

for await (const part of response) {
  yield mapOllamaStreamPart(part, runtimeContext);
}
```

### 11.2 chunk 映射

核心输出：

```ts
interface GenerateStreamChunk {
  text: string;
  model?: string;
  raw: unknown;
  usage?: GenerateUsage;
  runtime?: ModelRuntimeInfo;
}
```

映射规则：

```txt
普通文本 part
→ text = part.message.content 或等价字段。
→ raw = part。
→ 只有在需要时携带 model。

无文本的中间 part
→ 可 yield text = ""，仅当它包含对 Core 有价值的调试信息。
→ 不得由 Adapter 判断是否应成为 workflow text:delta；Stage 5 Workflow 已负责过滤空 delta。

最后 done part
→ 必须尽力携带最终 runtime。
→ 若响应包含 token / eval 计数，尽力映射 usage。
→ text 可以为空。
```

### 11.3 finish runtime 规则

Stage 5 的 Workflow 需要最终 runtime，故 Adapter 必须保证：

```txt
- 成功流至少有一个 chunk 可让 Workflow 获得最终 runtime；
- 若最后 part 带 done / usage / timing 信息，应由该 part 产出 runtime chunk；
- 若 SDK 的流式 part 无法提供最终统计，仍必须返回 usedProfile、fallbackUsed、attempts 与 errors；
- 已发送文本后出现错误时，不得伪造成功 runtime finish chunk。
```

### 11.4 tool calls 与 stream

V1.1 的 final stream 已明确：

```txt
Final Response → model.stream()
→ 不传 tools
→ 不做流中工具调用
```

因此 `stream()` 在 V1.1 中无需实现“流中 tool call 事件 → Workflow 再执行工具”的逻辑。

若 SDK stream part 意外携带 tool call：

```txt
- Adapter 可以保留在 raw 中供调试；
- 不得映射为新的 Workflow tool event；
- 不得在 Adapter 内自行执行工具；
- 应由实现选择明确报错或忽略并记录诊断，但必须在 Review 中说明实际选择与理由。
```

推荐：final stream 请求根本不传 tools，因此正常场景不应发生该情况。

---

## 十二、Usage、Runtime 与原始响应

### 12.1 Usage 映射

Ollama 响应可能提供与 prompt / completion 评估相关的计数。Adapter 可以进行尽力映射：

```txt
prompt 相关计数
→ GenerateUsage.promptTokens

completion / eval 相关计数
→ GenerateUsage.completionTokens

total
→ promptTokens + completionTokens（仅在两者均已知时）
```

规则：

```txt
- 不同 SDK 版本字段名必须以本地安装类型为准；
- 不得把 duration、token/s 等速度指标当成 token 数；
- 单项未知时不要伪造 totalTokens；
- capabilities.usage 默认 false 并不禁止尽力展示 usage；
- 只有 profile.capabilities.usage = true 的模型才可满足 requiredCapabilities.usage。
```

### 12.2 Runtime 归一化

无论 generate / stream，都必须构造：

```ts
ModelRuntimeInfo {
  usedModel,
  usedProfile,
  fallbackUsed,
  primaryAttempts,
  fallbackAttempts,
  errors,
  capabilitySkips,
}
```

特别要求：

```txt
- primary 成功：fallbackUsed = false。
- fallback 成功：fallbackUsed = true，usedProfile = fallbackProfile。
- primary 因能力不满足被跳过：primaryAttempts = 0，capabilitySkips 包含 primary。
- primary 请求失败后 fallback 成功：errors 保留 primary 的安全错误摘要。
- 所有候选能力不满足：不伪造 usedProfile。
- 流式成功：最终 runtime 指向真正完成该流的候选。
```

### 12.3 raw 边界

```txt
raw
→ 仅为 Core 内部诊断保留。
→ 可能包含 SDK 私有对象、复杂嵌套字段或不可序列化值。
→ 不得进入 Stage 2 定义的 Wire Event。
→ Stage 7 需要展示时只能展示已做 JSON-safe 映射的摘要。
```

---

## 十三、错误语义

### 13.1 Adapter 可抛出的错误类别

建议使用清晰的错误分类，不要求所有错误都成为 `ai-core` 公共错误类型：

```txt
configuration_error
→ model 为空、fallback model 为空、非法 retry 配置等。

capability_unavailable
→ primary / fallback 都不满足 requiredCapabilities。

request_failed
→ Ollama 服务不可用、模型不存在、网络失败、SDK 请求失败。

message_mapping_failed
→ Core message / tool result 无法映射到当前 Ollama SDK 类型。

tool_mapping_failed
→ 工具定义或模型 tool call 无法安全映射。

stream_failed_after_output
→ 已产生可见文本后底层流异常。
```

### 13.2 与 Workflow 错误的边界

```txt
Adapter
→ 抛出模型层错误，附带安全诊断信息。

SimpleChatWorkflow / CompanionCore
→ 依据 Stage 2 / Stage 5 将错误转换为 SafeWorkflowError 与 workflow:error。

Adapter
✕ 不得直接产出 ChatWorkflowStreamEvent。
Adapter
✕ 不得直接决定 HTTP status、NDJSON 格式或 React UI 文案。
```

### 13.3 错误脱敏

禁止记录或抛出：

```txt
- headers.Authorization
- 完整请求 headers
- 模型请求全文 messages
- 本地 host 中可能存在的敏感 token query
- 原始 SDK error object 的无筛选 JSON
```

允许保留：

```txt
- provider（ollama）
- model
- phase（primary / fallback）
- attempt
- 错误名称
- 经过截断与脱敏的 message
```

---

## 十四、实施子任务

### 14.1 06-01：创建 workspace package

#### 目标

建立独立 `packages/model-ollama`，确认依赖与构建边界。

#### 要做什么

```txt
1. 新增 workspace package 配置。
2. package name 固定为 @ying-companion/model-ollama。
3. 添加 ollama runtime dependency。
4. 添加 @ying-companion/ai-core workspace dependency。
5. 对齐现有 packages 的 tsconfig、lint、build、exports 约定。
6. 新增最小 src/index.ts。
```

#### 完成标准

```txt
- pnpm workspace 能识别 package。
- package 可独立 typecheck / lint / build。
- ai-core package.json 未出现 ollama dependency。
- model-ollama 不依赖 apps/model-runtime-demo。
```

#### 可观测结果

```txt
pnpm --filter @ying-companion/model-ollama typecheck
pnpm --filter @ying-companion/model-ollama lint
pnpm --filter @ying-companion/model-ollama build
```

---

### 14.2 06-02：配置、Profile 与候选选择

#### 目标

实现 Ollama Adapter 的配置校验、primary / fallback profile 构建与 requiredCapabilities 筛选。

#### 要做什么

```txt
1. 定义 OllamaChatModelOptions。
2. 定义 fallback options。
3. 构建 provider = "ollama" 的 primaryProfile / fallbackProfile。
4. 默认 capability：streaming=true、toolCalling=false、usage=false。
5. 合并 profile override 的 capabilities。
6. 实现候选选择与 capabilitySkips 归集。
7. 复用 ai-core 的 modelProfileSatisfiesCapabilities()，不复制判断逻辑。
```

#### 完成标准

```txt
- toolCalling 未显式开启时，工具规划 required toolCalling 会拒绝候选。
- fallback 能力不满足时被 skip，而不是被请求。
- 所有候选不满足时，不发出网络请求。
- runtime capabilitySkips 可准确反映被跳过的 profile。
```

#### 人工验证场景

```txt
场景 A：默认 Profile
- primary model = local-a
- 不设 override
- 验证 streaming=true、toolCalling=false、usage=false。

场景 B：工具能力覆盖
- primaryProfileOverride.capabilities.toolCalling = true
- 验证该 profile 满足 required toolCalling。

场景 C：fallback 不兼容
- primary toolCalling=true
- fallback toolCalling=false
- required toolCalling=true
- primary 失败后，fallback 被记录为 capability skip，而不是被调用。

场景 D：全部不兼容
- primary / fallback streaming=false
- 调用 stream(required streaming=true)
- 验证无 Ollama 请求且明确抛 capability unavailable。
```

---

### 14.3 06-03：消息、参数与工具映射

#### 目标

建立可审查、单点维护的 Core ↔ Ollama mapper。

#### 要做什么

```txt
1. 实现 ChatMessage → Ollama message mapper。
2. 实现 GenerateInput → Ollama chat options mapper。
3. 实现 Core tool definition → Ollama tools mapper。
4. 实现 Ollama tool_calls → ModelToolCall[] mapper。
5. 实现 Ollama usage → GenerateUsage mapper。
6. 为 unsupported message / tool shape 提供明确错误。
```

#### 完成标准

```txt
- system / user / assistant / tool 的映射逻辑集中在独立文件。
- tool 定义不被 stringify 成 prompt 文本。
- tool arguments 保持结构化值。
- temperature / maxTokens 只在 SDK 当前版本支持时映射。
- keepAlive 正确映射为 keep_alive。
- 不在 ollama-chat-model.ts 内散落字段适配。
```

#### 可观测结果

最小本地脚本输出：

```txt
[Ollama Mapper] input roles: system,user,assistant,tool
[Ollama Mapper] mapped roles: ...
[Ollama Mapper] tool definitions: <count>
[Ollama Mapper] mapped tool calls: <count>
[Ollama Mapper] usage: <safe summary>
```

> 该输出不可包含完整聊天内容或敏感配置。

---

### 14.4 06-04：实现 generate()

#### 目标

完成非流式 ChatModel 调用，以支持现有 `executeWorkflow()`、内部结构化任务与 ToolPlanningProvider。

#### 要做什么

```txt
1. 按 capability 筛选候选。
2. 调用 Ollama chat(stream=false)。
3. 映射 text / toolCalls / usage / raw / runtime。
4. 处理 primary retry。
5. 处理 fallback retry。
6. 记录安全错误摘要与 capability skips。
```

#### 完成标准

```txt
- executeWorkflow() 可通过 OllamaChatModel 获得完整回复。
- ToolPlanningProvider 使用支持 toolCalling 的具体模型时能获得 ModelToolCall[]。
- toolCalling=false 时，规划调用按既有 no_tool 降级规则处理。
- primary 失败后可改用符合能力的 fallback。
- 最终 output.model 与 runtime.usedModel 都是实际成功模型。
```

#### 人工验证场景

```txt
场景 A：单模型 generate
- 本地 Ollama 服务已启动。
- 使用已安装模型。
- 调用 model.generate()。
- 验证返回非空 text、usedProfile、raw 与 runtime。

场景 B：primary 不存在 / 失败，fallback 可用
- primary 设置为不可用模型或制造可控失败。
- fallback 设置为已安装模型。
- 验证 fallbackUsed=true，errors 中保留 primary 摘要。

场景 C：工具规划能力关闭
- toolCalling=false。
- 以 required toolCalling 调用。
- 验证不实际请求模型，并走能力不可用处理。
```

---

### 14.5 06-05：实现 stream()

#### 目标

将 Ollama SDK 的 AsyncGenerator 映射为 Core `GenerateStreamChunk`，遵守 Stage 5 的流失败语义。

#### 要做什么

```txt
1. 按 required streaming 筛选候选。
2. 调用 Ollama chat(stream=true)。
3. 逐 part 映射为 GenerateStreamChunk。
4. 首个可见文本前允许 retry / fallback。
5. 首个可见文本后异常直接上抛。
6. 在 finish chunk 尽力附加 runtime / usage。
7. 不传 tools 的 final stream 不实现工具循环。
```

#### 完成标准

```txt
- `for await (const chunk of model.stream(...))` 可持续获得文本增量。
- 所有非空文本按顺序拼接等于完整模型回复。
- 首个非空文本前失败可 retry / fallback。
- 首个非空文本后失败不切模型、不重放前文。
- 流成功结束时 Workflow 可获得最终 runtime。
- stream(required streaming=true) 不允许降级为 generate()。
```

#### 人工验证场景

```txt
场景 A：正常流式
- 本地 Ollama 服务与模型正常。
- 逐 chunk 输出 text。
- 验证文本逐步出现、最终 runtime 可用。

场景 B：首 token 前失败
- 使用不可用 primary + 可用 fallback。
- 验证未输出文本前完成 fallback。
- 验证最终流来自 fallback profile。

场景 C：已输出后失败
- 通过可控 mock client 或测试替身制造中途异常。
- 验证 Adapter 抛错。
- 验证没有开始新的 fallback 流。
- Stage 5 Workflow 验证中应最终表现为 workflow:error，而不是 workflow:finish。
```

> 不要求引入完整单元测试体系；但中途流失败若无法通过真实 Ollama 稳定复现，可使用 package 内部最小手工 fake client / 验证脚本。该替身不得进入 ai-core 公共 API。

---

### 14.6 06-06：最小集成验证与 Review

#### 目标

证明 Ollama Adapter 可以被纯 Core 消费，而不是只证明 SDK 请求能成功。

#### 要做什么

```txt
1. 构造 OllamaChatModel。
2. 注入 createCompanionCore({ model, ... })。
3. 验证 executeWorkflow()。
4. 验证 streamWorkflow()。
5. 验证 Persona / Memory / Emotion 不因更换 ChatModel 失效。
6. 验证 Tool Plan 的能力降级。
7. 写入 Stage 6 Review 归档。
```

#### 完成标准

```txt
- Core API 与 OpenAI-compatible 路径一致。
- Persona Prompt 仍被注入。
- streamWorkflow() 可产生 text:delta 与 workflow:finish。
- 没有 toolCalling 能力时，工具规划显式 no_tool / degradation，不阻断普通聊天。
- EmbeddingProvider 仍使用既有实现，未被 Ollama Adapter 替换。
- 结果可通过 console / 最小脚本复现，不依赖 Stage 7 UI。
```

---

## 十五、与 Demo Provider Strategy 的衔接

Stage 3 已在 Demo 宿主建立：

```ts
interface ModelAdapterStrategy<TConfig extends ModelProviderConfig> {
  readonly provider: TConfig["provider"];
  create(config: TConfig, options?: ModelFactoryOptions): ChatModel;
}
```

Stage 6 **不应**让 `packages/model-ollama` 依赖这个 Demo 私有类型。

正确衔接方式：

```txt
Stage 6
→ model-ollama 导出 createOllamaChatModel(options)。

Stage 7
→ apps/model-runtime-demo 自己实现：
  createOllamaModelStrategy(): ModelAdapterStrategy<OllamaModelConfig>
→ strategy 内调用 createOllamaChatModel(config)。
→ register 到 ModelAdapterRegistry。
```

禁止：

```txt
- model-ollama import apps/model-runtime-demo/app/lib/model-factory。
- model-ollama 直接 register 全局 Demo registry。
- ai-core import model-ollama。
- 在 Stage 6 修改 Demo UI 以展示 Provider 下拉。
```

Stage 7 预期模型配置形态：

```ts
interface OllamaModelConfig extends ModelProviderConfig, OllamaChatModelOptions {
  provider: "ollama";
}
```

但该 Demo 配置类型属于 Stage 7；Stage 6 只需保证其底层 options 足够表达：

```txt
model / host / keepAlive / retries / fallback / profile override
```

---

## 十六、Embedding 与聊天模型的独立性

V1.1 明确：

```txt
ChatModel Provider
→ OpenAI-compatible 或 Ollama。
→ 决定聊天、工具规划、最终回复流。

EmbeddingProvider
→ 保持现有宿主注入实现。
→ 决定 Memory / RAG 向量化与召回。
```

Stage 6 禁止：

```txt
- 新增 OllamaEmbeddingProvider。
- 修改 memory-postgres。
- 修改 memories embedding schema。
- 因聊天改为 Ollama 而强制所有 RAG 改走本地 embedding。
- 在 OllamaChatModel 中偷偷调用 embed()。
```

人工验证必须明确看到：

```txt
OllamaChatModel
↓
聊天与最终回答由 Ollama 完成

Existing EmbeddingProvider
↓
记忆召回 / 写回向量化仍正常工作
```

---

## 十七、人工验收清单

### 17.1 Package 边界

```txt
[ ] packages/model-ollama 存在且可独立 build。
[ ] packages/ai-core 不依赖 ollama。
[ ] model-ollama 不依赖 Demo / Next.js / React / 数据库。
[ ] Adapter 不读取环境变量。
```

### 17.2 Profile 与能力

```txt
[ ] primaryProfile.provider === "ollama"。
[ ] primaryProfile.model 是实际配置模型名。
[ ] fallbackProfile（如有）是实际 fallback 模型名。
[ ] 默认 toolCalling=false。
[ ] 宿主 override 可为具体模型开启 toolCalling。
[ ] requiredCapabilities 不满足时有 capabilitySkips。
[ ] 不能满足时不发起请求。
```

### 17.3 generate

```txt
[ ] 正常 generate 返回 text。
[ ] output.model 与 runtime.usedModel 一致。
[ ] raw 保留在 Core 内部结果中。
[ ] usage 存在时尽力映射；未知时不伪造。
[ ] primary 失败可 fallback。
[ ] fallback 不满足能力时被跳过。
```

### 17.4 stream

```txt
[ ] stream 产生递增文本 chunk。
[ ] 空文本 finish chunk 不被当作可见 token。
[ ] 最终 runtime 可被 Workflow 收集。
[ ] 首 token 前失败可 retry / fallback。
[ ] 首 token 后失败不 fallback，不重放。
[ ] stream 不支持时不回退 generate 伪造流。
```

### 17.5 工具边界

```txt
[ ] toolCalling=false 时，不向 Ollama 发送 tools。
[ ] toolCalling=true 时，工具规划调用可映射 tools。
[ ] tool calls 保持 name / arguments 结构。
[ ] final stream 不传 tools。
[ ] Adapter 不执行工具。
```

### 17.6 Core 集成

```txt
[ ] createCompanionCore({ model: OllamaChatModel }) 可运行。
[ ] executeWorkflow() 可完成。
[ ] streamWorkflow() 可发 text:delta。
[ ] Persona、Memory、Emotion 仍正常。
[ ] 无工具能力时普通聊天仍成功。
[ ] EmbeddingProvider 未被替换。
```

---

## 十八、Review 归档要求

Stage 6 完成后，在：

```txt
.code-reviews/v1.1/
```

创建符合既有命名约定的目录，并至少记录：

```txt
1. 实际改动范围
2. 新 package 的依赖图
3. 使用的 ollama SDK 版本
4. 本地 Ollama 验证环境（不得记录敏感信息）
5. 实际验证模型名称
6. generate 验证结果
7. stream 验证结果
8. capability skip 验证结果
9. fallback 验证结果或无法复现的原因
10. 已输出文本后失败的验证方式
11. 已发现问题与修复记录
12. 各 acceptance criteria 的结论
```

Review 不得只写：

```txt
“能跑”
```

必须能够回答：

```txt
- 最终使用的是哪个具体模型 profile？
- 该模型为什么可参与 / 不可参与本次调用？
- fallback 是否真的发生过？
- stream 失败后是否错误地重放或切模型？
- 工具能力为何开启或关闭？
- ai-core 是否保持不依赖 Ollama？
```

---

## 十九、完成定义

Stage 6 的完成标志不是“本机能调用 Ollama”。

真正完成必须是：

```txt
一个独立、无环境变量读取、无 Demo 依赖的 OllamaChatModel
↓
以 ChatModel 契约注入 ai-core
↓
遵守具体模型能力、retry、fallback、runtime 与流失败边界
↓
可以让既有 executeWorkflow() 与 streamWorkflow() 无需感知 provider 变化而运行
```

最终架构应为：

```txt
宿主 / Debug Workbench（Stage 7）
  ↓
ModelAdapterRegistry
  ├── OpenAI-compatible Strategy
  └── Ollama Strategy
        ↓
        createOllamaChatModel()
        ↓
        packages/model-ollama
        ↓
        ChatModel 抽象
        ↓
        packages/ai-core
        ↓
        CompanionCore / SimpleChatWorkflow
```

> Stage 6 解决的是“本地模型如何成为一个合格、可观测、可降级的 ChatModel Adapter”；不解决“用户如何在 UI 中选择它”。后者属于 Stage 7。
