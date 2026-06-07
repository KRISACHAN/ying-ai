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

- 能读取环境变量：
  - OPENAI_API_KEY
  - OPENAI_BASE_URL
  - OPENAI_MODEL

- 可调用模型生成文本
- 控制台打印模型输出

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
}
```

---

### OpenAI 实现

读取环境变量创建实例。

---

### 可观测结果

运行：

```ts
const model = createModel();
const result = await model.generate({
  messages: [{ role: "user", content: "你好" }],
});

console.log(result.text);
```

如果控制台打印出回复，则阶段 1 完成。

---

## 阶段 2：Core 抽象层

### 目标

建立可插拔架构。

### 完成标准

定义所有 Provider 接口。

---

### 02-core-abstractions.md

建立：

```txt
abstractions/
  memory.ts
  emotion.ts
  tool.ts
  safety.ts
  workflow.ts
```

---

### 必须定义的接口

MemoryProvider
EmotionEngine
ToolProvider
SafetyProvider
ChatWorkflow

---

### 可观测结果

在入口处打印：

```ts
console.log("MemoryProvider loaded:", memory.constructor.name);
console.log("EmotionEngine loaded:", emotion.constructor.name);
```

确保依赖注入成功。

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

实现 ChatService：

```txt
chat()
  guardInput
  model.generate
  guardOutput
```

---

### 可观测结果

console 输出：

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

聊天时 console 输出：

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

console 输出：

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

---

### 可观测结果

console 输出：

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
Safety
Emotion
Memory
Tool
Generate
Save
```

---

### 可观测结果

console 输出每个阶段：

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
6. 所有阶段必须有 console 观测点

---
