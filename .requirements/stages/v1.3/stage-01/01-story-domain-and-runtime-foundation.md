# V1.3 Stage 01：Story Domain 与最小运行时

> 本阶段目标：在不修改现有 Companion Chat 主链路、不接 PostgreSQL、不接正式 Demo UI 的前提下，新增独立的 `packages/story-core`，建立 Story Domain、动态 Attribute Schema、确定性状态变更与最小内存运行闭环。
>
> 本阶段必须证明：**同一套 Story Runtime 能运行不同类型的故事；模型只能修改 Story Definition 明确声明过的状态；非法变更不能污染世界状态。**

---

## 1. 前置基线

V1.3 以 `prod` 分支已完成的 V1.0 / V1.1 / V1.2 为实现基线。

当前可复用能力：

```txt
packages/ai-core
├── ChatModel / ModelProfile
├── SafetyProvider
├── CoreObserver
├── ToolPlanningProvider 的结构化规划模式
├── 通用模型消息类型
└── execute / stream 的工作流设计经验
```

当前仍需保持的事实：

```txt
- ai-core 仍以 Companion 语义为主
- V1.3 不重命名、不拆分 ai-core
- Story 不进入 SimpleChatWorkflow
- Story State 不复用 Companion MemoryProvider
- story-core 只复用 ai-core 中已经通用的公开能力
```

依赖方向：

```txt
story-core
   ↓
ai-core
```

禁止：

```txt
ai-core
   ↓
story-core
```

---

## 2. 本阶段范围

### 2.1 必须完成

```txt
1. 新建 packages/story-core，并接入 monorepo（workspace / turbo / 根文档索引）
2. 建立 Story Domain 核心类型与 Provider 接口（含 item / clue / event 目录）
3. 建立 Core StoryState + Story Attribute Schema 两层状态模型
4. 建立确定性的 StateTransitionValidator
5. 提供内存 Story / State / Session / Lore Provider
6. 提供 FakeStoryPlanner / FakeStoryRenderer（契约门禁路径）
7. 提供 ModelStoryPlanner / ModelStoryRenderer（实现可有；非完成门禁）
8. 提供 DefaultStoryWorkflow.execute()
9. 提供种子故事「雾港疑云」
10. 提供第二套最小武侠 Attribute Schema 契约样例
11. 提供无网络确定性验证脚本 verify:story-contract
12. 补齐 packages/story-core/README.md
```

**Stage 01 完成门禁（硬规则）：**

```txt
以 verify:story-contract（Fake Planner / Fake Renderer，完全离线）通过为准。
ModelStoryPlanner / ModelStoryRenderer 与 verify:story-model-smoke 为可选加分；
真实模型冒烟失败或不写，不挡本阶段 done。
```

### 2.2 本阶段不做

```txt
- PostgreSQL 持久化
- StorySession 恢复
- Story Workflow 流式事件
- Story Workbench UI
- AI SDK UI Transport
- 完整 state-condition Lore
- Narrative Summary
- LangGraph
- 多 Agent
- 复杂战斗系统
- 可视化剧情节点编辑器
- 完整动态创作表单
- 玩家开档时填写动态属性
- Definition 热更新旧存档
```

---

## 3. 目标包结构

建议新增：

```txt
packages/story-core/
├── src/
│   ├── abstractions/
│   │   ├── story-definition.ts
│   │   ├── story-catalog.ts          # Item / Clue / Event 目录
│   │   ├── story-condition.ts
│   │   ├── story-session.ts
│   │   ├── story-state.ts
│   │   ├── story-state-change.ts
│   │   ├── story-provider.ts
│   │   ├── story-state-provider.ts
│   │   ├── story-session-provider.ts
│   │   ├── lore-provider.ts
│   │   ├── story-planner.ts
│   │   ├── story-renderer.ts
│   │   ├── story-workflow.ts
│   │   └── state-transition-validator.ts
│   ├── providers/
│   │   ├── in-memory-story-provider.ts
│   │   ├── in-memory-story-state-provider.ts
│   │   ├── in-memory-story-session-provider.ts
│   │   └── keyword-lore-provider.ts
│   ├── planner/
│   │   ├── fake-story-planner.ts
│   │   ├── model-story-planner.ts    # 可选实现
│   │   └── story-turn-plan-schema.ts
│   ├── renderer/
│   │   ├── fake-story-renderer.ts
│   │   └── model-story-renderer.ts   # 可选实现
│   ├── state/
│   │   ├── default-story-transition-validator.ts
│   │   ├── apply-story-state-changes.ts
│   │   ├── initialize-story-state.ts
│   │   └── story-attribute-key.ts
│   ├── workflow/
│   │   └── default-story-workflow.ts
│   ├── seeds/
│   │   ├── fog-harbor-mystery.ts
│   │   └── minimal-wuxia-contract.ts
│   └── index.ts
├── scripts/
│   ├── verify-story-contract.ts
│   └── verify-story-model-smoke.ts   # 可选
├── README.md
├── package.json
└── tsconfig.json
```

文件名可根据仓库现有风格微调，但必须保持：

```txt
abstractions
providers
planner
renderer
state
workflow
seeds
```

职责清晰，禁止把全部实现堆进单一 `story-core.ts`。

### 3.1 仓库接线（必须）

新建包后至少完成：

```txt
1. pnpm-workspace 已包含 packages/*
2. packages/story-core/package.json：name=@ying-companion/story-core；依赖 @ying-companion/ai-core
3. build / typecheck / lint 可被 turbo filter
4. package script：verify:story-contract
5. 更新 AGENTS.md Project Snapshot（story-core Stage 01）
6. 更新 .requirements/README.md 的 stages 列表（若仍缺 v1.3）
```

---

## 4. Story Domain 核心模型

## 4.1 StoryDefinition

`StoryDefinition` 是创作者定义的不可变故事事实。

建议最小结构：

```ts
export interface StoryDefinition {
  id: string;
  version: string;
  title: string;
  description: string;

  premise: string;
  genre: string[];
  tone: string[];
  writingStyle?: string;

  playerRole: PlayerRoleDefinition;
  characters: StoryCharacterDefinition[];
  scenes: SceneDefinition[];
  lore: LoreEntry[];

  /** 世界可拾取/可持有物目录；add/remove_inventory_item 必须命中此处 id */
  items: StoryItemDefinition[];
  /** 可发现线索目录；add_clue 必须命中此处 id */
  clues: StoryClueDefinition[];
  /** 可触发事件目录；add_event 必须命中此处 id */
  events: StoryEventDefinition[];

  openingSceneId: string;
  openingText: string;

  attributes: StoryAttributeDefinition[];
  relationshipsEnabled?: boolean;
  relationshipBounds?: {
    min: number;
    max: number;
  };

  narrativeRules: NarrativeRules;
}
```

约束：

```txt
- id 在种子范围内唯一
- version 非空
- openingSceneId 必须引用合法 scene
- character / scene / lore / item / clue / event id 分别唯一
- attributes[].key 在同一 scope 语义下不可冲突
- Definition 是静态事实，不承载回合运行状态
- 未在目录中声明的 itemId / clueId / eventId，对应 add_* 一律拒绝
```

---

## 4.2 PlayerRoleDefinition

```ts
export interface PlayerRoleDefinition {
  name?: string;
  identity: string;
  background?: string;
  knownFacts: string[];
}
```

V1.3 只支持固定玩家身份。

明确不做：

```txt
- 玩家自定义职业
- 玩家自定义背景
- 玩家开档填写属性
- 玩家角色卡编辑器
```

---

## 4.3 StoryCharacterDefinition

```ts
export interface StoryCharacterDefinition {
  id: string;
  name: string;
  description: string;
  personality: string[];
  speakingStyle: string;

  publicBackground: string;
  privateBackground?: string;
  secrets?: StorySecret[];

  goals: string[];
  fears?: string[];
  knowledgeScope?: string[];
  forbiddenKnowledge?: string[];

  narrativeRole: "protagonist" | "companion" | "antagonist" | "supporting" | "narrator";
}
```

角色定义必须能回答：

```txt
- 她是谁
- 她怎样说话
- 她想得到什么
- 她隐藏了什么
- 她当前允许知道什么
- 她不能提前知道什么
```

#### StorySecret（最小形状）

```ts
export interface StorySecret {
  id: string;
  summary: string;
  /** 对应 lore id 或纯文本秘密；Stage 01 不做复杂揭示图 */
  loreId?: string;
}
```

---

## 4.4 SceneDefinition

```ts
export interface SceneDefinition {
  id: string;
  title: string;
  description: string;
  location?: string;

  availableCharacterIds: string[];
  entryConditions?: StoryCondition[];
  exitConditions?: StoryCondition[];

  objectiveIds?: string[];
  eventIds?: string[];
}
```

Stage 01 只要求支持最小、确定性的场景引用与切换条件。

#### StoryCondition（Stage 01 封闭联合）

不做通用表达式引擎。Stage 01 只允许以下条件；未列出的形式在 Definition 校验阶段直接失败。

```ts
export type StoryCondition =
  | { type: "always" }
  | { type: "has_clue"; clueId: string }
  | { type: "has_event"; eventId: string }
  | { type: "has_item"; itemId: string }
  | { type: "in_scene"; sceneId: string }
  | {
      type: "attr_gte";
      key: string;
      scopeRef?: string;
      value: number;
    }
  | {
      type: "attr_eq";
      key: string;
      scopeRef?: string;
      value: boolean | number | string;
    };
```

求值规则：

```txt
- has_* / in_scene：对照当前 StoryState + Definition 目录
- attr_*：用 createStoryAttributeStorageKey 生成键后读 StoryState.attrs
- set_scene 时：目标场景的 entryConditions 必须全部为真（空数组 = 通过）
- 当前场景若声明 exitConditions：离开前必须全部为真（空 = 通过）
- Stage 01 不做 OR / NOT 组合；需要组合时拆成多个条件（隐式 AND）
```

---

## 4.5 Item / Clue / Event 目录

```ts
export interface StoryItemDefinition {
  id: string;
  name: string;
  description?: string;
}

export interface StoryClueDefinition {
  id: string;
  title: string;
  description?: string;
}

export interface StoryEventDefinition {
  id: string;
  title: string;
  description?: string;
  /** 默认 false：同一 eventId 不可重复 add_event */
  allowRepeat?: boolean;
}
```

规则：

```txt
- inventory / clues / events 运行态只存 id 字符串
- add_inventory_item / add_clue / add_event 的 id 必须 ∈ 对应目录
- remove_inventory_item 的 id 必须当前持有；不要求仍在目录外的幽灵 id
- clue 默认不可移除（Stage 01 无 remove_clue）
- event 默认不可重复；allowRepeat=true 时才允许再次 add_event
- 重复 add 已持有 item：整批拒绝（或视为 no-op 二选一；Stage 01 固定为整批拒绝）
- 重复 add 已有 clue：整批拒绝
```

---

## 4.6 LoreEntry

```ts
export interface LoreEntry {
  id: string;
  title: string;
  content: string;

  keywords?: string[];
  sceneIds?: string[];
  characterIds?: string[];

  activation: "always" | "keyword";
  secret?: boolean;
  priority?: number;
  tokenBudget?: number;
}
```

Stage 01 的 `KeywordLoreProvider` 只必须支持：

```txt
always
keyword
scene 绑定过滤
character 绑定过滤
priority
secret 默认不注入
```

完整 state condition 与 reveal 规则放到 Stage 02。

---

## 4.7 NarrativeRules

```ts
export interface NarrativeRules {
  /** 给 Planner / Renderer 的硬约束摘要 */
  mustFollow: string[];
  /** 禁止出现的内容或元叙事 */
  mustAvoid: string[];
  /** 默认视角，如 second_person / limited_third */
  pov?: string;
  /** 单回合叙事长度提示，非硬限制 */
  responseLengthHint?: "short" | "medium" | "long";
}
```

---

## 4.8 StorySession（内存开档；Stage 01 最小）

开档时冻结 Definition，之后回合只读 snapshot，不热更新种子。

```ts
export interface StorySession {
  id: string;
  storyId: string;
  /** 开档时深拷贝或等价不可变快照 */
  definitionSnapshot: StoryDefinition;
  /** 与 snapshot.version 一致，便于 State.definitionVersion 对齐 */
  definitionVersion: string;
  createdAt: string;
  updatedAt: string;
}
```

```ts
export interface StorySessionProvider {
  createSession(input: { storyId: string }): Promise<StorySession>;
  getSession(sessionId: string): Promise<StorySession | null>;
}
```

Stage 01 提供 `InMemoryStorySessionProvider`：

```txt
createSession
→ StoryProvider.getDefinition(storyId)
→ 深拷贝为 definitionSnapshot
→ 用 initializeStoryState(snapshot) 写入 InMemoryStoryStateProvider
→ 返回 session

后续 execute 只使用 session.definitionSnapshot，禁止再 getDefinition 覆盖运行中故事
```

明确不做（本阶段）：

```txt
- 进程重启后恢复 session
- Definition 热更新合并进旧 session
- 玩家开档填写属性
```

---

## 5. 动态 Attribute Schema

## 5.1 设计原则

所有故事共用的引擎状态固定；不同故事的业务属性由 Definition 自行声明。

```txt
Core Story State
  当前场景、角色存活/在场、物品、线索、事件、可选关系

Attribute Schema
  每个故事声明自己的动态属性

Attribute Values
  落在 StoryState.attrs，只允许出现已声明属性
```

禁止在引擎中写死：

```txt
combatPower
sanity
affection
magicPower
hunger
money
```

故事需要哪个属性，就在自己的 `attributes` 中声明；不声明就不存在。

---

## 5.2 StoryAttributeDefinition

```ts
export type StoryAttrScope = "story" | "player" | "character" | "scene";

export type StoryAttrValue = boolean | number | string;

export interface StoryAttributeDefinition {
  key: string;
  label: string;
  type: "boolean" | "number" | "string" | "enum";
  scope: StoryAttrScope;

  characterIds?: string[];

  required?: boolean;
  default?: StoryAttrValue;

  min?: number;
  max?: number;
  enumValues?: string[];
  maxLength?: number;

  showInSidebar?: boolean;
  writable?: boolean;
  description?: string;
}
```

---

## 5.3 必填属性初始化规则

V1.3 采用最简单且确定性的初始化语义：

```txt
required=true
→ 必须声明 default
→ default 必须通过完整 Schema 校验
```

禁止：

```ts
{
  key: "combatPower",
  type: "number",
  required: true
  // 没有 default
}
```

必须：

```ts
{
  key: "combatPower",
  label: "战斗力",
  type: "number",
  scope: "player",
  required: true,
  default: 10,
  min: 0,
  max: 100,
}
```

V1.3 暂不引入：

```txt
creator_input
player_input
computed
random
inherit
```

这些初始化来源以后如有真实需求，再扩展独立的 initialization 类型。

---

## 5.4 字符串属性约束

当 `type="string"` 时：

```txt
- 必须声明 maxLength
- maxLength 必须是正整数
- default 长度不得超过 maxLength
- set_attr 的新值不得超过 maxLength
```

例如：

```ts
{
  key: "publicTitle",
  label: "公开称号",
  type: "string",
  scope: "player",
  required: true,
  default: "外乡侦探",
  maxLength: 40,
}
```

禁止用 string attr 保存：

```txt
剧情正文
历史摘要
角色完整记忆
Lore 原文
Prompt 片段
任意 JSON 字符串
```

这些内容应由各自领域结构承载，不能把 `attrs` 变成万能垃圾桶。

---

## 5.5 Attribute 存储键

必须由统一函数生成，禁止模型直接拼路径。

建议：

```txt
story scope      → clueHeat
player scope     → player:combatPower
character scope  → character:evelyn:trust
scene scope      → scene:white-whale:suspicion
```

提供：

```ts
export function createStoryAttributeStorageKey(input: {
  definition: StoryAttributeDefinition;
  scopeRef?: string;
}): string;
```

校验器和初始化器必须使用同一函数，避免写入与读取规则漂移。

---

## 6. StoryState

```ts
export interface StoryState {
  schemaVersion: 1;
  storyId: string;
  definitionVersion: string;

  currentSceneId: string;

  characters: Record<
    string,
    {
      alive: boolean;
      present: boolean;
    }
  >;

  inventory: string[];
  clues: string[];
  events: string[];

  relationships?: Record<string, number>;
  attrs: Record<string, StoryAttrValue>;

  updatedAt: string;
}
```

`StoryState` 是确定性世界状态，不是语言模型记忆。

明确禁止：

```txt
- 存进 Companion MemoryProvider
- 依赖向量召回恢复
- 从聊天历史重新推导当前状态
- 由 Renderer 直接修改
```

---

## 7. StoryStateChange

建议使用封闭联合类型：

```ts
export type StoryStateChange =
  | { type: "set_scene"; sceneId: string }
  | {
      type: "set_character_alive";
      characterId: string;
      alive: boolean;
    }
  | {
      type: "set_character_present";
      characterId: string;
      present: boolean;
    }
  | { type: "add_inventory_item"; itemId: string }
  | { type: "remove_inventory_item"; itemId: string }
  | { type: "add_clue"; clueId: string }
  | { type: "add_event"; eventId: string }
  | {
      type: "set_relationship";
      characterId: string;
      value: number;
    }
  | {
      type: "set_attr";
      key: string;
      scopeRef?: string;
      value: StoryAttrValue;
    };
```

V1.3 暂不增加：

```txt
increment_attr
decrement_attr
append_string_attr
remove_event
remove_clue
任意 JSON Patch
任意 path 写入
```

先用 `set_attr` 保持 Validator 简单、可证明。

---

## 8. StateTransitionValidator

## 8.1 接口

```ts
export interface StateTransitionValidator {
  validate(input: {
    definition: StoryDefinition;
    currentState: StoryState;
    changes: StoryStateChange[];
  }): Promise<StateTransitionValidationResult>;
}
```

```ts
export type StateTransitionValidationResult =
  | {
      valid: true;
      changes: StoryStateChange[];
    }
  | {
      valid: false;
      errors: StoryStateValidationError[];
    };
```

---

## 8.2 必须校验

```txt
- StoryState 与 Definition 的 storyId / definitionVersion 是否匹配
- 核心 op 是否在允许列表内
- scene / character 引用是否存在于 Definition
- item / clue / event 引用是否存在于对应目录
- 场景切换：exitConditions（当前）与 entryConditions（目标）是否满足
- 重复 item / clue / event 按 §4.5 语义拒绝
- relationshipsEnabled 是否开启（未开启则拒绝 set_relationship）
- relationship 是否落在 bounds
- set_attr.key 是否已声明
- set_attr.writable 是否不是 false
- scope 与 scopeRef 是否匹配
- characterIds 限制是否满足
- boolean / number / string / enum 类型是否正确
- number 是否落在 min / max
- enum 是否属于 enumValues
- string 是否声明 maxLength
- string 是否超过 maxLength
- required default 是否存在且合法（Definition 初始化阶段）
- 死亡角色不得无规则 present=true
- 同批冲突（见 §8.4）
```

---

## 8.3 原子性

默认采用整批校验：

```txt
全部合法
→ apply 全部 changes

任一非法
→ 全部拒绝
→ currentState 不发生任何改变
```

禁止部分应用：

```txt
change 1 成功
change 2 失败
change 3 未执行
```

`applyStoryStateChanges()` 只能接收 Validator 已确认合法的 changes。

---

## 8.4 同批冲突

同一 `changes[]` 内，下列情况视为冲突 → **整批拒绝**（不做 last-write-wins）：

```txt
- 两次及以上 set_scene
- 同一 characterId 上两次及以上 set_character_alive / set_character_present（同类 op）
- 同一 itemId 两次 add 或 add+remove 次序冲突（同一 batch 内对同一 item 多次变更）
- 同一 clueId / eventId 两次 add_*
- 同一 relationship characterId 两次 set_relationship
- 同一 Attribute storage key 两次及以上 set_attr
```

storage key 必须用 `createStoryAttributeStorageKey` 计算后再比，禁止只比裸 `key` 字符串。

---

## 9. Story Planner

## 9.1 职责

Planner 只负责结构化规划：

```txt
- 识别玩家行为
- 判断参与角色
- 选择本回合叙事节拍
- 生成状态变更候选
- 指定本回合可揭示 Lore
- 指定 Renderer 必须包含与不得泄露的内容
```

Planner 禁止：

```txt
- 直接输出面向玩家的完整长篇故事
- 直接写入 StoryState
- 绕过 Validator
- 发明未声明属性
- 把隐藏 Lore 默认暴露给 Renderer
```

---

## 9.2 辅助类型（最小形状）

```ts
export interface StoryAction {
  raw: string;
  summary: string;
  kind: "dialogue" | "investigate" | "travel" | "use_item" | "other" | "rejected";
}

export interface StoryActionRejection {
  reason: string;
  /** 给 Renderer 的戏内拒绝指引 */
  inWorldGuidance: string;
}

export interface NarrativeBeat {
  summary: string;
  /** 本回合张力：低/中/高等，供 Renderer 调语气 */
  tension?: "low" | "medium" | "high";
}
```

当 `rejection` 存在时：`stateChanges` 必须为空数组；`interpretedAction.kind` 应为 `"rejected"`。

---

## 9.3 StoryTurnPlan

```ts
export interface StoryTurnPlan {
  interpretedAction: StoryAction;
  activeCharacterIds: string[];
  narrativeBeat: NarrativeBeat;

  stateChanges: StoryStateChange[];
  triggeredEventIds: string[];
  revealedLoreIds: string[];

  rejection?: StoryActionRejection;

  responseGuidance: {
    narratorFocus: string;
    emotionalTone: string;
    mustInclude: string[];
    mustNotReveal: string[];
  };
}
```

`FakeStoryPlanner`：由契约脚本驱动，产出预置合法/非法 plan，用于离线门禁。

`ModelStoryPlanner`（可选）应沿用现有 Tool Planning 的经验：

```txt
ChatModel.generate
+ 明确结构化输出约定
+ Zod 校验
+ 解析失败返回明确错误
```

不允许静默 fallback 成任意自然语言 JSON 猜测。

---

## 10. Story Renderer

Renderer 输入：

```txt
Story Definition 的必要子集（使用 session.definitionSnapshot）
当前场景
当前 Story State
本回合召回 Lore
已通过 Validator 的 StoryTurnPlan
玩家原始输入
最近少量消息（Stage 01 可极简）
```

Renderer 输出：

```ts
export interface StoryRenderResult {
  text: string;
}
```

Renderer 必须遵守：

```txt
- 不发明 State Change
- 不发明物品、线索、事件、死亡、场景切换
- 不泄露 mustNotReveal
- 不把 Planner rejection 改写成成功行为
- 不修改 nextState
```

Stage 01 只做非流式 `render()`；流式放到 Stage 02。

`FakeStoryRenderer`：返回可断言的固定文本，供契约脚本验证「Render 抛错 → 不保存」。

---

## 11. Provider 接口

## 11.1 StoryProvider

```ts
export interface StoryProvider {
  getDefinition(storyId: string): Promise<StoryDefinition | null>;
}
```

Stage 01 提供：

```txt
InMemoryStoryProvider
```

仅用于开档拉取权威种子；运行中回合以 session.definitionSnapshot 为准。

---

## 11.2 StoryStateProvider

```ts
export interface StoryStateProvider {
  getState(sessionId: string): Promise<StoryState | null>;
  saveState(sessionId: string, state: StoryState): Promise<void>;
}
```

Stage 01 提供：

```txt
InMemoryStoryStateProvider
```

该实现只服务本地验证，不承诺进程重启恢复。

---

## 11.3 StorySessionProvider

见 §4.8。Stage 01 提供 `InMemoryStorySessionProvider`。

---

## 11.4 LoreProvider

```ts
export interface LoreRecallInput {
  userInput: string;
  sceneId: string;
  activeCharacterIds: string[];
  definition: StoryDefinition;
  state: StoryState;
}

export interface LoreRecallResult {
  entries: LoreEntry[];
}
```

```ts
export interface LoreProvider {
  recall(input: LoreRecallInput): Promise<LoreRecallResult>;
}
```

Stage 01 提供：

```txt
KeywordLoreProvider
```

召回输入至少包含：

```txt
用户输入
当前 sceneId
activeCharacterIds
Story Definition（snapshot）
Story State
```

---

## 12. DefaultStoryWorkflow

## 12.1 接口

```ts
export interface StoryWorkflowInput {
  sessionId: string;
  userInput: string;
}

export interface StoryWorkflow {
  execute(input: StoryWorkflowInput): Promise<StoryWorkflowResult>;
}
```

Stage 01 暂不要求 `stream()`。

---

## 12.2 最小执行链

```txt
用户输入
↓
Safety.guardInput（若注入）
↓
StorySessionProvider.getSession → definitionSnapshot
↓
StoryStateProvider.getState
↓
LoreProvider.recall（definition = snapshot）
↓
StoryPlanner.plan
↓
StateTransitionValidator.validate（definition = snapshot）
↓
applyStoryStateChanges（仅内存 nextState）
↓
StoryRenderer.render
↓
Safety.guardOutput（若注入）
↓
StoryStateProvider.saveState（仅全部成功）
↓
返回 text + nextState + debug metadata
```

禁止在回合中途调用 `StoryProvider.getDefinition` 覆盖 snapshot。

---

## 12.3 提交语义

即使 Stage 01 使用内存 Provider，也必须遵守正式语义：

```txt
Planner 失败
→ 不保存状态

Validator 失败
→ 不保存状态

Renderer 失败
→ 不保存 nextState

Output Safety 失败
→ 不保存 nextState

全部成功
→ 才保存 nextState
```

这条约束不能等到 Stage 02 接数据库时才补。

---

## 12.4 返回值

```ts
export interface StoryWorkflowResult {
  text: string;
  state: StoryState;
  plan: StoryTurnPlan;
  recalledLoreIds: string[];
  appliedChanges: StoryStateChange[];
}
```

用于 Stage 01 验证与 Stage 03 Debug 的未来映射。

---

## 13. 种子故事：雾港疑云

必须提供一个可连续游玩的种子故事。

建议内容：

```txt
故事名：雾港疑云
类型：哥特 / 悬疑 / 慢热
玩家身份：寻找失踪姐姐的外乡侦探

场景：
- 白鲸酒馆
- 旧港口

角色：
- 伊芙琳：酒馆老板娘，知道姐姐曾来过
- 莱昂：警探，对外乡人抱有戒心
- 塞缪尔：医生，掌握旧港口秘密

物品目录（items）：
- 蓝色月光酒单（可拾取）
- 旧港口通行证（可拾取）

线索目录（clues）：
- 蓝色月光酒单上的记号
- 蓝色蜡迹
- 姐姐曾到过白鲸酒馆

事件目录（events）：
- 首次与伊芙琳谈及姐姐
- 进入旧港口

秘密：
- 姐姐曾通过地下通道进入旧港口
- 伊芙琳不能在初始回合直接说出该事实
```

**关系槽约定（二选一，雾港固定如下）：**

```txt
relationshipsEnabled = false
不使用核心 relationships 槽
角色信任只用 Attribute Schema：character scope 的 trust（伊芙琳）
禁止对本种子发出 set_relationship
```

Attribute Schema 至少包含：

```ts
[
  {
    key: "clueHeat",
    label: "调查热度",
    type: "number",
    scope: "story",
    required: true,
    default: 0,
    min: 0,
    max: 100,
    showInSidebar: true,
  },
  {
    key: "trust",
    label: "信任度",
    type: "number",
    scope: "character",
    characterIds: ["evelyn"],
    required: true,
    default: 0,
    min: -10,
    max: 10,
    showInSidebar: true,
  },
  {
    key: "publicTitle",
    label: "公开称号",
    type: "string",
    scope: "player",
    required: true,
    default: "外乡侦探",
    maxLength: 40,
    writable: false,
    showInSidebar: true,
  },
];
```

必须故意不声明：

```txt
combatPower
sanity
magicPower
```

针对这些 key 的 `set_attr` 必须失败。

---

## 14. 第二套 Schema：最小武侠契约样例

为了证明表单与状态字段不是围绕「雾港疑云」写死，必须新增第二套最小 Definition。

不要求完整可玩故事，但必须能通过初始化与 Validator 契约。

建议：

```ts
[
  {
    key: "combatPower",
    label: "战斗力",
    type: "number",
    scope: "player",
    required: true,
    default: 10,
    min: 0,
    max: 100,
    showInSidebar: true,
  },
  {
    key: "sectStanding",
    label: "门派地位",
    type: "enum",
    scope: "player",
    required: true,
    default: "外门弟子",
    enumValues: ["外门弟子", "内门弟子", "长老"],
    showInSidebar: true,
  },
];
```

必须证明：

```txt
- 武侠 Definition 可以初始化 combatPower
- 雾港 Definition 不能写 combatPower
- 武侠 Definition 不能写 clueHeat，除非自行声明
- 同一套 Validator 与 Workflow 不需要修改代码
```

---

## 15. 验证脚本

## 15.1 确定性契约脚本（完成门禁）

新增：

```txt
packages/story-core/scripts/verify-story-contract.ts
```

必须完全离线，不依赖：

```txt
真实模型
网络
数据库
环境变量
```

必须使用 Fake Planner / Fake Renderer 验证 Runtime。

至少覆盖：

```txt
1. required=true 但缺 default → Definition 校验失败
2. number default 越界 → Definition 校验失败
3. enum default 不在 enumValues → Definition 校验失败
4. string 缺 maxLength → Definition 校验失败
5. string default 超过 maxLength → Definition 校验失败
6. set_attr 写未声明 key → 整批拒绝
7. set_attr 类型错误 → 整批拒绝
8. set_attr 超过 number bounds → 整批拒绝
9. set_attr string 超长 → 整批拒绝
10. writable=false → 拒绝
11. character scope 缺 scopeRef → 拒绝
12. character scopeRef 不存在 → 拒绝
13. characterIds 不允许该角色 → 拒绝
14. scene 切换引用不存在 → 拒绝
15. 未声明 itemId / clueId / eventId 的 add_* → 拒绝
16. 同批两次 set_attr 同一 storage key → 整批拒绝
17. relationships 未启用却 set_relationship → 拒绝
18. 一批 changes 中任一非法 → 全部不应用
19. Renderer 抛错 → nextState 不保存
20. Safety 输出拒绝 → nextState 不保存
21. 雾港 Schema 初始化成功；relationshipsEnabled=false
22. 武侠 Schema 初始化成功
23. 两套 Schema 使用同一 Runtime 与 Validator
24. 雾港拒绝 combatPower
25. 武侠拒绝 clueHeat
26. createSession 后回合只读 definitionSnapshot
```

建议 package script：

```json
{
  "scripts": {
    "verify:story-contract": "tsx scripts/verify-story-contract.ts"
  }
}
```

**本阶段 done = 本脚本离线通过 + §19 其余构建/边界条件。**

---

## 15.2 真实模型冒烟脚本（可选，非门禁）

可新增：

```txt
packages/story-core/scripts/verify-story-model-smoke.ts
```

它可以依赖宿主注入 `ChatModel`，但不得在 `story-core` 内读取 `process.env`。

验证目标：

```txt
- Planner 能产出合法 StoryTurnPlan
- Renderer 能生成文本
- 连续 3～5 回合无非法状态污染
- 模型尝试写入未声明属性时会被 Validator 拒绝
```

真实模型脚本**不替代**确定性契约脚本；失败或不实现不挡 Stage 01 done。

---

## 16. README 要求

新增：

```txt
packages/story-core/README.md
```

必须说明：

```txt
- story-core 的职责
- 与 ai-core 的依赖方向
- StoryDefinition（含 item/clue/event 目录）/ StoryState / Attribute Schema 的区别
- 开档 definitionSnapshot 冻结语义
- Planner / Validator / Renderer 的边界
- Stage 01 完成门禁是 Fake 契约脚本，不是真实模型
- Story State 不等于 Companion Memory
- 如何运行 verify:story-contract
- 如何运行可选真实模型 smoke
- Stage 01 已完成能力与未完成能力
```

---

## 17. 推荐实施顺序

```txt
1. 创建 package 骨架、workspace / turbo 接线与导出边界
2. 定义 StoryDefinition（含 items/clues/events）/ StoryState / StoryStateChange
3. 定义 StoryCondition / NarrativeRules / StorySession 最小形状
4. 实现 Attribute Schema 校验与初始化
5. 实现属性存储键生成器
6. 实现 StateTransitionValidator（含目录引用与同批冲突）
7. 实现 applyStoryStateChanges
8. 实现 InMemory Story / Session / State Providers
9. 实现 KeywordLoreProvider
10. 实现 Fake Planner / Fake Renderer
11. 实现 DefaultStoryWorkflow.execute（只读 definitionSnapshot）
12. 加入雾港疑云种子（含目录；relationshipsEnabled=false）
13. 加入最小武侠 Schema
14. 完成 verify:story-contract（门禁）
15. （可选）实现 ModelStoryPlanner / ModelStoryRenderer + smoke
16. 补 README 与 AGENTS / .requirements 索引
```

不要一开始先写完整 Prompt；先把 Definition、State、Validator 与契约测试跑通。

---

## 18. 提交建议

建议小步提交：

```txt
feat(story-core): add story domain contracts
feat(story-core): add attribute schema validation
feat(story-core): add deterministic state transition validator
feat(story-core): add in-memory providers and lore recall
feat(story-core): add planner renderer and workflow
feat(story-core): add fog harbor seed
test(story-core): add dynamic schema contract verification
docs(story-core): add stage 01 documentation
```

禁止把 Stage 02 的 PostgreSQL 与 Stage 03 的 UI 混进本阶段提交。

---

## 19. 完成标准

本阶段只有在以下条件全部满足时才算完成：

```txt
- packages/story-core 可独立 build / typecheck
- monorepo 接线完成（workspace / turbo / 根文档索引）
- ai-core 不依赖 story-core
- SimpleChatWorkflow 未加入 Story 分支
- 雾港疑云可以通过内存 Runtime 连续执行多回合
- 开档冻结 definitionSnapshot；回合不热更新 Definition
- Planner 与 Renderer 职责分离（门禁路径为 Fake）
- State 只能由通过 Validator 的 Change 修改
- item / clue / event 必须命中 Definition 目录
- 非法 changes 与同批冲突整批拒绝
- Renderer / Safety 失败时状态不提交
- 雾港 relationshipsEnabled=false，信任只用 trust attr
- required 属性初始化规则有自动化验证
- string maxLength 有自动化验证
- 未声明属性写入有自动化验证
- 雾港与武侠两套 Schema 使用同一 Runtime
- verify:story-contract 完全离线通过（唯一完成门禁脚本）
- README 说明当前边界与使用方式
```

最终验收语句：

> 不依赖数据库和正式 UI，通过脚本即可连续游玩若干回合；场景、秘密、物品、关系值、事件与动态属性不会随意失控；未在 Story Attribute Schema 与 item/clue/event 目录中声明的字段/id 无法进入世界状态；同一套 Runtime 能运行字段完全不同的故事。

---

## 20. Stage 02 交接条件

Stage 01 输出给 Stage 02 的稳定边界：

```txt
StoryDefinition（含 items / clues / events）
StoryCondition（Stage 01 封闭联合；Stage 02 可扩展但需兼容）
StorySession / definitionSnapshot
StoryState
StoryStateChange
StoryTurnPlan
StoryProvider
StorySessionProvider
StoryStateProvider
LoreProvider
StoryPlanner
StoryRenderer
StateTransitionValidator
StoryWorkflow.execute
DefaultStoryWorkflow
```

Stage 02 在此基础上继续增加：

```txt
- 完整 state-condition Lore
- Story Core Event
- StoryWorkflow.stream
- 幂等 clientTurnId
- PostgreSQL 事务持久化
- Story Session 恢复
- Narrative Summary
- 可观测失败与调试数据
```

Stage 02 不应重新定义 Stage 01 已稳定的领域类型；如确有变化，必须先更新本文件与对应契约测试。
