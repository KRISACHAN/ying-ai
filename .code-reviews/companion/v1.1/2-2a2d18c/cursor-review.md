# 代码审查 — V1.1 阶段 2 流式契约（commit 2a2d18c）

**日期：** 2026-06-23  
**审查工具：** Cursor  
**模型：** claude-4.6-sonnet-medium-thinking  
**审查范围：** HEAD 最新提交 `2a2d18c`  
**引用：** `git show 2a2d18c` · `feat: 冻结工作流流式契约`  
**结论：** 建议

---

## 依据规范

- [`AGENTS.md`](../../../AGENTS.md)
- [`docs/ai/core/principles.md`](../../../docs/ai/core/principles.md)
- [`docs/ai/core/working-agreements.md`](../../../docs/ai/core/working-agreements.md)
- [`docs/ai/core/verification.md`](../../../docs/ai/core/verification.md)
- [`docs/ai/core/project-context.md`](../../../docs/ai/core/project-context.md)
- [`.cursor/rules/ai-guide.mdc`](../../../.cursor/rules/ai-guide.mdc)
- [`.cursor/rules/project-context.mdc`](../../../.cursor/rules/project-context.mdc)
- [`eslint.config.mjs`](../../../eslint.config.mjs)
- [`prettier.config.mjs`](../../../prettier.config.mjs)
- [`packages/ai-core/README.md`](../../../packages/ai-core/README.md)
- [`apps/model-runtime-demo/README.md`](../../../apps/model-runtime-demo/README.md)
- [`.requirements/stages/v1.1/stage-02/02-v1.1-contract.md`](../../../.requirements/stages/v1.1/stage-02/02-v1.1-contract.md)

> **双通道说明：** Cursor Task 工具不支持 `code-reviewer` / `architect` 子 agent 并行委托；以下 code-reviewer 与 architect 结论由本审查按双通道维度集成完成。

---

## 摘要

本次提交完整落地 V1.1 阶段 2 的核心交付：`ChatWorkflowStreamEvent` / `SafeWorkflowError` 类型、`ChatWorkflow.stream?()` 可选扩展、`CompanionCore.streamWorkflow()`（含 `workflow_stream_not_supported` 统一兜底）、Demo 层 `chat-stream-wire.ts` 单一映射，以及覆盖空白 delta、Safety 失败、Memory 降级等场景的契约验证脚本。Core / Wire 边界清晰，`ai-core` 未引入 HTTP/NDJSON 依赖，与 stage-02 规格高度一致。

`pnpm typecheck` 与 `pnpm lint` 全量通过（5 个包）。未发现安全或破坏性 TypeScript 兼容问题。主要关注点是 **`streamWorkflow()` 在 Workflow 未发送终止事件时静默结束**、**契约验证脚本缺少可执行入口**，以及 Wire 映射对嵌套 `Error` 的弱化处理与规格字面略有偏差。

---

## 审查统计

- 审查文件数：8（commit 变更）+ stage-02 规格交叉核对
- 问题总数：6（严重 0 / 高 0 / 中 2 / 低 4）
- code-reviewer 建议：**COMMENT**
- 架构状态：**WATCH**

---

## 问题清单

### 严重

无。

### 高

无。

### 中

- [`packages/ai-core/src/core/companion-core.ts:104-117`] **`streamWorkflow()` 缺少终止事件兜底** — 当 `workflow.stream()` 的 AsyncIterable 正常结束但未 yield `workflow:finish` 或 `workflow:error` 时，`streamWorkflow()` 直接结束，不向宿主发送任何终止事件。

  **当前影响：** 阶段 2 占位阶段影响有限（`SimpleChatWorkflow` 尚未实现 `stream()`）；阶段 5 实现真实流式后，若 Workflow 遗漏终止事件，宿主/UI 无法区分「仍在进行」与「异常结束」，违反 stage-02 §7.5「每条流最多一个终止事件 / 正常完成必须以 workflow:finish 收口」。

  **修复建议：** 在 `for await` 循环结束后，若 `!terminated`，补发 `workflow:error(code=workflow_failed, message=...)` 或等价安全码。

- [`apps/model-runtime-demo/app/lib/chat-stream-contract-verifier.ts`] **契约验证脚本缺少可运行入口** — README 已文档化该文件，但 `package.json` 无对应 script；直接用 `node` 导入 `.ts` 会报 `ERR_UNKNOWN_FILE_EXTENSION`。

  **当前影响：** stage-02 §13.4 要求「Console 可展示…」的人工契约验证，审查者无法以一条命令复现 Codex 的验证结论，与 [`docs/ai/core/verification.md`](../../../docs/ai/core/verification.md) 的「Run the smallest validation that can prove it」不完全对齐。

  **修复建议：** 增加例如 `pnpm --filter @ying-companion/model-runtime-demo verify:stream-contract`（可用 `tsx` 或小段 compiled 入口），并在 README 写出命令。

  [规范: `docs/ai/core/verification.md`]

### 低

- [`packages/ai-core/src/core/companion-core.ts:78-98`] **`streamWorkflow()` 未做输入校验即发送 `workflow:start`** — stage-02 §7.5 允许「message 为空」等在 stream 开始前同步 throw；当前 unsupported 路径无论输入是否合法都先发 `workflow:start` 再 `workflow_stream_not_supported`。

  **当前影响：** 非阻塞；与 `executeWorkflow()` 经 Workflow 校验的行为略不一致。阶段 5 实现真实 `stream()` 时应统一校验策略。

- [`apps/model-runtime-demo/app/lib/chat-stream-wire.ts:230-234`] **嵌套 `Error` 被映射为 `{ name, message }` 进入 Wire** — 规格要求 Wire 不含 Error 实例；实现将 metadata 中的 `Error` 转为 JSON 对象而非剔除。

  **当前影响：** 不会泄漏 stack，但 Wire 仍携带结构化 error 对象；契约验证器用 `!json.includes("provider")` 通过，语义上可接受但略宽于「剔除 Error」字面。

- [`packages/ai-core/src/core/companion-core.ts:181-193`] 与 [`apps/model-runtime-demo/app/lib/chat-stream-wire.ts:181-193`] **`SafeWorkflowError.details` 清洗逻辑重复** — 两处 `sanitize*Details` 几乎相同。

  **修复建议：** 后续可将 details 清洗保留在 Wire 层，Core 侧仅做 throw→SafeWorkflowError 包装；或提取共享 util（非阻塞）。

- [`packages/ai-core/src/abstractions/workflow-stream.ts:1-6`] **新文件注释为英文** — 同包其他抽象文件多为中文模块注释，风格略不一致。

---

## 架构关注项

- [`packages/ai-core/src/abstractions/workflow-stream.ts`] **CLEAR** — Stream 类型独立文件、从 `index.ts` 导出、`workflow.ts` 仅 type import，边界干净；未污染 V1.0 `execute()` 路径。

- [`packages/ai-core/src/core/companion-core.ts:78-127`] **WATCH** — `streamWorkflow()` 作为门面合理：unsupported 兜底、catch 后 yield `workflow:error`、遇终止事件后 `break` 均符合规格。但「流结束无终止事件」与「终止后未 drain 剩余 async iterator」两处需在阶段 5 前补强或文档化（后者影响资源释放，当前无真实 stream 实现风险较低）。

- [`apps/model-runtime-demo/app/lib/chat-stream-wire.ts`] **CLEAR** — 单一 `toChatWorkflowStreamWireEvent()`、Demo 依赖 Core 类型而非反向、raw/Date/circular 处理完整；`modelOutput.raw` 通过 omit `raw` key 剔除，符合 stage-02 §10.2。

- [`apps/model-runtime-demo/app/lib/chat-stream-contract-verifier.ts`] **WATCH** — 场景覆盖与 stage-02 §十四 高度对齐（空白 delta、unsupported、Safety 拒绝、Memory degraded、Wire 边界）。「started step failure」用 `memory:save + failed + workflow:error` 测试的是致命路径样例，与「recoverable degraded」场景并存，可接受。

- **未交付但符合 stage-02 非目标：** `chat-stream-transport.ts`、HTTP Route、真实 NDJSON — 本阶段可不实现。

---

## 合成说明

- code-reviewer：**COMMENT**（无严重/高级别问题；2 个中级别为终止事件兜底与验证可复现性）
- 架构状态：**WATCH**（Core/Wire 分层正确；门面层终止语义需在阶段 5 前补完）
- 最终结论：**建议**（依据 OMX 合成规则：architect=WATCH → 建议）

---

## 检查项

### 安全

- [x] 无硬编码密钥；`SafeWorkflowError` 不暴露 stack/API key
- [x] Wire 映射剔除顶层 `raw` / `stack` / `cause`
- [x] Core 不读 env、不写 console

### 代码质量

- [x] 类型 union 可 narrowing；公开 export 清晰
- [ ] `streamWorkflow` 终止事件兜底（中，已记录）
- [ ] details 清洗重复（低，已记录）

### 性能

- [x] Wire `toJsonValue` 使用 `WeakSet` 防循环引用；无 N+1 或多余分配问题

### 项目规范

- [x] `pnpm typecheck`：5 Tasks successful
- [x] `pnpm lint`：5 Tasks successful
- [x] stage-02 双路 API、`stream?()` 可选、CompanionCore 统一 unsupported 兜底
- [ ] 契约验证缺少 npm script（中，已记录）

### 架构

- [x] Core Event / Wire Event 分离
- [x] Demo 不复制 Workflow 逻辑
- [ ] 终止事件完整性（WATCH，已记录）

### 验证

- [x] `pnpm typecheck` 通过
- [x] `pnpm lint` 通过
- [ ] `chat-stream-contract-verifier` 未以命令跑通（Node 无法直接 import `.ts`；未执行 build 后 smoke）

---

## 备注

**相对 stage-02 完成度：** 子任务 02-01～02-04 均已覆盖；`chat-stream-transport.ts` 按规格可后续预留，非本 commit 阻塞项。

**建议验证命令（待补 script 后）：**

```bash
pnpm typecheck
pnpm lint
pnpm --filter @ying-companion/model-runtime-demo verify:stream-contract  # 建议新增
```

**双通道独立委托：** Cursor 环境不支持 code-reviewer / architect 子 agent 并行委托；本报告按双通道维度独立分析后集成。
