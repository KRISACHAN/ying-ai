# 代码审查 — HEAD：Simple Chat Workflow 与 demo 聊天调试

**日期：** 2026-06-10
**审查工具：** Cursor
**模型：** Composer
**审查范围：** HEAD 最新提交 `f1a0b59`
**引用：** `git show f1a0b598423bbfdffae3ac65bf1ad7db448d23e1`
**结论：** 建议

## 依据规范

- [`AGENTS.md`](../../AGENTS.md) — 项目入口；`ai-core` 不读环境变量，宿主传配置
- [`docs/ai/core/principles.md`](../../docs/ai/core/principles.md) — 操作原则
- [`docs/ai/core/working-agreements.md`](../../docs/ai/core/working-agreements.md) — diff 规模与验证
- [`docs/ai/core/verification.md`](../../docs/ai/core/verification.md) — 验证循环
- [`docs/ai/core/project-context.md`](../../docs/ai/core/project-context.md) — monorepo 布局与命令
- [`docs/ai/core/git-protocol.md`](../../docs/ai/core/git-protocol.md) — 提交规范
- [`.cursor/rules/ai-guide.mdc`](../../.cursor/rules/ai-guide.mdc) — Cursor AI 规则入口
- [`.cursor/rules/project-context.mdc`](../../.cursor/rules/project-context.mdc) — apps 上下文
- [`apps/model-runtime-demo/README.md`](../../apps/model-runtime-demo/README.md) — demo 包说明
- [`.requirements/stages/stage-03/03-chat-main-pipeline.md`](../../.requirements/stages/stage-03/03-chat-main-pipeline.md) — 阶段 3 可执行规范
- [`eslint.config.mjs`](../../eslint.config.mjs) — `consistent-type-imports`、`no-explicit-any`
- [`prettier.config.mjs`](../../prettier.config.mjs) — 格式化约定

## 摘要

本次提交共 11 个文件（+640 / -73 行），实现阶段 3 `SimpleChatWorkflow`（Persona → Safety(input) → Model → Safety(output)），将 `createCompanionCore` 默认 workflow 从 `DisabledChatWorkflow` 切换为 `SimpleChatWorkflow`，并在 `model-runtime-demo` 新增 `/api/chat` 路由与 `ChatPanel` 调试 UI。核心边界清晰：`ai-core` 不读环境变量、不持久化 history、Observer 失败不阻断主链路，demo 负责 env 读取与 history 维护，符合 V1 纯 SDK 约束。

`pnpm turbo run typecheck lint --filter @ying-companion/ai-core --filter @ying-companion/model-runtime-demo` 全部通过。code-reviewer 未发现阻塞性缺陷，主要缺口为 `sanitizeHistory` 未按规范 §6.11 做角色白名单、demo 路由缺少请求校验与长度上限、以及 workflow 安全路径缺少自动化测试。architect 判定为 WATCH：默认 workflow 语义变更对 SDK 消费者是静默行为变化，需在后续迭代中显式记录迁移路径。

## 审查统计

- 审查文件数：11
- 问题总数：11（严重 0 / 高 1 / 中 5 / 低 5）
- code-reviewer 建议：COMMENT
- 架构状态：WATCH

## 问题清单

### 严重

无。

### 高

- [`apps/model-runtime-demo/app/api/chat/route.ts:54-81`] 无鉴权、无限流、无配额的 LLM 代理端点

  **当前影响：** 本地调试可接受；若 demo 被暴露到非本地环境，任意客户端可消耗服务端 `OPENAI_API_KEY`。

  **修复建议：** 保持当前范围仅限本地 Stage 3 调试；若需对外暴露，增加鉴权、速率限制、请求体大小上限，或在非 dev 环境禁用该路由。

### 中

- [`packages/ai-core/src/implementations/workflow/simple-chat-workflow.ts:168-175`] [规范: `.requirements/stages/stage-03/03-chat-main-pipeline.md` §6.11] `sanitizeHistory` 仅过滤 `tool` 角色，未白名单限制为 `user` / `assistant` / `system`

  **修复建议：**

  ```ts
  const ALLOWED_ROLES = new Set(["user", "assistant", "system"] as const);
  return (history ?? []).filter(
    (message) =>
      ALLOWED_ROLES.has(message.role as "user" | "assistant" | "system") &&
      typeof message.content === "string" &&
      message.content.trim() !== "",
  );
  ```

- [`apps/model-runtime-demo/app/api/chat/route.ts:58-80`] 请求体未校验，直接 `as ChatRequestBody` 类型断言

  **当前影响：** 非数组 `history` 会在 `sanitizeHistory` 处抛出 `TypeError`，错误信息不友好。

  **修复建议：** 在 `createModel` 之前校验 `typeof body.message === "string"`、`Array.isArray(body.history)`，非法请求返回结构化 400。

- [`apps/model-runtime-demo/app/api/chat/route.ts:77-80`]、`apps/model-runtime-demo/app/chat-panel.tsx:44` 无 history / 消息长度上限

  **当前影响：** 客户端每轮可传入任意长度 history，导致不可控 token 成本（demo 级 DoS）。

  **修复建议：** 在路由层限制 `history.length`、单条消息字符数及序列化后总大小。

- [`packages/ai-core/src/implementations/workflow/simple-chat-workflow.ts`]（新文件 234 行）workflow 安全路径缺少自动化测试

  **修复建议：** 使用 stub `ChatModel` / `SafetyProvider` / `CoreObserver` 覆盖：空消息不调用 model、input/output safety 拒绝、tool 历史过滤、observer 抛错不阻断主链路。

- [`apps/model-runtime-demo/app/api/chat/route.ts:60-80`] 在输入校验前创建 `createModel` + `createCompanionCore`

  **修复建议：** 先校验 `body`，再构造 model/core，避免无效请求的资源浪费。

### 低

- [`apps/model-runtime-demo/app/api/chat/route.ts:74`] 显式传入 `workflow: new SimpleChatWorkflow()` 与工厂默认重复（`companion-core-factory.ts:38`），无害但易漂移。

- [`apps/model-runtime-demo/app/api/chat/route.ts:15-32`] 与 [`apps/model-runtime-demo/app/chat-panel.tsx:9-20`] 响应类型重复定义，可提取共享类型模块。

- [`apps/model-runtime-demo/app/api/chat/route.ts:88-93`] 错误场景仍返回 HTTP 200 + `ok: false`；demo JSON 约定可接受，产品化时需考虑标准状态码。

- [`apps/model-runtime-demo/app/chat-panel.tsx:51-54`] 请求失败时未清除上一轮 `result`，旧成功结果仍显示；建议在 `setError` 时 `setResult(null)`。

- [`packages/ai-core/src/implementations/workflow/simple-chat-workflow.ts:36-45`] 空消息校验在 `workflow:start` 之后，会多产生一次 `workflow:start` → `workflow:error` 观测噪声。

## 架构关注项

- [`packages/ai-core/src/core/companion-core-factory.ts:38`] **WATCH** — 默认 workflow 从 `DisabledChatWorkflow`（`executeWorkflow` 确定性抛错）变为 `SimpleChatWorkflow`（触发真实 LLM 调用 + `PassthroughSafetyProvider` 放行）。阶段 3 规范明确要求此默认，但对 SDK 外部消费者是静默语义变更；建议在文档或 CHANGELOG 中说明：需 Stage 2 行为时显式传入 `workflow: new DisabledChatWorkflow()`。

- [`packages/ai-core/src/implementations/workflow/simple-chat-workflow.ts:178-214`] **WATCH** — `buildPersonaSystemPrompt` 嵌入默认 workflow，耦合固定中文模板；Stage 7 编排演进前宜提取 `PromptComposer` 或 persona 层方法，避免多 workflow 复制 prompt 逻辑。

- [`apps/model-runtime-demo/app/api/chat/route.ts:77-81`]、`apps/model-runtime-demo/app/chat-panel.tsx:58-62`] **WATCH** — history 由浏览器维护并随请求传入，服务端信任客户端 history；符合 demo 与规范 §3.3，但不可直接复制到产品 API；未来 `apps/api` 应由服务端按 `sessionId` 持有 canonical history。

- [`packages/ai-core/src/implementations/persona/default-persona-provider.ts:16-17`] **WATCH** — workflow 向 `persona.load({ sessionId })` 传参，但 `DefaultPersonaProvider` 忽略 `sessionId`；Stage 3 可接受，接口暗示能力与默认实现不一致，多 session 宿主易误读。

- [`apps/model-runtime-demo/app/api/chat/route.ts:83-87`] **WATCH** — 响应包含完整 `ChatWorkflowOutput`（含 `raw` / `modelOutput`）；调试面板合适，产品 API 需裁剪敏感字段。

## 合成说明

- code-reviewer：COMMENT（核心实现符合阶段 3 规范，无 CRITICAL；建议在合并前或紧随补丁处理 M1 角色白名单与 demo 路由校验）
- 架构状态：WATCH（默认 workflow 语义变更与 prompt/history 演进风险需跟踪，非本提交阻塞项）
- 最终结论：**建议**（依据 OMX 合成规则：architect = WATCH → 建议；code-reviewer = COMMENT → 建议）

## 检查项

### 安全

- [x] 无硬编码密钥；`ai-core` 不读 env
- [ ] demo `/api/chat` 无鉴权/限流（本地可接受，对外需加固）
- [x] 错误信息经 `toSafeMessage` 摘要，未透传底层堆栈
- [x] Safety 拒绝统一抛错，不返回未检查文本

### 代码质量

- [x] workflow 管线清晰，职责单一
- [x] `model-config.ts` 抽取消除重复
- [ ] `sanitizeHistory` 与规范 §6.11 有差距

### 性能

- [x] 每请求创建 core 符合阶段 3 demo 规范
- [ ] 无 history/消息长度上限（demo 级风险）

### 项目规范

- [x] `docs/ai/core/` 原则：宿主传配置、core 纯 SDK
- [x] ESLint / TypeScript 通过
- [x] `import type` 使用正确
- [x] README 已更新 Stage 3 说明

### 架构

- [x] Core / demo 边界明确
- [x] `CompanionCore.executeWorkflow` 薄委托，context 冻结
- [ ] 默认 workflow 变更需迁移说明（WATCH）
- [ ] 客户端 trusted history 不可直接产品化（WATCH）

### 验证

- [x] `pnpm turbo run typecheck lint --filter @ying-companion/ai-core --filter @ying-companion/model-runtime-demo` — 4 tasks 全部成功
- [ ] 无 `SimpleChatWorkflow` 单元测试
- [ ] 未执行端到端聊天手动验证（需有效 `OPENAI_API_KEY`）

## 备注

- 工作区干净，无暂存/未暂存变更；本次审查范围为 HEAD 提交 `f1a0b598423bbfdffae3ac65bf1ad7db448d23e1`。
- `DisabledChatWorkflow` 仍保留并导出（`packages/ai-core/src/index.ts`），可注入恢复 Stage 2 行为。
- 双车道审查均已完成（code-reviewer + architect）。
- 建议后续验证：`pnpm --filter @ying-companion/model-runtime-demo dev`，在「聊天主链路调试」面板发送消息，确认 Observer 事件与 Final Output 展示正常。
