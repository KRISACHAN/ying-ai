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

### 与 `03-plan.md` 的关系与差异

`prompts/03-plan.md` 是 V1 **总路线图**（各阶段目标与可观测结果的索引）；本文档是阶段 7 的**可执行规格**，以当前代码为准。两者冲突时，**以本文档为准**。

`03-plan.md` 中阶段 7 的简述在编写时仍偏早期草案，与仓库现状及本文档存在以下主要差异：

1. **阶段定位**
   - `03-plan.md`：预留 LangGraph 插槽、「定义 `ChatWorkflow` 抽象」。
   - 本文档：`ChatWorkflow` 与 `SimpleChatWorkflow` 已在阶段 2～6 落地；阶段 7 是**收束编排契约**（步骤轨迹、失败语义、Observer 载荷、可替换边界），不是从零定义抽象。

2. **Workflow 实现名称**
   - `03-plan.md` 写作 `SimpleWorkflow`。
   - 本文档与代码一致：`SimpleChatWorkflow`（`workflow.simple-chat`）。

3. **默认编排顺序**
   - `03-plan.md` 列出的顺序缺少 `Persona.load`、`Summary(load/update/save)`、`ToolRegistry.list`，且将 `Persona` 隐含在 `Model.generate` 拼 prompt 中。
   - 本文档与 `simple-chat-workflow.ts` 一致：完整链路含 Persona、Summary、Memory 召回/抽取、Emotion analyze+transition、工具列表与工具循环等（见上文流程图与 §6.1）。

4. **并行优化**
   - `03-plan.md` 认为 `Persona.load` 与 `Memory.recall`、`Emotion.analyze` 可无依赖并行。
   - 本文档：Emotion 依赖 `recalledMemories`，Summary 影响 `recentHistory`；**本阶段不实现** `parallelReadSteps`，仅作类型预留。

5. **超时预算**
   - `03-plan.md` 强调单轮总超时与并行以控延迟。
   - 本文档：`timeoutMs` 本阶段仅作**计时与 trace 超预算标记**，不要求 `AbortSignal` 穿透所有 Provider。

6. **`ToolRegistry.list` 失败语义**
   - `03-plan.md` 未单独说明。
   - 本文档：与当前实现一致，归入**关键路径**（失败即终止整轮），不静默降级为「无工具」。

7. **与阶段 8 的分工**
   - `03-plan.md` 将 demo 逐步展示、调试 UI 主要放在阶段 8。
   - 本文档：demo 已具备 `observerEvents`、记忆/情绪/工具/debug 展示；阶段 7 负责 **Core 侧 trace 契约 + demo 最小验证**，阶段 8 负责 UI 产品化打磨（见 §4.3）。

实施阶段 7 时无需回头修改 `03-plan.md`；若总路线图需与现状对齐，可在全部阶段完成后统一修订。

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
8. 在 Core 侧建立步骤轨迹契约，并让 demo 能**最小验证**本轮 Workflow Step 与降级信息（完整调试 UI 留给阶段 8）；
9. 保证阶段 1～6 的行为、Provider 契约、MemoryScope 隔离方式不被破坏。

---

## 三、阶段完成标准

完成后必须满足：

1. `@ying-companion/ai-core` 可独立构建；
2. `ChatWorkflow` 仍是 `CompanionCore.executeWorkflow(input)` 的唯一执行协议；
3. 默认注入的 `SimpleChatWorkflow` 能保持阶段 3～6 已有的完整行为；
4. 当前流程顺序、工具最大轮数、Memory / Emotion / Summary 的非致命降级策略不被改变；`ToolRegistry.list` 保持关键路径语义（见 §6.3）；
5. Workflow 具备稳定 `meta`，不使用 `constructor.name` 判断实现；
6. Workflow 输出或 Observer 事件中可以获得本轮步骤轨迹；
7. 步骤轨迹不暴露 API Key、原始模型异常栈、数据库连接串、完整敏感 Prompt；
8. `ai-core` 内仍不读环境变量、不写 console、不连接 PostgreSQL；
9. `memory-postgres` 不新增编排职责；
10. 不安装 `@langchain/*`、`@langchain/langgraph` 或等价图编排依赖；
11. 不新增用户系统、鉴权、租户、商业化、部署逻辑；
12. demo 能人工验证完整工作流顺序和每一步执行结果（不要求本阶段完成调试 UI 的产品化打磨）。

---

## 四、阶段边界

### 4.1 本阶段要做

本阶段只做“编排层收束与增强”。

需要完成：

1. 审计并固化当前 `SimpleChatWorkflow` 的真实执行顺序；
2. 定义 Workflow 级别的执行计划、步骤标识和步骤状态类型；
3. 定义 Workflow 级超时预算的**输入表达与计时记录**（本阶段不实现全链路 AbortSignal 取消）；
4. 统一主链路、非致命辅助链路、写回链路的失败语义（以当前 `SimpleChatWorkflow` 行为为基线）；
5. 统一 `CoreObserver` 的 Workflow Step 事件载荷，并保留对既有 `payload.step` 的向后兼容；
6. 在 `ChatWorkflowOutput.metadata.trace` 中提供可选的步骤轨迹快照；
7. 将当前散落在 Workflow 内部的“步骤名称字符串”收束为稳定常量或类型；
8. 给未来 `LangGraphWorkflow`、`StreamingChatWorkflow`、`RemoteToolWorkflow` 留出实现替换点；
9. 更新 `packages/ai-core/README.md`，并在 demo 中做**最小**时间线 / trace 透传验证；
10. 实施前对照代码固化「改造前基线清单」（见 §6.4），实施中以此约束行为不变。

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
12. 不改变当前宿主维护 `history`、`emotion`、会话隔离标识的责任边界；
13. 不做阶段 8 范围的调试 UI 产品化（面板布局、交互打磨、完整调试工作台）。

### 4.3 与阶段 8 的边界

`03-plan.md` 将「调试 UI 与可观测输出」列为阶段 8。当前 demo 已能展示 `observerEvents`、记忆、情绪、工具与 `debugContext`。分工如下：

**阶段 7（本阶段）**

- `WorkflowStepName` / `WorkflowTrace` 等 Core 契约
- `workflow:step` 载荷规范化、`includeTrace` 开关
- Observer 向后兼容策略
- demo **最小**透传：能验证步骤顺序与 trace 即可

**阶段 8**

- 调试面板布局与交互体验
- 更完整的调试工作台（若需要）
- 多面板整合、视觉与可用性打磨

阶段 7 的成功不取决于 UI 是否精美，而取决于 Core 契约稳定、行为可验证、未来 Workflow 可替换。

### 4.4 建议实施顺序

本阶段全部在本文件内完成，不拆分子任务文件。建议按以下顺序落地：

1. 对照 `simple-chat-workflow.ts` 完成 §6.4 基线清单；
2. 新增 trace 抽象类型与内部 recorder；
3. 轻量重构 `SimpleChatWorkflow`（私有步骤 helper + 统一 trace / Observer），保持输出语义不变；
4. 补充 `workflowOptions`（`includeTrace`、`timeoutMs` 计时）；
5. demo 最小透传 trace / 时间线；
6. README 与 `MockAlternativeWorkflow` 替换验收；
7. 在 `ChatWorkflow` 注释与 README 中写明替换边界：未来新增 Workflow 仅需 `createCompanionCore({ workflow: new X() })`，不得反向修改 Provider 接口。

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
core.executeWorkflow(input);
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

### 6.2 可并行边界（本阶段不实现）

V1 **不实现** `parallelReadSteps`；以下仅作未来优化备忘。

理论上，在无数据依赖时可并行：

```txt
Persona.load
Summary.load        # 与 Persona 无直接依赖
```

但当前实现中：

- `Emotion.analyze` 依赖 `Memory.recall` 的 `recalledMemories`；
- `Summary.load` 影响 `recentHistory` 裁剪，进而影响 Emotion 输入；
- 因此「Persona + Summary + Memory 三者并行」**不是**本阶段可安全落地的 trivial 优化。

以下步骤必须保持顺序：

```txt
Safety.guardInput → Model.generate
Memory.recall → Emotion.analyze / transition → Build prompt
ToolRegistry.list → Model.generate（有工具时）
Tool.execute → follow-up generate
Safety.guardOutput → 对外返回最终文本
Model.generate → Memory.extract / save
```

`workflowOptions.parallelReadSteps` 仅为类型预留，默认 `false`，本阶段不得启用。

### 6.3 失败策略分层

策略以**当前 `SimpleChatWorkflow` 代码行为为基线**；阶段 7 只做显式标注与 trace 记录，不擅自改变既有语义。

#### 关键路径：失败即终止

```txt
Persona.load
Safety.guardInput
ToolRegistry.list                # 当前实现无 try/catch，抛错即终止整轮
Model.generate
Safety.guardOutput
```

`ToolRegistry.list` 归入关键路径的原因：现有 `listTools()` 直接 `await tools.list()`，失败会冒泡至 `workflow:error`。本阶段**不**将其改为静默降级；若未来要降级，须单独开变更并更新基线清单。

这些失败后：

1. 发射 `workflow:error`；
2. 向调用方抛出安全摘要错误；
3. 不返回未通过输出安全检查的模型文本。

#### 辅助读取路径：允许降级继续

```txt
Memory.recall
Emotion.analyze
Summary.load
```

这些失败后：

1. 发射对应失败或降级事件；
2. 在步骤轨迹中标记 `degraded`；
3. 使用当前模块约定的安全默认值继续；
4. 不让非关键增强能力阻断主聊天回复。

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

### 6.4 改造前基线清单（实施前必填）

实施阶段 7 前，须对照 `packages/ai-core/src/implementations/workflow/simple-chat-workflow.ts` 确认以下兼容面，实施中不得无意破坏：

```txt
编排顺序：Persona → Safety(input) → Summary(load) → Memory(recall)
  → Emotion → ToolRegistry.list → prompt build → Model/Tool loop
  → Safety(output) → Summary(update/save) → Memory(extract/save)

关键路径：Persona、Safety(input/output)、ToolRegistry.list、Model.generate

辅助降级：Memory.recall、Emotion.analyze、Summary.load（失败不阻断主回复）

写回路径：Summary.update/save、Memory.extract/save（失败不阻断已生成回复）

工具策略：DEFAULT_MAX_TOOL_ROUNDS = 1；非流式 generate 循环

既有 Observer：workflow:start/end/error、workflow:step、各模块 :start/:end

既有输出字段：text、memories、emotion、toolResults、metadata.debugContext 等

宿主协议：ChatWorkflowInput / ChatWorkflowOutput 主字段不变
```

验收时以本清单逐项核对：聊天输出、MemoryScope、工具轮数、宿主输入输出协议与改造前一致。

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
  /**
   * 单轮总预算（毫秒），用于计时与 trace 标记超预算风险。
   * 本阶段不实现全链路 AbortSignal 取消；未传时不改变既有行为。
   */
  timeoutMs?: number;
  /** 是否在 metadata.trace 中返回步骤轨迹；默认 false。 */
  includeTrace?: boolean;
  /**
   * 类型预留：并行读取步骤。默认 false，本阶段不实现、不启用。
   */
  parallelReadSteps?: boolean;
};
```

约束：

1. `timeoutMs` 是整个 Workflow 的**计时预算**，不是 Provider 内部模型重试预算的替代品；
2. 阶段 1 的模型重试、降级模型仍由 `ChatModel` 自己负责；
3. **本阶段不要求**以 `AbortSignal` 穿透改造所有 Provider；
4. 若某底层调用无法安全中断，超时仅须在 trace / Observer 中记录「超预算」或 `budgetExceeded: true`，**不得**伪称已取消该调用；
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
  | "model:follow-up-generate" // 工具二次生成；trace 用规范名
  | "tool:execute"
  | "safety:output"
  | "summary:save"
  | "memory:extract"
  | "memory:save";

export type WorkflowStepStatus = "success" | "skipped" | "failed" | "degraded";

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
input.workflowOptions?.includeTrace === true;
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

### 8.2 统一 Workflow Step 事件载荷与向后兼容

`workflow:step` 建议统一携带：

```ts
{
  workflowId,
  /** 规范步骤名，对应 WorkflowStepName */
  step,
  /**
   * 兼容字段：保留改造前 payload.step 原值（如 tool:model-generate-with-tools:start）。
   * 已有 demo / 宿主若按旧字符串解析，可继续读取此字段。
   */
  legacyStep?: string,
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

规范名与遗留字符串映射示例：

```txt
tool:model-generate-with-tools:start  →  step: model:generate, legacyStep 保留原值
tool:follow-up-generate:start         →  step: model:follow-up-generate
tool:list:start                       →  step: tool:list
```

要求：

1. **不得删除或重命名**已有 `payload.step` 值；新消费者优先读 `step`，旧消费者可继续读 `legacyStep` 或原 `step`；
2. `summary` 必须是可展示摘要；
3. `error.message` 必须是安全摘要；
4. `CoreObserver.emit()` 失败仍不得打断 Workflow；
5. 不为展示方便在 `ai-core` 内写 console；
6. demo 将这些事件转换为时间线（阶段 8 再做 UI 打磨）。

### 8.3 三层可观测职责（避免重复发射）

当前与阶段 7 目标下的可观测分层：

```txt
模块级事件（persona:load:start/end、memory:recall:start/end 等）
  → Provider 级细粒度，保留现有语义，不强行与 trace 逐步一一对应

workflow:step
  → Workflow 级中间步骤，供实时时间线；扩充 payload，不替代模块事件

WorkflowTrace（metadata.trace，includeTrace 时）
  → 单轮结束后的结构化快照，供调试面板静态展示
```

原则：

1. 不为同一步骤机械地连发三套等价事件；
2. 模块事件由既有 Provider 调用点保留；
3. `workflow:step` 与 `WorkflowTrace` 共享 `WorkflowStepName` 与状态枚举；
4. Observer 事件与 Trace 共享步骤定义，但不要求字节级完全相同。

### 8.4 事件与 Trace 的关系

```txt
Observer event：实时流动，可用于 UI 时间线 / 外部日志
WorkflowTrace：本轮结束后的静态快照，可用于调试面板
```

---

## 九、建议目录与文件影响范围

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
  调试相关组件                         # 最小时间线 / trace 展示（非阶段 8 级 UI 打磨）
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

## 十、验收方式

本阶段不要求新增单元测试或 E2E 测试，但必须保留可人工验证入口。

### 10.1 构建验证

至少执行：

```bash
pnpm --filter @ying-companion/ai-core build
pnpm --filter @ying-companion/model-runtime-demo dev
```

如仓库已有统一 typecheck / lint 命令，也应执行对应命令。

### 10.2 Demo 验收场景

#### 场景 A：默认完整链路

输入一条可触发记忆、情绪或工具的消息。

预期：

```txt
聊天正常回复
页面能展示步骤时间线（现有 observerEvents 或最小增强即可）
includeTrace 开启时可看到 WorkflowTrace
页面仍展示记忆、情绪、工具结果与 debugContext
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

注入可控失败 Provider（Memory / Emotion / Summary.load）。

预期：

```txt
主回复仍可得到
Workflow 状态为 degraded
失败原因有安全摘要
不会伪称记忆或情绪已成功处理
```

#### 场景 C2：工具列表加载失败

注入 `tools.list()` 会抛错的 Registry。

预期：

```txt
整轮 Workflow 失败（与当前实现一致，属关键路径）
发出 workflow:error
不应静默伪装成「无工具」
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

## 十一、与未来 LangGraph 的衔接说明

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

## 十二、阶段 7 完成后的状态

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
