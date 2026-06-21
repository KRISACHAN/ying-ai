# 代码审查 — 阶段 2 Core 抽象层（commit 47a9d1b）

**日期：** 2026-06-09  
**审查工具：** Cursor  
**模型：** Composer  
**审查范围：** HEAD 最新提交 `47a9d1b`  
**引用：** `git show 47a9d1b --no-color`（25 文件，+2580 / -18）  
**结论：** 建议

## 依据规范

- [AGENTS.md](../../AGENTS.md)
- [docs/ai/core/principles.md](../../docs/ai/core/principles.md)
- [docs/ai/core/working-agreements.md](../../docs/ai/core/working-agreements.md)
- [docs/ai/core/verification.md](../../docs/ai/core/verification.md)
- [docs/ai/core/project-context.md](../../docs/ai/core/project-context.md)
- [.cursor/rules/ai-guide.mdc](../../.cursor/rules/ai-guide.mdc)
- [eslint.config.mjs](../../eslint.config.mjs)
- [prettier.config.mjs](../../prettier.config.mjs)
- [.requirements/stages/stage-02/02-core-abstractions.md](../../.requirements/stages/stage-02/02-core-abstractions.md)

## 摘要

提交 `47a9d1b` 完整落地阶段 2 规范：`CompanionCore`、`createCompanionCore`、各 Provider 抽象与 disabled 默认实现、`CoreProviderMeta` 可观测、demo 展示 Core 初始化，且未破坏阶段 1 Model Runtime 边界（`ai-core` 不读 env、不导出 `OpenAICompatibleModel`）。

本地已验证：`pnpm --filter @ying-companion/ai-core typecheck`、`build`、`lint` 与 `pnpm --filter @ying-companion/model-runtime-demo typecheck` 均通过。

code-reviewer 车道：**COMMENT**（无阻塞缺陷，有若干阶段 3 前应关注的改进点）。架构车道：**WATCH**（Context 可变别名暴露是主要长期风险）。依据 OMX 合成规则（architect = WATCH）→ 最终结论 **建议**。

## 审查统计

- 审查文件数：25（含需求文档 1、ai-core 21、demo 3）
- 问题总数：6（严重 0 / 高 0 / 中 3 / 低 3）
- code-reviewer 建议：COMMENT
- 架构状态：WATCH

## 问题清单

### 严重

无。

### 高

无。

### 中

- [`packages/ai-core/src/core/companion-core.ts:19-23`] [规范: `.requirements/stages/stage-02/02-core-abstractions.md` §4.3.1] `public readonly context` 与 `getProviders()` 均返回**同一可变对象引用**；`readonly` 仅防止重赋值，不防止 `core.context.tools = ...` 等字段替换。

  **当前影响：** 阶段 2 默认 Provider 无实例状态，风险尚未显现；阶段 3 起 Workflow / 宿主若误改 Context，可能破坏「一伴侣一 Core、Provider 挂载稳定」约定。

  **修复建议：** 阶段 3 前将 `getProviders()` 改为返回 `Readonly<CompanionCoreContext>` 或专用只读视图；开发构建可选 `Object.freeze(context)`；在阶段 3 spec 写明「禁止运行时替换 Context 字段」。

- [`apps/model-runtime-demo/app/api/model-runtime/route.ts:19-38`] Core 初始化与模型流式调用耦合在同一 `POST` 处理器中。

  **当前影响：** 无法单独验证 Core inspect；模型流失败时 Core 展示也可能一并不可见；与规范 §十九「Model Runtime + Core 可一起工作」不冲突，但调试边界略模糊。

  **修复建议：** 可选新增 `/api/core-inspect` 或在 UI 分区展示；非阻塞，阶段 3 前拆分更清晰。

- [`packages/ai-core/src/index.ts:1-21`] 由阶段 1 具名 type 导出改为多处 `export *`，公开 API 面显著扩大（全部 abstraction 符号 + 7 个默认实现类）。

  **当前影响：** 符合阶段 2 规范 §十八，但默认实现类的错误文案、默认 Persona 文案等成为 semver 表面；后续改动默认行为可能被视为破坏性变更。

  **修复建议：** 在包 README 或 JSDoc 标注「稳定 API」与「参考默认实现」层级；长期可考虑 `@ying-companion/ai-core/defaults` 子路径。

### 低

- [`packages/ai-core/src/implementations/persona/default-persona-provider.ts:16-17`] `load()` 通过 `void input` 忽略 `sessionId` / `personaId`。

  **修复建议：** 阶段 2 可接受；阶段 3 实现 `SimpleChatWorkflow` 时应改为消费 `PersonaLoadInput`，或在方法上加简短注释说明「阶段 2 占位」。

- [`packages/ai-core/src/implementations/model/openai.ts:33-37`] `meta` 为静态 `model.openai-compatible`，不包含 `config.model` 实际模型名。

  **修复建议：** `inspect()` 已满足阶段 2 验收；若 demo 需区分 gpt-4o / mini，可在 meta 增加 `description` 或在运行时 info 中展示（阶段 1 已有 runtime）。

- [`packages/ai-core/src/core/companion-core-factory.ts:10-16`] Factory 硬编码 import 全部默认实现，单测替换默认 Provider 需完整走 `createCompanionCore({ ... })` 注入。

  **修复建议：** 阶段 2 可接受；若后续测试增多，可抽 `defaultProviders` 注册表。

## 架构关注项

- [`packages/ai-core/src/core/companion-core.ts:40-43`] **WATCH** — `executeWorkflow` 将完整 `CompanionCoreContext`（含 `workflow` 自身）传入 Workflow，存在自引用与潜在重入；阶段 3 建议收窄为 `Omit<CompanionCoreContext, 'workflow'>`（及可选 omit `observer`）。

- [`packages/ai-core/src/abstractions/core-context.ts:10-18`] **WATCH** — Context 类型环（`core-context` ↔ `workflow`）已用 `import type` 处理，符合规范 §4.6；构建通过，维持 type-only 互引即可。

- [`packages/ai-core/src/core/companion-core-factory.ts:47-71`] **CLEAR** — `safeEmitCoreInit` 同步 try/catch + `Promise.resolve(...).catch()`，符合 observer 不阻断初始化约定。

- [`packages/ai-core/src/index.ts:13-14`] **CLEAR** — 未导出 `implementations/model/openai.ts`，模型仍经 `createModel` 工厂接入。

- [`packages/ai-core/src/implementations/persona/default-persona-provider.ts:19-25`] **WATCH** — 默认「映映 / female」仅适合作 demo；规范已说明产品 Persona 应由宿主注入，实现与文档一致，但需在阶段 3 避免误作生产默认。

## 合成说明

- code-reviewer：**COMMENT**（实现与阶段 2 规范高度一致，验证通过，无安全/质量阻塞项）
- 架构状态：**WATCH**（Context 可变暴露与 Workflow 自引用 Context 需在阶段 3 前收紧）
- 最终结论：**建议**（依据 OMX：architect = WATCH → 建议；可合并，但应记录阶段 3 硬化项）

## 检查项

### 安全

- [x] `ai-core` 不读取 `process.env`；密钥仅在 demo 层读取并 mask
- [x] 无硬编码 API Key；无鉴权/用户系统越界
- [x] 默认 Safety passthrough 返回结构化结果，非 void

### 代码质量

- [x] 抽象与实现分层清晰；默认实现行为明确（empty/disabled/throw）
- [x] Provider `meta` 稳定 id，未使用 `constructor.name`
- [ ] Context 可变别名（中，见上）

### 性能

- [x] 阶段 2 无热点路径；Factory 一次性组装，无多余循环

### 项目规范

- [x] 符合 `docs/ai/core/` 原则与工作约定
- [x] ESLint / Prettier / TypeScript 通过
- [x] 符合 `.requirements/stages/stage-02/02-core-abstractions.md` 完成标准（除端到端 demo 手动点击未在本审查中执行）

### 架构

- [x] `CompanionCoreContext` 位于 `abstractions/`
- [x] `ModelToolCall` 与 `ToolCall` 分层明确
- [ ] Context 不可变契约待阶段 3 硬化（WATCH）

### 验证

- [x] `pnpm --filter @ying-companion/ai-core typecheck` — 通过
- [x] `pnpm --filter @ying-companion/ai-core build` — 通过
- [x] `pnpm --filter @ying-companion/ai-core lint` — 通过
- [x] `pnpm --filter @ying-companion/model-runtime-demo typecheck` — 通过
- [ ] `pnpm --filter @ying-companion/model-runtime-demo dev` 手动点击「调用模型」— 未执行（建议合并前本地确认 Core Inspection 与流式输出同屏可见）

## 备注

- **独立 lane 说明：** `architect` 子代理已完成评审；`code-reviewer`（bugbot）子代理因 prompt 格式要求未启动，由主代理按同一检查清单完成 code-reviewer 车道并合成。
- **未审查：** 需求文档 `02-core-abstractions.md` 全文未逐行对照（实现抽样与规范关键条款已对照）。
- **阶段 3 跟进建议：** 实现 `SimpleChatWorkflow` 前冻结 Context 暴露面；收窄 `ChatWorkflowExecutionContext`；明确 Persona `load(input)` 消费 `sessionId`。
