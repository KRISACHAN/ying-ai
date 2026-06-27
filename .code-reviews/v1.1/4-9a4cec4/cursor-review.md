# 代码审查 — V1.1 Stage 4 SimpleChatWorkflow 步骤函数化重构

**日期：** 2026-06-27  
**审查工具：** Cursor  
**模型：** Composer  
**审查范围：** HEAD commit `9a4cec4`（`refactor(ai-core): 拆分聊天工作流步骤`）  
**引用：** `git show 9a4cec4` · 7 files · +870 / −490  
**结论：** 需修改

## 依据规范

- [AGENTS.md](../../../AGENTS.md)
- [docs/ai/core/principles.md](../../../docs/ai/core/principles.md)
- [docs/ai/core/working-agreements.md](../../../docs/ai/core/working-agreements.md)
- [docs/ai/core/verification.md](../../../docs/ai/core/verification.md)
- [docs/ai/core/project-context.md](../../../docs/ai/core/project-context.md)
- [.cursor/rules/ai-guide.mdc](../../../.cursor/rules/ai-guide.mdc)
- [.requirements/stages/v1.1/stage-04/04-workflow-step-refactor.md](../../../.requirements/stages/v1.1/stage-04/04-workflow-step-refactor.md)

> **双通道说明：** 已按 code-reviewer + architect 双车道并行审查（子 agent 集成）；两车道均指出 `DefaultToolPlanningProvider` 构造期 model 回退与 Stage 4 §5.1 冲突。

## 摘要

Commit `9a4cec4` 完成了 Stage 4 核心目标：`SimpleChatWorkflow.execute()` 拆为共享步骤、`tool:plan` 接入、`plan → execute → final generate` 替代 `generateWithTools`、`final generate` 不传 `tools`、`ChatWorkflowDebugContext` 增量字段与 `plannerUnavailableSource` 均已落地。`pnpm typecheck`、`pnpm lint`、`pnpm build --filter @ying-companion/ai-core` 全量通过。

主要阻塞项：`DefaultToolPlanningProvider` 仍保留 `(this.model ?? input.model)` 构造期绑定回退，与 Stage 4 文档「planner 必须使用本次 `context.core.model`」直接冲突。修复该点后，其余为文档/可维护性层面的低优先级建议。

## 审查统计

- 审查文件数：7（commit 变更全集）
- 问题总数：5（严重 0 / 高 1 / 中 0 / 低 4）
- code-reviewer 建议：**REQUEST CHANGES**
- 架构状态：**BLOCK**

## 问题清单

### 严重

无。

### 高

- [`packages/ai-core/src/implementations/tool-planning/default-tool-planning-provider.ts:31-43`] **Planner 仍可在运行时覆盖 request-scoped model**

  **当前行为：** 构造器可选保存 `this.model`，`plan()` 使用 `(this.model ?? input.model).generate(...)`。若调用方传入已绑模型的 `DefaultToolPlanningProvider({ model })`（Stage 3 遗留写法或 Demo 手工验收），planner 会忽略 `input.model`（即 `context.core.model`）。

  **与规范冲突：** Stage 4 §5.1 明确禁止构造期绑定固定 model，并要求每次规划使用当前请求的 `context.core.model`。

  **修复建议：** 使 `DefaultToolPlanningProvider` 完全无状态，**始终**使用 `input.model.generate(...)`；构造器 `model` 选项仅保留 `@deprecated` 签名或删除，但不得在 runtime 参与分支。

  ```ts
  public async plan(input: ToolPlanningInput): Promise<ToolPlan> {
    // ...
    const output = await input.model.generate({ ... });
  }
  ```

  [规范: `.requirements/stages/v1.1/stage-04/04-workflow-step-refactor.md` §5.1]

### 中

无。

### 低

- [`packages/ai-core/src/implementations/workflow/simple-chat-workflow.ts:128-131`] **类级注释编排顺序不完整**

  注释写「ToolPlanning → Safety(output)」，遗漏 `Prompt:build`、`Tool:execute`、`Final Generate`。不影响运行，但会误导后续 Stage 5 维护者。

- [`packages/ai-core/src/implementations/workflow/simple-chat-workflow.ts:545`] **`toToolPlanningState(normalized, "execution_failed")` 语义误导**

  成功路径（含 `tool_calls`）也传入 `"execution_failed"`，虽因 `toToolPlanningState` 内部条件未泄漏到 debug，但增加阅读成本。建议成功路径不传第二参数，仅在 catch / `planner_unavailable` 分支传入。

- [`packages/ai-core/README.md`] **package README 未同步 Stage 4 行为**

  commit 未更新 README：`SimpleChatWorkflowOptions`、`ToolPlanningInput.model`、新编排顺序（`tool:plan` → final generate）仍描述为 Stage 3 语境。Stage 4 完成标准含文档同步（可留 Stage 7，但当前 README 已部分过时）。

- [`packages/ai-core/src/implementations/workflow/simple-chat-workflow.ts`] **单文件 1804 行，未拆 `workflow-steps.ts`**

  步骤函数化已在逻辑上完成，但 state + 全部 step + helper 仍在一个文件。Stage 4 文档将拆分标为可选，不构成阻塞；Stage 5 接入 `stream()` 前建议拆模块以降低双路径漂移风险。

  [规范: docs/ai/core/working-agreements.md — 控制复杂度]

## 架构关注项

- [`default-tool-planning-provider.ts:31-43`] **BLOCK** — 构造期 model 回退破坏 request-scoped 模型边界；是 Stage 5 流式与多宿主场景下的隐性耦合点。

- [`simple-chat-workflow.ts:176-190`] **CLEAR** — `execute()` 仅编排，步骤边界清晰：`Tool:list → Prompt → Tool:plan → Tool:execute → Final Generate → Writeback`，与 Stage 4 §9 一致。

- [`simple-chat-workflow.ts:496-535`] **CLEAR** — `runToolPlanningStep` 正确将 `context.core.model` 传入 `planner.plan({ model, ... })`；`planner === null` 时 `not_configured` 语义正确。

- [`simple-chat-workflow.ts:659-681`] **CLEAR** — `runFinalGenerateStep` 仅一次 `model:generate`，不传 `tools`；未 emit `model:follow-up-generate`。

- [`simple-chat-workflow.ts:650-655`] **CLEAR** — `buildToolFollowUpMessages(..., "", ...)` 符合「不依赖 planner 自然语言」约束。

- [`simple-chat-workflow.ts` 整体体量] **WATCH** — 1804 行单文件；Stage 5 复用步骤时建议拆 `workflow-execution-state.ts` / `workflow-steps.ts`。

## Stage 4 验收对照（代码层）

| 检查项                                      | 结果               |
| ------------------------------------------- | ------------------ |
| `tool:plan` Trace                           | ✅                 |
| final generate 不传 `tools`                 | ✅                 |
| planner 使用 `context.core.model`（主路径） | ✅                 |
| planner 不被构造期 model 覆盖               | ❌（见高优先级项） |
| `plannerUnavailableSource`                  | ✅                 |
| 无 `ChatModel.stream()`                     | ✅                 |
| `ChatWorkflowOutput` 字段兼容 + 增量 debug  | ✅                 |
| ai-core 不读 env                            | ✅                 |
| 无 `model:follow-up-generate` 新 emit       | ✅                 |

## 合成说明

- code-reviewer：**REQUEST CHANGES**（1 项高优先级：planner model 绑定回退）
- 架构状态：**BLOCK**（同上，违反 Stage 4 §5.1 边界）
- 最终结论：**需修改**（依据 OMX 合成规则：architect=BLOCK → 需修改）

## 检查项

### 安全

- [x] 无硬编码密钥；无新增注入面
- [x] Safety 拒绝仍抛错，不写回

### 代码质量

- [x] 步骤函数化、state 收口逻辑清晰
- [ ] 单文件过大（低优先级 WATCH）
- [ ] 类注释与 `toToolPlanningState` 调用语义（低）

### 性能

- [x] 无额外模型调用；plan + 1× final generate（符合设计）

### 项目规范

- [x] 不读 env、不写 console
- [x] typecheck / lint / build 通过
- [ ] README 未同步（低）

### 架构

- [ ] planner 构造期 model 回退须移除（BLOCK）
- [x] ToolPlanningProvider 不进 CompanionCoreContext
- [x] Debug Context 从 state 构建

### 验证

- [x] `pnpm typecheck` — 5 tasks successful
- [x] `pnpm lint` — 5 tasks successful
- [x] `pnpm build --filter @ying-companion/ai-core` — successful
- [ ] Demo / 人工验收场景（§12）— 本审查未跑 Demo，建议合入前按 stage-04 文档走一遍

## 备注

- 修复 `DefaultToolPlanningProvider` 后，建议使用 `SimpleChatWorkflow({ toolPlanningProvider: null })` 与默认 planner 各跑一条 §12.5 / §12.6 场景，确认 `plannerUnavailableSource` 与 model 来源。
- 未审查 `apps/model-runtime-demo` 变更（本 commit 未涉及）。
