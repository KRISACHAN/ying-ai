# 代码审查 — V1.1 Stage 5 工作流级流式聊天

**日期：** 2026-06-28  
**审查工具：** Cursor  
**模型：** Composer  
**审查范围：** HEAD commit `e838111`（`feat(ai-core): 实现工作流级流式聊天`）  
**引用：** `git show e838111` · 3 files · +534 / −2  
**结论：** 建议

## 依据规范

- [AGENTS.md](../../../AGENTS.md)
- [docs/ai/core/principles.md](../../../docs/ai/core/principles.md)
- [docs/ai/core/working-agreements.md](../../../docs/ai/core/working-agreements.md)
- [docs/ai/core/verification.md](../../../docs/ai/core/verification.md)
- [docs/ai/core/project-context.md](../../../docs/ai/core/project-context.md)
- [.cursor/rules/ai-guide.mdc](../../../.cursor/rules/ai-guide.mdc)
- [.requirements/stages/v1.1/stage-05/05-streaming-workflow.md](../../../.requirements/stages/v1.1/stage-05/05-streaming-workflow.md)

> **双通道说明：** 已按 code-reviewer + architect 双车道集成审查（Cursor 无独立子 agent 委托）。

## 摘要

Commit `e838111` 完成了 Stage 5 核心交付：`SimpleChatWorkflow.stream()`、`WorkflowStreamEmitter` 异步队列、`model:stream` 步骤、共享步骤双通道（Trace/Observer + Stream）、`tool:call`/`tool:result`、`finalOutput` 回填（`raw: undefined`）、关键路径 `SafeWorkflowError` 码。producer/consumer 模式能在 `model.stream()` 期间实时 yield `text:delta`，符合 Stage 5 文档与实施口诀。

`pnpm --filter @ying-companion/ai-core typecheck` / `lint` / `build` 全量通过。无阻塞级缺陷；主要遗留为 Stage 5 人工验收证据缺失、部分错误码未落地、单文件体量继续膨胀，以及 stream 异常信息被过度泛化。

## 审查统计

- 审查文件数：3（commit 变更全集）
- 问题总数：7（严重 0 / 高 0 / 中 3 / 低 4）
- code-reviewer 建议：**COMMENT**
- 架构状态：**WATCH**

## 问题清单

### 严重

无。

### 高

无。

### 中

- [`packages/ai-core/src/implementations/workflow/simple-chat-workflow.ts:861-889`] **`runFinalStreamStep` 吞掉底层 stream 异常**

  `catch { throw createSafeWorkflowError({ message: "Model stream failed." ... }) }` 丢弃 Adapter 原始错误，仅在已 emit delta 时设置 `partialOutput: true`。安全上可接受，但排查 retry/fallback/能力拒绝问题时只能看到泛化文案。

  **修复建议：** 保留 `SafeWorkflowError` 对外 message 泛化，在 `details` 中写入安全截断后的 `reason`（如 `capabilitySkips` 计数或 error code），或经 `toTraceError` 写入 trace summary，便于 Debug 而不泄漏 raw。

- [`packages/ai-core/src/implementations/workflow/simple-chat-workflow.ts:1435-1495`] **`tool_execution_failed` 未实际使用**

  Stage 5 §8.5 要求工具不可恢复失败时使用 `tool_execution_failed`，但 `executeToolCalls` 中工具 `ok: false` 走 degraded success，仅 `tools.execute()` 抛错时经 `runWorkflowStep` 冒泡为泛化 `workflow_failed`。

  **修复建议：** 在 `runWorkflowStep` catch 或 `executeToolCalls` 外层，当 `workflowStep === "tool:execute"` 且为不可恢复异常时，包装为 `tool_execution_failed`。

- [Stage 5 验收] **缺少 12 个人工场景验证记录**

  `.requirements/stages/v1.1/stage-05/05-streaming-workflow.md` §10 要求在本 commit SHA 下记录命令、关键输出与结论；当前 commit 未附带 `.code-reviews/v1.1/5-e838111/` 或等价人工验收证据。

  **修复建议：** 合入前至少跑 `for await (core.streamWorkflow(...))` 覆盖场景 1、2、4、6、7、9，将命令与关键 event 序列写入 review 备注。

### 低

- [`packages/ai-core/src/implementations/workflow/simple-chat-workflow.ts`] **单文件 2144 行，未按 Stage 5 §2.3 拆分**

  `workflow-stream-emitter.ts` 已独立，但 `WorkflowExecutionState` 与全部步骤仍留在 `simple-chat-workflow.ts`，execute/stream 双路径维护成本继续升高。

- [`packages/ai-core/src/implementations/workflow/simple-chat-workflow.ts:1214-1293`] **`SafeWorkflowError` 归一化与 `companion-core.ts` 重复**

  `createSafeWorkflowError` / `normalizeSafeWorkflowError` / `isSafeWorkflowErrorCode` 与 Core 门面重复实现，后续增删 error code 需改两处。

- [`packages/ai-core/src/implementations/workflow/simple-chat-workflow.ts:437-441`] **`execute()` 路径 Safety 拒绝改为 `SafeWorkflowException`**

  `runInputSafetyStep` / `runOutputSafetyStep` 对 execute 与 stream 共用，现均抛带 `code` 的结构化错误（原 execute 为普通 `Error`）。行为更一致，但属于未文档化的 execute 侧变更；宿主若只 catch `Error` 仍可用，若依赖 message 字符串则需知悉。

- [`packages/ai-core/src/implementations/workflow/simple-chat-workflow.ts:895-901`] **仅空白 chunk 的边界**

  空白 delta 会 emit，但 `completeText.trim()` 为空时抛 `model_stream_failed` 且不带 `partialOutput`。极端情况下宿主已看到空白 delta 却收到非 partial 语义错误。出现概率低，可接受或后续在 trim 失败且 `emittedDelta` 时补 `partialOutput: true`。

## 架构关注项

- [`workflow-stream-emitter.ts` + `stream()`] **CLEAR** — producer（`runStreamProducer`）写队列、consumer（`for await emitter.events()`）yield，满足「真流式」约束；`emitTerminal` 终止守卫正确。

- [`runWorkflowStep` + 可选 `streamEmitter`] **CLEAR** — execute 不传 emitter 零行为变化；stream 双通道与 Stage 4 trace 对齐。

- [`runFinalStreamStep`] **CLEAR** — `model:stream`、不传 `tools`、`streaming: true`、`finalOutput` 回填、`raw: undefined` 均符合 Stage 5。

- [`simple-chat-workflow.ts` 体量] **WATCH** — 2144 行；建议 Stage 6 前或 follow-up 拆 `workflow-execution-state.ts` / `workflow-steps.ts`。

- [`SafeWorkflowError` 双份实现] **WATCH** — 长期维护风险，可提取到 `workflow-stream-errors.ts` 供 Core 与 Workflow 共用。

## Stage 5 验收对照（代码层）

| 检查项                                                                     | 结果                                      |
| -------------------------------------------------------------------------- | ----------------------------------------- |
| `SimpleChatWorkflow.stream()`                                              | ✅                                        |
| `WorkflowStreamEmitter` 队列 + yield                                       | ✅                                        |
| `model:stream` in `WorkflowStepName`                                       | ✅                                        |
| 共享步骤 + 可选 streamEmitter                                              | ✅                                        |
| `tool:call` / `tool:result`（stream 路径）                                 | ✅                                        |
| final stream 不传 `tools`                                                  | ✅                                        |
| `requiredCapabilities.streaming: true`                                     | ✅                                        |
| `finalOutput` 回填 + `buildWorkflowOutput`                                 | ✅                                        |
| `raw` 不伪造                                                               | ✅                                        |
| `input_safety_rejected` / `output_safety_rejected` / `model_stream_failed` | ✅（部分路径）                            |
| `tool_execution_failed`                                                    | ❌ 未抛出                                 |
| CoreObserver 仍 emit                                                       | ✅                                        |
| execute 不传 emitter 无回归                                                | ✅（typecheck 通过；Safety 错误类型有变） |
| CompanionCore.streamWorkflow 回归                                          | ➖ 本 commit 未改；行为仍兼容             |
| 12 个人工场景                                                              | ❌ 无记录                                 |
| ai-core typecheck / lint / build                                           | ✅                                        |

## 合成说明

- code-reviewer：**COMMENT**（0 高/严重；3 中：异常泛化、tool 错误码、人工验收缺失）
- 架构状态：**WATCH**（单文件体量 + 错误 helper 重复，无 BLOCK）
- 最终结论：**建议**（依据 OMX：architect=WATCH → 建议）

## 检查项

### 安全

- [x] 无硬编码密钥
- [x] stream 错误 message 经 `redactSensitiveMessage`
- [x] Safety 拒绝不返回未审计文本

### 代码质量

- [x] 核心流式路径清晰
- [ ] 单文件过大（WATCH）
- [ ] SafeWorkflowError 逻辑重复（低）

### 性能

- [x] 队列 push/waiter 模式适合单请求流式，无多余拷贝

### 项目规范

- [x] 不读 env、不写 console
- [x] typecheck / lint / build 通过
- [ ] Stage 5 人工验收未记录（中）

### 架构

- [x] emitter 队列 + 双通道设计符合 Stage 5 文档
- [x] execute/stream 分叉点仅在 final generate/stream
- [ ] 文件拆分建议未落实（WATCH）

### 验证

- [x] `pnpm --filter @ying-companion/ai-core typecheck` — 通过
- [x] `pnpm --filter @ying-companion/ai-core lint` — 通过
- [x] `pnpm --filter @ying-companion/ai-core build` — 通过
- [ ] Stage 5 §10 十二场景人工验证 — 未执行/未归档

## 备注

**未审查范围：** `companion-core.ts` 本 commit 无变更；Stage 6/7 HTTP/Demo 不在范围。

**建议合入前最小验证：**

```bash
# 在 model-runtime-demo 或本地脚本中
for await (const e of core.streamWorkflow({ message: "你好" })) { ... }
# 确认：workflow:start → step:* → text:delta+ → workflow:finish
# 确认：delta 拼接 === finish.output.text
```

**总体：** Stage 5 核心实现质量良好，可以合入；建议 follow-up 补人工验收记录与 `tool_execution_failed` 映射，非必须阻塞 merge。
