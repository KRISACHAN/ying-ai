# AI Companion Core V1 - 阶段 6：工具调用系统实施文档

## 文档说明

本文档用于指导实现：

```txt
.requirements/stages/stage-06/06-tool-system.md
```

当前项目已经完成：

```txt
阶段 1：Model Runtime
阶段 2：Core 抽象层
阶段 3：聊天主链路（最小闭环）
阶段 4：记忆系统（长期记忆 + RAG）
阶段 5：情绪状态机
```

阶段 6 的目标是在已有聊天、记忆、情绪链路上接入“工具调用系统”。

这里的工具调用系统不是远程 MCP、不是 LangChain Tool、不是 LangGraph ToolNode，而是 Core V1 里最小可用的本地工具调用闭环：

```txt
模型知道有哪些工具
↓
模型在非流式 generate 中返回 tool_call
↓
Core 把模型层 tool_call 转换为 Core 工具调用
↓
LocalToolRegistry 执行本地工具
↓
工具结果重新注入模型
↓
模型生成最终回复
↓
Workflow 返回 text + toolResults + debug 信息
```

阶段 6 完成后，Core 将具备最小 Agent 工具能力，但仍然保持纯 SDK，不读取环境变量、不连接数据库、不保存用户状态、不绑定具体业务系统。

---

## 一、阶段目标

阶段 6 要完成的是：

```txt
本地 Tool Registry + Model Tool Call 适配 + 工具执行 + 二次生成
```

具体包括：

1. 实现真实可用的 `LocalToolRegistry`；
2. 保留并完善 `ToolDefinition` / `ToolCall` / `ToolResult` 抽象；
3. 明确模型层 `ModelToolCall` 与 Core 工具层 `ToolCall` 的转换关系；
4. 将 Core 工具定义适配为模型可理解的工具定义；
5. 在 `SimpleChatWorkflow` 中接入非流式工具调用循环；
6. 支持模型返回 tool call 后执行本地工具；
7. 支持把工具结果作为上下文再次传给模型生成最终回复；
8. 通过 `CoreObserver` 暴露工具列表、工具请求、工具执行、工具结果；
9. 在调试 UI 中展示工具调用过程；
10. 保证阶段 1～5 已完成能力不被破坏；
11. 继续保持 `ai-core` 纯 SDK 边界；
12. 为未来远程 Tool、MCP、LangGraph ToolNode 预留替换空间。

---

## 二、阶段完成标准

完成后需要满足：

1. `@ying-companion/ai-core` 可独立构建；
2. 默认 `EmptyToolRegistry` 仍然可用；
3. 新增真实实现 `LocalToolRegistry`；
4. `LocalToolRegistry` 支持注册工具、列出工具、执行工具；
5. 工具注册必须包含稳定 `name`、`description`、`parameters`；
6. 工具参数 schema 使用 Core 自己的抽象表达，不向外暴露 AI SDK 类型；
7. `SimpleChatWorkflow` 在生成前调用 `tools.list()`；
8. 当没有工具时，聊天链路行为与阶段 5 保持一致；
9. 当有工具时，`SimpleChatWorkflow` 将工具定义传给 `model.generate()`；
10. 模型返回 `toolCalls` 时，Workflow 执行对应工具；
11. 工具执行结果会进入二次 `model.generate()`；
12. 最终回复以二次生成结果为准；
13. `ChatWorkflowOutput.toolResults` 返回本轮工具执行结果；
14. `ChatWorkflowOutput.metadata.debug` 或既有 debug 结构中能看到工具调用过程；
15. 未注册工具不能导致整个 Core 崩溃成不可观测错误，必须返回明确错误或进入受控失败路径；
16. 工具执行异常必须被捕获、观测，并转成可传给模型的工具错误结果；
17. 单轮工具调用必须有最大轮数限制，避免死循环；
18. V1 只支持非流式 `generate` 工具循环；
19. V1 不实现流式工具调用；
20. V1 不引入 LangChain；
21. V1 不引入 LangGraph；
22. V1 不实现远程 Tool Call / MCP；
23. `ai-core` 内不写死 console，所有可观测信息走 `CoreObserver`；
24. 阶段 4 的记忆 recall / extract / save 流程仍然正常；
25. 阶段 5 的情绪 analyze / transition / prompt 注入仍然正常。

---

## 三、阶段边界

### 3.1 本阶段要做

本阶段只做本地工具调用系统。

需要完成：

1. 实现 `LocalToolRegistry`；
2. 定义或完善 `ToolDefinition.parameters` 的结构化约定；
3. 定义 `ToolExecutionError` / `ToolExecutionMetadata` 等调试类型；
4. 实现 `ModelToolCall -> ToolCall` 适配函数；
5. 实现 `ToolDefinition -> GenerateInput.tools` 适配函数；
6. 在 `SimpleChatWorkflow` 中接入工具列表；
7. 在 `SimpleChatWorkflow` 中接入工具执行循环；
8. 在工具结果后触发二次模型生成；
9. 在 `CoreObserver` 中发出工具相关事件；
10. 在 demo 中注册默认本地工具；
11. 在 demo 中展示工具调用过程；
12. 文档同步更新 `packages/ai-core/README.md` 当前阶段状态。

### 3.2 本阶段不做

本阶段不做：

1. 不实现远程 Tool Call；
2. 不实现 MCP Server / MCP Client；
3. 不实现 LangChain Tool；
4. 不实现 LangGraph ToolNode；
5. 不实现多 Agent 工具协作；
6. 不实现工具权限系统；
7. 不实现工具市场；
8. 不实现工具运行沙箱；
9. 不实现工具调用审计数据库；
10. 不实现用户系统；
11. 不实现鉴权；
12. 不实现正式业务 UI；
13. 不实现流式工具调用；
14. 不让工具直接读取 `process.env`；
15. 不让 `ai-core` 连接数据库；
16. 不把 `memory-postgres` 强绑定到 `ai-core`；
17. 不在工具系统里引入业务概念，如 `userId` / `tenantId` / `orderId`。

### 3.3 为什么 V1 只做本地工具

当前 Core 的定位是：

```txt
干净纯粹的 AI Companion Core / SDK
```

工具调用的第一阶段应该先验证：

```txt
模型是否会选择工具
Core 是否能识别 tool_call
Core 是否能执行工具
工具结果是否能影响最终回复
```

远程 Tool、MCP、LangGraph ToolNode 都是后续扩展，不应该在本阶段引入，否则会再次把范围扩大到基础设施层。

### 3.4 为什么 V1 不做流式工具调用

阶段 1 已经支持 `model.stream()`，但阶段 6 的工具调用只接入 `model.generate()`。

原因：

1. 工具调用通常需要先等待模型完成 tool call 决策；
2. 流式输出一旦开始吐字，再插入工具结果会让输出语义和安全检查变复杂；
3. 阶段 6 重点是工具调用链路正确，不是最终交互体验；
4. 阶段 7 的流程编排可以再考虑流式、多步、中断、恢复等高级能力。

本阶段明确：

```txt
非流式 generate：支持工具调用
流式 stream：保持阶段 1 能力，不接入工具循环
```

---

## 四、承接前置阶段的硬性约束

阶段 6 必须继续遵守阶段 1～5 的所有边界。

### 4.1 ai-core 仍然是纯 SDK

`packages/ai-core` 可以包含：

```txt
ToolProvider / ToolRegistry 抽象
LocalToolRegistry 实现
ToolDefinition / ToolCall / ToolResult 领域类型
ModelToolCall -> ToolCall 适配器
ToolDefinition -> 模型工具定义适配器
Workflow 工具调用点
Observer 事件
工具 Prompt / 工具结果格式化
```

`packages/ai-core` 不能包含：

```txt
数据库连接
数据库表结构
DATABASE_URL
用户系统
鉴权逻辑
远程工具服务
MCP 连接
console 调试输出
```

### 4.2 模型调用必须复用 ChatModel

阶段 6 不能在工具模块里重新创建模型。

禁止：

```ts
new OpenAI(...)
createOpenAI(...)
process.env.OPENAI_API_KEY
```

必须继续通过：

```ts
context.core.model.generate(...)
```

也就是：

```txt
工具系统只负责工具定义与工具执行
模型决策仍然由 ChatModel 完成
```

### 4.3 工具不感知用户系统

工具执行输入可以拿到：

```ts
sessionId?: string
metadata?: Record<string, unknown>
```

但不应该在 Core 类型中引入：

```txt
userId
companionId
tenantId
authId
```

未来业务层可以通过 `metadata` 或外部闭包注入业务上下文，但 Core 不定义业务模型。

### 4.4 工具失败不能直接污染主链路

工具失败分两类：

```txt
可恢复失败：工具不存在、参数不合法、工具执行异常
不可恢复失败：模型二次生成失败、Workflow 自身错误
```

V1 推荐策略：

```txt
工具失败：转成 ToolResult，交给模型解释
模型失败：继续沿用 Model Runtime 的重试 / 降级，最终失败则本轮聊天失败
```

也就是说，工具失败不应该直接让用户看到堆栈错误。

---

## 五、核心设计

### 5.1 阶段 6 完整执行顺序

阶段 6 在阶段 5 的基础上扩展为：

```txt
workflow:start
↓
Persona.load
↓
Safety.guardInput
↓
Memory.recall
↓
Emotion.analyze
↓
Emotion.transition
↓
ToolRegistry.list
↓
Build Messages（Persona + History + Memory + Emotion + 当前用户消息）
↓
Model.generate(messages, tools)
↓
if modelOutput.toolCalls exists
  ↓
  ModelToolCall -> ToolCall
  ↓
  ToolRegistry.execute
  ↓
  Build Follow-up Messages（原 messages + assistant tool_call + tool result）
  ↓
  Model.generate(follow-up messages, tools)
↓
Safety.guardOutput
↓
Memory.extract
↓
Memory.save
↓
workflow:end
```

说明：

1. `ToolRegistry.list` 必须在第一次 `Model.generate` 前执行；
2. `Memory.recall` 与 `Emotion.analyze` 仍然发生在主生成前；
3. 工具调用发生在第一次模型生成之后、输出安全检查之前；
4. 输出安全检查只检查最终给用户的回复；
5. 记忆抽取应基于用户消息与最终回复，而不是工具中间结果；
6. 工具中间结果可以作为 metadata / debug 返回，但不应自动写入长期记忆。

### 5.2 工具调用轮数限制

必须设置单轮最大工具调用轮数。

V1 推荐默认：

```txt
maxToolRounds = 1
```

含义：

```txt
第一次模型生成 -> 工具执行 -> 第二次模型生成 -> 结束
```

不要让模型无限继续调用工具。

后续阶段如要支持多轮工具循环，可以扩展为：

```txt
maxToolRounds = 3
```

但阶段 6 不建议默认超过 1。

### 5.3 没有工具时的行为

如果：

```ts
await tools.list()
```

返回空数组，则：

```txt
不传 tools 给 model.generate
不进入工具执行逻辑
行为与阶段 5 完全一致
```

这保证工具系统是可插拔增强能力，不是主链路硬依赖。

### 5.4 有工具但模型不调用时的行为

如果工具列表不为空，但模型没有返回 `toolCalls`，则：

```txt
不执行任何工具
直接使用第一次模型输出作为最终回复
```

这属于正常路径。

### 5.5 模型返回未知工具时的行为

如果模型返回了未注册工具，例如：

```txt
tool name: unknown_tool
```

则不要直接抛出未处理异常。

应生成一个错误型 `ToolResult`：

```ts
{
  name: "unknown_tool",
  result: {
    ok: false,
    error: {
      code: "TOOL_NOT_FOUND",
      message: "Tool is not registered: unknown_tool"
    }
  }
}
```

然后把该结果传给模型进行二次生成。

如果二次生成失败，再由 Model Runtime 的重试 / 降级负责。

---

## 六、类型设计

### 6.1 ToolDefinition

阶段 2 已经定义了：

```ts
export interface ToolDefinition {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}
```

阶段 6 需要收紧约定。

推荐扩展为：

```ts
export interface ToolDefinition {
  name: string;
  description: string;
  parameters?: ToolParametersSchema;
  metadata?: ToolDefinitionMetadata;
}
```

其中：

```ts
export interface ToolParametersSchema {
  type: "object";
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
}
```

说明：

1. V1 只支持 object 参数；
2. 该结构接近 JSON Schema，但保持为 Core 自己的类型；
3. 不要在 public abstraction 中暴露 AI SDK Tool 类型；
4. 不要在 `ToolDefinition` 中直接保存 handler。

### 6.2 ToolCall

阶段 2 已经定义了：

```ts
export interface ToolCall {
  id?: string;
  name: string;
  arguments: unknown;
}
```

阶段 6 建议保持这个结构，但明确：

```txt
ToolCall 是 Core 准备执行的工具调用
它不是模型原始 tool_call
```

需要通过适配器从模型层转换：

```txt
ModelToolCall -> ToolCall
```

### 6.3 ToolResult

阶段 2 已经定义了：

```ts
export interface ToolResult {
  toolCallId?: string;
  name: string;
  result: unknown;
  metadata?: Record<string, unknown>;
}
```

阶段 6 建议扩展为：

```ts
export interface ToolResult {
  toolCallId?: string;
  name: string;
  result: unknown;
  ok?: boolean;
  error?: ToolExecutionError;
  metadata?: ToolExecutionMetadata;
}
```

错误结构：

```ts
export interface ToolExecutionError {
  code:
    | "TOOL_NOT_FOUND"
    | "TOOL_INVALID_ARGUMENTS"
    | "TOOL_EXECUTION_FAILED";
  message: string;
}
```

调试信息：

```ts
export interface ToolExecutionMetadata {
  startedAt?: Date;
  endedAt?: Date;
  durationMs?: number;
  rawArguments?: unknown;
}
```

说明：

1. `result` 保存工具业务结果；
2. `ok` 表示工具执行是否成功；
3. `error` 只保存安全摘要；
4. 不要把完整异常对象塞进 `metadata`；
5. `metadata.rawArguments` 只用于调试，不应该长期持久化。

### 6.4 ToolExecuteInput

保持现有结构：

```ts
export interface ToolExecuteInput {
  call: ToolCall;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}
```

阶段 6 增加约定：

```txt
metadata 可以包含 Workflow 传入的调试上下文
但 ToolHandler 不应该依赖业务用户系统字段
```

### 6.5 ToolHandler

阶段 2 已定义：

```ts
export type ToolHandler = (input: ToolExecuteInput) => Promise<ToolResult>;
```

阶段 6 允许 handler 返回 `ToolResult`，也可以内部自行校验参数。

建议不要把 handler 设计成：

```ts
(args) => result
```

原因：

1. 后续需要传 `sessionId`；
2. 后续需要传 `metadata`；
3. 后续需要支持工具执行上下文；
4. 当前 `ToolExecuteInput` 更适合作为稳定边界。

---

## 七、LocalToolRegistry 设计

### 7.1 文件位置

```txt
packages/ai-core/src/implementations/tool/local-tool-registry.ts
```

### 7.2 目标

`LocalToolRegistry` 是阶段 6 的真实工具实现。

它负责：

```txt
注册工具
列出工具定义
按名称查找工具
执行工具 handler
包装工具错误
返回 ToolResult
```

### 7.3 类结构

建议实现：

```ts
export class LocalToolRegistry implements ToolRegistry {
  readonly meta = {
    id: "tool.local-registry",
    kind: "tool",
    name: "Local Tool Registry",
  } as const;

  register(definition: ToolDefinition, handler: ToolHandler): void;

  list(): Promise<ToolDefinition[]>;

  execute(input: ToolExecuteInput): Promise<ToolResult>;
}
```

### 7.4 注册规则

`register` 必须校验：

1. `definition.name` 不能为空；
2. `definition.name` 只能使用安全名称；
3. `definition.description` 不能为空；
4. 重复注册同名工具时应抛出明确错误；
5. handler 必须存在。

工具名称建议规则：

```txt
^[a-zA-Z_][a-zA-Z0-9_]*$
```

例如：

```txt
get_current_time
search_memory
get_emotion_state
```

### 7.5 执行规则

`execute` 的行为：

```txt
根据 input.call.name 查找 handler
↓
不存在：返回 TOOL_NOT_FOUND 错误结果
↓
存在：执行 handler
↓
成功：返回 handler 的 ToolResult，并补充 metadata
↓
失败：捕获异常，返回 TOOL_EXECUTION_FAILED 错误结果
```

不要让工具 handler 的异常直接穿透到 Workflow。

### 7.6 EmptyToolRegistry 保留

`EmptyToolRegistry` 仍然保留。

用途：

```txt
没有工具能力时的默认实现
```

行为不变：

```txt
list -> []
execute -> 抛错或受控错误
register -> 抛错
```

但如果 Workflow 中先检查 `list()` 为空，则默认不会调用 `execute()`。

---

## 八、模型工具适配设计

### 8.1 为什么需要适配层

阶段 1 有模型层：

```txt
GenerateInput.tools
GenerateOutput.toolCalls
ModelToolCall
```

阶段 2 有 Core 工具层：

```txt
ToolDefinition
ToolCall
ToolResult
ToolRegistry
```

阶段 6 不能把两层混在一起。

必须明确：

```txt
ToolDefinition -> GenerateInput.tools
ModelToolCall -> ToolCall
ToolResult -> Follow-up Messages
```

### 8.2 建议文件位置

```txt
packages/ai-core/src/implementations/tool/tool-adapter.ts
```

或者：

```txt
packages/ai-core/src/implementations/workflow/tool-message-adapter.ts
```

如果适配逻辑只服务 Workflow，放在 workflow 目录也可以。

### 8.3 ToolDefinition -> GenerateInput.tools

建议提供：

```ts
export function toModelTools(
  definitions: ToolDefinition[],
): Record<string, unknown> | undefined;
```

行为：

```txt
空数组 -> undefined
非空 -> 转换为模型可用工具定义
```

注意：

1. public 类型仍然是 Core 自己的 `ToolDefinition`；
2. 具体 AI SDK ToolSet 类型只允许出现在实现层；
3. 不要从 `index.ts` 暴露 AI SDK ToolSet 类型；
4. 如果当前阶段模型实现已经支持 `GenerateInput.tools?: Record<string, unknown>`，则适配结果使用这个字段。

### 8.4 ModelToolCall -> ToolCall

建议提供：

```ts
export function toCoreToolCall(modelToolCall: ModelToolCall): ToolCall;
```

映射规则：

```txt
modelToolCall.id        -> ToolCall.id
modelToolCall.name      -> ToolCall.name
modelToolCall.arguments -> ToolCall.arguments
```

如果模型返回的参数是字符串 JSON，需要在适配器里尽量 parse。

失败时：

```txt
保留原始 arguments
并在 ToolResult 中返回 TOOL_INVALID_ARGUMENTS
```

不要让 JSON parse 错误导致 Workflow 崩溃。

### 8.5 ToolResult -> Follow-up Messages

工具结果需要重新注入模型。

V1 可以采用简化策略，不强行依赖 AI SDK 的底层 tool result message 类型。

推荐方式：

```txt
在二次生成时追加一个 tool result summary message
```

例如：

```ts
{
  role: "system",
  content: formatToolResultsForPrompt(toolResults),
}
```

格式示例：

```txt
以下是本轮工具调用结果，请基于这些结果自然回复用户，不要暴露内部工具调用细节。

工具：get_current_time
结果：2026-06-18 15:30:00 Asia/Singapore

工具：search_memory
结果：用户喜欢五月天；用户是前端开发工程师
```

说明：

1. V1 先保证功能稳定；
2. 后续可以再切换到更严格的 provider-native tool result message；
3. 该格式化逻辑应在实现层，不应泄露到业务层；
4. 不要把工具调用细节直接作为最终回复返回给用户。

---

## 九、默认本地工具

阶段 6 建议在 demo 宿主中注册默认工具，而不是在 `createCompanionCore` 中默认注册。

原因：

```txt
Core 默认应该干净
工具能力应该由宿主显式注入
```

### 9.1 get_current_time

用途：

```txt
返回当前时间
```

定义：

```ts
{
  name: "get_current_time",
  description: "获取当前本地时间。适合用户询问现在几点、今天日期、当前时间时调用。",
  parameters: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  },
}
```

返回示例：

```ts
{
  toolCallId: input.call.id,
  name: "get_current_time",
  ok: true,
  result: {
    iso: new Date().toISOString(),
    timezone: "local",
  },
}
```

注意：

1. 工具内部可以使用 `new Date()`；
2. 不要在 `ai-core` 内读取系统时区配置；
3. demo 可以展示原始工具结果。

### 9.2 search_memory

用途：

```txt
允许模型主动检索长期记忆
```

但阶段 4 已经有生成前 `Memory.recall`。

所以阶段 6 对 `search_memory` 的定位是：

```txt
调试 Agent Tool Call 能力
不是替代主链路 Memory.recall
```

定义：

```ts
{
  name: "search_memory",
  description: "搜索与用户问题相关的长期记忆。适合需要确认用户偏好、事实、过往事件时调用。",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "要搜索的记忆查询文本",
      },
      topK: {
        type: "number",
        description: "最多返回多少条记忆",
      },
    },
    required: ["query"],
    additionalProperties: false,
  },
}
```

实现建议：

```txt
handler 内部调用已注入的 MemoryProvider.recall
```

注意：

1. 这个工具应在 demo / 宿主侧注册；
2. 可以通过闭包拿到同一个 `memory` provider；
3. 不要让 `ai-core` 直接 import `memory-postgres`；
4. 如果没有真实记忆 provider，可以返回空数组。

### 9.3 get_emotion_state

用途：

```txt
允许模型查看当前伴侣情绪状态
```

但阶段 5 已经会把情绪注入 Prompt。

所以阶段 6 对 `get_emotion_state` 的定位是：

```txt
调试 Tool Call 能力
不是替代情绪 Prompt 注入
```

定义：

```ts
{
  name: "get_emotion_state",
  description: "获取当前伴侣情绪状态。适合需要确认伴侣当前情绪时调用。",
  parameters: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  },
}
```

实现建议：

```txt
handler 从 demo / 宿主当前保存的 emotion state 中读取
```

注意：

1. `ai-core` 不保存 emotion；
2. 宿主负责把上一轮 emotion 保存起来；
3. 工具可以通过闭包读取宿主状态；
4. 不要为这个工具新增数据库。

---

## 十、Workflow 接入设计

### 10.1 SimpleChatWorkflow 增强

阶段 6 需要增强现有 `SimpleChatWorkflow`，但不要把它改成 LangGraph。

它仍然是线性流程。

新增逻辑：

```txt
const toolDefinitions = await core.tools.list()
const modelTools = toModelTools(toolDefinitions)

const firstOutput = await core.model.generate({
  messages,
  tools: modelTools,
})

if (!firstOutput.toolCalls?.length) {
  finalOutput = firstOutput
} else {
  const toolResults = await executeToolCalls(firstOutput.toolCalls)
  const followUpMessages = buildToolFollowUpMessages(messages, firstOutput, toolResults)
  finalOutput = await core.model.generate({
    messages: followUpMessages,
    tools: modelTools,
  })
}
```

### 10.2 不要提前抽象 Agent Loop

本阶段不要新增复杂的：

```txt
AgentLoop
ToolNode
Planner
Executor
```

原因：

```txt
阶段 6 的目标是让工具调用跑通
阶段 7 才是流程编排抽象增强
```

### 10.3 工具执行顺序

如果模型一次返回多个 tool call，V1 可以顺序执行：

```txt
toolCalls[0]
↓
toolCalls[1]
↓
toolCalls[2]
```

暂不并行。

原因：

1. 顺序执行更容易观察；
2. 某些工具未来可能有依赖关系；
3. 并发会增加错误处理复杂度。

后续如需并行，可在 `LocalToolRegistry` 或 Workflow 中增加策略配置。

### 10.4 工具结果不自动写入记忆

本阶段不要把工具结果自动写入长期记忆。

例如：

```txt
get_current_time 返回当前时间
```

不应该保存为长期记忆。

记忆仍然由阶段 4 的：

```txt
Memory.extract
Memory.save
```

负责。

---

## 十一、CoreObserver 事件

阶段 2 已经预留以下事件：

```txt
tool:list
tool:register
tool:execute:start
tool:execute:end
workflow:step
```

阶段 6 需要真正发出这些事件。

### 11.1 tool:list

触发时机：

```txt
Workflow 调用 tools.list() 后
```

payload 建议：

```ts
{
  count: number;
  tools: Array<{
    name: string;
    description?: string;
  }>;
}
```

### 11.2 tool:register

触发时机：

```txt
LocalToolRegistry.register() 成功后
```

payload 建议：

```ts
{
  name: string;
  description?: string;
}
```

注意：

如果 `LocalToolRegistry` 没有 observer 注入能力，可以不在 registry 内发事件，而是在 demo 注册后自行展示。

更推荐：

```txt
Registry 保持简单
Workflow 负责运行期事件
```

所以 `tool:register` 在 V1 可以作为可选事件。

### 11.3 tool:execute:start

触发时机：

```txt
每个工具执行前
```

payload 建议：

```ts
{
  toolCallId?: string;
  name: string;
  arguments: unknown;
}
```

### 11.4 tool:execute:end

触发时机：

```txt
每个工具执行后
```

payload 建议：

```ts
{
  toolCallId?: string;
  name: string;
  ok: boolean;
  result?: unknown;
  error?: ToolExecutionError;
  durationMs?: number;
}
```

### 11.5 workflow:step

建议增加以下 step：

```txt
tool:list:start
tool:list:end
tool:model-generate-with-tools:start
tool:model-generate-with-tools:end
tool:follow-up-generate:start
tool:follow-up-generate:end
```

这些 step 用于 demo 展示完整调用路径。

---

## 十二、Prompt 与消息组装

### 12.1 工具能力说明

如果使用 provider-native tools，则模型通过 `tools` 字段理解工具，不一定需要在 system prompt 里重复列出工具。

但为了兼容 OpenAI-compatible provider 差异，V1 可以在 system prompt 中加入轻量说明：

```txt
如果你需要当前时间、长期记忆或当前情绪状态，可以调用可用工具。
工具结果返回后，请基于工具结果自然回复用户，不要暴露内部工具调用过程。
```

不要把完整 JSON Schema 复制进 prompt。

### 12.2 工具结果格式化

建议新增：

```txt
packages/ai-core/src/implementations/tool/format-tool-results.ts
```

负责：

```txt
ToolResult[] -> system message content
```

格式原则：

1. 工具结果要简短；
2. 错误工具结果也要可读；
3. 不要暴露堆栈；
4. 不要使用“数据库”“内部系统”等术语污染角色回复；
5. 提醒模型自然回复，不要说“我调用了工具”。

示例：

```txt
以下是本轮工具返回的信息，请自然使用这些信息回复用户，不要暴露内部工具调用过程。

- get_current_time：当前时间是 2026-06-18T07:30:00.000Z
- search_memory：找到 2 条相关记忆：用户喜欢五月天；用户是前端开发工程师
```

---

## 十三、调试 UI 要求

当前调试 UI 不是正式业务 UI。

阶段 6 需要在现有 demo 中增加工具调试区域。

### 13.1 展示内容

至少展示：

```txt
已注册工具列表
本轮模型是否请求工具
请求的工具名称
工具参数
工具执行结果
工具错误摘要
是否发生二次生成
最终回复
```

### 13.2 推荐展示结构

```txt
Tools
- get_current_time
- search_memory
- get_emotion_state

Tool Calls
1. get_current_time
   arguments: {}
   result: {...}
   ok: true

Final Response
...
```

### 13.3 调试输入建议

可以提供几个手动测试句子：

```txt
现在几点了？
你还记得我喜欢什么歌吗？
你现在是什么心情？
```

预期：

1. “现在几点了？”可能触发 `get_current_time`；
2. “你还记得我喜欢什么歌吗？”可能触发 `search_memory`；
3. “你现在是什么心情？”可能触发 `get_emotion_state`。

注意：

```txt
模型不一定每次都调用工具
```

所以 demo 只要能展示“调用时的完整链路”即可，不要把“每个测试句都必定调用工具”作为硬性验收。

---

## 十四、目录结构建议

阶段 6 完成后，`packages/ai-core` 相关目录建议为：

```txt
packages/ai-core/
  src/
    abstractions/
      tool.ts
      workflow.ts
      model.ts
      observer.ts

    implementations/
      tool/
        empty-tool-registry.ts
        local-tool-registry.ts
        tool-adapter.ts
        format-tool-results.ts

      workflow/
        simple-chat-workflow.ts
```

如果已有文件路径不同，以当前项目实际路径为准，但不要新增第二套 `implementations/` 目录。

---

## 十五、与前置阶段的集成要求

### 15.1 与阶段 1 Model Runtime 的关系

阶段 1 已经预留：

```txt
GenerateInput.tools
GenerateOutput.toolCalls
ModelToolCall
```

阶段 6 需要真正使用这些字段。

注意：

1. 不破坏 `generate`；
2. 不破坏 `stream`；
3. 不改变模型重试 / 降级行为；
4. 不让工具循环绕过 Model Runtime；
5. 工具二次生成仍然走 `model.generate()`。

### 15.2 与阶段 2 Core 抽象层的关系

阶段 2 已经定义：

```txt
ToolProvider
ToolRegistry
ToolDefinition
ToolCall
ToolResult
```

阶段 6 只是在此基础上实现真实本地工具注册表，不推翻抽象。

### 15.3 与阶段 3 SimpleChatWorkflow 的关系

阶段 6 修改 `SimpleChatWorkflow`。

但必须保持：

```txt
没有工具时，行为与阶段 5 一致
```

### 15.4 与阶段 4 Memory 的关系

`search_memory` 可以作为 demo 工具调用 `MemoryProvider.recall`。

但主链路中的 `Memory.recall` 仍然保留。

二者关系：

```txt
主链路 Memory.recall：默认每轮生成前召回
search_memory tool：模型主动决定是否补充检索
```

不要用工具调用替代主链路记忆召回。

### 15.5 与阶段 5 Emotion 的关系

`get_emotion_state` 可以作为 demo 工具读取当前情绪状态。

但主链路中的情绪注入仍然保留。

二者关系：

```txt
Emotion prompt injection：默认每轮生成前注入
get_emotion_state tool：模型主动决定是否读取当前状态
```

不要用工具调用替代情绪注入。

---

## 十六、验收方式

### 16.1 ai-core 构建与类型检查

执行：

```bash
pnpm --filter @ying-companion/ai-core typecheck
pnpm --filter @ying-companion/ai-core build
```

预期：

```txt
typecheck 通过
build 通过
无 TypeScript 类型错误
```

### 16.2 调试应用启动

执行当前项目已有调试应用命令。

如果仍使用 `model-runtime-demo`：

```bash
pnpm --filter @ying-companion/model-runtime-demo dev
```

预期页面可展示：

```txt
聊天输入
最终回复
已注册工具
工具调用过程
工具执行结果
二次生成结果
```

### 16.3 本地工具注册验证

在 demo / 宿主侧注册：

```ts
const tools = new LocalToolRegistry();

tools.register(
  {
    name: "get_current_time",
    description: "获取当前本地时间。",
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  async (input) => ({
    toolCallId: input.call.id,
    name: "get_current_time",
    ok: true,
    result: {
      iso: new Date().toISOString(),
    },
  }),
);
```

然后创建 Core：

```ts
const core = createCompanionCore({
  model,
  memory,
  emotion,
  tools,
  workflow: new SimpleChatWorkflow(),
  observer,
});
```

### 16.4 手动测试用例

#### 用例 1：无工具路径

输入：

```txt
你好，陪我聊聊天
```

预期：

```txt
不一定触发工具
正常返回回复
toolResults 为空或 undefined
```

#### 用例 2：当前时间工具

输入：

```txt
现在几点了？
```

预期：

```txt
可能触发 get_current_time
如果触发，demo 展示 tool call 与 tool result
最终回复自然包含当前时间
```

#### 用例 3：记忆搜索工具

前置：阶段 4 记忆系统已有可召回记忆。

输入：

```txt
你还记得我喜欢什么歌吗？
```

预期：

```txt
主链路 Memory.recall 正常
模型可能额外触发 search_memory
最终回复自然使用记忆
```

#### 用例 4：未知工具受控失败

可以通过 mock model 或临时调试方式让模型返回未知工具：

```txt
unknown_tool
```

预期：

```txt
不会出现未捕获异常
返回 TOOL_NOT_FOUND 工具结果
二次生成能基于错误结果自然回复
```

#### 用例 5：工具 handler 抛错

临时注册一个会抛错的工具。

预期：

```txt
不会出现未捕获异常
返回 TOOL_EXECUTION_FAILED 工具结果
observer 能看到 tool:execute:end 且 ok=false
```

---

## 十七、完成标准清单

本阶段完成后，需要满足：

1. 新增 `LocalToolRegistry`；
2. `LocalToolRegistry.meta.id` 为 `tool.local-registry`；
3. `LocalToolRegistry.register()` 可注册工具；
4. `LocalToolRegistry.list()` 可列出工具；
5. `LocalToolRegistry.execute()` 可执行工具；
6. 重复注册同名工具会受控报错；
7. 未注册工具执行会返回 `TOOL_NOT_FOUND`；
8. 工具 handler 抛错会返回 `TOOL_EXECUTION_FAILED`；
9. 工具执行结果包含安全错误摘要，不暴露完整异常对象；
10. `ToolDefinition.parameters` 有稳定结构约定；
11. 新增 `ToolExecutionError`；
12. 新增 `ToolExecutionMetadata`；
13. 新增 `ToolDefinitionMetadata`；
14. 新增 `ToolDefinition -> GenerateInput.tools` 适配逻辑；
15. 新增 `ModelToolCall -> ToolCall` 适配逻辑；
16. 新增 `ToolResult[] -> follow-up message` 格式化逻辑；
17. `SimpleChatWorkflow` 在模型生成前调用 `tools.list()`；
18. `SimpleChatWorkflow` 在模型返回 `toolCalls` 后执行工具；
19. `SimpleChatWorkflow` 支持工具二次生成；
20. `SimpleChatWorkflow` 有 `maxToolRounds` 限制，默认 1；
21. 没有工具时，阶段 5 的聊天链路不受影响；
22. 有工具但模型不调用时，直接使用第一次模型输出；
23. `ChatWorkflowOutput.toolResults` 返回工具结果；
24. `CoreObserver` 输出工具相关事件；
25. demo 可展示工具列表、工具调用、工具结果、最终回复；
26. `ai-core` 不读取 env；
27. `ai-core` 不连接数据库；
28. `ai-core` 不写死 console；
29. 不引入 LangChain；
30. 不引入 LangGraph；
31. 不实现远程 Tool Call；
32. 不实现流式工具循环；
33. 阶段 1 的模型 runtime 能力不被破坏；
34. 阶段 4 的记忆系统不被破坏；
35. 阶段 5 的情绪状态机不被破坏；
36. `@ying-companion/ai-core` 可以正常 `typecheck` 与 `build`。

---

## 十八、后续阶段衔接

### 18.1 阶段 7：流程编排抽象层

阶段 7 可以把当前线性的 `SimpleChatWorkflow` 进一步整理为显式步骤：

```txt
SafetyStep
MemoryRecallStep
EmotionStep
ToolStep
GenerateStep
MemorySaveStep
```

也可以在未来替换成：

```txt
LangGraphChatWorkflow
```

但外部仍然通过：

```ts
core.executeWorkflow(input)
```

调用，不应发生破坏性变化。

### 18.2 未来远程工具

未来可以新增：

```txt
RemoteToolRegistry
McpToolRegistry
HttpToolProvider
```

只要它们实现 `ToolRegistry` / `ToolProvider`，即可注入 Core。

### 18.3 未来权限系统

未来接用户系统后，工具权限不应该写进 `ai-core`。

推荐由宿主应用：

```txt
根据 userId / companionId / subscription
决定注册哪些工具
```

Core 只看见：

```txt
当前这个 CompanionCore 实例挂载了哪些工具
```

### 18.4 未来工具审计

未来如果需要工具调用审计，可以由宿主 observer 接管：

```txt
CoreObserver -> 日志服务 / 数据库 / 后台管理
```

不要让 `ai-core` 直接写审计表。

---

## 十九、给 AI Coding Agent 的实现提醒

实现时注意：

1. 不要把阶段 6 做成 LangGraph；
2. 不要引入 LangChain；
3. 不要实现远程 MCP；
4. 不要改动 `ai-core` 纯 SDK 边界；
5. 不要在 `ai-core` 读取 env；
6. 不要在 `ai-core` 连接数据库；
7. 不要在 `ai-core` 写 console；
8. 不要让工具 handler 异常直接炸穿 Workflow；
9. 不要让未知工具导致未捕获异常；
10. 不要把模型层 `ModelToolCall` 和 Core 层 `ToolCall` 混成一个类型；
11. 不要把 AI SDK ToolSet 类型暴露到 public abstraction；
12. 不要破坏阶段 1 的 `generate` / `stream`；
13. 不要破坏模型重试 / 降级；
14. 不要破坏阶段 4 的记忆闭环；
15. 不要破坏阶段 5 的情绪状态机；
16. 不要把工具结果自动写入长期记忆；
17. 不要默认注册工具，工具应由宿主显式注入；
18. 默认 `maxToolRounds` 使用 1；
19. 验收时必须跑 `typecheck` 与 `build`；
20. demo 必须能看到工具调用链路。

本阶段的成功标准不是“拥有很多工具”，而是：

```txt
Core 已经具备稳定、可观测、可替换的本地工具调用闭环
```
