# V1.3 Stage 02：可控叙事工作流、Lore 与持久化

> 本阶段目标：在 Stage 01 已完成的 `packages/story-core` 领域契约与内存闭环之上，补齐可流式执行、可恢复、可幂等、可观测的完整 Story Workflow，并新增 `packages/story-postgres` 持久化 Story Session、State、Turn、Message 与 Narrative Summary。
>
> 本阶段必须证明：**成功回合只提交一次；失败回合不污染世界状态；进程重启后可以从同一 Definition Snapshot 与 Story State 继续游玩；Lore 的召回与秘密揭示具有确定性、可解释性。**

---

## 1. 前置基线

V1.3 Stage 02 以以下内容已完成为前提：

```txt
packages/story-core
├── StoryDefinition / StorySession / StoryState
├── Story Attribute Schema
├── StoryProvider / StorySessionProvider / StoryStateProvider
├── LoreProvider
├── StoryPlanner / StoryRenderer
├── StateTransitionValidator
├── DefaultStoryWorkflow.execute()
├── InMemory Providers
├── 雾港疑云种子故事
├── 最小武侠 Attribute Schema 契约样例
└── verify:story-contract
```

必须继续保持：

```txt
- story-core 依赖 ai-core 中已经通用的公开能力
- ai-core 不反向依赖 story-core
- Story 不进入 SimpleChatWorkflow
- Story State 不复用 Companion MemoryProvider
- Core 包不读取环境变量、不直接连接数据库
- Story Definition 在开档时冻结，之后读取 definitionSnapshot
- Planner 只输出结构化 TurnPlan
- Renderer 不得直接修改 Story State
- StateChange 必须整批校验、整批应用或整批拒绝
```

本阶段不以重构 `ai-core` 为前置条件。只有遇到已被 Story 与 Companion 同时验证的通用缺口时，才允许对 `ai-core` 做小范围、无 Story 语义的公共能力调整。

---

## 2. 本阶段范围

### 2.1 必须完成

```txt
1. 完整实现 DefaultStoryWorkflow.stream()
2. 定义 Story Core Event 与完整回合 Timeline
3. 将 Lore 升级为 always / keyword / state condition / scene / character 组合召回
4. 建立 secret Lore 的可见性与揭示规则
5. 新增 Narrative Summary 契约与更新策略
6. 新建 packages/story-postgres
7. 持久化 StorySession / Definition Snapshot / StoryState / StoryTurn / StoryMessage / StorySummary
8. 实现单回合事务提交
9. 实现 clientTurnId 幂等语义
10. 明确流式断连、Planner 失败、Renderer 失败、Safety 拒绝时的状态语义
11. 提供 PostgreSQL Migration / 初始化脚本
12. 提供离线 Workflow 契约验证与 PostgreSQL 集成验证
13. 提供多轮、重启恢复与重复提交证据
14. 补齐 story-core / story-postgres README
```

### 2.2 本阶段不做

```txt
- Story Workbench 正式页面
- AI SDK UI Transport 与浏览器消息状态管理
- 完整动态创作表单
- 可视化剧情树
- 向量 Lore 检索
- Rerank
- LangGraph
- 多 Agent
- 多角色独立并发生成
- 角色后台自主行动
- 分支复制、回退与时间旅行
- Definition 热更新旧 Session
- 复杂 Objective 系统
- 复杂战斗引擎
- 可重复事件实例时间线
- Companion Memory 与 Story Memory 互通
- 用户鉴权、多租户与生产部署
```

说明：本阶段允许通过脚本、Node Runner 或最小 API 冒烟验证完整 Story Workflow；正式浏览器端 Story Workbench 放到 Stage 03。

---

## 3. 目标包结构

```txt
packages/story-core/
├── src/
│   ├── abstractions/
│   │   ├── story-event.ts
│   │   ├── story-message.ts
│   │   ├── story-turn.ts
│   │   ├── story-summary.ts
│   │   ├── story-summary-provider.ts
│   │   ├── story-turn-repository.ts
│   │   └── story-workflow.ts
│   ├── lore/
│   │   ├── recall-story-lore.ts
│   │   ├── evaluate-lore-activation.ts
│   │   ├── build-lore-context.ts
│   │   └── estimate-lore-budget.ts
│   ├── summary/
│   │   ├── fake-story-summary-provider.ts
│   │   ├── model-story-summary-provider.ts
│   │   └── build-summary-input.ts
│   ├── workflow/
│   │   ├── default-story-workflow.ts
│   │   ├── story-workflow-step-runner.ts
│   │   └── story-workflow-errors.ts
│   └── index.ts
│
packages/story-postgres/
├── src/
│   ├── client.ts
│   ├── migrations/
│   │   ├── 001-story-schema.sql
│   │   └── index.ts
│   ├── postgres-story-provider.ts            # 可选：Definition 入库；种子仍可来自代码
│   ├── postgres-story-session-provider.ts
│   ├── postgres-story-state-provider.ts
│   ├── postgres-story-turn-repository.ts
│   ├── postgres-story-summary-provider.ts
│   ├── postgres-story-transaction-runner.ts
│   ├── serializers/
│   │   ├── story-definition-serializer.ts
│   │   ├── story-state-serializer.ts
│   │   └── story-event-serializer.ts
│   └── index.ts
├── scripts/
│   ├── migrate.ts
│   └── verify-story-postgres.ts
├── README.md
├── package.json
└── tsconfig.json
```

若现有仓库已经有统一 PostgreSQL Client、Migration Runner 或数据库配置入口，应复用现有宿主层基础设施，不再创建第二套环境变量约定。

`story-postgres` 可以读取由 Host 传入的数据库连接或 client，但不能让 `story-core` 感知 PostgreSQL。

---

## 4. 完整 Story Workflow

## 4.1 单回合输入输出

建议将 Stage 01 的工作流契约扩展为：

```ts
export interface StoryWorkflowInput {
  sessionId: string;
  clientTurnId: string;
  userText: string;
  now?: Date;
  signal?: AbortSignal;
}

export interface StoryWorkflowResult {
  sessionId: string;
  turnId: string;
  clientTurnId: string;
  assistantText: string;
  plan: StoryTurnPlan;
  previousState: StoryState;
  nextState: StoryState;
  recalledLore: RecalledLoreEntry[];
  committed: true;
  summaryStatus: "updated" | "unchanged" | "failed";
}
```

规则：

```txt
- clientTurnId 由 Host 生成，并在同一 Story Session 内唯一
- execute() 与 stream() 必须共享同一套步骤与提交语义
- execute() 不得另写一套简化业务逻辑
- stream() 是最终文字输出方式差异，不是另一套世界状态流程
```

## 4.2 固定步骤

```txt
1. story:start
2. guardInput
3. load StorySession + definitionSnapshot
4. load current StoryState
5. check clientTurnId idempotency
6. load Narrative Summary + recent messages
7. recall Lore
8. story:context-ready
9. Planner.plan
10. story:plan-completed
11. StateTransitionValidator.validate
12. apply changes in memory → nextState
13. story:state-prepared
14. Renderer.stream / Renderer.render
15. guardOutput
16. transaction commit:
      StoryTurn
      User StoryMessage
      Assistant StoryMessage
      next StoryState
17. story:committed
18. update Narrative Summary
19. story:finish
```

工作流内部不得在 Renderer 结束前写入新的 Story State。

## 4.3 状态提交边界

强制采用：

```txt
load old state
↓
plan
↓
validate all changes
↓
apply to an in-memory copy
↓
render complete assistant response
↓
guard output
↓
transaction commit all durable records
```

禁止：

```txt
plan 完成后先更新 state
再开始 stream renderer
```

否则流式失败或 Safety 拒绝时会出现“玩家没看到故事结果，但世界已经推进”的幽灵回合。

## 4.4 Planner 拒绝与非法变更

区分两类情况：

### 戏内拒绝

例如玩家尝试穿过尚未解锁的密门：

```txt
Planner.rejection 有值
stateChanges = []
Renderer 以戏内方式描写失败
回合仍可成功提交
```

### Planner 产出非法 StateChange

例如模型试图写入未声明的 `combatPower`：

```txt
Validator 拒绝整批 change
默认不自动保留合法子集
记录 story:validation-failed
不得持久化 nextState
```

本阶段默认策略：

```txt
- 若 Planner 已提供 rejection，可降级为无状态变化的戏内回复
- 若 Planner 没有可用 rejection，则本回合失败，返回可重试错误
- 不允许 Validator 自己猜测替代 change
```

---

## 5. Story Core Event

Story Event 属于 `story-core`，不塞进 `ai-core` 的 Companion Event 联合类型。

建议定义：

```ts
export type StoryWorkflowEvent =
  | StoryStartEvent
  | StorySessionLoadedEvent
  | StoryStateLoadedEvent
  | StorySummaryLoadedEvent
  | StoryLoreRecalledEvent
  | StoryPlanStartedEvent
  | StoryPlanCompletedEvent
  | StoryValidationFailedEvent
  | StoryStatePreparedEvent
  | StoryRenderStartedEvent
  | StoryTextDeltaEvent
  | StoryRenderCompletedEvent
  | StoryCommittedEvent
  | StorySummaryUpdatedEvent
  | StoryFinishEvent
  | StoryErrorEvent;
```

事件 type 建议：

```txt
story:start
story:session-loaded
story:state-loaded
story:summary-loaded
story:lore-recalled
story:plan-started
story:plan-completed
story:validation-failed
story:state-prepared
story:render-started
story:text-delta
story:render-completed
story:committed
story:summary-updated
story:finish
story:error
```

公共字段：

```ts
export interface StoryEventBase {
  type: string;
  runId: string;
  sessionId: string;
  clientTurnId: string;
  sequence: number;
  occurredAt: Date;
}
```

约束：

```txt
- sequence 在单次 workflow run 内严格递增
- Core Event 可保留 Date、Error 与富对象
- Stage 03 再映射成 Wire-safe Event
- text delta 只承载新增文字，不重复发送累计全文
- story:state-prepared 只能用于 Debug，不能被 UI 当作已提交状态
- 只有 story:committed 之后，Host 才能认为世界状态已经推进
```

`CoreObserver` 若能无 Story 语义地接收通用事件，可作为旁路观察者复用；否则在 `story-core` 定义独立 `StoryObserver`，不要为了复用强行污染现有 Companion Observer。

---

## 6. Lore V1 完整规则

## 6.1 LoreEntry 扩展

在 Stage 01 的 `LoreEntry` 基础上增加状态激活与揭示约束：

```ts
export interface LoreEntry {
  id: string;
  title: string;
  content: string;

  keywords?: string[];
  sceneIds?: string[];
  characterIds?: string[];

  activation:
    | { type: "always" }
    | { type: "keyword"; keywords?: string[] }
    | { type: "state"; conditions: StoryCondition[] }
    | {
        type: "keyword_and_state";
        keywords?: string[];
        conditions: StoryCondition[];
      };

  secret?: boolean;
  revealConditions?: StoryCondition[];
  priority?: number;
  tokenBudget?: number;
}
```

若为了兼容 Stage 01 已有字符串 activation，可在 Definition Normalizer 中升级；最终 `story-core` 内部只保留一个规范结构，禁止 Workflow 同时维护两套判断逻辑。

## 6.2 召回输入

```ts
export interface LoreRecallInput {
  definition: StoryDefinition;
  state: StoryState;
  userText: string;
  currentSceneId: string;
  activeCharacterIds: string[];
  revealedLoreIds: string[];
  maxEntries?: number;
  totalTokenBudget?: number;
}
```

## 6.3 召回顺序

每条 Lore 必须依次通过：

```txt
1. sceneIds 过滤
2. characterIds 过滤
3. secret / reveal 可见性检查
4. activation 判断
5. priority 排序
6. per-entry tokenBudget 截断
7. totalTokenBudget 截断
```

建议排序：

```txt
priority DESC
activation specificity DESC
stable definition order ASC
```

其中 specificity 可按以下顺序：

```txt
keyword_and_state
state
keyword
always
```

同样输入必须产生同样的召回结果，不依赖对象遍历偶然顺序。

## 6.4 Keyword 规则

V1.3 采用可预测的基础规则：

```txt
- 默认大小写不敏感
- 中文按子串命中
- 英文可按归一化后的 token 或子串命中
- 任一 keyword 命中即激活
- 空 keyword 列表不能被视作自动命中
- 不做向量扩展、同义词扩展与模糊纠错
```

## 6.5 Secret Lore 规则

`secret: true` 不等于“永远不能进入模型上下文”，而是：

```txt
- 未满足 revealConditions 且不在 revealedLoreIds → 不进入 Renderer 可见上下文
- Planner 是否可见必须由用途明确区分
```

建议分为：

```ts
export interface RecalledLoreEntry {
  entry: LoreEntry;
  visibility: "planner_only" | "planner_and_renderer";
  activationReason: string[];
}
```

规则：

```txt
- 角色隐藏动机、幕后事实可 planner_only
- 玩家已经发现的 Lore 可 planner_and_renderer
- Renderer 上下文不得包含尚未揭示且会导致直接泄密的完整原文
- revealedLoreIds 只能来自经过校验的 StoryTurnPlan 或满足 revealConditions 的确定性推导
```

若 Stage 01 的 `StoryState` 尚未保存 `revealedLoreIds`，本阶段应新增固定 Core State 字段：

```ts
revealedLoreIds: string[];
```

该字段属于故事引擎通用状态，不放进 `attrs`。

## 6.6 Lore Debug 信息

`story:lore-recalled` 至少包含：

```txt
- recalled lore ids
- activation reason
- visibility
- priority
- estimated / actual budget
- 被过滤条目的 reason code（Debug 可选，生产 Wire 默认不全量发送）
```

---

## 7. Narrative Summary

## 7.1 定位

```txt
Story Definition   = 创作者不可变事实
Story State        = 当前确定性世界状态
Recent Messages    = 最近若干轮原文
Narrative Summary  = 更早剧情的压缩叙事记忆
```

Narrative Summary 不能替代 Story State，也不能反向覆盖 Story Definition。

## 7.2 契约

```ts
export interface StoryNarrativeSummary {
  sessionId: string;
  throughTurnNumber: number;
  text: string;
  version: number;
  updatedAt: string;
}

export interface StorySummaryProvider {
  getSummary(sessionId: string): Promise<StoryNarrativeSummary | null>;
  updateSummary(input: StorySummaryUpdateInput): Promise<StoryNarrativeSummary>;
}
```

`StorySummaryUpdateInput` 至少包含：

```txt
previous summary
newly committed turns
current Story State
Definition 中允许进入摘要的公开事实
```

不得把未揭示秘密自动写进面向 Renderer 的 Narrative Summary。

## 7.3 更新时机

V1.3 建议采用阈值更新：

```txt
- 每 N 个成功回合更新一次
或
- recent message budget 超过阈值时更新
```

具体阈值由 Host 注入配置，`story-core` 不读环境变量。

提交语义：

```txt
Story Turn 成功事务提交
↓
尝试更新 Summary
```

Summary 失败：

```txt
- 不回滚已提交 Story Turn
- 记录 story:error 或 story:summary-updated(status=failed)
- 下回合继续使用旧 Summary + recent messages
- 必须可以重试
```

Summary 版本更新需要并发保护，避免两个请求覆盖彼此。

---

## 8. Story Persistence Domain

## 8.1 持久化对象

必须持久化：

```txt
StorySession
Definition Snapshot
StoryState
StoryTurn
StoryMessage
StoryNarrativeSummary
```

Story Definition 本体可以继续来自代码种子；但 Session 必须保存不可变 Snapshot，确保种子升级后旧存档仍可继续。

## 8.2 推荐数据表

### story_sessions

```txt
id                    text / uuid primary key
story_id              text not null
definition_version    text not null
definition_snapshot   jsonb not null
created_at            timestamptz not null
updated_at            timestamptz not null
```

### story_states

```txt
session_id            primary key references story_sessions(id)
schema_version        integer not null
state_json             jsonb not null
revision               bigint not null
updated_at             timestamptz not null
```

`state_json` 保存完整规范化 `StoryState`。V1.3 不把每个动态 attr 拆成数据库列，否则会违背每个 Story 自定义 Schema 的目标。

### story_turns

```txt
id                     text / uuid primary key
session_id             references story_sessions(id)
turn_number            integer not null
client_turn_id         text not null
status                  text not null
user_text               text not null
assistant_text          text
plan_json               jsonb
recalled_lore_json      jsonb
previous_state_revision bigint not null
next_state_revision     bigint
error_json              jsonb
created_at              timestamptz not null
committed_at            timestamptz
unique(session_id, client_turn_id)
unique(session_id, turn_number)
```

`status` 至少支持：

```txt
processing
committed
failed
```

### story_messages

```txt
id             text / uuid primary key
session_id     references story_sessions(id)
turn_id        references story_turns(id)
role           text not null   # user / assistant
content        text not null
sequence       integer not null
created_at     timestamptz not null
unique(turn_id, role)
```

V1.3 每回合固定一条 user + 一条 assistant message。未来多角色分段消息再升级结构，不在本阶段提前设计复杂表。

### story_summaries

```txt
session_id           primary key references story_sessions(id)
through_turn_number  integer not null
version              bigint not null
summary_text         text not null
updated_at           timestamptz not null
```

## 8.3 JSON 序列化规则

```txt
- 数据库 JSON 必须是 Wire-safe 纯值
- 不保存 Date 对象、Error 实例、class 实例、Map、Set
- StoryState / Definition Snapshot 入库前必须通过 schemaVersion 校验
- 读取后必须 normalize + validate，不能直接信任 jsonb
- 未知 schemaVersion 明确报错，不静默猜测
```

## 8.4 Definition Snapshot

开档事务：

```txt
1. StoryProvider.getDefinition(storyId)
2. validate definition
3. deep clone / canonical serialize
4. 计算 definitionVersion 或 content hash
5. initialize StoryState
6. 事务写入 story_sessions + story_states
```

后续回合：

```txt
只从 story_sessions.definition_snapshot 读取
禁止重新读取最新种子 Definition 替换 Snapshot
```

---

## 9. 事务、一致性与并发

## 9.1 成功回合事务

单一数据库事务内完成：

```txt
1. 锁定 / 条件读取当前 story_states revision
2. 确认 clientTurnId 未提交
3. 插入或更新 story_turns 为 committed
4. 插入 user message
5. 插入 assistant message
6. CAS 更新 story_states：revision = previous + 1
7. 更新 story_sessions.updated_at
8. commit
```

建议采用乐观并发：

```sql
UPDATE story_states
SET state_json = $nextState,
    revision = revision + 1,
    updated_at = now()
WHERE session_id = $sessionId
  AND revision = $expectedRevision;
```

影响行数不是 1：

```txt
→ STORY_STATE_CONFLICT
→ 整个事务回滚
→ 不覆盖其他已提交回合
```

## 9.2 同一 Session 并发

V1.3 不支持同一 Story Session 并行推进多个回合。

```txt
- 不同 Session 可以并发
- 同一 Session 必须依赖 revision / transaction 检测冲突
- 不做队列与自动串行重放
- 冲突返回明确可重试错误
```

## 9.3 clientTurnId 幂等

规则：

```txt
同一 sessionId + clientTurnId：

若已有 committed turn
→ 返回已提交结果
→ 不再次调用 Planner / Renderer
→ 不再次推进 State

若已有 processing turn 且未超时
→ 返回 in-progress / conflict

若已有 failed turn
→ 允许使用同一 clientTurnId 重试还是必须新 id，应固定一种语义
```

V1.3 建议：

```txt
failed turn 不占用永久幂等结果；重试同一 clientTurnId 可重新执行，
但必须更新同一 turn record 的 attemptCount 或清晰覆盖失败信息。
```

若实现复杂度过高，可以采用更保守规则：failed 后必须新 clientTurnId；但 Stage 02 文档与实现必须一致，不能模糊。

## 9.4 processing 记录

可选方案：在调用模型前先插入 `processing` turn，用于防止重复请求同时进入模型。

若采用：

```txt
- processing 写入应是短事务
- committed 仍在最终事务完成
- 需要 stale processing 清理 / 超时语义
```

若不采用：

```txt
- 依赖最终 unique(session_id, client_turn_id)
- 可能发生重复模型调用，但只能有一次提交成功
```

V1.3 优先保证“只提交一次”，不强求“模型只调用一次”。实现方案须在 README 记录。

---

## 10. 失败与恢复语义

错误建议采用稳定 code：

```txt
STORY_SESSION_NOT_FOUND
STORY_DEFINITION_INVALID
STORY_STATE_INVALID
STORY_STATE_CONFLICT
STORY_INPUT_REJECTED
STORY_PLANNING_FAILED
STORY_PLAN_INVALID
STORY_STATE_CHANGE_REJECTED
STORY_RENDER_FAILED
STORY_OUTPUT_REJECTED
STORY_PERSIST_FAILED
STORY_SUMMARY_FAILED
STORY_ABORTED
```

### Planner 失败

```txt
- 不修改 StoryState
- 不创建 committed messages
- 可记录 failed turn
- 返回可重试错误
```

### Validator 失败

```txt
- 整批 stateChanges 拒绝
- 不提交 nextState
- 若存在合法 rejection guidance，可生成无状态变化的戏内回复
- 否则失败
```

### Renderer 流式失败

```txt
- 已发送的 delta 仅是临时输出
- 不提交 nextState / assistant message
- 发出 story:error
- Host 在 Stage 03 必须把该回合标记为未完成
```

### AbortSignal / 客户端断连

```txt
- 若尚未 committed：中止模型调用并保持旧 State
- 若事务已经 committed：世界已推进，重新读取 clientTurnId 返回已提交结果
- 不能仅依据浏览器是否收到 finish 判断数据库状态
```

### guardOutput 拒绝

```txt
- 不提交 nextState
- 不提交原始被拒绝文本
- 可返回安全替代错误或由 SafetyProvider 提供安全文本
- 若使用安全替代文本，必须明确它是否对应无状态变化回合
```

V1.3 建议：输出 Safety 拒绝时整回合失败，不推进状态；暂不引入复杂替代文本提交语义。

### Persistence 失败

```txt
- 事务回滚
- StoryState 保持旧 revision
- 不发送 story:committed
- Renderer 文本可能已流给客户端，但必须以 error 结束
- 重试通过同一 clientTurnId 检查是否实际提交
```

---

## 11. 上下文组装与预算

Planner Context 与 Renderer Context 必须分开组装。

### Planner 可见

```txt
- Definition 中与当前回合相关的规则
- 当前 StoryState
- Attribute Schema 与当前 attrs
- Narrative Summary
- 最近消息
- planner_only Lore
- planner_and_renderer Lore
- 角色秘密与 forbidden knowledge 约束
```

### Renderer 可见

```txt
- 玩家输入
- 当前场景
- active characters
- 经过校验的 TurnPlan
- previousState / nextState 的必要差异
- Narrative Summary
- 最近消息
- planner_and_renderer Lore
- NarrativeRules
```

Renderer 不得直接接收所有秘密原文。

预算建议：

```txt
1. 固定规则与 Schema
2. 当前 Scene / active Characters
3. 当前 State
4. 必需 Lore
5. Summary
6. Recent Messages
7. 低优先级 Lore
```

当超出预算：

```txt
- 优先丢弃低优先级 Lore
- 再减少 Recent Messages
- 不丢失当前 State、Schema 和当前 Scene
- 不用截断后的非法 JSON 传给 Planner
```

`story-core` 可定义 Provider 无关的字符 / 粗略 token 预算策略；精确 tokenizer 非 V1.3 必需。

---

## 12. Provider 与事务边界

Stage 01 中可能存在分散的 Provider：

```txt
StorySessionProvider
StoryStateProvider
StoryTurnRepository
StorySummaryProvider
```

但成功回合需要一个原子提交入口。建议在 `story-core` 定义领域级 Unit of Work：

```ts
export interface StoryTurnCommitter {
  commitSuccessfulTurn(input: CommitSuccessfulStoryTurnInput): Promise<CommittedStoryTurn>;
}
```

`CommitSuccessfulStoryTurnInput` 包含：

```txt
sessionId
clientTurnId
expectedStateRevision
previousState
nextState
userMessage
assistantMessage
plan
recalledLore metadata
```

实现：

```txt
InMemoryStoryTurnCommitter
PostgresStoryTurnCommitter
```

这样 `DefaultStoryWorkflow` 不需要知道 SQL transaction，也不会尝试跨多个 Provider 自己拼“伪事务”。

读取接口仍可保持拆分；写入成功回合必须走单一 Committer。

禁止：

```txt
await stateProvider.save(nextState)
await messageProvider.save(user)
await messageProvider.save(assistant)
```

因为第二或第三步失败会留下半提交数据。

---

## 13. 测试与验证

## 13.1 离线 Workflow 契约

新增：

```txt
pnpm --filter @ying-companion/story-core verify:story-workflow
```

使用：

```txt
FakeStoryPlanner
FakeStoryRenderer
InMemoryStory Providers
InMemoryStoryTurnCommitter
FakeStorySummaryProvider
```

必须验证：

```txt
1. 完整事件顺序稳定
2. story:text-delta 可拼接为最终 assistantText
3. 成功回合只在 render + safety 成功后 commit
4. Planner 失败不改 State
5. Validator 拒绝不改 State
6. Renderer 中途失败不改 State
7. Output Safety 拒绝不改 State
8. Summary 失败不回滚已提交 Turn
9. 同一 clientTurnId 返回同一 committed result
10. 不同 Session 状态隔离
11. 同一 Session revision 冲突不覆盖已提交状态
12. Secret Lore 不进入 Renderer Context
13. reveal condition 满足后 Lore 可进入 Renderer Context
14. Lore 排序和预算结果确定
15. 动态 Attribute Schema 仍严格生效
```

## 13.2 PostgreSQL 集成验证

新增：

```txt
pnpm --filter @ying-companion/story-postgres verify:story-postgres
```

必须验证：

```txt
1. migration 可重复安全执行或有明确版本门禁
2. 创建 Session 同时持久化 Definition Snapshot + 初始 State
3. 成功回合原子提交 State / Turn / Messages
4. 任一步抛错时事务回滚
5. unique(sessionId, clientTurnId) 生效
6. revision CAS 生效
7. 重启新进程后可读取并继续 Session
8. 修改种子 Definition 后旧 Session 仍使用 Snapshot
9. Summary version 并发保护生效
10. jsonb 读取后重新通过 schemaVersion / Definition 校验
```

## 13.3 多轮恢复脚本

建议：

```txt
scripts/verify-story-recovery.ts
```

流程：

```txt
1. 创建「雾港疑云」Session
2. 连续提交至少 5 个确定性回合
3. 记录 sessionId / state revision / messages
4. 销毁 Runtime 与 Provider 实例
5. 重新连接 PostgreSQL
6. 从同一 sessionId 继续至少 2 回合
7. 验证 clues / events / attrs / scene / revealedLoreIds 连续
8. 重复提交旧 clientTurnId，确认不二次推进
```

## 13.4 Model Smoke

真实模型验证仍不是确定性完成门禁，但建议提供：

```txt
verify:story-model-workflow
```

只验证：

```txt
- Planner 结构化输出能通过 schema parse
- Renderer 可以流式输出
- 真实模型失败不会污染 State
```

真实模型内容质量不作为 Stage 02 自动化断言。

---

## 14. 文档要求

更新：

```txt
packages/story-core/README.md
packages/story-postgres/README.md
AGENTS.md
.requirements/README.md
```

`story-core/README.md` 至少说明：

```txt
- Story Workflow 完整步骤
- execute / stream 共享语义
- Core Event 列表
- Lore 可见性
- Narrative Summary 边界
- StoryTurnCommitter 原子提交约定
```

`story-postgres/README.md` 至少说明：

```txt
- Host 如何注入数据库 client
- migration 命令
- 表结构职责
- Definition Snapshot 冻结策略
- revision 与 clientTurnId 语义
- processing / failed turn 采用的最终策略
- 本地验证方式
```

---

## 15. 实施顺序

```txt
1. 补齐 StoryTurn / StoryMessage / StorySummary / Story Event 契约
2. 引入 StoryTurnCommitter，重构 execute() 使用原子提交抽象
3. 让 execute() / stream() 共享 step runner
4. 实现 Lore 状态条件、秘密可见性和预算
5. 实现 Narrative Summary 契约与 Fake Provider
6. 完成 verify:story-workflow
7. 新建 story-postgres 与 migrations
8. 实现 Session / State / Turn / Message / Summary Repository
9. 实现 PostgresStoryTurnCommitter
10. 完成 verify:story-postgres
11. 完成多轮重启恢复脚本
12. 可选接真实模型 smoke
13. 更新 README / AGENTS / requirements 索引
```

不要先写 API Route 或 UI。Stage 02 首先要把“状态是否真正提交”这件事做对。

---

## 16. 完成门禁

Stage 02 Done 必须同时满足：

```txt
[ ] DefaultStoryWorkflow.execute() 与 stream() 使用同一业务步骤
[ ] Story Core Event 顺序有确定性测试
[ ] Lore 支持 always / keyword / state / keyword_and_state
[ ] Secret Lore 的 planner_only / renderer 可见性有测试
[ ] revealedLoreIds 成为确定性 Core State
[ ] Narrative Summary 与 Story State 明确分离
[ ] Summary 失败不会回滚成功 Turn
[ ] packages/story-postgres 已建立
[ ] Session 开档冻结 Definition Snapshot
[ ] 成功 Turn 原子提交 State / Turn / Messages
[ ] clientTurnId 幂等有数据库约束与测试
[ ] StoryState revision 冲突有测试
[ ] Planner / Validator / Renderer / Safety / Persistence 失败均不污染 State
[ ] 流式中断未提交时世界不推进
[ ] PostgreSQL 重启恢复脚本通过
[ ] 旧 Session 不受种子 Definition 后续修改影响
[ ] 动态 Attribute Schema 在持久化后仍严格校验
[ ] verify:story-workflow 通过
[ ] verify:story-postgres 通过
[ ] build / typecheck / lint 通过
[ ] story-core / story-postgres README 完成
```

本阶段完成后，系统必须能够回答：

```txt
这个 Session 使用的是哪一版 Definition Snapshot？
当前世界状态 revision 是多少？
本回合召回了哪些 Lore，为什么召回？
Planner 提出了哪些 StateChange？
哪些 Change 通过或被拒绝？
Renderer 是否完整结束？
这个 clientTurnId 是否已经提交？
世界状态是否真的推进？
Summary 更新到哪个 turn？
进程重启后为什么还能继续？
```

如果这些问题无法通过结构化数据和测试回答，Stage 02 不能标记完成。

---

## 17. Stage 02 结束后的系统状态

```txt
Stage 01
Story Domain + 动态 Attribute Schema + 内存闭环
        ↓
Stage 02
可控 Lore + 流式 Workflow + 原子持久化 + 重启恢复
        ↓
Stage 03
Story Workbench + Wire Event + AI SDK UI + 发布收口
```

Stage 02 完成后，Story Mode 应已经是一个真正可复用的 SDK Runtime，而不是只能在单进程脚本里运行的 Prompt Demo。
