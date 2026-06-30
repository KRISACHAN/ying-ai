# V1.1 验收证据索引

**基线 SHA：** `25cbcda6ebd9d07ed98a5239a3fbeab6bf2a49f4`（`25cbcda`）

---

## 自动化验证

### `pnpm typecheck` / `lint` / `build`

- **日期：** 2026-06-30
- **结果：** 6/6 packages 全部通过
- **位置：** Stage 8 执行终端记录

### `verify:adapter`

- **命令：** `pnpm --filter @ying-companion/model-ollama verify:adapter`
- **脚本：** `packages/model-ollama/scripts/verify-ollama-adapter.mjs`
- **覆盖：** message 映射、tool capability skip、stream capability skip、fallback generate、mid-stream failure

### `verify:stream-contract`

- **命令：** `pnpm --filter @ying-companion/model-runtime-demo verify:stream-contract`
- **脚本：** `apps/model-runtime-demo/scripts/verify-stream-contract.mjs`
- **场景：**

| #   | 场景                                       | ok   |
| --- | ------------------------------------------ | ---- |
| 0   | normal whitespace delta                    | true |
| 1   | stream unsupported                         | true |
| 2   | missing terminal fallback                  | true |
| 3   | started step failure                       | true |
| 4   | output safety rejected                     | true |
| 5   | recoverable memory save degraded           | true |
| 6   | wire serialization boundary (raw stripped) | true |
| 7   | ndjson parser chunking                     | true |

---

## 阶段 Review 归档（Stage 1～7）

| 目录                                       | Stage            | 主要交付                  |
| ------------------------------------------ | ---------------- | ------------------------- |
| [1-f4c52ae](../1-f4c52ae/cursor-review.md) | 1 Persona        | Persona profile           |
| [2-2a2d18c](../2-2a2d18c/cursor-review.md) | 2 Contract       | streamWorkflow, Wire      |
| [3-7b56cb0](../3-7b56cb0/cursor-review.md) | 3 Model strategy | ToolPlanningProvider      |
| [4-9a4cec4](../4-9a4cec4/cursor-review.md) | 4 Step refactor  | 共享步骤函数              |
| [5-e838111](../5-e838111/cursor-review.md) | 5 Streaming      | SimpleChatWorkflow.stream |
| [6-2796f97](../6-2796f97/cursor-review.md) | 6 Ollama         | model-ollama              |
| [7-a56d5af](../7-a56d5af/cursor-review.md) | 7 Demo NDJSON    | 流式工作台                |

---

## 关键代码引用

| 主题                | 路径                                                                   |
| ------------------- | ---------------------------------------------------------------------- |
| Core 流事件         | `packages/ai-core/src/abstractions/workflow-stream.ts`                 |
| streamWorkflow 门面 | `packages/ai-core/src/core/companion-core.ts`                          |
| Wire 映射           | `apps/model-runtime-demo/app/lib/chat-stream-wire.ts`                  |
| NDJSON 解析         | `apps/model-runtime-demo/app/lib/chat-stream-transport.ts`             |
| 流式 Route          | `apps/model-runtime-demo/app/api/conversations/[id]/messages/route.ts` |
| 聊天状态 UI         | `apps/model-runtime-demo/app/conversation-workspace.tsx`               |
| Ollama adapter      | `packages/model-ollama/src/ollama-chat-model.ts`                       |

---

## 人工 UI 证据（待补充）

冻结 tag 前建议在本地补充：

- 场景 A：Persona Preview 截图（脱敏）
- 场景 B/C：Timeline + 流式回复截图
- 场景 D：工具 planning 步骤截图

存放建议：个人本地或 PR 附件；仓库内仅保留本索引与 `manual-verification.md` 文字记录。
