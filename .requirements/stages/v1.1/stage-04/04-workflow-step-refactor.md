# AI Companion Core V1.1 - 阶段 4：SimpleChatWorkflow 步骤函数化重构实施文档

## 一、阶段目标

在不实现用户可见流式输出、不改动 HTTP / NDJSON、不接入 Ollama 的前提下，重构 `packages/ai-core` 的 `SimpleChatWorkflow`。

本阶段必须完成：

1. 将当前单体 `execute()` 拆为共享步骤函数；
2. 保留 V1.0 的 Trace、CoreObserver、Safety、Summary、Memory、Emotion 降级语义；
3. 将阶段 3 已完成的 `ToolPlanningProvider` 接入 `execute()` 主链路；
4. 分离“工具规划”和“最终面向用户的自然语言回复”；
5. 为阶段 5 的 `stream()` 建立可复用步骤边界，避免两条路径漂移。

本阶段交付：

```txt
共享工作流步骤函数
+ 单请求 WorkflowExecutionState
+ Tool Planning → Tool Execute → Final Generate 的非流式链路
+ 行为保持兼容的 executeWorkflow 重构
```

本阶段不是流式聊天实现阶段。不得调用 `ChatModel.stream()`，不得产生 `text:delta`、NDJSON、HTTP 字节流或 React 流式 UI。

---

## 二、前置基线

阶段 1 已完成 Persona Profile：

```txt
CompanionPersona
├── userDisplayName
├── userAddress
├── profile.hobbies
└── appearance

buildPersonaPrompt()
normalizeCompanionPersona()
ChatWorkflowDebugContext.personaPrompt
```

阶段 2 已冻结：

```txt
executeWorkflow() / streamWorkflow()
ChatWorkflow.stream?()
ChatWorkflowStreamEvent
Core Event / Wire Event 分离
```

阶段 3 已完成：

```txt
ModelProfile / ModelCapabilities
RequiredModelCapabilities
ToolPlanningProvider
ToolPlan = no_tool | tool_calls
```

阶段 4 必须使用以上既有契约，禁止重新定义 Persona、Stream Event、Model Profile 或 Tool Plan。

当前 `SimpleChatWorkflow.execute()` 仍是单体长方法，顺序为：

```txt
Persona → Input Safety → Summary Load → Memory Recall
→ Emotion → Prompt → Tool List → Model/Tool loop
→ Output Safety → Summary Save → Memory Extract/Save
```

---

## 三、完成标准

- `SimpleChatWorkflow.execute()` 与 `CompanionCore.executeWorkflow()` 的公开签名不变；
- 本阶段不实现真实 `stream()`，不调用 `ChatModel.stream()`；
- 原有 Trace、CoreObserver、timeout、成功 / skipped / degraded / failed 语义可追踪；
- Input / Output Safety 拒绝仍终止工作流，不返回伪回复；
- Summary、Memory、Emotion 的可恢复失败仍降级，不打断可信回复；
- Persona、Safety、Summary、Memory、Emotion、Prompt、Tool、Writeback 都有独立共享步骤函数；
- `ToolPlanningProvider` 已接入 `execute()`；
- 工具规划只返回 `no_tool` 或 `tool_calls`，不生成用户可见自然语言；
- 最终用户回答只由一次 final `ChatModel.generate()` 生成；
- final generate 不再传入 `tools`，避免模型再次自行决定未规划工具；
- `ChatWorkflowOutput` 保持 V1.0 字段兼容；
- `ai-core` 仍不读环境变量、不依赖数据库、HTTP、Next.js、React、Demo 或 Ollama SDK；
- `ai-core` typecheck、lint、build 通过；
- 完成本文件人工验收，并将结果写入 `.code-reviews/v1.1/`。

---

## 四、范围与非目标

### 本阶段必须做

```txt
1. 建立 WorkflowExecutionState
2. 抽取 execute() 中的共享步骤函数
3. 接入 ToolPlanningProvider
4. 改为规划后执行工具
5. 保留最终非流式 ChatModel.generate()
6. 保持 Trace / Observer / Debug Context
7. 完成回归验收与 Review
```

### 本阶段明确不做

```txt
- ChatWorkflow.stream() 真实实现
- ChatModel.stream()
- text:delta / ChatWorkflowStreamEvent 输出
- NDJSON、POST + fetch、Route、React 流式 UI
- Ollama Adapter
- AbortSignal、取消、断线恢复
- 多轮规划 → 执行 → 再规划
- 用户系统、鉴权、Persona Core 持久化 Provider
```

---

## 五、目录与职责

```txt
packages/ai-core/src/
├── abstractions/
│   ├── workflow.ts
│   ├── workflow-trace.ts
│   └── tool-planning.ts
└── implementations/workflow/
    ├── simple-chat-workflow.ts
    ├── workflow-execution-state.ts   # 可选：本次执行状态
    ├── workflow-steps.ts             # 可选：共享步骤函数
    └── workflow-trace-recorder.ts

.code-reviews/v1.1/
└── stage-04-workflow-step-refactor-review.md
```

职责约束：

```txt
SimpleChatWorkflow
→ 只负责初始化、顺序编排、异常收口。

步骤函数
→ 一个步骤只完成一件事，维护本步骤 Trace / Observer 语义。

WorkflowExecutionState
→ 只保存本次请求的中间结果；不得保存到 Workflow 实例字段，不得跨请求复用。

ToolPlanningProvider
→ 只输出 no_tool 或 tool_calls；不得输出用户可见回复。
```

---

## 六、重构原则

### 6.1 共享步骤，而不是复制两套工作流

禁止为未来 `stream()` 复制一套完整业务逻辑：

```ts
// 禁止
async execute() { /* 一整套流程 */ }
async *stream() { /* 再复制一整套流程 */ }
```

应形成：

```txt
execute()
→ 共享步骤函数
→ 完整 ChatWorkflowOutput

阶段 5 stream()
→ 复用同一批共享步骤
→ 仅将 Final Generate 改为 ChatModel.stream()
```

### 6.2 不允许用 `streamWorkflow()` 反向实现 `executeWorkflow()`

阶段 2 已冻结双路 API。`execute()` 必须保持独立、稳定的完整输出语义。

### 6.3 不要把所有步骤误写成 `ChatModel.generate()`

```txt
Safety:input       → SafetyProvider.guardInput()
Summary:load       → SummaryProvider.load()
Memory:recall      → MemoryProvider.recall()，内部可能使用 EmbeddingProvider
Emotion            → EmotionEngine，具体实现可能使用模型
Tool:plan          → ToolPlanningProvider，默认实现可能使用模型
Tool:execute       → ToolRegistry / ToolProvider
Final response     → ChatModel.generate()（阶段 4）
Safety:output      → SafetyProvider.guardOutput()
Summary:update     → SummaryUpdater / SummaryProvider
Memory:extract/save→ MemoryExtractor / MemoryProvider
```

---

## 七、共享执行状态

推荐概念结构：

```ts
interface WorkflowExecutionState {
  input: ChatWorkflowInput;
  sessionId?: string;
  memoryScope?: MemoryScope;
  summaryScope?: SummaryScope;
  recorder: WorkflowTraceRecorder;

  persona?: CompanionPersona;
  sanitizedHistory: ChatMessage[];
  recentHistory: ChatMessage[];
  summary?: ConversationSummary | null;
  recalledMemories: RecalledMemory[];
  emotion?: EmotionState;

  prompt?: {
    persona: CompanionPersona;
    personaPrompt: string;
    systemPrompt: string;
    summaryContext?: string;
    memoryContext?: string;
    emotionContext?: string;
  };

  toolDefinitions: ToolDefinition[];
  toolPlan?: ToolPlan;
  toolResults: ToolResult[];
  modelOutput?: GenerateOutput;
  outputSafety?: SafetyResult;
  updatedSummary?: ConversationSummary | null;
  extractedMemories?: ExtractedMemory[];
  degraded: WorkflowDegradation[];
}
```

约束：

```txt
- 每次 execute() 创建新 state；
- state 不跨 session、用户或请求复用；
- Provider 实例继续从 ChatWorkflowExecutionContext 获取，不塞入 state；
- Output 与 Debug Context 必须从 state 构建，不允许最后重新查询 Provider 补数据；
- 不允许 [key: string]: unknown 形式的无边界状态对象。
```

---

## 八、共享步骤规范

### 8.1 Persona / Input Safety / Summary / Memory / Emotion

必须分别抽为步骤函数，并保留 V1.0 行为：

```txt
runPersonaStep
→ PersonaProvider.load()；失败终止工作流。

runInputSafetyStep
→ guardInput()；拒绝终止工作流，禁止后续 Tool / Generate / Writeback。

runSummaryLoadStep
→ 保持 summaryOptions、scope、history trim；load 失败 degraded。

runMemoryRecallStep
→ 保持 memoryOptions、scope、embedding 语义；失败 degraded。

runEmotionStep
→ 保持 previous / detected / next 与中性降级语义；失败 degraded。
```

每一步必须通过既有 `runWorkflowStep()` 或等价封装维护 Trace 与 Observer。

### 8.2 Prompt 与 Tool List

```txt
runPromptBuildStep
→ 复用阶段 1 的 buildPersonaSystemPrompt()；生成 personaPrompt、systemPrompt、上下文分区。
→ 不调用 ChatModel.generate()。

runToolListStep
→ ToolRegistry.list()。
→ 无工具不是失败。
```

Demo 不得复制 Prompt 拼接；本步骤生成的 `personaPrompt` / `systemPrompt` 必须进入 Debug Context。

### 8.3 Tool Planning

新增：

```txt
tool:plan
```

规则：

```txt
无工具定义
→ { type: "no_tool" }
→ Trace skipped(no_tools)

未注入 ToolPlanningProvider
→ { type: "no_tool" }
→ degraded(tool_planning_unavailable)

当前有效模型能力不满足 toolCalling
→ { type: "no_tool" }
→ degraded(tool_planning_capability_unavailable)

规划 Provider 调用失败或结果非法
→ { type: "no_tool" }
→ degraded(tool_planning_failed / tool_plan_invalid)

规划成功
→ no_tool 或 tool_calls
→ 不得包含用户可见自然语言。
```

`no_tool` 是合法结果，不等同于 failed。规划的 runtime / 降级原因应进入 Debug Context，但不得覆盖 final generate 的 runtime。

### 8.4 Tool Execute

```txt
ToolPlan=no_tool
→ 不执行工具，返回 []，Trace skipped。

ToolPlan=tool_calls
→ 只执行规划返回的调用；
→ 维持 V1.0 单轮工具限制；
→ 复用现有 Tool Registry / Tool Adapter；
→ ToolResult 进入最终消息上下文、output.toolResults、Debug Context。
```

禁止：

```txt
- 执行未规划工具；
- 在阶段 4 实现多轮重规划；
- 让最终回答模型再次带 tools 进行第二次工具决定。
```

### 8.5 Final Generate

`runFinalGenerateStep()` 只能生成唯一一份面向用户的最终回复：

```txt
ToolPlan=no_tool
→ Prompt + History + User Message
→ ChatModel.generate()

ToolPlan=tool_calls
→ Prompt + History + User Message + 已执行 Tool Results
→ ChatModel.generate()
```

关键约束：

```txt
- 本阶段只调用 ChatModel.generate()；
- 不调用 ChatModel.stream()；
- 工具规划生成的内容不得作为最终回复使用；
- 不得先 generate 一段自然语言再丢弃、再 generate 第二次；
- 最终 generate 不传 tools，避免未规划的二次工具决定；
- model:generate Trace 只代表最终回答；
- output.model / runtime 必须反映 final generate 的实际 usedProfile / fallback。
```

### 8.6 Output Safety 与 Writeback

```txt
runOutputSafetyStep
→ guardOutput(completeText)；拒绝终止；禁止后续写回。

runSummarySaveStep
→ 只在 Output Safety 通过后执行；失败 degraded。

runMemoryExtractSaveStep
→ 只在 Output Safety 通过后执行；失败 degraded。

buildWorkflowOutput
→ 只从 state 收口，不得二次调用 Provider。
```

`ChatWorkflowOutput` 不得删除或重命名 V1.0 字段。新增调试字段只能增量加入，例如：

```txt
metadata.debugContext
├── personaPrompt
├── systemPrompt
├── toolDefinitions
├── toolPlan
├── toolPlanningDegradation
├── toolResults
├── modelProfile / usedProfile
└── degraded steps
```

---

## 九、阶段 4 执行顺序

```txt
workflow:start（CoreObserver）
↓
Persona:load
↓
Safety:input
↓
Summary:load
↓
Memory:recall
↓
Emotion:analyze / transition
↓
Prompt:build
↓
Tool:list
↓
Tool:plan
↓
Tool:execute（仅 tool_calls）
↓
Final Response → ChatModel.generate()
↓
Safety:output
↓
Summary:save
↓
Memory:extract / save
↓
Build ChatWorkflowOutput
↓
workflow:end（CoreObserver）
```

本阶段没有 `text:delta`，没有 `workflow:finish` Stream Event，也没有 NDJSON。

---

## 十、错误与降级语义

### 必须终止

```txt
- message 缺失或为空
- PersonaProvider.load() 失败
- Input Safety 拒绝
- final generate 的 retry / fallback 耗尽后失败
- Output Safety 拒绝
- 不可恢复的编排错误
```

### 默认不终止可信回复

```txt
- Summary load 失败
- Memory recall 失败
- Emotion 分析失败
- ToolPlanningProvider 缺失、能力不满足、规划失败或结果非法
- 单个工具执行按既有策略可降级时
- Summary save 失败
- Memory extract / save 失败
- Observer 发射失败
```

禁止掩盖：

```txt
- planner 失败却显示“没有工具需求”；
- fallback 后仍显示 primary 为实际模型；
- Output Safety 拒绝后仍写 Summary / Memory；
- writeback 降级却把整个 workflow 标记 failed；
- 步骤拆分后遗漏或重复 Trace / Observer 事件。
```

---

## 十一、实施顺序

### 子任务 01：重构基线清单

```txt
- 记录当前 execute() 的步骤、Trace、Observer、错误与降级行为；
- 记录 V1.0 工具 loop 的输入输出；
- 标记阶段 3 tool:plan 的接入点；
- 明确本阶段不会调用 model.stream()。
```

### 子任务 02：State 与前置步骤抽取

```txt
- 建立 WorkflowExecutionState；
- 抽出 Persona、Input Safety、Summary Load、Memory Recall、Emotion、Prompt、Tool List；
- 此时不改变 final generate 与工具行为。
```

### 子任务 03：接入 Tool Planning 与工具执行

```txt
- 接入 ToolPlanningProvider；
- 增加 tool:plan Trace / Debug Context；
- no_tool 直达 final generate；
- tool_calls 后执行工具并注入结果；
- final generate 不再携带 tools。
```

### 子任务 04：收口步骤抽取

```txt
- 抽取 Final Generate、Output Safety、Summary Save、Memory Extract/Save、Output Builder；
- 确保 Safety 拒绝阻止写回；
- 确保 writeback 失败只 degraded。
```

### 子任务 05：人工回归与 Review

```txt
- 执行 ai-core typecheck / lint / build；
- 完成本文件人工验收；
- 写入 .code-reviews/v1.1/stage-04-workflow-step-refactor-review.md；
- 若实现偏离本文件，先更新需求再改代码。
```

---

## 十二、人工验收

> 当前不要求单元测试与 E2E；必须通过 Demo / console / Debug Context 验证真实行为。

### 12.1 基础非工具聊天

输入：

```txt
你好，今天过得怎么样？
```

预期：

```txt
- executeWorkflow 返回完整文本；
- 没有 text:delta；
- Trace 包含 tool:plan；
- 无工具时 plan=no_tool / skipped；
- final generate 只调用一次；
- Output Safety 通过后才写回。
```

### 12.2 Persona 回归

配置：

```txt
用户显示名：陈大鱼头
用户称呼：鱼头
伴侣爱好：电影、烘焙
```

预期：

```txt
- Prompt Debug 有 Persona 段落；
- 回答可自然使用“鱼头”；
- 不存在 Demo / Core 重复称呼注入；
- Persona 不写入 Memory。
```

### 12.3 `no_tool` 规划

输入：

```txt
我今天有点累。
```

预期：

```txt
- planner=no_tool；
- 不执行工具；
- final generate 一次；
- workflow 不标记 failed。
```

### 12.4 `tool_calls` 规划

前提：注册 `get_current_time`。

输入：

```txt
现在几点了？
```

预期：

```txt
- tool:plan=tool_calls；
- 只执行规划调用；
- ToolResult 注入 final generate；
- output.toolResults 与 Debug Context 可查看；
- final generate 不重新触发未规划工具。
```

### 12.5 Tool Planning 能力不满足或失败

预期：

```txt
- toolCalling=false 时，不按 provider 名称分支；
- 明确记录 capability_unavailable；
- 降级为 no_tool，正常生成回答；
- planner 缺失、失败或非法计划时也不打断聊天；
- Debug Context 能区分无工具与规划降级。
```

### 12.6 既有降级与 Safety 回归

分别模拟：

```txt
Memory recall fail
Summary load fail
Emotion analyze fail
Input Safety reject
Output Safety reject
```

预期：

```txt
- 前三类仅 degraded，仍可返回可信回复；
- Input Safety 拒绝后不执行 Tool / Generate / Writeback；
- Output Safety 拒绝后不执行 Summary / Memory 写回；
- Trace / Observer 顺序没有缺失或重复。
```

### 12.7 阶段边界验证

```txt
- 本阶段新增代码不调用 ChatModel.stream()；
- 不新增 text:delta；
- 不新增 NDJSON Route；
- 不新增 ollama npm 依赖；
- executeWorkflow 仍返回完整文本。
```

---

## 十三、Review Checklist

```txt
[ ] execute() 是否只负责初始化、顺序编排与异常收口？
[ ] 是否存在重复 Prompt 拼接或 Demo 依赖？
[ ] 是否存在环境变量、数据库、HTTP、React、Ollama SDK 依赖？
[ ] 是否存在 ChatModel.stream() 调用？若有则阶段越界。
[ ] ToolPlanningProvider 是否与最终回答生成真正分离？
[ ] no_tool 是否仍会生成一次最终回答？
[ ] final generate 是否仍携带 tools？若是必须修正。
[ ] final runtime 是否反映真实 usedProfile / fallback？
[ ] tool:plan 是否有 Trace、Debug Context 与降级原因？
[ ] Summary / Memory / Emotion 失败是否仍可降级？
[ ] Input / Output Safety 是否阻止不应发生的后续步骤？
[ ] Trace / Observer 是否缺失、重复或顺序倒置？
[ ] ChatWorkflowOutput 是否保留 V1.0 字段？
[ ] typecheck、lint、build 是否通过？
```

---

## 十四、阶段完成后的状态

```txt
CompanionCore.executeWorkflow()
↓
SimpleChatWorkflow.execute()
↓
共享步骤函数
├── Persona
├── Safety
├── Summary
├── Memory
├── Emotion
├── Prompt
├── Tool List
├── Tool Plan
├── Tool Execute
├── Final Generate（完整文本）
├── Output Safety
├── Summary Writeback
└── Memory Writeback
↓
ChatWorkflowOutput
```

此时：

```txt
- 没有用户可见流式回复；
- 没有 NDJSON；
- 没有 Ollama Adapter；
- 没有 stream() 真实实现；
- 但 execute / stream 可复用的业务步骤边界已经建立；
- 工具规划、工具执行与最终回答已经清晰分离；
- 阶段 5 可以将 Final Generate 替换为真实 stream，并用阶段 2 协议包裹共享步骤。
```

下一阶段入口：

```txt
.requirements/stages/v1.1/stage-05/05-streaming-workflow.md
```
