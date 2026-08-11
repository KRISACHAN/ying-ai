# 代码审查复核 — f1a0b59 Simple Chat Workflow 与 demo 聊天调试

**日期：** 2026-06-10
**审查工具：** Claude Code
**模型：** Claude Opus 4.8
**审查范围：** `.code-reviews/3-f1a0b59/cursor-review.md` 及当前实现（工作树 == `f1a0b59`，干净）
**引用：** `.code-reviews/3-f1a0b59/cursor-review.md`
**结论：** 建议

## 依据规范

- [`AGENTS.md`](../../AGENTS.md) — 项目入口；`ai-core` 不读环境变量，宿主传配置
- [`docs/ai/core/working-agreements.md`](../../docs/ai/core/working-agreements.md) — 小而可逆的 diff、优先复用
- [`docs/ai/core/verification.md`](../../docs/ai/core/verification.md) — 验证循环
- [`.requirements/prompts/02-execution.md`](../../.requirements/prompts/02-execution.md) — V1 边界；**明确「当前不需要单元测试与 e2e 测试」**
- [`.requirements/stages/stage-03/03-chat-main-pipeline.md`](../../.requirements/stages/stage-03/03-chat-main-pipeline.md) — 阶段 3 可执行规范（含修订后的 §6.5 / §6.11 / §7.3 / §9.1.1 / §10.4 / §11.1）
- [`eslint.config.mjs`](../../eslint.config.mjs) — `consistent-type-imports`、`no-explicit-any`

## 摘要

复核确认 Cursor review 的判断基本成立：核心实现无阻塞性缺陷。11 项问题中，**2 项不成立**（与项目宪法或修订后 spec 冲突），**3 项 + 全部 5 项架构 WATCH 为保留关注**（demo 范围内可接受或后续阶段处理），**6 项成立并已在本次修复**（demo 路由请求校验/长度上限/先校验后建模、`sanitizeHistory` 显式白名单，以及两处低优先级清理）。修复后 `typecheck` / `build` / `lint` / `prettier` / Next.js build 全绿。

## 审查统计

- 复核问题数：11（+5 架构关注）
- 已采纳并修复：6
- 不成立：2
- 保留关注：3（+5 架构关注）
- 未处理：0
- code-reviewer 建议：COMMENT
- 架构状态：WATCH

## 复核结论

### 已采纳并修复

- [`simple-chat-workflow.ts`] **M1：`sanitizeHistory` 改为显式白名单** —— 新增 `ALLOWED_HISTORY_ROLES = {system,user,assistant}`，过滤 `tool` 及任何越界角色 + 空白内容，贴合 §6.11 字面并对宿主运行时数据更稳健。
- [`app/api/chat/route.ts`] **M2：新增请求体校验** —— 解析为 `unknown` 后经 `validateRequestBody` 校验 `message`（非空字符串）、`history`（数组）、`sessionId`（字符串），非法返回结构化 `400`，杜绝 `sanitizeHistory` 处的 `TypeError`。
- [`app/api/chat/route.ts`] **M3：新增长度上限** —— `MAX_MESSAGE_LENGTH=8000`、`MAX_HISTORY_LENGTH=50`，超限返回 `400`，限制 demo 级 token 成本。
- [`app/api/chat/route.ts`] **M5：先校验后建模** —— 校验通过后才 `createModel` / `createCompanionCore`，无效请求不再浪费资源。
- [`app/api/chat/route.ts`] **L1：移除冗余 workflow 注入** —— 删除显式 `workflow: new SimpleChatWorkflow()` 与对应 import，依赖工厂默认（阶段 3 §7.3），消除漂移。
- [`chat-panel.tsx`] **L4：失败清除旧结果** —— `!body.ok` 分支与 `catch` 均补 `setResult(null)`，避免旧成功结果与错误并存误导。

### 不成立

- [`simple-chat-workflow.ts`] **M4：缺少 workflow 安全路径自动化测试** —— 与项目宪法冲突。[`02-execution.md`](../../.requirements/prompts/02-execution.md) 明确「当前我不需要单元测试与 e2e 测试，我只需要功能没有问题」。本阶段不补测试，验证以 typecheck/lint/build + demo 人工验证为准。后续若引入测试体系再补。

- [`simple-chat-workflow.ts:36-45`] **L5：空消息校验在 `workflow:start` 之后，产生 start→error「噪声」** —— 这是**修订后 spec 的有意设计**，非缺陷。`03-chat-main-pipeline.md` §6.5 将 `workflow:start` 前置到 message 校验之前，§11.1 明确空消息事件序列为 `workflow:start → workflow:error`，目的就是**避免出现没有 start 的孤立 error**。当前实现与 spec 一致，不改。

### 保留关注

- [`app/api/chat/route.ts:54-95`] **H1：LLM 代理端点无鉴权/限流/配额** —— 成立但非本阶段阻塞项。本地 Stage 3 调试 demo，[`03-chat-main-pipeline.md`](../../.requirements/stages/stage-03/03-chat-main-pipeline.md) §9 明确 demo 非正式业务 UI。**触发条件**：一旦该 demo 需对外暴露，必须加鉴权、限流、请求体上限或在非 dev 环境禁用该路由。产品后端在 `apps/api` 另行实现。

- [`route.ts` / `chat-panel.tsx`] **L2：响应类型重复定义** —— 客户端组件与服务端路由不便共享同一类型来源；demo 规模下重复可接受。产品化时再抽独立 `types` 模块。

- [`route.ts:88-94`] **L3：错误返回 HTTP 200 + `ok:false`** —— demo 有意约定，使客户端始终能解析 JSON 并展示 observer 事件。**注**：见 M2 修复方案——对「请求体非法」这类客户端错误，建议改用 4xx，与运行时错误（保留 200）区分。

- **架构 WATCH（A1–A5，全部保留关注）：**
  - A1 默认 workflow 语义变更（`DisabledChatWorkflow` → `SimpleChatWorkflow`）：已在 [`03-chat-main-pipeline.md`](../../.requirements/stages/stage-03/03-chat-main-pipeline.md) §7.3/§7.4 文档化；需 Stage 2 行为时显式注入 `new DisabledChatWorkflow()`。
  - A2 `buildPersonaSystemPrompt` 与 workflow 耦合：阶段 7 编排演进前再抽 `PromptComposer`。
  - A3 客户端可信 history：符合 demo 与 §3.3；产品 `apps/api` 应由服务端按 `sessionId` 持有 canonical history，不可照搬。
  - A4 `DefaultPersonaProvider` 忽略 `sessionId`：阶段 3 可接受，后续数据库/配置驱动 PersonaProvider 再真正消费。
  - A5 响应含完整 `raw` / `modelOutput`：调试面板有意为之；产品 API 需裁剪敏感字段。

### 未处理（成立·建议修复，即「需要改的」）

### 未处理

无。（6 项成立问题已全部修复，2 项不成立已驳回，其余为保留关注/架构 WATCH。）

## 验证

- `pnpm --filter @ying-companion/ai-core typecheck`：通过
- `pnpm --filter @ying-companion/ai-core build`：通过
- `pnpm --filter @ying-companion/ai-core lint`：通过
- `pnpm --filter @ying-companion/model-runtime-demo typecheck`：通过
- `pnpm --filter @ying-companion/model-runtime-demo lint`：通过
- `pnpm --filter @ying-companion/model-runtime-demo build`：通过（`/api/chat` 仍为服务端动态路由，客户端未打入 model/core）
- `pnpm exec prettier --check packages/ai-core/src apps/model-runtime-demo/app`：通过
- 真实模型聊天（发消息、两轮 history 生效）：未运行，依赖有效 `OPENAI_API_KEY`，需 `pnpm --filter @ying-companion/model-runtime-demo dev` 人工验证。

## 合成说明

- code-reviewer：COMMENT（6 项成立问题已修复；无 CRITICAL/阻塞缺陷）
- 架构状态：WATCH（默认 workflow 语义变更、prompt/history 演进风险需跟踪，非阻塞项）
- 最终结论：**建议**。成立问题已全部修复并通过静态验证；剩余 H1 与架构 WATCH 为 demo 范围/后续阶段的保留关注，非阻塞。
