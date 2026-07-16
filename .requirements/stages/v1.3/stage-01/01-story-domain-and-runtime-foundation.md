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
4. 建立确定性的 Definition Validator 与 StateTransitionValidator
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
- StorySession 跨进程持久化与进程重启后的恢复
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
- 可重复事件计数与事件时间线
- Objective 目标系统
```

说明：Stage 01 **会实现同一进程内的 StorySession 创建与连续读取**；这里只是不做持久化和进程重启恢复。

---

## 3. 目标包结构

```txt
packages/story-core/
├── src/
│   ├── abstractions/
│   │   ├── story-definition.ts
│   │   ├── story-catalog.ts
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
│   ├── definition/
│   │   └── validate-story-definition.ts
│   ├── providers/
│   │   ├── in-memory-story-provider.ts
│   │   ├── in-memory-story-state-provider.ts
│   │   ├── in-memory-story-session-provider.ts
│   │   └── keyword-lore-provider.ts
│   ├── planner/
│   │   ├── fake-story-planner.ts
│   │   ├── model-story-planner.ts
│   │   └── story-turn-plan-schema.ts
│   ├── renderer/
│   │   ├── fake-story-renderer.ts
│   │   └── model-story-renderer.ts
│   ├── state/
│   │   ├── default-story-transition-validator.ts
│   │   ├── apply-story-state-changes.ts
│   │   ├── initialize-story-state.ts
│   │   ├── evaluate-story-condition.ts
│   │   └── story-attribute-key.ts
│   ├── workflow/
│   │   └── default-story-workflow.ts
│   ├── seeds/
│   │   ├── fog-harbor-mystery.ts
│   │   └── minimal-wuxia-contract.ts
│   └── index.ts
├── scripts/
│   ├── verify-story-contract.ts
│   └── verify-story-model-smoke.ts
├── README.md
├── package.json
└── tsconfig.json
```

职责必须保持清晰，禁止把全部实现堆进单一 `story-core.ts`。

### 3.1 仓库接线

```txt
1. pnpm-workspace 已包含 packages/*
2. package 名为 @ying-companion/story-core
3. 依赖 @ying-companion/ai-core 的公开通用接口
4. build / typecheck / lint 可被 turbo filter
5. package script 提供 verify:story-contract
6. 更新 AGENTS.md Project Snapshot
7. 更新 .requirements/README.md 的 v1.3 stages 索引（若缺失）
```

---

## 4. Story Domain 核心模型

## 4.1 StoryDefinition

`StoryDefinition` 是创作者定义的不可变故事事实。

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

  items: StoryItemDefinition[];
  clues: StoryClueDefinition[];
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

Definition Validator 必须检查：

```txt
- id / version 非空
- openingSceneId 引用合法 scene
- character / scene / lore / item / clue / event id 分别唯一
- scene.availableCharacterIds 引用合法 character
- scene.eventIds 引用合法 event
- condition 引用的 item / clue / event / scene / attr 合法
- attributes[].key 在同一 scope 语义下不可冲突
- required 属性存在合法 default
- Definition 不承载回合运行状态
```

Stage 01 不定义 Objective 目录，因此 `SceneDefinition` 不包含 `objectiveIds`。目标、完成条件和目标进度以后作为完整领域能力引入，不能保留没有校验来源的悬空引用。

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

V1.3 只支持固定玩家身份，不做玩家自定义职业、背景、开档属性或角色卡编辑器。

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

export interface StorySecret {
  id: string;
  summary: string;
  loreId?: string;
}
```

角色定义必须能回答：她是谁、怎样说话、想得到什么、隐藏了什么、允许知道什么、不能提前知道什么。

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

  eventIds?: string[];
}
```

`availableCharacterIds` 表示该角色在此场景中**允许处于 present=true**，不是进入场景时自动出现的角色列表。

---

## 4.5 StoryCondition

Stage 01 不做通用表达式引擎，只允许封闭联合：

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

规则：

```txt
- 多个条件隐式 AND
- 不支持 OR / NOT
- has_* / in_scene 对照 StoryState 与 Definition
- attr_* 使用统一 Attribute storage key 读取
- set_scene 时，当前场景 exitConditions 和目标场景 entryConditions 必须全部成立
```

---

## 4.6 Item / Clue / Event 目录

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
}
```

Stage 01 统一采用**一次性事件**：

```txt
- inventory / clues / events 运行态只存 id
- add_inventory_item / add_clue / add_event 必须命中目录
- remove_inventory_item 必须当前持有
- clue 不可移除
- eventId 在同一 Session 中只能 add 一次
- 重复添加 item / clue / event → 整批拒绝
```

本阶段删除 `allowRepeat`。因为 `events: string[]` 无法可靠表示重复次数和触发时间；真正需要可重复事件时，应同步引入事件实例或计数结构，而不是只在 Definition 上增加布尔开关。

---

## 4.7 LoreEntry

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

Stage 01 的 `KeywordLoreProvider` 支持：always、keyword、scene / character 绑定、priority，以及 secret 默认不注入。完整状态条件和揭示规则放到 Stage 02。

---

## 4.8 NarrativeRules

```ts
export interface NarrativeRules {
  mustFollow: string[];
  mustAvoid: string[];
  pov?: string;
  responseLengthHint?: "short" | "medium" | "long";
}
```

---

## 4.9 StorySession

开档时冻结 Definition，后续回合只读 snapshot。

```ts
export interface StorySession {
  id: string;
  storyId: string;
  definitionSnapshot: StoryDefinition;
  definitionVersion: string;
  createdAt: string;
  updatedAt: string;
}

export interface StorySessionProvider {
  createSession(input: { storyId: string }): Promise<StorySession>;
  getSession(sessionId: string): Promise<StorySession | null>;
}
```

`InMemoryStorySessionProvider.createSession()`：

```txt
StoryProvider.getDefinition(storyId)
→ validate Definition
→ 深拷贝 definitionSnapshot
→ initializeStoryState(snapshot)
→ 写入 InMemoryStoryStateProvider
→ 返回 StorySession
```

后续 `execute()` 禁止重新读取最新 Definition 覆盖 snapshot。

---

## 5. 动态 Attribute Schema

所有故事共用固定 Core State；不同故事的业务属性由 Definition 自行声明。

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

### 5.1 初始化规则

```txt
required=true
→ 必须声明 default
→ default 必须通过完整 Schema 校验
```

V1.3 不引入 `creator_input`、`player_input`、`computed`、`random` 或 `inherit`。

### 5.2 字符串约束

`type="string"` 时：

```txt
- 必须声明正整数 maxLength
- default 与 set_attr 新值不得超过 maxLength
- 不允许用 string attr 保存剧情正文、摘要、完整记忆、Lore、Prompt 或任意 JSON
```

### 5.3 Attribute 存储键

统一由函数生成：

```txt
story scope      → clueHeat
player scope     → player:combatPower
character scope  → character:evelyn:trust
scene scope      → scene:white-whale:suspicion
```

```ts
export function createStoryAttributeStorageKey(input: {
  definition: StoryAttributeDefinition;
  scopeRef?: string;
}): string;
```

初始化器、条件求值器、Validator 和 Apply 必须复用同一函数。

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

`StoryState` 是确定性世界状态，禁止存入 Companion Memory、依赖向量召回恢复、从聊天历史重新推导，或由 Renderer 直接修改。

### 6.1 场景与角色在场一致性

必须满足：

```txt
对任意 characters[characterId].present === true：
characterId 必须属于 currentScene.availableCharacterIds
```

状态变更规则：

```txt
set_character_present(true)
→ 角色必须 alive=true
→ 角色必须属于当前场景 availableCharacterIds

set_scene
→ 不自动重写任何角色 present 状态
→ 在应用同一 batch 的全部 changes 后，所有 present=true 的角色必须属于目标场景 availableCharacterIds
→ 不满足则整批拒绝
```

因此需要角色随玩家转场时，Planner 必须在同一批中明确输出角色离场/入场变化，不能依赖隐藏副作用。

---

## 7. StoryStateChange

```ts
export type StoryStateChange =
  | { type: "set_scene"; sceneId: string }
  | { type: "set_character_alive"; characterId: string; alive: boolean }
  | { type: "set_character_present"; characterId: string; present: boolean }
  | { type: "add_inventory_item"; itemId: string }
  | { type: "remove_inventory_item"; itemId: string }
  | { type: "add_clue"; clueId: string }
  | { type: "add_event"; eventId: string }
  | { type: "set_relationship"; characterId: string; value: number }
  | {
      type: "set_attr";
      key: string;
      scopeRef?: string;
      value: StoryAttrValue;
    };
```

暂不增加 increment/decrement、remove_event、remove_clue、任意 JSON Patch 或任意 path 写入。

---

## 8. StateTransitionValidator

```ts
export interface StateTransitionValidator {
  validate(input: {
    definition: StoryDefinition;
    currentState: StoryState;
    changes: StoryStateChange[];
  }): Promise<StateTransitionValidationResult>;
}
```

必须校验：

```txt
- StoryState 与 Definition 的 storyId / definitionVersion 一致
- 核心 op 合法
- scene / character / item / clue / event 引用合法
- set_scene 满足 exit / entry conditions
- 应用整批变化后的 present 角色与目标场景一致
- 重复 item / clue / event 被拒绝
- relationshipsEnabled 与 bounds
- set_attr 已声明、可写、scope 合法
- characterIds 限制
- boolean / number / string / enum 类型
- number min / max
- enumValues
- string maxLength
- required default（Definition 初始化阶段）
- 死亡角色不能 present=true
- 同批冲突
```

### 8.1 原子性

```txt
全部合法 → 应用全部 changes
任一非法 → 整批拒绝，currentState 不变
```

`applyStoryStateChanges()` 只能接收 Validator 已确认合法的 changes。

### 8.2 同批冲突

以下情况整批拒绝，不做 last-write-wins：

```txt
- 两次及以上 set_scene
- 同一角色同类状态 op 重复
- 同一 itemId 多次变化或 add+remove
- 同一 clueId / eventId 两次 add
- 同一 relationship 两次 set
- 同一 Attribute storage key 两次 set_attr
```

场景切换与角色 present 调整不属于冲突；它们需要在同一 batch 的最终候选状态上统一做一致性校验。

---

## 9. Story Planner

Planner 只负责结构化规划：识别玩家行为、选择参与角色与叙事节拍、产生候选 State Changes、指定可揭示 Lore，以及约束 Renderer。

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

Planner 禁止直接输出完整故事、直接修改状态、绕过 Validator、发明未声明属性或默认暴露隐藏 Lore。

当 `rejection` 存在时，`stateChanges` 必须为空，行为类型必须为 rejected。

`FakeStoryPlanner` 用于离线门禁；`ModelStoryPlanner` 可使用 `ChatModel.generate + Zod`，解析失败必须显式报错。

---

## 10. Story Renderer

```ts
export interface StoryRenderResult {
  text: string;
}
```

Renderer 输入包括 snapshot 的必要子集、当前场景、当前状态、召回 Lore、已验证的 TurnPlan、玩家输入和少量消息历史。

Renderer 必须遵守：

```txt
- 不发明 State Change
- 不发明物品、线索、事件、死亡或场景切换
- 不泄露 mustNotReveal
- 不把 rejection 改写成成功行为
- 不修改 nextState
```

Stage 01 只做非流式 `render()`。`FakeStoryRenderer` 必须支持固定文本和主动抛错两种契约场景。

---

## 11. Provider 接口

```ts
export interface StoryProvider {
  getDefinition(storyId: string): Promise<StoryDefinition | null>;
}

export interface StoryStateProvider {
  getState(sessionId: string): Promise<StoryState | null>;
  saveState(sessionId: string, state: StoryState): Promise<void>;
}

export interface LoreProvider {
  recall(input: LoreRecallInput): Promise<LoreRecallResult>;
}
```

Stage 01 提供对应内存实现。运行中回合必须使用 `StorySession.definitionSnapshot`。

---

## 12. DefaultStoryWorkflow

```ts
export interface StoryWorkflowInput {
  sessionId: string;
  userInput: string;
}

export interface StoryWorkflow {
  execute(input: StoryWorkflowInput): Promise<StoryWorkflowResult>;
}
```

最小执行链：

```txt
Safety.guardInput（若注入）
↓
StorySessionProvider.getSession → definitionSnapshot
↓
StoryStateProvider.getState
↓
LoreProvider.recall
↓
StoryPlanner.plan
↓
StateTransitionValidator.validate
↓
applyStoryStateChanges → nextState（仅内存）
↓
StoryRenderer.render
↓
Safety.guardOutput（若注入）
↓
StoryStateProvider.saveState（全部成功后）
↓
返回结果与 debug metadata
```

提交语义：Planner、Validator、Renderer 或 Output Safety 任一失败，都不得保存 nextState。

```ts
export interface StoryWorkflowResult {
  text: string;
  state: StoryState;
  plan: StoryTurnPlan;
  recalledLoreIds: string[];
  appliedChanges: StoryStateChange[];
}
```

---

## 13. 种子故事：雾港疑云

```txt
类型：哥特 / 悬疑 / 慢热
玩家：寻找失踪姐姐的外乡侦探

场景：
- 白鲸酒馆
- 旧港口

角色：
- 伊芙琳：酒馆老板娘
- 莱昂：警探
- 塞缪尔：医生

物品：
- 蓝色月光酒单
- 旧港口通行证

线索：
- 酒单上的记号
- 蓝色蜡迹
- 姐姐曾到过白鲸酒馆

事件：
- 首次与伊芙琳谈及姐姐
- 进入旧港口
```

雾港固定：

```txt
relationshipsEnabled = false
角色信任只用 character scope 的 trust 属性
禁止 set_relationship
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
]
```

必须故意不声明 `combatPower`、`sanity`、`magicPower`。

初始 `present=true` 的角色必须属于 opening scene 的 `availableCharacterIds`。

---

## 14. 第二套 Schema：最小武侠契约

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
  },
  {
    key: "sectStanding",
    label: "门派地位",
    type: "enum",
    scope: "player",
    required: true,
    default: "外门弟子",
    enumValues: ["外门弟子", "内门弟子", "长老"],
  },
]
```

必须证明：武侠可初始化 combatPower；雾港拒绝 combatPower；武侠拒绝 clueHeat；同一 Runtime 和 Validator 无需修改。

---

## 15. 验证脚本

新增：

```txt
packages/story-core/scripts/verify-story-contract.ts
```

必须完全离线，并使用 Fake Planner / Fake Renderer。

至少覆盖：

```txt
1. required 缺 default
2. number default 越界
3. enum default 非法
4. string 缺 maxLength
5. string default 超长
6. 未声明 set_attr
7. set_attr 类型 / bounds / maxLength 错误
8. writable=false
9. scopeRef 缺失或非法
10. characterIds 限制
11. scene / item / clue / event 引用非法
12. Definition 含 objectiveIds 等不支持字段时校验失败或类型层面不存在
13. 重复 item / clue / event 整批拒绝
14. 同批重复写入冲突
15. relationships 未启用
16. 任一 change 非法时全部不应用
17. Renderer 抛错不保存
18. Output Safety 拒绝不保存
19. 雾港与武侠 Schema 初始化
20. 两套 Schema 复用同一 Runtime
21. Session 回合只读 definitionSnapshot
22. present=true 角色不属于当前场景时拒绝
23. set_character_present(true) 对死亡角色或不可用角色拒绝
24. set_scene 后遗留 present 角色不属于目标场景时整批拒绝
25. 同批 set_scene + 合法 present 调整可以通过
26. 同一 eventId 第二次 add_event 被拒绝
```

Package script：

```json
{
  "scripts": {
    "verify:story-contract": "tsx scripts/verify-story-contract.ts"
  }
}
```

真实模型冒烟脚本为可选项，不是完成门禁，且不得在 `story-core` 内读取 `process.env`。

---

## 16. 完成标准

Stage 01 完成必须同时满足：

```txt
- @ying-companion/story-core 可 build / typecheck / lint
- verify:story-contract 完全离线通过
- 同一 Runtime 支持雾港与武侠两套 Schema
- 未声明属性无法进入状态
- 未声明目录实体无法进入状态
- 事件在 Stage 01 中严格一次性
- 场景与角色 present 状态始终一致
- Planner / Validator / Renderer 边界明确
- 失败不提交 nextState
- 运行中 Session 只读 Definition Snapshot
- 不修改 Companion Chat 主链路
- 不把 Story State 写入 Companion Memory
- README 与仓库索引同步
```

验收结论：

> 不依赖数据库、正式 UI 或真实模型，通过离线脚本即可连续运行故事回合；状态变化可验证、可拒绝、可回滚，同一引擎能够运行具有不同动态字段的故事。

---

## 17. Stage 02 交接

Stage 01 只建立内存闭环。以下能力进入 Stage 02：

```txt
- Story Core Event 与 stream()
- PostgreSQL Session / State / Turn / Message 持久化
- 跨进程恢复与幂等
- 完整 state-condition Lore
- Narrative Summary 与上下文预算
- 事务提交点
- Story Wire Event
- 可重复事件若有真实需求：引入事件实例 / count / timestamp 后再设计
- Objective 若有真实需求：同时引入 Definition、State、Change 与 Validator 语义
```
