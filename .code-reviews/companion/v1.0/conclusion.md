# V1.0 代码总结 — ying-companion AI Companion Core SDK

**版本：** v1.0  
**日期：** 2026-06-21  
**范围：** `packages/ai-core` + `packages/memory-postgres` + `apps/model-runtime-demo`  
**验证：** `pnpm typecheck` ✅ · `pnpm lint` ✅

---

## 一、项目概述

**ying-companion** 是一个 pnpm + Turborepo monorepo，V1.0 目标是交付纯粹、可插拔的 AI Companion Core SDK（无用户系统、无鉴权、无部署逻辑）。

整体分三层：

| 层级       | 包 / 应用                  | 职责                            |
| ---------- | -------------------------- | ------------------------------- |
| Core SDK   | `packages/ai-core`         | 抽象接口 + 内置实现 + 工厂      |
| 持久化扩展 | `packages/memory-postgres` | PostgreSQL + pgvector 长期记忆  |
| 调试宿主   | `apps/model-runtime-demo`  | Next.js 调试工作台（可观测 UI） |

---

## 二、架构设计（ai-core）

### 2.1 分层结构

```
abstractions/    ← 接口与类型契约（宿主稳定 API）
  model.ts       ← ChatModel：generate / stream
  memory.ts      ← MemoryProvider / MemoryExtractor / EmbeddingProvider
  emotion.ts     ← EmotionEngine：analyze / transition
  tool.ts        ← ToolRegistry / ToolProvider
  workflow.ts    ← ChatWorkflow：execute（主链路入口）
  workflow-trace.ts ← WorkflowTrace / WorkflowStepTrace
  summary.ts     ← SummaryProvider / SummaryUpdater
  persona.ts     ← PersonaProvider
  safety.ts      ← SafetyProvider
  observer.ts    ← CoreObserver（可观测性）
  provider.ts    ← CoreProvider（所有 Provider 的基础契约）
  core-context.ts ← CompanionCoreContext（DI 容器）

implementations/ ← 内置默认实现
  model/openai.ts       ← OpenAI-compatible（Vercel AI SDK 适配）
  emotion/              ← ModelEmotionEngine + DisabledEmotionEngine
  memory/               ← InMemory / Noop / Disabled + ModelMemoryExtractor
  summary/              ← InMemory / Noop + ModelSummaryUpdater
  tool/                 ← LocalToolRegistry + EmptyToolRegistry
  workflow/             ← SimpleChatWorkflow（主链路）+ DisabledChatWorkflow
  workflow-trace-recorder.ts ← WorkflowTraceRecorder
  observer/noop-core-observer.ts

core/
  companion-core.ts     ← CompanionCore 门面（inspect / executeWorkflow）
  companion-core-factory.ts ← createCompanionCore（组装 DI）

factories/
  model.factory.ts      ← createModel（Config → ChatModel）

errors/
  model-runtime-error.ts ← ModelRuntimeError

config/
  model-config.ts       ← OpenAICompatibleConfig / ModelRetryOptions
```

### 2.2 依赖注入策略

`createCompanionCore(options)` 只有 `model` 为必填，其余 10 个 Provider 均有默认实现：

- 无 `memory` → `NoopMemoryProvider` + `NoopMemoryExtractor`
- 有 `memory` 无 `memoryExtractor` → 自动装配 `ModelMemoryExtractor`
- 无 `summary` → `NoopSummaryProvider` + `NoopSummaryUpdater`
- 有 `summary` 无 `summaryUpdater` → 自动装配 `ModelSummaryUpdater`
- 其余 Provider 均有 Disabled / Passthrough / Noop 三类默认值

`CompanionCore.context` 在构造时 `Object.freeze`，防止运行期替换。

### 2.3 核心编排（SimpleChatWorkflow）

V1 单轮聊天链路编排顺序（共 14 步）：

```
Persona:load → Safety:input → Summary:load → Memory:recall
→ Emotion:analyze+transition → Tool:list → Prompt:build
→ Model:generate → [Tool:execute → Model:follow-up-generate] × maxRounds
→ Safety:output → Summary:update+save → Memory:extract → Memory:save
```

关键设计约束：

- Memory 失败 → degraded，不打断主链路
- Emotion 失败 → degraded，不打断主链路
- Observer 异常 → safeEmit 吞错，不打断主链路
- Safety 拒绝 → 统一抛错，不返回未通过检查的文本
- V1 默认工具最多执行 1 轮（`DEFAULT_MAX_TOOL_ROUNDS = 1`）
- Core 不读取 `process.env`，配置由宿主显式传入
- Core 不写 `console`，可观测输出经 `CoreObserver.emit` 交给宿主

### 2.4 可观测性体系

`CoreObserver` 定义 27 种事件类型（`core:init` / `persona:load:start|end` / `workflow:step` / `workflow:end` 等），`WorkflowTraceRecorder` 在每步完成时记录 `WorkflowStepTrace`，最终附在 `output.metadata.trace`。

`ChatWorkflowDebugContext` 提供完整的本轮调试快照（systemPrompt / messages / toolCalls / toolResults / embeddingVectorLength 等），供调试 UI 面板还原完整请求上下文。

---

## 三、各阶段实现摘要

### 阶段 1：Model Runtime

`OpenAICompatibleModel` 通过 `@ai-sdk/openai-compatible` 适配 Vercel AI SDK：

- `generate()`：主模型 → 降级模型重试，返回 `ModelRuntimeInfo`（usedModel / fallbackUsed / primaryAttempts / errors）
- `stream()`：流式吐字，首次 yield 前可切换降级模型；一旦出字则后续错误直接抛出
- 错误安全截断（`MAX_ERROR_MESSAGE_LENGTH = 240`）
- `toAiSdkMessages` 处理 assistant tool-call 内容与 tool-result 角色映射

### 阶段 2：Core 抽象层与依赖注入

11 个 Provider 接口 + `CompanionCoreContext` DI 容器。`CoreProvider` 基础契约统一 `meta.id / kind / name`，避免打包后类名压缩问题。`ChatWorkflowCoreContext` 剔除 `workflow` 自身，防止 execute 递归调用。

### 阶段 3：聊天主链路

`SimpleChatWorkflow` 实现完整 14 步编排，`runWorkflowStep` 封装统一的 step 追踪与 Observer 发射逻辑。`buildPersonaSystemPrompt` 聚合 Persona / Summary / Memory / Emotion 上下文拼装系统 Prompt。

### 阶段 4：记忆系统

- `InMemoryMemoryProvider`：进程内向量搜索（余弦相似度），适合测试/开发
- `ModelMemoryExtractor`：调用模型提取结构化记忆（type / content / importance）
- `memory-postgres`：`PostgresMemoryProvider` — pgvector 余弦 TopK 召回，单事务批量 embed+INSERT，去重检测，`healthCheck()` 探测连接/扩展/表就绪
- `resolveMemoryScope`：显式 `scope` → `sessionId` → `default` 优先级回退

### 阶段 5：情绪状态机

- `ModelEmotionEngine`：模型分析伴侣意向情绪 → 结构化 JSON（`parseEmotionAnalysis`/zod schema）→ `transitionEmotion` 确定性合并
- 转换规则：`strong_override` / `neutral_decay` / `same_emotion_boost` / `switch` / `fallback`
- 失败时 degraded 回退（非 strict 模式），不打断主链路
- 情绪类型：`neutral / happy / sad / angry / anxious / affectionate`，强度 0–1

### 阶段 6：工具调用系统

- `LocalToolRegistry`：register / list / execute，工具名正则校验（`TOOL_NAME_PATTERN`），注册冲突检测
- `toModelTools / toCoreToolCall / buildToolFollowUpMessages`：Core ToolDefinition ↔ AI SDK ToolSet 双向映射
- `formatToolResults`：将 ToolResult 序列化为模型可读文本（JSON/error 格式）
- 工具执行元数据：`startedAt / endedAt / durationMs / rawArguments`

### 阶段 7：流程编排抽象层

`WorkflowTraceRecorder` 追踪每步 `WorkflowStepTrace`（step / status / startedAt / endedAt / durationMs / summary / error）。`WorkflowTrace` 聚合全步骤 + `budgetMs / budgetExceeded`，供宿主 UI 可视化执行时序。`WorkflowStepName` 枚举 14 个标准步骤名。

### 阶段 8：调试 UI 与可观测输出

`apps/model-runtime-demo` 提供：

- Companion/Session/Message 持久化 CRUD（PostgreSQL）
- `workflow_runs` 表记录每轮 A/B/C 事务（message-write / ai-generation / result-persist）
- Debug 面板展示：Prompt Context / Observer Events / Workflow Trace / Memory DB Health
- `CompanionMemoryAdminRepository` 管理长期记忆

---

## 四、关键设计决策

| 决策                             | 理由                                                            |
| -------------------------------- | --------------------------------------------------------------- |
| Core 不读 env                    | 与宿主运行时解耦，支持多宿主场景（Next.js / Worker / Node CLI） |
| Core 不写 console                | 可观测性全部经 CoreObserver，宿主自决日志策略                   |
| DI 而非 singleton                | 同进程可实例化多个 CompanionCore，支持多伴侣场景                |
| V1 工具循环上限 1                | 防止 V1 阶段工具调用死循环，简化状态管理                        |
| Safety 拒绝抛错                  | 不返回未经审查的文本，防止宿主误用                              |
| Emotion / Memory degraded 不中断 | 主聊天链路可用性优先，可观测性记录降级状态                      |
| pgvector `IS NOT DISTINCT FROM`  | 正确处理 `companion_id IS NULL` 等值比较，避免 NULL = NULL 失效 |
| tableName 正则校验               | 防止 SQL 注入，对动态 FROM/INSERT 的最小防御                    |

---

## 五、已知约束与 V1 边界

| 约束                        | 说明                                                                                   |
| --------------------------- | -------------------------------------------------------------------------------------- |
| 工具轮数 = 1                | V1 只执行 1 轮工具循环                                                                 |
| 无流式工具循环              | 工具循环只用非流式 generate                                                            |
| 无 history 持久化           | history 由宿主维护，Core 不存储短期对话                                                |
| 无用户系统/鉴权             | V1 纯核心 SDK，无 RBAC                                                                 |
| memory-postgres 需外部 Pool | Pool 由宿主创建持有，dispose 为 no-op                                                  |
| Embedding 实现在宿主侧      | `EmbeddingProvider` 接口在 ai-core，`OpenAIEmbeddingProvider` 实现在 `memory-postgres` |

---

## 六、验证结果

```
pnpm typecheck   → 5 Tasks successful ✅
pnpm lint        → 5 Tasks successful ✅
pnpm build       → (未在此次验证中执行，typecheck 已覆盖类型层面)
```

---

## 七、过往审查概览

V1.0 共 12 次阶段性代码审查（`.code-reviews/v1.0/0-63288da` 至 `11-d271087`），覆盖各阶段 feat commit 与修复 fix commit。主要历史问题均已在对应 fix commit 中解决：

- 0-63288da / 1-ca46e25：Stage 1–2 初始审查 → 公开边界过宽、tools 类型断言、stream usage 缺失等，已修复
- 2-47a9d1b 至 4-9d3e6d5：Stage 2–3 聊天链路 → Observer 接口、history 边界处理，已修复
- 5-22f9fab / 6-c43b3ef：Stage 4 记忆系统 → pgvector NULL 比较、tableName 注入，已修复
- 7-9b83802 / 8-74153ae：Stage 5 情绪状态机 → zod schema 解析、transition 规则，已修复
- 9-ae86fee / 10-a013327：Stage 6–7 工具与追踪 → toolAdapter 映射、WorkflowTrace 契约，已修复
- 11-d271087：Stage 8 调试 UI → 持久化失败路径、500 响应缺少临时输出，已在 e4877d8 修复
