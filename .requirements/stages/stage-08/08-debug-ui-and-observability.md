# AI Companion Core V1 - 阶段 8：调试 UI 与可观测输出实施文档

## 文档定位

本阶段不是把 `apps/model-runtime-demo` 做成正式用户产品，而是将现有 demo 升级为一个可长期使用的**本地调试工作台**。

它必须能让开发者完整验证：

```txt
伴侣设定
→ 创建会话
→ 持久化聊天记录
→ 调用 CompanionCore
→ 持久化本轮状态
→ 查看 Trace / Memory / Emotion / Tool / Prompt Debug
```

本阶段只修改宿主应用、宿主侧持久化和调试 UI。除非发现可复现且能够明确归责于 `ai-core` 的缺陷，否则不修改 `packages/ai-core`。

---

## 一、前置现状与阶段目标

当前已完成阶段 1～7。现有 `apps/model-runtime-demo` 已经具备：

```txt
- 真实模型调用、重试、fallback 与运行时信息
- PostgreSQL + pgvector 长期记忆 Provider
- Persona / Memory / Emotion / Summary / Tool / Safety Provider 注入
- SimpleChatWorkflow 完整非流式工作流
- CoreObserver 事件收集
- WorkflowTrace、debugContext、工具结果、记忆结果和 Prompt Debug 展示
```

现有 demo 的限制是：

```txt
- sessionId、companionId、history、emotion 主要在浏览器 state 中维护
- Persona 在 API route 内固定创建
- 刷新页面后短期对话状态丢失
- 没有会话列表、创建入口、删除入口
- Trace 与调试结果不能按历史会话/消息回看
```

阶段 8 完成后的目标：

```txt
一个本地可运行的调试应用：

1. 创建对话前可设定当前 AI 伴侣属性；
2. 可查看会话历史列表；
3. 可进入任意会话继续聊天；
4. 可删除会话；
5. 可在每轮聊天后查看本轮完整调试信息；
6. 刷新页面后仍能恢复会话、短期历史、情绪与摘要；
7. 不把用户系统、鉴权、多租户、商业化逻辑带入 Core。
```

---

## 二、范围与非目标

### 2.1 本阶段必须做

```txt
- 伴侣创建/编辑表单
- 对话历史列表页
- 对话页
- 会话与消息持久化
- 会话删除
- 当前情绪与摘要持久化
- 伴侣配置注入 PersonaProvider
- 调试信息按“本轮消息”展示与持久化
- 保留现有 Memory DB 健康状态与 Provider 信息展示
```

### 2.2 本阶段明确不做

```txt
- 用户注册、登录、鉴权
- 真正的多租户与组织体系
- 支付、套餐、角色市场
- 文件上传、语音、图片、多模态
- 消息编辑、消息撤回、消息搜索
- 删除单条长期记忆
- 删除伴侣及其全部长期记忆
- 远程 Tool Call、MCP、LangChain、LangGraph
- 流式工具调用
- 修改 ai-core 的公开 Provider / Workflow 契约
- 正式产品级 UI 设计与适配
```

### 2.3 不修改 Core 的硬边界

本阶段必须继续满足：

```txt
packages/ai-core
- 不读取 process.env
- 不连接 PostgreSQL
- 不存储会话、用户、伴侣或消息
- 不知道 Next.js route、页面、数据库表
- 不写 console
```

`apps/model-runtime-demo` 是宿主；它负责读取环境变量、创建 Provider、维护持久化状态，并将状态传入：

```ts
core.executeWorkflow(input)
```

---

## 三、总体架构

### 3.1 宿主职责划分

```txt
apps/model-runtime-demo
├── App UI
│   ├── 伴侣设置页/弹窗
│   ├── 会话历史列表
│   ├── 对话页
│   └── 调试工作台面板
│
├── Route Handlers
│   ├── 伴侣 CRUD
│   ├── 会话 CRUD
│   ├── 消息发送
│   └── 调试运行记录读取
│
├── Host Runtime
│   ├── 读取 env
│   ├── createModel()
│   ├── createCompanionCore()
│   ├── 注入 PostgresMemoryProvider
│   ├── 注入 PostgresSummaryProvider（本阶段新增宿主适配）
│   └── 注入 DefaultPersonaProvider（由伴侣配置构建）
│
└── Debug Storage
    ├── companions
    ├── conversations
    ├── messages
    └── workflow_runs
```

### 3.2 一轮消息的宿主链路

```txt
用户发送消息
↓
宿主先持久化 user message（status=pending）
↓
读取 conversation / companion / recent messages / emotion / summary
↓
宿主构造 Provider 并调用 core.executeWorkflow()
↓
Core 返回 text / emotion / metadata / trace
↓
宿主持久化 assistant message
↓
宿主持久化 conversation.emotion
↓
宿主持久化 workflow run 安全调试快照
↓
更新 conversation.updatedAt / preview / title
↓
返回对话结果与本轮调试信息
```

模型调用与数据库写入不能包在一个长事务中。模型成功后，如果写回失败，接口应明确返回“回复生成成功但宿主持久化失败”的错误状态，不能伪称会话已保存。

---

## 四、数据模型与隔离策略

### 4.1 本地调试身份边界

本阶段没有用户系统，但数据库结构不得把“当前机器只有一个人”写死。

宿主统一使用固定本地 owner：

```txt
ownerType = "local-debug"
ownerId   = "local-debug-owner"
```

该值只存在于宿主侧，不传给前端自由修改。

未来接入用户系统时，只需将 owner 解析替换为认证结果：

```txt
ownerType = "user"
ownerId   = authenticatedUser.id
```

会话、伴侣、长期记忆的隔离均继续使用：

```txt
owner + companion
```

不能仅以 `conversationId` 作为长期记忆 Scope，因为长期记忆需要跨同一伴侣的多个会话复用。

### 4.2 companions

建议表名：`debug_companions`。

至少包含：

```txt
id
owner_type
owner_id
name
gender
relationship
personality
speaking_style
background
custom_instructions
created_at
updated_at
```

字段要求：

```txt
name                必填
 gender              必填；使用 ai-core 当前支持的 CompanionGender
relationship        可选；默认“AI 伴侣”
personality         必填；文本或标签合并后保存
speaking_style      可选
background          可选
custom_instructions 可选；仅补充角色设定，不允许覆盖宿主安全边界
```

本阶段不做角色市场，也不做复杂角色卡 schema。保留文本字段是为了先验证 Persona 对聊天行为的影响。

### 4.3 conversations

建议表名：`debug_conversations`。

至少包含：

```txt
id
owner_type
owner_id
companion_id
title
last_message_preview
emotion_json
created_at
updated_at
```

约束：

```txt
- companion_id 指向 debug_companions.id
- owner_type + owner_id + companion_id 用于权限与隔离预留
- emotion_json 保存上一轮 ChatWorkflowOutput.emotion
- title 初始值为“新对话”；首条用户消息成功后生成或截断更新
- updated_at 按最后一条成功保存的消息更新
```

### 4.4 messages

建议表名：`debug_messages`。

至少包含：

```txt
id
conversation_id
role                  # user | assistant
content
created_at
```

可选字段：

```txt
model
workflow_run_id
```

短期历史由宿主从该表读取、排序、裁剪后传入 `ChatWorkflowInput.history`。Core 不负责保存它。

### 4.5 conversation summaries

当前 `InMemorySummaryProvider` 不满足刷新后恢复对话的要求。本阶段新增**宿主侧** PostgreSQL SummaryProvider / SummaryUpdater。

建议表名：`debug_conversation_summaries`。

至少包含：

```txt
conversation_id
owner_type
owner_id
companion_id
summary_content
covered_message_count
updated_at
```

它只实现 `SummaryProvider` / `SummaryUpdater` 抽象，不将任何数据库逻辑引入 `ai-core`。

Summary scope 必须以：

```txt
owner + companion + conversation
```

构成；不同会话的滚动摘要不得互相污染。

### 4.6 workflow runs

建议表名：`debug_workflow_runs`。

用途：让开发者打开旧会话后，仍可以查看每条 AI 回复的 Trace 与调试结果。

至少包含：

```txt
id
conversation_id
user_message_id
assistant_message_id
workflow_id
status
model
trace_json
observer_events_json
debug_context_json
memory_snapshot_json
emotion_snapshot_json
tool_snapshot_json
error_summary
created_at
```

持久化规则：

```txt
- 成功：保存 WorkflowTrace、Observer events、安全调试快照
- degraded：照常保存，并明确 status=degraded
- 失败：保存 workflow:error 的安全摘要、已收集 Observer events 与截至失败点 trace
- 不持久化 API key、完整 provider 原始异常栈、数据库连接串
- Model raw output 默认不长期持久化；仅允许当前请求内调试展示
```

### 4.7 删除会话的严格语义

“删除会话”只删除该会话的宿主数据：

```txt
- debug_messages
- debug_conversation_summaries
- debug_workflow_runs
- debug_conversations 本身
```

**不得自动删除长期记忆。**

原因：长期记忆 Scope 是 `owner + companion`，应可跨会话继续使用；会话删除不等于用户要求 AI 忘记全部长期关系记忆。

后续若需要“清除记忆”或“删除伴侣”，必须作为独立能力设计，明确删除范围与审计语义。

---

## 五、页面与交互设计

### 5.1 路由建议

```txt
/                              → 会话历史列表
/companions/new                → 创建伴侣
/companions/[id]/edit          → 编辑伴侣
/conversations/new?companionId=... → 创建会话后跳转
/conversations/[id]            → 对话页 + 调试工作台
```

不需要单独做“正式首页”。根路径直接作为调试会话列表即可。

### 5.2 伴侣设定流程

用户点击“新建对话”后，不应直接创建空会话。

流程：

```txt
新建对话
↓
选择已有伴侣 或 创建伴侣
↓
填写/确认伴侣属性
↓
保存伴侣
↓
创建会话
↓
进入 /conversations/[id]
```

最小表单字段：

```txt
名称
性别
关系称呼
性格
说话风格
背景/补充设定
```

伴侣配置保存后，服务端在每次聊天请求中由该配置创建 `DefaultPersonaProvider`；不再在 route 内固定“映映”。

V1 不强制做“角色配置版本快照”。伴侣编辑后，现有会话下一轮将使用最新伴侣设定。这是本地调试工具中更利于快速验证 Persona 调整的行为。

### 5.3 对话历史列表页

列表每项至少展示：

```txt
伴侣名称
会话标题
最后消息预览
更新时间
删除按钮
```

行为：

```txt
- 按 updated_at 倒序
- 点击列表项进入对话页
- “新建对话”进入伴侣选择/设定
- 删除必须二次确认
- 删除成功后回到列表并刷新
- 空状态显示“还没有对话，先创建一个伴侣开始吧”
```

本阶段不做分页、搜索、置顶、归档。

### 5.4 对话页

页面建议采用三栏或两栏可收起布局：

```txt
左侧：会话列表（桌面端）
中间：消息流 + 输入框
右侧：调试面板（可折叠）
```

窄屏下可退化为：

```txt
消息流
↓
输入框
↓
调试面板 Drawer / Sheet
```

消息流：

```txt
- 从 debug_messages 读取并按 created_at 正序显示
- 用户与 AI 消息有清晰角色区分
- 发送期间显示 pending 状态
- 发送失败时保留用户消息并显示失败提示
- 不伪造 assistant 回复
```

输入框：

```txt
- Enter 发送，Shift + Enter 换行（或沿用当前 Ctrl/Cmd + Enter，二选一并保持一致）
- 请求期间禁用重复提交
- 请求完成后滚动到底部
```

### 5.5 调试面板

调试面板是阶段 8 的核心，不是装饰。

建议按“本轮 AI 回复”选择 `workflow_run` 展示以下分组：

```txt
运行总览
- workflowId
- status
- duration
- budgetExceeded
- 最终模型
- Memory DB health / Provider meta

工作流时间线
- WorkflowTrace.steps
- status / duration / summary / safe error

伴侣与上下文
- persona
- scope
- recent history count
- summaryContext
- memoryContext
- emotionContext
- systemPrompt（仅本地调试面板）

记忆
- recalled memories
- extracted memories
- saved / skipped memories
- embedding vector length

情绪
- previous / detected / next

工具
- tool definitions
- requested tool calls
- tool results
- dropped tool calls

Observer
- 可折叠显示 observer events
```

安全规则：

```txt
- 默认不展示 API key、数据库连接串
- 不默认展示 provider 原始堆栈
- 长文本使用折叠与复制按钮，避免页面无法阅读
- 对 JSON 提供格式化展示，不要求编辑
```

---

## 六、服务端 API 设计

### 6.1 伴侣 API

```txt
GET    /api/companions
POST   /api/companions
GET    /api/companions/[id]
PATCH  /api/companions/[id]
```

本阶段不做删除伴侣，避免误删其长期记忆关联语义。

### 6.2 会话 API

```txt
GET    /api/conversations
POST   /api/conversations
GET    /api/conversations/[id]
DELETE /api/conversations/[id]
```

`GET /api/conversations` 只返回列表必要字段，不把全部消息和调试快照塞入列表响应。

`GET /api/conversations/[id]` 返回：

```txt
conversation
companion
messages
latest emotion
latest summary metadata（若有）
```

### 6.3 发送消息 API

建议使用：

```txt
POST /api/conversations/[id]/messages
```

请求仅接收：

```ts
{ message: string }
```

不允许客户端传入：

```txt
ownerId
scope
companionId
history
emotion
systemPrompt
workflowOptions.includeTrace
```

这些值必须由服务端根据 conversation、companion 和宿主配置计算，避免调试 UI 与真实业务边界混乱。

服务端内部构造：

```ts
core.executeWorkflow({
  sessionId: conversation.id,
  message,
  history,
  emotion: conversation.emotion,
  scope: {
    ownerType: LOCAL_DEBUG_OWNER.type,
    ownerId: LOCAL_DEBUG_OWNER.id,
    companionId: companion.id,
  },
  summaryScope,
  conversationId: conversation.id,
  messageIds,
  summaryOptions: DEFAULT_SUMMARY_OPTIONS,
  workflowOptions: {
    includeTrace: true,
  },
});
```

API 成功返回：

```txt
assistantMessage
conversation state
workflowRun summary
```

本轮完整 debug 数据可同时返回给当前页面；刷新后从 `workflow_runs` 读取。

### 6.4 调试运行记录 API

建议：

```txt
GET /api/conversations/[id]/runs
GET /api/conversations/[id]/runs/[runId]
```

首屏只加载最新若干 run 的轻量索引；用户点击某一条 AI 回复时再加载详情，避免历史长会话一次返回大量 Trace JSON。

---

## 七、Provider 组装方式

### 7.1 统一 Runtime Builder

当前 route 内直接创建模型、memory、tool、persona、core。阶段 8 应抽离为宿主工厂，例如：

```txt
apps/model-runtime-demo/lib/runtime/create-companion-runtime.ts
```

职责：

```txt
输入：companion、conversation、observer
输出：该轮可调用的 CompanionCore
```

内部装配：

```txt
createModel(loadModelConfig(process.env))
PostgresMemoryProvider / fallback memory provider
PostgresSummaryProvider
PostgresSummaryUpdater
ModelEmotionEngine
LocalToolRegistry
DefaultPersonaProvider(companion config)
CollectingObserver
createCompanionCore(...)
```

这样 API route 只负责：读取持久化状态 → 创建 runtime → 调用 workflow → 写回持久化。

### 7.2 Tool 的宿主依赖

已有 `get_current_time`、`search_memory`、`get_emotion_state` 可以保留。

但 `search_memory` 与 `get_emotion_state` 不再读取客户端传入的 scope 或 emotion，而由 conversation runtime 闭包提供当前服务端状态。

本阶段不新增远程工具，不把 ToolRegistry 放进数据库。

### 7.3 Summary Provider

新增 PostgreSQL SummaryProvider / SummaryUpdater 只属于 demo 宿主或独立的宿主适配包。

它必须满足现有 Summary 抽象，不得修改 `ChatWorkflowInput` / `ChatWorkflowOutput` 主协议。

---

## 八、实施子任务与顺序

### 08-01：审计现有 demo 与确定宿主数据边界

目标：确认阶段 7 已有 `CoreObserver`、`WorkflowTrace`、`debugContext` 可直接消费，不以 UI 名义改动 Core。

要做：

```txt
- 审计 apps/model-runtime-demo 现有 chat route 与 ChatPanel
- 固化 Local Debug Owner 常量
- 明确会话删除与长期记忆删除的边界
- 列出本阶段允许修改的目录
```

允许修改：

```txt
apps/model-runtime-demo/**
packages/memory-postgres/**（仅在确有共享 PostgreSQL 基础设施复用价值时）
.requirements/stages/stage-08/**
```

默认不允许修改：

```txt
packages/ai-core/**
```

完成标准：

```txt
- 能书面确认每个状态由谁持有：伴侣、会话、消息、情绪、摘要、记忆、trace
- 不存在“浏览器 state 是唯一真相”的关键状态
```

人工验证：

```txt
打开当前 demo，确认现有 Trace / Observer / debugContext 字段均能取得。
```

### 08-02：建立调试宿主持久化层

目标：让会话相关宿主数据可持久化。

要做：

```txt
- 建立 companions / conversations / messages / summaries / workflow_runs migration
- 建立 repository 或 store 层
- 增加本地 debug owner 过滤
- 实现 conversation 删除级联清理
- 实现 PostgresSummaryProvider / PostgresSummaryUpdater
```

完成标准：

```txt
- 数据库可创建伴侣、会话、消息、摘要、run 记录
- 删除会话后其消息/摘要/run 不再查询到
- 删除会话后同伴侣长期记忆仍可被 MemoryProvider 召回
```

人工验证：

```txt
- 通过脚本或临时 route 创建一条数据，重启 dev server 后仍存在
- 删除会话后检查对应宿主表记录消失
- 使用同 companion 新建会话，验证长期记忆仍存在
```

### 08-03：伴侣设定与创建会话流程

目标：把 Persona 从固定 route 常量变成可配置宿主数据。

要做：

```txt
- 伴侣列表/创建/编辑 API
- 创建伴侣表单
- 选择已有伴侣或新建伴侣后创建 conversation
- 在 runtime builder 中按 companion 数据创建 DefaultPersonaProvider
```

完成标准：

```txt
- 不同 gender / personality / speakingStyle 的伴侣可创建
- 同一条用户消息对不同伴侣配置产生可观察的 Persona 差异
- 伴侣 ID 正确进入 MemoryScope.companionId
```

人工验证：

```txt
创建两个不同人格伴侣，各建一条会话，输入相同消息；
确认 Persona Result、systemPrompt 与回复风格均不同。
```

### 08-04：会话列表与删除能力

目标：实现最小会话管理。

要做：

```txt
- 根路由会话列表
- 新建对话入口
- 排序、空状态、最后消息预览
- 删除确认与删除 API
```

完成标准：

```txt
- 刷新后仍能看到历史会话
- 点击会话进入正确对话页
- 删除后列表与详情都不可再访问
- 删除不会清除同伴侣长期记忆
```

人工验证：

```txt
创建两个会话，删除其中一个，刷新页面并直接访问已删除 URL；
确认列表与详情都正确表现为不存在。
```

### 08-05：对话页与宿主聊天写回

目标：让消息和 AI 状态不再依赖浏览器 state。

要做：

```txt
- 对话页加载 conversation / messages / companion
- POST /messages 持久化 user message → workflow → assistant message
- 回写 conversation emotion、preview、updatedAt
- 服务端读取短期 history 并传入 Core
- 注入持久化 Summary Provider
- 失败状态持久化 workflow run，不伪造 assistant message
```

完成标准：

```txt
- 刷新页面后可继续同一个会话
- emotion 在下一轮正确传入并在 UI 中恢复
- summary 启用后重启服务仍可恢复
- 历史 messages 不再由 ChatPanel 自己作为唯一来源维护
```

人工验证：

```txt
连续发送多轮消息，刷新页面后继续聊天；
确认 history、emotion、summary 与新的 assistant 回复连续。
```

### 08-06：调试工作台产品化

目标：把阶段 7 已有调试数据改造成可读、可回看的 UI。

要做：

```txt
- 每条 assistant message 关联 workflow run
- 右侧/Drawer 调试面板
- 时间线、记忆、情绪、工具、Prompt、Observer 分组
- JSON 格式化、折叠、复制
- 当前 run 与历史 run 切换
- 保留 Memory DB health / provider meta
```

完成标准：

```txt
- 一轮成功、degraded、失败都能看到安全 trace
- 能定位本轮使用的模型、是否 fallback、记忆召回数、工具结果与情绪变化
- 旧会话重新打开后也能查看该轮调试记录
- 页面不展示 secrets 或连接串
```

人工验证：

```txt
分别触发：
- 普通聊天
- 记忆写入与召回
- get_current_time 工具
- search_memory 工具
- 模型失败或无效配置

确认每种场景都有对应 WorkflowTrace / Observer / 安全错误摘要。
```

### 08-07：手工验收与文档收束

目标：在无单元测试/E2E 的前提下，保留明确的人工验证路径。

要做：

```txt
- 更新 apps/model-runtime-demo README
- 写出本地启动、数据库迁移、验收步骤
- 对照本文件完成手工验收清单
- 记录任何发现的 Core bug；未确认前不直接改 Core
```

完成标准：

```txt
新开发者仅靠 README 即可：
1. 配置 env；
2. 迁移数据库；
3. 创建伴侣；
4. 创建会话；
5. 聊天并查看调试信息；
6. 删除会话并验证隔离。
```

---

## 九、关键失败语义

### 9.1 模型或 Workflow 失败

```txt
- user message 已保存：保留，并标记 pending/failed（字段实现可二选一）
- assistant message：不保存伪回复
- workflow_runs：保存失败 run 与安全摘要
- conversation.updated_at：可更新为最近尝试时间，但 preview 不应覆盖为错误文本
- 页面：显示本轮失败面板与可查看 trace
```

### 9.2 宿主写回失败

例如模型已成功生成回复，但 assistant message 保存失败：

```txt
- 不得声称该轮已完成
- 返回明确错误：模型生成成功，但会话持久化失败
- 可在当前页面临时显示生成文本，但必须显著提示刷新后可能丢失
- 优先记录服务端安全错误与 observer events
```

V1 不做消息队列、补偿任务或可恢复写回；这些属于后续基础设施阶段。

### 9.3 记忆/情绪/摘要降级

遵循阶段 7 既有语义：

```txt
Memory.recall / Emotion.analyze / Summary.load 失败
→ Core 正常返回 degraded
→ 宿主保存 assistant message 与 workflow run
→ 调试 UI 明确标记 degraded
```

---

## 十、验收清单

阶段 8 完成后必须手工通过：

```txt
[ ] 无会话时可进入空列表，并创建伴侣
[ ] 创建伴侣时可设置名称、性别、性格、说话风格等 Persona 属性
[ ] 可用已有伴侣创建新会话
[ ] 会话列表展示标题、伴侣、预览和更新时间
[ ] 打开会话后可看到持久化历史消息
[ ] 刷新页面后可继续同一个会话
[ ] 不同 companion 的长期记忆不互相召回
[ ] 同 companion 的不同会话可召回共享长期记忆
[ ] 删除会话会删除该会话消息/摘要/run，但不会删除长期记忆
[ ] 发送一条普通消息可看到 WorkflowTrace
[ ] 触发记忆后可看到 extracted / saved / recalled memories
[ ] 触发工具后可看到 tool call / tool result
[ ] 情绪在刷新后仍能恢复并传入下一轮
[ ] Summary 启用后重启 dev server 仍可恢复
[ ] 出现模型失败时能看到安全错误与失败 trace
[ ] 页面和 API 响应中没有 API key、连接串、原始异常栈
[ ] packages/ai-core 无计划外改动
```

---

## 十一、阶段完成后的状态

阶段 8 完成后，项目将拥有：

```txt
一个真实可操作的本地 AI Companion 调试工作台：

- 可配置伴侣 Persona
- 可创建、继续、删除会话
- 可持久化短期消息、情绪和摘要
- 可复用 PostgreSQL + pgvector 长期记忆
- 可验证工具调用
- 可追踪 Workflow 生命周期
- 可回看每轮调试结果
- 仍保持 ai-core 为独立、纯粹、可替换的 SDK
```

它仍然不是正式用户产品；但它会成为后续接入用户、鉴权、前后台、商业化和正式 UI 时最可靠的 Core 验证环境。
