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

### 与 `03-plan.md` 的关系与差异

`prompts/03-plan.md` 是 V1 **总路线图**；本文档是阶段 8 的**可执行规格**，以当前代码为准。两者冲突时，**以本文档为准**。

主要差异：

1. **范围**：`03-plan.md` 阶段 8 仅列「输入框、聊天记录、展示记忆/情绪/工具」；阶段 3～7 的 demo 已超额完成展示项。本文档聚焦**宿主持久化、会话/伴侣管理、调试数据回看、长期记忆独立管理**。
2. **布局**：本文档要求对话页**左调试、右对话**；保留并迁移现有 `ChatPanel` 调试分组，而非从零重写。
3. **owner 类型**：本地调试使用 `MemoryScope.ownerType = "custom"`（见 §4.1），不扩展 `ai-core` 联合类型。

实施阶段 8 时无需回头修改 `03-plan.md`；全部阶段完成后可统一修订总路线图。

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
3. 可进入任意会话继续聊天（左调试 · 右对话）；
4. 可删除会话；
5. 可在每轮聊天后在左侧查看完整调试信息；
6. 可在独立页面管理长期记忆（增删改查）；
7. 刷新页面后仍能恢复会话、短期历史、情绪与摘要；
8. 不把用户系统、鉴权、多租户、商业化逻辑带入 Core。
```

---

## 二、范围与非目标

### 2.1 本阶段必须做

```txt
- 伴侣创建/编辑表单
- 对话历史列表页
- 对话页（左调试工作台 + 右对话模块，见 §5.4）
- 长期记忆独立管理页（按伴侣 CRUD，见 §5.6；不与对话页混排）
- 会话与消息持久化
- 会话删除
- 当前情绪与摘要持久化
- 伴侣配置注入 PersonaProvider
- 调试信息按“本轮消息”展示与持久化
- 保留并迁移现有 ChatPanel / Memory DB 健康状态与 Provider 信息展示
- 保留 Model Runtime 独立验证入口（见 §5.1）
```

### 2.2 本阶段明确不做

```txt
- 用户注册、登录、鉴权
- 真正的多租户与组织体系
- 支付、套餐、角色市场
- 文件上传、语音、图片、多模态
- 消息编辑、消息撤回、消息搜索
- 在对话页内嵌长期记忆增删改查（须在独立管理页完成，见 §5.6）
- 删除伴侣及其全部长期记忆（伴侣删除本阶段仍不做）
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
core.executeWorkflow(input);
```

---

## 三、总体架构

### 3.1 宿主职责划分

```txt
apps/model-runtime-demo
├── App UI
│   ├── 伴侣设置页/弹窗
│   ├── 长期记忆管理页（/companions/[id]/memories）
│   ├── 会话历史列表
│   ├── 对话页（左：调试工作台 · 右：对话模块）
│   └── Model Runtime 验证页（/debug/model-runtime）
│
├── Route Handlers
│   ├── 伴侣 CRUD
│   ├── 长期记忆 CRUD（宿主直读写 companion_memories）
│   ├── 会话 CRUD
│   ├── 消息发送
│   └── 调试运行记录读取
│
├── Host Runtime
│   ├── 读取 env
│   ├── createModel()
│   ├── createCompanionCore()
│   ├── 注入 PostgresMemoryProvider
│   ├── CompanionMemoryAdminRepository（长期记忆 CRUD，§4.8）
│   ├── 注入 PostgresSummaryProvider（本阶段新增宿主适配）
│   └── 注入 DefaultPersonaProvider（由伴侣配置构建）
│
└── Debug Storage
    ├── companions
    ├── conversations
    ├── messages
    ├── workflow_runs
    └── companion_memories（长期记忆；Workflow 与记忆管理页共用）
```

### 3.2 一轮消息的宿主链路

```txt
用户发送消息
↓
宿主持久化 user message（status=pending）
↓
宿主创建 workflow_run（绑定 user_message_id；assistant_message_id 暂为 null）
↓
读取 conversation / companion / 已完成 messages / emotion / summary
↓
宿主构造 Provider 并调用 core.executeWorkflow()
↓
Core 返回 text / emotion / metadata / trace
↓
成功：宿主持久化 assistant message（status=completed）→ 回填 workflow_runs.assistant_message_id → user message 标记 completed
↓
宿主持久化 conversation.emotion
↓
宿主持久化 workflow run 安全调试快照
↓
更新 conversation.updatedAt / preview / title
↓
返回对话结果与本轮调试信息
```

失败分支见 §9.1：`assistant_message_id` 保持 null，user message 标记 `failed`，workflow_run 仍保存 trace。

**事务边界（必须遵守）：**

```txt
- 模型调用不能在数据库事务内执行
- 模型成功返回后的宿主写回，必须在短事务内原子提交（见 §4.6「短事务规则」）
- 若短事务 B 整体失败并回滚，user message 仍为 pending，接口返回 §9.2 的持久化失败语义
```

---

## 四、数据模型与隔离策略

### 4.1 本地调试身份边界

本阶段没有用户系统，但数据库结构不得把“当前机器只有一个人”写死。

宿主统一使用固定本地 owner（须符合 `MemoryScope.ownerType` 联合类型，**不修改 `ai-core`**）：

```txt
ownerType = "custom"
ownerId   = "local-debug-owner"
```

常量建议定义为 `LOCAL_DEBUG_OWNER = { type: "custom", id: "local-debug-owner" } as const`。
`ownerType` 不使用 `"local-debug"` 字面量——该值不在 Core 类型中；语义上 `"custom"` 表示「宿主自定义 owner」，本地调试与未来用户系统切换均适用。

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
user_address
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
user_address        可选；伴侣对用户的固定称呼，由宿主拼入补充 persona
personality         必填；文本或标签合并后保存
speaking_style      可选
background          可选
custom_instructions 可选；仅补充角色设定，不允许覆盖宿主安全边界
```

**Persona 映射（runtime builder）：** 从 `debug_companions` 行构造 `DefaultPersonaProvider` 时：

```txt
id              ← companion.id
name            ← name
gender          ← gender
relationship    ← relationship
userAddress      ← user_address（若有；作为“对用户的称呼”补充设定）
personality     ← personality
speakingStyle   ← speaking_style
background      ← background（若有）
systemPrompt    ← custom_instructions（若有；作为补充设定拼入，不覆盖 Safety 边界）
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
status                # pending | completed | failed
error_summary         # nullable；安全摘要，失败时写入
created_at
```

可选字段：

```txt
model                 # assistant 消息可记录最终模型
```

**不在 `debug_messages` 存 `workflow_run_id`。** 与 run 的关联仅由 `debug_workflow_runs.user_message_id` / `assistant_message_id` 单向指向 message，避免循环外键与复杂写入顺序（见 §4.6）。

传入 `ChatWorkflowInput.history` 时，宿主只读取 `status=completed` 的消息（按 `created_at` 正序、裁剪上限）。`pending` / `failed` 的 user message 可在 UI 展示，但不进入下一轮 history。Core 不负责保存短期历史。

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
user_message_id       NOT NULL → debug_messages.id
assistant_message_id  NULL     → debug_messages.id；成功后再回填
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

**关联方向（固定）：** 仅 `workflow_runs → messages`，不在 `debug_messages` 反向存 `workflow_run_id`。

写入顺序：

```txt
1. INSERT user message（status=pending）
2. INSERT workflow_run（user_message_id 已填，assistant_message_id=null）
3. 调用 Core（事务外）
4. 成功：INSERT assistant message（status=completed）→ UPDATE workflow_runs.assistant_message_id → UPDATE user message status=completed
5. 失败：UPDATE user message status=failed + error_summary；workflow_run 保存失败 trace（assistant_message_id 保持 null）
```

**短事务规则：** 上述步骤 1～2、4～5 不能各自散落提交后留下半完成状态；Core 调用前后也不能共用同一长事务。

```txt
事务 A（创建待处理态）：
1. INSERT user message（status=pending）
2. INSERT workflow_run（user_message_id 已填，assistant_message_id=null，status=running 或等价初始态）
→ COMMIT

→ 调用 Core（事务外；不占连接池事务）

Core 成功后 — 事务 B（成功写回，一次 COMMIT）：
1. INSERT assistant message（status=completed）
2. UPDATE workflow_runs（assistant_message_id、status、trace/debug snapshots、model 等）
3. UPDATE user message（status=completed）
4. UPDATE conversation（emotion_json、preview、title、updated_at）
→ COMMIT

Core 失败后 — 事务 C（失败写回，一次 COMMIT）：
1. UPDATE user message（status=failed、error_summary）
2. UPDATE workflow_runs（status=failed、error_summary、已收集 trace / observer 安全快照）
→ COMMIT
```

若事务 B 任一步失败，**整笔 B 必须 ROLLBACK**，不得留下「assistant 已插入但 user 仍 pending」等不一致状态。此时 user message 保持事务 A 后的 `pending`，workflow_run 仍无 `assistant_message_id`；接口按 §9.2 返回「模型生成成功但宿主持久化失败」，可在响应当次临时展示生成文本。

degraded 成功路径仍走事务 B：`workflow_runs.status=degraded`，assistant message 与 user completed 照常写入。

UI 通过 `assistant_message_id` 或 `user_message_id` 查找 run；点击 assistant 消息时以 `assistant_message_id` 为主键查询。

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

### 4.8 长期记忆管理适配层（CompanionMemoryAdminRepository）

长期记忆 CRUD **不得**在 Route Handler 内复制 embedding / SQL 逻辑，否则将与 `PostgresMemoryProvider.save()` 的存储规则分叉。

建议新增宿主侧（或 `packages/memory-postgres` 内）管理适配层，例如：

```txt
apps/model-runtime-demo/lib/memory/companion-memory-admin-repository.ts
# 或 packages/memory-postgres/src/companion-memory-admin-repository.ts
```

职责：

```ts
list(scope: MemoryScope): Promise<MemoryRecord[]>
create(input, scope): Promise<MemoryRecord>
update(id, patch, scope): Promise<MemoryRecord>
remove(id, scope): Promise<void>
```

规则（写死，与 Workflow 写入语义一致）：

```txt
- 只改 importance / type：不重新 embedding
- 改 content：必须重新 embedding 后再 UPDATE
- 删除：WHERE id + owner_type + owner_id + companion_id（禁止仅按 id 删除）
- 新增：embed(content) + INSERT，去重规则与 PostgresMemoryProvider.save 一致（同 scope 下 type+content 重复则拒绝或 skipped）
- 列表响应不含 embedding 向量；不含 score（score 是 recall 查询结果，见 §5.6）
```

Route Handler 只调用该 repository；Workflow 仍通过 `PostgresMemoryProvider` 写入，两者共用 `companion_memories` 表。

---

## 五、页面与交互设计

### 5.1 路由建议

```txt
/                              → 会话历史列表
/companions/new                → 创建伴侣
/companions/[id]/edit          → 编辑伴侣
/companions/[id]/memories      → 该伴侣的长期记忆管理（独立页，见 §5.6）
/conversations/new?companionId=... → 创建会话后跳转
/conversations/[id]            → 对话页：左调试工作台 + 右对话模块
/debug/model-runtime           → 保留阶段 1 Model Runtime 独立验证（迁移现有 ModelRuntimePanel）
```

不需要单独做“正式首页”。根路径直接作为调试会话列表即可。

`ModelRuntimePanel` 从当前首页迁出至 `/debug/model-runtime`，避免与新的会话列表/对话页职责混杂；阶段 1 能力仍可通过该路由手工验收。

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

### 5.4 对话页布局（左调试 · 右对话）

对话页 `/conversations/[id]` **必须**采用左右分栏，职责固定：

```txt
┌─────────────────────────────────────────────────────────────┐
│  顶栏：伴侣名 · 会话标题 · 返回列表 · 跳转长期记忆管理        │
├──────────────────────────┬──────────────────────────────────┤
│  左侧：调试工作台         │  右侧：对话模块                   │
│  （可滚动，占宽 ~50%）    │  （消息流 + 输入框，占宽 ~50%）    │
│                          │                                  │
│  - 本轮 run 选择器        │  - 历史消息（正序）               │
│  - 运行总览 / Trace       │  - pending / 失败状态             │
│  - Persona / scope        │  - 输入框 + 发送                  │
│  - Prompt Debug           │                                  │
│  - 记忆（本轮 recall/     │                                  │
│    extract/save 结果）    │                                  │
│  - 情绪 / 工具 / Observer │                                  │
│  - Memory DB health       │                                  │
│  - Summary 控件（可选）   │                                  │
└──────────────────────────┴──────────────────────────────────┘
```

原则：

```txt
- **左侧** = 当前会话相关的全部可观测信息与阶段状态（迁移自现有 ChatPanel 调试分组，不丢弃）
- **右侧** = 纯对话交互（消息列表 + 输入），不在右侧堆叠 Trace / Prompt / Observer
- 点击某条 assistant 消息时，左侧切换到对应 workflow_run（见 §5.5）
- 窄屏下左侧可收起到 Drawer / Sheet，但桌面端默认并排可见
```

**不在对话页内做长期记忆 CRUD。** 本轮 recall/extract/save 的**观测结果**仍在左侧「记忆」分组展示；对 `companion_memories` 表的增删改查须通过 §5.6 独立入口完成。

右侧消息流：

```txt
- 从 debug_messages 读取并按 created_at 正序显示
- 用户与 AI 消息有清晰角色区分
- 发送期间显示 pending 状态
- 发送失败时保留用户消息并显示失败提示
- 不伪造 assistant 回复
- 可点击 assistant 消息，联动左侧加载该轮 workflow_run
```

右侧输入框：

```txt
- Enter 发送，Shift + Enter 换行（或沿用当前 Ctrl/Cmd + Enter，二选一并保持一致）
- 请求期间禁用重复提交
- 请求完成后滚动到底部
```

会话列表仍只在 `/` 展示，不嵌入对话页分栏（避免三栏拥挤）。若后续需要，可在顶栏提供「会话切换」下拉，本阶段非必须。

### 5.5 调试工作台（左侧栏）

左侧栏是阶段 8 的核心可观测面，**优先迁移**现有 `chat-panel.tsx` 中的调试分组，而非重写。

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
- recalled memories（本轮 Workflow 结果，只读；含 score）
- extracted memories
- saved / skipped memories
- embedding vector length
- 链接至「长期记忆管理」页（§5.6），不在此分组内做 CRUD

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

### 5.6 长期记忆管理页（独立入口）

长期记忆的**增删改查**不与对话页混排，单独提供管理界面，便于调试「写入 / 召回 / 隔离」而不干扰聊天流。

**路由：** `/companions/[id]/memories`（从伴侣编辑页、对话页顶栏、会话列表项均可跳转）

**范围：** 仅操作 `companion_memories` 表中当前 `owner + companion` 下的记录；**不**经 `CompanionCore.executeWorkflow()`，由 `CompanionMemoryAdminRepository`（§4.8）读写。

**页面能力（最小集）：**

```txt
- 列表：type、content、importance、created_at、updated_at
- 按 type / importance 筛选（可选，至少支持按 companion 隔离列表）
- 新增：通过 CompanionMemoryAdminRepository.create（embed + INSERT）
- 编辑：content、type、importance（改 content 触发 re-embed，见 §4.8 规则）
- 删除：单条删除，二次确认
- 空状态与 DB 未连接时的明确提示
```

**`score` 不在此页展示。** `score` 是 recall 查询的相似度，仅出现在对话页左侧「本轮 recalled memories」调试结果中。

**与 Workflow 记忆的关系：**

```txt
- Workflow 的 memory.extract / memory.save 仍走 Core，结果可在对话页左侧「记忆」分组观测
- 本页 CRUD 用于人工补数、修正错误记忆、验证 recall 隔离，不替代 Workflow 自动抽取
- 删除会话（§4.7）仍不删除此处长期记忆；在本页删除单条记忆才移除对应 row
```

**API 建议（宿主侧，不经 Core）：**

```txt
GET    /api/companions/[id]/memories
POST   /api/companions/[id]/memories
PATCH  /api/companions/[id]/memories/[memoryId]
DELETE /api/companions/[id]/memories/[memoryId]
```

所有请求由服务端注入 `LOCAL_DEBUG_OWNER` 与 path 中的 `companionId` 作为 scope，禁止客户端传 owner。

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
{
  message: string;
}
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

### 6.5 长期记忆管理 API（经 CompanionMemoryAdminRepository，不经 Core）

```txt
GET    /api/companions/[id]/memories
POST   /api/companions/[id]/memories
PATCH  /api/companions/[id]/memories/[memoryId]
DELETE /api/companions/[id]/memories/[memoryId]
```

约束：

```txt
- Route Handler 只委托 CompanionMemoryAdminRepository（§4.8），不在 route 内拼 SQL / 调 embed
- scope 由服务端从 LOCAL_DEBUG_OWNER + path companionId 构造
- 响应不包含 embedding 原始向量；列表不含 score
- 与 Workflow memory.save 共用 companion_memories 表，保证 CRUD 后下一轮 recall 可观测
```

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
- messages 含 status / error_summary；workflow_runs 单向关联 user_message_id / assistant_message_id
- 建立 repository 或 store 层
- 实现 CompanionMemoryAdminRepository（§4.8）
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
- POST /messages：user message(pending) → workflow_run → Core → assistant(completed) / 失败回写
- 回写 conversation emotion、preview、updatedAt
- 服务端只读取 status=completed 的 messages 作为 history
- 注入持久化 Summary Provider
- 失败时 user message status=failed，不伪造 assistant message
```

完成标准：

```txt
- 刷新页面后可继续同一个会话
- emotion 在下一轮正确传入并在 UI 中恢复
- summary 启用后重启服务仍可恢复
- 历史 messages 不再由 ChatPanel 自己作为唯一来源维护
- 成功/失败写回分别通过事务 B / C 原子提交，刷新后无半完成态
```

人工验证：

```txt
连续发送多轮消息，刷新页面后继续聊天；
确认 history、emotion、summary 与新的 assistant 回复连续。
```

### 08-06：对话页左右分栏与调试工作台迁移

目标：实现「左调试 · 右对话」布局，迁移现有 ChatPanel 调试能力。

要做：

```txt
- 对话页左右分栏布局（§5.4）
- 右侧：消息流 + 输入框（纯对话）
- 左侧：迁移 chat-panel.tsx 调试分组（Trace / Prompt / 本轮记忆 / 情绪 / 工具 / Observer / Memory DB health）
- 每条 assistant message 关联 workflow run；点击消息切换左侧 run
- JSON 格式化、折叠、复制
- 当前 run 与历史 run 切换（从 workflow_runs 加载）
- ModelRuntimePanel 迁至 /debug/model-runtime
```

完成标准：

```txt
- 桌面端默认左调试、右对话并排可见
- 一轮成功、degraded、失败在左侧均能看到安全 trace
- 右侧不包含 Trace / Prompt 等调试堆叠
- 旧会话重新打开后左侧仍可查看历史 run
- 页面不展示 secrets 或连接串
```

人工验证：

```txt
分别触发：普通聊天、记忆写入与召回、get_current_time、search_memory、模型失败；
确认左侧有对应 WorkflowTrace / Observer，右侧仅显示对话消息。
```

### 08-07：长期记忆独立管理页

目标：在对话页之外提供 companion_memories 的增删改查。

要做：

```txt
- /companions/[id]/memories 页面与 §6.5 API
- 列表、新增、编辑、单条删除（二次确认）
- 顶栏从对话页 / 伴侣编辑页可跳转
- API 经 CompanionMemoryAdminRepository，不在 route 内复制 embed/SQL
```

完成标准：

```txt
- 手动新增一条记忆后，同 companion 新会话聊天可 recall 到
- 编辑/删除后列表与 DB 一致
- 不同 companion 的记忆列表互不可见
- 对话页左侧「记忆」分组仅展示本轮 Workflow 结果，不提供 CRUD 表单
```

人工验证：

```txt
在记忆管理页手动写入「测试偏好 A」→ 新建会话发送相关 prompt → 左侧看到 recalled；
删除该条记忆后再聊，确认不再 recall。
```

### 08-08：手工验收与文档收束

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

对应 §4.6 **事务 C**（一次 COMMIT）：

```txt
- user message：UPDATE status=failed，写入 error_summary（安全摘要）
- assistant message：不 INSERT；workflow_runs.assistant_message_id 保持 null
- workflow_runs：UPDATE status=failed、error_summary 与安全 trace / observer 快照
- conversation.updated_at：可在事务 C 内一并更新为最近尝试时间，但 preview 不应覆盖为错误文本
- 页面：显示本轮失败面板与可查看 trace；failed 的 user message 在右侧可见
```

### 9.2 宿主写回失败（事务 B 回滚）

例如模型已成功生成回复，但 **事务 B** 提交失败（任一步 SQL 错误导致整笔 ROLLBACK）：

```txt
- user message 保持 pending（事务 A 状态）；不得出现 assistant message
- workflow_runs.assistant_message_id 仍为 null；trace 快照未写入
- 不得声称该轮已完成
- 返回明确错误：模型生成成功，但会话持久化失败
- 可在当前响应当次临时展示生成文本，但必须显著提示刷新后可能丢失
- 不在事务外单独 PATCH 部分成功字段，避免半完成态
```

V1 不做消息队列、补偿任务或可恢复写回；这些属于后续基础设施阶段。

### 9.3 记忆/情绪/摘要降级

遵循 stage 7 既有语义；成功路径仍走 **事务 B**（一次 COMMIT）：

```txt
Memory.recall / Emotion.analyze / Summary.load 失败
→ Core 正常返回 degraded
→ 事务 B 写入 assistant message、workflow_runs（status=degraded）、user completed、conversation 更新
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
[ ] 对话页为左调试、右对话分栏；右侧仅消息与输入
[ ] 左侧展示 Trace / Prompt / 情绪 / 工具 / Observer 等阶段状态
[ ] 打开会话后可看到持久化历史消息
[ ] 刷新页面后可继续同一个会话
[ ] 不同 companion 的长期记忆不互相召回
[ ] 同 companion 的不同会话可召回共享长期记忆
[ ] 删除会话会删除该会话消息/摘要/run，但不会删除长期记忆
[ ] 长期记忆管理页可列表、新增、编辑、删除单条记忆
[ ] 手动写入的长期记忆可在聊天中被 recall
[ ] 发送一条普通消息可看到 WorkflowTrace
[ ] 触发记忆后可看到 extracted / saved / recalled memories（左侧，只读）
[ ] 触发工具后可看到 tool call / tool result
[ ] 情绪在刷新后仍能恢复并传入下一轮
[ ] Summary 启用后重启 dev server 仍可恢复
[ ] /debug/model-runtime 仍可独立验证阶段 1 模型运行时
[ ] 模型失败时 user message 为 failed，无 assistant message，workflow_run 仍可查看
[ ] 成功写回后刷新页面，assistant / user completed / workflow_run 关联一致，无 pending 残留
[ ] 长期记忆管理页列表不含 score；score 仅出现在对话页本轮 recall 结果
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
- 对话页左调试、右对话，阶段状态与聊天分离
- 可持久化短期消息、情绪和摘要
- 可复用 PostgreSQL + pgvector 长期记忆
- 可在独立页面管理长期记忆（增删改查）
- 可验证工具调用
- 可追踪 Workflow 生命周期
- 可回看每轮调试结果
- 仍保持 ai-core 为独立、纯粹、可替换的 SDK
```

它仍然不是正式用户产品；但它会成为后续接入用户、鉴权、前后台、商业化和正式 UI 时最可靠的 Core 验证环境。
