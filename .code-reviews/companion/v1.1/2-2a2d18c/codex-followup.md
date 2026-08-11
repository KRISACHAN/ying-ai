# 代码审查回复 — V1.1 阶段 2 流式契约

**日期：** 2026-06-23  
**审查工具：** Codex  
**模型：** GPT-5 Codex  
**审查范围：** `.code-reviews/v1.1/2-2a2d18c/cursor-review.md` 及 commit `2a2d18c` 当前实现  
**引用：** `.code-reviews/v1.1/2-2a2d18c/cursor-review.md`  
**结论：** 建议

## 依据规范

- `AGENTS.md`
- `docs/ai/core/principles.md`
- `docs/ai/core/working-agreements.md`
- `docs/ai/core/verification.md`
- `docs/ai/core/project-context.md`
- `.requirements/stages/v1.1/stage-02/02-v1.1-contract.md`
- `/Users/kris/.codex/plugins/cache/openai-curated-remote/github/0.1.5/skills/gh-address-comments/SKILL.md`
- `packages/ai-core/src/core/companion-core.ts`
- `apps/model-runtime-demo/app/lib/chat-stream-contract-verifier.ts`
- `apps/model-runtime-demo/app/lib/chat-stream-wire.ts`
- `apps/model-runtime-demo/package.json`

## 摘要

Cursor review 的主体判断成立：commit `2a2d18c` 已完成 V1.1 stage-02 的核心契约冻结，且没有严重或高优先级问题。两条中级意见中，`streamWorkflow()` 缺少“支持 stream 但未发送终止事件”的兜底属于协议完整性问题，已采纳并修复；契约验证脚本缺少可运行入口也成立，已补 `verify:stream-contract` 命令入口。

低优先级意见里，输入校验、details 清洗重复、英文注释属于可维护性关注；嵌套 `Error` 被转成 `{ name, message }` 不属于 Error 实例泄漏，但如果后续希望更严格避免 message 外传，也可以改成固定占位对象。

## 回复结论

### 已采纳并修复

1. **`streamWorkflow()` 缺少终止事件兜底**
   - 分类：采纳 / 已修复
   - 位置：`packages/ai-core/src/core/companion-core.ts`
   - 判断：成立。当前 `workflow.stream()` 如果正常结束但没有 yield `workflow:finish` 或 `workflow:error`，外层 `streamWorkflow()` 会直接结束。stage-02 要求流必须以 finish 或 error 收口，这里应由 Core 门面做最后防线。
   - 处理结果：已在 `for await` 循环结束后增加 `!terminated` 兜底，补发 `workflow:error(code="workflow_failed")`。若已经见过前置事件，复用最后一个 `workflowId`；如果没有事件，则生成新的 `workflowId`。
   - 验证：`verify:stream-contract` 新增 `missing terminal fallback` 场景，已通过。

2. **契约验证脚本缺少可运行入口**
   - 分类：采纳 / 已修复
   - 位置：`apps/model-runtime-demo/app/lib/chat-stream-contract-verifier.ts`、`apps/model-runtime-demo/package.json`
   - 判断：成立。当前 verifier 是可导入函数，不是可直接执行命令。stage-02 要求 Console 可展示契约场景，最好提供一个稳定命令入口。
   - 处理结果：已新增 `apps/model-runtime-demo/scripts/verify-stream-contract.mjs` 与 `verify:stream-contract` package script；该命令先构建 `ai-core`，再用 Node 输出契约场景表格，不新增依赖。
   - 验证：`pnpm --filter @ying-companion/model-runtime-demo verify:stream-contract` 通过，7 个场景均为 `true`。

### 保留关注

3. **`streamWorkflow()` 未做输入校验即发送 `workflow:start`**
   - 分类：保留关注 / 暂不处理
   - 判断：部分成立。stage-02 允许输入校验类错误在 stream 开始前同步 throw，但没有要求 `CompanionCore` 在本阶段内实现统一输入校验。当前 unsupported fallback 不读取 `message`，先发 start 再发 `workflow_stream_not_supported` 是确定可观测语义。
   - 建议：阶段 5 实现真实 `SimpleChatWorkflow.stream()` 时，把输入校验策略统一到 workflow 入口，并决定是否需要 Core 层前置校验。

4. **`SafeWorkflowError.details` 清洗逻辑重复**
   - 分类：保留关注 / 暂不处理
   - 判断：成立但非阻塞。Core 层清洗 thrown safe error，Wire 层清洗传输 DTO，各自边界不同；当前重复换来的是防御性明确。
   - 建议：如果后续还出现第三处清洗逻辑，再提取共享 helper；目前不建议为了两处短函数提前抽象。

5. **新文件注释为英文**
   - 分类：保留关注 / 暂不处理
   - 判断：成立但影响很低。`workflow-stream.ts` 的注释与同包中文注释风格不完全一致，但不影响契约行为。
   - 建议：后续顺手改成中文即可，不需要单独 patch。

### 不采纳

6. **嵌套 `Error` 被映射为 `{ name, message }` 进入 Wire**
   - 分类：不采纳 / 当前实现可接受
   - 位置：`apps/model-runtime-demo/app/lib/chat-stream-wire.ts`
   - 判断：Cursor 指出“规格字面略有偏差”有一定道理，但当前实现没有把 `Error` 实例、stack、cause 或循环引用放入 Wire；它把 Error 转成 JSON-safe 摘要对象，符合 stage-02 对 `Date / Map / Set / class instance` 等转换为普通 JSON DTO 的边界精神。
   - 风险：如果 metadata 中的 Error message 来自 provider，仍可能包含不适合前端展示的信息。不过这属于 metadata 来源治理问题，不是 Error 实例序列化问题。
   - 建议：若后续要更保守，可把嵌套 Error 统一映射为 `{ name }` 或固定字符串 `"[Error]"`，但本条不应阻塞 stage-02。

## 建议回复文本

### 总体回复

```text
感谢 review。整体结论我认可：stage-02 的 Core/Wire 分层和兼容契约已经落地，但还有两个非阻塞的协议完整性改进点。

已采纳 `streamWorkflow()` 缺少“无终止事件兜底”的意见：当底层 `workflow.stream()` 正常结束但没有发出 `workflow:finish` / `workflow:error` 时，由 Core 门面补发安全的 `workflow:error(code="workflow_failed")`，避免宿主流状态悬挂。`verify:stream-contract` 已新增对应的 `missing terminal fallback` 场景。

契约验证入口也已采纳并修复。现在可以运行 `pnpm --filter @ying-companion/model-runtime-demo verify:stream-contract`，控制台会输出正常完成、空白 delta、stream 不支持、缺失终止兜底、步骤失败、output safety 拒绝、memory 写回降级与 Wire 序列化边界的结果。

低优先级项里，输入校验策略会留到阶段 5 的真实 `SimpleChatWorkflow.stream()` 一起统一；details 清洗重复和英文注释暂不单独改。嵌套 Error 目前已转为 JSON-safe 摘要对象，没有传递 Error 实例、stack 或 cause；如果后续希望更严格避免 message 外传，可以再收紧为固定占位值。
```

### 逐条短回复

```text
1. streamWorkflow 无终止兜底：已修复。底层 stream 漏发终止事件时，Core 门面会补发 workflow:error(code="workflow_failed")。

2. verifier 缺少可运行入口：已修复。新增 verify:stream-contract 命令，并同步 README。

3. unsupported 路径未先校验输入：暂不处理。当前 fallback 的职责是表达 stream 不支持；真实输入校验会在阶段 5 的 SimpleChatWorkflow.stream() 中统一设计。

4. 嵌套 Error 映射：不作为缺陷处理。当前没有跨 Wire 传递 Error 实例、stack 或 cause，只转 JSON-safe 摘要；若后续要更保守，可把 Error message 也去掉。

5. details 清洗重复：保留关注。Core 与 Wire 两层分别防御，当前重复可接受；出现第三处再抽公共 helper。

6. 英文注释：保留关注。可后续顺手改为中文，不影响契约。
```

## 本轮 patch 范围

1. `packages/ai-core/src/core/companion-core.ts`
   - 在 `for await` 正常结束后增加 `!terminated` 兜底 `workflow:error`。
   - 补充 verifier 场景：fake stream workflow 只 yield `workflow:start` 后结束。

2. `apps/model-runtime-demo`
   - 增加 stream contract verifier 的可执行入口。
   - 在 README 写出运行命令。

## 验证

```bash
pnpm turbo run typecheck --filter @ying-companion/model-runtime-demo
pnpm turbo run lint --filter @ying-companion/model-runtime-demo
pnpm turbo run build --filter @ying-companion/model-runtime-demo
pnpm --filter @ying-companion/model-runtime-demo verify:stream-contract
```

## GitHub 写操作状态

本文件仅为本地回复草稿与 follow-up 记录。未向 GitHub 提交评论、未 resolve review thread、未 submit review。
