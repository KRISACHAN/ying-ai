# 代码审查 — V1.1 Stage 3 模型能力档案与工具规划

**日期：** 2026-06-27  
**审查工具：** Cursor  
**模型：** Composer  
**审查范围：** HEAD commit `7b56cb0`（`feat(ai-core): 增加模型能力档案与工具规划策略`）  
**引用：** `git show 7b56cb0` · 20 files · +782 / −86  
**结论：** 需修改

## 依据规范

- [AGENTS.md](../../../AGENTS.md)
- [docs/ai/core/principles.md](../../../docs/ai/core/principles.md)
- [docs/ai/core/working-agreements.md](../../../docs/ai/core/working-agreements.md)
- [docs/ai/core/verification.md](../../../docs/ai/core/verification.md)
- [docs/ai/core/project-context.md](../../../docs/ai/core/project-context.md)
- [.requirements/stages/v1.1/stage-03/03-model-provider-strategy.md](../../../.requirements/stages/v1.1/stage-03/03-model-provider-strategy.md)

> **双通道说明：** Cursor Task 不支持 `code-reviewer` / `architect` 子 agent 并行委托；以下结论由本审查按双车道维度集成完成。

## 摘要

Commit `7b56cb0` 整体对齐 Stage 3 文档：`ModelProfile` / `requiredCapabilities` / `ModelCapabilityUnavailableError`、`OpenAI-compatible` 能力筛选、Demo 侧 Registry、`DefaultToolPlanningProvider` 与 `executeWorkflow()` 未改主链路均符合边界。`pnpm typecheck` 与 `pnpm lint` 全量通过。

主要阻塞项在 `createFinalModelError()`：当部分候选因能力不足被 skip、但仍有候选实际发起请求并失败时，错误类型被误判为 `ModelCapabilityUnavailableError` 而非 `ModelRuntimeError`，与 §6.3 三类结果划分冲突，也会影响 Stage 5 的 `workflow:error` 路由。修复该逻辑后可进入 Stage 4。

## 审查统计

- 审查文件数：20（commit 变更全集）
- 问题总数：6（严重 0 / 高 1 / 中 2 / 低 3）
- code-reviewer 建议：**REQUEST CHANGES**
- 架构状态：**WATCH**

## 问题清单

### 严重

无。

### 高

- [`packages/ai-core/src/implementations/model/openai.ts:475-490`] **`createFinalModelError` 错误类型误判**

  **复现路径：**
  1. 配置 `requiredCapabilities: { streaming: true }`；
  2. primary 因能力不足被 skip（写入 `capabilitySkips`）；
  3. fallback 满足能力但网络/限流失败（写入 `errors`）。

  **当前行为：** 因 `capabilitySkips.length > 0`，抛出 `ModelCapabilityUnavailableError`（消息为 “No compatible fallback model is available after model runtime failures.”）。

  **期望行为：** 已有真实请求失败记录时，应抛出 `ModelRuntimeError`，并将 `capabilitySkips` 附在第三个构造参数（已实现）上。

  对称问题也存在于「primary 请求失败 + fallback 因能力不足 skip」场景。

  **修复建议：**

  ```ts
  function createFinalModelError(
    requiredCapabilities: RequiredModelCapabilities,
    state: RuntimeState,
  ): Error {
    if (state.errors.length > 0) {
      return createModelRuntimeError(state);
    }

    if (state.capabilitySkips.length > 0) {
      return new ModelCapabilityUnavailableError(
        "No model candidate satisfies the required capabilities.",
        requiredCapabilities,
        state.capabilitySkips,
      );
    }

    return createModelRuntimeError(state);
  }
  ```

  [规范: `.requirements/stages/v1.1/stage-03/03-model-provider-strategy.md` §6.2–§6.3]

### 中

- [Stage 3 交付物] **§10.5 人工验收 / Review 归档未随 commit 完成**

  `.code-reviews/v1.1/` 下尚无 Stage 3 验收记录；commit 也未包含 §11 场景的可复现证据。Stage 文档将此项列为完成标准。

  **修复建议：** 修复 HIGH 项后，在 Demo `/debug/model-runtime` 或脚本中跑 §11.2–11.11 关键场景，将结果写入本目录的 follow-up 或 stage review 附录。

- [`packages/ai-core/src/implementations/model/openai.ts:267-272`] **`model` 覆盖缺省能力时误用 `ModelCapabilityUnavailableError`**

  `createPrimaryProfileForInput()` 在缺少 `modelProfileOverride.capabilities` 时抛出 `ModelCapabilityUnavailableError`，但 `capabilitySkips` 为空。这是配置/契约校验错误，不是「能力不可用」语义，Demo 侧 `toSafeMessage` 与 Stage 5 错误路由可能误解。

  **修复建议：** 改用独立 `Error`（如 `InvalidModelOverrideError`）或至少使用明确 message + 不归类为 capability skip。

### 低

- [`apps/model-runtime-demo/app/lib/model-factory.ts:57-61`] **`createConfiguredModel()` 每次新建 Registry**

  每次 chat / model-runtime 请求都 `new ModelAdapterRegistry()`，无功能问题，但重复注册 strategy。可缓存单例 registry（非阻塞）。

- [`packages/ai-core/src/implementations/tool-planning/default-tool-planning-provider.ts:43`] **`ToolPlanningInput.model` 未配套 `modelProfileOverride`**

  若调用方传入 `model`，会触发上文配置错误或被误判为 `tool_calling_unavailable`。当前默认路径未使用该字段；建议在类型或实现上标注 deprecated / 禁止传递。

- [`apps/model-runtime-demo/app/lib/model-factory.ts:112-120`] **`profileSatisfiesCapabilities` 与 Adapter 内逻辑重复**

  strict 模式校验与 `openai.ts` 各有一份相同布尔逻辑，长期可能漂移（DRY）。

## 架构关注项

- [`packages/ai-core/src/implementations/model/openai.ts:475-490`] **WATCH** — 错误类型边界直接影响 Stage 5 `streamWorkflow` 在「部分 skip + 部分 runtime 失败」时的终止语义；修复 HIGH 项后状态可升为 CLEAR。

- [`packages/ai-core/src/implementations/tool-planning/default-tool-planning-provider.ts`] **WATCH** — 规划器未接入 Workflow / Demo UI，符合 §8.6；Stage 4 接入时需确认 Demo 默认 `toolCalling=false` 下工具规划验收路径（env 显式开启）。

- [`apps/model-runtime-demo/app/lib/model-factory.ts`] **CLEAR** — Registry 留在宿主、ai-core 保留 `createModel()` 快捷入口，与 §7.5 一致；未污染 `CompanionCoreContext`。

- [`packages/ai-core/src/implementations/workflow/simple-chat-workflow.ts`] **CLEAR** — 本 commit 未修改，满足「Stage 3 不改变 execute 行为」。

## 合成说明

- code-reviewer：**REQUEST CHANGES**（1 个高级别错误语义 bug + 验收归档缺失）
- 架构状态：**WATCH**（错误分类影响后续流式阶段；Registry / DI 边界 otherwise CLEAR）
- 最终结论：**需修改**（依据 OMX：code-reviewer = REQUEST CHANGES）

## 检查项

### 安全

- [x] API Key 经 `maskSecret` 脱敏；model-runtime / chat 未写入 trace 明文
- [x] 无硬编码密钥；ai-core 不读 `process.env`
- [x] runtime 错误消息截断（240 字符）

### 代码质量

- [x] 类型与导出结构清晰（`ModelProfileOverride`、tool-planning 抽象）
- [ ] `createFinalModelError` 三分支语义需修正
- [x] `pnpm typecheck` / `pnpm lint` 通过

### 性能

- [x] 无 N+1 或明显热点（Registry 重复创建为 LOW）

### 项目规范

- [x] Core 不读 env；宿主 Registry 模式
- [x] `WorkflowStepName` 已预留 `tool:plan`
- [x] `ToolPlanningProvider` 未进入 `createCompanionCore` DI
- [ ] Stage 3 §10.5 Review 归档待补

### 架构

- [x] 与 Stage 3 文档边界一致（无 Ollama、无 Workflow 流式改造）
- [ ] 混合 skip + runtime 失败的错误类型需统一（WATCH）

### 验证

- [x] `pnpm typecheck` — 5 tasks successful
- [x] `pnpm lint` — 5 tasks successful
- [ ] §11 人工验收场景 — 未见 commit 内证据

## 备注

**做得好的部分（无需改架构）：**

- `ModelProfile` + `ModelProfileOverride` 分离，OpenAI-compatible 保守默认 `{ streaming: true, toolCalling: false, usage: false }`
- `stream()` 自动合并 `requiredCapabilities.streaming = true`
- `DefaultToolPlanningProvider` 正确捕获 `ModelCapabilityUnavailableError` 并降级为 `no_tool`
- Demo `model-runtime` 展示 Effective Profile / capability skips
- `ModelRuntimeError` 可选携带 `capabilitySkips`，为修复 HIGH 项提供基础

**建议验证命令（修复后）：**

```bash
pnpm typecheck
pnpm lint
# Demo: POST /api/model-runtime，配置 primary streaming=true、fallback streaming=false，观察 capability skip
# 脚本或 REPL: new DefaultToolPlanningProvider({ model }) 跑 §11.4–11.7
```
