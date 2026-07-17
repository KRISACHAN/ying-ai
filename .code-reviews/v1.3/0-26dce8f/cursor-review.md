# 代码审查 — V1.3 Stage 01 story-core（26dce8f）

**日期：** 2026-07-17  
**审查工具：** Cursor  
**模型：** Composer  
**审查范围：** HEAD 最新提交 `26dce8f`  
**引用：** `git show 26dce8f848444a4c8a7fcb20bde96910428c4f67`（42 文件，+2924 行）  
**结论：** 建议

## 依据规范

- [AGENTS.md](../../../AGENTS.md)
- [docs/ai/core/principles.md](../../../docs/ai/core/principles.md)
- [docs/ai/core/working-agreements.md](../../../docs/ai/core/working-agreements.md)
- [docs/ai/core/verification.md](../../../docs/ai/core/verification.md)
- [docs/ai/core/project-context.md](../../../docs/ai/core/project-context.md)
- [.cursor/rules/ai-guide.mdc](../../../.cursor/rules/ai-guide.mdc)
- [.requirements/stages/v1.3/stage-01/01-story-domain-and-runtime-foundation.md](../../../.requirements/stages/v1.3/stage-01/01-story-domain-and-runtime-foundation.md)
- [packages/story-core/README.md](../../../packages/story-core/README.md)
- [eslint.config.mjs](../../../eslint.config.mjs) · [prettier.config.mjs](../../../prettier.config.mjs)

## 摘要

`26dce8f` 完成 V1.3 Stage 01 主体：`packages/story-core` 含 Definition/State 契约、双 Validator、内存 Provider、Fake/Model Planner·Renderer、`DefaultStoryWorkflow` 与 26 条离线契约脚本。`typecheck` / `lint` / `build` / `verify:story-contract` 均已通过；`ai-core` 未反向依赖 `story-core`，提交语义（失败不落库）实现正确。主要缺口在同批 changes 的**模拟态校验**不完整（场景切换 + 拾取物/新角色入场会误拒），以及 `revealedLoreIds` 尚未接入 Renderer 上下文。架构边界清晰，建议在合并前修复或显式收窄 batch 语义并补测。

## 审查统计

- 审查文件数：42（重点细读 18 个源文件 / 验证脚本）
- 问题总数：6（严重 0 / 高 2 / 中 2 / 低 2）
- code-reviewer 建议：COMMENT
- 架构状态：WATCH

## 问题清单

### 严重

无。

### 高

- [`packages/story-core/src/state/default-story-transition-validator.ts:104-128,131-158`] **同批 `set_scene` 未按模拟态校验 entry/exit 与 `set_character_present`**

  **复现：**
  1. 开局白鲸酒馆，背包为空。
  2. 同一 batch：`add_inventory_item(old-harbor-pass)` + `set_scene(old-harbor)` + 合法 present 调整。
  3. `validate()` 返回 `change.scene.entry`（entry 条件 `has_item` 仍读变更前 state）。

  另：`set_scene` 到旧港口并 `set_character_present(samuel, true)`（samuel 仅目标场景可用）会被 `change.character.unavailable` 拒绝，因 present 校验仍对照**当前**场景而非 batch 应用后的目标场景。

  **当前影响：** 规格 §6.1 / §8 允许「同批转场 + present 调整」；雾港「拾取通行证 → 进入旧港口 → 医生出场」一类单回合路径无法通过 Validator，Planner 只能拆成多回合或依赖回合前已落库状态。

  **修复建议：** 校验阶段对 batch 做**顺序模拟**（或先 `applyStoryStateChanges` 到临时 state 再跑逐条/终态规则）；`set_character_present(true)` 在含 `set_scene` 的 batch 中，应允许对照**目标场景** `availableCharacterIds`（以最终 `currentSceneId` 为准）。补测：上述两条路径 + 现有 case 25 回归。

- [`packages/story-core/src/workflow/default-story-workflow.ts:60-108`] **`plan.revealedLoreIds` 未影响 Renderer 上下文**

  `StoryTurnPlan` 含 `revealedLoreIds`，但 workflow 仅把 `LoreProvider.recall()` 结果传给 Renderer；`KeywordLoreProvider` 永久过滤 `secret: true`。雾港 fixture 中 `hidden-smuggler-route` 等秘密 Lore 即使被 Planner 标记揭示，也不会进入 `recalledLore`。

  **当前影响：** 秘密叙事链路在 Stage 01 仍不可用；与规格 Planner 职责（指定可揭示 Lore）和雾港种子设计不一致。

  **修复建议：** 在 workflow 中合并：`recalledLore` ∪ `definition.lore.filter(id ∈ plan.revealedLoreIds)`（并校验 id 存在于 snapshot）；或抽 `resolveLoreForRender({ recall, plan, definition })`。补一条契约测：revealed secret lore 进入 render 输入。

### 中

- [`.requirements/stages/v1.3/stage-01/01-story-domain-and-runtime-foundation.md` vs `packages/story-core/`] [规范: stage-01 §3 / §13] **种子故事位置与规格不一致**

  规格建议 `src/seeds/fog-harbor-mystery.ts` 并可被宿主引用；实现放在 `scripts/fixtures/`，README 明确「不导出任何 StoryDefinition」。契约覆盖足够，但 Demo/Stage 03 需重复拷贝或自建导入层。

  **修复建议：** 接受现状则在 stage 文档与 README 对齐为「契约夹具私有」；若希望宿主可复用，增加 `src/seeds/` 并从 `index.ts` 可选导出（或单独 `@ying-companion/story-core/seeds` 子路径）。

- [`packages/story-core/src/workflow/default-story-workflow.ts:88-92`] **Validator 失败以 throw 结束，无结构化可恢复错误**

  规格允许「非法 change 整批拒绝」；当前直接 `throw new Error(...)`，调用方难以区分「戏内拒绝」与「引擎错误」，Stage 02 事件层需再包一层。

  **修复建议：** 非阻塞；Stage 02 引入 `story:error` 前，可在 workflow 增加可选 `onValidationRejected` 或返回 `Result` 型 API。Stage 01 可暂记技术债。

### 低

- [`packages/story-core/scripts/verify-story-contract.ts`] **缺少「同批拾取 + 转场」与「目标场景专属角色入场」回归**

  现有 case 25 仅覆盖「回合前已持有通行证」的转场；未覆盖上述 HIGH 项路径，导致门禁未拦住回归。

- [`packages/story-core/src/providers/in-memory-story-session-provider.ts:25`] **`crypto.randomUUID()` 未注入**

  与 `idFactory` 可测试性不一致；verify 已注入 factory，生产宿主在极旧 Node 可能缺 global `crypto`。建议与 `now` 一样允许注入，或文档注明 Node 版本要求。

## 架构关注项

- [`packages/story-core/package.json` + `src/index.ts`] **CLEAR — 包边界正确**

  仅依赖 `@ying-companion/ai-core` + `zod`；不读 `process.env`；`ai-core` 无 `story-core` 引用；`SimpleChatWorkflow` 未改。符合 V1.3 硬约束。

- [`packages/story-core/src/workflow/default-story-workflow.ts:94-111`] **CLEAR — 提交语义正确**

  Planner / Validator / Renderer / Safety 任一失败均不 `saveState`；契约脚本 17–18 已覆盖 Renderer 与 Safety。

- [`packages/story-core/src/providers/in-memory-story-session-provider.ts:42-57`] **CLEAR — 开档冻结 snapshot**

  `cloneDefinition` + session 内 snapshot；`testSessionSnapshot` 证明热更新种子不影响已开档。

- [`packages/story-core/src/state/default-story-transition-validator.ts`] **WATCH — batch 校验应统一为「模拟终态」模型**

  终态 `validateFinalScenePresence` 已模拟 apply；逐条 op 与 scene condition 仍读 `currentState`，语义分裂是 HIGH 问题根因。

- [`packages/story-core/src/planner/model-story-planner.ts` + `model-story-renderer.ts`] **WATCH — Model 路径为可选加分**

  结构化输出 + Zod 解析失败显式报错，符合规格；prompt 仍较简，真实叙事质量留待 smoke（未实现，不挡 Stage 01）。

## 合成说明

- code-reviewer：COMMENT（门禁全绿、边界与契约主体达标；2 个 HIGH 为 gameplay 路径缺口）
- 架构状态：WATCH（batch 校验模型、revealed lore 接线）
- 最终结论：**建议**（可合并作 Stage 01 基线，但应优先修复同批转场校验或收窄文档语义，并规划 revealedLore 接线）

## 检查项

### 安全

- [x] `story-core` 不读 env、无硬编码密钥
- [x] Safety 可选注入；拒绝时不落库
- [x] 无任意 JSON path 写入；`set_attr` 受 Schema 约束

### 代码质量

- [x] 模块拆分清晰（abstractions / definition / state / workflow / providers）
- [x] Validator / apply / initialize 职责分离
- [ ] 同批校验与规格「转场 + present」语义未完全对齐

### 性能

- [x] 内存实现；无 N+1 / 外部 IO
- [x] 单回合 Validator 模拟 apply 一次，开销可接受

### 项目规范

- [x] `typecheck` / `lint` / `build` / `verify:story-contract` 通过
- [x] AGENTS.md / `.requirements/README.md` 已索引
- [x] README 说明边界与验证命令
- [ ] 种子目录与 stage 文档字面路径略有偏差（已文档化取舍）

### 架构

- [x] `story-core → ai-core` 单向依赖
- [x] Story State 不进 Companion Memory
- [x] 状态：WATCH

### 验证

- [x] 26 条离线契约全部 `ok`
- [x] 审查者复现：同批 `add_item + set_scene` 与 `samuel present` 失败（见 HIGH）
- [ ] 建议补测后重跑 `verify:story-contract`

## 备注

- 审查者本地执行：

```bash
pnpm --filter @ying-companion/story-core typecheck   # pass
pnpm --filter @ying-companion/story-core lint        # pass
pnpm --filter @ying-companion/story-core build       # pass
pnpm --filter @ying-companion/story-core verify:story-contract  # 26/26 ok
```

- 未审查：`apps/model-runtime-demo` 故事 UI（属 Stage 03）、`verify:story-model-smoke`（规格可选）。
- OMX 双车道由本审查者分车道自检完成（code-reviewer + architect），未委派外部子代理。
