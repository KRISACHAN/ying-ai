# 04-memory-system-patch-0.md

## 阶段 4 Patch 0：带数据库的 Demo

> 本 patch 目标：在阶段 4 长期记忆系统完成后，为调试应用接入真实 PostgreSQL + pgvector 记忆实现，让长期记忆的抽取、保存、召回、向量检索结果可以在 Demo 页面中直接观察。
> 本 patch **不重新设计** Memory Core，**不向 `packages/ai-core` 引入数据库依赖**；主要工作是 Demo 联调、可观测 UI、health 检查与验收场景跑通。

---

## 1. 背景说明

阶段 4 的主文档 `04-memory-system.md` 已经定义了长期记忆系统的核心闭环：

```txt
用户输入
↓
根据用户输入召回相关长期记忆
↓
将长期记忆注入 Prompt
↓
模型生成回复
↓
从本轮对话抽取新的长期记忆
↓
保存长期记忆
↓
后续对话可以再次召回
```

阶段 4 同时明确了几个关键边界：

```txt
packages/ai-core
  只包含抽象接口、领域类型、Prompt 格式化、记忆抽取逻辑、Workflow 调用点、Observer 事件定义、Noop / InMemory 默认实现

packages/ai-core 不包含
  pg
  pgvector
  drizzle
  数据库连接池
  数据库连接字符串
  migration
  具体数据库表结构绑定
```

PostgreSQL + pgvector 只能作为 `MemoryProvider` 的一种外部实现，由宿主应用创建并注入 Core。

主文档推荐执行顺序中的 **PR 3 / PR 4**（Demo 记忆面板 + PostgreSQL 联调）在本 patch 中单独落地；Core 能力与 `packages/memory-postgres` 实现应已在阶段 4 主任务中完成。

---

## 2. Patch 定位

`patch-0` 是阶段 4 之后的数据库接入验证 patch。

它不是新的 Core 能力，而是对阶段 4 长期记忆能力的**真实运行验证与 Demo 可观测性补齐**。

```txt
阶段 4（主文档）：
  实现长期记忆能力
  实现 MemoryProvider 抽象
  实现 PostgresMemoryProvider
  实现 recall / save / extract / observer

patch-0（本 patch）：
  在 Demo 应用中使用 PostgresMemoryProvider
  连接真实 PostgreSQL
  展示真实保存与召回结果
  提供 health 检查与 scope 隔离验证 UI
  让开发者可以通过页面确认长期记忆是否正常工作
```

---

## 2.1 当前基线（动工前已有）

实现本 patch 前，仓库中**预期已存在**以下内容；本 patch **不应重复实现**，而是补齐缺口：

```txt
packages/ai-core
  MemoryProvider / MemoryExtractor 抽象与 SimpleChatWorkflow recall / extract / save
  resolveMemoryScope（仅 sessionId 垫片，不含 companionId 默认值）
  Observer 事件：memory:recall:* / memory:extract:* / memory:save:*
  ChatWorkflowOutput.metadata：extractedMemories / savedMemories / skippedMemories

packages/memory-postgres
  PostgresMemoryProvider（recall / save）
  OpenAIEmbeddingProvider
  migrations/0001_create_companion_memories.sql

apps/model-runtime-demo
  app/api/chat/route.ts 已读取 DATABASE_URL / OPENAI_EMBEDDING_MODEL
  已按 env 注入 PostgresMemoryProvider 或 InMemoryMemoryProvider
  chat-panel 已有基础 DebugBlock（Final Output / Recalled / Extracted / Saved / Observer Events）
```

本 patch **主要缺口**（需新做或补齐）：

```txt
1. packages/memory-postgres：healthCheck（或等价 health 查询能力）
2. Demo API：独立 health 端点（启动时/页面加载时检测 DB + pgvector）
3. Demo UI：Memory DB Panel、Prompt Debug Panel、scope 切换与展示
4. ai-core（小改）：Workflow 输出 debug 字段（见 §5.4、§12），便于 Prompt 面板 100% 还原
5. 严格 fallback：DATABASE_URL 存在但 health 失败时，明确展示错误并使用 Noop（聊天不阻塞）
6. 跑通 §14 全部验证场景
```

---

## 3. Patch 目标

完成后，Demo 页面应该可以跑通以下链路：

```txt
用户输入
↓
MemoryExtractor 抽取长期记忆
↓
PostgresMemoryProvider 保存到 PostgreSQL
↓
下一轮用户输入
↓
PostgresMemoryProvider 使用 pgvector 召回相关记忆
↓
召回结果注入 Prompt
↓
AI 回复自然使用长期记忆
↓
Demo 页面展示 recall / extract / save / embedding / score / scope / DB health
```

示例：

```txt
用户：我喜欢五月天，尤其喜欢突然好想你。

Demo 显示：
- Extracted Memories
- Saved Memories
- Embedding Vector Length
- Provider meta.id: memory.postgres

后续用户：推荐一首适合晚上听的歌。

Demo 显示：
- Recalled Memories（含 score）
- Prompt Debug Panel 中出现长期记忆区块
- scope: session / demo-chat-session / debug-companion

AI 回复：
自然结合五月天相关内容，但不暴露“记忆系统”。
```

---

## 4. Patch 边界

## 4.1 本 patch 要做

1. Demo 应用读取数据库相关环境变量（含可选 `MEMORY_POSTGRES_TABLE`）；
2. Demo 应用读取或提供 embedding 模型配置；
3. Demo 应用创建 `EmbeddingProvider` 与 `PostgresMemoryProvider`（若尚未完整）；
4. Demo 应用将 `PostgresMemoryProvider` 注入 `createCompanionCore`；
5. **`packages/memory-postgres` 提供 `healthCheck()`**；
6. **Demo API 提供 `/api/memory-health`（或等价路由）**，供页面展示 DB / pgvector 状态；
7. Demo 页面 **Memory DB Panel**：Provider meta、DB health、embedding、recall/extract/save 结果、错误；
8. Demo 页面 **Prompt / Context Debug Panel**：展示 workflow 输出的 debug 上下文（见 §12）；
9. Demo 页面 **Observer Events Panel**（可整合进现有面板，但信息须完整）；
10. Demo 页面展示并支持切换 **scope**（sessionId + companionId）；
11. **`ai-core` 小改**：在 `ChatWorkflowOutput.metadata` 增加 demo 调试字段（见 §5.4），**不引入 DB 依赖**；
12. 提供清晰的本地验证路径（§14）。

## 4.2 本 patch 不做

1. 不做用户系统、鉴权、商业化、正式后台；
2. 不做记忆人工审核、编辑 / 删除页面、复杂冲突解决；
3. 不做上下文摘要、LangChain、LangGraph、远程 Tool Call；
4. 不做 Docker / docker-compose；
5. 不把 `pg` / `pgvector` / `drizzle` 放进 `packages/ai-core`；
6. 不让 `packages/ai-core` 读取 `DATABASE_URL` 或创建连接池；
7. **不修改 `resolveMemoryScope` 签名**（companionId 由 Demo 显式传 `scope`）；
8. **不新增 `memory:embedding:*` Observer 事件类型**（用现有事件 payload 扩展即可）。

---

## 5. 核心设计原则

## 5.1 ai-core 仍然保持纯 SDK

「不改变 `ai-core` 边界」指：

```txt
允许
  扩展 ChatWorkflowOutput.metadata 中的 debug 字段
  扩展已有 Observer 事件的 payload（不新增事件名）
  保持 MemoryProvider 抽象与 Workflow 调用方式不变

不允许
  import pg / drizzle / postgres client
  读取 process.env.DATABASE_URL
  在 ai-core 内实现 PostgresMemoryProvider
```

正确关系：

```txt
apps/model-runtime-demo
  读取环境变量
  创建 EmbeddingProvider / PostgresMemoryProvider
  注入 createCompanionCore
  调用 healthCheck / memory-health API
  展示调试面板

packages/memory-postgres
  连接 PostgreSQL、pgvector
  实现 MemoryProvider、healthCheck

packages/ai-core
  只知道 MemoryProvider 接口
  只调用 memory.recall / memory.save
  不知道 PostgreSQL 存在
```

---

## 5.2 Demo 应用负责组装真实运行环境

宿主应用为 `apps/model-runtime-demo`（不是 `apps/demo`）。

示意：

```ts
const embeddingProvider = new OpenAIEmbeddingProvider({
  apiKey: process.env.OPENAI_API_KEY!,
  baseUrl: process.env.OPENAI_BASE_URL,
  model: process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small",
});

const memory = new PostgresMemoryProvider({
  connectionString: process.env.DATABASE_URL!,
  embeddingProvider,
  tableName: process.env.MEMORY_POSTGRES_TABLE, // 可选，默认 companion_memories
});

const core = createCompanionCore({ model, memory });
```

重点：

```txt
读取 env → Demo 应用
连接 PostgreSQL → memory-postgres
调用 MemoryProvider → ai-core workflow
```

---

## 5.3 数据库失败不能阻塞聊天

继续遵守阶段 4 原则：

```txt
Memory.recall 失败 → observer 记录 error，空 memories 继续生成
Memory.extract 失败 → observer 记录 error，跳过本轮抽取
Memory.save 失败 → observer 记录 error，跳过本轮保存
```

数据库异常时：聊天仍可继续，Demo 页面展示 memory / DB error。

---

## 5.4 ai-core 允许的小改动（仅 debug 出口）

为让 Prompt Debug Panel **100% 还原** workflow 实际发给模型的上下文，允许在 `SimpleChatWorkflow` 的 `ChatWorkflowOutput.metadata` 中增加：

```ts
metadata?: {
  // 现有字段保留 …
  debugContext?: {
    scope: MemoryScope;
    memoryContext?: string;       // formatMemoriesForPrompt 结果；无召回时为 undefined
    systemPrompt: string;         // buildPersonaSystemPrompt 完整结果
    messages: ChatMessage[];      // 最终传入 model.generate 的 messages
    embeddingVectorLength?: number; // 本轮 recall 或 save 中最后一次 embedding 的 vector.length
  };
};
```

约束：

```txt
debugContext 仅用于宿主调试展示，不是业务 API 契约
不在 ai-core 内读取 env 或连接数据库
embeddingVectorLength 由 workflow 在 recall/save 成功路径上从 EmbedResult.vector.length 写入
```

---

## 6. 环境变量

Demo 应用（`apps/model-runtime-demo`）支持：

已有：

```txt
OPENAI_API_KEY
OPENAI_BASE_URL
OPENAI_MODEL
```

本 patch 相关：

```txt
DATABASE_URL
OPENAI_EMBEDDING_MODEL   # 可选，默认 text-embedding-3-small
MEMORY_POSTGRES_TABLE    # 可选，默认 companion_memories
```

说明：

```txt
packages/ai-core 不读取这些变量
packages/memory-postgres 不隐式读取这些变量
宿主 Demo 读取后通过构造参数传入
```

Migration 路径：`packages/memory-postgres/migrations/0001_create_companion_memories.sql`

---

## 7. 数据库要求

本 patch 不提供 Docker / docker-compose；开发者自行准备 PostgreSQL + pgvector。

最低要求：

```txt
PostgreSQL 可连接
pgvector extension 可创建或已启用
companion_memories 表已创建
embedding 维度与 embedding 模型一致（text-embedding-3-small → vector(1536)）
```

表结构与索引见阶段 4 主文档 / migration 文件；向量索引（HNSW / IVFFlat）V1 可选。

---

## 8. Demo 初始化与 Fallback 策略

## 8.1 初始化流程

```txt
读取 OPENAI_* / DATABASE_URL
↓
创建 ChatModel
↓
（有 DATABASE_URL 时）创建 EmbeddingProvider + PostgresMemoryProvider
↓
healthCheck → 更新 Demo 内存中的 DB 状态
↓
创建 CompanionCore（按 fallback 策略选择 memory provider）
↓
Debug UI 展示 provider 与 health 状态
```

## 8.2 Fallback 策略（V1 固定，不再二选一）

```txt
情况 1：DATABASE_URL 缺失
  → 使用 InMemoryMemoryProvider
  → 页面显示：PostgreSQL Memory disabled，Reason: DATABASE_URL is missing
  → 聊天可用，记忆进程内、重启丢失

情况 2：DATABASE_URL 存在，healthCheck 通过
  → 使用 PostgresMemoryProvider
  → 页面显示：connected / pgvector enabled

情况 3：DATABASE_URL 存在，healthCheck 失败（连接失败 / pgvector 不可用 / 表不存在）
  → 使用 NoopMemoryProvider（严格模式，便于发现配置问题）
  → 页面显示：Database status: error + 具体 lastError
  → 聊天仍可用；recall/save 为空操作，observer 可记录失败
```

说明：情况 1 用 InMemory 是为方便无 DB 时调试聊天；情况 3 **禁止**静默回退 InMemory，否则无法区分「真连上 Postgres」与「配置错误却看似能存记忆」。

health 检查时机：

```txt
Demo 启动后 / Memory DB Panel 加载时调用 GET /api/memory-health
每次切换 DATABASE_URL 相关 env 后重启 dev server 再验
```

---

## 9. Demo 页面设计

宿主应用：`apps/model-runtime-demo`（现有 Chat Panel 可保留并扩展）。

## 9.1 页面结构

```txt
Chat Panel
Memory DB Panel
Prompt / Context Debug Panel
Observer Events Panel
```

## 9.2 Chat Panel

展示：

```txt
用户输入框、发送按钮、AI 回复
当前 scope（ownerType / ownerId / companionId）
可切换 sessionId、companionId（用于 §14.5 隔离验证）
```

Demo 默认 scope 示例：

```txt
ownerType: session
ownerId: demo-chat-session
companionId: debug-companion
```

实现方式：**请求体显式传 `scope`**，不依赖扩展 `resolveMemoryScope`：

```ts
await core.executeWorkflow({
  message,
  history,
  sessionId, // 保留兼容
  scope: {
    ownerType: "session",
    ownerId: sessionId,
    companionId: selectedCompanionId ?? "debug-companion",
  },
  conversationId: sessionId,
});
```

`ChatWorkflowInput.scope` 优先级高于 `sessionId`（阶段 4 主文档已约定）。

## 9.3 Memory DB Panel

展示：

```txt
Provider meta（id / kind / name / version / description）
Database status（connected / disabled / error）
pgvector status（enabled / disabled / unknown）
Embedding model
Embedding vector length（来自 metadata.debugContext 或 observer payload）
Extracted / Saved / Skipped / Recalled memories
Recall score（RecalledMemory.score）
Memory errors
```

建议结构：

```txt
Memory DB Panel
├── Provider
│   ├── id          # 期望 memory.postgres 或 memory.in-memory
│   ├── kind
│   ├── name
│   └── version
├── Database
│   ├── status
│   ├── pgvector
│   └── lastError
├── Embedding
│   ├── model
│   └── vectorLength
├── Recall
│   ├── query
│   ├── topK
│   └── memories（type / content / importance / score）
├── Extract
│   └── extractedMemories
└── Save
    ├── savedMemories
    └── skippedMemories
```

## 9.4 Prompt / Context Debug Panel

**数据来源唯一约定**：`ChatWorkflowOutput.metadata.debugContext`（§5.4），Demo **不得**在客户端重新拼接 system prompt 冒充 workflow 结果。

至少展示：

```txt
scope
systemPrompt（或拆开展示 Persona + Long-term Memories 区块）
Recent History（debugContext.messages 中除 system 与当前 user 外的条目）
Current User Message
```

验证点：

```txt
有召回 → debugContext.memoryContext 有值，systemPrompt 含长期记忆块
无召回 → memoryContext 为 undefined，不出现空记忆标题块
AI 回复不暴露“记忆系统”
```

## 9.5 Observer Events Panel

展示阶段 4 已定义事件（**不要求** `memory:embedding:*`）：

```txt
memory:recall:start / memory:recall:end
memory:extract:start / memory:extract:end
memory:save:start / memory:save:end
```

每条展示：type、timestamp、payload、ok / error message。

recall score、topK、memories 详情优先从 `memory:recall:end` payload 与 `output.memories` 读取。

---

## 10. Scope 策略

本 patch 不接用户系统，使用 session 级 scope + 可选 companionId。

**不在 `ai-core` 内扩展 `resolveMemoryScope`**。Demo 负责构造并传入 `ChatWorkflowInput.scope`（见 §9.2）。

要求：

```txt
页面必须显示当前 scope
同一轮 recall / save 使用同一 scope
不同 ownerId（sessionId）的记忆不得互相召回
不同 companionId 的记忆不得互相召回（双方 companionId 均显式传入时）
```

隔离验证（§14.5）需要 Chat Panel 提供 sessionId / companionId 切换控件。

注意：`resolveMemoryScope` 仅传 `sessionId` 时**不会**自动填充 `companionId`；若 Demo 不传 `scope.companionId`，Postgres 侧 `companion_id` 为 NULL，与显式 `"debug-companion"` 的行**不会**互召回——Demo 必须稳定传入同一 companionId 策略。

---

## 11. PostgresMemoryProvider 接入要求

`packages/memory-postgres` 在本 patch 中须可被 Demo 使用。

## 11.1 必需能力

```txt
meta
recall(input)
save(input)
healthCheck()    # 本 patch 必需，非可选
dispose()      # 已有则保留
```

## 11.2 meta

须符合 `CoreProviderMeta`，**无 `capabilities` 字段**。示例（与现有实现对齐）：

```ts
meta = {
  id: "memory.postgres",
  kind: "memory",
  name: "PostgreSQL Memory Provider",
  description: "Long-term memory backed by PostgreSQL and pgvector",
  version: "1.0.0",
};
```

InMemory fallback 时展示 `memory.in-memory`（或当前 InMemory provider 的 meta.id）。

## 11.3 recall / save

行为与阶段 4 主文档一致：

```txt
recall：query embedding → scope 过滤 → cosine distance TopK → 返回 score
save：importance < 3 跳过 → 同 scope+type+content 去重 → embedding → INSERT
```

## 11.4 healthCheck

**本 patch 必需。**

```ts
interface MemoryDatabaseHealth {
  ok: boolean;
  databaseConnected: boolean;
  pgvectorEnabled: boolean;
  tableReady: boolean;
  error?: string;
}
```

实现建议：

```txt
SELECT 1
SELECT extname FROM pg_extension WHERE extname = 'vector'
SELECT to_regclass('public.companion_memories') IS NOT NULL  -- 或按 tableName 动态检查
```

Demo 通过 `PostgresMemoryProvider.healthCheck()` 或 `/api/memory-health` 暴露给 UI，**不在 chat 请求路径里做重型检测**。

---

## 12. 可观测数据映射（单一数据源）

Demo 页面**优先**使用下表数据来源，避免读 DB 内部或客户端臆造 Prompt：

| 展示项                      | 数据来源                                                |
| --------------------------- | ------------------------------------------------------- |
| Provider meta               | `core.inspect().providers.memory` 或 chat 响应 metadata |
| DB / pgvector 状态          | `GET /api/memory-health` → `healthCheck()`              |
| Recalled memories + score   | `ChatWorkflowOutput.memories`                           |
| Extracted / Saved / Skipped | `ChatWorkflowOutput.metadata.*`                         |
| Embedding model             | health API 或 chat 响应中 Demo 组装的 config 快照       |
| Embedding vector length     | `metadata.debugContext.embeddingVectorLength`           |
| Prompt / 完整 messages      | `metadata.debugContext`                                 |
| Memory errors               | Observer `memory:*:end` 且 `payload.ok === false`       |
| Recall query / topK         | Observer `memory:recall:start` payload                  |

若 Observer payload 不足，**只扩展既有事件的 payload**，不新增临时事件名。

---

## 13. 错误处理要求

## 13.1 DATABASE_URL 缺失

```txt
PostgreSQL Memory disabled
Reason: DATABASE_URL is missing
MemoryProvider: InMemory
聊天可用
```

## 13.2 DATABASE_URL 存在但 health 失败

```txt
Database status: error
MemoryProvider: Noop（严格 fallback）
聊天可用；recall/save 无效果；页面与 observer 可见错误
```

## 13.3 pgvector 不可用

```txt
pgvector status: disabled
healthCheck.ok = false
```

## 13.4 embedding 失败

```txt
Embedding error（observer memory:save:end 或 memory:recall:end ok=false）
save 失败 → 跳过保存；recall 失败 → 空记忆继续生成
```

## 13.5 SQL 执行失败

```txt
Memory DB error + observer memory:recall:end / memory:save:end ok=false
聊天主链路不崩溃
```

---

## 14. 本地验证流程

## 14.1 启动前准备

```txt
PostgreSQL + pgvector
已执行 migration
DATABASE_URL、OPENAI_*、OPENAI_EMBEDDING_MODEL（可选）
```

## 14.2 启动 Demo

页面应显示（DB 正常时）：

```txt
Provider id: memory.postgres
Database status: connected
pgvector status: enabled
Embedding model: text-embedding-3-small
```

未启用 Postgres 时必须明确原因（§8.2 三种情况之一）。

## 14.3 验证保存

输入：`我喜欢五月天，尤其喜欢突然好想你。`

预期：Extracted / Saved 有值、`embeddingVectorLength` 有值、observer 有 extract/save end、DB status 正常。

## 14.4 验证召回

输入：`推荐一首适合晚上听的歌。`

预期：Recalled 含五月天相关、score 有值、Prompt Debug Panel 含长期记忆块、AI 自然结合且不暴露记忆系统。

## 14.5 验证隔离

切换 **sessionId 或 companionId** 后再问推荐歌曲 → 不应召回五月天记忆；切回原 scope 应能召回。

## 14.6 验证失败不阻塞

错误 `DATABASE_URL` 或停库 → 聊天仍可回复；Memory DB Panel 与 observer 显示 error；页面不白屏。

---

## 15. 推荐执行顺序

```txt
1. [已有] 确认 memory-postgres 与 chat route 基础 wiring
2. 实现 PostgresMemoryProvider.healthCheck
3. 新增 GET /api/memory-health
4. ai-core：SimpleChatWorkflow 输出 metadata.debugContext + embeddingVectorLength
5. chat route：health 失败时 Noop fallback；成功时 Postgres；缺失 URL 时 InMemory
6. chat route / 前端：executeWorkflow 显式传 scope（含 companionId）
7. UI：Memory DB Panel + Prompt Debug Panel + scope 切换
8. 更新 chat-panel 文案（去掉「仅内存、重启丢失」的过时描述，改为按 provider 状态展示）
9. 跑通 §14.3–14.6
10. 对照 §16 验收清单逐项勾选
```

---

## 16. 验收清单

```txt
[ ] Demo 读取 DATABASE_URL / OPENAI_EMBEDDING_MODEL / MEMORY_POSTGRES_TABLE（可选）
[ ] Demo 创建并注入 PostgresMemoryProvider（health 通过时）
[ ] healthCheck 已实现且 /api/memory-health 可用
[ ] DATABASE_URL 缺失 → InMemory + 明确提示
[ ] DATABASE_URL 存在但 health 失败 → Noop + 明确错误（不静默 InMemory）
[ ] packages/ai-core 无 pg / pgvector / drizzle 依赖，不读 DATABASE_URL
[ ] ai-core 输出 metadata.debugContext 供 Prompt 面板使用
[ ] Demo 展示 DB / pgvector / Provider meta（CoreProviderMeta 字段）
[ ] Demo 展示 recall / extract / save / skipped / score / embeddingVectorLength
[ ] Demo 展示 scope，且可切换 sessionId / companionId
[ ] executeWorkflow 显式传 scope，未改 resolveMemoryScope 签名
[ ] 长期偏好可写入 PostgreSQL 并在后续轮次召回
[ ] Prompt Debug Panel 与 workflow 实际 messages 一致
[ ] AI 回复不暴露记忆系统
[ ] scope 隔离验证通过（§14.5）
[ ] DB 失败不阻塞聊天（§14.6）
[ ] 未新增 memory:embedding:* 事件类型
```

---

## 17. 最终交付物

```txt
apps/model-runtime-demo
  memory-health API
  Postgres / InMemory / Noop fallback 策略
  scope 显式传入与 UI 切换
  Memory DB Panel、Prompt Debug Panel、Observer 展示

packages/memory-postgres
  healthCheck
  可被 Demo 导入、联调 pgvector

packages/ai-core
  metadata.debugContext（小改，无 DB 依赖）
```

---

## 18. 一句话总结

`patch-0` 只解决一件事：

```txt
让阶段 4 的长期记忆系统在 apps/model-runtime-demo 中通过真实 PostgreSQL + pgvector 跑起来，
并能从 health、scope、Prompt、Observer 多维度清楚验证；不是重做 Memory Core。
```
