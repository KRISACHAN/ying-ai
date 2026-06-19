# AI Companion Core V1 - 阶段 7：流程编排抽象层实施文档

## 文档定位

本文档用于指导实现：

```txt
.requirements/stages/stage-07/07-workflow-layer.md
```

阶段 7 的目标不是引入 LangGraph，也不是重新实现聊天、记忆、情绪或工具能力。

当前 `SimpleChatWorkflow` 已经实际承接了阶段 3～6 的完整单轮流程：

```txt
Persona
→ Safety(input)
→ Summary(load)
→ Memory(recall)
→ Emotion(analyze / transition)
→ ToolRegistry.list
→ Model.generate
→ ToolRegistry.execute / follow-up generate
→ Safety(output)
→ Summary(update / save)
→ Memory(extract / save)
```

因此阶段 7 的职责是：

```txt
把“已有能力的调用顺序、阶段边界、失败策略、可观测性”
收束为稳定的 Workflow 编排契约，
让未来替换为 LangGraphWorkflow、StreamingWorkflow、RemoteToolWorkflow 时，
不需要修改 Model / Memory / Emotion / Tool / Safety Provider 的领域接口。
```

---

## 一、前置阶段现状

当前项目已完成：

```txt
阶段 1：Model Runtime
阶段 2：Core 抽象层与依赖注入
阶段 3：聊天主链路（最小闭环）
阶段 4：记忆系统（结构化 + 向量 RAG）
阶段 5：情绪状态机
阶段 6：工具调用系统
```

当前已存在的关键事实：

1. `ai-core` 是纯 SDK：不读 `.env`、不读 `process.env`、不连接数据库、不做鉴权；
2. `ChatModel` 已支持 `generate`、`stream`、模型重试、降级模型和运行时信息；
3. `CompanionCore` 通过依赖注入装配 Provider，只有 `model` 必传；
4. `MemoryProvider` 的 PostgreSQL + pgvector 实现在 `packages/memory-postgres`，不参与聊天编排；
5. `EmotionState` 由宿主跨轮保存并通过 `ChatWorkflowInput.emotion` 传回；
6. 工具调用仅支持本地、非流式、多步 `generate` 循环；
7. `CoreObserver` 是 Core 的唯一可观测出口，`ai-core` 内不写死 console；
8. `SimpleChatWorkflow` 已经是默认 Workflow，且现有 demo 依赖其输出中的 debug 信息。

阶段 7 必须以这些已落地能力为基础，不允许按早期草案把 `SimpleChatWorkflow` 当成只有 Persona + Safety + Model 的最小实现。

---

## 二、阶段目标

阶段 7 要完成的是：

```txt
稳定 Workflow 边界 + 显式编排策略 + 可替换执行模型
```

具体包括：

1. 明确 `ChatWorkflow` 是 Core 内唯一的“单轮对话编排入口”；
2. 将当前 `SimpleChatWorkflow` 的完整流程固定为 V1 的参考编排；
3. 为流程步骤定义统一、可追踪、可展示的执行描述；
4. 让 Workflow 明确区分关键路径、降级路径、写回路径；
5. 统一 Workflow 级超时预算与步骤级时间预算的承载方式；
6. 保证未来可以新增 `LangGraphWorkflow`，但本阶段不安装、不依赖、不实现 LangGraph；
7. 保证未来可以新增流式 Workflow，但本阶段不改造现有非流式工具循环；
8. 让宿主 demo 能展示本轮实际执行了哪些 Workflow Step、每步结果及降级信息；
9. 保证阶段 1～6 的行为、Provider 契约、MemoryScope 隔离方式不被破坏。

---

## 三、阶段完成标准

完成后必须满足：

1. `@ying-companion/ai-core` 可独立构建；
2. `ChatWorkflow` 仍是 `CompanionCore.executeWorkflow(input)` 的唯一执行协议；
3. 默认注入的 `SimpleChatWorkflow` 能保持阶段 3～6 已有的完整行为；
4. 当前流程顺序、工具最大轮数、Memory / Emotion 的非致命降级策略不被改变，除非本文档明确规定；
5. Workflow 具备稳定 `meta`，不使用 `constructor.name` 判断实现；
6. Workflow 输出或 Observer 事件中可以获得本轮步骤轨迹；
7. 步骤轨迹不暴露 API Key、原始模型异常栈、数据库连接串、完整敏感 Prompt；
8. `ai-core` 内仍不读环境变量、不写 console、不连接 PostgreSQL；
9. `memory-postgres` 不新增编排职责；
10. 不安装 `@langchain/*`、`@langchain/langgraph` 或等价图编排依赖；
11. 不新增用户系统、鉴权、租户、商业化、部署逻辑；
12. demo 能人工验证完整工作流顺序和每一步执行结果。

---

## 四、阶段边界

### 4.1 本阶段要做

本阶段只做“编排层收束与增强”。

需要完成：

1. 审计并固化当前 `SimpleChatWorkflow` 的真实执行顺序；
2. 定义 Workflow 级别的执行计划、步骤标识和步骤状态类型；
3. 定义 Workflow 级超时预算的输入表达；
4. 定义步骤级可选超时配置，但默认不开启破坏性中断；
5. 统一主链路、非致命辅助链路、写回链路的失败语义；
6. 统一 `CoreObserver` 的 Workflow Step 事件载荷；
7. 在 `ChatWorkflowDebugContext` 中补充安全的步骤轨迹快照；
8. 将当前散落在 Workflow 内部的“步骤名称字符串”收束为稳定常量或类型；
9. 给未来 `LangGraphWorkflow`、`StreamingChatWorkflow`、`RemoteToolWorkflow` 留出实现替换点；
10. 更新 `packages/ai-core/README.md` 和 demo 调试展示说明。

### 4.2 本阶段不做

本阶段明确不做：

1. 不引入 LangGraph；
2. 不引入 LangChain；
3. 不实现图节点、条件边、checkpoint、interrupt、human-in-the-loop；
4. 不实现多 Agent；
5. 不实现远程 Tool Call、MCP Client、MCP Server；
6. 不实现流式工具调用；
7. 不实现可恢复工作流、任务队列、后台任务；
8. 不新增数据库表；
9. 不把 Summary、Memory、Emotion 状态改为由 Core 内部持久化；
10. 不新增 PromptProvider 或第二套 Prompt 系统；
11. 不以“抽象”为名大规模拆散 `SimpleChatWorkflow`，导致阶段 3～6 的调试上下文、事件、输出字段失效；
12. 不改变当前宿主维护 `history`、`emotion`、会话隔离标识的责任边界。

---

## 五、核心设计原则

### 5.1 Workflow 是编排者，不是能力实现者

Workflow 可以决定：

```txt
什么时候调用 Provider
调用顺序是什么
失败后是否继续
结果如何组合
事件如何发射
```

Workflow 不应该实现：

```txt
向量检索 SQL
Embedding HTTP 请求
情绪识别模型 Prompt 的领域逻辑
工具参数校验的领域逻辑
模型供应商 SDK 适配
数据库连接管理
```

这些职责仍属于各自 Provider 或适配包。

### 5.2 不为未来 LangGraph 伪造图抽象

阶段 7 需要的是可替换的 `ChatWorkflow` 实现，不是提前自建一个简化版 LangGraph。

正确演进方式：

```txt
V1：SimpleChatWorkflow implements ChatWorkflow
V2：LangGraphWorkflow implements ChatWorkflow
V3：StreamingChatWorkflow implements ChatWorkflow
```

宿主继续只调用：

```ts
core.executeWorkflow(input)
```

而不是让宿主感知 Graph State、Node、Edge 或 LangGraph 类型。

### 5.3 Workflow 必须保持无状态

Workflow 实例不能在字段中缓存：

```txt
history
sessionId
emotion
memory scope
模型消息
工具结果
```

每轮运行所需数据都来自：

```txt
ChatWorkflowInput
+ ChatWorkflowExecutionContext
```

这样未来多个用户、多个伴侣、多个会话可以通过宿主传入的 `sessionId` / `scope` 隔离，而不发生实例级串数据。

### 5.4 调试信息必须可观测但不能泄密

需要展示：

```txt
步骤名称
开始时间 / 结束时间 / 耗时
状态：success / skipped / failed / degraded
模型是否降级
召回数量
工具调用数量
写回是否成功
```

不得默认展示：

```txt
API Key
完整 provider 原始错误
数据库连接信息
完整 system prompt
未经脱敏的工具参数
未经脱敏的用户隐私文本
```

现有 `debugContext.systemPrompt` 只可用于本地调试 demo；新增轨迹结构不得扩大其对正式宿主 API 的默认暴露范围。

---

## 六、V1 参考编排模型

### 6.1 主流程

阶段 7 固化的默认非流式流程：

```txt
workflow:start
↓
Persona.load
↓
Safety.guardInput
↓
Summary.load                     （可选）
↓
Memory.recall                    （可选，非致命）
↓
Emotion.analyze / transition     （可选，非致命）
↓
ToolRegistry.list                （可选）
↓
Build prompt / messages
↓
Model.generate
↓
Tool loop                        （可选，最多受配置限制）
↓
Safety.guardOutput
↓
Summary.update / save            （可选，写回路径）
↓
Memory.extract / save            （可选，写回路径）
↓
workflow:end
```

### 6.2 可并行边界

V1 不要求立刻并行化，但必须明确未来可并行范围：

```txt
Persona.load
Memory.recall
Summary.load
```

三者在没有相互数据依赖时可并行。

但以下步骤必须保持顺序：

```txt
Safety.guardInput → Model.generate
Memory.recall → Build prompt
Emotion.analyze / transition → Build prompt
Tool.execute → follow-up generate
Safety.guardOutput → 对外返回最终文本
Model.generate → Memory.extract / save
```

阶段 7 默认先以“行为正确、轨迹清晰”为优先级；并行优化只能在不改变输出语义、不吞掉异常、不破坏 Observer 顺序可读性的前提下实施。

### 6.3 失败策略分层

#### 关键路径：失败即终止

```txt
Persona.load
Safety.guardInput
Model.generate
Safety.guardOutput
```

这些失败后：

1. 发射 `workflow:error`；
2. 向调用方抛出安全摘要错误；
3. 不返回未通过输出安全检查的模型文本。

#### 辅助读取路径：允许降级继续

```txt
Memory.recall
Emotion.analyze
Summary.load
ToolRegistry.list
```

这些失败后：

1. 发射对应失败或降级事件；
2. 在步骤轨迹中标记 `degraded`；
3. 使用当前模块约定的安全默认值继续；
4. 不让非关键增强能力阻断主聊天回复。

注意：ToolRegistry.list 是否允许降级，应以现有实现语义为准；不能把“工具列表加载失败”静默伪装成“没有工具”。需要有可观测记录。

#### 写回路径：不影响本轮已生成回复

```txt
Summary.update / save
Memory.extract / save
```

这些失败后：

1. 本轮最终回复仍可返回；
2. 在轨迹中标记 `failed` 或 `degraded`；
3. Observer 必须保留安全错误摘要；
4. 不得误报记忆或摘要已成功写入。

---

## 七、接口与类型设计

### 7.1 保持既有主入口不变

不得修改宿主当前调用方式：

```ts
const result = await core.executeWorkflow({
  sessionId,
  message,
  history,
  emotion,
  scope,
  summaryScope,
  conversationId,
  messageIds,
  memoryOptions,
  summaryOptions,
});
```

`ChatWorkflow.execute(input, context)` 仍是唯一执行协议。

### 7.2 新增 Workflow 运行选项

建议在 `ChatWorkflowInput` 中新增可选字段：

```ts
workflowOptions?: {
  /** 单轮总预算；未传时不主动中断既有行为。 */
  timeoutMs?: number;
  /** 是否在 DebugContext 中返回步骤轨迹；默认 false。 */
  includeTrace?: boolean;
  /** V1 预留；默认 false，不启用实验性并行。 */
  parallelReadSteps?: boolean;
};
```

约束：

1. `timeoutMs` 是整个 Workflow 的预算，不是 Provider 内部模型重试预算的替代品；
2. 阶段 1 的模型重试、降级模型仍由 `ChatModel` 自己负责；
3. V1 不要求以 AbortSignal 改造所有 Provider；
4. 若暂时无法安全中断某个底层调用，超时至少必须被记录为“预算超出风险”，不能伪称已取消；
5. 未传 `workflowOptions` 时，阶段 3～6 的现有表现必须保持不变。

### 7.3 新增步骤轨迹领域类型

建议在 `abstractions/workflow.ts` 或独立 `abstractions/workflow-trace.ts` 定义：

```ts
export type WorkflowStepName =
  | "persona:load"
  | "safety:input"
  | "summary:load"
  | "memory:recall"
  | "emotion:analyze"
  | "tool:list"
  | "prompt:build"
  | "model:generate"
  | "tool:execute"
  | "safety:output"
  | "summary:save"
  | "memory:extract"
  | "memory:save";

export type WorkflowStepStatus =
  | "success"
  | "skipped"
  | "failed"
  | "degraded";

export interface WorkflowStepTrace {
  step: WorkflowStepName;
  status: WorkflowStepStatus;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  summary?: Record<string, unknown>;
  error?: {
    code?: string;
    message: string;
  };
}

export interface WorkflowTrace {
  workflowId: string;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  steps: WorkflowStepTrace[];
  status: "success" | "failed" | "degraded";
}
```

约束：

1. 时间字段使用可序列化字符串或毫秒数；
2. `summary` 只允许安全、有限、面向调试的摘要；
3. 不允许将 `raw` 模型输出、完整消息、完整数据库错误直接塞入 trace；
4. `workflowId` 可以由本轮执行生成，不得假设其等于 userId / sessionId / conversationId；
5. 类型必须只依赖 abstractions，不 import 具体实现。

### 7.4 输出兼容策略

在 `ChatWorkflowOutput.metadata` 中新增：

```ts
trace?: WorkflowTrace;
```

但仅当：

```ts
input.workflowOptions?.includeTrace === true
```

时返回完整 trace。

无论是否返回 trace，Observer 事件都应完整发射，以供 demo 或宿主实时消费。

这样可以避免把调试负担变成正式调用的固定响应体成本。

---

## 八、CoreObserver 事件规范

### 8.1 保持既有事件兼容

不得删除或重命名已有事件：

```txt
workflow:start
workflow:step
workflow:end
workflow:error
persona:load:start / end
safety:input:start / end
safety:output:start / end
memory:* 
emotion:* 
tool:*
summary:*
```

阶段 7 只允许在不破坏已有消费者的前提下扩充 payload。

### 8.2 统一 Workflow Step 事件载荷

`workflow:step` 建议统一携带：

```ts
{
  workflowId,
  step,
  phase: "start" | "end" | "skipped" | "failed" | "degraded",
  sessionId?,
  durationMs?,
  summary?,
  error?: {
    code?: string;
    message: string;
  },
}
```

要求：

1. `summary` 必须是可展示摘要；
2. `error.message` 必须是安全摘要；
3. `CoreObserver.emit()` 失败仍不得打断 Workflow；
4. 不为展示方便在 `ai-core` 内写 console；
5. demo 将这些事件转换为时间线 UI 或 console panel。

### 8.3 事件与 Trace 的关系

```txt
Observer event：实时流动，可用于 UI 时间线 / 外部日志
WorkflowTrace：本轮结束后的静态快照，可用于调试面板
```

两者共享步骤名称与状态定义，但不要求字节级完全相同。

---

## 九、实施任务拆分

### 09-01-workflow-baseline-audit.md

#### 目标

确认现有 `SimpleChatWorkflow` 的实际行为与阶段 3～6 文档一致，并列出不可破坏的兼容面。

#### 要做

1. 对照当前代码梳理实际顺序；
2. 标记关键路径、非致命辅助路径、写回路径；
3. 标记已存在的 Observer 事件；
4. 标记已存在的 debugContext 字段；
5. 输出一份“阶段 7 改造前基线清单”。

#### 完成标准

任何后续改动都能以该清单确认：

```txt
聊天输出未变化
MemoryScope 未变化
工具轮数策略未变化
宿主输入输出协议未变化
```

#### 可观测结果

在 demo 或本地开发日志中可看到一次完整聊天的现有事件序列和最终 `ChatWorkflowOutput` 摘要。

---

### 09-02-workflow-trace-contract.md

#### 目标

定义稳定的 Workflow Step、状态、Trace 类型和 Observer payload 约定。

#### 要做

1. 新增 `WorkflowStepName`、`WorkflowStepStatus`、`WorkflowStepTrace`、`WorkflowTrace`；
2. 为 Workflow 设计内部 trace recorder；
3. 统一安全错误摘要生成方式；
4. 明确哪些字段可以进入 `summary`；
5. 保证 abstractions 不依赖 implementations。

#### 完成标准

`SimpleChatWorkflow` 可以在不改变核心输出语义的前提下记录：

```txt
每步开始
每步结束
每步耗时
成功 / 跳过 / 降级 / 失败
```

#### 可观测结果

当 `includeTrace: true` 时，demo 可以显示类似：

```txt
Persona.load      success   3ms
Safety.input      success   0ms
Memory.recall     success   126ms  recalled=3
Emotion.analyze   degraded  80ms   fallback=neutral
Model.generate    success   980ms  model=gpt-...
Tool.execute      success   4ms    count=1
Memory.save       success   215ms  saved=2
```

---

### 09-03-simple-workflow-refactor.md

#### 目标

在不改变阶段 3～6 既有行为的前提下，把 `SimpleChatWorkflow` 的流程结构收束为清晰步骤。

#### 要做

1. 只抽取私有步骤函数或内部 helpers；
2. 每个步骤统一写 trace 与 Observer；
3. 将重复步骤名字符串改为常量或受限类型；
4. 统一步骤开始、结束、降级、失败的事件发射；
5. 保持现有 Provider 调用顺序和现有输出字段。

#### 严格限制

1. 不把每个步骤强行拆成独立 package；
2. 不让 Workflow 反向依赖 `memory-postgres`；
3. 不让 Provider 感知 WorkflowTrace；
4. 不改写 Model / Memory / Emotion / Tool 抽象；
5. 不在本任务引入并行执行。

#### 完成标准

旧调用：

```ts
core.executeWorkflow(input)
```

仍然可用；旧 demo 的聊天、记忆、情绪、工具展示仍然正常；仅在显式启用 trace 时多出调试数据。

#### 可观测结果

demo 中可以同时看到：

```txt
实时 Observer 时间线
+ 本轮结束后的 WorkflowTrace
+ 原有 memories / emotion / toolResults / debugContext
```

---

### 09-04-workflow-budget-and-degradation.md

#### 目标

为单轮流程建立可解释的预算与降级语义，但不提前实现复杂取消系统。

#### 要做

1. 支持 `workflowOptions.timeoutMs` 的配置表达；
2. 在 Trace 中记录总耗时和超预算风险；
3. 定义关键路径、辅助路径、写回路径的错误处理策略；
4. 让非致命能力的降级原因能在 Observer / Trace 中展示；
5. 不覆盖模型自身的 retry / fallback 行为。

#### 完成标准

当记忆召回、情绪分析、摘要更新等辅助能力失败时：

```txt
主聊天仍可成功
Trace 标为 degraded 或 failed
最终回复不会谎称对应能力已执行成功
```

当 Safety 或 Model 主生成失败时：

```txt
Workflow 失败
发出 workflow:error
调用方收到安全摘要错误
```

#### 可观测结果

通过故意使用一个失败的测试 Provider，可在 demo 中看到：

```txt
Memory.recall  degraded
Emotion.analyze degraded
Model.generate success
Workflow       degraded
```

或：

```txt
Safety.input failed
Workflow    failed
```

---

### 09-05-workflow-extension-contract.md

#### 目标

给未来实现提供明确替换契约，避免未来接 LangGraph 时反向污染既有 Provider。

#### 要做

1. 在 `ChatWorkflow` 文档注释中明确替换边界；
2. 在 README 中给出未来实现示例：

```ts
class LangGraphWorkflow implements ChatWorkflow {
  readonly meta = ...;
  async execute(input, context) {
    // 将 input + context 映射成 graph state
    // 图内部调用既有 Provider
    // 返回 ChatWorkflowOutput
  }
}
```

3. 明确未来 Graph State 属于 Workflow 内部，不得替代 Core 领域接口；
4. 明确 `MemoryProvider`、`EmotionEngine`、`ToolRegistry`、`SafetyProvider` 仍通过 `ChatWorkflowExecutionContext` 注入；
5. 明确未来远程工具、流式工作流也必须实现或适配回 `ChatWorkflow`。

#### 完成标准

未来新增 Workflow 只需要：

```ts
createCompanionCore({
  model,
  workflow: new AnotherWorkflow(),
});
```

不要求修改：

```txt
CompanionCore 主入口
MemoryProvider 接口
EmotionEngine 接口
ToolRegistry 接口
PostgresMemoryProvider
宿主当前输入输出协议
```

#### 可观测结果

demo 或示例代码可切换：

```txt
SimpleChatWorkflow
MockAlternativeWorkflow
```

并通过 `core.inspect()` 与 `workflow.meta` 明确看到当前生效实现。

---

## 十、建议目录与文件影响范围

阶段 7 预计涉及：

```txt
packages/ai-core/src/
  abstractions/
    workflow.ts
    workflow-trace.ts                 # 可新增
    observer.ts                       # 仅扩充兼容 payload 类型

  implementations/workflow/
    simple-chat-workflow.ts
    workflow-trace-recorder.ts        # 可新增，内部实现
    workflow-step.ts                  # 可新增，步骤常量 / helper

  core/
    companion-core.ts                 # 仅在确有必要时维持入口透传

  index.ts                            # 导出新的抽象类型

packages/ai-core/README.md

apps/model-runtime-demo/
  app/api/chat/route.ts               # 透传 includeTrace 等调试选项
  调试面板组件                         # 展示 Workflow 时间线与 Trace
```

不应涉及：

```txt
packages/memory-postgres/src/
  postgres-memory-provider.ts
  openai-embedding-provider.ts

数据库 migration
用户系统
鉴权模块
部署配置
```

除非发现阶段 7 的 Trace 必须消费 memory provider 已有的安全摘要；即使如此，也应优先通过 `MemoryProvider` 返回结构或 Observer payload 解决，而不是让存储包理解 Workflow。

---

## 十一、验收方式

本阶段不要求新增单元测试或 E2E 测试，但必须保留可人工验证入口。

### 11.1 构建验证

至少执行：

```bash
pnpm --filter @ying-companion/ai-core build
pnpm --filter @ying-companion/model-runtime-demo dev
```

如仓库已有统一 typecheck / lint 命令，也应执行对应命令。

### 11.2 Demo 验收场景

#### 场景 A：默认完整链路

输入一条可触发记忆、情绪或工具的消息。

预期：

```txt
聊天正常回复
页面展示步骤时间线
页面展示最终 trace
页面仍展示记忆、情绪、工具结果
```

#### 场景 B：无可选 Provider

使用默认 Noop / Disabled / Empty Provider。

预期：

```txt
核心聊天可用
相关步骤显示 skipped 或空结果
不应误报为失败
```

#### 场景 C：记忆或情绪辅助能力失败

注入可控失败 Provider。

预期：

```txt
主回复仍可得到
Workflow 状态为 degraded
失败原因有安全摘要
不会伪称记忆或情绪已成功处理
```

#### 场景 D：模型主生成失败

使用可控失败模型或无效配置。

预期：

```txt
模型内部重试 / fallback 信息仍按阶段 1 输出
最终失败时 Workflow 发出 workflow:error
调用方收到安全摘要错误
```

#### 场景 E：替换 Workflow

注入一个最小 `MockAlternativeWorkflow`。

预期：

```txt
core.executeWorkflow(input) 仍可调用
core.inspect() 显示新的 workflow.meta
不需要改动其他 Provider
```

---

## 十二、与未来 LangGraph 的衔接说明

阶段 7 完成后，并不意味着项目已经需要 LangGraph。

当前 V1 的价值是先明确：

```txt
输入是什么
状态由谁持有
Provider 如何注入
步骤如何观测
失败如何降级
最终输出如何稳定返回
```

当未来出现以下真实需求时，再引入 LangGraph：

```txt
多个条件分支
流程中断与恢复
人工确认节点
可持久化 checkpoint
长期运行任务
多 Agent 协作
复杂的工具路由
```

届时推荐新增：

```txt
LangGraphWorkflow implements ChatWorkflow
```

其内部负责：

```txt
ChatWorkflowInput + ChatWorkflowExecutionContext
→ Graph State
→ Nodes / Edges
→ ChatWorkflowOutput
```

而不是让：

```txt
MemoryProvider 依赖 LangGraph
EmotionEngine 依赖 LangGraph
ToolRegistry 依赖 LangGraph
宿主直接调用 LangGraph API
```

这才是“后续替换实现、不做破坏性改造”的真正边界。

---

## 十三、阶段 7 完成后的状态

完成阶段 7 后，AI Companion Core V1 将具备：

```txt
可替换的模型层
可替换的 Persona / Memory / Emotion / Tool / Safety Provider
真实 PostgreSQL + pgvector 记忆适配能力
完整非流式单轮 Agent 流程
结构化情绪连续性
本地工具调用循环
模型重试与降级
统一 Workflow 编排边界
步骤级可观测性与安全 Trace
未来接入 LangGraph 的稳定替换点
```

但它仍然不是：

```txt
用户产品
鉴权服务
多租户 SaaS
远程工具平台
多 Agent 平台
LangGraph 应用
```

阶段 7 的成功标准不是“架构看起来更复杂”，而是：

> 任何一个后续 Workflow 实现，都能在不破坏现有 Core Provider 边界和宿主调用协议的前提下接入。
