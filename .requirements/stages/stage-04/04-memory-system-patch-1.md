# 04-memory-system-patch-1.md

## 阶段 4 Patch 1：滚动摘要

> 本 patch 目标：在阶段 4 长期记忆系统完成后，为 AI Companion Core 增加“滚动摘要”能力，让长对话可以被压缩成稳定上下文，并在 Demo 页面中直观看到摘要生成、摘要更新、Prompt 注入与 recent history 截断效果。
> 本 patch **不重新设计长期记忆系统**，**不处理 PostgreSQL 记忆存储**，**不引入 LangChain / LangGraph**；主要工作是补齐长对话上下文压缩能力，并保持 `packages/ai-core` 的纯 SDK 边界。

---

## 1. 背景说明

阶段 4 主文档 `04-memory-system.md` 已经明确长期记忆系统的核心闭环：

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

阶段 4 同时明确：本阶段不实现上下文摘要能力，该能力放到后续独立任务中处理。

`04-memory-system-patch-0.md` 已经把“带数据库的 Demo”独立出来，用于验证 PostgreSQL + pgvector 长期记忆实现。它的职责是：

```txt
PostgresMemoryProvider
↓
真实数据库保存
↓
真实向量召回
↓
Demo 页面展示 DB health / saved / recalled / score / embedding
```

本 patch 不处理数据库记忆验证，而是处理另一个问题：

```txt
对话轮次越来越多
↓
history 不能无限增长
↓
旧消息需要被压缩成摘要
↓
Prompt 中保留 summary + recent history
```

---

## 2. Patch 定位

`patch-1` 是阶段 4 之后的上下文压缩增强 patch。

它不是长期记忆系统，也不是数据库 demo，而是为聊天主链路补充一层“会话滚动摘要”。

三者关系：

```txt
阶段 3：
  短期上下文
  ChatInput.history
  最近 n 条消息

阶段 4：
  长期记忆
  MemoryProvider.recall / save
  结构化记忆 + RAG

patch-0：
  带数据库的 Demo
  PostgreSQL + pgvector 真实联调

patch-1：
  滚动摘要
  ConversationSummary
  长对话上下文压缩
```

最终 Prompt Context 形态：

```txt
Persona
↓
Conversation Summary
↓
Long-term Memories
↓
Recent History
↓
Current User Message
```

---

## 2.1 当前基线（动工前已有）

实现本 patch 前，仓库中预期已存在以下内容；本 patch 不应重复实现：

```txt
packages/ai-core
  ChatModel / Model Runtime
  SafetyProvider
  PersonaProvider
  MemoryProvider
  MemoryExtractor
  SimpleChatWorkflow
  PromptContext.build 或等价 Prompt 组装能力
  CoreObserver
  ChatWorkflowOutput.metadata
  memory:recall:* / memory:extract:* / memory:save:* Observer 事件

packages/memory-postgres
  PostgresMemoryProvider
  OpenAIEmbeddingProvider
  pgvector migration
  healthCheck

apps/model-runtime-demo
  基础 Chat Panel
  Memory DB Panel（来自 patch-0）
  Prompt / Context Debug Panel（来自 patch-0 或等价调试面板）
  Observer Events Panel
```

本 patch 主要新增：

```txt
1. ConversationSummary 领域类型
2. SummaryProvider 抽象
3. NoopSummaryProvider
4. InMemorySummaryProvider 或 demo 级实现
5. SummaryExtractor / SummaryUpdater
6. SimpleChatWorkflow summary load / inject / update
7. summary:* Observer 事件
8. Demo 页面展示 Conversation Summary 与 Recent History 截断效果
9. Prompt Debug Panel 展示 summary 注入结果
```

---

## 3. Patch 目标

完成后，Demo 页面应该可以跑通以下链路：

```txt
用户持续对话
↓
history 超过阈值
↓
较早消息被用于生成或更新 Conversation Summary
↓
Prompt 只保留 summary + recent history
↓
模型仍能理解较早上下文
↓
Demo 页面展示 summary / recent history / prompt preview
```

示例：

```txt
第 1 轮：我现在在做 AI Companion Core。
第 2 轮：阶段 1 做完了 Model Runtime。
第 3 轮：阶段 2 做完了 Core 抽象层。
第 4 轮：阶段 3 做完了聊天主链路。
...
第 15 轮：你还记得我前面做到哪了吗？
```

Demo 应显示：

```txt
Conversation Summary:
  用户正在开发 AI Companion Core，已完成 Model Runtime、Core 抽象层和聊天主链路等阶段。

Recent History:
  只保留最近 n 条消息。

Prompt Preview:
  同时包含 Conversation Summary 与 Recent History。
```

AI 回复应该能基于摘要回答，而不是完全依赖完整 history。

---

## 4. Patch 边界

## 4.1 本 patch 要做

1. 在 `packages/ai-core` 中定义 `ConversationSummary` 类型；
2. 在 `packages/ai-core` 中定义 `SummaryProvider` 抽象；
3. 实现 `NoopSummaryProvider`；
4. 实现 `InMemorySummaryProvider` 或 demo 级 summary provider；
5. 实现基于模型的 `SummaryUpdater`；
6. 在 `SimpleChatWorkflow` 中加载 summary；
7. 在 Prompt Context 中注入 summary；
8. 在生成后按策略更新 summary；
9. 在 `ChatWorkflowOutput.metadata` 中暴露 summary 调试字段；
10. 通过 `CoreObserver` 暴露 summary 相关事件；
11. 在 `apps/model-runtime-demo` 中展示 summary、recent history、prompt preview；
12. 提供可控的阈值配置，例如 recent history 保留条数、触发摘要更新的消息数量。

---

## 4.2 本 patch 不做

1. 不做 PostgreSQL 长期记忆；
2. 不做 pgvector；
3. 不做 `packages/memory-postgres`；
4. 不修改 `PostgresMemoryProvider`；
5. 不做用户系统；
6. 不做鉴权；
7. 不做商业化；
8. 不做正式后台；
9. 不做摘要人工编辑；
10. 不做复杂摘要版本管理；
11. 不做摘要数据库持久化；
12. 不做 LangChain；
13. 不做 LangGraph；
14. 不做远程 Tool Call；
15. 不做流式聊天主链路；
16. 不做 Docker / docker-compose；
17. 不把摘要能力和长期记忆能力混在同一个 Provider 中。

---

## 5. 核心设计原则

## 5.1 Summary 不是 Memory

必须明确：

```txt
SummaryProvider ≠ MemoryProvider
ConversationSummary ≠ Long-term Memory
```

长期记忆解决的是：

```txt
跨会话的重要事实、偏好、关系、事件
```

滚动摘要解决的是：

```txt
当前会话上下文过长时的压缩表达
```

因此不要把 summary 保存成 `MemoryRecord`，也不要复用 `MemoryProvider.save` 保存 summary。

错误做法：

```txt
把 Conversation Summary 存进 memories 表
把 Summary 当作 event memory
把 SummaryProvider 写进 packages/memory-postgres
```

正确做法：

```txt
SummaryProvider 单独抽象
SummaryUpdater 单独实现
PromptContext 同时消费 summary 与 memories
```

---

## 5.2 ai-core 仍然保持纯 SDK

`packages/ai-core` 可以包含：

```txt
ConversationSummary 类型
SummaryProvider 抽象
NoopSummaryProvider
InMemorySummaryProvider
SummaryUpdater
Prompt 注入逻辑
Workflow 调用点
Observer 事件定义
```

`packages/ai-core` 不应该包含：

```txt
pg
pgvector
drizzle
数据库连接池
数据库连接字符串
summary migration
```

本 patch 的 summary V1 默认使用内存实现或宿主传入实现，不做数据库持久化。

---

## 5.3 摘要失败不能影响聊天主链路

滚动摘要是上下文增强能力，不是主链路硬依赖。

因此：

```txt
Summary.load 失败：
  使用空 summary 继续生成

Summary.update 失败：
  跳过本轮摘要更新

Summary.save 失败：
  跳过本轮摘要保存
```

只有主模型生成失败，才应该导致本轮聊天失败。

---

## 5.4 先可观测，再优化

本 patch 的重点不是做最完美的摘要算法，而是让 Demo 能明确看到：

```txt
什么时候触发摘要
哪些消息进入摘要
当前摘要是什么
recent history 保留了哪些消息
Prompt 是否注入了 summary
AI 是否能使用 summary
```

所以本 patch 必须优先补充 Debug 输出，不要先追求复杂压缩策略。

---

## 6. Summary 作用域设计

Summary 需要和当前会话绑定。

推荐复用阶段 4 的 `MemoryScope` 思路，但不要强依赖 MemoryProvider。

建议定义：

```ts
export interface SummaryScope {
  ownerType: "anonymous" | "user" | "session" | "custom";
  ownerId: string;
  companionId?: string;
  conversationId?: string;
}
```

当前调试阶段可以使用：

```ts
const scope: SummaryScope = {
  ownerType: "session",
  ownerId: "demo-chat-session",
  companionId: "debug-companion",
  conversationId: "demo-conversation",
};
```

未来接用户系统时可以使用：

```ts
const scope: SummaryScope = {
  ownerType: "user",
  ownerId: user.id,
  companionId: companion.id,
  conversationId: conversation.id,
};
```

说明：

```txt
ownerType / ownerId：
  用于和宿主身份对齐。

companionId：
  用于区分同一 owner 下的不同伴侣。

conversationId：
  用于区分不同会话摘要。
```

如果当前项目已经有 `MemoryScope`，也可以定义：

```ts
export interface SummaryScope extends MemoryScope {
  conversationId?: string;
}
```

但 Summary 不应该依赖 MemoryProvider 实现。

---

## 7. 核心类型设计

## 7.1 ConversationSummary

```ts
export interface ConversationSummary {
  id?: string;
  scope: SummaryScope;
  content: string;
  messageCount?: number;
  messageRange?: {
    fromMessageId?: string;
    toMessageId?: string;
  };
  updatedAt: Date;
  metadata?: Record<string, unknown>;
}
```

字段说明：

```txt
content：
  当前会话的滚动摘要。

messageCount：
  摘要覆盖的消息数量。

messageRange：
  摘要覆盖的消息范围，方便 Debug。

updatedAt：
  摘要最后更新时间。

metadata：
  预留字段，例如 summary model、token estimate、last update reason。
```

---

## 7.2 SummaryLoadInput

```ts
export interface SummaryLoadInput {
  scope: SummaryScope;
}
```

---

## 7.3 SummaryLoadResult

```ts
export interface SummaryLoadResult {
  summary?: ConversationSummary | null;
}
```

---

## 7.4 SummarySaveInput

```ts
export interface SummarySaveInput {
  scope: SummaryScope;
  summary: ConversationSummary;
}
```

---

## 7.5 SummarySaveResult

```ts
export interface SummarySaveResult {
  summary: ConversationSummary;
}
```

---

## 7.6 SummaryProvider

```ts
export interface SummaryProvider extends CoreProvider {
  load(input: SummaryLoadInput): Promise<SummaryLoadResult>;

  save(input: SummarySaveInput): Promise<SummarySaveResult>;
}
```

---

## 7.7 SummaryUpdateInput

```ts
export interface SummaryUpdateInput {
  scope: SummaryScope;
  currentSummary?: ConversationSummary | null;
  messagesToSummarize: ChatMessage[];
}
```

---

## 7.8 SummaryUpdateResult

```ts
export interface SummaryUpdateResult {
  summary: ConversationSummary;
  summarizedMessageCount: number;
  skipped: boolean;
  reason?: string;
}
```

---

## 8. 默认实现

## 8.1 NoopSummaryProvider

`NoopSummaryProvider` 是默认实现。

当宿主没有注入 summary provider 时，Core 仍然可以正常聊天。

行为：

```txt
load 永远返回空 summary
save 不保存
不抛错
```

示例：

```ts
export class NoopSummaryProvider implements SummaryProvider {
  meta = {
    id: "summary.noop",
    name: "Noop Summary Provider",
    version: "1.0.0",
    capabilities: ["summary:disabled"],
  };

  async load(): Promise<SummaryLoadResult> {
    return { summary: null };
  }

  async save(input: SummarySaveInput): Promise<SummarySaveResult> {
    return { summary: input.summary };
  }
}
```

---

## 8.2 InMemorySummaryProvider

`InMemorySummaryProvider` 用于 Demo 和本地调试。

行为：

```txt
按 scope 保存 summary
进程重启后丢失
不依赖数据库
不依赖 MemoryProvider
```

scope key 建议：

```txt
ownerType:ownerId:companionId:conversationId
```

用途：

```txt
快速验证 Summary.load / save
快速验证 Workflow 接入顺序
快速验证 Demo UI 是否能展示 summary
```

注意：

```txt
InMemorySummaryProvider 不是正式持久化实现。
后续如果需要跨重启保存 summary，可以单独实现外部 SummaryProvider。
```

---

## 9. SummaryUpdater 设计

## 9.1 更新时机

摘要更新发生在模型回复生成之后。

推荐流程：

```txt
Model.generate
↓
Safety.guardOutput
↓
Summary.update
↓
Summary.save
↓
Memory.extract
↓
Memory.save
```

也可以放在 `Memory.extract/save` 之后，但建议本 patch 先放在 memory 之前，原因是：

```txt
Summary 只压缩当前会话上下文
Memory 负责长期结构化记忆
二者互不依赖
Summary 失败不影响 Memory
Memory 失败不影响 Summary
```

如果现有 Workflow 中 memory extract/save 已经稳定，也可以保持现有顺序，只要确保 summary update 失败不影响主回复即可。

---

## 9.2 更新输入

摘要更新不应该每轮都处理完整历史。

推荐输入：

```txt
currentSummary
messagesToSummarize
```

其中 `messagesToSummarize` 是被裁剪出 recent history 之外的旧消息。

例如：

```txt
全部 history + 当前轮 user/assistant
├── messagesToSummarize：较早消息
└── recentHistory：最近 n 条消息
```

---

## 9.3 更新触发策略

V1 使用简单阈值策略。

推荐配置：

```ts
export interface SummaryOptions {
  enabled?: boolean;
  recentMessageLimit?: number;
  summarizeTriggerMessageCount?: number;
}
```

默认值：

```txt
enabled: false
recentMessageLimit: 12
summarizeTriggerMessageCount: 16
```

说明：

```txt
recentMessageLimit：
  Prompt 中保留最近多少条原始消息。

summarizeTriggerMessageCount：
  当可用 history 超过多少条时，触发 summary update。
```

本 patch 可以在 Demo 中开启：

```ts
summaryOptions: {
  enabled: true,
  recentMessageLimit: 10,
  summarizeTriggerMessageCount: 14,
}
```

---

## 9.4 截断策略

给定完整上下文消息：

```txt
history + current user message + assistant message
```

处理方式：

```txt
如果总消息数 <= summarizeTriggerMessageCount：
  不更新 summary
  recentHistory 使用原 history

如果总消息数 > summarizeTriggerMessageCount：
  messagesToSummarize = 超出 recentMessageLimit 之外的旧消息
  recentHistory = 最近 recentMessageLimit 条消息
  用 messagesToSummarize 更新 summary
```

注意：

```txt
当前 user message 和 assistant message 可以参与 summary update
但 Prompt 生成时不能提前包含 assistantMessage，因为那时还没有生成。
```

因此实际分两步：

生成前：

```txt
load summary
trim history 为 recentHistory
build prompt
generate
```

生成后：

```txt
把本轮 user / assistant 合并进历史视角
判断是否触发 summary update
保存新 summary
```

---

## 9.5 SummaryUpdater Prompt

```txt
你是 AI Companion 的会话摘要更新器。

你的任务是维护一段简洁、准确、持续更新的会话摘要，用于帮助 AI 在长对话中理解之前发生过什么。

请根据【当前摘要】和【新增对话片段】生成新的摘要。

要求：
1. 保留对后续对话有帮助的信息。
2. 保留用户正在做的事情、阶段进度、重要决定、情绪状态、关系变化。
3. 不要记录无意义寒暄。
4. 不要加入对话中没有出现的信息。
5. 不要写成列表过长的流水账。
6. 摘要应该自然、简洁，适合直接放进 Prompt。
7. 如果新增片段没有长期上下文价值，可以保持原摘要不变。

输出 JSON：
{
  "content": "更新后的会话摘要",
  "reason": "为什么这样更新"
}
```

---

## 9.6 Schema 校验

模型输出必须经过 Zod 校验。

```ts
const SummaryUpdateSchema = z.object({
  content: z.string().min(1),
  reason: z.string().optional(),
});
```

如果校验失败：

```txt
走模型重试机制
重试后仍失败则跳过本轮 summary 更新
不能影响主聊天回复返回
```

---

## 10. Prompt 注入设计

## 10.1 注入位置

生成前 Prompt Context 推荐顺序：

```txt
Persona
↓
Conversation Summary
↓
Long-term Memories
↓
Recent History
↓
Current User Message
```

如果当前没有 summary，不插入 summary 区块。

---

## 10.2 注入格式

```txt
以下是当前会话的摘要，用于帮助你理解长对话上下文。请自然使用，不要机械复述，也不要暴露“摘要系统”存在：

用户正在开发 AI Companion Core。此前已经完成 Model Runtime、Core 抽象层、聊天主链路，并正在围绕长期记忆、数据库 Demo 和滚动摘要设计后续 patch。
```

---

## 10.3 使用规则

Prompt 中应该约束模型：

```txt
会话摘要只作为当前会话上下文参考。
如果摘要和用户当前表达冲突，以用户当前表达为准。
不要说“根据会话摘要”。
不要暴露内部系统存在。
不要机械复述摘要。
只在相关时自然使用。
```

---

## 10.4 与长期记忆的关系

Prompt 中同时存在 Summary 和 Long-term Memories 时：

```txt
Conversation Summary：
  当前会话的压缩上下文。

Long-term Memories：
  结构化长期记忆召回结果。
```

二者都可以影响回复，但不要互相覆盖。

如果二者冲突：

```txt
当前用户消息 > Recent History > Conversation Summary > Long-term Memories
```

---

## 11. Workflow 接入方式

## 11.1 生成前加载 summary

在模型生成前执行：

```txt
Summary.load
```

推荐顺序：

```txt
Persona.load
↓
Safety.guardInput
↓
Summary.load
↓
Memory.recall
↓
PromptContext.build
↓
Model.generate
```

说明：

```txt
Summary.load 和 Memory.recall 理论上可并行。
本 patch 为了降低复杂度，可以先串行。
阶段 7 再考虑并行编排。
```

---

## 11.2 生成前裁剪 recent history

Prompt 不应该无限使用完整 history。

伪代码：

```ts
const summaryResult = await summaryProvider.load({
  scope: input.summaryScope,
});

const recentHistory = trimRecentHistory(input.history, {
  limit: input.summaryOptions?.recentMessageLimit ?? 12,
});

const messages = buildMessages({
  persona,
  summary: summaryResult.summary,
  memories: recallResult.memories,
  history: recentHistory,
  currentMessage: input.message,
});
```

---

## 11.3 生成后更新 summary

模型生成成功后：

```ts
const allMessagesForSummary = [
  ...(input.history ?? []),
  { role: "user", content: input.message },
  { role: "assistant", content: modelOutput.text },
];

const { messagesToSummarize, recentHistory } = splitForSummary(allMessagesForSummary, {
  recentMessageLimit,
  summarizeTriggerMessageCount,
});

if (messagesToSummarize.length > 0) {
  const updated = await summaryUpdater.update({
    scope,
    currentSummary: summaryResult.summary,
    messagesToSummarize,
  });

  await summaryProvider.save({
    scope,
    summary: updated.summary,
  });
}
```

注意：

```txt
summary update/save 失败不影响 output.text
```

---

## 12. ChatInput / Output 扩展

## 12.1 ChatInput 扩展

建议增加：

```ts
export interface ChatInput {
  // 已有字段省略

  summaryScope?: SummaryScope;

  summaryOptions?: SummaryOptions;
}
```

如果不传 `summaryScope`，可以从已有 `scope` / `sessionId` 推导。

推荐规则：

```txt
如果 input.summaryScope 存在：
  使用 input.summaryScope

否则如果 input.scope 存在：
  使用 input.scope + conversationId

否则如果 input.sessionId 存在：
  ownerType = "session"
  ownerId = input.sessionId

否则：
  NoopSummaryProvider 生效，不更新 summary
```

不要为了方便把缺失 scope 的摘要写入 `"default"`。

---

## 12.2 ChatWorkflowOutput.metadata 扩展

建议增加：

```ts
metadata?: {
  // 已有字段省略

  summary?: ConversationSummary | null;
  updatedSummary?: ConversationSummary | null;
  summarySkipped?: boolean;
  summarySkipReason?: string;

  recentHistory?: ChatMessage[];
  summarizedMessages?: ChatMessage[];

  promptDebug?: {
    persona?: string;
    summary?: string;
    memories?: string;
    history?: ChatMessage[];
    finalMessages?: ChatMessage[];
  };
}
```

说明：

```txt
summary：
  生成前加载到的摘要。

updatedSummary：
  本轮生成后更新出的摘要。

summarySkipped：
  本轮是否跳过摘要更新。

summarySkipReason：
  跳过原因，例如 disabled / below_threshold / no_messages_to_summarize / provider_noop。

recentHistory：
  最终注入 Prompt 的 recent history。

summarizedMessages：
  本轮被送去更新摘要的消息。

promptDebug：
  给 Demo Prompt Preview 使用。
```

如果 patch-0 已经定义过 `promptDebug`，本 patch 应扩展现有字段，不要重复创建另一个 debug 结构。

---

## 13. Observer 事件设计

本 patch 增加 summary 事件。

推荐事件名保持和现有 `memory:*` 风格一致：

```txt
summary:load:start
summary:load:end
summary:update:start
summary:update:end
summary:save:start
summary:save:end
```

仍然使用现有事件习惯：

```txt
ok: true
ok: false
```

而不是新增 `success/error` 后缀。

---

## 13.1 summary load payload

```ts
interface SummaryLoadEventPayload {
  scope: SummaryScope;
  ok?: boolean;
  hasSummary?: boolean;
  summaryLength?: number;
  error?: string;
}
```

---

## 13.2 summary update payload

```ts
interface SummaryUpdateEventPayload {
  scope: SummaryScope;
  ok?: boolean;
  skipped?: boolean;
  reason?: string;
  previousSummaryLength?: number;
  nextSummaryLength?: number;
  messagesToSummarizeCount?: number;
  error?: string;
}
```

---

## 13.3 summary save payload

```ts
interface SummarySaveEventPayload {
  scope: SummaryScope;
  ok?: boolean;
  summaryLength?: number;
  error?: string;
}
```

---

## 14. Demo UI 要求

`apps/model-runtime-demo` 需要展示滚动摘要效果。

建议在现有调试区域增加或扩展：

```txt
Context Debug Panel
├── Conversation Summary
├── Updated Summary
├── Recent History
├── Summarized Messages
├── Prompt Preview
└── Summary Observer Events
```

如果 patch-0 已经有 Prompt / Context Debug Panel，则直接扩展该面板，不要重复新增一个相似面板。

---

## 14.1 Conversation Summary

展示：

```txt
当前生成前加载到的 summary
summary updatedAt
summary messageRange
summary messageCount
```

如果没有 summary：

```txt
No summary yet
```

---

## 14.2 Updated Summary

展示：

```txt
本轮是否更新 summary
更新后的 summary
跳过原因
```

常见跳过原因：

```txt
disabled
below_threshold
no_messages_to_summarize
provider_noop
update_failed
save_failed
```

---

## 14.3 Recent History

展示最终注入 Prompt 的 recent history。

目的：

```txt
确认完整 history 没有无限塞进 Prompt
确认 recentMessageLimit 生效
```

---

## 14.4 Summarized Messages

展示本轮进入 summary update 的旧消息。

目的：

```txt
确认哪些消息被压缩
确认 summary 不是凭空生成
```

---

## 14.5 Prompt Preview

Prompt Preview 必须能看到：

```txt
Persona 区块
Conversation Summary 区块
Long-term Memories 区块
Recent History 区块
Current User Message
```

如果某区块为空，应省略该区块，不要显示“无”。

---

## 15. 本地验证场景

## 15.1 阈值触发摘要

配置：

```ts
summaryOptions: {
  enabled: true,
  recentMessageLimit: 4,
  summarizeTriggerMessageCount: 6,
}
```

连续发送 8～10 轮消息。

预期：

```txt
Recent History 只保留最近 4 条左右
旧消息进入 Summarized Messages
Conversation Summary 被生成
Prompt Preview 中出现 Conversation Summary
```

---

## 15.2 记住阶段进度

连续输入：

```txt
我现在在做 AI Companion Core。
阶段 1 做完了 Model Runtime。
阶段 2 做完了 Core 抽象层。
阶段 3 做完了聊天主链路。
阶段 4 做的是长期记忆系统。
我还准备做 patch-0 数据库 Demo 和 patch-1 滚动摘要。
```

后续输入：

```txt
你还记得我目前做到哪了吗？
```

预期：

```txt
AI 能根据 Conversation Summary 回答当前阶段进度。
Demo 显示 summary 包含阶段进度。
```

---

## 15.3 与长期记忆共存

前提：patch-0 或阶段 4 长期记忆能力可用。

先输入：

```txt
我喜欢五月天。
```

再进行多轮阶段进度对话，触发 summary。

后续输入：

```txt
你结合我喜欢的歌手，鼓励我一下。
```

预期：

```txt
Long-term Memories 召回“用户喜欢五月天”
Conversation Summary 包含项目进度
AI 回复同时结合五月天偏好和当前项目进度
Prompt Preview 中能分别看到 Summary 与 Long-term Memories
```

---

## 15.4 摘要失败不阻塞聊天

模拟 SummaryUpdater 返回格式错误或 provider save 失败。

预期：

```txt
聊天回复正常返回
Observer Events 中出现 summary:update:end ok=false 或 summary:save:end ok=false
metadata.summarySkipped = true
summarySkipReason = update_failed 或 save_failed
```

---

## 16. 推荐实现顺序

建议按以下顺序执行：

```txt
1. 在 ai-core 定义 ConversationSummary / SummaryScope / SummaryProvider 类型
2. 实现 NoopSummaryProvider
3. 实现 InMemorySummaryProvider
4. 实现 SummaryUpdater 与 Zod schema
5. 实现 history split / trim 工具函数
6. 在 SimpleChatWorkflow 中接入 Summary.load
7. 在 PromptContext 中注入 Conversation Summary
8. 在 SimpleChatWorkflow 生成后接入 Summary.update / save
9. 增加 summary:* Observer 事件
10. 扩展 ChatWorkflowOutput.metadata
11. 扩展 model-runtime-demo 的 Context / Prompt Debug Panel
12. 跑通本地验证场景
```

重点：

```txt
先让 Noop 不影响现有聊天
再让 InMemory 跑通 Demo
最后再做 UI 展示与验证
```

---

## 17. 验收清单

```txt
[ ] packages/ai-core 没有引入 pg / pgvector / drizzle
[ ] packages/ai-core 没有读取数据库环境变量
[ ] SummaryProvider 与 MemoryProvider 分离
[ ] 默认 NoopSummaryProvider 不影响现有聊天
[ ] InMemorySummaryProvider 可保存与读取 summary
[ ] summaryOptions.enabled=false 时行为与 patch 前一致
[ ] summaryOptions.enabled=true 时可触发摘要
[ ] recentMessageLimit 生效
[ ] summarizeTriggerMessageCount 生效
[ ] Prompt 中可注入 Conversation Summary
[ ] 空 summary 时不插入空区块
[ ] SummaryUpdater 输出经过 Zod 校验
[ ] SummaryUpdater 输出错误时走模型重试机制
[ ] 重试失败后跳过本轮 summary update
[ ] summary load/update/save 失败不阻塞聊天
[ ] ChatWorkflowOutput.metadata 暴露 summary / recentHistory / summarizedMessages
[ ] CoreObserver 输出 summary:* 事件
[ ] Demo 页面可展示 Conversation Summary
[ ] Demo 页面可展示 Updated Summary
[ ] Demo 页面可展示 Recent History
[ ] Demo 页面可展示 Summarized Messages
[ ] Prompt Preview 可看到 Summary + Memories + Recent History
[ ] 不影响阶段 4 长期记忆能力
[ ] 不影响 patch-0 数据库 Demo 能力
```

---

## 18. 最终交付物

本 patch 完成后，应至少包含：

```txt
packages/ai-core
  ConversationSummary 类型
  SummaryScope 类型
  SummaryProvider 抽象
  NoopSummaryProvider
  InMemorySummaryProvider
  SummaryUpdater
  Summary Prompt Formatter
  history split / trim 工具
  SimpleChatWorkflow summary load / inject / update / save 接入
  summary:* Observer Events
  ChatWorkflowOutput.metadata summary debug 字段

apps/model-runtime-demo
  summaryOptions 开关与阈值配置
  Conversation Summary 展示
  Updated Summary 展示
  Recent History 展示
  Summarized Messages 展示
  Prompt Preview 展示 summary 区块
  Summary Observer Events 展示
```

---

## 19. 一句话总结

`patch-1` 只解决一件事：

```txt
让长对话可以被滚动摘要压缩，并且在 Prompt 中以 summary + recent history 的方式继续保持上下文连续性。
```

它不替代长期记忆，也不依赖数据库。长期记忆负责“用户重要事实与偏好”，滚动摘要负责“当前会话发生过什么”。
