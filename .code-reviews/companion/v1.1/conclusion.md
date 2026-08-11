# V1.1 版本结论 — ying-companion AI Companion Core SDK

**版本：** V1.1
**日期：** 2026-07-02
**范围：** `packages/ai-core` + `packages/model-ollama` + `packages/memory-postgres`（无 V1.1 代码变更）+ `apps/model-runtime-demo`
**验证：** `pnpm typecheck` ✅ · `pnpm lint` ✅ · `pnpm build` ✅ · `verify:adapter` ✅ · `verify:stream-contract` ✅（8/8）· `verify:memory-extractor` ✅

---

## 一、项目概述

**ying-companion** 在 V1.0 纯 Core SDK 基线上，V1.1 完成「Persona 扩展、工作流级流式聊天、多模型能力档案与工具规划、Ollama 独立 Adapter、Debug Workbench NDJSON 闭环、文档与 review 归档」。

V1.1 仍遵守 V1 边界（见 [`.requirements/prompts/02-execution.md`](../../.requirements/prompts/02-execution.md)）：**无用户系统、无鉴权、无部署、无产品正式 UI**；Core 不读 `process.env`、不写 `console`。

相对 V1.0 的 monorepo 分层：

| 层级           | 包 / 应用                  | V1.1 变化                                                                                 |
| -------------- | -------------------------- | ----------------------------------------------------------------------------------------- |
| Core SDK       | `packages/ai-core`         | 新增 `streamWorkflow()`、流事件协议、`ModelProfile`、工具规划、Persona 扩展、工作流模块化 |
| Ollama Adapter | `packages/model-ollama`    | **新建** — `createOllamaChatModel()` 实现 `ChatModel`                                     |
| 持久化扩展     | `packages/memory-postgres` | 无代码变更；记忆向量化仍由宿主注入 `EmbeddingProvider`                                    |
| 调试宿主       | `apps/model-runtime-demo`  | 主通道升级为 `POST + NDJSON` 流式工作台                                                   |

V1.0 → V1.1 共 **43** 个 commit（`v1.0..HEAD`），**107** 个文件变更（约 +21k / −1.8k 行）。

---

## 二、架构设计（V1.1 增量）

### 2.1 双路调用与事件分层

Core 同时提供两条稳定入口（[`companion-core.ts`](../../packages/ai-core/src/core/companion-core.ts)）：

```txt
executeWorkflow(input)  → Promise<ChatWorkflowOutput>     // V1.0 保留
streamWorkflow(input)   → AsyncIterable<ChatWorkflowStreamEvent>  // V1.1 新增
```

事件分两层（[`workflow-stream.ts`](../../packages/ai-core/src/abstractions/workflow-stream.ts) + Demo [`chat-stream-wire.ts`](../../apps/model-runtime-demo/app/lib/chat-stream-wire.ts)）：

| 层             | 类型                          | 用途                                                       |
| -------------- | ----------------------------- | ---------------------------------------------------------- |
| **Core Event** | `ChatWorkflowStreamEvent`     | 工作流内部；可含 `Date`、`ChatWorkflowOutput`（含 `raw`）  |
| **Wire Event** | `ChatWorkflowStreamWireEvent` | 网络传输；`Date` → ISO string，剥离 `raw` / 不可序列化字段 |

`CompanionCore.streamWorkflow()` 额外兜底：无 `workflow:finish` / `workflow:error` 终止时自动补发 `workflow:error`；不支持 stream 的 Workflow 返回 `workflow_stream_not_supported`。

### 2.2 模型能力档案与工具规划

[`model.ts`](../../packages/ai-core/src/abstractions/model.ts) 引入 `ModelProfile`（`provider` + `model` + `capabilities`）与 `requiredCapabilities`：

- `ChatModel.primaryProfile` / `fallbackProfile` 独立声明能力
- Workflow **禁止**按 provider 名称分支，只通过 `capabilities` 与 `modelProfileSatisfiesCapabilities()` 决策
- 不满足能力时抛出 `ModelCapabilityUnavailableError`，trace 记录 `capabilitySkips`

[`tool-planning.ts`](../../packages/ai-core/src/abstractions/tool-planning.ts) 解决「双答案」问题：

- `DefaultToolPlanningProvider` 用专用 system prompt 调用 `generate({ requiredCapabilities: { toolCalling: true } })`
- 只产出 `no_tool` 或 `tool_calls`，**不生成面向用户的自然语言**
- 最终回复由 `runFinalGenerateStep()`（execute）或 `runFinalStreamStep()`（stream）单独生成

`ToolPlanningProvider` 作为 `SimpleChatWorkflow` 构造选项注入，**未**进入 `CompanionCoreContext` DI 槽（V1.1 刻意保持 DI 面稳定）。

### 2.3 工作流模块化（Stage 4 重构）

V1.0 单文件 `SimpleChatWorkflow`（~1527 行）拆分为 11 个模块（合计 ~2590 行，编排主文件 ~783 行）：

```txt
simple-chat-workflow.ts      ← execute() / stream() 编排入口
workflow-steps.ts            ← Persona / Safety / Memory / Emotion / Tool 等共享步骤
workflow-final-response.ts   ← final generate / final stream 分叉点
workflow-step-runner.ts        ← step 追踪 + Observer + stream 事件发射
workflow-stream-emitter.ts     ← 异步 producer/consumer 流事件队列
workflow-execution-state.ts    ← 跨步骤可变状态
workflow-output-builder.ts     ← ChatWorkflowOutput 组装
workflow-tool-execution.ts     ← 工具执行循环
workflow-safe-error.ts         ← SafeWorkflowError 规范化
```

`execute()` 与 `stream()` **共用前置步骤**，仅在最终自然语言生成处分叉：

```txt
共用：Persona → Safety(input) → Summary(load) → Memory(recall) → Emotion
      → Tool(list) → Prompt(build) → ToolPlanning → Tool(execute)

execute 分支：model.generate() → Safety(output) → Summary/Memory 写回 → return

stream  分支：yield step 事件 → model.stream() → yield text:delta
              → 聚合完整文本 → Safety(output) → 写回 → yield workflow:finish
```

内部结构化任务（情绪分析、记忆抽取、摘要更新、工具规划）**继续使用 `generate()`**，不受流式改造影响。

### 2.4 Persona 扩展（Stage 1）

[`persona.ts`](../../packages/ai-core/src/abstractions/persona.ts) + [`persona-prompt-builder.ts`](../../packages/ai-core/src/implementations/persona/persona-prompt-builder.ts)：

- 新增 `userDisplayName`、`userAddress`
- 新增 `profile.hobbies`、`appearance`（heightCm / weightKg / hair / bodyType / additionalTraits）
- Prompt 分区渲染「伴侣身份 / 用户信息 / 补充指令」，缺失字段不产生噪音

### 2.5 Ollama Adapter（Stage 6）

[`packages/model-ollama`](../../packages/model-ollama/) 独立包：

- `createOllamaChatModel()` → `OllamaChatModel` 实现 `ChatModel`
- 基于 `ollama` npm，支持 `generate()` / `stream()`、主/降级模型、能力覆盖
- 默认保守能力：`streaming: true, toolCalling: false, usage: false`
- `structuredOutput` 映射为 Ollama `format: "json"` + adapter 内 Zod 校验
- **不含** Embedding；不读 env；不进入 `ai-core`

OpenAI-compatible 仍经 `createModel()`（[`model.factory.ts`](../../packages/ai-core/src/factories/model.factory.ts)）；Demo 按 `provider` 字段分别创建两种 Adapter。

### 2.6 Debug Workbench（Stage 7）

[`apps/model-runtime-demo`](../../apps/model-runtime-demo/) 升级为核心工作流调试宿主：

- `POST /api/conversations/[id]/messages` → `core.streamWorkflow()` → NDJSON Wire Event
- `chat-stream-transport.ts` 处理 chunk 边界解析；`workflow:finish` 在持久化成功后发送
- UI 展示 Timeline、runtime、Persona Preview、后置写回结果
- 状态区分：success / degraded / partial-failed / safety-rejected / persistence-failed

### 2.7 memory-postgres（V1.1 无变更）

[`packages/memory-postgres`](../../packages/memory-postgres/) 在 V1.0 基线上**零 commit 变更**。V1.1 通过 Core 层 `GenerateInput.structuredOutput` 修复 Ollama 记忆写回（hotfix `6746018`），不改变 Postgres Provider 本身。Embedding 仍由宿主注入（通常 `OpenAIEmbeddingProvider`），与聊天 Provider 选择无关。

---

## 三、各阶段完成情况

| 阶段 | 主题                        | 关键交付                                                     | 状态 |
| ---- | --------------------------- | ------------------------------------------------------------ | ---- |
| 1    | Persona Profile             | `userAddress`、appearance、Prompt Builder                    | ✅   |
| 2    | Core / Wire 契约            | `ChatWorkflowStreamEvent`、`SafeWorkflowError`、NDJSON 边界  | ✅   |
| 3    | ModelProfile + ToolPlanning | 能力档案、`DefaultToolPlanningProvider`                      | ✅   |
| 4    | 步骤函数化                  | workflow 模块拆分，execute 行为回归                          | ✅   |
| 5    | 流式工作流                  | `streamWorkflow()`、真 `text:delta`、`WorkflowStreamEmitter` | ✅   |
| 6    | Ollama Adapter              | `packages/model-ollama`、`verify:adapter`                    | ✅   |
| 7    | Debug Workbench             | NDJSON 会话聊天、Timeline、持久化闭环                        | ✅   |
| 8    | 文档与 review 收口          | AGENTS / README / stage 文档 / review 归档                   | ✅   |

实施规格：[`.requirements/stages/v1.1/`](../../.requirements/stages/v1.1/) · 总体规划：[`.requirements/prompts/04-v1.1-plan.md`](../../.requirements/prompts/04-v1.1-plan.md)

---

## 四、关键设计决策

| 决策                                              | 理由                                                             |
| ------------------------------------------------- | ---------------------------------------------------------------- |
| 新增 `streamWorkflow()`，保留 `executeWorkflow()` | 向后兼容；后台任务与非流式宿主不受影响                           |
| Core Event / Wire Event 分离                      | 防止 `Date` / `raw` / `Error` 泄漏到网络层                       |
| 工具规划与最终回复生成分离                        | 避免 V1.0 工具循环「先生成完整回答再丢弃重 stream」的双答案浪费  |
| 仅最终自然语言回复流式化                          | 情绪/记忆/摘要需结构化 JSON，`generate()` 更稳定                 |
| Ollama 独立 package                               | 第三方 SDK 不污染 `ai-core`；符合 V1 插槽边界                    |
| 按 `capabilities` 分支，禁止 provider 名称分支    | 新 Adapter 接入无需改 Workflow                                   |
| `structuredOutput` 契约（hotfix）                 | Ollama 模型常在 JSON 外包裹说明文字，手工 parse `text` 不可靠    |
| Workflow 步骤模块化                               | 降低 execute/stream 双路径漂移风险；主文件从 1527 行降至 ~783 行 |
| ToolPlanning 不进入 DI 容器                       | V1.1 最小 DI 面；宿主自定义规划策略通过 Workflow 构造选项扩展    |
| Demo 用 NDJSON over POST                          | 契合复杂聊天输入；`EventSource` GET 不适合携带 session 上下文    |

---

## 五、已知约束与 V1.1 边界

| 约束                                                                | 说明                                                         |
| ------------------------------------------------------------------- | ------------------------------------------------------------ |
| 不支持停止生成 / 断线重连 / 续传                                    | 流中断即失败，无 resume token                                |
| 不支持文本已输出后的模型切换继续生成                                | 首个 `text:delta` 后 fallback 不可用                         |
| 不支持真正的流式多轮 Tool Loop                                      | 工具循环仍用 `generate()`，最多 1 轮                         |
| Output Safety 为完整文本后审计                                      | 用户可能已看到流式文本；拒绝时 Demo 须明确标注               |
| Ollama tool calling / usage 取决于具体模型                          | 默认 `toolCalling: false`；宿主可 override                   |
| 无 Ollama Embedding Provider                                        | 记忆向量化仍用宿主 `EmbeddingProvider`                       |
| `ModelSummaryUpdater` / `ModelEmotionEngine` 仍 parse `output.text` | 仅 `ModelMemoryExtractor` 已迁移 `structuredOutput`          |
| Ollama JSON Schema 未传给 API                                       | 当前仅 `format: "json"`，约束强度弱于 OpenAI `Output.object` |
| Demo 默认 Ollama 模型偏本地化                                       | 新 clone 需自行 pull 模型或改配置                            |
| Demo 为调试工作台，非生产安全方案                                   | 无鉴权、无多租户                                             |
| 无单元测试 / E2E 测试层                                             | 靠契约脚本 + 各 stage review + 人工走查                      |
| 无用户系统 / RBAC / 商业化                                          | 留给 `apps/api`、`apps/web` 后续版本                         |

---

## 六、验证结果

本次在 `prod` HEAD（`9433083`）执行：

```txt
pnpm typecheck                              → 6/6 Tasks successful ✅
pnpm lint                                   → 6/6 Tasks successful ✅
pnpm build                                  → 6/6 Tasks successful ✅
pnpm --filter model-ollama verify:adapter   → JSON 场景全通过 ✅
pnpm --filter model-runtime-demo verify:stream-contract → 8/8 ✅
pnpm --filter ai-core verify:memory-extractor           → structuredOutput 路径 ✅
```

**自动化验收场景（Demo README / Stage 8）：**

- 场景 G、H：NDJSON chunk 边界、Wire raw 剥离 — 已通过 `verify:stream-contract`
- 场景 F：Output Safety 拒绝语义 — 契约脚本覆盖
- 场景 E：记忆写回 degraded — 契约脚本覆盖

**待本地人工走查（需 API key / Ollama + 浏览器）：**

- 场景 A：OpenAI-compatible 流式 + Persona 扩展字段
- 场景 B：Ollama 流式 + Persona 仍生效
- 场景 C：工具能力差异（支持 vs 不支持 tool calling）
- 场景 D：流式失败语义（首 token 前 / 已输出 partial）

走查步骤见 [`apps/model-runtime-demo/README.md`](../../apps/model-runtime-demo/README.md)。

---

## 七、Review 归档索引

| 目录                                    | 说明                                  |
| --------------------------------------- | ------------------------------------- |
| [1-f4c52ae](1-f4c52ae/cursor-review.md) | Stage 1 — Persona                     |
| [2-2a2d18c](2-2a2d18c/cursor-review.md) | Stage 2 — 契约 / Wire                 |
| [3-7b56cb0](3-7b56cb0/cursor-review.md) | Stage 3 — ModelProfile + ToolPlanning |
| [4-9a4cec4](4-9a4cec4/cursor-review.md) | Stage 4 — 步骤函数化                  |
| [5-e838111](5-e838111/cursor-review.md) | Stage 5 — 流式工作流                  |
| [6-2796f97](6-2796f97/cursor-review.md) | Stage 6 — Ollama Adapter              |
| [7-a56d5af](7-a56d5af/cursor-review.md) | Stage 7 — Debug Workbench             |
| [8-25cbcda](8-25cbcda/cursor-review.md) | Stage 8 — 文档收口                    |
| [9-6746018](9-6746018/cursor-review.md) | Hotfix — Ollama 结构化记忆抽取        |

各 stage 均有对应 `cursor-review.md` 与 `codex-followup.md`（Stage 1～8 + hotfix）。

---

## 八、已修复问题摘要（跨阶段）

主要问题已在各 stage follow-up 中关闭：

- **`streamWorkflow` 终止事件兜底** — `CompanionCore` 无 terminal event 时补发 `workflow:error`（Stage 2）
- **`DefaultToolPlanningProvider` 构造期 model 绑定** — 改为 `plan(input.model)` 使用当前请求模型（Stage 4）
- **Wire raw 泄漏 / NDJSON chunk 边界** — `chat-stream-wire.ts` 唯一映射 + `verify:stream-contract`（Stage 2/7）
- **Demo 持久化失败仍发送 `workflow:finish`** — finish 延迟到持久化成功后（Stage 7 → `85d213d`）
- **Ollama 记忆无法写回** — `GenerateInput.structuredOutput` 契约 + adapter 实现（hotfix `6746018` → `224f0f0` / `9433083`）
- **`validateGenerateOutput` 忽略纯结构化响应** — 允许 `structuredOutput !== undefined`（hotfix follow-up）
- **README 与 `structuredOutput` 实现不一致** — 限定为 MemoryExtractor 已迁移（hotfix follow-up）

---

## 九、不属于 V1.1 的后续候选（V1.2+）

- 用户系统 / RBAC（`apps/api`、`apps/web`）
- 流中断恢复、WebSocket / SSE 主通道
- Ollama Embedding、多 Agent 编排
- `ModelSummaryUpdater` / `ModelEmotionEngine` 迁移 `structuredOutput`
- Ollama JSON Schema 增强（从 Zod 派生 schema 传给 API）
- Core 单元测试与 Demo E2E
- 生产部署与鉴权体系
- Demo 默认模型恢复通用可移植值

---

## 十、冻结 / Tag 状态

| 项               | SHA / 说明                                                 |
| ---------------- | ---------------------------------------------------------- |
| tag `v1.0`       | `83b9550` — 见 [v1.0/conclusion.md](../v1.0/conclusion.md) |
| tag `v1.1`       | `f79ac18`（2026-07-02 annotated tag）                      |
| 当前 `prod` HEAD | `9433083` — 与 tag 同主题 hotfix，rebase 后 SHA 已变       |

**状态：** V1.1 功能与文档已完整交付；工程检查与契约验证全部通过；8 个 stage + 1 个 hotfix review 已归档。

**Tag 对齐说明：** `v1.1` tag 打在 rebase 前 commit `f79ac18`；当前 `prod` HEAD `9433083` 为同内容 rebase 后的等价 tip。若需 tag 与 HEAD 严格一致，维护者可参照 v1.0 流程删除并重建 `v1.1` tag 后推送。

**对比 V1.0：** V1.0 一次性返回 JSON；V1.1 在兼容 `executeWorkflow()` 前提下新增 `streamWorkflow()`、Ollama Adapter、Persona 扩展与 NDJSON 调试闭环，Core 边界（不读 env、DI 可插拔、Memory/Emotion degraded 不中断）保持不变。
