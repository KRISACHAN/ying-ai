# AI Companion Core V1.1 - 阶段 5：流式工作流重构补丁说明

> 文件名：`05-streaming-workflow-refactor-patch.md`
> 关联主文档：`05-streaming-workflow.md`
> 补丁主题：按《重构》思路拆分 `SimpleChatWorkflow`，降低 Stage 5 后续维护成本

## 一、补丁背景

阶段 5 已经完成工作流级真实流式聊天：

1. `SimpleChatWorkflow.stream()` 可产出 `ChatWorkflowStreamEvent`；
2. `WorkflowStreamEmitter` 已提供单请求事件队列、终止守卫与真流式 yield；
3. `model:stream` 已成为独立 `WorkflowStepName`；
4. `runWorkflowStep()` 已支持可选 `streamEmitter`，实现 Trace / Observer / Stream 双通道；
5. `tool:call` / `tool:result` 已在 stream 路径发出；
6. `finalOutput` 已从 stream 聚合结果回填，且不伪造 Provider `raw`；
7. Stage 5 的 12 个 fake provider 验收场景已在 code review follow-up 中通过。

代码审查与复核仍保留三个维护性关注：

1. `packages/ai-core/src/implementations/workflow/simple-chat-workflow.ts` 已超过 2200 行；
2. `WorkflowExecutionState`、共享步骤函数、最终回复生成、工具执行、输出构建、错误归一化全部集中在同一文件；
3. `SafeWorkflowError` 归一化逻辑与 `core/companion-core.ts` 存在重复，后续新增 error code 时有双处维护风险。

Stage 5 主功能已经成立，本补丁只做 **行为保持型重构**。目标不是继续加功能，而是把已经稳定的行为拆成更小、更清晰、可单独审查的模块。

---

## 二、补丁目标

本补丁需要实现以下目标：

1. 将 `simple-chat-workflow.ts` 从“单体编排 + 状态 + 步骤 + helper”拆为多个职责清晰的内部模块；
2. 保留 `SimpleChatWorkflow` 作为公开工作流类与主要编排入口；
3. 保留 `execute()` 与 `stream()` 的公开行为、事件顺序、错误语义和返回结构；
4. 保留 Stage 5 的 producer / consumer + `WorkflowStreamEmitter` 真流式设计；
5. 保留 Stage 4 的 Tool Planning → Tool Execute → Final Generate 非流式路径；
6. 保留 `final generate` 与 `final stream` 只在最终模型调用方式上分叉的结构；
7. 收敛 `SafeWorkflowError` 创建 / 归一化逻辑，减少与 `CompanionCore` 的重复；
8. 让后续 Stage 6 / Stage 7 接入 Ollama 与 Demo 流式 UI 时，不需要在 2200 行大文件里继续叠代码。

---

## 三、重构原则

本补丁按《重构》的思路执行：

### 3.1 先有护栏，再移动代码

在开始拆文件前，必须先确认当前 Stage 5 行为可验证：

```bash
pnpm --filter @ying-companion/ai-core typecheck
pnpm --filter @ying-companion/ai-core lint
pnpm --filter @ying-companion/ai-core build
```

并保留或复用 Stage 5 fake provider 验收脚本，至少覆盖：

```txt
- executeWorkflow 正常非流式输出；
- streamWorkflow 正常流式输出；
- text:delta 拼接等于 workflow:finish.output.text；
- tool:call / tool:result 在 text:delta 前出现；
- Output Safety 拒绝后 workflow:error；
- 已输出 delta 后模型中断为 model_stream_failed；
- 旧 Workflow 不支持 stream 时返回 workflow_stream_not_supported。
```

### 3.2 小步移动，保持行为等价

每一步只做一种重构手法：

```txt
Extract Type
Move Function
Move Class
Extract Module
Introduce Parameter Object
Rename for clarity（仅在移动稳定后）
```

不得在同一次小步中混入：

```txt
- 新功能；
- 事件语义变更；
- 错误码变更；
- Prompt 文案调整；
- Provider 选择策略调整；
- Demo / HTTP / NDJSON 改造。
```

### 3.3 先搬移，再整理

优先做“机械搬移”：

1. 复制现有类型 / 函数到新模块；
2. 调整 import / export；
3. 删除旧位置；
4. 跑 typecheck；
5. 再考虑局部命名与文件内顺序。

不要在搬移同时改算法。

### 3.4 外部可观察行为不得改变

以下行为必须逐字保持：

```txt
- ChatWorkflowInput / ChatWorkflowOutput 类型结构；
- CompanionCore.executeWorkflow() 行为；
- CompanionCore.streamWorkflow() 行为；
- ChatWorkflowStreamEvent 类型与顺序；
- CoreObserver 事件；
- WorkflowTrace 步骤名称、顺序、status；
- SafeWorkflowError.code；
- DebugContext 字段；
- planner runtime 与 final runtime 分区；
- finalOutput.raw 默认 undefined 的流式语义。
```

---

## 四、补丁内容

### 4.1 抽出工作流执行状态

在：

```txt
packages/ai-core/src/implementations/workflow/
```

新增：

```txt
workflow-execution-state.ts
```

承载：

```ts
interface WorkflowPromptState { ... }
interface WorkflowToolPlanningState { ... }
interface WorkflowGenerationState { ... }
interface WorkflowExecutionState { ... }

function createWorkflowExecutionState(input: ChatWorkflowInput): WorkflowExecutionState
```

要求：

1. `WorkflowExecutionState` 仍是内部实现细节，不从 package public entry 导出；
2. `WorkflowTraceRecorder` 创建逻辑保持不变；
3. 状态字段命名保持现状，避免连锁修改；
4. `simple-chat-workflow.ts` 只 import 状态类型与工厂。

适用重构手法：

```txt
Extract Type
Move Function
Extract Module
```

### 4.2 抽出步骤运行器

新增：

```txt
workflow-step-runner.ts
```

承载：

```ts
interface RunWorkflowStepOptions<TResult> { ... }

async function runWorkflowStep<TResult>(...)
async function emitWorkflowStep(...)
async function safeEmit(...)
```

要求：

1. `execute()` 不传 `streamEmitter` 时行为与 Stage 4 / Stage 5 当前实现一致；
2. `stream()` 传 `streamEmitter` 时仍保持：
   - `step:start`;
   - Trace start;
   - CoreObserver start;
   - 执行；
   - Trace end;
   - `step:end`;
   - CoreObserver end。
3. `step:end.status` 必须继续与 `WorkflowTraceRecorder.end()` 的 status 一致；
4. 不改变 `safeEmit()` 吞 Observer 异常的策略。

适用重构手法：

```txt
Extract Function
Move Function
Introduce Parameter Object（保持现有 options 形态）
```

### 4.3 抽出工作流步骤集合

新增：

```txt
workflow-steps.ts
```

承载 Stage 4 / Stage 5 共享步骤：

```txt
runPersonaStep
runInputSafetyStep
runSummaryLoadStep
runMemoryRecallStep
runEmotionStep
runToolListStep
runPromptBuildStep
runToolPlanningStep
runOutputSafetyStep
runSummarySaveStep
runMemoryExtractSaveStep
```

要求：

1. 这些步骤继续同时服务 `execute()` 与 `stream()`；
2. 每个步骤仍接收 `WorkflowExecutionState`、`ChatWorkflowExecutionContext` 与可选 `WorkflowStreamEmitter`；
3. 不把 `SimpleChatWorkflow` 实例传入步骤函数；
4. 不让步骤函数反向调用 `execute()` 或 `stream()`；
5. 不让步骤函数知道 HTTP / NDJSON / Demo。

适用重构手法：

```txt
Move Function
Extract Module
Separate Query from Modifier（仅限后续小步，不在本补丁强制）
```

### 4.4 抽出工具执行模块

新增：

```txt
workflow-tool-execution.ts
```

承载：

```ts
executeToolCalls(...)
hasInvalidJsonArguments(...)
createInvalidArgumentsResult(...)
```

以及与工具执行强相关的内部类型：

```ts
interface ExecuteToolCallsOptions { ... }
```

要求：

1. `tool:call` / `tool:result` Stream 事件顺序保持不变；
2. `ToolResult.ok === false` 的受控失败仍为 `tool:execute` degraded；
3. `ToolProvider.execute()` 抛出的不可恢复异常仍映射为 `tool_execution_failed`；
4. invalid JSON arguments 仍生成失败 `ToolResult`，不抛出未归一化异常。

适用重构手法：

```txt
Move Function
Extract Module
Replace Temp with Query（如能降低局部复杂度，可选）
```

### 4.5 抽出最终回复生成模块

新增：

```txt
workflow-final-response.ts
```

承载：

```ts
runFinalGenerateStep(...)
runFinalStreamStep(...)
```

要求：

1. `runFinalGenerateStep()` 仍使用 `workflowStep = "model:generate"`；
2. `runFinalStreamStep()` 仍使用 `workflowStep = "model:stream"`；
3. final stream 仍要求 `requiredCapabilities: { streaming: true }`；
4. final stream 仍不传 `tools`；
5. `completeText.trim() === ""` 仍为 `model_stream_failed`；
6. `finalOutput.raw` 在 stream 路径仍为 `undefined`；
7. `planner runtime` 不得覆盖 `final runtime`。

适用重构手法：

```txt
Move Function
Extract Function
Preserve Whole Object（保留 state/context 参数，避免过早拆散）
```

### 4.6 抽出输出构建模块

新增：

```txt
workflow-output-builder.ts
```

承载：

```ts
buildWorkflowOutput(...)
buildDebugContext(...)       # 可选，若拆出后更清晰
buildWorkflowMetadata(...)   # 可选
```

要求：

1. `ChatWorkflowOutput` 字段不删除、不重命名；
2. `metadata.debugContext` 字段保持现状；
3. `toolPlanningRuntime`、`toolPlan`、`toolPlanningReason` 等 Stage 4 / Stage 5 字段保持现状；
4. `output.text` 继续直接来自 `generation.finalOutput.text`；
5. `output.model` 继续来自 final output，而非 planner output。

适用重构手法：

```txt
Extract Function
Move Function
Split Phase（先构建 debugContext，再构建 output）
```

### 4.7 抽出安全错误模块

新增：

```txt
workflow-safe-error.ts
```

承载：

```ts
function createSafeWorkflowError(...)
function toSafeWorkflowError(...)
function normalizeSafeWorkflowError(...)
function isSafeWorkflowErrorCode(...)
class SafeWorkflowException extends Error implements SafeWorkflowError
```

要求：

1. 首步只服务 `SimpleChatWorkflow`，保持行为不变；
2. 后续可再让 `core/companion-core.ts` 复用该 helper，但本补丁不强制同一步完成；
3. `redactSensitiveMessage()` / `toSafeMessage()` 的安全截断语义保持不变；
4. `SafeWorkflowException` 仍继承 `Error`，不破坏 execute 路径 catch 习惯；
5. `SafeWorkflowError.details` 仍只允许 JSON 基础值。

适用重构手法：

```txt
Move Function
Move Class
Consolidate Duplicate Conditional Expression（后续可与 CompanionCore 共享）
```

### 4.8 收窄 `simple-chat-workflow.ts`

完成上述拆分后，`simple-chat-workflow.ts` 应只保留：

```txt
- SimpleChatWorkflowOptions
- SimpleChatWorkflow class
- constructor
- execute()
- stream()
- runStreamProducer()
- resolveToolPlanningProvider()
- 少量与类强相关的私有编排 helper
```

期望效果：

```txt
simple-chat-workflow.ts
→ 从 2200+ 行下降到约 250～500 行
→ 成为“编排层”，而不是“所有实现细节的仓库”
```

说明：

1. 行数不是硬性指标，但职责边界必须明显收窄；
2. 若某些 helper 搬出后造成循环依赖，优先调整模块边界，而不是把逻辑塞回单体文件；
3. 不为追求行数拆出没有职责含义的“misc utils”。

---

## 五、职责边界

### 本补丁负责

1. 拆分 `simple-chat-workflow.ts` 的内部状态、步骤、工具执行、最终回复、输出构建、错误 helper；
2. 保持 `SimpleChatWorkflow` 的公开行为不变；
3. 保持 `WorkflowStreamEmitter` 的真流式队列模型不变；
4. 保持 Stage 5 的 12 个场景可继续通过；
5. 降低后续 Stage 6 / Stage 7 改动时的认知成本。

### 本补丁不负责

1. 不新增任何聊天功能；
2. 不改变 `ChatWorkflowInput` / `ChatWorkflowOutput` / `ChatWorkflowStreamEvent` 类型；
3. 不改变 `CompanionCore.executeWorkflow()` / `CompanionCore.streamWorkflow()` 公共入口；
4. 不改变 Prompt 结构、Persona 结构、ToolPlan 结构；
5. 不改变流式事件顺序；
6. 不新增 HTTP、NDJSON、React UI、Ollama Adapter；
7. 不引入数据库、鉴权、用户系统；
8. 不把 `ai-core` 内部实现模块导出为 public API；
9. 不做性能优化、缓存策略或模型路由策略调整。

---

## 六、补丁后的完成标准

补丁完成后需要满足：

- `simple-chat-workflow.ts` 职责收窄为工作流编排层；
- `WorkflowExecutionState` 已移入 `workflow-execution-state.ts`；
- `runWorkflowStep()` 已移入步骤运行器模块；
- 共享业务步骤已移入 `workflow-steps.ts` 或同等职责清晰的模块；
- 工具执行 helper 已移入工具执行模块；
- final generate / final stream 已移入最终回复模块；
- `buildWorkflowOutput()` 已移入输出构建模块；
- `SafeWorkflowError` helper 已移入独立模块；
- `execute()` 与 `stream()` 的公开签名不变；
- `executeWorkflow()` 返回结构不变；
- `streamWorkflow()` 事件顺序不变；
- `text:delta` 拼接仍严格等于 `workflow:finish.output.text`；
- `CoreObserver` 旁路事件仍会发出；
- `WorkflowTrace` 步骤与 status 不变；
- `tool:call` / `tool:result` 仍只在 stream 路径出现；
- `finalOutput.raw` 在 stream 路径仍不伪造；
- `SafeWorkflowError.code` 映射不变；
- `@ying-companion/ai-core` typecheck / lint / build 通过；
- Stage 5 fake provider 验收或等价人工验证通过；
- 新增 `.code-reviews/v1.1/` review 记录，说明这是重构补丁而非功能阶段。

---

## 七、验证方式

### 7.1 每一步搬移后的快速验证

每完成一个模块搬移，至少执行：

```bash
pnpm --filter @ying-companion/ai-core typecheck
```

若 typecheck 失败，立即修复后再继续下一步，不得叠加多个未验证搬移。

### 7.2 完整静态验证

补丁完成后执行：

```bash
pnpm --filter @ying-companion/ai-core typecheck
pnpm --filter @ying-companion/ai-core lint
pnpm --filter @ying-companion/ai-core build
```

### 7.3 行为等价验证

复用 Stage 5 fake provider 验收脚本或等价本地脚本，至少覆盖：

```txt
场景 1：无工具正常流
场景 2：工具规划成功
场景 3：存在工具但无需调用
场景 4：流式能力不可用
场景 5：首个 delta 前 fallback
场景 6：已输出后中断
场景 7：Output Safety 拒绝
场景 8：写回降级
场景 9：旧 Workflow 不支持 stream
场景 10：Input Safety 拒绝
场景 11：Tool Planning 降级仍正常流式
场景 12：Planner 与 Final Runtime 分区
```

额外回归：

```txt
- executeWorkflow 正常非流式回答；
- executeWorkflow 的 Safety 拒绝仍可被宿主 catch；
- ToolProvider 抛出不可恢复异常时仍为 tool_execution_failed；
- 仅空白 delta 后失败仍带 partialOutput=true；
- stream 未终止时 CompanionCore 仍补 workflow_failed。
```

### 7.4 Diff 验证

Review 时重点检查：

```txt
- 是否主要是 move / extract，而不是行为改写；
- 是否出现 Prompt 文案变化；
- 是否出现 Stream Event 类型或顺序变化；
- 是否出现 public export 增加；
- 是否出现 Demo / HTTP / Ollama 改动；
- 是否出现新的 any / type assertion 绕过；
- 是否出现循环依赖或 barrel export 污染。
```

---

## 八、Review Checklist

```txt
[ ] 是否只做重构，没有新增功能？
[ ] 是否每个移动步骤都有 typecheck 证据？
[ ] simple-chat-workflow.ts 是否只保留编排职责？
[ ] WorkflowExecutionState 是否已独立？
[ ] runWorkflowStep 是否已独立，且 execute 不传 emitter 时零行为变化？
[ ] 共享步骤是否仍同时服务 execute 与 stream？
[ ] Tool Execute 是否仍保持受控失败 degraded、不可恢复失败 tool_execution_failed？
[ ] Final Generate 与 Final Stream 是否仍只在最终模型调用方式上分叉？
[ ] final stream 是否仍 requiredCapabilities.streaming = true？
[ ] final stream 是否仍不传 tools？
[ ] finalOutput.raw 是否仍不伪造？
[ ] buildWorkflowOutput 输出结构是否保持不变？
[ ] SafeWorkflowError helper 是否收敛且不泄漏 raw / stack / API key？
[ ] CoreObserver 事件是否仍发出？
[ ] WorkflowTrace 步骤顺序与 status 是否保持？
[ ] text:delta 拼接是否仍等于 workflow:finish.output.text？
[ ] workflow:finish / workflow:error 终止语义是否保持唯一？
[ ] 是否没有新增 HTTP / NDJSON / React / Ollama / DB 依赖？
[ ] ai-core typecheck / lint / build 是否通过？
[ ] Stage 5 fake provider 验收或等价人工验证是否通过？
[ ] 是否新增 `.code-reviews/v1.1/` review 记录？
```

---

## 九、建议拆分顺序

建议按以下顺序实施，每一步都可以单独提交或至少单独验证：

```txt
1. Move WorkflowExecutionState
2. Move SafeWorkflowError helper
3. Move runWorkflowStep / safeEmit / emitWorkflowStep
4. Move tool execution helpers
5. Move final response steps
6. Move output builder
7. Move remaining shared workflow steps
8. 收窄 simple-chat-workflow.ts imports 与类主体
9. 全量验证与 review
```

原因：

1. State 与 Error helper 被多处依赖，先拆可降低后续模块耦合；
2. Step runner 是共享步骤的基础设施，早拆便于后续步骤搬移；
3. Tool / Final Response / Output Builder 边界相对明确，适合中段移动；
4. 最后再移动剩余共享步骤，可根据已形成的模块依赖调整边界。

---

## 十、后续阶段衔接

1. Stage 6 Ollama Adapter 不应关心 `SimpleChatWorkflow` 内部模块拆分，只依赖 `ChatModel` 契约；
2. Stage 7 Demo / NDJSON 只消费 `ChatWorkflowStreamEvent`，不应 import 新增 workflow 内部模块；
3. 若后续需要复用 `SafeWorkflowError` helper，可在独立补丁中让 `core/companion-core.ts` 引用 `workflow-safe-error.ts` 或迁移到 `abstractions` 附近的内部 helper；
4. 若后续需要测试覆盖，优先针对拆出的纯函数模块补最小单元测试，而不是从 UI 层验证所有行为。
