# AI Companion Core V1.1 - 阶段 5：工作流级流式协议与流式聊天实施文档

## 一、阶段目标

在 Stage 1～4 已完成 Persona 扩展、V1.1 契约、模型能力与工具规划、`SimpleChatWorkflow` 步骤函数化的基础上，实现 **Core / Workflow 级真实流式聊天**。

本阶段不是把 `generate()` 简单替换为 `stream()`，而是让宿主通过：

```ts
for await (const event of core.streamWorkflow(input)) {
  // 消费完整聊天生命周期
}
```

获得：

```txt
workflow:start
↓
step:start / step:end
↓
tool:call / tool:result（如有）
↓
text:delta × N（仅最终用户回复）
↓
workflow:finish（完整 ChatWorkflowOutput）
```

同时必须保证：

1. `executeWorkflow()` 保持独立、稳定、非流式的完整结果语义；
2. `streamWorkflow()` 复用 Stage 4 共享步骤，不复制业务链路；
3. 工具规划、工具执行、Safety、Summary、Memory、Trace、Observer、降级语义与既有工作流一致；
4. 仅最终面向用户的自然语言进入 `text:delta`；
5. 已输出文本后的异常必须明确失败；
6. 本阶段不接 HTTP / NDJSON / React UI / Ollama Adapter。

---

## 二、前置基线

### 2.1 已完成阶段

```txt
Stage 1
├── CompanionPersona 扩展
├── buildPersonaPrompt()
├── normalizeCompanionPersona()
└── debugContext.personaPrompt

Stage 2
├── executeWorkflow() / streamWorkflow()
├── ChatWorkflow.stream?()
├── ChatWorkflowStreamEvent
├── SafeWorkflowError
└── Core Event / Wire Event 分离

Stage 3
├── ModelProfile / ModelCapabilities
├── RequiredModelCapabilities
├── ToolPlanningProvider
└── ToolPlan = no_tool | tool_calls

Stage 4
├── WorkflowExecutionState
├── 共享工作流步骤函数
├── Tool Plan → Tool Execute → Final Generate
└── executeWorkflow() 兼容重构
```

### 2.2 Stage 5 必须遵守

```txt
- 不重新定义 Persona、ModelProfile、ToolPlan、Stream Event 或 Wire DTO。
- 不按 provider 名称分支；仅依据当前具体模型档案与 requiredCapabilities。
- 不用 streamWorkflow() 反向实现 executeWorkflow()。
- 不用 executeWorkflow() 伪造 streamWorkflow()。
- 不在 ai-core 中引入 HTTP、NDJSON、React、Next.js、数据库、Demo 或 Ollama SDK。
- 不让宿主重新拼 Persona Prompt 或重新实现工作流编排。
```

### 2.3 实施前置（建议在本阶段开始时完成）

Stage 4 已将步骤函数化，但当前实现仍集中在 `simple-chat-workflow.ts`（约 1800 行）。Stage 5 会新增 `stream()` 双路径，**建议在写 `stream()` 前先拆出至少以下模块**，避免 execute / stream 同文件漂移：

```txt
workflow-execution-state.ts   ← WorkflowExecutionState 与 state 工厂
workflow-stream-emitter.ts    ← Stream 事件发射、终止守卫（09-02）
workflow-steps.ts             ← 共享步骤（可选，但推荐）
```

`CompanionCore.streamWorkflow()` 与 `ChatWorkflowStreamEvent` 类型已在 Stage 2 落地；本阶段重点是 `SimpleChatWorkflow.stream()` 与步骤 → Stream 事件桥接，不是重做 Core 门面。

### 2.4 ToolPlan 术语约定

```txt
ToolPlan.type
→ no_tool | tool_calls（计划类型）

ToolPlanningDegradationReason
→ no_tools | tool_calling_unavailable | planner_unavailable | invalid_plan（降级原因）

示例：
- 未注册工具：type = no_tool, reason = no_tools
- 规划成功但无需调用：type = no_tool（可无 reason）
- 需要调用工具：type = tool_calls
```

验收与文档中不得把 `no_tools`（reason）误写成 `ToolPlan.type`。

---

## 三、阶段完成标准

完成后必须满足：

- `SimpleChatWorkflow` 实现真实 `stream()`；
- `CompanionCore.streamWorkflow()` 可委托 Workflow 的 `stream()`；
- 未实现 `stream()` 的旧自定义 Workflow 仍能 typecheck，并返回 `workflow_stream_not_supported` 协议错误；
- 最终自然语言回复必须来自 `ChatModel.stream()`；
- `text:delta` 只包含最终用户可见自然语言；
- 所有 delta 按顺序拼接后必须严格等于 `workflow:finish.output.text`；
- 空字符串 delta 不发送；空白 delta 不得 trim 或丢弃；
- 工具规划与工具执行全部结束前不得发送 `text:delta`；
- `ToolPlan = tool_calls` 时，必须先执行工具，再进入最终流式回答；
- final stream 不得传入 `tools`，避免模型在流中自行发起未规划工具调用；
- stream 调用必须要求 `requiredCapabilities: { streaming: true }`；
- 所有候选模型均不支持 streaming 时，发送 `workflow:error`，不得退回一次性 `generate()` 并伪造流；
- 首个 delta 前失败可由 Adapter 既有 retry / fallback 机制处理；最终失败时发送 `workflow:error`；
- 已发送 delta 后发生异常时，必须发送 `workflow:error`，不得发送 `workflow:finish`；
- 完整文本后 Output Safety 拒绝时，必须发送 `workflow:error`；
- Summary / Memory 可恢复写回失败仍按既有语义降级并允许 `workflow:finish`；
- 每一个 `step:start` 都有对应 `step:end`，并与最终 trace status 一致；
- `stream()` 期间仍必须 emit CoreObserver 旁路事件（与 Stage 2 一致）；Observer 与 Stream 不得共用同一 UI handler；
- `tool:call` / `tool:result` 仅在 `tool:execute` 步骤内、且全部 `text:delta` 之前出现；
- 流前失败、Output Safety 拒绝、模型流失败须使用 Stage 2 冻结的 `SafeWorkflowError.code`（见 §8.5）；
- `workflow:finish` 或 `workflow:error` 二选一，终止后不得继续发事件；
- `packages/ai-core` typecheck、lint、build 通过；
- 完成本文件人工验收，并写入 `.code-reviews/v1.1/`。

---

## 四、范围与非目标

### 本阶段必须做

```txt
1. （建议）拆分 workflow 模块，降低 execute / stream 双路径漂移风险
2. 实现 SimpleChatWorkflow.stream()
3. 回归验证 CompanionCore.streamWorkflow()（Stage 2 已有，本阶段不重复实现）
4. 复用 Stage 4 共享步骤，并补齐步骤 → Stream 事件桥接
5. 调用 ChatModel.stream() 生成最终回复，并回填 generation.finalOutput
6. 生成 Stage 2 定义的 ChatWorkflowStreamEvent（含 tool:call / tool:result）
7. 保持 Trace / Observer / DebugContext / 降级语义
8. 正确处理流前失败、部分输出失败、输出安全拒绝、写回降级
9. 提供 Core 级人工验证入口
10. 完成 Stage 5 Review
```

### 本阶段明确不做

```txt
- HTTP Route、POST + fetch、NDJSON 编解码
- SSE / EventSource
- React 流式 UI
- Ollama Adapter
- AbortSignal、用户取消、断线恢复、token replay
- 文本已输出后切换模型继续生成
- 流式多轮 Tool Loop
- 流中调用工具
- token 级实时内容安全拦截
- 用户系统、鉴权、租户隔离
```

---

## 五、目录与职责

### 5.1 当前基线（Stage 4 结束）

```txt
packages/ai-core/src/
├── abstractions/          # workflow.ts, workflow-stream.ts, workflow-trace.ts, model.ts …
├── core/
│   └── companion-core.ts  # streamWorkflow() 已在 Stage 2 实现
└── implementations/workflow/
    ├── simple-chat-workflow.ts   # execute() + 全部共享步骤 + WorkflowExecutionState
    └── workflow-trace-recorder.ts
```

### 5.2 本阶段目标结构

```txt
packages/ai-core/src/implementations/workflow/
├── simple-chat-workflow.ts       # execute() / stream() 编排与异常收口
├── workflow-execution-state.ts   # 从 simple-chat-workflow 拆出
├── workflow-stream-emitter.ts    # Stream 事件发射、终止守卫（09-02）
├── workflow-steps.ts             # 共享步骤（推荐从 simple-chat-workflow 拆出）
└── workflow-trace-recorder.ts

.code-reviews/v1.1/
└── 5-{7-char-sha}/
```

`workflow-steps.ts` 在 Stage 4 标为可选；Stage 5 因双路径维护，**推荐拆出**。若暂不拆，必须在 PR / Review 中说明理由。

### 5.3 职责边界

```txt
CompanionCore
→ 选择并调用 Workflow（streamWorkflow 已在 Stage 2 落地，本阶段回归验证）。
→ 不拼 Prompt、不消费模型流、不输出 HTTP 字节流。

SimpleChatWorkflow
→ execute() 与 stream() 分别编排；只在 final generate / final stream 处分叉。
→ 只复用 Stage 4 共享步骤，不复制业务逻辑。

共享步骤（runWorkflowStep 及步骤函数）
→ 更新 WorkflowExecutionState、Trace、CoreObserver。
→ stream() 路径额外通过 WorkflowStreamEmitter 产出 ChatWorkflowStreamEvent。
→ 不直接写 HTTP / NDJSON。

ChatModel
→ 返回文本流与 runtime（finish chunk 可能 text 为空但携带 runtime / usage）。
→ Adapter 自行处理 retry、fallback、能力筛选。
```

---

## 六、公开契约与兼容规则

### 6.1 ChatWorkflow

沿用 Stage 2 的兼容扩展：

```ts
export interface ChatWorkflow extends CoreProvider {
  execute(
    input: ChatWorkflowInput,
    context: ChatWorkflowExecutionContext,
  ): Promise<ChatWorkflowOutput>;

  stream?(
    input: ChatWorkflowInput,
    context: ChatWorkflowExecutionContext,
  ): AsyncIterable<ChatWorkflowStreamEvent>;
}
```

规则：

```txt
- 旧自定义 Workflow 只实现 execute() 仍必须 typecheck。
- 旧宿主调用 executeWorkflow() 行为不变。
- SimpleChatWorkflow 必须实现真实 stream()。
- 旧 Workflow 调用 streamWorkflow() 时不得伪造 token 流。
```

### 6.2 CompanionCore.streamWorkflow()

> **Stage 2 已实现。** 本阶段任务 09-04 为**回归验证**，不是从零重写。仅在 `SimpleChatWorkflow.stream()` 落地后，确认委托、终止守卫与 `workflow_stream_not_supported` 路径仍符合 Stage 2 契约。

语义：

```txt
Workflow 实现 stream()
→ 委托其输出。

Workflow 未实现 stream()
→ workflow:start
→ workflow:error(code = workflow_stream_not_supported)
→ 结束。
```

约束：

```txt
- 返回 AsyncIterable<ChatWorkflowStreamEvent>。
- 不返回 Response、ReadableStream、SSE 或 NDJSON 字符串。
- 不调用 executeWorkflow() 后人为拆分文本。
- executeWorkflow() 不得消费 streamWorkflow() 反向实现。
```

### 6.3 终止事件规则

一条流只能有一个终止事件：

```txt
成功或降级成功：workflow:finish
失败：workflow:error
```

终止事件发送后不得继续发送任何 `step:*`、`text:delta`、`tool:*` 事件。

---

## 七、流式编排顺序

### 7.1 正常顺序

`stream()` 的业务顺序必须与 Stage 4 `execute()` 等价；差异只在最终回答生成方式。

```txt
workflow:start
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
Tool:list
↓
Prompt:build
↓
Tool:plan
↓
Tool:execute（如有 tool_calls）
↓
Final Response: model.stream() → text:delta × N
↓
Safety:output（完整文本后）
↓
Summary:save
↓
Memory:extract
↓
Memory:save
↓
workflow:finish
```

每个业务步骤必须满足：

```txt
step:start
↓
执行
↓
step:end(status = success | skipped | degraded | failed)
```

### 7.2 工具规划与最终回复分离

无工具或无需调用（完整路径仍含 `Prompt:build`）：

```txt
Tool:list
↓
Prompt:build
↓
Tool:plan → type = no_tool（reason 可能为 no_tools 等）
↓
Final Response: model.stream()
```

存在工具并需要调用：

```txt
Tool:list
↓
Prompt:build
↓
Tool:plan → type = tool_calls
↓
step:start(tool:execute)
↓
tool:call × N
↓
（逐个执行）
↓
tool:result × N
↓
step:end(tool:execute)
↓
将工具结果写入 finalMessages（followUpMessages）
↓
Final Response: model.stream()
```

约束：

```txt
- ToolPlanningProvider 绝不生成用户可见自然语言。
- 最终回答只由 final model.stream() 生成。
- final stream 不传 tools。
- text:delta 开始后不得出现 tool:call / tool:result。
- V1.1 不支持 plan → execute → re-plan。
```

### 7.3 最终流式模型调用

```ts
const stream = context.core.model.stream({
  messages: finalMessages,
  requiredCapabilities: {
    streaming: true,
  },
});
```

约束：

```txt
- 不因 provider 名称或模型名跳过能力检查。
- Adapter 在主模型 / fallback 候选中筛选满足 streaming 的实际模型。
- 没有可用流式模型时必须进入 workflow:error。
- 不允许自动回退 generate() 再伪造 text:delta。
```

### 7.4 delta 累积、finalOutput 回填与空回复校验

Stage 4 的 `buildWorkflowOutput()` 依赖 `state.generation.finalOutput`。`stream()` 必须在流结束后构造与之等价的 `GenerateOutput`，再复用同一 `buildWorkflowOutput()`，避免 stream / execute 输出结构漂移。

推荐概念实现：

```ts
let completeText = '';
let lastModel: string | undefined;
let finalRuntime: ModelRuntimeInfo | undefined;
let finalUsage: GenerateUsage | undefined;

for await (const chunk of context.core.model.stream(streamInput)) {
  if (chunk.runtime !== undefined) {
    finalRuntime = chunk.runtime;
  }
  if (chunk.usage !== undefined) {
    finalUsage = chunk.usage;
  }
  if (chunk.model !== undefined) {
    lastModel = chunk.model;
  }

  const text = chunk.text;
  if (text.length === 0) {
    continue; // 跳过空字符串 chunk（含 Adapter finish chunk）
  }

  completeText += text;
  yield { type: 'text:delta', workflowId, text, model: chunk.model };
}

// 与 OpenAI Adapter validateGenerateOutput 对齐：无 text 且无 toolCalls → 失败
if (!completeText.trim()) {
  throw toSafeWorkflowError({ code: 'model_stream_failed', step: 'model:stream', ... });
}

state.generation = {
  ...state.generation,
  finalOutput: {
    text: completeText,
    model: lastModel ?? finalRuntime?.usedModel ?? '',
    raw: { provider: 'stream' },
    ...(finalRuntime !== undefined ? { runtime: finalRuntime } : {}),
    ...(finalUsage !== undefined ? { usage: finalUsage } : {}),
  },
};
```

约束：

```txt
- 不 trim delta；空白 chunk 仍可作为 text:delta 发出。
- 空字符串 chunk（text.length === 0）不得作为 text:delta 发出。
- finish chunk 的 runtime / usage 须写入 finalOutput，不得丢失 fallback 信息。
- output.model / modelOutput.runtime 仍只代表 final stream（与 Stage 4 planner runtime 分区一致）。
- workflow:finish.output.text 直接使用 completeText。
- 完整输出为空（trim 后）时按 model_stream_failed 失败，不得 finish 空成功回复。
- planner runtime 写入 debugContext.toolPlanningRuntime；不得覆盖 final runtime。
```

### 7.5 Trace 中的流式模型步骤

`text:delta` 是 `model:stream` 步骤内部的连续产物，不替代 Step Event。

推荐顺序：

```txt
step:start(step = model:stream)
↓
text:delta × N
↓
step:end(step = model:stream, status = success)
```

若 `WorkflowStepName` 尚未包含 `model:stream`，本阶段必须增量新增，并同步更新类型、trace recorder、Stage 2 引用与 Review。

不得用 `model:generate` 标记真实流式生成。

### 7.6 共享步骤 → Stream 事件双通道桥接

Stage 4 的 `runWorkflowStep()` 已负责 **WorkflowTrace + CoreObserver**，但**不会**自动产出 `ChatWorkflowStreamEvent`。`stream()` 必须补齐第二通道，且两通道逐步对齐：

```txt
runWorkflowStep 内部（已有）
→ recorder.start / end
→ emitWorkflowStep → CoreObserver workflow:step

stream() 路径（本阶段新增）
→ WorkflowStreamEmitter.emitStepStart / emitStepEnd
→ yield ChatWorkflowStreamEvent step:start / step:end
```

**推荐实现：** 为 `runWorkflowStep` 增加可选 `streamEmitter?: WorkflowStreamEmitter` 参数：

```ts
async function runWorkflowStep(options) {
  options.streamEmitter?.emitStepStart(options.workflowStep);
  // … 既有 trace + observer 逻辑 …
  options.streamEmitter?.emitStepEnd(options.workflowStep, status, summary);
}
```

规则：

```txt
- execute() 不传 streamEmitter，行为与 Stage 4 完全一致。
- stream() 传入同一 emitter 实例，保证 workflowId 一致。
- 每个 step:start 必须恰好对应一个 step:end；status 与 trace 最终 status 一致。
- CoreObserver 与 Stream 是双通道：Observer 继续供日志 / 持久化；Stream 供宿主 Timeline。
- 不得让 Demo / 宿主用 Observer workflow:step 冒充 Stream step 事件。
- emotion:analyze trace 步骤仍覆盖 analyze + transition（与 Stage 4 一致）。
```

### 7.7 tool:call / tool:result 发射规则

当前代码仅有 Observer 的 `tool:execute:start/end`，**尚无** Stream 的 `tool:call` / `tool:result`。本阶段在 `stream()` 的工具执行循环中补齐：

```txt
step:start(tool:execute)
↓
对每个 planned call:
  emit tool:call
  execute via ToolRegistry
  emit tool:result
↓
step:end(tool:execute)
↓
（之后才允许 model:stream / text:delta）
```

规则：

```txt
- tool:call / tool:result 只出现在 stream() 路径；execute() 不强制 emit（保持 Stage 4 行为）。
- 事件顺序：同一 call 必须先 call 后 result；多个 call 按执行顺序排列。
- tool:result.result 使用 Core ToolResult（Wire 映射留给 Stage 7）。
- plan.type !== tool_calls 时：仍 emit tool:execute step（status = skipped），不 emit tool:call/result。
- 工具执行不可恢复失败 → step:end(failed) → workflow:error(code = tool_execution_failed)。
```

---

## 八、错误、降级与安全语义

### 8.1 流前失败

示例：

```txt
- Input Safety 拒绝
- 最终模型无 streaming 能力
- 首个文本前 retry / fallback 全部失败
- Tool 执行不可恢复失败
```

处理：

```txt
workflow:start
↓
已开始步骤各自 step:end(status = failed)
↓
workflow:error
↓
结束
```

不得发送 `text:delta` 或 `workflow:finish`。`workflow:error` 时推荐错误码：

```txt
Input Safety 拒绝       → input_safety_rejected, step = safety:input
Tool 规划失败（mandatory）→ tool_planning_failed, step = tool:plan
Tool 执行不可恢复失败   → tool_execution_failed, step = tool:execute
无 streaming 能力       → model_stream_failed, step = model:stream
```

### 8.2 已输出文本后的部分失败

示例：连接中断、Adapter 流迭代抛错、provider 中途断开。

处理：

```txt
已发送至少一个 text:delta
↓
model:stream step:end(status = failed)
↓
workflow:error(code = model_stream_failed, step = model:stream)
↓
结束
```

约束：

```txt
- 不发送 workflow:finish。
- 不切换模型继续拼接文本。
- 不把已输出文本包装成正常完成。
- 错误必须表达 partial failure 语义；details 可标记 partialOutput = true。
```

### 8.3 Output Safety 拒绝

V1.1 使用完整文本后审计：

```txt
text:delta × N
↓
stream 完成
↓
SafetyProvider.guardOutput(completeText)
```

拒绝时：

```txt
model:stream step:end(success)
↓
safety:output step:end(failed)
↓
workflow:error(code = output_safety_rejected 或等价错误)
↓
结束
```

规则：

```txt
- 已发送文本不可撤回。
- 不生成替代安全回复。
- Stage 7 Demo 必须显示“输出未通过安全审计”。
- 本阶段不做实时 token 级拦截。
```

### 8.4 可恢复写回失败

Summary / Memory 等写回失败时：

```txt
可信最终回复已完成
↓
对应步骤 step:end(status = degraded)
↓
trace / metadata 标记降级
↓
workflow:finish
```

`workflow:finish.output.text` 仍必须严格等于 delta 拼接结果。

### 8.5 SafeWorkflowError.code 映射（Stage 5 必用）

沿用 Stage 2 冻结枚举，本阶段至少覆盖：

| 场景                                                    | code                            | step（建议）    |
| ------------------------------------------------------- | ------------------------------- | --------------- |
| Workflow 未实现 stream                                  | `workflow_stream_not_supported` | —               |
| Input Safety 拒绝                                       | `input_safety_rejected`         | `safety:input`  |
| Output Safety 拒绝                                      | `output_safety_rejected`        | `safety:output` |
| 模型流失败（含空回复、首个 delta 前失败、已输出后中断） | `model_stream_failed`           | `model:stream`  |
| Tool 规划不可恢复失败                                   | `tool_planning_failed`          | `tool:plan`     |
| Tool 执行不可恢复失败                                   | `tool_execution_failed`         | `tool:execute`  |
| 其他未分类工作流失败                                    | `workflow_failed`               | 当前步骤        |

`post_process_failed` 保留给未来 mandatory 后置 Provider；V1.1 的 Summary / Memory / Emotion 默认可降级，不得滥用此 code 终止 finish。

---

## 九、实施任务

### 09-01：补齐流式 Step 语义

目标：为 `model:stream` 建立独立、可追踪的 Trace / Observer / Event 语义。

任务：

```txt
1. 检查 WorkflowStepName 是否已有 model:stream。
2. 缺失则增量新增。
3. 确认 trace recorder 能记录其 start / end / status / metadata。
4. 确认 CoreObserver 仍可旁路观察，不替代 text:delta。
```

完成标准：

```txt
- model:stream 不等同于 model:generate。
- 同一请求不会出现 step:start 无 step:end。
- execute 与 stream 的模型步骤在 Trace 中可区分。
```

### 09-02：实现 WorkflowStreamEmitter 与步骤桥接

目标：避免手写事件造成 workflowId、timestamp、终止语义漂移；并让共享步骤同时产出 Stream 事件。

任务：

```txt
1. 创建 workflow-stream-emitter.ts（或等价 helper）。
2. 提供 emitWorkflowStart / emitStepStart / emitStepEnd / emitTextDelta /
   emitToolCall / emitToolResult / emitFinish / emitError。
3. 统一 workflowId、timestamp、SafeWorkflowError；终止后禁止再 emit。
4. 为 runWorkflowStep 增加可选 streamEmitter 参数（见 §7.6）。
5. 与 Stage 4 trace recorder 协作：step:end.status 与 recorder.end 保持一致，不复制 trace 状态。
```

完成标准：

```txt
- 所有事件 workflowId 一致。
- 终止后不可再 emit。
- execute() 不传 emitter 时零行为变化。
- helper 不依赖 HTTP、NDJSON、React 或 Demo。
```

### 09-03：实现 SimpleChatWorkflow.stream()

目标：复用 Stage 4 步骤实现真实流式路径。

任务：

```txt
1. 初始化 WorkflowExecutionState 与 WorkflowStreamEmitter。
2. 发出 workflow:start。
3. 带 streamEmitter 执行共享步骤：Persona、Safety、Summary、Memory、Emotion、
   Tool List、Prompt、Tool Plan。
4. 执行 Tool Execute：在 stream 路径 emit tool:call / tool:result（§7.7）。
5. 实现 runFinalStreamStep（workflowStep = model:stream）：
   调用 final model.stream()，累积 completeText，emit text:delta，回填 finalOutput（§7.4）。
6. 带 streamEmitter 执行 Output Safety、Summary / Memory 写回。
7. 调用 buildWorkflowOutput(state) 构建 ChatWorkflowOutput。
8. 成功时 emit workflow:finish；失败时 emit workflow:error（§8.5）。
```

关键约束：

```txt
- 不调用 execute()。
- 不复制 Stage 4 步骤业务逻辑。
- final stream 不传 tools。
- planner runtime 与 final runtime 分区记录（debugContext / modelOutput）。
- CoreObserver 旁路事件仍由共享步骤 emit，不得省略。
```

### 09-04：回归 CompanionCore.streamWorkflow()

目标：确认 Stage 2 门面在 SimpleChatWorkflow.stream() 落地后仍正确。

任务：

```txt
1. 确认 workflow.stream 存在时委托其 AsyncIterable。
2. 确认未实现 stream 的 Workflow 仍返回 workflow_stream_not_supported。
3. 确认 stream 未发送终止事件时 CompanionCore 补发 workflow_failed。
4. 确认 executeWorkflow() 行为未回归。
5. 仅在有行为偏差时修改 companion-core.ts；无偏差则 Review 记录“已验证”即可。
```

### 09-05：Core 级人工验证入口

目标：在不改 HTTP / Demo 流式 UI 的前提下证明是真实流。

可选方式：

```txt
- 新增 ai-core 本地验证脚本；或
- 扩展现有 runtime demo 的 server-side 调试入口；或
- 使用现有 CLI / demo 开发入口直接 for await 消费 streamWorkflow()。
```

验证输出至少包含：

```txt
workflow:start
step:start / step:end（与 trace 对齐）
tool:call / tool:result（如有工具）
text:delta
workflow:finish / workflow:error
final output.text 与 delta 拼接一致
trace status
planner runtime 与 final runtime 分区可见
CoreObserver 旁路事件仍可收到（与 Stream 独立）
```

---

## 十、人工验收场景

不要求新增单元测试或 e2e 测试，但必须完成以下 **12 个**人工验证场景，并在 `.code-reviews/v1.1/5-{sha}/` 记录命令、关键输出、结论与已知限制。

### 场景 1：无工具正常流

```txt
输入：使用支持 streaming 的模型，发送不需要工具的问题。
预期：
- workflow:start。
- 前置步骤顺序正确。
- Tool Plan：type = no_tool（未注册工具时 reason = no_tools）。
- 至少收到两个非空 text:delta。
- 收到 workflow:finish。
- output.text 与 delta 拼接严格一致。
```

### 场景 2：工具规划成功

```txt
输入：注册可验证工具，发送明确需要工具的问题。
预期：
- Tool Plan：type = tool_calls。
- tool:call 在对应 tool:result 前。
- 所有工具完成前无 text:delta。
- final stream 基于工具结果生成回复。
- workflow:finish.output.toolResults 与工具事件一致。
```

### 场景 3：存在工具但无需调用

```txt
预期：
- Tool Plan：type = no_tool。
- 无 tool:call / tool:result。
- 直接进入 model.stream()。
```

### 场景 4：流式能力不可用

```txt
输入：配置 streaming = false 的有效模型档案。
预期：
- 无 text:delta。
- 不回退 generate()。
- workflow:error(code = model_stream_failed)。
- 无 workflow:finish。
```

### 场景 5：首个 delta 前 fallback

```txt
输入：primary 在首个文本前失败，fallback 满足 streaming。
预期：
- 最终正常输出 delta 与 workflow:finish。
- final runtime 表示实际 fallback profile。
```

### 场景 6：已输出后中断

```txt
输入：测试模型先吐出至少一个 chunk 再抛错。
预期：
- 已收到 text:delta。
- model:stream step:end(failed)。
- workflow:error(code = model_stream_failed, step = model:stream)。
- 无 workflow:finish。
- 不尝试换模型续写。
```

### 场景 7：Output Safety 拒绝

```txt
输入：可控 SafetyProvider 在完整文本后拒绝。
预期：
- 正常收到 text:delta。
- safety:output failed。
- workflow:error(code = output_safety_rejected)。
- 无 workflow:finish。
- 无替代安全回复。
```

### 场景 8：写回降级

```txt
输入：Summary Save 或 Memory Save 失败，最终回复与 Output Safety 成功。
预期：
- delta 完整输出。
- 对应步骤 degraded。
- workflow:finish。
- output.text 与 delta 拼接一致。
```

### 场景 9：旧 Workflow 不支持 stream

```txt
输入：注入只实现 execute() 的旧 Workflow 后调用 streamWorkflow()。
预期：
workflow:start
↓
workflow:error(code = workflow_stream_not_supported)
↓
结束

并验证 executeWorkflow() 仍正常。
```

### 场景 10：Input Safety 拒绝

```txt
输入：SafetyProvider 拒绝用户输入。
预期：
- workflow:start 后执行至 safety:input failed。
- 无 text:delta。
- workflow:error(code = input_safety_rejected, step = safety:input)。
- 无 Tool Plan / model:stream / 写回步骤。
```

### 场景 11：Tool Planning 降级仍正常流式

```txt
输入：注册工具但模型 toolCalling = false，或 planner 返回 type = no_tool + reason = tool_calling_unavailable。
预期：
- 无 tool:call / tool:result。
- 仍进入 model.stream() 并 workflow:finish。
- debugContext 记录规划降级 reason；final runtime 独立于 planner runtime。
```

### 场景 12：Planner 与 Final Runtime 分区

```txt
输入：工具规划与最终回答使用同一 ChatModel，且 final stream 触发 fallback。
预期：
- debugContext / trace 可区分 planner runtime 与 final stream runtime。
- output.model / modelOutput.runtime 只反映 final stream。
- workflow:finish.output.text 与 delta 拼接一致。
```

---

## 十一、检查清单

### 契约与类型

- [ ] `ChatWorkflow.stream?()` 与 Stage 2 一致。
- [ ] `SimpleChatWorkflow` 实现真实 `stream()`。
- [ ] `CompanionCore.streamWorkflow()` 可用。
- [ ] `model:stream` 可追踪。
- [ ] Stream Event 未引入 HTTP / NDJSON 类型。
- [ ] 终止事件只出现一次。

### 工作流复用

- [ ] stream() 使用 Stage 4 共享步骤，并通过 streamEmitter 桥接 step 事件（§7.6）。
- [ ] 不复制 Persona / Memory / Emotion / Tool / Writeback 逻辑。
- [ ] 不通过 stream() 反向实现 execute()。
- [ ] 不通过 execute() 伪造 stream()。
- [ ] execute() 不传 streamEmitter 时行为与 Stage 4 完全一致。

### 模型与工具

- [ ] 最终回答只使用 `ChatModel.stream()`（runFinalStreamStep / model:stream）。
- [ ] stream 调用要求 `streaming: true`。
- [ ] final stream 不传 tools。
- [ ] Tool Plan 与 final response 分离。
- [ ] 工具完成前无 text:delta。
- [ ] stream 路径正确 emit tool:call / tool:result（§7.7）。
- [ ] finalOutput 从 stream 回填，buildWorkflowOutput 与 execute 结构一致。
- [ ] planner runtime 与 final runtime 分区记录。

### 可观测性

- [ ] CoreObserver 旁路事件在 stream() 期间仍 emit。
- [ ] Observer 与 Stream 未共用同一 UI handler。

### 错误与降级

- [ ] delta 拼接等于 `workflow:finish.output.text`。
- [ ] 空字符串 delta 不发，空白 delta 不 trim。
- [ ] 流前失败无 delta、无 finish。
- [ ] 已输出后失败为 partial failure（model_stream_failed）、无 finish。
- [ ] Output Safety 拒绝为 output_safety_rejected。
- [ ] Summary / Memory 写回失败可降级 finish。
- [ ] SafeWorkflowError.code 符合 §8.5 映射。

### 质量与 Review

- [ ] ai-core typecheck 通过。
- [ ] ai-core lint 通过。
- [ ] ai-core build 通过。
- [ ] 已完成 12 个关键人工验收场景。
- [ ] 已新增 Stage 5 Review 记录。

---

## 十二、阶段完成后的状态

完成 Stage 5 后，Core 具备：

```txt
CompanionCore
├── executeWorkflow()
│   └── 既有完整非流式结果路径
│
└── streamWorkflow()
    └── 完整工作流事件流
        ├── workflow / step 状态
        ├── tool call / result
        ├── 最终文本 delta
        ├── runtime / trace / debug context
        └── finish / error 终止语义
```

但仍不具备：

```txt
- Ollama Adapter（Stage 6）
- HTTP / NDJSON Route 或 React 流式渲染（Stage 7）
- 用户取消、续传、token 级实时 Safety
```

本阶段的边界是：先在 `ai-core` 内得到可信、可复用、可观测的工作流流协议，再由后续阶段接入具体 Adapter 与 Debug Workbench。
