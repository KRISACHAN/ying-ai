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
- `workflow:finish` 或 `workflow:error` 二选一，终止后不得继续发事件；
- `packages/ai-core` typecheck、lint、build 通过；
- 完成本文件人工验收，并写入 `.code-reviews/v1.1/`。

---

## 四、范围与非目标

### 本阶段必须做

```txt
1. 实现 SimpleChatWorkflow.stream()
2. 实现 CompanionCore.streamWorkflow() 委托与兼容错误收口
3. 复用 Stage 4 共享步骤
4. 调用 ChatModel.stream() 生成最终回复
5. 生成 Stage 2 定义的 ChatWorkflowStreamEvent
6. 保持 Trace / Observer / DebugContext / 降级语义
7. 正确处理流前失败、部分输出失败、输出安全拒绝、写回降级
8. 提供 Core 级人工验证入口
9. 完成 Stage 5 Review
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

```txt
packages/ai-core/src/
├── abstractions/
│   ├── workflow.ts
│   ├── workflow-stream.ts
│   ├── workflow-trace.ts
│   └── model.ts
├── core/
│   └── companion-core.ts
└── implementations/workflow/
    ├── simple-chat-workflow.ts
    ├── workflow-execution-state.ts
    ├── workflow-steps.ts
    └── workflow-trace-recorder.ts

.code-reviews/v1.1/
└── 5-{7-char-sha}/
```

职责边界：

```txt
CompanionCore
→ 选择并调用 Workflow。
→ 不拼 Prompt、不消费模型流、不输出 HTTP 字节流。

SimpleChatWorkflow
→ 负责步骤编排与异常收口。
→ 只复用 Stage 4 共享步骤。

共享步骤
→ 更新 WorkflowExecutionState、Trace、Observer、DebugContext。
→ 不直接写 HTTP / NDJSON。

ChatModel
→ 返回文本流与 runtime。
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

无工具或无需工具：

```txt
Tool:list
↓
Tool:plan = no_tools / no_tool
↓
Final Response: model.stream()
```

存在工具并需要调用：

```txt
Tool:plan = tool_calls
↓
tool:call × N
↓
Tool:execute
↓
tool:result × N
↓
将工具结果写入最终回答上下文
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

### 7.4 delta 累积与最终输出

推荐概念实现：

```ts
let completeText = '';
let hasEmittedText = false;

for await (const chunk of context.core.model.stream(streamInput)) {
  const text = chunk.text;

  if (text.length === 0) continue;

  completeText += text;
  hasEmittedText = true;

  yield {
    type: 'text:delta',
    workflowId,
    text,
    model: chunk.model,
  };
}

state.finalText = completeText;
```

约束：

```txt
- 不 trim delta。
- 不按字符、词或时间重切块。
- workflow:finish.output.text 直接使用 completeText。
- 完整输出为空时按既有模型输出失败语义处理，不得 finish 空成功回复。
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

不得发送 `text:delta` 或 `workflow:finish`。

### 8.2 已输出文本后的部分失败

示例：连接中断、Adapter 流迭代抛错、provider 中途断开。

处理：

```txt
已发送至少一个 text:delta
↓
model:stream step:end(status = failed)
↓
workflow:error
↓
结束
```

约束：

```txt
- 不发送 workflow:finish。
- 不切换模型继续拼接文本。
- 不把已输出文本包装成正常完成。
- 错误必须表达 partial failure 语义。
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

### 09-02：实现流事件发射辅助

目标：避免手写事件造成 workflowId、timestamp、终止语义漂移。

任务：

```txt
1. 创建内部 stream event emitter / helper。
2. 统一 workflowId、timestamp、SafeWorkflowError。
3. 保证终止事件最多一次。
4. 与 Stage 4 trace recorder 协作，不复制 trace 状态。
```

完成标准：

```txt
- 所有事件 workflowId 一致。
- 终止后不可再 emit。
- helper 不依赖 HTTP、NDJSON、React 或 Demo。
```

### 09-03：实现 SimpleChatWorkflow.stream()

目标：复用 Stage 4 步骤实现真实流式路径。

任务：

```txt
1. 初始化 WorkflowExecutionState。
2. 发出 workflow:start。
3. 执行共享步骤：Persona、Safety、Summary、Memory、Emotion、Tool List、Prompt、Tool Plan、Tool Execute。
4. 调用 final model.stream()。
5. 累积 completeText 并逐 chunk 发 text:delta。
6. 流后执行 Output Safety。
7. 执行 Summary / Memory 写回。
8. 构建完整 ChatWorkflowOutput。
9. 成功时发 workflow:finish，失败时发 workflow:error。
```

关键约束：

```txt
- 不调用 execute()。
- 不复制 Stage 4 步骤业务逻辑。
- final stream 不传 tools。
- planner runtime 与 final runtime 分区记录。
```

### 09-04：实现 CompanionCore.streamWorkflow() 收口

目标：为宿主提供稳定门面。

任务：

```txt
1. 检查 workflow.stream 是否存在。
2. 存在则委托。
3. 不存在则按 Stage 2 返回 workflow_stream_not_supported 事件流。
4. 不影响 executeWorkflow()。
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
step:start / step:end
text:delta
workflow:finish / workflow:error
final output.text
trace status
runtime / effective profile
```

---

## 十、人工验收场景

不要求新增单元测试或 e2e 测试，但必须完成以下人工验证，并在 `.code-reviews/v1.1/5-{sha}/` 记录命令、关键输出、结论与已知限制。

### 场景 1：无工具正常流

```txt
输入：使用支持 streaming 的模型，发送不需要工具的问题。
预期：
- workflow:start。
- 前置步骤顺序正确。
- Tool Plan = no_tool 或 no_tools。
- 至少收到两个非空 text:delta。
- 收到 workflow:finish。
- output.text 与 delta 拼接严格一致。
```

### 场景 2：工具规划成功

```txt
输入：注册可验证工具，发送明确需要工具的问题。
预期：
- Tool Plan = tool_calls。
- tool:call 在对应 tool:result 前。
- 所有工具完成前无 text:delta。
- final stream 基于工具结果生成回复。
- workflow:finish.output.toolResults 与工具事件一致。
```

### 场景 3：存在工具但无需调用

```txt
预期：
- Tool Plan = no_tool。
- 无 tool:call / tool:result。
- 直接进入 model.stream()。
```

### 场景 4：流式能力不可用

```txt
输入：配置 streaming = false 的有效模型档案。
预期：
- 无 text:delta。
- 不回退 generate()。
- workflow:error。
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
- model:stream failed。
- workflow:error。
- 无 workflow:finish。
- 不尝试换模型续写。
```

### 场景 7：Output Safety 拒绝

```txt
输入：可控 SafetyProvider 在完整文本后拒绝。
预期：
- 正常收到 text:delta。
- safety:output failed。
- workflow:error。
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

- [ ] stream() 使用 Stage 4 共享步骤。
- [ ] 不复制 Persona / Memory / Emotion / Tool / Writeback 逻辑。
- [ ] 不通过 stream() 反向实现 execute()。
- [ ] 不通过 execute() 伪造 stream()。

### 模型与工具

- [ ] 最终回答只使用 `ChatModel.stream()`。
- [ ] stream 调用要求 `streaming: true`。
- [ ] final stream 不传 tools。
- [ ] Tool Plan 与 final response 分离。
- [ ] 工具完成前无 text:delta。
- [ ] final runtime 显示实际生效模型档案。

### 错误与降级

- [ ] delta 拼接等于 `workflow:finish.output.text`。
- [ ] 空字符串 delta 不发，空白 delta 不 trim。
- [ ] 流前失败无 delta、无 finish。
- [ ] 已输出后失败为 partial failure、无 finish。
- [ ] Output Safety 拒绝为 workflow:error。
- [ ] Summary / Memory 写回失败可降级 finish。

### 质量与 Review

- [ ] ai-core typecheck 通过。
- [ ] ai-core lint 通过。
- [ ] ai-core build 通过。
- [ ] 已完成 9 个关键人工验收场景。
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