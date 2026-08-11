# 代码审查 — V1.1 阶段 1 Persona Profile（commit f4c52ae）

**日期：** 2026-06-21  
**审查工具：** Cursor  
**模型：** claude-4.6-sonnet-medium-thinking  
**审查范围：** HEAD 最新提交 `f4c52ae`  
**引用：** `git show f4c52ae` · `feat(v1.1): 实现 Persona Profile 扩展与 Prompt 预览`  
**结论：** 建议

---

## 依据规范

- [`AGENTS.md`](../../../AGENTS.md)
- [`docs/ai/core/principles.md`](../../../docs/ai/core/principles.md)
- [`docs/ai/core/working-agreements.md`](../../../docs/ai/core/working-agreements.md)
- [`docs/ai/core/verification.md`](../../../docs/ai/core/verification.md)
- [`docs/ai/core/project-context.md`](../../../docs/ai/core/project-context.md)
- [`docs/ai/core/git-protocol.md`](../../../docs/ai/core/git-protocol.md)
- [`.cursor/rules/ai-guide.mdc`](../../../.cursor/rules/ai-guide.mdc)
- [`.cursor/rules/project-context.mdc`](../../../.cursor/rules/project-context.mdc)
- [`eslint.config.mjs`](../../../eslint.config.mjs)
- [`prettier.config.mjs`](../../../prettier.config.mjs)
- [`apps/model-runtime-demo/README.md`](../../../apps/model-runtime-demo/README.md)
- [`.requirements/stages/v1.1/stage-01/01-persona-profile.md`](../../../.requirements/stages/v1.1/stage-01/01-persona-profile.md)

> **双通道说明：** Cursor Task 工具不支持 `code-reviewer` / `architect` 子 agent 并行委托；以下 code-reviewer 与 architect 结论由本审查按双通道维度集成完成。

---

## 摘要

本次提交完整落地 V1.1 阶段 1 的核心交付：`CompanionPersona` 扩展、`persona-prompt-builder` 纯函数、`ChatWorkflowDebugContext.personaPrompt`、Demo 表单与 PostgreSQL schema、移除旧 `userAddress` workaround，并补齐 Prompt 预览面板。整体与 stage 01 规格高度一致，Core 边界（不读 env、不碰 DB）保持清晰。

`pnpm typecheck` 与 `pnpm lint` 全量通过。未发现安全或数据迁移层面的阻塞缺陷；主要关注点是 **运行时自动 migration 与文档不一致**、**schema 补齐失败不可重试**、以及 **Demo/Core 双侧 normalize 逻辑重复**。架构上 `personaPrompt` 成为 debug 契约必填字段，对自定义 Workflow 实现有轻微 breaking 风险。

---

## 审查统计

- 审查文件数：19（commit 变更）+ 关键调用链交叉阅读
- 问题总数：7（严重 0 / 高 0 / 中 2 / 低 5）
- code-reviewer 建议：**COMMENT**
- 架构状态：**WATCH**

---

## 问题清单

### 严重

无。

### 高

无。

### 中

- [`apps/model-runtime-demo/app/lib/debug-db.ts:33-38`] **`ensureDebugWorkspaceSchema` 失败后被永久缓存** — `schemaReady` 在首次 `pool.query()` 失败后仍保持 rejected Promise，同进程内后续所有 companion 读写都会失败，直到重启 dev server。

  **当前影响：** 若本地 DB 权限不足、表不存在、或 SQL 语法在特定 PG 版本失败，错误表现为持续 400，不易定位。

  **修复建议：** 在 `catch` 中将 `schemaReady = undefined` 以便下次重试；或区分「已成功」与「进行中」两个 flag，失败时抛出带明确文案的错误（例如提示执行 `0002` migration）。

- [`apps/model-runtime-demo/README.md:58-62`] **运行时 auto-migration 未在文档说明** — 代码已在 `DebugRepository.ready()` 中自动执行 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`，但 README 仍只描述手动 `psql -f 0002`。这与 stage 01 §7.3「固定 migration」并存，但开发者可能不知道应用会隐式改 schema。

  **修复建议：** 在 `apps/model-runtime-demo/README.md` 增加一句：首次 companion 读写会自动补齐 V1.1 列；手动 migration 仍推荐用于 CI/新环境初始化。

  [规范: `.requirements/stages/v1.1/stage-01/01-persona-profile.md` §7.3]

### 低

- [`packages/ai-core/src/implementations/persona/persona-prompt-builder.ts:112-114`] **重复 normalize** — `buildPersonaSystemPrompt` 已调用 `normalizeCompanionPersona`，内部 `buildPersonaPrompt` 再次 normalize。行为正确但多余。

  **修复建议：** `buildPersonaPrompt` 文档注明「输入应为已 normalize 的 Persona」，或拆分为 internal `_buildPersonaPromptFromNormalized` 避免双次遍历。

- [`apps/model-runtime-demo/app/lib/debug-repository.ts:915-1009`] **Demo 侧 normalize 与 Core 重复** — `normalizeCompanionProfile` / `normalizeCompanionAppearance` / `normalizeAdditionalTraits` 与 `persona-prompt-builder.ts` 规则高度相似。

  **当前影响：** 可维护性风险；两侧规则漂移时 Demo 存库与 Core Prompt 可能不一致。

  **修复建议：** Demo 保存时可复用 `@ying-companion/ai-core` 的 `normalizeCompanionPersona`（将 `DebugCompanion` 映射为 `CompanionPersona` 后 normalize），DB 层只负责序列化。

- [`packages/ai-core/src/implementations/persona/default-persona-provider.ts:42-56`] **空对象/空字符串仍透传** — `userDisplayName: ""`、`profile: {}` 等在 Provider 层仍写入返回值，依赖 Workflow 内 normalize 兜底。

  **修复建议：** Provider `load()` 末尾调用 `normalizeCompanionPersona` 统一出口，减少 observer 中 `persona:load` 事件携带脏数据的可能。

- [`apps/model-runtime-demo/app/api/chat/route.ts:255-262`] **Legacy `/api/chat` 仍用硬编码 Persona** — 未接入 DB companion 或 V1.1 字段；与 Stage 8 主路径不一致。

  **当前影响：** 非阻塞（路由已标注 legacy）；但若有人仍用该入口验证 Persona，会误判阶段 1 未生效。

  **修复建议：** README 或路由注释明确「Persona Profile 验收请走 `/conversations/*`」。

- [全仓库] **无 `persona-prompt-builder` 单元测试** — 阶段 1 规格允许人工验收，但 `[设定优先级]`、空值过滤、冲突场景 G 等纯函数逻辑非常适合低成本单测。

  **修复建议：** 后续 patch 为 `normalizeCompanionPersona` / `buildPersonaPrompt` 补 5～8 条边界用例（最高 ROI）。

  [规范: `docs/ai/core/verification.md`]

---

## 架构关注项

- [`packages/ai-core/src/abstractions/workflow.ts:91`] **WATCH** — `ChatWorkflowDebugContext.personaPrompt` 从 optional 变为 **必填** `string`。自定义 `ChatWorkflow` 实现若未填充该字段，Demo Prompt Panel 与类型检查（宿主侧）可能出错。当前仅 `SimpleChatWorkflow` 生产该字段，可接受，但应在 `ChatWorkflowDebugContext` JSDoc 标注「由标准 Workflow 填充，自定义实现应同步」。

- [`apps/model-runtime-demo/app/lib/debug-db.ts:8-16`] **WATCH** — 应用启动后隐式 DDL 降低了本地上手成本，但也让「schema 版本」脱离显式 migration 审计。长期建议：保留 auto-ensure 作为 dev 便利，生产宿主仍走显式 migration。

- [`packages/ai-core/src/implementations/persona/persona-prompt-builder.ts`] **CLEAR** — Persona 段落与 system prompt 拆分、导出 `buildPersonaPrompt` / `normalizeCompanionPersona`、`output.persona` 返回 Effective Persona，边界清晰，符合 stage 01 设计。

- [`apps/model-runtime-demo/app/lib/companion-runtime.ts:73-94`] **CLEAR** — 已移除 `buildHostPersonaSystemPrompt` 称呼注入，`customInstructions → systemPrompt` 映射正确，与场景 F 一致。

---

## 合成说明

- code-reviewer：**COMMENT**（无严重/高级别问题；2 个中级别为运维/文档类，5 个低级别为可维护性与测试缺口）
- 架构状态：**WATCH**（auto-migration 与 debug 契约必填字段需记录，无 BLOCK）
- 最终结论：**建议**（依据 OMX 合成规则：architect=WATCH → 建议）

---

## 检查项

### 安全

- [x] 无硬编码密钥
- [x] Persona 字符串字段经 trim / 过滤；JSONB 读写经 parameterized query
- [x] 无 XSS/CSRF 新增面（服务端 prompt 构建）

### 代码质量

- [x] Prompt 构建抽离为纯函数，Workflow 改动可控
- [ ] Demo/Core normalize 重复（低）
- [ ] 双次 normalize（低）

### 性能

- [x] schema ensure 单次缓存；Prompt 构建 O(字段数) 可忽略
- [x] 无 N+1 或多余 DB round-trip 引入

### 项目规范

- [x] Core 不读 `process.env`、不依赖 Demo UI
- [x] 新增 API 从 `index.ts` 导出
- [x] `pnpm typecheck`：5 Tasks successful
- [x] `pnpm lint`：5 Tasks successful
- [ ] stage 01 人工验收记录（`.code-reviews/v1.1/`）需单独补全场景 A–H 证据

### 架构

- [x] Persona 数据契约与 Prompt 职责分离
- [x] 旧 V1.0 Persona 兼容路径保留（optional 字段 + normalize 防御）
- [ ] `personaPrompt` 必填对自定义 Workflow 的兼容说明（WATCH）

### 验证

- [x] `pnpm typecheck` ✅
- [x] `pnpm lint` ✅
- [ ] `pnpm build` 未在本审查执行
- [ ] 人工验收场景 A–H 未在本审查执行（建议合并前在 Demo 跑一遍并附截图/说明）

---

## 备注

**相对 stage 01 规格的符合度：** 高。已实现 Effective Persona、`personaPrompt` 预览、Final System Prompt、`[设定优先级]`、Demo schema（`user_display_name` / `profile` / `appearance` JSONB）、旧 `userAddress` 迁移。

**建议合并前最小动作：**

1. 在 README 补充 auto-ensure schema 说明；
2. 修复 `schemaReady` 失败不可重试；
3. 完成 stage 01 §九 人工验收并在 `.code-reviews/v1.1/1-f4c52ae/` 或 `0-persona-profile/` 附验收记录。

**双通道独立委托：** Cursor 环境不支持 code-reviewer / architect 子 agent 并行委托；本报告按双通道维度独立分析后集成。
