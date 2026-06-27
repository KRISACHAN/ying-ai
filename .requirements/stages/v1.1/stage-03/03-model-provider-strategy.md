# AI Companion Core V1.1 - 阶段 3：模型 Provider 策略、能力档案与工具规划实施文档

## 一、阶段目标

在不破坏 V1.0 `ChatModel`、主模型重试、fallback、runtime 信息与现有宿主配置的前提下，为 V1.1 建立稳定的模型 Provider 策略。

本阶段要解决三个问题：

1. Core 与 Workflow 不得根据 Adapter 名称（例如 `ollama`）分支，而必须根据本次模型调用实际可用的能力分支；
2. 主模型与 fallback 模型能力不同时，必须有明确、可观测、可预期的降级行为；
3. 工具调用决策必须与最终用户回复生成分离，避免先生成一段自然语言回复、丢弃后再流式生成第二段不同回复。

本阶段交付的是：

```txt
模型能力档案
+ 能力约束驱动的模型调用契约
+ 宿主侧 Provider 策略与工厂边界
+ 工具规划 Provider 契约与默认实现
+ 可观测的降级、fallback 与规划结果
```

本阶段不实现工作流级流式输出、不实现 Ollama Adapter、不改造正式 Demo 聊天网络协议。流式工作流由阶段 5 实现，Ollama Adapter 由阶段 6 实现。

---

## 二、前置基线

### 2.1 已完成阶段

阶段 1 已完成 Persona Profile 扩展。当前 `CompanionPersona`、Prompt Builder、Demo Persona 配置与调试预览已具备 V1.1 所需的 Persona 数据基础。

阶段 2 负责冻结 V1.1 的 Core Event、Wire Event、`executeWorkflow()` / `streamWorkflow()` 双路 API 与 NDJSON 边界。本阶段定义的模型和工具规划契约必须与阶段 2 一致，但不重复定义网络传输协议。

### 2.2 V1.0 模型层现状

V1.0 `ChatModel` 已提供：

```ts
interface ChatModel extends CoreProvider {
  generate(input: GenerateInput): Promise<GenerateOutput>;
  stream(input: GenerateInput): AsyncIterable<GenerateStreamChunk>;
}
```

V1.0 已支持：

```txt
OpenAI-compatible Adapter
├── generate()
├── stream()
├── 主模型 retry
├── fallback 模型
└── ModelRuntimeInfo
```

但 V1.0 尚未解决：

```txt
- 模型能力只隐含在 Adapter 实现中，Workflow 无法可靠判断；
- fallback 接管后，Workflow 不知道当前实际模型是否仍支持工具调用或流式输出；
- 工具调用复用最终回答生成结果，无法与未来流式最终回复清晰分离；
- 宿主模型配置与未来 Ollama / 新 Provider 的策略边界未冻结。
```

---

## 三、阶段完成标准

完成本阶段后，必须满足：

- `ChatModel` 或其等价调用边界可暴露主模型、fallback 模型的具体能力档案；
- 每次模型调用可声明所需能力，Adapter 必须仅在满足该能力的模型候选中重试或 fallback；
- 模型调用结果可明确说明最终使用的具体模型档案、是否发生 fallback、是否因为能力不满足而跳过候选；
- Workflow 不得以 `provider === "ollama"`、`model.meta.id` 等 Adapter 名称判断能力；
- `streaming`、`toolCalling`、`usage` 等能力均以具体模型档案为准，而不是以 Provider 固定布尔值为准；
- 当主模型失败且 fallback 不满足当前调用所需能力时，不得静默使用不兼容模型；
- 工具规划必须独立于最终用户回复生成；
- 工具规划结果只能是 `no_tool` 或 `tool_calls`，不得向用户暴露自然语言规划文本；
- 没有工具、没有工具规划 Provider、或有效模型不满足工具规划能力时，系统必须可明确降级为 `no_tool`；
- `ai-core` 仍不读取环境变量、不依赖 Ollama SDK、不依赖 Demo、不依赖数据库；
- 本阶段不改变 V1.0 `executeWorkflow()` 的对外行为；
- 相关 package 的 typecheck、lint、build 通过；
- 至少完成本文定义的人工验收场景，并将结果写入 `.code-reviews/v1.1/` 对应 Review 文档。

---

## 四、职责与目录边界

建议涉及以下职责。实际文件名可沿用当前仓库结构，但边界不得改变。

```txt
packages/ai-core/
  src/
    abstractions/
      model.ts                         # ChatModel、ModelProfile、调用能力约束
      tool-planning.ts                 # ToolPlanningProvider、ToolPlan
      errors.ts                         # 能力不满足等可识别错误
    implementations/
      tool-planning/
        default-tool-planning-provider.ts
    factories/
      default-core-factory.ts           # 注入默认 ToolPlanningProvider（如当前结构适合）
    index.ts                            # 导出稳定公共类型

apps/model-runtime-demo/
  app/ 或 lib/
    model-config.ts                     # 宿主侧模型配置类型
    model-factory.ts                    # 宿主侧 Provider strategy registry / createModel
    companion-runtime.ts                # 装配 ChatModel、ToolPlanningProvider 与 Core
    debug-types.ts                      # 模型 profile / runtime 的展示类型（如需要）

packages/model-ollama/
  （阶段 6 才创建；本阶段不得提前加入 ollama 依赖）
```

职责约束：

```txt
ai-core
→ 定义模型能力、调用约束、工具规划契约与默认规划逻辑。
→ 只依赖抽象 ChatModel，不知道 OpenAI、Ollama、环境变量或 UI。

具体模型 Adapter
→ 把第三方 SDK 调用映射为 ChatModel。
→ 负责按“本次调用所需能力”筛选主模型 / fallback 候选。
→ 负责产出统一 runtime 信息。

宿主 / Demo
→ 读取环境变量与表单配置。
→ 用 Provider strategy registry 创建具体 Adapter。
→ 决定哪些 Adapter 被安装和可选择。
→ 展示 profile、runtime、fallback 与能力降级信息。
```

> 禁止为了“结构对称”而在本阶段强行搬迁现有 OpenAI-compatible Adapter。只要它实现新的稳定契约即可。Ollama 的独立 package 在阶段 6 再引入。

---

## 五、模型能力档案

### 5.1 为什么能力必须落到具体模型

以下判断均不可靠：

```ts
if (model.meta.id === "model.ollama") {
  // 某类逻辑
}
```

```ts
if (provider === "openai-compatible") {
  // 一定支持 tools / stream
}
```

原因：

```txt
同一个 Provider
├── 不同模型能力不同
├── 不同 baseUrl 后端能力不同
└── 不同 fallback 模型能力不同

同一个 Ollama Adapter
├── 模型 A 可能支持 tools
└── 模型 B 可能不支持 tools
```

因此，Workflow 只能依赖“本次候选模型档案”的能力声明。

### 5.2 推荐类型

```ts
export interface ModelCapabilities {
  /** 是否能输出可消费的连续文本增量。 */
  streaming: boolean;

  /** 是否支持 V1.1 工具规划所需的工具调用能力。 */
  toolCalling: boolean;

  /** 是否能稳定返回 token usage。未知或不稳定时为 false。 */
  usage: boolean;
}

export interface ModelProfile {
  /** Provider 标识，仅用于 runtime / UI 展示，不得作为 Workflow 分支条件。 */
  provider: string;

  /** 具体模型标识，例如 gpt-5、qwen3:8b。 */
  model: string;

  /** 当前具体模型的能力声明。 */
  capabilities: ModelCapabilities;
}
```

`provider` 与 `model` 共同标识一个具体候选档案。禁止只用 `model` 字符串推断能力。

### 5.3 生成调用所需能力

V1.0 的 `GenerateInput` 应增量扩展为可声明调用要求的内部契约：

```ts
export interface RequiredModelCapabilities {
  streaming?: true;
  toolCalling?: true;
  usage?: true;
}

export interface GenerateInput {
  messages: ChatMessage[];
  tools?: Record<string, unknown>;
  model?: string;
  temperature?: number;
  maxTokens?: number;

  /**
   * 本次调用必须满足的能力。
   * 未声明时，保持 V1.0 兼容，不额外收紧候选模型。
   */
  requiredCapabilities?: RequiredModelCapabilities;
}
```

约束：

```txt
- `stream()` 调用必须等价要求 `streaming: true`；
- 工具规划调用必须要求 `toolCalling: true`；
- 不能因为调用方忘记检查能力，就把不支持能力的 fallback 静默投入调用；
- `usage: true` 不是正常聊天的强制要求；usage 缺失应作为可观测能力差异，而不是聊天失败原因；
- `model` 覆盖只选择指定模型，不得绕过 requiredCapabilities 校验。
```

### 5.4 ChatModel 公开能力边界

推荐将 `ChatModel` 扩展为：

```ts
export interface ChatModel extends CoreProvider {
  readonly primaryProfile: ModelProfile;
  readonly fallbackProfile?: ModelProfile;

  generate(input: GenerateInput): Promise<GenerateOutput>;
  stream(input: GenerateInput): AsyncIterable<GenerateStreamChunk>;
}
```

兼容约束：

```txt
- 旧调用只使用 generate / stream 时仍可工作；
- 新增 profile 字段不得要求旧宿主自己拼装模型；
- 现有 OpenAI-compatible Adapter 必须提供 primaryProfile；
- 未配置 fallback 时 fallbackProfile 为 undefined；
- 未来多个 fallback 不是本阶段目标；V1.1 只保留单 fallback 概念。
```

### 5.5 runtime 必须反映本次实际使用模型

`ModelRuntimeInfo` 应增量扩展，至少可让上层判断：

```ts
export interface ModelCapabilitySkipItem {
  profile: ModelProfile;
  requiredCapabilities: RequiredModelCapabilities;
  reason: "capability_unavailable";
}

export interface ModelRuntimeInfo {
  usedModel: string;
  fallbackUsed: boolean;
  primaryAttempts: number;
  fallbackAttempts: number;
  errors: ModelRuntimeErrorItem[];

  /** 本次真正完成调用的模型档案。 */
  usedProfile?: ModelProfile;

  /** 因不满足 requiredCapabilities 而未被调用的候选。 */
  capabilitySkips?: ModelCapabilitySkipItem[];
}
```

约束：

```txt
- `usedProfile` 必须与最终实际发送请求的模型一致；
- 主模型失败、fallback 成功时 usedProfile 必须是 fallbackProfile；
- 不满足能力而被跳过，不得伪装成网络错误或模型错误；
- runtime 仅记录安全摘要，不记录 API Key、完整 prompt 或敏感原始响应。
```

---

## 六、主模型与 fallback 的能力策略

### 6.1 候选筛选顺序

一次调用的候选顺序固定为：

```txt
primaryProfile
↓
满足 requiredCapabilities ?
├── 否：记录 capability skip，不发请求
└── 是：按既有 retry 策略请求
      ↓
      成功：结束
      ↓
      可降级失败：检查 fallbackProfile
          ↓
          满足 requiredCapabilities ?
          ├── 否：记录 capability skip，结束为能力不可用
          └── 是：按 fallback retry 策略请求
```

### 6.2 必须区分三类结果

```txt
A. 模型调用成功
→ 返回 GenerateOutput / GenerateStreamChunk。

B. 模型调用失败
→ 候选满足能力，但网络、限流、超时、供应商错误或模型错误导致失败。
→ 沿用 V1.0 retry / fallback 策略。

C. 能力不可用
→ 候选模型不满足本次 requiredCapabilities，因此根本不应发请求。
→ 记录 capabilitySkips。
→ 由调用方按上下文决定降级或报错。
```

不得把 C 伪装为 B。

### 6.3 V1.1 工作流规则

后续阶段 Workflow 必须遵循：

```txt
最终回复流式阶段
→ 调用 model.stream({ requiredCapabilities: { streaming: true } })。
→ 所有候选都不支持 streaming 时，在首个 text:delta 前失败。
→ 发送 workflow:error，不得伪造“流式成功”。

工具规划阶段
→ 调用 ToolPlanningProvider.plan()。
→ 默认 Provider 内部调用模型时要求 toolCalling: true。
→ 所有候选不支持 toolCalling 时，返回明确的 no_tool degraded plan。
→ trace / event 标记 tool_calling_unavailable。

普通内部结构化任务
→ 不因为使用 generate() 就要求 streaming。
→ 是否需要模型，由各 Provider 自己决定。
```

### 6.4 严格模式

V1.1 默认采用：

```txt
运行时明确降级
+ runtime / trace 可观测
+ Demo 给出提示
```

宿主可选严格校验：

```ts
interface ModelFactoryOptions {
  strictCapabilityCompatibility?: boolean;
}
```

严格模式含义：

```txt
- primary / fallback 对同一已声明必需能力不兼容时，factory 拒绝创建模型；
- 适合希望“聊天一定可流式 + 工具一定可规划”的宿主；
- 默认 false，避免 V1.1 因本地模型能力差异完全无法启动。
```

严格模式不是智能路由，不自动挑选最优模型。

---

## 七、宿主侧 Provider 策略与模型配置

### 7.1 策略模式边界

`ai-core` 只定义 `ChatModel`，不得定义：

```txt
OPENAI_API_KEY
OLLAMA_HOST
provider === "ollama"
new Ollama(...)
```

模型配置与第三方 Adapter 装配属于宿主或具体模型 package。

推荐在 Demo 侧引入策略注册表：

```ts
export interface ModelProviderConfig {
  provider: string;
  model: string;
}

export interface ModelAdapterStrategy<
  TConfig extends ModelProviderConfig = ModelProviderConfig,
> {
  readonly provider: TConfig["provider"];
  create(config: TConfig): ChatModel;
}

export interface ModelAdapterRegistry {
  register<TConfig extends ModelProviderConfig>(
    strategy: ModelAdapterStrategy<TConfig>,
  ): void;

  create(config: ModelProviderConfig): ChatModel;
}
```

### 7.2 V1.1 阶段 3 可交付的配置

本阶段先落实 OpenAI-compatible 配置与公共能力配置：

```ts
export interface OpenAICompatibleModelConfig extends ModelProviderConfig {
  provider: "openai-compatible";
  apiKey: string;
  baseUrl?: string;
  model: string;

  primaryProfile?: Partial<ModelProfile>;
  fallbackModel?: string;
  fallbackProfile?: Partial<ModelProfile>;
  retry?: ModelRetryConfig;
}
```

`primaryProfile` / `fallbackProfile` 的补全规则：

```txt
- provider 和 model 必须由配置本身推导，宿主不得覆盖成不一致值；
- capabilities 必须显式给出，或由该 Adapter 的默认能力补齐；
- Demo 必须将“默认推导值”和“用户覆盖值”可观测展示；
- 未知能力默认保守处理：streaming=false、toolCalling=false、usage=false；
- 不得因为 OpenAI-compatible 名称而默认 toolCalling=true。
```

### 7.3 Ollama 的预留方式

阶段 3 不安装 `ollama` 包，也不创建 `packages/model-ollama`。

为阶段 6 预留的形式是：

```ts
// 阶段 6 由 packages/model-ollama 导出
export interface OllamaModelConfig extends ModelProviderConfig {
  provider: "ollama";
  host?: string;
  model: string;
  keepAlive?: string;
  primaryProfile?: Partial<ModelProfile>;
}
```

阶段 6 再由宿主注册：

```ts
registry.register(createOllamaModelStrategy());
```

约束：

```txt
- 阶段 3 的 Demo 不得显示一个“可选但无法运行”的 Ollama Provider；
- 阶段 6 完成后，Ollama Adapter 通过注册加入，不修改 ai-core Workflow；
- 具体 Ollama 模型的能力必须由配置或可验证探测结果声明；禁止写死“所有 Ollama 都不支持 tools”。
```

### 7.4 createModel 的调用形态

```ts
const model = registry.create({
  provider: "openai-compatible",
  apiKey: process.env.OPENAI_API_KEY!,
  baseUrl: process.env.OPENAI_BASE_URL,
  model: process.env.OPENAI_MODEL!,
  primaryProfile: {
    capabilities: {
      streaming: true,
      toolCalling: true,
      usage: true,
    },
  },
});
```

V1.1 约束：

```txt
- 环境变量只在 Demo / 宿主读取；
- ChatModel 创建完成后，ai-core 不再感知环境变量；
- 不在 ai-core 内写模型 provider switch；
- 新增模型 Adapter 的操作是“实现 strategy 并注册”，不是修改 Workflow。
```

---

## 八、工具规划协议

### 8.1 目标

工具规划的职责不是回答用户，而是判断当前这条消息是否需要调用可用工具，并给出安全、结构化、可执行的工具调用计划。

它必须与“最终自然语言回复”分离。

### 8.2 抽象契约

建议新增：

```ts
export interface ToolPlanningInput {
  messages: ChatMessage[];
  tools: Record<string, unknown>;
  model?: string;
}

export type ToolPlanningDegradationReason =
  | "no_tools"
  | "tool_calling_unavailable"
  | "planner_unavailable"
  | "invalid_plan";

export type ToolPlan =
  | {
      type: "no_tool";
      reason?: ToolPlanningDegradationReason;
      runtime?: ModelRuntimeInfo;
    }
  | {
      type: "tool_calls";
      calls: ModelToolCall[];
      runtime?: ModelRuntimeInfo;
    };

export interface ToolPlanningProvider extends CoreProvider {
  plan(input: ToolPlanningInput): Promise<ToolPlan>;
}
```

### 8.3 默认 ToolPlanningProvider 行为

默认实现可以依赖 `ChatModel.generate()`，但必须遵循：

```txt
输入
→ 只包含进行工具规划所需的 system 指令、当前聊天上下文与可用工具定义。

调用
→ generate({ tools, requiredCapabilities: { toolCalling: true } })。

输出
→ 有 toolCalls：返回 tool_calls。
→ 没有 toolCalls：返回 no_tool。
→ 绝不把 modelOutput.text 当作最终回复返回给用户。
```

工具规划 Prompt 必须明确：

```txt
- 你现在是工具规划器，不是聊天回复器；
- 只有确有必要时才调用工具；
- 不需要工具时不要回答用户，不要写解释；
- 工具调用参数必须符合工具定义；
- 伴侣最终自然语言回复由后续阶段单独生成。
```

### 8.4 降级与异常语义

```txt
没有工具
→ 不调用规划模型，直接 no_tool(reason=no_tools)。

没有 ToolPlanningProvider
→ 不调用模型，直接 no_tool(reason=planner_unavailable)。

模型候选都不支持 toolCalling
→ 不调用不兼容模型，直接 no_tool(reason=tool_calling_unavailable)。
→ runtime / trace 标记能力降级。

模型返回无 toolCalls
→ no_tool，不使用其 text。

模型返回非法或无法映射的 toolCalls
→ no_tool(reason=invalid_plan)，记录安全摘要。

工具规划模型调用发生可恢复错误
→ 先沿用模型自身 retry / fallback。
→ 最终失败时，V1.1 默认降级为 no_tool(reason=planner_unavailable)。
→ 不让工具规划失败阻断基础聊天回复。
```

> 这里的降级只适用于“是否调用附加工具”的决策。它不适用于最终回复流式调用：最终回复要求 streaming 时，所有候选都不支持 streaming 应直接失败，而不是伪造流式输出。

### 8.5 禁止的实现

禁止：

```txt
1. 先调用 model.generate() 得到一段用户可见自然语言；
2. 从这段结果里顺便读取 toolCalls；
3. 为了 UI 流式效果丢弃自然语言；
4. 再调用 model.stream() 生成第二段不同回答。
```

禁止将 ToolPlanningProvider 写入数据库、Memory、Summary 或 Persona。

禁止让 Planner 直接执行工具。执行工具仍由阶段 4 / 5 的 Workflow 与 Tool Registry 负责。

---

## 九、与后续阶段的协作契约

### 9.1 阶段 4：步骤函数化重构

阶段 4 必须使用本阶段交付的：

```txt
ModelProfile
requiredCapabilities
ToolPlanningProvider
ToolPlan
```

但阶段 4 不得新增用户可见 `text:delta`。

建议步骤函数：

```ts
runToolPlanningStep(...): Promise<ToolPlan>;
```

其职责：

```txt
- 列出当前可用工具；
- 调用 ToolPlanningProvider；
- 记录 no_tool / tool_calls / degradation；
- 不生成最终用户自然语言回复；
- 不直接执行工具。
```

### 9.2 阶段 5：工作流级流式聊天

阶段 5 必须：

```txt
Tool planning
↓
Tool execution（如有 tool_calls）
↓
Final response
→ model.stream({ requiredCapabilities: { streaming: true } })
```

并遵守：

```txt
- 首个 text:delta 前，模型 Adapter 可 retry / fallback；
- fallback 必须满足 streaming 能力；
- 全部候选不满足 streaming 时，workflow:error；
- 已输出 text:delta 后失败，workflow:error 且不发送 workflow:finish；
- Workflow 通过 runtime.usedProfile / capabilitySkips 展示实际决策。
```

### 9.3 阶段 6：Ollama Adapter

阶段 6 只需：

```txt
实现 OllamaChatModel
+ 提供具体模型 ModelProfile
+ 实现 provider strategy
+ 在宿主注册 strategy
```

不应修改：

```txt
SimpleChatWorkflow 的 Provider 名称判断
ToolPlanningProvider 抽象
Core 的模型选择逻辑
```

这就是本阶段的非破坏性扩展保证。

---

## 十、实施顺序与子任务

### 10.1 03-01：冻结能力类型与调用约束

目标：在修改具体 Adapter 前，先冻结公共契约。

任务：

```txt
1. 在 model abstraction 增加 ModelCapabilities、ModelProfile；
2. 增加 RequiredModelCapabilities；
3. 扩展 GenerateInput.requiredCapabilities；
4. 扩展 ModelRuntimeInfo.usedProfile / capabilitySkips；
5. 定义可识别的 ModelCapabilityUnavailableError 或等价错误语义；
6. 更新 ai-core index 导出。
```

完成标准：

```txt
- 旧 generate / stream 调用不传 requiredCapabilities 仍可通过类型检查；
- 新调用可声明 streaming / toolCalling；
- 没有任何 Workflow 根据 provider 名称做能力判断；
- 所有新增 public 类型均可从 ai-core 稳定入口导入。
```

可观测结果：

```txt
打印 / 展示 OpenAI-compatible 主模型档案：
{
  provider: "openai-compatible",
  model: "...",
  capabilities: { streaming: true, toolCalling: true, usage: true }
}
```

### 10.2 03-02：升级现有 OpenAI-compatible Adapter 的候选筛选

目标：让 V1.0 retry / fallback 在 V1.1 能力约束下工作。

任务：

```txt
1. 由现有配置构建 primaryProfile 与 fallbackProfile；
2. 每次 generate / stream 前筛选满足 requiredCapabilities 的候选；
3. 对跳过候选写 capabilitySkips；
4. 候选满足能力时才执行既有 retry；
5. fallback 接管时将 usedProfile 正确写入 runtime；
6. 不满足能力时抛出可识别能力错误，供上层选择降级或失败。
```

完成标准：

```txt
- primary 支持 streaming、fallback 不支持 streaming：stream 调用不会向 fallback 发请求；
- primary 调用失败后，runtime 可显示 fallback 因能力不足被跳过；
- primary / fallback 都满足 requiredCapabilities 时，保留 V1.0 fallback 行为；
- 未声明 requiredCapabilities 的 V1.0 旧调用行为不改变。
```

可观测结果：

```txt
[Model Profile] primary=openai-compatible/gpt-x
[Model Profile] fallback=openai-compatible/smaller-model
[Capability Required] { streaming: true }
[Capability Skip] fallback: streaming unavailable
[Runtime] usedProfile=primary | fallback
```

### 10.3 03-03：实现宿主策略注册表与 OpenAI-compatible factory

目标：把模型选择从 Core 和 Demo 业务代码中抽离。

任务：

```txt
1. 定义 ModelProviderConfig 与 ModelAdapterStrategy；
2. 实现 registry.register / registry.create；
3. 将既有 OpenAI-compatible 创建逻辑包装成 strategy；
4. 将环境变量读取保留在 Demo / 宿主；
5. 输出最终 Effective Model Config（脱敏）。
```

完成标准：

```txt
- ai-core 不出现 process.env；
- ai-core 不出现 OpenAI / Ollama provider switch；
- Demo 通过 registry 创建模型；
- 未注册 provider 抛出清晰、可展示的配置错误；
- API Key 不写入日志、trace、debug context 或浏览器响应。
```

可观测结果：

```txt
[Model Factory] provider=openai-compatible
[Model Factory] strategy=OpenAICompatibleModelStrategy
[Model Factory] primaryProfile=...
[Model Factory] fallbackProfile=...
```

### 10.4 03-04：实现 ToolPlanningProvider 与默认规划器

目标：建立不污染最终回答的工具决策链路。

任务：

```txt
1. 定义 ToolPlanningProvider、ToolPlanningInput、ToolPlan；
2. 实现 DefaultToolPlanningProvider；
3. 规划调用必须要求 toolCalling: true；
4. 将 toolCalls 正规化并校验为 ModelToolCall[]；
5. 将 no_tool / capability unavailable / invalid plan 变为可观测结果；
6. 将默认 Provider 注入 Core composition，但暂不修改完整聊天执行顺序。
```

完成标准：

```txt
- 规划器有工具调用时只返回 tool_calls；
- 无工具调用时只返回 no_tool；
- modelOutput.text 不被返回给调用方，也不进入用户消息；
- 工具规划失败不阻断未来最终聊天回复；
- 规划器本身不执行工具。
```

可观测结果：

```txt
[Tool Plan] availableTools=get_current_time, search_memory
[Tool Plan] result=no_tool

或

[Tool Plan] result=tool_calls
[Tool Plan] calls=[{ name: "get_current_time", arguments: {} }]
```

### 10.5 03-05：文档与人工验收收口

任务：

```txt
1. 更新 packages/ai-core README 中的 ChatModel / ToolPlanningProvider 契约；
2. 更新 Demo README 的模型配置说明；
3. 在 docs 中补充 Provider Strategy、Model Profile、Capability Fallback 说明；
4. 更新 AGENTS.md 的 Current Package / Requirements 索引，使 V1.1 stage 入口可被 AI 发现；
5. 将人工验收结果和已知限制写入 .code-reviews/v1.1/ 对应 Review 文档。
```

---

## 十一、人工验收场景

本项目当前不要求单元测试与 E2E，但本阶段必须手工验证以下场景，并保存可读证据（Demo 截图、控制台输出或 Review 文档记录均可）。

### 11.1 基础兼容

```txt
前提：现有 OpenAI-compatible 模型配置，无 requiredCapabilities。
操作：执行现有 generate() 聊天调用。
期望：V1.0 行为保持可用，未发生额外 provider 分支错误。
```

### 11.2 流式能力兼容 fallback

```txt
前提：
- primaryProfile.streaming=true
- fallbackProfile.streaming=false
- 模拟 primary 在首个 delta 前失败

操作：调用 model.stream({ requiredCapabilities: { streaming: true } })。
期望：
- fallback 不发请求；
- runtime.capabilitySkips 包含 fallback；
- 返回可识别能力错误；
- 后续 Workflow 可据此发送 workflow:error。
```

### 11.3 流式能力兼容 fallback 成功

```txt
前提：
- primaryProfile.streaming=true
- fallbackProfile.streaming=true
- 模拟 primary 失败

操作：调用 model.stream({ requiredCapabilities: { streaming: true } })。
期望：
- fallback 被调用；
- 流式 chunk 正常输出；
- runtime.usedProfile 为 fallbackProfile；
- fallbackUsed=true。
```

### 11.4 工具规划无工具

```txt
前提：tools 为空。
操作：调用 ToolPlanningProvider.plan()。
期望：
- 不请求模型；
- 返回 { type: "no_tool", reason: "no_tools" }；
- 不产生用户可见文本。
```

### 11.5 工具规划能力不足

```txt
前提：tools 非空，primary/fallback 均 toolCalling=false。
操作：调用 ToolPlanningProvider.plan()。
期望：
- 不向不兼容模型发送工具定义；
- 返回 { type: "no_tool", reason: "tool_calling_unavailable" }；
- runtime / trace 有能力降级记录；
- 不影响后续普通聊天生成。
```

### 11.6 工具规划有调用

```txt
前提：模型档案 toolCalling=true，存在 get_current_time 工具。
输入：现在几点？
操作：调用 ToolPlanningProvider.plan()。
期望：
- 返回 tool_calls；
- 参数可被后续 Tool Registry 消费；
- planner 的自然语言 text 不进入用户回复。
```

### 11.7 工具规划无需调用

```txt
前提：模型档案 toolCalling=true，存在 get_current_time 工具。
输入：你今天心情怎么样？
操作：调用 ToolPlanningProvider.plan()。
期望：
- 返回 no_tool；
- 不将规划模型的 text 当作聊天回答；
- 后续阶段可直接进入 Final Response Stream。
```

### 11.8 宿主策略注册表

```txt
操作：
- 使用 OpenAI-compatible Config 创建模型；
- 使用未注册 provider 创建模型。

期望：
- 前者成功并展示 Effective Profile；
- 后者返回明确“未注册模型 Provider”错误；
- 日志与 UI 不泄露 apiKey。
```

---

## 十二、非目标与禁止事项

本阶段明确不做：

```txt
- 不接入 ollama npm 包；
- 不创建 packages/model-ollama；
- 不实现 Ollama Embedding；
- 不实现多个 fallback 链；
- 不实现自动模型性价比路由；
- 不实现模型健康检查、熔断器、负载均衡；
- 不实现工作流级 text:delta 或 NDJSON endpoint；
- 不实现真正流式多轮 Tool Loop；
- 不将模型配置、API Key、host 写入 ai-core；
- 不让 Planner 生成或缓存用户可见最终回答；
- 不修改用户系统、鉴权、商业化与正式产品 UI。
```

---

## 十三、完成后的能力边界

阶段 3 完成后，系统应具备：

```txt
宿主配置
↓
Provider Strategy Registry
↓
具体 ChatModel Adapter
├── primaryProfile
├── fallbackProfile
├── retry / fallback
└── requiredCapabilities 筛选
↓
ToolPlanningProvider
├── no_tool
├── tool_calls
└── 可观测降级
↓
后续 SimpleChatWorkflow
├── 阶段 4：步骤函数化
├── 阶段 5：最终回复流式化
└── 阶段 6：注册 Ollama Adapter
```

本阶段完成后，新增一个模型 Provider 的标准路径应为：

```txt
1. 实现 ChatModel Adapter；
2. 为具体模型提供 ModelProfile；
3. 实现并注册 ModelAdapterStrategy；
4. 不修改 ai-core Workflow 的 provider 名称分支；
5. 使用 requiredCapabilities 与 runtime 让 Workflow 自然适配能力差异。
```

这就是 V1.1 对后续 OpenAI-compatible、Ollama 与其他本地模型的非破坏性扩展保证。
