# AI Companion Core V1.2 - 阶段 2：AI SDK UI Demo 升级与项目文档收口实施文档

## 一、阶段目标

在不修改 `packages/ai-core`、不改变 V1.2 Stage 1 已完成 Web Search Tool 闭环的前提下，将 `apps/model-runtime-demo` 从手写 `fetch + ReadableStream + NDJSON + React state` 的聊天工作台，升级为基于 AI SDK UI 的可视化调试宿主。

本阶段必须保留并正确展示已有 Core 能力：

```txt
CompanionCore.streamWorkflow()
├── 流式文本
├── Tool Planning / Tool Execute
├── Web Search 来源
├── Workflow Trace
├── Runtime / Retry / Fallback
├── Persona / Prompt / Memory / Emotion / Summary
└── 完成后持久化 assistant message 与 workflow run
```

目标体验：

```txt
用户发送消息
↓
useChat 管理页面消息与流状态
↓
Conversation Route 仍负责创建 Core、调用 streamWorkflow
↓
宿主将 Core Event 映射为 AI SDK UIMessage Stream
↓
聊天区展示流式回答、搜索状态与来源卡
↓
Debug Drawer 展示 Workflow、Tool、Runtime、Prompt 与 Memory
↓
完成持久化后才结束正常消息流
```

本阶段交付：

1. AI SDK UI 的 `useChat`、`UIMessage`、`UIMessage Stream` 接入；
2. Core Event → UIMessage Stream 的宿主桥接；
3. 会话消息、Workflow Run 与搜索来源的恢复映射；
4. Web Search 顶栏开关、来源卡片、工具状态与 stop 语义；
5. 可折叠 Debug Drawer；
6. 文档、README、AGENTS、项目上下文与 V1.2 review 收口。

本阶段不做正式用户产品 UI、登录、鉴权、用户系统、服务端 AbortSignal 取消、断线续传、流恢复、MCP、LangChain、LangGraph、多 Agent。

---

## 二、前置输入与不可突破边界

### 2.1 Stage 1 已完成输入

本阶段必须直接复用以下 Stage 1 结果，不得复制、绕开或重造第二套协议：

```txt
packages/tool-web-search
├── WebSearchSource
├── WebSearchResponse
├── createWebSearchTool()
├── TavilyWebSearchClient
└── 稳定错误 metadata code

apps/model-runtime-demo
├── debug_conversations.web_search_enabled
├── GET/PATCH conversation API
├── assistant_message_id ↔ debug_messages.id
├── debug_workflow_runs.tool_snapshot_json
├── Web Search Runtime 状态
└── web_search 条件注册
```

来源恢复只能依赖：

```txt
assistant message
→ debug_workflow_runs.assistant_message_id
→ tool_snapshot_json
→ 成功 web_search 的 result.sources
→ WebSearchSource[]
```

禁止通过模型文本中的 `[1]`、`[2]` 或“当前对话最新 run”猜测来源归属。

### 2.2 Core 与宿主边界

```txt
packages/ai-core
├── 不依赖 ai / @ai-sdk/react
├── 不知道 UIMessage、useChat、Next.js、HTTP 或 React
├── 不读取环境变量
├── 不直连数据库
└── 继续输出 ChatWorkflowStreamEvent

apps/model-runtime-demo
├── 是 AI SDK UI 的宿主
├── 读取环境变量与会话配置
├── 创建 Model、Memory、Tool Registry、Web Search Adapter
├── 调用 CompanionCore.streamWorkflow()
├── 映射 Core Event → UIMessage Stream
├── 持久化 canonical message 与 workflow run
└── 渲染 UIMessage、来源卡与 Debug Drawer
```

`useChat` 仅负责当前页面的 UI 流状态；`debug_messages` 与 `debug_workflow_runs` 仍是持久化事实来源。

### 2.3 V1.2 stop 冻结语义

本阶段必须严格遵守：

```txt
useChat.stop()
→ 只停止浏览器继续消费 / 渲染当前消息流
→ UI 标记 stopped-locally
→ 服务端 Workflow 可能继续执行、写回与自然完成
→ 刷新或重新打开会话后，可能看到服务端后来完成的完整回复
```

禁止：

```txt
- 因浏览器 stop 将 run 标记为 aborted；
- 因浏览器 stop 将 assistant text 标记为 partial；
- 宣称模型、Web Search、Safety、Summary 或 Memory 已取消；
- 用前端是否消费完整流判断服务端 Workflow 成败。
```

---

## 三、依赖与目录结构

### 3.1 依赖

在 `apps/model-runtime-demo` 中新增与当前 AI SDK 主版本兼容的：

```txt
ai
@ai-sdk/react
```

约束：

```txt
- 不把 AI SDK UI 依赖加入 packages/ai-core；
- 不把 AI SDK UI 依赖加入 packages/tool-web-search；
- 先按仓库 lockfile / 现有依赖解析出兼容版本，再写入 package.json；
- 不为了 UI 接入升级 Next、React、Tailwind 或其他基础依赖；
- 若 AI SDK UI 当前版本要求额外 peer dependency，必须在本阶段文档与 README 记录原因。
```

### 3.2 建议目录

```txt
apps/model-runtime-demo/
├── app/
│   ├── api/conversations/[id]/messages/route.ts
│   ├── conversations/[id]/page.tsx
│   └── components/
│       ├── chat/
│       │   ├── chat-shell.tsx
│       │   ├── chat-message-list.tsx
│       │   ├── chat-message-bubble.tsx
│       │   ├── chat-composer.tsx
│       │   ├── chat-status.tsx
│       │   ├── source-card-list.tsx
│       │   └── web-search-toggle.tsx
│       └── debug/
│           ├── debug-drawer.tsx
│           ├── workflow-timeline.tsx
│           ├── runtime-panel.tsx
│           ├── tool-panel.tsx
│           ├── prompt-context-panel.tsx
│           └── memory-emotion-panel.tsx
├── app/lib/ai-sdk-ui/
│   ├── demo-ui-message.ts
│   ├── core-event-to-ui-message-stream.ts
│   ├── core-history-mapper.ts
│   ├── conversation-ui-message-mapper.ts
│   └── ui-message-stream-error.ts
├── app/lib/
│   ├── companion-runtime.ts
│   ├── debug-repository.ts
│   └── web-search-runtime.ts
├── scripts/
│   └── verify-ai-sdk-ui-bridge.mjs
└── README.md
```

可以按现有目录实际调整，但以下职责不可混淆：

```txt
Core Event Bridge
→ 只负责 Core Event 到 AI SDK UI 协议的转换

History Mapper
→ 只负责 canonical debug_messages 与已完成 workflow run 转 UIMessage

Route
→ 组装 runtime、消费 workflow、持久化、创建 response

UI Component
→ 只负责 UIMessage 的可视化，不直接调用 Core 或数据库
```

---

## 四、AI SDK UI Message 契约

### 4.1 Demo UIMessage 类型

定义 Demo 专属消息类型，禁止直接把未知 raw 数据塞入 UIMessage：

```ts
import type { UIMessage } from "ai";

export interface DemoMessageMetadata {
  conversationId?: string;
  workflowRunId?: string;
  persisted?: boolean;
  clientStreamState?: "streaming" | "stopped-locally" | "completed-client-side";
}

export interface DemoWorkflowData {
  status: "started" | "running" | "completed" | "failed";
  step?: string;
  summary?: string;
  reason?: string;
}

export interface DemoToolData {
  name: string;
  status: "running" | "completed" | "failed";
  ok?: boolean;
  query?: string;
  code?: string;
}

export interface DemoWebSearchData {
  status: "requested" | "completed" | "no-results" | "failed";
  query?: string;
  provider?: string;
  sourceCount?: number;
  code?: string;
}

export interface DemoRuntimeData {
  provider?: string;
  model?: string;
  fallbackUsed?: boolean;
  durationMs?: number;
  attempts?: number;
}

export type DemoChatMessage = UIMessage<
  DemoMessageMetadata,
  {
    workflow: DemoWorkflowData;
    tool: DemoToolData;
    webSearch: DemoWebSearchData;
    runtime: DemoRuntimeData;
  }
>;
```

实现时以当前 AI SDK UI 的真实泛型签名为准；如果官方版本字段命名不同，必须保留上述语义并在 review 中说明适配差异。

### 4.2 Parts 的职责

```txt
text part
→ 用户与伴侣可见文本

source part
→ WebSearchSource 的安全映射，仅用于来源卡与可点击外链

transient data-workflow
→ 当前步骤、加载状态、失败提示；不进入 Core history，不作为会话持久化真相

data-tool / data-webSearch
→ 本轮精简工具摘要；不得包含 provider raw response、网页全文、stack 或密钥

data-runtime
→ 最终模型、fallback、耗时、尝试次数等安全运行信息
```

禁止：

```txt
- 把 ChatWorkflowOutput.raw 写入 UIMessage；
- 把 Error.stack、API Key、Provider 原始响应写入 UIMessage；
- 把完整 ToolResult、完整 trace 或数据库行原样写入 source / data part；
- 将 source / tool / runtime / workflow data part 回传给 ai-core 作为 ChatMessage history。
```

---

## 五、Core Event → UIMessage Stream Bridge

### 5.1 Route 主链路

`POST /api/conversations/[id]/messages` 成为聊天页 `useChat` 的唯一主通道。

旧 `POST /api/chat` 可以保留为 legacy 非流式调试入口，但：

```txt
- 不作为会话页主聊天路径；
- 不承载 AI SDK UIMessage Stream；
- README 明确标注为 legacy；
- 新功能不得优先加到 legacy route。
```

Route 执行顺序：

```txt
1. 校验 route params、请求 body 与 message；
2. 读取 conversation、companion、历史消息、webSearchEnabled；
3. 根据持久化 conversation 配置创建 runtime 与 Tool Registry；
4. 创建 CompanionCore；
5. 将 Core history 输入仅映射为 user / assistant 文本 ChatMessage；
6. 调用 core.streamWorkflow(input)；
7. 消费 ChatWorkflowStreamEvent；
8. 使用 createUIMessageStream / createUIMessageStreamResponse 输出 UI 协议；
9. workflow:finish 后以原子语义完成 assistant message 与 workflow run 持久化；
10. 仅持久化成功后结束正常 UIMessage Stream。
```

### 5.2 事件映射

```txt
workflow:start
→ transient data-workflow { status: "started" }

step:start / step:end
→ transient data-workflow { status: "running", step, summary? }

text:delta
→ UIMessage 文本开始 / 增量 / 结束事件

tool:call
→ transient data-tool { name, status: "running", query? }

tool:result(web_search success)
→ data-webSearch { status: "completed", query, provider, sourceCount }
→ 每个标准 WebSearchSource 对应一个 source part

tool:result(web_search no-result)
→ data-webSearch { status: "no-results", query, sourceCount: 0 }

tool:result(web_search failed)
→ data-webSearch { status: "failed", query, code }

tool:result(other)
→ data-tool { name, status: "completed" | "failed", ok, code? }

workflow:finish
→ 原子持久化 assistant message + workflow run
→ data-runtime
→ transient data-workflow { status: "completed" }
→ 关闭正常 UIMessage Stream

workflow:error
→ 安全 UI 错误事件
→ transient data-workflow { status: "failed", reason }
```

`tool:result(web_search)` 的来源必须来自 Stage 1 已标准化的 `WebSearchSource[]`。不得解析模型回答中的引用编号，也不得从 provider raw response 构造 URL。

### 5.3 错误与持久化

错误 UI 只允许展示安全摘要：

```txt
模型暂时无法完成本轮回复。
搜索服务暂时无法取得可靠结果。
本轮回复已生成，但保存失败；刷新后可能无法恢复。
```

持久化顺序必须匹配 V1.2 主计划：

```txt
1. Workflow 得到 assistant text、Tool Result、Runtime、Trace；
2. 创建 canonical assistant debug_message；
3. 创建或更新 debug_workflow_run；
4. run.assistant_message_id 指向该 assistant message；
5. 提交事务；
6. 成功后才发送 UIMessage 正常完成语义。
```

若持久化失败：

```txt
- 不发送伪成功的 completed UI 状态；
- 输出安全的 persistence-failed 错误；
- 不破坏既有 workflow error / trace 记录；
- 不把未提交的来源视为刷新后可恢复数据。
```

---

## 六、Conversation Store、历史恢复与来源恢复

### 6.1 双层状态边界

```txt
DebugRepository / 数据库
→ conversation、canonical messages、workflow run 的事实来源

useChat.messages
→ 当前页面渲染状态

Conversation UI Mapper
→ 从 canonical messages + 关联 workflow run 构造初始 DemoChatMessage[]

Core History Mapper
→ 仅从 user / assistant text parts 构造 Core ChatMessage[]
```

禁止用浏览器内 `useChat.messages` 作为刷新后恢复的唯一来源。

### 6.2 页面加载恢复

恢复顺序：

```txt
1. 查询 conversation 与 canonical debug_messages；
2. 收集所有 assistant message ids；
3. 批量查询对应 debug_workflow_runs；
4. 从 tool_snapshot_json 取出成功 web_search 的标准化 result.sources；
5. 为对应 assistant message 补 source parts、data-webSearch、data-runtime；
6. 映射为 DemoChatMessage[] 交给 useChat 初始状态或等价 UI state；
7. 每条 assistant message 只展示自身 run 的来源卡。
```

必须覆盖连续两轮搜索：

```txt
assistant A
→ run A
→ sources A

assistant B
→ run B
→ sources B
```

不得串轮、覆盖或按“最近一次搜索”展示。

### 6.3 Web Search 开关

顶栏展示并编辑对话级 `webSearchEnabled`：

```txt
开启
→ PATCH /api/conversations/[id] { webSearchEnabled: true }
→ 服务端持久化成功后更新 UI

关闭
→ PATCH /api/conversations/[id] { webSearchEnabled: false }
→ 后续消息不注册 web_search
```

发送消息时不得把临时开关值当作可信配置；Route 必须再次读取数据库中当前对话的持久化值。

顶栏至少展示：

```txt
enabled
user_disabled
infra_unavailable
model_unsupported
```

区分：

```txt
用户不允许搜索
≠ 基础设施不可用
≠ 当前实际模型不支持 Tool Calling
≠ 本轮模型未选择搜索
```

---

## 七、聊天 UI 与 Debug Drawer

### 7.1 信息架构

```txt
┌──────────────────────────────────────────────────────────────┐
│ 顶栏：Companion / Model / Web Search 开关与可用状态           │
├───────────────────────────────┬──────────────────────────────┤
│ 主聊天区                       │ 可折叠 Debug Drawer          │
│ ├─ Persona 摘要                │ ├─ Workflow Timeline         │
│ ├─ UIMessage 消息气泡          │ ├─ Runtime / Retry/Fallback  │
│ ├─ 搜索中状态                  │ ├─ Tool / Search Query       │
│ ├─ 来源卡片                    │ ├─ Prompt / Context          │
│ └─ 输入框 / 发送 / Stop        │ └─ Memory / Emotion/Summary  │
└───────────────────────────────┴──────────────────────────────┘
```

### 7.2 聊天主区最低交互

```txt
- user 与 assistant 消息视觉明确区分；
- assistant 文本增量出现，不等全部完成后再显示；
- submitted / streaming / ready / stopped-locally 状态明确；
- 搜索中显示“正在搜索：<query>”；
- 搜索完成显示来源数量；
- 无结果、工具失败、模型失败、持久化失败均有可理解提示；
- 输入框在 streaming 时提供 stop；
- stop 后可继续发送下一条消息；
- Persona 与模型配置保留，但不挤占聊天主区。
```

### 7.3 来源卡

每个来源卡最少展示：

```txt
[编号]
标题
域名或安全 URL
snippet
发布时间（存在时）
新标签页打开链接
```

约束：

```txt
- URL 只来自 WebSearchSource.url；
- 外链使用安全新标签策略；
- source order 与模型引用编号一致；
- 多次搜索按 Tool Call / query 分组；
- 来源卡仅展示当前 assistant message 自己关联 run 的来源；
- 不显示 provider raw response、网页全文或隐藏指令。
```

### 7.4 Debug Drawer

Debug Drawer 默认可折叠，但不得删除既有调试价值。

最低保留：

```txt
Workflow Timeline
→ 当前步骤、开始/结束、失败摘要

Runtime
→ provider、最终模型、fallback、尝试次数、耗时

Tools
→ 已注册工具、tool call、query、结果状态、web search 来源数

Prompt / Context
→ Effective Persona、Persona Prompt、system prompt、summary、memory、recent history

Memory / Emotion / Summary
→ 本轮召回、情绪前后、摘要状态、写回结果

Persistence
→ run id、assistant message id、persisted / persistence-failed
```

Debug Drawer 可使用 data parts 的安全摘要和已持久化 run snapshot；不得要求 UI 重放 Core raw event。

---

## 八、验证脚本与人工验收

### 8.1 新增验证脚本

新增：

```txt
apps/model-runtime-demo/scripts/verify-ai-sdk-ui-bridge.mjs
```

至少验证：

```txt
1. text:delta 映射为有效 UIMessage 文本事件；
2. workflow:start / step / finish 映射为安全 data events；
3. web_search 成功结果映射 source parts 与 data-webSearch；
4. 非 web_search 工具不被错误映射为来源；
5. Core raw / Date / Error 不进入 UI wire payload；
6. workflow:error 映射为安全错误，不泄露 stack；
7. 同一 assistant message 与对应 workflow run 的来源恢复关系正确；
8. 不存在 assistant_message_id 时不猜测来源；
9. stopped-locally 只影响客户端状态，不伪造服务端 aborted；
10. Core history mapper 仅输出 user / assistant text。
```

若 AI SDK UI 的真实 stream writer API 与计划示例不同，验证脚本必须覆盖最终采用的真实协议，而不是只测试自定义 mock。

### 8.2 建议命令

```bash
pnpm --filter @ying-companion/model-runtime-demo typecheck
pnpm --filter @ying-companion/model-runtime-demo lint
pnpm --filter @ying-companion/model-runtime-demo build
pnpm --filter @ying-companion/model-runtime-demo verify:stream-contract
pnpm --filter @ying-companion/model-runtime-demo verify:ai-sdk-ui-bridge
pnpm --filter @ying-companion/model-runtime-demo verify:web-search-contract
pnpm --filter @ying-companion/tool-web-search typecheck
pnpm --filter @ying-companion/tool-web-search lint
```

### 8.3 人工验收

```txt
A. 普通陪伴聊天
前置：web search 关闭。
预期：useChat 流式文本正常；无来源卡；Debug Drawer 仍显示完整 Workflow 信息。

B. 实时 Web Search
前置：有效 Tavily key、对话开关开启、模型支持 Tool Calling。
输入：查询近期或需核实的公开信息。
预期：显示搜索状态、来源卡、流式最终回答；刷新后文本与来源均正确恢复。

C. 同一会话两轮不同搜索
预期：两条 assistant message 各自绑定不同 workflow run；来源不串轮；刷新后仍正确归属。

D. 用户关闭搜索
预期：顶栏显示 user_disabled；Planner 不可见 web_search；不发 Tavily 请求；不显示来源卡。

E. 基础设施不可用
前置：移除 key 或 WEB_SEARCH_ENABLED=false。
预期：顶栏显示 infra_unavailable；不注册 Tool；聊天 UI 不崩溃。

F. 模型不支持 Tool Calling
前置：使用 toolCalling=false 的实际模型档案。
预期：显示 model_unsupported；不注册 web_search；最终回答不伪造搜索结果。

G. 搜索无结果 / Provider 失败
预期：显示 no-results 或安全失败摘要；来源卡不伪造；最终回答坦诚未取得可靠资料。

H. stop
预期：点击 stop 后显示 stopped-locally；不声称服务端取消；服务端若自然完成，刷新后可看到完整回复与来源；后续可继续聊天。

I. 持久化失败
预期：UI 显示 persistence-failed；不显示伪完成；刷新后不假定可恢复来源。
```

---

## 九、实施顺序

### 子任务 01：依赖、类型与桥接骨架

1. 安装 `ai`、`@ai-sdk/react`；
2. 新建 `app/lib/ai-sdk-ui/`；
3. 定义 `DemoChatMessage`、安全 data 类型与 source 映射类型；
4. 建立 Core history mapper、conversation UI mapper 与 bridge 的空实现；
5. 新增桥接验证脚本骨架。

完成标准：

```txt
- Demo 可编译；
- ai-core 不新增 AI SDK UI 依赖；
- Demo UIMessage 类型只允许安全数据；
- 现有 NDJSON 契约未被静默删除或破坏。
```

### 子任务 02：Conversation Route 迁移与 UIMessage Stream

1. 将会话页主聊天请求切换为 `useChat`；
2. 将 `/api/conversations/[id]/messages` 改为输出 AI SDK UIMessage Stream；
3. 在 Route 中消费 `core.streamWorkflow()`；
4. 完成 Event Bridge；
5. 在 `workflow:finish` 后完成原子持久化；
6. 将安全 runtime、tool 与 workflow 事件写入 UIMessage stream；
7. 保留 legacy `/api/chat`，但明确其非主链路地位。

完成标准：

```txt
- 普通聊天可在 useChat 中逐字显示；
- workflow finish 前不发送伪成功；
- 错误不泄露 raw / stack；
- text、tool、runtime、workflow 事件都可在浏览器端消费。
```

### 子任务 03：消息恢复、来源恢复与搜索开关

1. 完成 conversation → initial UIMessage mapper；
2. 从 `assistant_message_id` 批量恢复对应 run；
3. 从安全 tool snapshot 恢复每条 assistant 的来源卡；
4. 接入顶部 `webSearchEnabled` 开关与 PATCH API；
5. 显示 enabled / user_disabled / infra_unavailable / model_unsupported。

完成标准：

```txt
- 刷新后文本、来源、runtime 摘要可恢复；
- 连续两轮搜索来源不串轮；
- 关闭搜索后后续发送不注册 Tool；
- 不依赖模型引用编号推断来源。
```

### 子任务 04：聊天 UI 与 Debug Drawer 重构

1. 重构会话页为聊天主区 + 可折叠 Debug Drawer；
2. 实现消息气泡、Composer、发送/stop、状态提示；
3. 实现工具状态、Web Search 状态与来源卡；
4. 将现有 Prompt、Persona、Memory、Emotion、Summary、Runtime、Trace 面板搬入 Drawer；
5. 保留模型与 Persona 配置入口。

完成标准：

```txt
- 主要聊天体验不再依赖大面积 JSON / console 样式输出；
- 调试信息仍完整可查看；
- 搜索与普通聊天场景均清晰；
- 停止、失败、降级、持久化失败均有正确提示。
```

### 子任务 05：文档与 Review 收口

同步更新：

```txt
AGENTS.md
README.md
.requirements/README.md
apps/model-runtime-demo/README.md
packages/tool-web-search/README.md
packages/ai-core/README.md（仅在公开边界说明确有变化时）
docs/ai/core/project-context.md
docs/ai/core/tool-system.md（不存在则新增）
docs/ai/core/web-search.md（不存在则新增）
docs/ai/core/streaming-and-ui-bridge.md（不存在则新增）
.requirements/stages/v1.2/stage-02/
.code-reviews/v1.2/
```

必须说明：

```txt
- V1.2 Web Search 的架构位置、Provider 替换方式与环境变量；
- 对话级 webSearchEnabled 双层门控；
- Web Search 与长期 Memory 的隔离；
- Core Event / Wire Event / UIMessage Stream 三层边界；
- canonical Conversation Store 与 useChat UI state 的职责分界；
- assistant message ↔ workflow run ↔ sources 的恢复关系；
- stopped-locally 语义；
- 本地验证命令与人工验收路径；
- legacy /api/chat 的状态与限制。
```

完成标准：

```txt
- 文档描述与实际代码、实际命令、实际路由一致；
- 不再把 Demo 描述为仅 NDJSON 手写前端；
- 不夸大为正式产品 UI、服务端取消或完整断线恢复；
- V1.2 review 能追溯 Stage 1 与 Stage 2 的验证证据。
```

---

## 十、阶段完成清单

```txt
AI SDK UI
[ ] ai 与 @ai-sdk/react 仅安装在 Demo 宿主
[ ] useChat 成为会话页主聊天状态管理
[ ] /api/conversations/[id]/messages 输出 UIMessage Stream
[ ] Core Event → UIMessage Stream Bridge 明确、可验证
[ ] Core raw / Error / Date 不直接进入浏览器

聊天与 Web Search
[ ] 流式文本正常显示
[ ] 搜索状态与 Tool 状态正确展示
[ ] WebSearchSource 映射为来源卡
[ ] 对话级开关与持久化 API 同步
[ ] 连续搜索来源不串轮
[ ] 普通聊天不展示来源卡

持久化与 stop
[ ] assistant message ↔ workflow run 原子关联
[ ] 刷新后消息与来源正确恢复
[ ] stop 只标记 stopped-locally
[ ] 持久化失败不伪装成功

Debug 与质量
[ ] Debug Drawer 保留 Prompt / Memory / Emotion / Summary / Tool / Trace / Runtime
[ ] typecheck / lint / build 通过
[ ] verify:stream-contract 通过
[ ] verify:web-search-contract 通过
[ ] verify:ai-sdk-ui-bridge 通过
[ ] 人工验收覆盖普通聊天、搜索、两轮搜索、关闭、不可用、失败、stop、持久化失败

文档
[ ] AGENTS / README / package README / docs / stage / review 同步
[ ] 文档与实际路由、环境变量、命令、边界一致
```
