# 代码审查复核 — V1.1 阶段 1 Persona Profile

**日期：** 2026-06-22  
**审查工具：** Codex  
**模型：** GPT-5 Codex  
**审查范围：** `.code-reviews/v1.1/1-f4c52ae/cursor-review.md` 及当前实现  
**引用：** `.code-reviews/v1.1/1-f4c52ae/cursor-review.md`  
**结论：** 建议

## 依据规范

- `AGENTS.md`
- `docs/ai/core/principles.md`
- `docs/ai/core/working-agreements.md`
- `docs/ai/core/verification.md`
- `docs/ai/core/project-context.md`
- `docs/ai/core/git-protocol.md`
- `.requirements/stages/v1.1/stage-01/01-persona-profile.md`
- `.codex/skills/code-review-followup/SKILL.md`
- `/Users/kris/.codex/plugins/cache/openai-curated-remote/github/0.1.5/skills/gh-address-comments/SKILL.md`
- `apps/model-runtime-demo/README.md`
- `apps/model-runtime-demo/app/lib/debug-db.ts`
- `apps/model-runtime-demo/app/lib/debug-repository.ts`
- `packages/ai-core/src/implementations/persona/persona-prompt-builder.ts`
- `packages/ai-core/src/implementations/persona/default-persona-provider.ts`
- `packages/ai-core/src/abstractions/workflow.ts`
- `apps/model-runtime-demo/app/api/chat/route.ts`

## 摘要

Cursor review 的主体判断成立：本次提交符合 V1.1 stage 01 的核心边界，但存在若干非阻塞的运维、文档与可维护性问题。本轮已修复 schema ensure 失败不可重试、README auto-ensure 说明、重复 normalize、Provider 出口 normalize、`personaPrompt`/legacy 入口说明等明确项；已补跑 `typecheck`、`lint` 和 `build`，验证当前实现可构建。剩余关注主要是 Demo/Core 双侧 normalize 的职责重复，以及尚未补纯函数单元测试。

## 审查统计

- 复核问题数：7
- 已采纳并修复：5
- 不成立：0
- 保留关注：2
- 未处理：0
- code-reviewer 建议：COMMENT
- 架构状态：WATCH

## 复核结论

### 已采纳并修复

- `apps/model-runtime-demo/app/lib/debug-db.ts`：`ensureDebugWorkspaceSchema()` 失败后会将 `schemaReady` 重置为 `undefined`，下一次 companion 读写可以重新尝试补齐 schema。
- `apps/model-runtime-demo/README.md`：已补充说明首次 companion 读写会自动补齐 V1.1 Persona Profile 列；新环境和 CI 仍建议显式执行 migration。
- `packages/ai-core/src/implementations/persona/persona-prompt-builder.ts`：已拆出 `buildPersonaPromptFromNormalized()`，`buildPersonaSystemPrompt()` 不再触发第二次 normalize。
- `packages/ai-core/src/implementations/persona/default-persona-provider.ts`：`load()` 返回前调用 `normalizeCompanionPersona()`，减少 `persona:load` 事件和后续消费者看到脏 Persona 的概率。
- `packages/ai-core/src/abstractions/workflow.ts` 与 `apps/model-runtime-demo/app/api/chat/route.ts`：已补充 `personaPrompt` 自定义 Workflow 填充说明，并标注 legacy `/api/chat` 不用于 V1.1 Persona Profile 验收。

### 不成立

无。Cursor 列出的 7 个问题在当前代码下均有事实依据。

### 保留关注

- `apps/model-runtime-demo/app/lib/debug-repository.ts` 与 `packages/ai-core/src/implementations/persona/persona-prompt-builder.ts`：Demo/Core 双侧 normalize 重复成立。Demo 负责 DB 输入清洗、Core 负责最终 Prompt 防御，职责可解释，但后续规则扩展时有漂移风险。
- 全仓库：缺少 `persona-prompt-builder` 单元测试成立。Stage 01 允许人工验收，但该纯函数后续适合补边界测试。

### 未处理

无。

## 架构关注复核

- `packages/ai-core/src/abstractions/workflow.ts`：`ChatWorkflowDebugContext.personaPrompt` 必填的 WATCH 已通过 JSDoc 降低误用风险。当前 `SimpleChatWorkflow` 已填充，类型正确；自定义 Workflow 仍需同步该字段。
- `apps/model-runtime-demo/app/lib/debug-db.ts`：dev runtime 隐式 DDL 的 WATCH 已通过 README 说明降低不透明性。它解决了本地旧库缺列的实际问题，但 schema 版本审计仍应依赖显式 migration。
- `packages/ai-core/src/implementations/persona/persona-prompt-builder.ts` 与 `apps/model-runtime-demo/app/lib/companion-runtime.ts`：Persona Prompt 拆分与移除旧 `userAddress` workaround 仍为 CLEAR。

## 验证

- `pnpm --filter @ying-companion/ai-core typecheck`：通过
- `pnpm --filter @ying-companion/model-runtime-demo typecheck`：通过
- `pnpm --filter @ying-companion/ai-core lint`：通过
- `pnpm --filter @ying-companion/model-runtime-demo lint`：通过
- `pnpm --filter @ying-companion/ai-core build`：通过
- `pnpm --filter @ying-companion/model-runtime-demo build`：通过
- `node -e "...DefaultPersonaProvider, buildPersonaSystemPrompt..."`：通过，确认 Provider 出口 normalize、非法身高过滤、Prompt 不含 `undefined`

## 合成说明

- code-reviewer：COMMENT。无严重/高风险问题，明确缺陷已修复；剩余为可维护性与测试覆盖建议。
- 架构状态：WATCH。隐式 DDL 与 `personaPrompt` 必填契约已记录，但仍属于后续演进时需要关注的边界。
- 最终结论：**建议**。当前实现可构建且主功能路径成立，剩余风险不阻塞本阶段。
