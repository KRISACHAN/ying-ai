# 代码审查 — V1.3 Stage 03 Story Workbench（f4a17e1）

**日期：** 2026-07-23  
**审查工具：** Cursor  
**模型：** Composer  
**审查范围：** HEAD 最新提交 `f4a17e1`  
**引用：** `git show f4a17e10a1d2da60048d65b5c9de357517de0f93`（41 文件，+3138 / −69）  
**结论：** 需修改

## 依据规范

- [AGENTS.md](../../../AGENTS.md)
- [docs/ai/core/principles.md](../../../docs/ai/core/principles.md)
- [docs/ai/core/working-agreements.md](../../../docs/ai/core/working-agreements.md)
- [docs/ai/core/verification.md](../../../docs/ai/core/verification.md)
- [docs/ai/core/project-context.md](../../../docs/ai/core/project-context.md)
- [docs/ai/core/git-protocol.md](../../../docs/ai/core/git-protocol.md)
- [.cursor/rules/ai-guide.mdc](../../../.cursor/rules/ai-guide.mdc)
- [.requirements/stages/v1.3/stage-03/03-story-workbench-and-release-closure.md](../../../.requirements/stages/v1.3/stage-03/03-story-workbench-and-release-closure.md)
- [apps/model-runtime-demo/README.md](../../../apps/model-runtime-demo/README.md)
- [packages/story-core/README.md](../../../packages/story-core/README.md)
- [eslint.config.mjs](../../../eslint.config.mjs) · [prettier.config.mjs](../../../prettier.config.mjs)

## 摘要

`f4a17e1` 完成 Stage 03 主体：`/stories` Workbench、Story Wire/Transport/UI Adapter、Postgres 完整注入的 `story-runtime-factory`、ModelStoryPlanner/Renderer 接入、种子导出与三类 verify 脚本。离线契约与相关 typecheck 已通过；Factory 正确避免了 Stage 02 的 split-brain。主要缺口是 **失败回合后 UI 强制刷新为 `success`**，以及 **ModelStoryPlanner 把完整 `StoryDefinition`（含全部 secret lore）塞进模型上下文，使 KeywordLoreProvider 的可见性门控失效**。架构边界总体成立，但这两处需改后再合。

## 审查统计

- 审查文件数：约 28（重点细读 factory / wire / messages route / workspace / planner / renderer / verify）
- 问题总数：6（严重 0 / 高 2 / 中 3 / 低 1）
- code-reviewer 建议：REQUEST CHANGES
- 架构状态：WATCH

## 问题清单

### 严重

无。

### 高

- [`apps/model-runtime-demo/app/story-runtime-workspace.tsx:114-120`] [规范: stage-03 §11.3 H / §14] **失败或 validation-failed 后仍调用 `refreshDetail()`，并把状态强制写成 `success`**

  `send()` 在流式循环结束后无条件 `await refreshDetail()`；而 `refreshDetail()` 末尾固定 `setStatus("success")`。Workflow 在校验失败时会先发 `story:validation-failed` / `story:error`（adapter 已标为 `validation_failed` / `failed`），随后被刷新覆盖。

  **复现路径：** 构造会触发 `STORY_STATE_CHANGE_REJECTED` 的行动 → UI 短暂显示错误 → 刷新完成后状态栏变回「成功」，且乐观 user/assistant 气泡被服务端历史替换掉。

  **当前影响：** Stage 03 手工验收 H（validator-failure 可见错误态）不可靠；操作者难以区分失败与成功。

  **修复建议：** 仅在本轮以 `story:finish` 正常结束时刷新；若收到 `story:error` / `validation_failed`，保留错误态，可选只拉 state/revision 而不改写 `status`。

- [`packages/story-core/src/planner/model-story-planner.ts:31-41`] [规范: stage-03 / Lore 可见性；stage-02 KeywordLoreProvider] **Planner prompt 序列化整个 `input.definition`，绕过 recalled lore 门控**

  user 消息现为 `story: input.definition`，其中包含完整 `lore[]`（含 `secret: true` 的 `hidden-smuggler-route` 等），同时又额外传入已过滤的 `recalledLore`。`KeywordLoreProvider` 的 `planner_only` / scene / activation 预算对模型实际可见内容变为装饰。

  Renderer 路径仍经 `getRendererLore()` 过滤，但 Planner 可在自由文本字段（`narrativeBeat` / `responseGuidance`）中复述未揭示秘密；Validator 只校验结构化 `stateChanges` / `revealedLoreIds`，不拦内容泄露。

  **修复建议：** 恢复 curated projection（scenes / public character fields / catalogs / attributes），lore 只依赖 `recalledLore`；若确需让 Planner 看 secret，应显式文档化并配套内容级护栏，而不是整份 Definition 透传。

### 中

- [`apps/model-runtime-demo/app/lib/story-attribute-key.ts:3-22`] [规范: stage-03 §4.2；working-agreements] **重复实现 `createStoryAttributeStorageKey`，未复用 story-core 导出**

  `packages/story-core/src/index.ts` 已 `export * from "./state/story-attribute-key"`；demo 侧拷贝了同逻辑。今日行为正确，但未来 scope 规则变更会导致 UI 读键与 Validator 写键静默分叉。

  **修复建议：** 删除 demo 副本，改为 `import { createStoryAttributeStorageKey } from "@ying-companion/story-core"`。

- [`apps/model-runtime-demo/app/lib/story-stream-wire.ts:161-179` + `story-runtime-workspace.tsx:306-308`] **Wire 原样透传 `story:lore-recalled`（含 `planner_only` 全文）到同页 Debug**

  Debug Workbench 需要 Recalled Lore 属预期；但当前映射对未来 `apps/web` 复用同一 Wire 契约是危险先例，且与「隐藏信息不提前泄露」验收语意边界模糊。

  **修复建议：** Wire 层至少标注/剥离 `planner_only.content`，或拆分 `debug-only` 载荷；README 写明 Demo Debug 故意可见，产品宿主不得照搬。

- [`packages/story-core/src/workflow/default-story-workflow.ts:329-334` + Debug「Accepted Changes」] **`story:state-prepared` 不含已接受的 change 列表**

  面板依赖 `state-prepared` 展示 Accepted Changes，但事件仅有 revision / `stateChanged`。实际接受集在 validation 后的 `validation.changes`，与 plan 原始 `stateChanges` 可能不同（含自动 `add_revealed_lore`）。

  **修复建议：** 在 `state-prepared` 增加 `appliedChanges`，或 Debug 明确改读校验后的 plan/committed 快照。

### 低

- [`apps/model-runtime-demo/app/api/stories/import/route.ts:18-22`] **JSON 导入仅校验、`persisted: false`，无法据此开档**

  UI 已说明「仅预览导入」；符合 Stage 03「完整创作台非门禁」。保留为已知范围限制即可，不必阻塞合入。

## 架构关注项

- [`apps/model-runtime-demo/app/lib/story-runtime-factory.ts:92-143`] **CLEAR** — Session/State/Message/Summary/TurnRepository/Committer 均来自同一 `pool`，无部分 Postgres + 默认 InMemory 混用；env 仅在 Demo 读取。Stage 02 split-brain 关注已关闭。
- [`packages/story-core/src/planner/model-story-planner.ts:33`] **WATCH** — 域内 prompt 组装回归削弱 Lore 门控意图；不构成包边界违规，但是否批准的主要架构理由。
- [`apps/model-runtime-demo/app/lib/story-attribute-key.ts`] **WATCH** — 跨包规则双源；建议尽快收敛到 story-core 单源。
- [`apps/model-runtime-demo/app/lib/story-stream-wire.ts`] **WATCH** — Core→Wire 对 lore 过宽透传，长期复用风险。

## 合成说明

- code-reviewer：REQUEST CHANGES（2 个 High）
- 架构状态：WATCH
- 最终结论：**需修改**（依据 OMX 合成规则：code-reviewer = REQUEST CHANGES）

## 检查项

### 安全

- [x] 无硬编码密钥；Demo 无鉴权符合 V1 边界
- [ ] Planner / Wire 路径对 secret lore 的可见性需收紧或显式文档化

### 代码质量

- [x] 整体结构清晰，平行 Companion NDJSON 模式
- [ ] attribute key 重复实现应删除

### 性能

- [x] 未见明显 N+1；session detail 使用 Promise.all

### 项目规范

- [x] Core ≠ Wire；story-core / story-postgres 不读 env
- [x] AGENTS.md / demo README 已更新 V1.3 Stage 03
- [ ] Stage 03 失败态验收与 Lore 门控语义未完全满足

### 架构

- [x] 边界与 factory 注入正确；状态为 WATCH

### 验证

- [x] `pnpm --filter @ying-companion/model-runtime-demo verify:story-stream-contract` → ok
- [x] `pnpm --filter @ying-companion/model-runtime-demo verify:story-ui-adapter` → ok
- [x] `pnpm --filter @ying-companion/model-runtime-demo verify:story-workbench-planner` → ok
- [x] `pnpm turbo run typecheck --filter @ying-companion/model-runtime-demo --filter @ying-companion/story-core --filter @ying-companion/model-ollama` → 8/8 successful
- [ ] 未跑完整 `pnpm lint` / `pnpm build` / 真模型手工游玩 / story-postgres recovery（本机审查范围外）

## 备注

- 双车道：code-reviewer 由本审查直接执行；architect 车道由独立子代理完成（状态 WATCH）。
- 做得好的部分：路由与 API 形状对齐 stage-03、动态 attrs 用 storage key（虽为副本）、Model Planner/Renderer 默认接入、Ollama structured JSON fence 解析、种子从 story-core 导出、文档与 AGENTS 快照已更新。
- 建议优先修复两个 High，再合入；Medium 可同 PR 或紧随 follow-up。
