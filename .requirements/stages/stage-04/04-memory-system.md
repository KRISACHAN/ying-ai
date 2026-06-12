# 04-memory-system.md

## 阶段 4：记忆系统（长期记忆 + RAG）

> 本阶段目标：实现 AI Companion Core V1 的长期记忆能力。
> 核心闭环是：抽取重要信息、保存为结构化记忆、向量化、语义召回，并在后续对话中自然使用。
> 本阶段不实现上下文摘要能力，该能力放到后续独立任务中处理。

---

## 1. 背景说明

当前项目已经完成：

```txt
阶段 1：Model Runtime
阶段 2：Core 抽象层
阶段 3：聊天主链路（最小闭环）
```

当前阶段要在已有能力上接入长期记忆系统。

阶段 3 已经具备基础聊天链路：

```txt
Persona.load
↓
Safety.guardInput
↓
History（宿主传入）
↓
Model.generate
↓
Safety.guardOutput
```

阶段 4 需要把它扩展为：

```txt
Persona.load
↓
Safety.guardInput
↓
Memory.recall
↓
PromptContext.build
↓
Model.generate
↓
Safety.guardOutput
↓
Memory.extract
↓
Memory.save
↓
Return
```

注意：

```txt
Memory.recall 在模型生成之前执行
Memory.extract / Memory.save 在模型生成之后执行
```

---

## 2. 阶段目标

阶段 4 完成后，AI Companion Core 应该具备长期记忆闭环：

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

例如：

```txt
用户：我喜欢五月天，尤其喜欢突然好想你。

系统抽取：
- [preference] 用户喜欢五月天
- [preference] 用户尤其喜欢《突然好想你》

后续用户：推荐一首适合晚上听的歌。

系统召回：
- 用户喜欢五月天
- 用户尤其喜欢《突然好想你》

AI 回复：
可以自然结合五月天相关歌曲进行回应，但不要说“根据我的记忆库”。
```

---

## 3. 阶段边界

## 3.1 本阶段要做

本阶段只做长期记忆系统。

需要完成：

1. 完善 `MemoryProvider` 抽象；
2. 定义长期记忆领域类型；
3. 提供默认 `NoopMemoryProvider`；
4. 可选提供 `InMemoryMemoryProvider` 用于本地快速调试；
5. 实现基于模型的结构化记忆抽取；
6. 实现长期记忆 Prompt 格式化；
7. 在聊天生成前执行 `Memory.recall`；
8. 在聊天生成后执行 `Memory.extract` 与 `Memory.save`；
9. 支持 PostgreSQL + pgvector 的外部记忆实现；
10. 通过 `CoreObserver` 暴露记忆相关执行过程；
11. 在调试 UI 中展示记忆召回、抽取、保存结果。

---

## 3.2 本阶段不做

本阶段不做：

1. 用户系统；
2. 鉴权；
3. 商业化；
4. 记忆后台管理；
5. 人工审核记忆；
6. 复杂记忆冲突解决；
7. 多租户完整权限模型；
8. 上下文摘要能力；
9. LangChain；
10. LangGraph；
11. 远程 Tool Call；
12. 将数据库依赖放进 `packages/ai-core`。

上下文摘要能力放到后续独立任务中实现，本阶段只需要保证长期记忆接口不会阻碍后续扩展。

---

## 4. 核心原则

## 4.1 ai-core 必须保持纯 SDK

`packages/ai-core` 是核心 SDK，不是业务服务。

它可以包含：

```txt
抽象接口
领域类型
Prompt 格式化
记忆抽取逻辑
Workflow 调用点
Observer 事件定义
Noop / InMemory 默认实现
```

它不能包含：

```txt
pg
pgvector
drizzle
数据库连接池
数据库连接字符串
migration
具体数据库表结构绑定
```

原因：

```txt
ai-core 要保持业务无关、存储无关、部署无关。
```

---

## 4.2 数据库实现必须通过 Provider 注入

PostgreSQL + pgvector 只能作为 `MemoryProvider` 的一种外部实现。

推荐位置：

```txt
packages/memory-postgres
```

不推荐把它直接写在：

```txt
packages/ai-core
```

宿主应用负责创建具体 provider，然后注入 core：

```ts
const memory = new PostgresMemoryProvider({
  connectionString,
  embeddingProvider,
});

const core = createCompanionCore({
  model,
  memory,
});
```

---

## 4.3 ai-core 不读取环境变量

当前已有模型环境变量：

```txt
OPENAI_API_KEY
OPENAI_BASE_URL
OPENAI_MODEL
```

这些已经在阶段 1 中通过宿主应用读取，再传入 `createModel`。

阶段 4 仍然遵循同样原则：

```txt
ai-core 不读取 env
memory-postgres 不应该隐式读取 env
宿主应用读取 env 后通过参数传入
```

如果需要 embedding 模型，建议由宿主应用新增配置并传入：

```txt
OPENAI_EMBEDDING_MODEL
```

如果暂时不加环境变量，也可以在宿主应用初始化 `EmbeddingProvider` 时写默认值。

---

## 4.4 记忆失败不能影响聊天主链路

长期记忆是增强能力，不是主链路硬依赖。

因此：

```txt
Memory.recall 失败：使用空记忆继续生成
Memory.extract 失败：跳过本轮记忆抽取
Memory.save 失败：跳过本轮记忆保存
```

只有主模型生成失败，才应该导致本轮聊天失败。

---

## 5. 记忆作用域设计

虽然当前阶段不接用户系统，但必须提前设计隔离字段，否则后续接用户系统会变成破坏性改造。

不要在 core 里写死：

```txt
user_id
```

推荐使用通用作用域：

```ts
export interface MemoryScope {
  ownerType: "anonymous" | "user" | "session" | "custom";
  ownerId: string;
  companionId?: string;
}
```

当前调试阶段可以使用：

```ts
const scope: MemoryScope = {
  ownerType: "session",
  ownerId: "debug-session",
  companionId: "debug-companion",
};
```

未来接用户系统时使用：

```ts
const scope: MemoryScope = {
  ownerType: "user",
  ownerId: user.id,
  companionId: companion.id,
};
```

这样可以保证：

```txt
不同用户之间的伴侣记忆不会互相干扰
同一用户的不同伴侣也可以隔离记忆
core 不需要知道具体业务用户模型
```

---

## 6. 记忆类型设计

## 6.1 MemoryType

```ts
export type MemoryType = "fact" | "preference" | "relationship" | "event";
```

说明：

```txt
fact
  稳定事实。
  例如：用户是前端开发工程师。

preference
  用户偏好。
  例如：用户喜欢五月天。

relationship
  用户对伴侣关系、互动方式、相处模式的偏好。
  例如：用户希望 AI 说话自然，不要太机械。

event
  用户经历过的重要事件。
  例如：用户之前的 AI Companion 项目做到一半崩了，现在决定推倒重来。
```

---

## 6.2 MemoryImportance

```ts
export type MemoryImportance = 1 | 2 | 3 | 4 | 5;
```

建议规则：

```txt
1：价值很弱，不建议保存
2：普通信息，可跳过
3：有保存价值
4：重要偏好、事实或事件
5：强长期价值，经常影响后续对话
```

V1 推荐只保存：

```txt
importance >= 3
```

---

## 6.3 MemorySource

```ts
export interface MemorySource {
  conversationId?: string;
  messageIds?: string[];
  reason?: string;
}
```

作用：

```txt
记录记忆来源
方便 debug
方便未来做删除、审计、人工审核
```

---

## 6.4 MemoryRecord

```ts
export interface MemoryRecord {
  id: string;
  scope: MemoryScope;
  type: MemoryType;
  content: string;
  importance: MemoryImportance;
  source?: MemorySource;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt?: Date;
}
```

---

## 6.5 ExtractedMemory

```ts
export interface ExtractedMemory {
  type: MemoryType;
  content: string;
  importance: MemoryImportance;
  reason?: string;
  metadata?: Record<string, unknown>;
}
```

---

## 7. MemoryProvider 抽象设计

## 7.1 MemoryRecallInput

```ts
export interface MemoryRecallInput {
  scope: MemoryScope;
  query: string;
  limit?: number;
  minImportance?: MemoryImportance;
}
```

说明：

```txt
scope
  控制记忆隔离范围。

query
  当前用户输入，用于语义召回。

limit
  最多召回多少条，默认建议 5。

minImportance
  最小重要度，默认建议 3。
```

---

## 7.2 RecalledMemory

```ts
export interface RecalledMemory extends MemoryRecord {
  score?: number;
}
```

---

## 7.3 MemoryRecallResult

```ts
export interface MemoryRecallResult {
  memories: RecalledMemory[];
}
```

---

## 7.4 MemorySaveInput

```ts
export interface MemorySaveInput {
  scope: MemoryScope;
  memories: ExtractedMemory[];
  source?: MemorySource;
}
```

---

## 7.5 MemorySaveResult

```ts
export interface MemorySaveResult {
  saved: MemoryRecord[];
  skipped?: ExtractedMemory[];
}
```

---

## 7.6 MemoryProvider

```ts
export interface MemoryProvider {
  meta: CoreProviderMeta;

  recall(input: MemoryRecallInput): Promise<MemoryRecallResult>;

  save(input: MemorySaveInput): Promise<MemorySaveResult>;
}
```

---

## 8. 默认实现

## 8.1 NoopMemoryProvider

`NoopMemoryProvider` 是默认实现。

当宿主没有传入记忆系统时，Core 仍然可以正常聊天。

行为：

```txt
recall 永远返回空数组
save 永远不保存
不抛错
```

示例：

```ts
export class NoopMemoryProvider implements MemoryProvider {
  meta = {
    name: "noop-memory-provider",
    version: "1.0.0",
    capabilities: ["memory:disabled"],
  };

  async recall(): Promise<MemoryRecallResult> {
    return { memories: [] };
  }

  async save(): Promise<MemorySaveResult> {
    return { saved: [], skipped: [] };
  }
}
```

---

## 8.2 InMemoryMemoryProvider

`InMemoryMemoryProvider` 可选实现，用于没有数据库时快速验证链路。

行为：

```txt
内存保存
进程重启后丢失
可以按 importance 排序返回
可以做简单 content 匹配
不需要 embedding
不需要 pgvector
```

用途：

```txt
先验证 core workflow 是否正常
先验证 extract / save / recall 调用顺序
先验证 observer 事件是否正确
```

注意：

```txt
InMemoryMemoryProvider 不是正式 RAG 实现
不能替代 PostgreSQL + pgvector
```

---

## 9. 记忆抽取设计

## 9.1 抽取位置

记忆抽取发生在模型回复生成之后。

```txt
Model.generate
↓
Safety.guardOutput
↓
Memory.extract
↓
Memory.save
```

原因：

```txt
抽取器需要看到本轮用户输入和 AI 回复
但记忆抽取失败不能影响 AI 回复
```

---

## 9.2 抽取输入

```ts
export interface MemoryExtractionInput {
  scope: MemoryScope;
  userMessage: string;
  assistantMessage: string;
  history?: ChatMessage[];
}
```

V1 推荐只传有限上下文：

```txt
当前 userMessage
当前 assistantMessage
最近 3～6 条 history
```

不建议把完整聊天历史传给抽取模型。

---

## 9.3 抽取输出

```ts
export interface MemoryExtractionResult {
  memories: ExtractedMemory[];
}
```

---

## 9.4 抽取规则

应该保存：

```txt
用户明确表达的长期偏好
用户稳定身份信息
用户重要关系信息
用户正在进行的重要项目
用户近期重要事件
用户对 AI 伴侣互动方式的偏好
```

不应该保存：

```txt
寒暄
临时语气
一次性问题
无长期价值的信息
模型自己编造的信息
用户没有明确表达的信息
纯粹的推测
```

---

## 9.5 抽取 Prompt

```txt
你是 AI Companion 的长期记忆抽取器。

你的任务是从本轮对话中抽取对未来对话有长期价值的信息。

只抽取用户明确表达，或可以高置信推断的信息。
不要抽取助手编造的信息。
不要抽取短期寒暄。
不要抽取一次性任务细节，除非它反映了用户长期偏好、身份、关系、重要项目或重要事件。

记忆类型只能是：
- fact
- preference
- relationship
- event

重要度为 1 到 5。
只有 importance >= 3 的记忆会被保存。

请输出 JSON：

{
  "memories": [
    {
      "type": "preference",
      "content": "用户喜欢五月天",
      "importance": 4,
      "reason": "用户明确表达了长期音乐偏好"
    }
  ]
}
```

---

## 9.6 Schema 校验

模型输出必须经过 Zod 校验。

```ts
const ExtractedMemorySchema = z.object({
  type: z.enum(["fact", "preference", "relationship", "event"]),
  content: z.string().min(1),
  importance: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  reason: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const MemoryExtractionResultSchema = z.object({
  memories: z.array(ExtractedMemorySchema),
});
```

如果校验失败：

```txt
走模型重试机制
重试后仍失败则跳过本轮记忆保存
不能影响主聊天回复返回
```

---

## 10. Embedding 设计

## 10.1 EmbeddingProvider 抽象

建议定义独立抽象：

```ts
export interface EmbeddingProvider {
  meta: CoreProviderMeta;

  embed(input: EmbedInput): Promise<EmbedResult>;
}
```

```ts
export interface EmbedInput {
  text: string;
}

export interface EmbedResult {
  vector: number[];
  model?: string;
}
```

---

## 10.2 EmbeddingProvider 放置位置

`EmbeddingProvider` 抽象可以放在 `packages/ai-core`，因为它只是接口。

具体实现不要放进 `packages/ai-core`。

推荐放在：

```txt
packages/memory-postgres
```

或者宿主调试应用内。

---

## 10.3 Embedding 模型配置

建议宿主侧新增：

```env
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
```

如果暂时不想新增环境变量，可以在宿主初始化代码中设置默认值：

```ts
const embeddingModel = process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";
```

注意：

```txt
读取 env 的动作发生在宿主应用
不要发生在 ai-core 内
```

---

## 10.4 向量维度

向量维度取决于 embedding 模型。

如果使用 pgvector，需要在建表时指定维度，例如：

```sql
embedding vector(1536)
```

V1 推荐固定一个 embedding 模型，避免频繁切换维度造成 migration 复杂化。

---

## 11. PostgreSQL + pgvector 实现

## 11.1 实现位置

推荐新增独立包：

```txt
packages/memory-postgres
```

它负责：

```txt
PostgreSQL 连接
pgvector 查询
embedding 调用
记忆保存
记忆召回
基础去重
```

它实现 `packages/ai-core` 暴露的 `MemoryProvider` 接口。

---

## 11.2 推荐目录结构

```txt
packages/memory-postgres/
  src/
    schema.ts
    postgres-memory-provider.ts
    postgres-memory-repository.ts
    embedding-service.ts
    index.ts

  migrations/
    0001_create_companion_memories.sql

  package.json
  tsconfig.json
```

---

## 11.3 数据表

推荐表名：

```txt
companion_memories
```

SQL 示例：

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS companion_memories (
  id TEXT PRIMARY KEY,

  owner_type TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  companion_id TEXT,

  type TEXT NOT NULL,
  content TEXT NOT NULL,
  importance INTEGER NOT NULL DEFAULT 3,

  embedding vector(1536),

  source_conversation_id TEXT,
  source_message_ids JSONB,
  source_reason TEXT,

  metadata JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 11.4 索引

```sql
CREATE INDEX IF NOT EXISTS companion_memories_scope_idx
ON companion_memories (owner_type, owner_id, companion_id);

CREATE INDEX IF NOT EXISTS companion_memories_type_idx
ON companion_memories (type);

CREATE INDEX IF NOT EXISTS companion_memories_importance_idx
ON companion_memories (importance);

CREATE INDEX IF NOT EXISTS companion_memories_embedding_idx
ON companion_memories
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
```

说明：

```txt
scope index
  用于隔离不同 owner / companion 的记忆。

type index
  方便未来按记忆类型筛选。

importance index
  方便过滤低价值记忆。

embedding index
  用于向量召回。
```

---

## 11.5 保存流程

保存流程：

```txt
Memory.save
↓
过滤 importance < 3
↓
基础去重
↓
调用 EmbeddingProvider.embed
↓
写入 companion_memories
↓
返回 saved / skipped
```

基础去重规则：

```txt
同 owner_type
同 owner_id
同 companion_id
同 type
content 完全相同
```

如果命中重复：

```txt
跳过保存
放入 skipped
```

V1 暂不做复杂冲突解决。

---

## 11.6 召回流程

召回流程：

```txt
Memory.recall
↓
使用 query 生成 embedding
↓
在 companion_memories 中按 scope 过滤
↓
按 cosine distance 排序
↓
返回 TopK
```

SQL 示例：

```sql
SELECT
  id,
  owner_type,
  owner_id,
  companion_id,
  type,
  content,
  importance,
  source_conversation_id,
  source_message_ids,
  source_reason,
  metadata,
  created_at,
  updated_at,
  1 - (embedding <=> $1) AS score
FROM companion_memories
WHERE owner_type = $2
  AND owner_id = $3
  AND (companion_id = $4 OR $4 IS NULL)
  AND importance >= $5
ORDER BY embedding <=> $1
LIMIT $6;
```

默认建议：

```txt
limit: 5
minImportance: 3
```

---

## 12. Prompt 注入设计

## 12.1 注入位置

长期记忆应在模型生成前注入 Prompt。

推荐顺序：

```txt
Persona
↓
Long-term Memories
↓
History
↓
Current User Message
```

---

## 12.2 注入格式

```txt
以下是你需要参考的长期上下文，请自然使用，不要机械复述：

- [preference][importance=4] 用户喜欢五月天
- [fact][importance=4] 用户是前端开发工程师
- [event][importance=3] 用户正在开发 AI Companion Core
```

---

## 12.3 使用规则

Prompt 中必须约束模型：

```txt
这些长期上下文只作为参考。
如果长期上下文和用户当前表达冲突，以用户当前表达为准。
不要说“根据我的记忆库”。
不要说“我查询到你的记忆”。
不要暴露内部系统存在。
自然地把相关信息融入回复。
无关记忆不要强行使用。
```

---

## 12.4 空记忆处理

如果没有召回到记忆，不插入长期记忆区块。

不要生成：

```txt
长期记忆：
无
```

直接跳过该部分。

---

## 13. Workflow 接入方式

阶段 4 需要修改 `SimpleChatWorkflow`。

## 13.1 生成前召回

在模型生成前执行：

```txt
Memory.recall
```

输入：

```txt
scope：从 ChatInput / CoreContext 传入
query：当前用户消息
limit：默认 5
minImportance：默认 3
```

召回失败时：

```txt
记录 observer error
使用空 memories 继续生成
```

---

## 13.2 Prompt Context 构建

把召回到的 memories 格式化后加入 Prompt Context。

伪代码：

```ts
const recallResult = await memory.recall({
  scope: input.scope,
  query: input.message,
  limit: input.memoryOptions?.limit ?? 5,
  minImportance: input.memoryOptions?.minImportance ?? 3,
});

const memoryContext = formatMemoriesForPrompt(recallResult.memories);

const messages = buildMessages({
  persona,
  memoryContext,
  history: input.history,
  currentMessage: input.message,
});
```

---

## 13.3 生成后抽取与保存

模型生成完成并通过输出安全检查后，执行：

```txt
Memory.extract
↓
Memory.save
```

伪代码：

```ts
const extraction = await memoryExtractor.extract({
  scope: input.scope,
  userMessage: input.message,
  assistantMessage: modelOutput.text,
  history: input.history?.slice(-6),
});

const memoriesToSave = extraction.memories.filter((memory) => memory.importance >= 3);

await memory.save({
  scope: input.scope,
  memories: memoriesToSave,
  source: {
    conversationId: input.conversationId,
    messageIds: input.messageIds,
  },
});
```

注意：

```txt
抽取失败不影响聊天返回
保存失败不影响聊天返回
```

---

## 14. Observer 事件设计

阶段 4 必须通过 `CoreObserver` 输出记忆过程。

## 14.1 必须事件

```txt
memory.recall.start
memory.recall.success
memory.recall.error

memory.extract.start
memory.extract.success
memory.extract.error

memory.save.start
memory.save.success
memory.save.error
```

---

## 14.2 可选事件

```txt
memory.embedding.start
memory.embedding.success
memory.embedding.error
```

如果 embedding 完全封装在 `PostgresMemoryProvider` 内部，可以通过 provider 返回 debug 信息，或者由 provider 主动触发 observer。

---

## 14.3 recall success payload

```ts
interface MemoryRecallSuccessPayload {
  query: string;
  count: number;
  memories: Array<{
    id: string;
    type: MemoryType;
    content: string;
    importance: MemoryImportance;
    score?: number;
  }>;
}
```

---

## 14.4 extract success payload

```ts
interface MemoryExtractSuccessPayload {
  count: number;
  memories: ExtractedMemory[];
}
```

---

## 14.5 save success payload

```ts
interface MemorySaveSuccessPayload {
  savedCount: number;
  skippedCount: number;
  saved: Array<{
    id: string;
    type: MemoryType;
    content: string;
    importance: MemoryImportance;
  }>;
}
```

---

## 15. Debug UI 要求

阶段 4 完成后，调试 UI 至少要展示：

```txt
当前输入
AI 回复
MemoryProvider meta
召回到的长期记忆
本轮抽取出的记忆
本轮保存成功的记忆
本轮跳过的重复记忆
记忆相关错误
```

如果使用 PostgreSQL + pgvector，还应该展示：

```txt
Embedding vector length
召回 score
TopK 数量
```

调试 UI 的目的不是做正式产品界面，而是让你不看数据库也能判断长期记忆链路是否正常。

---

## 16. 本地验证场景

## 16.1 偏好记忆

第一轮：

```txt
用户：我喜欢五月天，尤其喜欢突然好想你。
```

预期抽取：

```txt
type: preference
content: 用户喜欢五月天
importance: 4
```

后续输入：

```txt
用户：推荐一首适合晚上听的歌。
```

预期结果：

```txt
召回“用户喜欢五月天”
回复自然提到五月天相关歌曲
不暴露“记忆系统”
```

---

## 16.2 身份事实

第一轮：

```txt
用户：我是前端开发工程师，主要写 React 和 Node.js。
```

预期抽取：

```txt
type: fact
content: 用户是前端开发工程师，主要使用 React 和 Node.js
importance: 4
```

后续输入：

```txt
用户：我最近想做一个副业项目。
```

预期结果：

```txt
召回用户职业信息
回复结合前端 / Node.js 背景
```

---

## 16.3 项目事件

第一轮：

```txt
用户：我之前做 AI Companion 项目做到一半崩了，现在决定推倒重来。
```

预期抽取：

```txt
type: event
content: 用户之前的 AI Companion 项目实现失败，现在决定推倒重来
importance: 4
```

后续输入：

```txt
用户：我这次怎么避免又崩？
```

预期结果：

```txt
召回该事件
回复能围绕避免复杂度失控展开
```

---

## 16.4 互动偏好

第一轮：

```txt
用户：我不喜欢你说话太机械，最好像真人朋友一样自然一点。
```

预期抽取：

```txt
type: relationship
content: 用户希望 AI 伴侣说话自然，不要太机械
importance: 5
```

后续输入：

```txt
用户：陪我聊会儿。
```

预期结果：

```txt
回复风格更自然
不暴露“根据记忆”
```

---

## 17. 推荐执行顺序

建议按这个顺序做：

```txt
1. 先完成 ai-core 内的 Memory 类型与 Provider 抽象
2. 接入 NoopMemoryProvider，确保默认聊天不受影响
3. 接入 InMemoryMemoryProvider，验证 recall / save 调用链路
4. 实现 MemoryExtractor，验证结构化抽取
5. 修改 SimpleChatWorkflow，接入 recall 与 prompt 注入
6. 修改 SimpleChatWorkflow，接入 extract 与 save
7. 接入 Observer 事件
8. 调试 UI 展示 memory 过程
9. 实现 packages/memory-postgres
10. 接入 PostgreSQL + pgvector 完整联调
```

这样可以先保证 Core 链路稳定，再接入真实数据库和向量检索。

---

## 18. 验收清单

阶段 4 完成时，需要满足：

```txt
[ ] packages/ai-core 没有引入 pg / pgvector / drizzle
[ ] ai-core 不读取数据库环境变量
[ ] ai-core 不直接连接数据库
[ ] MemoryProvider 抽象稳定
[ ] NoopMemoryProvider 可正常工作
[ ] 未注入 memory 时聊天不受影响
[ ] 注入 InMemoryMemoryProvider 后可保存与召回
[ ] MemoryExtractor 可以抽取结构化记忆
[ ] 抽取结果经过 Zod 校验
[ ] 模型输出格式错误时走重试机制
[ ] 重试失败后跳过本轮记忆保存
[ ] importance < 3 的记忆不会保存
[ ] Memory.recall 在生成前执行
[ ] Memory.save 在生成后执行
[ ] Memory 失败不会导致聊天失败
[ ] 召回结果能注入 Prompt
[ ] 模型不会在回复中暴露“记忆系统”
[ ] Debug UI 可展示 recall / extract / save
[ ] PostgreSQL provider 不在 ai-core 内
[ ] pgvector migration 可执行
[ ] 长期记忆可持久化
[ ] 长期记忆可语义召回
[ ] 不同 scope 的记忆不会互相污染
```

---

## 19. 最终交付物

阶段 4 完成后，应至少包含：

```txt
packages/ai-core
  长期记忆类型
  MemoryProvider 抽象
  NoopMemoryProvider
  InMemoryMemoryProvider
  MemoryExtractor
  Memory Prompt Formatter
  SimpleChatWorkflow memory recall/save 接入
  Memory Observer Events

packages/memory-postgres
  PostgreSQL MemoryProvider
  pgvector migration
  embedding service
  recall/save 实现
  基础去重

debug app
  memory provider 注入
  memory events 展示
  recall / extract / save 可视化
```

---

## 20. 一句话总结

阶段 4 只解决一件事：

```txt
让 AI Companion 具备可持久化、可召回、可自然使用的长期记忆。
```

只要这个长期记忆闭环稳定，后续上下文摘要、情绪状态机、工具调用、流程编排都可以继续平滑接上。
