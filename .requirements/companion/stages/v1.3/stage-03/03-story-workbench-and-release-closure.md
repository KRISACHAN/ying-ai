# V1.3 Stage 03：Story Workbench 与 Release Closure

> 本阶段目标：在 Stage 02 已完成的 `story-core` 流式工作流、`story-postgres` 持久化与恢复语义之上，于 `apps/model-runtime-demo` 增加克制的 Story Workbench，验证「选择故事 → 开档 / 续档 → 文字游玩 → 观察状态 → 刷新恢复 → Debug 定位」完整闭环。
>
> 本阶段必须证明：**Story Runtime 不只是可执行 SDK，还能以与现有 Companion Workbench 同风格的 Demo 宿主被消费、调试与验证。**

---

## 1. 前置基线

V1.3 Stage 03 以以下内容已完成为前提：

```txt
packages/story-core
├── StoryDefinition / StoryState / StorySession / StoryTurn / StoryMessage
├── Story Attribute Schema 与 attrs 存储键规则
├── StoryWorkflow.execute() / stream()
├── Story Core Event（含 story:context-ready）
├── Lore 召回、secret 可见性与 revealedLoreIds
├── StoryTurnCommitter 原子提交 + clientTurnId 幂等
├── verify:story-contract / verify:story-workflow

packages/story-postgres
├── Story Session / State / Turn / Message / Summary 持久化
├── Definition Snapshot 冻结
├── PostgreSQL migration
└── verify:story-postgres / verify:story-recovery
```

必须继续保持：

```txt
- Story 不进入 SimpleChatWorkflow
- Story Core Event 与 Wire Event 分层
- story-core / story-postgres 不读取环境变量
- Demo 宿主持有 pg.Pool，再注入 story-postgres Provider
- JSON / NDJSON 边界仍由 demo 侧显式序列化与 runtime guard 负责
- 旧 Session 继续使用开档时冻结的 definitionSnapshot
- Attribute UI 与写入规则必须完全受 StoryDefinition.attributes 约束
```

说明：本阶段允许调整 `apps/model-runtime-demo` 的宿主代码、路由、README 与验证脚本；除非发现通用缺口，否则不再扩展 `story-core` 主语义。

---

## 2. 本阶段范围

### 2.1 必须完成

```txt
1. 在 apps/model-runtime-demo 提供 Story Workbench 页面与 API
2. 提供故事列表、Session 列表 / 新建入口、Story Runtime 页
3. 提供 Story Wire Event、NDJSON 传输与 UI Adapter
4. 提供 Story Debug 面板，能解释 Lore / Plan / State / Timeline / Runtime
5. 提供刷新恢复与旧消息恢复
6. 提供按 Attribute Schema 动态渲染的状态侧栏
7. 提供最小 Story Definition 预览与 JSON 导入入口
8. 提供 Story Workbench 手工验收与自动化契约验证
9. 更新 AGENTS.md / README / package README / requirements 索引
10. Story Workbench 默认接入真实 ModelStoryPlanner + ModelStoryRenderer，不以固定关键词脚本代替叙事
```

### 2.2 本阶段不做

```txt
- 可视化剧情节点编辑器
- 完整低代码创作平台
- 故事市场 / 发布系统
- 多人故事
- 复杂战斗系统 / 骰子系统 / 成长树
- 剧情分支图编辑
- 角色后台自主行动
- 结构化创作台全表单（V1.3 只需种子故事 + JSON 导入 / 预览）
- Definition 热更新旧 Session
- 将 Story 工作台并入 Companion 会话页
```

原因：V1.3 的核心目标是验证「状态驱动叙事」被真实宿主消费，而不是构建完整创作工具链。

---

## 3. 产品闭环

### 3.1 创作者路径

V1.3 使用**预定义种子 Story Definition**或**JSON 导入**方式，不要求完整结构化表单。

```txt
Story Definition（seed 或 JSON）
↓
Schema 校验
↓
展示概要 / Attribute Schema
↓
创建 Story Session
↓
开始游玩
```

Story Definition 至少包含：

```txt
故事基础信息
玩家身份
角色定义
场景定义
item / clue / event 目录
Lore
Narrative Rules
Attribute Schema
```

### 3.2 玩家路径

```txt
选择故事
↓
新建 Session 或继续已有 Session
↓
进入 Story Runtime
↓
发送自由输入
↓
观察叙事文本 + 状态侧栏 + Debug Timeline
↓
刷新页面或重新进入后继续
```

---

## 4. 动态 Attribute UI

### 4.1 原则

Story Workbench 的动态字段完全由 `StoryDefinition.attributes[]` 驱动。

禁止：

```tsx
<CombatPower />
<Sanity />
<Affection />
```

应该：

```tsx
<StoryAttributeRenderer
  schema={attributeDefinition}
  value={
    state.attrs[
      createStoryAttributeStorageKey({
        definition: attributeDefinition,
        scopeRef,
      })
    ]
  }
/>
```

支持：

```txt
number
boolean
string
enum
```

约束：

```txt
required
min / max
maxLength
enumValues
writable
showInSidebar
scope（story / player / character / scene）
```

这些规则必须与 `story-core` Validator 保持一致。

### 4.2 渲染规则

```txt
- UI 不得直接使用裸 key 读取 attrs；必须复用 createStoryAttributeStorageKey()
- scope=story     → 直接读 story 级 key（如 clueHeat）
- scope=player    → 读 player:<key>
- scope=character → 读 character:<characterId>:<key>
- scope=scene     → 读 scene:<sceneId>:<key>
- showInSidebar=false 的属性不进入默认侧栏，但仍可在 Debug 中显示
- writable=false 只表示 Planner 不应修改，不影响 UI 展示
```

### 4.3 V1.3 演示约束

现有种子故事至少对齐以下属性：

```txt
雾港疑云
  - clueHeat
  - trust（character:evelyn:trust）
  - publicTitle（player 级，writable=false）

武侠最小契约
  - combatPower
  - sectStanding
```

要求证明：

```txt
同一套 Runtime + 同一套 UI Renderer
可以消费不同 Attribute Schema
而不是把 Story Runtime 写死成某一种游戏规则
```

---

## 5. Story Workbench 页面

### 5.1 建议路由

```txt
/stories
  故事列表 + JSON 导入入口

/stories/[storyId]/sessions
  Session 列表 / 新建存档

/stories/[storyId]/sessions/[sessionId]
  Story Runtime
```

说明：

```txt
- `/` 仍保留 Companion Workbench，不与 Story 混页
- V1.3 不强制单独提供 `/stories/[storyId]` Story Overview 页
- 若实现额外 Overview，也不替代 sessions 列表页
```

### 5.2 Story Runtime 页布局

```txt
+--------------------------------+
| Story Header                   |
| 故事标题 / 当前场景 / revision |
+--------------------------------+
|                                |
|       Story Conversation       |
|                                |
+--------------------------------+
| User Composer                  |
+--------------------------------+
| State Sidebar                  |
| - Scene / Inventory / Clues    |
| - Events                       |
| - Relationships（若启用）      |
| - Dynamic Attributes           |
+--------------------------------+
```

要求：

```txt
- Header 只写“当前场景”，不引入未定义的“章节”概念
- 侧栏必须区分核心状态与扩展 attrs
- relationships 仅在 Definition 启用时展示
- attrs 仅展示 showInSidebar=true 的字段
```

---

## 6. Demo 宿主结构

建议在 `apps/model-runtime-demo` 内补充与 Companion 平行的 Story 宿主模块：

```txt
app/
├── stories/
│   ├── page.tsx
│   └── [storyId]/
│       └── sessions/
│           ├── page.tsx
│           └── [sessionId]/
│               └── page.tsx
├── api/
│   └── story-sessions/
│       ├── route.ts
│       └── [id]/
│           ├── route.ts
│           └── messages/
│               └── route.ts
└── lib/
    ├── story-debug-repository.ts
    ├── story-runtime-factory.ts
    ├── story-stream-wire.ts
    ├── story-stream-transport.ts
    ├── story-stream-ui-adapter.ts
    └── story-stream-contract-verifier.ts
```

命名不要求逐字一致，但职责必须清楚且与现有 `chat-stream-wire.ts` / `DemoChatTransport` 模式平行。

---

## 7. API 与宿主注入

### 7.1 最小 API

```txt
POST /api/story-sessions
  输入：storyId（或导入 definition 标识）
  输出：sessionId / storyId / definitionVersion

GET /api/story-sessions/[id]
  输出：session、latestState、recentMessages、summary、definition preview

POST /api/story-sessions/[id]/messages
  输入：message、clientTurnId、可选非敏感 modelConfig
  输出：application/x-ndjson; charset=utf-8
```

可选：

```txt
POST /api/stories/import
  输入：StoryDefinition JSON
  输出：校验结果 + 临时可用 storyId
```

### 7.2 宿主职责

Demo 应：

```txt
- 读取 DATABASE_URL 并创建 / 持有 pg.Pool
- 注入 story-postgres Session / State / Turn / Message / Summary Provider
- 构造 story runtime factory，不让 route 自己拼装所有 Provider
- 按 session.definitionSnapshot 加载故事，而不是重新读取最新种子定义
- 由宿主读取模型环境变量并注入 ChatModel；列表/恢复读取与模型初始化解耦
- 允许 Story 使用独立的 provider 覆盖，但未配置时继承 Demo 全局模型 provider
- 每个新回合默认执行 Planner 结构化生成与 Renderer 文本生成两次模型调用
- 向 Planner / Renderer 传入 Narrative Summary 与 recent messages，保证多轮叙事连续
```

禁止：

```txt
- 在 route 里直接读取 process.env 后临时 new Provider
- Story Session 恢复时忽略 definitionSnapshot
- 只注入部分 Postgres Provider，剩余默认回退到 InMemory
- 在交互式 Story Workbench 中用 Fake Planner / 固定关键词分支代替真实模型
```

---

## 8. Streaming、Wire Event 与 UI Adapter

### 8.1 链路

继续复用现有流式架构模式：

```txt
storyWorkflow.stream()
↓
Story Core Event
↓
Story Wire Event
↓
Story UI Adapter
↓
AI SDK UI message parts + Debug 面板原始事件
```

不要让 Story Mode 绕过现有 Runtime Streaming 体系。

原因：

```txt
统一调试
统一错误处理
统一客户端消费方式
```

### 8.2 Story Core Event（已存在）

Debug Timeline 必须对齐当前 `story-core` 事件：

```txt
story:start
story:session-loaded
story:state-loaded
story:summary-loaded
story:lore-recalled
story:context-ready
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

### 8.3 Wire 约束

Story Wire Event 必须遵循与 Companion Wire 相同的边界原则：

```txt
- occurredAt / Date → ISO string
- unknown / raw / Error → 显式序列化
- 事件顺序按 sequence 保留
- NDJSON 每行一个 event
- finish / error 后不再发送额外业务事件
```

Story Workbench 不应直接把 `StoryWorkflowEvent` 原样透传到浏览器。

### 8.4 UI Adapter 职责

建议职责：

```txt
- text delta → assistant streaming 文本
- committed / finish → assistant 状态落稳
- validation-failed / error → UI 错误态 + Debug 面板
- lore / context / plan / state-prepared / summary-updated → 旁路进入 Debug
```

---

## 9. Debug Workbench

复用现有 Runtime Debug 思路，增加 Story Domain 信息。

### 9.1 展示面板

```txt
Story Definition Preview
Current Scene
Current State
Dynamic Attributes
Recent Messages
Narrative Summary
Recalled Lore
Story Planner Output
Accepted State Changes
Rejected Changes
Workflow Timeline
Model Runtime
```

### 9.2 面板与事件映射

重点回答：

```txt
为什么角色这样回复？
为什么剧情推进？
为什么属性发生变化？
为什么某个事件没有触发？
为什么这个 Lore 被召回或没被召回？
这次世界状态是否真的提交？
```

建议映射：

```txt
story:lore-recalled      → Recalled Lore
story:context-ready      → Effective Context（summary / recent messages / lore ids）
story:plan-completed     → Story Planner Output
story:validation-failed  → Rejected Changes
story:state-prepared     → Accepted State Changes（提交前）
story:committed          → turnId / turnNumber / stateRevision
story:summary-updated    → Narrative Summary 状态
story:error              → 错误定位
```

### 9.3 Definition 预览

V1.3 只需只读预览，不要求完整编辑器。

预览至少包含：

```txt
故事标题 / premise / genre
角色列表
场景列表
Attribute Schema
Narrative Rules
```

---

## 10. Session 恢复与一致性验证

必须验证：

### 10.1 Session 恢复

```txt
开始故事
↓
产生状态变化
↓
退出或刷新
↓
重新进入同一 Session
↓
恢复正确 state / messages / summary / revision
```

### 10.2 多轮一致性

```txt
已获得物品不会消失
已触发事件不会重复触发
隐藏信息不会提前泄露
revealedLoreIds 继续生效
relationships（若启用）保持一致
attrs 仍符合 Attribute Schema
旧 clientTurnId 不会二次推进世界
```

### 10.3 页面恢复语义

```txt
- 刷新后应先加载持久化消息与最新 state，再允许继续发送
- openingText 只在真正首回合作为历史内容出现，不应每次重进重复插入
- 恢复页显示的 definitionVersion 必须来自 session snapshot
```

---

## 11. Contract Test 与验证

### 11.1 Story Definition 契约

至少包含两个 Story Definition：

```txt
雾港疑云
  - clueHeat
  - trust（character:evelyn:trust）
  - publicTitle（player 级，只读）

武侠测试故事
  - combatPower
  - sectStanding
```

目标：

```txt
同一个 Story Runtime
同一套 Story Workbench
可以消费不同领域模型与不同 Attribute Schema
```

### 11.2 自动化验证

本阶段至少补齐或扩展以下验证：

```txt
pnpm --filter @ying-companion/story-core verify:story-contract
pnpm --filter @ying-companion/story-core verify:story-workflow
pnpm --filter @ying-companion/story-postgres verify:story-postgres
pnpm --filter @ying-companion/story-postgres verify:story-recovery
pnpm --filter @ying-companion/model-runtime-demo verify:story-stream-contract
pnpm --filter @ying-companion/model-runtime-demo verify:story-ui-adapter
```

说明：

```txt
- `verify:story-stream-contract` 对标现有 verify:stream-contract，覆盖 NDJSON / wire guard / finish 后额外事件等边界
- `verify:story-ui-adapter` 对标现有 chat UI adapter 验证，覆盖 delta / committed / validation-failed / error
- Fake Model / Planner / Renderer 只用于离线契约验证，验证输入上下文、结构化 Plan 与 streaming 边界
- 真模型手工验收用于证明自由输入能驱动连续叙事，但不是唯一完成门禁
```

### 11.3 手工验收

建议最小验收路径：

```txt
A. /stories 显示种子故事列表；可进入某故事 Session 列表
B. 新建雾港 Session → 开场文本正确 → state 初始 attrs 正确
C. 连续发送多轮自由行动或对白 → 回复承接实际输入与前文 → AI SDK UI 增量显示 → 合理的 state / clues / attrs 变化可见
D. trust / clueHeat 在侧栏按 Schema 显示；publicTitle 只读显示
E. 新建武侠 Session → 不出现雾港字段；出现 combatPower / sectStanding
F. 刷新 Story Runtime 页 → messages / state / revision 恢复
G. Debug 面板可看到 Lore / Plan / Timeline / committed revision
H. validator-failure 自动化场景中，UI Adapter 有可见错误态，世界不推进
I. 工程：pnpm typecheck && pnpm lint && pnpm build
```

---

## 12. 文档收口

更新：

```txt
AGENTS.md
.requirements/README.md
.requirements/prompts/06-v1.3-story-mode-plan.md（如需同步索引）
apps/model-runtime-demo/README.md
packages/story-core/README.md
packages/story-postgres/README.md
```

其中 `apps/model-runtime-demo/README.md` 至少补充：

```txt
- `/stories` 入口与 Story Workbench 定位
- Story 使用的数据库前置（复用 DATABASE_URL + story-postgres migration）
- Story 流式链路与 NDJSON 说明
- Story Debug 面板说明
- Story 手工验收命令 / verify 脚本
```

---

## 13. 实施顺序

```txt
1. 建立 story runtime factory，固定 Demo 侧 Provider 注入方式
2. 实现 story-stream-wire.ts 与 runtime guard
3. 实现 story-stream-transport.ts / story-stream-ui-adapter.ts
4. 实现 POST /api/story-sessions/[id]/messages
5. 实现 /stories、session 列表页、runtime 页
6. 接 Story Debug 面板与状态侧栏
7. 补 JSON 导入 / Definition 预览
8. 完成 verify:story-stream-contract / verify:story-ui-adapter
9. 补 README / AGENTS / requirements 文档
```

不要先做复杂编辑器；Stage 03 首先要把“Story Workflow 在 Demo 里能可靠消费、恢复与调试”这件事做对。

---

## 14. 完成门禁

Stage 03 Done 必须同时满足：

```txt
[ ] `/stories` 入口可用，且不影响现有 Companion Workbench
[ ] Story Session 可创建、列出与恢复
[ ] Story Runtime 页面可连续发送消息并展示流式文本
[ ] Story Wire Event 已建立，且不直接泄漏未序列化 Date / Error / raw
[ ] story-stream-contract 覆盖 NDJSON / wire guard / finish 边界
[ ] Story UI Adapter 可正确处理 delta / committed / validation-failed / error
[ ] Debug 面板能展示 Lore / Context / Plan / Accepted Changes / Rejected Changes / Timeline / Runtime
[ ] 侧栏按 Attribute Schema 动态展示 attrs，不写死业务字段
[ ] UI 通过 createStoryAttributeStorageKey 读取 attrs，而非裸 key
[ ] relationships 仅在启用时显示
[ ] 雾港与武侠两套故事在同一 Workbench 中都可运行
[ ] 刷新页面后 messages / state / revision / definitionVersion 正确恢复
[ ] 重复 clientTurnId 不二次推进世界，UI 可观测到幂等结果
[ ] 非法状态变更不会污染持久化 state
[ ] model-runtime-demo README 已补 Story 章节
[ ] AGENTS.md / requirements 索引与 V1.3 文档已同步
[ ] build / typecheck / lint / Story 相关 verify 脚本通过
```

本阶段完成后，系统必须能够回答：

```txt
这个 Session 当前使用的是哪一版 definitionSnapshot？
当前世界状态 revision 是多少？
这次回合召回了哪些 Lore，为什么召回？
Planner 提出了哪些 StateChange？
哪些 Change 被接受，哪些被拒绝？
Renderer 是否完整结束？
这个 clientTurnId 是否已提交？
刷新后为什么还能继续？
UI 为什么显示这些 attrs，而没有显示另一套故事字段？
```

如果这些问题无法通过结构化数据、页面表现与验证脚本回答，Stage 03 不能标记完成。

---

## 15. 完成标准

V1.3 Stage 03 完成后：

用户可以：

```txt
选择故事
创建或继续 Session
自由输入行动
观察剧情推进
查看世界状态
刷新后继续
```

开发者可以：

```txt
知道 Story 为什么这样运行
知道 State 为什么变化
知道 Lore 为什么被召回
知道错误发生在哪一步
知道 UI 为什么展示当前这组动态字段
```

最终证明：

> `story-core` 已经成为 `ai-core` 之上的独立互动叙事领域能力，而不是一个特殊 Prompt 或聊天模式；`apps/model-runtime-demo` 也已具备消费、恢复和调试这一领域能力的最小宿主闭环。
