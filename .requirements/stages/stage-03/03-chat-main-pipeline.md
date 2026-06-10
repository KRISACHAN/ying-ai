# AI Companion Core V1 - 阶段 3：聊天主链路实施文档

## 文档说明

本文档用于指导实现：

```txt
.requirements/stages/stage-03/03-chat-main-pipeline.md
```

当前项目已经完成：

```txt
阶段 1：Model Runtime
阶段 2：Core 抽象层
```

阶段 1 已建立模型运行时能力，包括：

1. `ChatModel` 抽象；
2. OpenAI-compatible 模型实现；
3. `generate` 普通生成；
4. `stream` 流式生成；
5. 主模型重试；
6. 降级模型；
7. 降级模型重试；
8. 模型运行时信息；
9. tool call 结构预留；
10. `apps/model-runtime-demo` 调试应用。

阶段 2 已建立 Core 抽象层，包括：

1. `CoreProvider` / `CoreProviderMeta`；
2. `CoreObserver`；
3. `PersonaProvider`；
4. `MemoryProvider`；
5. `EmotionEngine`；
6. `ToolProvider` / `ToolRegistry`；
7. `SafetyProvider`；
8. `ChatWorkflow`；
9. `CompanionCore`；
10. `createCompanionCore`；
11. 所有非 Model 模块的默认实现。

阶段 3 的目标不是做完整 Agent，也不是做记忆、情绪、工具调用，而是打通最小聊天闭环：

```txt
User → Persona → Safety → History → Model → Safety → Return
```

本阶段完成后，Core 才真正从“能力插槽集合”变成“可以被宿主调用的聊天核心”。

---

## 一、阶段目标

阶段 3 要完成的是：

```txt
聊天主链路最小闭环
```

具体包括：

1. 新增 `SimpleChatWorkflow`；
2. `SimpleChatWorkflow` 消费 `PersonaProvider`；
3. `SimpleChatWorkflow` 消费 `SafetyProvider`；
4. `SimpleChatWorkflow` 消费 `ChatModel`；
5. `SimpleChatWorkflow` 消费宿主传入的 `history`；
6. 通过 `core.executeWorkflow(input)` 完成一次非流式聊天；
7. 通过 `CoreObserver` 输出关键执行事件；
8. 在 demo 中提供可人工验证的聊天调试区域；
9. 保证阶段 1 的 Model Runtime 能力不被破坏；
10. 保证阶段 2 的 Provider 插槽与 `core.inspect()` 不被破坏。

---

## 二、阶段边界

### 2.1 本阶段要做

本阶段只做非流式最小聊天链路。

必须实现：

```txt
Persona.load
Safety.guardInput
Model.generate
Safety.guardOutput
CoreObserver events
```

必须支持：

```ts
const core = createCompanionCore({
  model,
  workflow: new SimpleChatWorkflow(),
});

const result = await core.executeWorkflow({
  sessionId: "demo-session",
  message: "你好，今天我有点累",
  history: [
    { role: "user", content: "我叫大鱼头" },
    { role: "assistant", content: "我记住啦，大鱼头。" },
  ],
});
```

预期返回：

```ts
{
  text: "...模型回复...",
  model: "...最终使用的模型...",
  raw: { ... },
  persona: { ... },
  safety: {
    input: { allowed: true },
    output: { allowed: true }
  },
  modelOutput: { ... },
  metadata: { ... }
}
```

### 2.2 本阶段不做

本阶段不做以下内容：

1. 不实现真实长期记忆；
2. 不实现 RAG；
3. 不实现 embedding；
4. 不实现真实情绪识别；
5. 不实现情绪状态转移；
6. 不执行模型返回的 tool call；
7. 不实现本地工具注册与执行；
8. 不实现远程 tool call；
9. 不引入 LangChain；
10. 不引入 LangGraph；
11. 不引入数据库；
12. 不引入用户系统；
13. 不引入鉴权；
14. 不实现正式业务 UI；
15. 不实现流式聊天主链路。

### 2.3 为什么不做流式

阶段 1 已经支持 `model.stream()`，但阶段 3 的主链路只要求 `model.generate()`。

原因：

1. 最小闭环需要先稳定输入、Persona、Safety、History、输出结构；
2. 流式输出一旦开始吐字，输出安全检查、模型降级、工具插入都会更复杂；
3. 阶段 6 才会处理工具调用，阶段 7 才会处理更完整流程编排；
4. 阶段 3 的目标是“链路正确”，不是“体验完整”。

后续可以在阶段 7 或独立阶段增加：

```txt
SimpleStreamingChatWorkflow
```

但本阶段不要把流式聊天和最小闭环混在一起。

---

## 三、承接前置阶段的硬性约束

阶段 3 必须继续遵守阶段 1 与阶段 2 的设计边界。

### 3.1 ai-core 仍然是纯 SDK

`packages/ai-core` 必须保持：

1. 不读取 `.env`；
2. 不读取 `process.env`；
3. 不连接数据库；
4. 不依赖用户系统；
5. 不做鉴权；
6. 不写死 console；
7. 不直接暴露 Vercel AI SDK 类型给外部业务层；
8. 不在 Workflow 内部创建 model；
9. 不在 Workflow 内部读取模型配置。

模型仍然由宿主应用通过阶段 1 的 `createModel()` 创建后传入。

### 3.2 不绑定具体 AI Coding Agent

本实施文档不针对 Codex、Gemini、Claude 或任何单一执行器写特定提示词。

执行要求必须是：

```txt
任何 AI Coding Agent 都可以按本文档执行
```

因此本文档中的任务描述要尽量满足：

1. 文件路径明确；
2. 输入输出明确；
3. 边界明确；
4. 验收命令明确；
5. 不依赖“你应该理解我的意思”这种隐含上下文；
6. 不要求执行器自行发明架构；
7. 不要求执行器重构阶段 1 / 阶段 2 已完成能力。

### 3.3 Core 仍然不保存 history

阶段 3 会消费 `ChatWorkflowInput.history`，但不会保存它。

约定：

```txt
宿主应用负责维护短期 history
Core 负责消费短期 history
```

这意味着：

1. `SimpleChatWorkflow` 不要在实例字段里保存消息历史；
2. `CompanionCore` 不要新增 `messages`、`history`、`sessions` 等内部状态；
3. demo 可以为了调试在页面状态里维护 history，但这属于宿主行为；
4. 后续正式业务接入时，由业务应用或 API 层负责持久化会话记录。

### 3.4 sessionId 不是用户系统

`sessionId` 只作为一次伴侣关系或会话隔离标识传入 Provider。

本阶段不要引入：

```txt
userId
companionId
tenantId
authId
```

未来业务层可以把：

```txt
userId + companionId
```

映射成：

```txt
sessionId
```

Core 不感知用户系统。

---

## 四、核心设计

### 4.1 最小链路

阶段 3 的执行顺序固定为：

```txt
workflow:start
↓
persona:load:start
↓
Persona.load
↓
persona:load:end
↓
safety:input:start
↓
Safety.guardInput
↓
safety:input:end
↓
Build Messages
↓
workflow:step(model:generate:start)
↓
Model.generate
↓
workflow:step(model:generate:end)
↓
safety:output:start
↓
Safety.guardOutput
↓
safety:output:end
↓
workflow:end
```

如果中途发生错误：

```txt
workflow:error
```

并继续向调用方抛出错误。

### 4.2 为什么 Persona 要在 Safety 前加载

阶段 3 的主链路建议先加载 Persona，再做 input safety。

原因：

1. input safety 未来可能需要根据角色配置判断边界；
2. Persona 加载不依赖用户输入内容安全性；
3. 阶段 3 的 prompt 组装必须依赖 Persona；
4. 该顺序与 `03-plan.md` 中阶段 3 顺序保持一致。

阶段 3 默认的 `PassthroughSafetyProvider` 全部放行，但链路顺序必须保留。

### 4.3 为什么不调用 Memory / Emotion / Tool

阶段 3 是最小闭环，不调用真实 Memory / Emotion / Tool。

这里不是因为这些能力不重要，而是为了避免范围再次膨胀。

说明：stage-02 §二十三 约定阶段 3「**可以**调用 Memory.recall / Emotion.analyze / Tool.list（拿空实现结果）」，「可以」并非「必须」；本阶段为收敛范围，选择完全不调用这些插槽，二者不冲突。

后续阶段会分别接入：

```txt
阶段 4：Memory / RAG
阶段 5：Emotion
阶段 6：Tool Call
阶段 7：Workflow 编排增强
```

阶段 3 只保证这些插槽不会阻碍最小聊天链路。

### 4.4 Prompt 组装原则

阶段 3 可以在 `SimpleChatWorkflow` 内部实现一个轻量的 messages 组装函数。

但它不能演化成复杂 Prompt 系统。

本阶段只需要：

```txt
system message: Persona 指令
history messages: 宿主传入 history
user message: 当前用户输入
```

不要在本阶段新增独立 `PromptProvider`。

不要引入复杂模板引擎。

不要把 Prompt 写到 demo 里。

### 4.5 Prompt 组装位置

阶段 3 的 Prompt 组装建议先放在：

```txt
packages/ai-core/src/implementations/workflow/simple-chat-workflow.ts
```

可以拆出私有函数：

```ts
function buildMessages(input: BuildMessagesInput): ChatMessage[]
```

但不需要导出。

原因：

1. 阶段 3 的 prompt 只是最小闭环的一部分；
2. 阶段 4 / 5 / 6 / 7 接入 Memory、Emotion、Tool 后，Prompt 结构会变化；
3. 过早抽成公共 Prompt 模块容易固化错误边界；
4. 当前只要保持函数内部清晰即可。

---

## 五、目录结构

阶段 3 建议新增或调整以下文件。

```txt
packages/ai-core/
  src/
    implementations/
      workflow/
        simple-chat-workflow.ts
        disabled-chat-workflow.ts

    core/
      companion-core-factory.ts

    index.ts

apps/
  model-runtime-demo/
    # 在现有 demo 基础上增加聊天主链路调试区域
```

如果项目中已有其它 demo 文件结构，以当前项目实际结构为准，不要为了本文档强行重建 demo。

---

## 六、SimpleChatWorkflow 实现

### 6.1 文件位置

```txt
packages/ai-core/src/implementations/workflow/simple-chat-workflow.ts
```

### 6.2 目标

实现阶段 3 最小聊天主链路。

### 6.3 meta

`SimpleChatWorkflow` 必须暴露稳定 `meta`。

```ts
readonly meta = {
  id: "workflow.simple-chat",
  kind: "workflow",
  name: "Simple Chat Workflow",
  description: "Minimal persona + safety + model chat workflow",
} as const;
```

不要使用 `constructor.name`。

### 6.4 核心 execute 结构

实现形态：

```ts
import type { ChatMessage } from "../../abstractions/model";
import type { CompanionPersona } from "../../abstractions/persona";
import type {
  ChatWorkflow,
  ChatWorkflowExecutionContext,
  ChatWorkflowInput,
  ChatWorkflowOutput,
} from "../../abstractions/workflow";

export class SimpleChatWorkflow implements ChatWorkflow {
  public readonly meta = {
    id: "workflow.simple-chat",
    kind: "workflow",
    name: "Simple Chat Workflow",
    description: "Minimal persona + safety + model chat workflow",
  } as const;

  public async execute(
    input: ChatWorkflowInput,
    context: ChatWorkflowExecutionContext,
  ): Promise<ChatWorkflowOutput> {
    // implementation
  }
}
```

### 6.5 必须执行的步骤

`execute()` 内部必须按以下顺序执行：

1. emit `workflow:start`；
2. 校验 `input.message`；为空或纯空白时 emit `workflow:error` 后抛出错误，且不再调用 Persona / Safety / Model；
3. emit `persona:load:start`；
4. 调用 `context.core.persona.load(...)`；
5. emit `persona:load:end`；
6. emit `safety:input:start`；
7. 调用 `context.core.safety.guardInput(...)`；
8. emit `safety:input:end`；
9. 如果 input safety 不允许，emit `workflow:error` 后抛出安全错误（本阶段统一抛错，不返回伪回复，详见 §6.7）；
10. 组装 messages；
11. emit `workflow:step`，标记 `model:generate:start`；
12. 调用 `context.core.model.generate({ messages })`；
13. emit `workflow:step`，标记 `model:generate:end`；
14. emit `safety:output:start`；
15. 调用 `context.core.safety.guardOutput(...)`；
16. emit `safety:output:end`；
17. 如果 output safety 不允许，emit `workflow:error` 后抛出安全错误（不返回未通过检查的模型文本，详见 §6.7 / §11.5）；
18. 组装 `ChatWorkflowOutput`；
19. emit `workflow:end`；
20. 返回结果。

任何异常都必须：

1. emit `workflow:error`；
2. 继续向调用方抛出。

### 6.6 input.message 校验

如果 `input.message` 为空字符串或只包含空白字符，应该直接抛出错误。

建议错误消息：

```txt
ChatWorkflowInput.message is required
```

不要调用模型。

不要进入 Safety。

原因：

1. 空消息没有业务意义；
2. 避免浪费模型调用；
3. 错误更容易定位。

### 6.7 Safety 不通过时的处理

本阶段建议直接抛出错误，而不是返回伪回复。

输入不通过：

```txt
Input rejected by SafetyProvider
```

输出不通过：

```txt
Output rejected by SafetyProvider
```

抛出错误前要 emit 对应的 `safety:*:end` 事件与 `workflow:error` 事件。

注意：

1. 阶段 2 默认 `PassthroughSafetyProvider` 会放行；
2. 当前 demo 正常情况下不会触发拒绝；
3. 但 Workflow 必须具备中断能力，给后续敏感词与安全系统预留边界。

### 6.8 Observer 安全调用

`CoreObserver.emit()` 不应该影响主链路。

其中 `observer` 来自 `context.core.observer`（stage-02 补丁后 `context.core` 为 `ChatWorkflowCoreContext`，不含 `workflow` 自身，但仍包含 `observer`）。

因此 `SimpleChatWorkflow` 内部必须使用安全封装：

```ts
async function safeEmit(...) {
  try {
    await Promise.resolve(observer.emit(event));
  } catch {
    // observer must not break workflow
  }
}
```

要求：

1. Observer 同步错误不能打断聊天；
2. Observer 异步 rejection 不能打断聊天；
3. 不要在 `ai-core` 内部 console；
4. demo 自己决定如何展示 observer 事件。

### 6.9 messages 组装

组装顺序必须是：

```txt
system persona message
↓
history messages
↓
current user message
```

生成示例：

```ts
const messages: ChatMessage[] = [
  {
    role: "system",
    content: buildPersonaSystemPrompt(persona),
  },
  ...sanitizeHistory(input.history),
  {
    role: "user",
    content: input.message,
  },
];
```

### 6.10 Persona system prompt

`buildPersonaSystemPrompt(persona)` 至少包含：

1. 角色名称；
2. 性别；
3. 关系；
4. 性格；
5. 说话风格；
6. 背景；
7. 自定义 `systemPrompt`。

建议结构：

```txt
你是一个 AI 伴侣角色，请始终以该角色身份与用户对话。

角色名称：{name}
性别：{gender}
关系：{relationship}
性格：{personality}
说话风格：{speakingStyle}
背景：{background}

额外角色指令：
{systemPrompt}

回复要求：
1. 使用自然、亲近、有陪伴感的语气；
2. 不要声称自己拥有真实人类身份；
3. 不要编造你无法知道的长期记忆；
4. 如果上下文不足，可以温和询问用户；
5. 当前阶段没有长期记忆能力，只能依据本轮输入与传入的短期历史回答。
```

注意：

1. 不要把“女友”写死；
2. 不要把性别写死为 female；
3. 不要在 Workflow 内硬编码固定角色名；
4. 自定义 `persona.systemPrompt` 应该追加到角色指令里，而不是完全覆盖基础安全边界；
5. 不要加入 Memory / Emotion / Tool 相关内容。

### 6.11 history 清洗

`history` 来自宿主应用，阶段 3 只做轻量清洗。

规则：

1. `history` 缺省时按 `[]` 处理；
2. 只允许 `role` 为 `user` / `assistant` / `system` 的历史消息进入主 prompt；
3. 暂时过滤 `tool` 消息，因为阶段 3 不执行工具；
4. `content` 为空或纯空白的历史消息过滤掉；
5. 不修改原始 `input.history` 数组；
6. 不在 Core 内保存清洗后的 history。

建议实现：

```ts
function sanitizeHistory(history: ChatMessage[] | undefined): ChatMessage[] {
  return (history ?? []).filter((message) => {
    if (message.role === "tool") return false;
    if (!message.content.trim()) return false;
    return true;
  });
}
```

如果 history 中存在多个 system message，本阶段允许保留，但它们必须排在 persona system message 之后。

后续如果要更严格控制 system message，可以在 Prompt 阶段再做。

### 6.12 GenerateInput 配置

阶段 3 默认只传：

```ts
await context.core.model.generate({
  messages,
});
```

不要在 `SimpleChatWorkflow` 内硬编码：

```ts
model
temperature
maxTokens
```

原因：

1. 模型配置属于 Model Runtime 或宿主配置；
2. 阶段 3 不引入 per-call 参数设计；
3. 避免 Workflow 和模型配置耦合。

如果后续确实需要，可以通过 `input.metadata` 设计白名单配置，但本阶段不做。

### 6.13 返回结构

成功返回：

```ts
return {
  text: modelOutput.text,
  model: modelOutput.model,
  raw: modelOutput.raw,
  persona,
  safety: {
    input: inputSafety,
    output: outputSafety,
  },
  metadata: {
    historyCount: sanitizedHistory.length,
    messageCount: messages.length,
    toolCallsIgnored: modelOutput.toolCalls?.length ?? 0,
  },
  modelOutput,
};
```

说明：

1. `toolCallsIgnored` 只是可观测字段；
2. 如果模型返回 toolCalls，本阶段不执行；
3. 不要把 toolCalls 转换成 Core ToolCall；
4. 阶段 6 再处理工具执行。

---

## 七、createCompanionCore 默认 Workflow 调整

### 7.1 文件位置

```txt
packages/ai-core/src/core/companion-core-factory.ts
```

### 7.2 当前状态

阶段 2 默认使用：

```ts
workflow: options.workflow ?? new DisabledChatWorkflow()
```

### 7.3 本阶段要求

阶段 3 完成后，默认应该使用：

```ts
workflow: options.workflow ?? new SimpleChatWorkflow()
```

原因：

1. 阶段 3 的目标是让 `createCompanionCore({ model })` 直接具备最小聊天能力；
2. 宿主不需要手动注入 workflow 才能跑通主链路；
3. `DisabledChatWorkflow` 仍然保留，用于特殊场景或显式禁用。

### 7.4 注意事项

修改后 `core.inspect()` 中 workflow 默认应变为：

```txt
workflow.simple-chat
```

这会改变阶段 2 demo 中默认 workflow 展示结果。

这是阶段 3 的预期变化，不是回归错误。

如果 demo 文案仍写死 `workflow.disabled`，需要同步改成动态展示实际 `inspection.providers.workflow.id`。

---

## 八、导出要求

### 8.1 文件位置

```txt
packages/ai-core/src/index.ts
```

### 8.2 新增导出

必须导出：

```ts
export * from "./implementations/workflow/simple-chat-workflow";
```

### 8.3 保留导出

继续保留：

```ts
export * from "./implementations/workflow/disabled-chat-workflow";
```

原因：

1. `SimpleChatWorkflow` 是阶段 3 默认实现；
2. `DisabledChatWorkflow` 仍是可选实现；
3. 用户可以显式注入禁用 Workflow；
4. 后续阶段可以继续新增其它 Workflow 实现。

---

## 九、Demo 应用调整

### 9.1 目标

在 `apps/model-runtime-demo` 中增加聊天主链路调试区域。

这个 demo 仍然不是正式业务 UI。

它只用于人工验证：

```txt
Model Runtime + Core Abstractions + Simple Chat Workflow
```

#### 9.1.1 客户端 / 服务端边界（必须遵守）

`createModel()` 依赖宿主从 `process.env` 读取的 API Key，**必须在服务端执行**；因此聊天主链路也必须在服务端运行，不能在客户端组件里 `import { createModel }` 或 `createCompanionCore`。

约定如下：

1. 新增一个服务端路由，例如 `apps/model-runtime-demo/app/api/chat/route.ts`（与 stage-01 的 `app/api/model-runtime/route.ts` 同级）；
2. 客户端维护短期 `history`，每次发送时把 `message` 与完整 `history` POST 给该路由；
3. 路由内部 `createModel` → `createCompanionCore` → `core.executeWorkflow`，并把结果以 JSON 返回；
4. Core 实例可在路由内按请求创建，stage-03 不要求跨请求复用（复用属于后续宿主优化，且要满足 stage-02 §4.3.1 的隔离约定）；
5. 客户端只负责渲染返回的 JSON 与维护 history，不直接触碰 model 或 Core。

建议请求 / 响应结构：

```ts
// 请求体
interface ChatRequestBody {
  message: string;
  history: ChatMessage[];
  sessionId?: string;
}

// 响应体（非流式，一次性返回）
interface ChatResponseBody {
  ok: boolean;
  output?: ChatWorkflowOutput;
  observerEvents?: CoreEvent[]; // 见 §10.4
  error?: { message: string; phase?: string };
}
```

### 9.2 demo 职责

Demo 可以做：

1. 读取环境变量；
2. 创建 model；
3. 创建 core；
4. 展示 `core.inspect()`；
5. 提供一个输入框；
6. 调用 `core.executeWorkflow()`；
7. 在页面状态中维护短期 history；
8. 展示 workflow 输出；
9. 展示 observer 事件；
10. 展示模型 runtime 信息。

Demo 不要做：

1. 不要写正式聊天 UI；
2. 不要接用户系统；
3. 不要接数据库；
4. 不要接长期记忆；
5. 不要接情绪系统；
6. 不要接工具系统；
7. 不要在 demo 里重写 Persona prompt；
8. 不要绕过 `core.executeWorkflow()` 直接调用 model。

### 9.3 demo 中创建 Core

示例：

```ts
import {
  createCompanionCore,
  createModel,
  DefaultPersonaProvider,
} from "@ying-companion/ai-core";

const model = createModel({
  apiKey,
  baseUrl,
  model: primaryModel,
  fallbackModel,
  retry: {
    primaryMaxRetries,
    fallbackMaxRetries,
  },
});

const core = createCompanionCore({
  model,
  persona: new DefaultPersonaProvider({
    id: "debug-companion",
    name: "映映",
    gender: "female",
    relationship: "AI 伴侣",
    personality: "温柔、真诚、愿意倾听",
    speakingStyle: "自然、亲近、不过度夸张",
  }),
});
```

说明：

1. 上面的 female 只是 demo 默认值，不是产品限制；
2. demo 可以提供表单修改 gender / name / personality；
3. 如果不做表单，也必须保证 Core 层支持可配置性；
4. 不要在 `SimpleChatWorkflow` 中写死这些值。

### 9.4 demo 中维护 history

示例：

```ts
const result = await core.executeWorkflow({
  sessionId: "debug-session",
  message: input,
  history,
});

setHistory((previous) => [
  ...previous,
  { role: "user", content: input },
  { role: "assistant", content: result.text },
]);
```

注意：

1. history 是 demo 状态；
2. Core 不保存；
3. 刷新页面后丢失是正常的；
4. 阶段 4 或正式业务阶段再考虑持久化。

### 9.5 demo 可观测内容

页面至少展示：

```txt
Core Initialized
Providers
Input Message
History Count
Model Raw Output
Final Output
Safety Result
Persona Result
Model Runtime Info
Observer Events
```

可以用简单 `<pre>` 展示 JSON。

不需要美观。

不需要正式聊天气泡。

---

## 十、CoreObserver 事件要求

### 10.1 必须发出的事件

阶段 3 至少要发出：

```txt
workflow:start
persona:load:start
persona:load:end
safety:input:start
safety:input:end
workflow:step
safety:output:start
safety:output:end
workflow:end
```

错误时发出：

```txt
workflow:error
```

### 10.2 workflow:step payload 建议

`workflow:step` 用于表达阶段 3 尚未专门定义的中间步骤。

例如：

```ts
await safeEmit(observer, {
  type: "workflow:step",
  timestamp: new Date(),
  payload: {
    step: "model:generate:start",
    sessionId: input.sessionId,
  },
});
```

模型返回后：

```ts
await safeEmit(observer, {
  type: "workflow:step",
  timestamp: new Date(),
  payload: {
    step: "model:generate:end",
    sessionId: input.sessionId,
    model: modelOutput.model,
    runtime: modelOutput.runtime,
  },
});
```

### 10.3 不要泄漏敏感信息

Observer payload 不要包含：

1. API Key；
2. Base URL；
3. 完整 env；
4. 未脱敏错误堆栈；
5. 任何未来可能出现的鉴权 token。

阶段 3 当前可以包含：

1. sessionId；
2. messageLength；
3. historyCount；
4. persona meta / persona id；
5. safety result；
6. model runtime；
7. final text length。

如果要展示完整 input/output 文本，建议只在 demo 页面使用本地状态展示，不通过通用 observer payload 强制携带。

### 10.4 非流式下的事件回传

由于阶段 3 主链路是非流式 `generate`，`executeWorkflow` 在**服务端**一次性执行完毕，所有 observer 事件也都在服务端产生。

因此 demo 要在页面看到事件，必须：

1. 在服务端路由内注入一个「收集型 observer」，把每个 `CoreEvent` push 进一个数组，并随 `createCompanionCore({ model, observer, persona })` 传入；
2. 请求结束后，把该数组随 `ChatResponseBody.observerEvents` 一并返回（注意 `CoreEvent.timestamp` 需序列化为字符串）；
3. 客户端拿到后渲染，而不是期望客户端能直接监听服务端事件。

注意：收集型 observer 同样要遵守 §10.3 脱敏要求，且其 `emit` 不得抛错影响主链路。

---

## 十一、错误处理策略

### 11.1 空消息

条件：

```txt
input.message.trim() === ""
```

处理：

```txt
throw new Error("ChatWorkflowInput.message is required")
```

事件：

```txt
workflow:error
```

不要调用 Persona / Safety / Model。

注意：按 §6.5 新顺序，`workflow:start` 先于 message 校验发出，因此空消息的事件序列为 `workflow:start` → `workflow:error`，不会出现没有 start 的孤立 error。

### 11.2 Persona 加载失败

处理：

1. emit `workflow:error`；
2. 抛出原错误。

不要自行创建兜底 Persona。

原因：

1. Persona 是伴侣角色基础；
2. 如果 Provider 失败，应该暴露问题；
3. 不要在 Workflow 中绕开 Provider。

### 11.3 Input Safety 拒绝

处理：

1. emit `safety:input:end`；
2. emit `workflow:error`；
3. 抛出：

```txt
Input rejected by SafetyProvider
```

不要调用模型。

### 11.4 Model 调用失败

处理：

1. 阶段 1 的 Model Runtime 内部已经负责重试 / 降级；
2. 如果 `model.generate()` 最终仍然失败，Workflow 只负责 emit `workflow:error`；
3. Workflow 不要再次实现模型重试；
4. Workflow 不要绕过 `ChatModel` 直接调用 Provider。

### 11.5 Output Safety 拒绝

处理：

1. emit `safety:output:end`；
2. emit `workflow:error`；
3. 抛出：

```txt
Output rejected by SafetyProvider
```

可以在 `workflow:error` payload 中包含：

```ts
{
  phase: "safety:output",
  reason: outputSafety.reason,
  model: modelOutput.model,
}
```

但不要返回未通过安全检查的 `modelOutput.text`。

### 11.6 Observer 错误

处理：

1. 忽略；
2. 不影响主链路；
3. 不抛出；
4. 不 console。

---

## 十二、任务拆分

### 12.1 01-simple-chat-workflow.md

#### 摘要

实现 `SimpleChatWorkflow`。

#### 做成什么样

新增：

```txt
packages/ai-core/src/implementations/workflow/simple-chat-workflow.ts
```

实现：

```txt
Persona.load
Safety.guardInput
Build Messages
Model.generate
Safety.guardOutput
Return ChatWorkflowOutput
CoreObserver events
```

#### 为什么要做

阶段 2 只有抽象与 disabled workflow，Core 还不能真正聊天。

本任务让 Core 具备最小聊天能力。

#### 怎么做

1. 新建 `SimpleChatWorkflow`；
2. 实现稳定 `meta`；
3. 实现 `execute()`；
4. 增加 `safeEmit()` 私有函数；
5. 增加 `buildPersonaSystemPrompt()` 私有函数；
6. 增加 `sanitizeHistory()` 私有函数；
7. 保证所有 import 使用现有 abstractions；
8. 不引入新的外部依赖；
9. 不调用 Memory / Emotion / Tool；
10. 不写 console。

#### 完成标准

1. `SimpleChatWorkflow` 实现 `ChatWorkflow`；
2. `meta.id === "workflow.simple-chat"`；
3. 空消息会抛错；
4. input safety 拒绝时不会调用模型；
5. output safety 拒绝时不会返回原始模型文本；
6. history 会进入 prompt；
7. tool role history 会被过滤；
8. 模型返回 toolCalls 时不会执行；
9. observer 错误不会影响聊天；
10. TypeScript 无类型错误。

### 12.2 02-default-workflow-factory.md

#### 摘要

让 `createCompanionCore({ model })` 默认使用 `SimpleChatWorkflow`。

#### 做成什么样

修改：

```txt
packages/ai-core/src/core/companion-core-factory.ts
```

从：

```ts
workflow: options.workflow ?? new DisabledChatWorkflow()
```

改为：

```ts
workflow: options.workflow ?? new SimpleChatWorkflow()
```

#### 为什么要做

阶段 3 后，Core 默认应该可以执行最小聊天链路。

#### 怎么做

1. import `SimpleChatWorkflow`；
2. 保留 `DisabledChatWorkflow` 实现文件；
3. 如果当前文件不再直接使用 `DisabledChatWorkflow`，移除无用 import；
4. 保证显式传入 `workflow` 时仍优先使用外部注入版本。

#### 完成标准

1. `createCompanionCore({ model }).inspect().providers.workflow.id` 返回 `workflow.simple-chat`；
2. 显式注入 `new DisabledChatWorkflow()` 时仍返回 `workflow.disabled`；
3. `core.executeWorkflow()` 默认可用。

### 12.3 03-export-simple-chat-workflow.md

#### 摘要

导出 `SimpleChatWorkflow`。

#### 做成什么样

修改：

```txt
packages/ai-core/src/index.ts
```

新增：

```ts
export * from "./implementations/workflow/simple-chat-workflow";
```

#### 为什么要做

宿主应用需要显式注入或替换 Workflow。

#### 怎么做

1. 检查当前 index 导出结构；
2. 新增导出；
3. 保留 `DisabledChatWorkflow` 导出。

#### 完成标准

外部可以：

```ts
import { SimpleChatWorkflow } from "@ying-companion/ai-core";
```

### 12.4 04-demo-chat-pipeline.md

#### 摘要

在 `apps/model-runtime-demo` 增加聊天主链路调试区域。

#### 做成什么样

在现有 demo 页面中增加：

1. 输入框；
2. 发送按钮；
3. history 维护；
4. `core.executeWorkflow()` 调用；
5. 输出结果展示；
6. observer events 展示。

#### 为什么要做

你当前不要求单元测试 / e2e，但每个任务完成后必须有地方看到执行结果。

阶段 3 的可观测结果应该通过 demo 页面展示，而不是在 `ai-core` 写死 console。

#### 怎么做

1. 新增服务端路由 `app/api/chat/route.ts`（见 §9.1.1）；客户端通过 fetch 调用它，不在客户端创建 model / core；
2. 在该路由内创建「收集型 observer」（见 §10.4），随 `createCompanionCore({ model, observer, persona })` 注入；
3. 路由内使用 `createModel()` 创建模型、`createCompanionCore()` 创建 core；
4. 路由内调用 `core.executeWorkflow({ sessionId, message, history })`，把 `output` 与收集到的 `observerEvents` 一起以 JSON 返回；
5. 客户端通过页面状态维护 `history`，发送消息时把 `message` 与 `history` POST 给路由；
6. 成功后把用户消息和助手回复追加到 history；
7. 展示 `result.text`、`result.modelOutput`、`result.safety`、`result.persona`、`result.metadata`；
8. 展示 `observerEvents`。

#### 完成标准

页面可以看到：

```txt
Input
Final Output
Model Raw Output
Safety Result
Persona Result
History Count
Observer Events
```

并且发送第二条消息时，第一轮 history 会传入 Core。

### 12.5 05-docs-and-acceptance.md

#### 摘要

更新阶段文档或 README 中与阶段 3 相关的验收说明。

#### 做成什么样

保持 `.requirements/stages/stage-03/03-chat-main-pipeline.md` 与实际实现一致。

如果 demo 页面上有阶段说明文案，也应同步到阶段 3。

#### 为什么要做

避免后续让 Codex / Gemini / Claude 执行时误以为阶段 3 要实现 Memory、Emotion 或 Tool。

#### 怎么做

1. 检查 demo 文案是否仍写 `workflow.disabled`；
2. 如果有，改为动态显示实际 provider id；
3. 确认阶段 3 文档与实现边界一致。

#### 完成标准

1. 文档没有暗示阶段 3 要实现 Memory / Emotion / Tool；
2. demo 没有写死旧 workflow id；
3. 验收命令清晰。

---

## 十三、验收方式

### 13.1 ai-core 类型检查

执行：

```bash
pnpm --filter @ying-companion/ai-core typecheck
```

预期：

```txt
typecheck 通过
无 TypeScript 类型错误
```

### 13.2 ai-core 构建

执行：

```bash
pnpm --filter @ying-companion/ai-core build
```

预期：

```txt
构建成功
无导出错误
```

### 13.2.1 lint 与格式检查

与 stage-02 补丁保持一致的验收门槛，执行：

```bash
pnpm --filter @ying-companion/ai-core lint
pnpm --filter @ying-companion/model-runtime-demo lint
pnpm exec prettier --check packages/ai-core/src apps/model-runtime-demo/app
```

预期：

```txt
lint 通过
prettier 格式检查通过
```

### 13.3 demo 启动

执行：

```bash
pnpm --filter @ying-companion/model-runtime-demo dev
```

打开本地页面。

预期：

```txt
模型调用正常
Core 初始化正常
workflow provider 显示 workflow.simple-chat
聊天输入可以发送
可以看到模型回复
可以看到 Persona / Safety / Model Runtime / Observer Events
```

### 13.4 手动调用验证

在 demo 或临时本地脚本中验证：

```ts
const core = createCompanionCore({ model });

console.log(core.inspect().providers.workflow.id);

const result = await core.executeWorkflow({
  sessionId: "manual-debug-session",
  message: "你好，我今天有点累。",
  history: [],
});

console.log(result.text);
console.log(result.safety);
console.log(result.persona);
console.log(result.metadata);
```

预期：

```txt
workflow.simple-chat
result.text 有内容
result.safety.input.allowed === true
result.safety.output.allowed === true
result.persona 存在
result.metadata.historyCount === 0
```

### 13.5 history 验证

连续发送两轮：

第一轮：

```txt
我叫大鱼头。
```

第二轮：

```txt
我刚才告诉你我叫什么？
```

预期：

```txt
第二轮请求会携带第一轮 history
模型有机会根据短期 history 回答“大鱼头”
```

注意：

1. 这不是长期记忆；
2. 刷新 demo 页面后丢失是正常的；
3. 阶段 4 才实现长期记忆。

### 13.6 safety 拒绝验证

如果需要验证 Safety 中断能力，可以临时在 demo 内注入一个自定义 SafetyProvider。

示例行为：

```txt
当输入包含 block 时 guardInput 返回 { allowed: false, reason: "blocked" }
```

预期：

1. 不调用模型；
2. 页面展示错误；
3. observer events 中有 `safety:input:end` 与 `workflow:error`。

该验证不要求作为常驻功能，只要实现支持即可。

---

## 十四、完成标准

本阶段完成后，需要满足：

1. 新增 `SimpleChatWorkflow`；
2. `SimpleChatWorkflow` 实现 `ChatWorkflow`；
3. `SimpleChatWorkflow.meta.id` 为 `workflow.simple-chat`；
4. `SimpleChatWorkflow` 调用 `PersonaProvider.load()`；
5. `SimpleChatWorkflow` 调用 `SafetyProvider.guardInput()`；
6. `SimpleChatWorkflow` 调用 `ChatModel.generate()`；
7. `SimpleChatWorkflow` 调用 `SafetyProvider.guardOutput()`；
8. `SimpleChatWorkflow` 使用 `ChatWorkflowInput.history`；
9. `SimpleChatWorkflow` 不保存 history；
10. `SimpleChatWorkflow` 不调用真实 Memory；
11. `SimpleChatWorkflow` 不调用真实 Emotion；
12. `SimpleChatWorkflow` 不执行 Tool Call；
13. `SimpleChatWorkflow` 不引入 LangChain；
14. `SimpleChatWorkflow` 不引入 LangGraph；
15. `SimpleChatWorkflow` 不连接数据库；
16. `SimpleChatWorkflow` 不读取环境变量；
17. `SimpleChatWorkflow` 不写死 console；
18. Observer 事件不会打断主链路；
19. 空消息不会调用模型；
20. Safety 拒绝时不会调用或返回不安全结果；
21. `createCompanionCore({ model })` 默认挂载 `SimpleChatWorkflow`；
22. 显式注入其它 workflow 时仍优先使用外部注入；
23. `core.inspect().providers.workflow.id` 默认返回 `workflow.simple-chat`；
24. `core.executeWorkflow()` 可以完成一次非流式聊天；
25. `ChatWorkflowOutput.text` 返回模型文本；
26. `ChatWorkflowOutput.modelOutput` 保留模型原始输出结构；
27. `ChatWorkflowOutput.safety` 包含输入与输出安全结果；
28. `ChatWorkflowOutput.persona` 包含加载到的 persona；
29. `ChatWorkflowOutput.metadata.historyCount` 可用于调试；
30. `ChatWorkflowOutput.metadata.toolCallsIgnored` 可用于确认阶段 3 不执行工具；
31. `packages/ai-core/src/index.ts` 导出 `SimpleChatWorkflow`；
32. `DisabledChatWorkflow` 保留；
33. `apps/model-runtime-demo` 可以展示聊天主链路结果；
34. demo 可以展示 observer events；
35. demo 不绕过 Core 直接调用 Model 完成聊天；
36. demo 不做正式业务 UI；
37. `@ying-companion/ai-core` 可以正常 `typecheck`；
38. `@ying-companion/ai-core` 可以正常 `build`；
39. `@ying-companion/model-runtime-demo` 可以启动并人工验证；
40. 阶段 1 的 generate / stream 调试能力不被破坏；
41. 阶段 2 的 `core.inspect()` 能力不被破坏；
42. demo 聊天链路通过服务端路由（如 `app/api/chat/route.ts`）执行，客户端不直接创建 model / core；
43. demo 通过响应体把 observer 事件回传并展示，而非期望客户端直接监听服务端事件；
44. Safety 拒绝统一抛错，不返回伪回复或未通过检查的模型文本；
45. `ai-core` 与 demo 的 lint / prettier 检查通过。

---

## 十五、后续阶段衔接

### 15.1 阶段 4：记忆系统

阶段 4 会在当前链路中增加：

```txt
Memory.recall
Memory.save
```

预计位置：

```txt
Persona.load
↓
Safety.guardInput
↓
Memory.recall
↓
Build Messages（加入 memories）
↓
Model.generate
↓
Safety.guardOutput
↓
Memory.save
```

阶段 3 不要提前实现这些逻辑。

### 15.2 阶段 5：情绪状态机

阶段 5 会在当前链路中增加：

```txt
Emotion.analyze
Emotion.transition
```

预计位置：

```txt
Safety.guardInput
↓
Emotion.analyze
↓
Build Messages（加入 emotion）
```

阶段 3 不要提前实现这些逻辑。

### 15.3 阶段 6：工具调用系统

阶段 6 会在当前链路中增加：

```txt
ToolRegistry.list
ModelToolCall -> ToolCall
ToolRegistry.execute
二次生成
```

阶段 3 只记录：

```txt
toolCallsIgnored
```

不要执行工具。

### 15.4 阶段 7：流程编排抽象层

阶段 7 可以把当前 `SimpleChatWorkflow` 演进为更完整的流程编排实现，或新增：

```txt
ComposedChatWorkflow
LangGraphChatWorkflow
```

但不要破坏：

```txt
ChatWorkflow.execute(input, context)
```

这个边界。

---

## 十六、给执行器的最终提醒

无论由 Codex、Gemini、Claude，还是其它 AI Coding Agent 执行，本阶段都只允许围绕以下目标工作：

```txt
实现 SimpleChatWorkflow，并让 core.executeWorkflow(input) 能完成一次非流式最小聊天。
```

不要扩大范围。

不要实现 Memory。

不要实现 Emotion。

不要实现 Tool Call。

不要引入 LangChain。

不要引入 LangGraph。

不要接数据库。

不要接用户系统。

不要把 demo 做成正式产品 UI。

如果发现阶段 1 或阶段 2 存在小的类型不匹配，可以做最小修正；但不要重写前置阶段架构。
