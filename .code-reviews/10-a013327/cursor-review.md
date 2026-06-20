# 代码审查 — feat(ai-core): 固化工作流追踪契约（阶段 7）

**日期：** 2026-06-20
**审查工具：** Cursor
**模型：** Composer
**审查范围：** commit `a013327`（HEAD）
**引用：** `git show a013327 --no-color`（8 文件，+831 / -267 行）
**结论：** 建议

## 依据规范

- [AGENTS.md](../../AGENTS.md)
- [docs/ai/core/principles.md](../../docs/ai/core/principles.md)
- [docs/ai/core/working-agreements.md](../../docs/ai/core/working-agreements.md)
- [docs/ai/core/verification.md](../../docs/ai/core/verification.md)
- [docs/ai/core/project-context.md](../../docs/ai/core/project-context.md)
- [.cursor/rules/ai-guide.mdc](../../.cursor/rules/ai-guide.mdc)
- [.requirements/stages/stage-07/07-workflow-layer.md](../../.requirements/stages/stage-07/07-workflow-layer.md)
- [eslint.config.mjs](../../eslint.config.mjs)
- [prettier.config.mjs](../../prettier.config.mjs)

## 摘要

本 commit 落地阶段 7 核心契约：`WorkflowStepName` / `WorkflowTrace` 抽象、`WorkflowTraceRecorder`、`runWorkflowStep` 统一 trace + Observer 发射、`workflowOptions`（`includeTrace` / `timeoutMs`）、失败时 `workflow:error.payload.trace`、demo 最小 Trace 面板。

与 `07-workflow-layer.md` 的关键要求高度一致：`step` 保留旧字符串并新增 `workflowStep`；失败仍 throw；`ToolRegistry.list` 仍为关键路径；未暴露 `parallelReadSteps`；`timeoutMs` 仅计时不取消。编排顺序与阶段 3～6 降级语义未改。

本地已执行 `pnpm --filter @ying-companion/ai-core build`，通过。无阻塞缺陷；存在 legacy `workflow:step` 载荷形状变化、demo 失败路径未展示结构化 trace、验收场景 E 缺失、trace 状态推断语义等跟进项。

## 审查统计

- 审查文件数：8
- 问题总数：8（严重 0 / 高 0 / 中 3 / 低 5）
- code-reviewer 建议：COMMENT
- 架构状态：WATCH

## 问题清单

### 严重

无。

### 高

无。

### 中

- [`packages/ai-core/src/implementations/workflow/simple-chat-workflow.ts:522-530`] [规范: `07-workflow-layer.md` §8.1–8.2] 重构后 `runWorkflowStep` 的 `:end` 事件将原先顶层字段移入 `summary`，与改造前不兼容。例如 `tool:list:end` 原先为 `{ step, sessionId, count }`，现为 `{ step, workflowStep, phase, summary: { count } }`；模型 generate 的 `:end` 原先顶层有 `model`、`runtime`、`toolCallCount`、`messageCount` 等。

  **复现路径：** 对比 `git show a013327^:.../simple-chat-workflow.ts` 中 `tool:list:end` 与当前 `runWorkflowStep` 发射逻辑。

  **当前影响：** 若宿主或脚本按旧 payload 顶层字段解析（非仅读 `step`），会静默丢失信息。

  **修复建议：** 对 tool/model 相关 legacy 步骤，在 `:end` payload 中**同时保留顶层字段与 `summary`**（兼容窗口）；或在 README 明确标注 breaking change。

- [`apps/model-runtime-demo/app/chat-panel.tsx:124-127,285,322-323`] [规范: `07-workflow-layer.md` §10.2 场景 C2/D] 失败时 `setResult(null)`，`WorkflowTracePanel` 不渲染；`workflow:error.payload.trace` 仅能在原始 `ObserverEventsPanel` JSON 中看到，Dedicated Trace 面板无法展示失败步骤时间线。

  **修复建议：** `WorkflowTracePanel` 在 `result.metadata?.trace` 缺失时，回退读取 `observerEvents` 中 `workflow:error.payload.trace`；失败时仍展示 Trace 面板。

- [规范: `07-workflow-layer.md` §10.2 场景 E] 未实现 `MockAlternativeWorkflow`（或等价最小可替换 Workflow）。`DisabledChatWorkflow` 仅抛错，不能证明「换 Workflow 后主链路仍可调用 + `inspect()` 可见新 meta」。

  **修复建议：** 新增 `MockAlternativeWorkflow`（固定文本 + 稳定 `meta.id`），在 README 或 demo 注释中给出切换示例；至少一条集成验证。

### 低

- [`packages/ai-core/src/implementations/workflow/workflow-trace-recorder.ts:27-31,80-88`] `start()` 将步骤初始状态设为 `"failed"`，若中途 snapshot 会误报；`inferTraceStatus()` 将步骤级 `"failed"` 映射为 workflow `"degraded"`（成功返回路径上 critical 失败会先 throw 并显式 `snapshot("failed")`，但语义易混淆）。

  **修复建议：** 占位状态改为非终态或 `"success"` 占位；文档明确 workflow `"failed"` 仅由 `snapshot("failed")` 或 throw 路径设置。

- [`packages/ai-core/src/implementations/workflow/simple-chat-workflow.ts:1009-1014`] `toSafeMessage` 直接透传 `Error.message` 到 trace / `workflow:error`（既有模式，trace 扩大暴露面）。Provider 异常可能含连接串等内部信息。

  **修复建议：** 对 trace / Observer 错误摘要做长度截断与敏感模式 redaction。

- [`apps/model-runtime-demo/app/api/chat/route.ts:271-276`] API 默认 `includeTrace: true`（Core 默认仍为 false）。宿主若照搬会固定承担 trace 响应体成本。

  **修复建议：** 在 demo README 注明；或改为 UI 开关控制。

- [`packages/ai-core/src/implementations/workflow/workflow-trace-recorder.ts:14`] `WorkflowTraceRecorder` 使用 `export class` 但未从 `index.ts` 公开，易误导为公共 API。

  **修复建议：** 去掉 `export`，保持内部实现。

- [`packages/ai-core/src/abstractions/observer.ts:44-48`] `workflow:error` 的 trace 载荷未类型化（`CoreEvent` payload 仍为 `unknown`），与已定义的 `WorkflowStepEventPayload` 不对称。

  **修复建议：** 新增 `WorkflowErrorPayload` 并在 `observer.ts` 或 `workflow-trace.ts` 导出。

## 架构关注项

- **WATCH — 三层可观测职责** — 模块事件 + `workflow:step` + `WorkflowTrace` 符合 spec §8.3，但每增一步需同步三处（或 helper + `runWorkflowStep`），长期有 drift 风险。建议后续提取 `workflow-step.ts` 常量映射，并在文件头注释三层分工。

- **WATCH — `simple-chat-workflow.ts` 体量** — 约 1500 行，阶段 7 在既有 monolith 上叠加 `runWorkflowStep` 合理（spec 禁止为抽象而拆 package），但维护成本上升。可在阶段 7 收尾后考虑抽出 tool-loop helpers。

- **WATCH — `inferTraceStatus` 语义** — 步骤 `failed` vs workflow `failed`/`degraded` 边界需在类型或文档中钉死，避免未来非 throw 步骤误标。

- **CLEAR — 系统边界** — Provider 接口未改；`ChatWorkflow` 仍为唯一编排入口；`memory-postgres` 未介入；无 env/console/LangGraph 依赖；失败 throw + `workflow:error.trace` 符合 spec §7.4。

## 合成说明

- code-reviewer：**COMMENT**（核心 spec 项通过，无 CRITICAL/HIGH）
- 架构状态：**WATCH**（replaceability 未用场景 E 验证；观测层耦合与 trace 语义需跟进）
- 最终结论：**建议**（依据 OMX：architect = WATCH → 建议）

阶段 7 **Core 契约实现可合并**；建议在标记阶段完成前处理 M2（失败 trace UI）、M3（MockAlternativeWorkflow），并评估 M1 对既有 Observer 消费者的影响。

## 检查项

### 安全

- [x] `ai-core` 无硬编码密钥、无 env 读取
- [x] trace `summary` 以计数/标志为主，未默认暴露完整 prompt
- [ ] trace / `toSafeMessage` 对 Provider 原始错误未做 redaction（低优先级跟进）

### 代码质量

- [x] `runWorkflowStep` 减少步骤发射重复，结构清晰
- [x] 抽象与实现分离（`workflow-trace.ts` / `workflow-trace-recorder.ts`）
- [ ] 单文件过大（`simple-chat-workflow.ts` ~1500 行）

### 性能

- [x] `includeTrace` 默认 false；仅 demo 默认开启
- [x] `timeoutMs` 不引入 AbortSignal 穿透开销

### 项目规范

- [x] 纯 SDK 边界保持
- [x] 与 `07-workflow-layer.md` 关键契约一致（step/workflowStep、throw、tool:list 关键路径、无 parallelReadSteps）
- [ ] 验收场景 E 未覆盖

### 架构

- [x] `ChatWorkflow` 可替换边界清晰（README 有 LangGraph 示例）
- [x] Provider 未反向依赖 WorkflowTrace
- [ ] 架构状态：**WATCH**（见上）

### 验证

- [x] `pnpm --filter @ying-companion/ai-core build` — 通过
- [ ] 未执行 demo 手工场景 A–E
- [ ] 无新增自动化测试（与 V1 约定一致）

## 备注

- 审查 commit：`a013327eac9e8c4d7da6c49ab70a2cf8581a45e8`
- 双车道 review 均已执行（code-reviewer + architect）
- positively：legacy `step` 字符串（`tool:model-generate-with-tools:start` 等）保留正确；`workflowStep` 新增符合 GPT/Cursor 修订后的 spec；写回路径 degraded 语义与改造前一致；README 已同步阶段 7 说明
