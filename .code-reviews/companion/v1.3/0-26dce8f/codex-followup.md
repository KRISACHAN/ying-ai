# 代码审查复核 — V1.3 Stage 01 story-core

**日期：** 2026-07-17
**审查工具：** Codex
**模型：** GPT-5
**审查范围：** `.code-reviews/v1.3/0-26dce8f/cursor-review.md` 及当前实现
**引用：** `.code-reviews/v1.3/0-26dce8f/cursor-review.md`
**结论：** 建议

## 依据规范

- `AGENTS.md`
- `docs/ai/core/principles.md`
- `docs/ai/core/working-agreements.md`
- `docs/ai/core/verification.md`
- `.requirements/stages/v1.3/stage-01/01-story-domain-and-runtime-foundation.md`
- `packages/story-core/README.md`
- 用户补充边界：`story-core` 作为 Core SDK 不应内置或导出具体 `StoryDefinition`

## 摘要

Cursor 提出的 2 个 HIGH 均成立，已在本轮修复并补充离线契约回归。`set_scene` 现在使用 batch 候选态校验 entry 与最终在场角色，`revealedLoreIds` 也会合并进 Renderer 上下文并校验 id 存在。关于种子故事位置的建议不采纳，因为当前用户明确要求 Core 保持纯粹，具体故事只能作为外部输入或脚本私有 fixture。

## 审查统计

- 复核问题数：6
- 已采纳并修复：3
- 不成立：1
- 保留关注：2
- 未处理：0
- code-reviewer 建议：COMMENT
- 架构状态：WATCH

## 复核结论

### 已采纳并修复

- [`packages/story-core/src/state/default-story-transition-validator.ts`] 修复同批 `add_inventory_item + set_scene + set_character_present` 误拒问题。现在基础引用与冲突先校验，再构造候选终态；entry conditions 使用 `nextState`，目标场景专属角色入场按最终场景校验。
- [`packages/story-core/src/workflow/default-story-workflow.ts`] 修复 `plan.revealedLoreIds` 未进入 Renderer 上下文的问题。Workflow 会将 recall 结果与 `definition.lore` 中被显式揭示的 Lore 合并、去重、排序；未知 lore id 会抛错并阻止保存状态。
- [`packages/story-core/scripts/verify-story-contract.ts`] 补充回归：同批拾取通行证并转场、目标场景专属角色入场、secret lore 进入 Renderer、未知 revealed lore 拒绝且不保存。

### 不成立

- [`packages/story-core/scripts/fixtures/*`] “种子故事应放回 `src/seeds` 并导出”的建议不成立。用户已明确要求 `story-core` 不写死具体 `StoryDefinition`；当前 fixture 只服务离线契约脚本，不进入公共 `src/index.ts`，也不属于 SDK API。

### 保留关注

- [`packages/story-core/src/workflow/default-story-workflow.ts`] Validator 失败目前仍以 `throw Error` 返回。Stage 01 非流式最小闭环可接受；Stage 02 引入 Story Core Event / Wire Event 时应设计结构化可恢复错误。
- [`packages/story-core/src/providers/in-memory-story-session-provider.ts`] 默认 `idFactory` 使用 `crypto.randomUUID()`。当前 Node 运行环境可用，且已有可注入 `idFactory`；若后续支持更老宿主或非 Node runtime，再补 runtime capability 文档或默认 fallback。

### 未处理

无。

## 验证

- `pnpm --filter @ying-companion/story-core typecheck`：通过
- `pnpm --filter @ying-companion/story-core lint`：通过
- `pnpm --filter @ying-companion/story-core build`：通过
- `pnpm --filter @ying-companion/story-core verify:story-contract`：通过，新增 4 条回归后共 30 条 ok

## 合成说明

- code-reviewer：COMMENT
- 架构状态：WATCH
- 最终结论：**建议**。阻塞 gameplay 的两项 HIGH 已修复；剩余为 Stage 02 错误协议与运行时兼容性关注项，不阻塞当前 Stage 01 基线。
