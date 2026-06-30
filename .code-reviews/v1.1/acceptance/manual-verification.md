# V1.1 人工验收记录

**验收日期：** 2026-06-30  
**基线 Commit：** `25cbcda6ebd9d07ed98a5239a3fbeab6bf2a49f4`（Stage 8 文档/验收/review 归档）  
**执行者：** Cursor Agent（Stage 8 收口）  
**环境：** macOS · Node LTS · pnpm 9 · 无 live API key / 无本地 Ollama 实例（见各场景说明）

---

## 工程检查（场景 H）

| 检查项              | 命令                                                                      | 结果                       | 证据                                                        |
| ------------------- | ------------------------------------------------------------------------- | -------------------------- | ----------------------------------------------------------- |
| Typecheck           | `pnpm typecheck`                                                          | 通过（6 packages）         | 终端输出 2026-06-30                                         |
| Lint                | `pnpm lint`                                                               | 通过（6 packages）         | 终端输出 2026-06-30                                         |
| Build               | `pnpm build`                                                              | 通过（含 demo next build） | 终端输出 2026-06-30                                         |
| Ollama adapter 契约 | `pnpm --filter @ying-companion/model-ollama verify:adapter`               | 通过                       | JSON summary：fallback、capability skip、mid-stream failure |
| NDJSON / Wire 契约  | `pnpm --filter @ying-companion/model-runtime-demo verify:stream-contract` | 8/8 场景通过               | 见 `evidence-index.md` § verify-stream-contract             |

**结论：** 通过

---

## 场景 A：Persona 配置与 Prompt 生效

| 项              | 内容                                                                                                     |
| --------------- | -------------------------------------------------------------------------------------------------------- |
| Provider / 模型 | N/A（UI + Prompt Preview）                                                                               |
| 预期            | Effective Persona、Preview 分区、无占位噪音                                                              |
| 实际            | **需本地人工复现** — 代码路径：`buildPersonaPrompt()`、`/companions/[id]/edit`、Stage 1～7 review 已覆盖 |
| 证据            | `.requirements/stages/v1.1/stage-01/` · `.code-reviews/v1.1/1-f4c52ae/`                                  |
| 结论            | 已知限制 — 本次会话未启动浏览器；Stage 1 审查已通过，建议冻结前本地走查 A                                |

---

## 场景 B：OpenAI-compatible 正常流式聊天

| 项              | 内容                                                                                  |
| --------------- | ------------------------------------------------------------------------------------- |
| Provider / 模型 | openai-compatible（需有效 API key）                                                   |
| 预期            | NDJSON、`text:delta` 增量、finish 后 debug 完整、刷新可恢复                           |
| 实际            | **需本地人工复现** — Route 实现：`POST /api/conversations/[id]/messages`              |
| 证据            | `.code-reviews/v1.1/7-a56d5af/cursor-review.md` · `apps/model-runtime-demo/README.md` |
| 结论            | 已知限制 — Stage 7 review 批准；本地需配置 key 后复现 B                               |

---

## 场景 C：Ollama 正常流式聊天

| 项              | 内容                                                                |
| --------------- | ------------------------------------------------------------------- |
| Provider / 模型 | ollama + 本地已 pull 模型                                           |
| 预期            | 流式显示、runtime 显示 ollama、不按 provider 名强行走工具           |
| 实际            | **需本地人工复现** — `verify:adapter` 通过；无本地 Ollama 服务      |
| 证据            | `.code-reviews/v1.1/6-2796f97/` · `packages/model-ollama/README.md` |
| 结论            | 已知限制 — Adapter 契约通过；C 需本地 Ollama                        |

---

## 场景 D：工具规划与最终流式回答

| 项   | 内容                                                                              |
| ---- | --------------------------------------------------------------------------------- |
| 预期 | plan → execute → stream；无双回答                                                 |
| 实际 | **需本地人工复现** — `DefaultToolPlanningProvider` 与 Stage 4/5 review 已验证逻辑 |
| 证据 | `.code-reviews/v1.1/4-9a4cec4/` · `.code-reviews/v1.1/5-e838111/`                 |
| 结论 | 已知限制 — 契约层通过；D 需支持 toolCalling 的模型 + Demo Timeline                |

---

## 场景 E：模型 fallback 与能力差异

| 项   | 内容                                                                        |
| ---- | --------------------------------------------------------------------------- |
| 预期 | fallback runtime 可观测；无 stream 时首 delta 前 error                      |
| 实际 | **部分自动化** — `verify:adapter` 覆盖 fallback generate 与 capability skip |
| 证据 | `verify:adapter` 输出 `fallbackGenerate` · Stage 3 spec                     |
| 结论 | 通过（adapter 层）— 完整 UI 场景 E 需本地配置 primary/fallback              |

---

## 场景 F：Output Safety 与后置任务语义

| 项   | 内容                                                                                                    |
| ---- | ------------------------------------------------------------------------------------------------------- |
| 预期 | 流后 safety；拒绝无 finish；degraded / partial 可区分                                                   |
| 实际 | **部分自动化** — `verify:stream-contract`：`output safety rejected`、`recoverable memory save degraded` |
| 证据 | verify 场景 4、5 · `conversation-workspace.tsx` 状态机                                                  |
| 结论 | 通过（契约 + UI 代码路径）— Safety 拒绝 UI 文案需本地确认                                               |

---

## 场景 G：Wire / NDJSON 健壮性

| 项   | 内容                                                                  |
| ---- | --------------------------------------------------------------------- |
| 预期 | chunk 边界、非法 JSON、raw 不泄漏、无 API key                         |
| 实际 | **自动化通过** — verify:stream-contract 场景 6、7；代码审查 Stage 2/7 |
| 证据 | `chat-stream-transport.ts` · `chat-stream-wire.ts` · verify 表格      |
| 结论 | 通过                                                                  |

---

## 汇总

| 场景 | 结论                          |
| ---- | ----------------------------- |
| A    | 需本地人工（Stage 1 已审）    |
| B    | 需本地人工（Stage 7 已审）    |
| C    | 需本地人工（adapter 已验）    |
| D    | 需本地人工（Stage 4/5 已审）  |
| E    | adapter 通过；UI 建议本地复现 |
| F    | 契约通过；UI 建议本地复现     |
| G    | 通过                          |
| H    | 通过                          |

**Stage 8 建议：** 在具备 API key 与 Ollama 的环境完成 A～D 一次全链路走查后即可打 `v1.1` tag。当前工程与契约验证已满足冻结的技术基线。
