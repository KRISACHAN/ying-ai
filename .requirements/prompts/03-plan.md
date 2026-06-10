# AI Companion Core V1 实施方案

> 目标：构建一个纯粹、可插拔、可演进的 AI Companion Core SDK
> 特性：Persona、记忆系统、情绪状态机、RAG、Tool Call、流程编排抽象
> 范围：本地开发，仅核心能力
> 非目标：用户系统、鉴权、部署、商业化

---

## 总体阶段规划

```txt
阶段 1：Model Runtime（AI 引擎基础）
阶段 2：Core 抽象层与依赖注入
阶段 3：聊天主链路（最小闭环）
阶段 4：记忆系统（结构化 + 向量 RAG）
阶段 5：情绪状态机
阶段 6：工具调用系统
阶段 7：流程编排抽象层
阶段 8：调试 UI 与可观测输出
```

---

## 阶段 1：Model Runtime（AI 正式引入）

### 目标

引入 LLM 能力，建立模型抽象层。

### 完成标准

- 环境变量（OPENAI_API_KEY / OPENAI_BASE_URL / OPENAI_MODEL）由**宿主应用**读取，再以参数传入 `createModel`
- `ai-core` 本身不读取环境变量
- 可调用模型生成文本（`generate`）
- 支持流式生成（`stream`）
- 支持主模型重试、降级模型与降级重试
- 返回模型运行时信息（最终使用模型、是否降级、尝试次数、安全错误摘要）
- 在独立 demo 应用 `apps/model-runtime-demo` 中可观测上述结果（不在 `ai-core` 内写死 console）

---

### 01-model-runtime.md

### 要做什么

建立：

```txt
abstractions/model.ts
implementations/model/openai.ts
factories/model.factory.ts
```

---

### 核心抽象

```ts
export interface ChatModel {
  generate(input: GenerateInput): Promise<GenerateOutput>;
  stream(input: GenerateInput): AsyncIterable<GenerateStreamChunk>;
}
```

`ChatModel` 同时作为统一 Provider 体系的一员，带稳定 `meta`。

---

### OpenAI 实现

通过 Vercel AI SDK 适配 OpenAI-compatible Provider；不直接依赖 OpenAI 官方 SDK。
模型配置由宿主以参数传入，不在实现内读取环境变量。

---

### 可观测结果

宿主 demo 读取环境变量后调用：

```ts
const model = createModel({ apiKey, baseUrl, model });
const result = await model.generate({
  messages: [{ role: "user", content: "你好" }],
});
```

在 `apps/model-runtime-demo` 页面看到流式回复、最终使用模型与重试/降级信息，则阶段 1 完成。

---

## 阶段 2：Core 抽象层

### 目标

建立可插拔架构。

### 完成标准

定义所有 Provider 接口，并提供默认实现（Disabled / Noop / Passthrough）。

---

### 02-core-abstractions.md

建立：

```txt
abstractions/
  provider.ts        # CoreProvider / CoreProviderMeta
  core-context.ts
  observer.ts
  persona.ts
  memory.ts
  emotion.ts
  tool.ts
  safety.ts
  workflow.ts
```

并新增 `core/companion-core.ts` 与 `core/companion-core-factory.ts`。

---

### 必须定义的接口

PersonaProvider
MemoryProvider
EmotionEngine
ToolProvider / ToolRegistry
SafetyProvider
ChatWorkflow
CoreObserver

每个 Provider 必须暴露稳定的 `meta: CoreProviderMeta`。

---

### 可观测结果

通过 `core.inspect()` 读取各 Provider 的 `meta` 来确认依赖注入成功：

```ts
const core = createCompanionCore({ model });
console.log(core.inspect());
```

> 不使用 `constructor.name` 识别 Provider（打包后类名会被压缩）；
> 不在 `ai-core` 内写死 console，宿主 demo 负责展示 `inspect()` 结果。

确保各能力插槽已挂载默认实现。

---

## 阶段 3：聊天主链路（最小闭环）

### 目标

实现一条完整消息生命周期。

### 完成标准

实现：

```txt
User → Model → Return
```

不含 Memory / Tool。

---

### 03-chat-main-pipeline.md

实现 `SimpleChatWorkflow`（消费 Persona / Safety / Model，调用入口 `core.executeWorkflow(input)`）：

```txt
SimpleChatWorkflow.execute()
  Persona.load
  Safety.guardInput
  History（宿主传入）
  Model.generate
  Safety.guardOutput
```

> 阶段 3 是「User → Model → Return」最小闭环。
> Memory / Emotion / Tool 调用点可走默认空实现，但验收不以记忆召回或工具成功为准；
> 完整步骤顺序（含 Memory / Emotion / Tool）在阶段 7 给出。

---

### 可观测结果

通过 `CoreObserver` 事件或宿主 demo 输出：

```txt
[Input]
[Model Raw Output]
[Final Output]
```

确认链路完整。

---

## 阶段 4：记忆系统（RAG）

### 目标

实现长期记忆 + 向量召回。

---

### 完成标准

- PostgreSQL 表结构完成
- pgvector 启用
- 能抽取记忆
- 能召回相关记忆

> **边界（硬性）**：`pg` / `pgvector` 等数据库依赖**不得进入 `packages/ai-core`**。
> 带 DB 的实现（如 `PostgresMemoryProvider`）只能作为独立实现（独立包或宿主侧），
> 通过 `MemoryProvider` 抽象注入进 Core；`ai-core` 仍保持纯 SDK、不读 env、不连库。

---

### 04-memory-system.md

### 数据结构

```txt
memories
  id
  session_id
  type
  content
  embedding
  importance
  created_at
```

---

### 实现步骤

1. 用模型抽取结构化记忆
2. 调 embedding API
3. 存入数据库
4. 聊天时向量检索
5. TopK 注入 Prompt

---

### 可观测结果

通过 `CoreObserver` 事件在 demo 展示：

```txt
[Memory Extracted]
[Embedding Vector Length]
[Memory Retrieved TopK]
```

确认召回成功。

---

## 阶段 5：情绪状态机

### 目标

实现情绪连续性。

---

### 完成标准

- 情绪识别
- 情绪持久化
- 情绪转移逻辑

---

### 05-emotion-engine.md

### 情绪类型

```txt
neutral
happy
sad
angry
anxious
affectionate
```

---

### 实现逻辑

1. 模型分析当前消息情绪
2. 根据历史状态做 transition
3. 注入 Prompt

---

### 可观测结果

通过 `CoreObserver` 事件在 demo 展示：

```txt
[Emotion Before]
[Emotion After]
[Intention Emotion Detected]
```

---

## 阶段 6：工具调用系统

### 目标

支持 function calling。

---

### 完成标准

- 注册工具
- 模型返回 tool_call
- 执行工具
- 二次生成回复

---

### 06-tool-system.md

### 默认工具

```txt
get_current_time
search_memory
get_emotion_state
```

---

### 执行流程

```txt
Model Generate
  if tool_call
    execute tool
    re-generate
```

> **范围决策**：V1 工具调用以**非流式 `generate`** 的多步循环为准。
> 流式 `stream` 一旦吐字便不再切换模型/插入工具，因此「流式 + 多步工具循环」
> 默认**不纳入 V1**，留待阶段 7 编排层处理。多步循环可复用 AI SDK 的 `stopWhen` 等能力，避免手写。

---

### 可观测结果

通过 `CoreObserver` 事件在 demo 展示：

```txt
[Tool Requested]
[Tool Executed]
[Tool Result]
```

---

## 阶段 7：流程编排抽象层

### 目标

预留 LangGraph 插槽。

---

### 完成标准

定义 ChatWorkflow 抽象。

---

### 07-workflow-layer.md

当前实现：

```txt
SimpleWorkflow
```

顺序执行：

```txt
Safety.guardInput
↓
Memory.recall          # 召回必须在拼 prompt 之前
↓
Emotion.analyze        # 情绪注入在 generate 之前
↓
Model.generate         # Persona + History + Memory + Emotion 一并拼入 prompt
↓
Tool（如有 tool_call → execute → re-generate）
↓
Safety.guardOutput
↓
Memory.save            # 保存在 generate 之后
```

说明：

1. 阶段 3 的最小闭环是本顺序的子集（仅 Persona / Safety / Model），不含 Memory / Emotion / Tool；
2. Persona.load 与 Memory.recall、Emotion.analyze 之间无数据依赖，实现时可并行以压缩单轮延迟；
3. 全开后单轮可能涉及多次串行模型调用（情绪 / 记忆抽取 / embedding / 主生成 / 工具二次生成），
   需约定单轮总超时预算与可并行步骤，避免延迟与成本失控。

---

### 可观测结果

通过 `CoreObserver` 事件在 demo 展示每个阶段：

```txt
[Workflow Step] Safety
[Workflow Step] Emotion
[Workflow Step] Memory Recall
...
```

---

## 阶段 8：调试 UI

### 目标

建立功能调试界面。

---

### 完成标准

- 输入框
- 聊天记录
- 展示记忆
- 展示情绪
- 展示 tool

---

### 可观测结果

UI 上显示：

```txt
当前情绪
召回记忆
调用工具
```

---

## 架构演进保证

当前实现：

```txt
SimpleMemoryProvider
SimpleEmotionEngine
LocalToolProvider
SimpleWorkflow
OpenAIModel
```

未来替换：

```txt
LangChainMemoryProvider
LangGraphWorkflow
RemoteToolProvider
AdvancedEmotionEngine
MultiAgentWorkflow
```

替换实现类即可，不改业务代码。

---

## 当前 V1 完成后你将拥有

- 纯 Core SDK
- 完整 Agent 生命周期
- 可插拔架构
- 本地可运行
- 可观测执行过程
- 可演进至 LangChain / LangGraph
- 可无缝接入用户系统

---

## 关键设计原则

1. 所有能力通过接口抽象
2. 不允许直接在业务层调用 OpenAI
3. Workflow 只调用抽象接口
4. Tool 注册式管理
5. Memory 与 Emotion 独立存储
6. 所有阶段通过 CoreObserver 事件 + demo 可观测，不在 `ai-core` 内写死 console

---
