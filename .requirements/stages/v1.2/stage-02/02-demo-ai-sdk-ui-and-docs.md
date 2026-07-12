# AI Companion Core V1.2 - 阶段 2：Demo AI SDK UI 与文档收口

## 一、阶段目标

在阶段 1 已完成 Web Search Tool、Tavily Adapter、Tool Planning 接入、Wire Event 与 Web Search Debug Log 的基础上，升级 `apps/model-runtime-demo` 的主聊天体验，并将仓库文档同步到实际代码。

本阶段只处理以下三件事：

```txt
1. 使用 AI SDK UI 的 useChat 管理 Demo 主聊天消息与请求状态。
2. 保留现有 NDJSON 后端协议，通过 Custom Transport / Adapter 转换为 UIMessage。
3. 展示搜索过程、Sources、失败状态，并按最终实现校准文档。
```

完成后的主路径应为：

```txt
用户输入
↓
useChat.sendMessage()
↓
DemoChatTransport
↓
POST /api/conversations/[id]/messages
↓
V1.1 NDJSON Wire Event Stream
↓
chat-stream-ui-adapter.ts
├── UIMessage / message.parts → ConversationWorkspace
└── 原始 Wire Events → RunDebugPanel
↓
聊天文本、搜索状态、Sources、错误状态分别展示
```

本阶段不得重新实现阶段 1，不得修改 Web Search Tool、Tavily 检索策略或 `packages/ai-core` 的工作流协议。

---

## 二、唯一实施基线

本阶段只以当前 `prod` 代码和已完成的阶段 1 为依据。

当前真实状态：

```txt
apps/model-runtime-demo/app/conversation-workspace.tsx
├── 手写 messages / input / isSending / turnStatus 状态
├── 手写 fetch POST
├── 使用 parseNdjsonWireEvents() 消费 NDJSON
├── 手工聚合 text:delta
├── 手工处理 workflow:finish / workflow:error
├── 保存 streamEvents[]
└── 渲染简单 message bubble、模型配置与 composer

apps/model-runtime-demo/app/run-debug-panel.tsx
├── 独立消费 streamEvents[]
├── 展示 Workflow Stream Timeline
├── 展示持久化 Trace、Prompt、Memory、Emotion、Tool
└── 已展示 Web Search Log

apps/model-runtime-demo/app/lib/chat-stream-wire.ts
├── 保持 Core Event → JSON-safe Wire Event 映射
├── 已包含 tool:call / tool:result
├── 已包含 workflow:finish / workflow:error
└── 不包含 AI SDK UI 类型

apps/model-runtime-demo/package.json
└── 尚未安装 ai / @ai-sdk/react
```

阶段 1 已提供并视为稳定输入：

```txt
- web_search ToolResult
- WebSearchResult / WebSearchSource
- ToolResult → Host Web Search Metadata 的派生能力
- Web Search availability 状态
- tool:call / tool:result / workflow:* Wire Event
- RunDebugPanel Web Search Log
- 搜索关闭、不可用、成功、失败与空结果语义
```

---

## 三、阶段边界

### 3.1 必须保持

```txt
- packages/ai-core 不依赖 ai、@ai-sdk/react 或任何 UIMessage 类型。
- packages/ai-core 不读取浏览器状态或环境变量。
- 后端继续输出 application/x-ndjson。
- Core Event 与 Wire Event 的分层保持不变。
- ConversationWorkspace 使用 useChat 管理主聊天状态。
- RunDebugPanel 继续独立维护完整 streamEvents[]。
- Sources 只来自结构化 ToolResult / Host Metadata。
- Host 不回写或修改 Core ChatWorkflowOutput 的语义。
- Web Search 结果不写入长期 Memory。
```

### 3.2 明确不做

```txt
- 不将后端改为 streamText() + toUIMessageStreamResponse()。
- 不让 AI SDK UI 接管 Companion Core 工作流。
- 不修改阶段 1 的 Tavily Search 策略。
- 不实现多轮流式 Tool Loop。
- 不实现断线续传、流恢复或 reconnect。
- 不实现搜索历史、来源收藏或来源持久化。
- 不实现完整商业化聊天产品。
- 不实现账号系统、权限、计费或部署。
- 不为 Legacy /api/chat + chat-panel.tsx 做完整双轨重写。
- 不在缺少真实 abort 语义时伪造 Stop。
- 不在缺少明确重跑语义时直接暴露 Regenerate。
```

---

## 四、阶段完成标准

完成本阶段后，必须满足：

```txt
- apps/model-runtime-demo 安装并使用 ai 与 @ai-sdk/react。
- ConversationWorkspace 的主消息状态由 useChat 管理。
- 使用自定义 Chat Transport 调用现有 conversation messages API。
- 现有 POST body 仍能传 message、modelConfig、apiKeyOverride。
- 后端 NDJSON 格式不变。
- text:delta 被转换为 assistant text part，并保持增量更新。
- tool:call / tool:result 可驱动“规划工具 / 正在搜索 / 搜索完成 / 搜索失败”状态。
- workflow:finish 完成当前 assistant message，并校验最终文本一致性。
- workflow:error 正确区分 error、partial_failed、output_safety_rejected、persistence_failed。
- 原始 Wire Events 继续完整送入 RunDebugPanel。
- 成功搜索后展示 Sources；未搜索、失败或空结果时不展示伪造来源。
- Web Search 不可用原因在 Chat Surface 可见。
- 刷新后仍以数据库持久化消息为准，不将 UIMessage 当数据库事实源。
- typecheck、lint、build 和新增确定性验证全部通过。
- README 与 docs 只描述最终实际实现。
```

---

## 五、建议目录与职责

文件名可按现有仓库规范微调，但职责不得混合。

```txt
apps/model-runtime-demo/
├── app/
│   ├── conversation-workspace.tsx
│   ├── run-debug-panel.tsx
│   ├── components/
│   │   ├── conversation-chat-surface.tsx
│   │   ├── conversation-message.tsx
│   │   ├── conversation-composer.tsx
│   │   ├── chat-turn-status.tsx
│   │   ├── web-search-tool-status.tsx
│   │   └── web-search-sources.tsx
│   └── lib/
│       ├── chat-stream-ui-adapter.ts
│       ├── demo-chat-transport.ts
│       ├── demo-ui-message.ts
│       ├── chat-turn-state.ts
│       ├── web-search-ui-metadata.ts
│       ├── chat-stream-transport.ts       # 现有 NDJSON parser，继续复用
│       ├── chat-stream-wire.ts            # Wire 契约保持稳定
│       ├── web-search-availability.ts     # 继续复用
│       └── web-search-debug-log.ts        # 继续供 Debug Panel 使用
├── scripts/
│   └── verify-chat-ui-adapter.mjs
├── package.json
└── README.md
```

职责：

```txt
conversation-workspace.tsx
→ 编排 useChat、模型配置、持久化刷新、RunDebugPanel 与 Chat Surface。

DemoChatTransport
→ 将 useChat 请求转换为现有 conversation messages API 请求；读取 NDJSON 响应。

chat-stream-ui-adapter.ts
→ 将 Wire Event 转换为 UIMessage chunk / UI 状态；同时旁路输出原始 Wire Event。

ConversationChatSurface
→ 只负责聊天消息、状态、Sources 与 composer 的表现。

RunDebugPanel
→ 继续负责完整调试，不依赖 AI SDK UI message parts 才能工作。
```

避免把所有状态、解析、视图和数据刷新继续堆在 `conversation-workspace.tsx`。

---

## 六、依赖与版本约束

在 `apps/model-runtime-demo/package.json` 增加：

```json
{
  "dependencies": {
    "ai": "与当前 AI SDK UI 主版本兼容的稳定版本",
    "@ai-sdk/react": "与 ai 完全同代的稳定版本"
  }
}
```

约束：

```txt
- ai 与 @ai-sdk/react 必须使用同一主版本。
- 实施时以实际安装版本导出的 ChatTransport / UIMessage API 为准。
- 不复制过时示例中的旧 useChat input API。
- 使用 message.parts 渲染消息，不依赖废弃的 message.content。
- 不引入 AI SDK Provider；模型调用仍由 Companion Core Model Adapter 完成。
```

安装后必须锁定 `pnpm-lock.yaml`。

---

## 七、UIMessage 数据模型

### 7.1 Demo 专用 UIMessage

在 Demo Host 定义 UIMessage 泛型，不向 Core 泄漏：

```ts
import type { UIMessage } from "ai";

export interface DemoMessageMetadata {
  workflowId?: string;
  model?: string;
  persistedMessageId?: string;
  runId?: string;
  turnStatus?: DemoTurnStatus;
  webSearch?: DemoWorkflowWebSearchMetadata;
  error?: DemoChatErrorMetadata;
}

export interface DemoDataParts {
  "workflow-status": DemoWorkflowStatusPart;
  "web-search-status": DemoWebSearchStatusPart;
  "web-search-sources": DemoWorkflowWebSearchMetadata;
  "workflow-error": DemoChatErrorMetadata;
}

export type DemoUIMessage = UIMessage<DemoMessageMetadata, DemoDataParts>;
```

如果实际安装版本的泛型声明不同，应按该版本调整，但必须保留以下逻辑边界：

```txt
metadata
→ 当前 message 的稳定结果信息。

data parts
→ 流式过程中的工作流、工具、来源和错误事件。

text parts
→ 仅承载面向用户的 assistant 文本。

streamEvents[]
→ 完整原始 Wire Event，仅供 Debug Workbench。
```

### 7.2 初始持久化消息转换

当前数据库消息为 `DebugMessage[]`。新增纯函数：

```ts
mapPersistedMessagesToUI(initialDetail.messages): DemoUIMessage[]
```

映射要求：

```txt
- role=user / assistant 保持一致。
- content → 单一 text part。
- id 使用持久化 message id。
- status / errorSummary / model 写入 Demo metadata。
- 不从历史 message content 推断 Sources。
- 历史 Sources 只有在持久化 run / toolSnapshot 中可可靠恢复时才展示；否则 V1.2 仅保证本轮 Sources。
```

最后一条必须明确：V1.2 不新增 Sources 数据库表，不承诺刷新后永久恢复来源卡片。

---

## 八、Custom Transport

### 8.1 固定选择

主聊天必须采用：

```txt
useChat({ transport: new DemoChatTransport(...) })
```

不得仅使用 AI SDK UI 组件，却继续手写主消息流状态。

### 8.2 Transport 输入

`DemoChatTransport` 必须拥有本轮宿主配置读取能力：

```ts
interface DemoChatTransportContext {
  conversationId: string;
  getModelConfig(): DebugModelConfig;
  getApiKeyOverride(): string;
  onWireEvent(event: ChatWorkflowStreamWireEvent): void;
  onWorkflowTerminal(event: WorkflowTerminalWireEvent): void | Promise<void>;
}
```

发送请求仍使用现有后端契约：

```json
{
  "message": "用户最后一条文本",
  "modelConfig": {},
  "apiKeyOverride": "可选"
}
```

约束：

```txt
- 不将全部 UIMessage 历史提交给后端；当前后端已由 conversationId 加载持久化历史。
- 只提取本次 sendMessage 新增的用户文本。
- apiKeyOverride 为空时不得出现在 body。
- 请求头继续使用 Content-Type: application/json。
- Accept 继续使用 application/x-ndjson。
- HTTP 非 2xx、空 response.body 或非法 NDJSON 必须转成可控错误。
```

### 8.3 Transport 输出

Transport 读取 `parseNdjsonWireEvents(response.body)`，每个事件同时进入两个方向：

```txt
方向 A：chat-stream-ui-adapter
→ 生成 useChat 可消费的 UIMessage 增量。

方向 B：onWireEvent
→ append 到 ConversationWorkspace.streamEvents[]。
→ RunDebugPanel 继续获得完整事件。
```

禁止先转换成 UIMessage 后再反推 Debug Event。

---

## 九、Wire Event → AI SDK UI 映射

`chat-stream-ui-adapter.ts` 必须是纯映射层，不直接操作 React state。

### 9.1 workflow:start

```txt
输入：workflow:start
输出：
- 记录 workflowId
- 推送 data-workflow-status: preparing / submitted
- 不创建额外可见 assistant 文本
```

### 9.2 step:start / step:end

```txt
输入：ToolPlanning step:start
输出：planning_tool

输入：ToolExecute step:start，且已看到 web_search tool:call
输出：searching

输入：step:end degraded
输出：记录 degraded 标记，但不提前结束 assistant message

其他 step
输出：只供 Debug State；不向用户展示内部步骤名
```

UI 不应向普通聊天用户暴露所有内部 Workflow Step。

### 9.3 text:delta

```txt
输入：text:delta
输出：assistant text part 增量
```

必须：

```txt
- 按事件顺序追加。
- 保留 event.model 到 message metadata。
- 维护 adapter 内部 aggregatedText。
- 不在 React 组件中再次自行拼接另一份答案。
```

### 9.4 tool:call

当 `call.name === "web_search"`：

```txt
- 保存 Planner query / arguments。
- 推送 web-search-status: searching。
- Chat Surface 显示简洁“正在搜索 Web…”状态。
- 原始 arguments 继续只在 Debug Panel 展示。
```

其他工具：

```txt
- 可映射为通用 tool status data part。
- V1.2 不要求为所有 Tool 设计专属卡片。
```

### 9.5 tool:result

当 `result.name === "web_search" && result.ok !== false`：

```txt
- 使用阶段 1 已提供的安全解析函数提取 Web Search Metadata。
- sources.length > 0 → web-search-status: completed。
- sources.length === 0 → web-search-status: empty。
- 推送 web-search-sources data part。
- 不直接结束 assistant message，继续等待最终回复。
```

当 `result.name === "web_search" && result.ok === false`：

```txt
- web-search-status: failed。
- 保存安全错误摘要。
- 不创建 Sources。
- 允许后续最终模型给出普通或降级回答。
```

禁止：

```txt
- 从模型自然语言解析 URL。
- 将 Tavily 原始响应塞入 UIMessage。
- 在 UI Adapter 重新实现阶段 1 的 Search DTO normalize。
```

### 9.6 workflow:finish

必须执行：

```txt
1. 校验 aggregatedText === event.output.text。
2. 不一致时抛出 protocol_error，不显示 success。
3. 从 event.output / toolResults 或已收集 ToolResult 派生最终 Host Metadata。
4. 完成当前 assistant message。
5. 根据 trace 设置 success 或 degraded。
6. 调用宿主回调刷新 conversation、runs 与 selectedRun。
```

不得为了附加 Sources 修改 `event.output.metadata`。

### 9.7 workflow:error

映射规则：

```txt
output_safety_rejected
→ output_safety_rejected
→ 明确显示“输出未通过安全审计”

workflow_failed + reason=persistence_failed
→ persistence_failed
→ 文本可能已生成，但刷新后可能丢失

已收到 text:delta 后发生其他 error
→ partial_failed
→ 保留已输出文本并标记未成功完成

未收到 text:delta
→ failed
```

不得把已经产生部分文本的异常回合显示为 success。

---

## 十、聊天状态模型

AI SDK `useChat.status` 只表示请求生命周期，不能完全替代 Companion Workflow 状态。

定义 Demo 状态：

```ts
export type DemoTurnStatus =
  | "idle"
  | "submitted"
  | "planning_tool"
  | "searching"
  | "streaming"
  | "success"
  | "degraded"
  | "partial_failed"
  | "output_safety_rejected"
  | "persistence_failed"
  | "tool_failed"
  | "failed";
```

映射原则：

```txt
useChat.status=submitted
→ submitted

ToolPlanning start
→ planning_tool

web_search tool:call
→ searching

首次 text:delta
→ streaming

workflow:finish + trace normal
→ success

workflow:finish + trace degraded
→ degraded

workflow:error
→ 按第九节映射
```

Chat Surface 展示面向用户的简短状态，RunDebugPanel 展示精确 Wire Event。

---

## 十一、ConversationWorkspace 重构

### 11.1 保留职责

`ConversationWorkspace` 继续持有：

```txt
- conversationId 与初始持久化消息
- runs / selectedRun
- memory health
- modelConfig
- apiKeyOverride
- Web Search availability
- streamEvents[]
- refreshConversationState / refreshRunsOnly / selectRun
```

### 11.2 移交给 useChat

移除或停止自行维护：

```txt
- 主 messages useState
- 手写 optimistic user / pending assistant message
- isSending
- 手写 fetch 主循环
- 组件内 deltaText 聚合
- 组件内 protocol mapping
```

改为：

```txt
useChat
├── messages
├── sendMessage
├── status
├── error
└── setMessages（持久化刷新后同步）
```

### 11.3 持久化刷新

当前后端在 `workflow:finish` 后才完成持久化语义，因此：

```txt
workflow:finish
↓
Transport / Adapter 先完成 UI message
↓
调用 refreshConversationState()
↓
使用数据库最新 messages 替换 useChat messages
↓
刷新 runs 并自动选中最新 run
```

要求：

```txt
- UI 乐观消息 id 与持久化 message id 不得长期并存造成重复。
- 刷新失败不得抹掉已经流出的文本；显示 persistence / refresh warning。
- router.refresh() 继续作为 Server Component 数据同步手段，但不得重置正在流式的本轮。
```

---

## 十二、Chat Surface 设计

目标是“可用、清晰、比当前 Demo 更像聊天界面”，不是商业化视觉系统。

### 12.1 布局

保留 Debug Workbench，但重新划分视觉层级：

```txt
桌面宽屏
├── Debug Pane：可滚动、固定合理宽度
└── Chat Pane：占主要空间

窄屏
├── Chat Pane 优先
└── Debug Pane 可折叠或移动到下方
```

阶段 2 至少确保常用桌面窗口下不出现横向溢出；完整移动端产品化不是本阶段目标。

### 12.2 Chat Pane

建议结构：

```txt
Chat Header
├── Companion / conversation title
├── Model 简要信息
└── Web Search availability badge

Message List
├── User Message
├── Assistant Message
│   ├── Text Parts
│   ├── Turn Status
│   └── Sources（存在时）
└── 当前流式状态

Composer
├── Textarea
├── Web Search Toggle / availability
└── Send
```

模型详细配置可保留在折叠区或 Chat Header 下方，不应长期占据聊天主视觉的大块顶部空间。

### 12.3 消息渲染

必须遍历 `message.parts`：

```txt
text
→ 正常渲染回答文本，保留换行。

data-web-search-status
→ 渲染搜索过程状态。

data-web-search-sources
→ 渲染 Sources。

data-workflow-error
→ 渲染失败 / 部分失败提示。

未知 part
→ 安全忽略或在开发模式显示占位，不得导致页面崩溃。
```

### 12.4 Composer

```txt
- Enter 发送，Shift + Enter 换行。
- 空白消息不发送。
- submitted / streaming 时禁止重复发送。
- 发送后清空输入框。
- Web Search 不可用时 Toggle 禁用，并显示具体原因。
- 不提供虚假的 Stop / Regenerate。
```

---

## 十三、Web Search UI

### 13.1 Availability

沿用阶段 1 的 `WebSearchAvailability`：

```txt
available
→ 显示“Web Search 可用”。

disabled
→ 显示“Web Search 已关闭”。

missing_api_key
→ 显示“TAVILY_API_KEY 未配置”。

unsupported_backend
→ 显示“不支持的 WEB_SEARCH_BACKEND”。

tool_calling_unsupported
→ 显示“当前模型未声明 toolCalling 能力”。

provider_not_ready / 其他安全原因
→ 显示通用不可用说明，不泄漏服务端敏感信息。
```

### 13.2 搜索过程

```txt
未选择 web_search
→ 不展示搜索状态块。

Planner 已选择
→ 正在搜索 Web…

搜索完成，有来源
→ 已搜索 Web · N 个来源

搜索完成，无来源
→ 搜索完成，但未找到可靠来源

搜索失败
→ Web Search 失败，本轮未提供联网来源
```

### 13.3 Sources

`web-search-sources.tsx` 最少展示：

```txt
- favicon（有时展示，无时使用站点占位）
- title
- hostname
- snippet（截断）
- 可点击 URL
```

安全与体验约束：

```txt
- 默认最多显示 5 条。
- URL 使用 target="_blank"。
- 必须设置 rel="noopener noreferrer"。
- hostname 使用 URL 安全解析；非法 URL 不渲染为链接。
- snippet 不使用 dangerouslySetInnerHTML。
- 不显示 Tavily score 给普通用户；score 保留在 Debug。
- 不把 Sources 描述为逐句引用。
- 标题可写“本轮参考来源”。
- 同一 URL 去重，保留排序最靠前的来源。
```

### 13.4 Sources 数据优先级

```txt
1. 当前流中成功 web_search ToolResult 派生的 Host Metadata。
2. workflow:finish 中可安全恢复的 toolResults。
3. 不从 assistant 文本解析 URL。
```

如果搜索失败或 `sources=[]`，Sources 组件返回 `null`。

---

## 十四、RunDebugPanel 保持独立

`RunDebugPanel` 当前已经消费：

```txt
- streamEvents[]
- selected persisted run
- toolSnapshot
- web-search-debug-log
```

阶段 2 只允许进行表现层优化，不得改为从 `useChat.messages` 反推调试信息。

必须继续保留：

```txt
- Workflow Stream Timeline
- Aggregated text:delta
- Web Search Log
- Planner query / arguments
- retrieval metadata / requests
- Tool Snapshot
- Prompt / Memory / Emotion / Observer
- 持久化 Trace
```

建议增加：

```txt
- UI Adapter 当前状态
- AI SDK useChat status
- 本轮 Sources 数量
- protocol_error 摘要
```

这些新增信息可以由 Workspace 显式传入，不能污染 Core Trace。

---

## 十五、错误与安全展示

### 15.1 用户可见错误

用户区域显示安全、简短信息：

```txt
网络 / HTTP / 非法 NDJSON
→ 请求失败，请查看调试面板

搜索 Tool 失败
→ Web Search 失败，本轮未提供联网来源

partial_failed
→ 回复未完整结束，以下内容可能不完整

output_safety_rejected
→ 输出未通过安全审计，本轮未成功完成

persistence_failed
→ 回复已生成，但保存失败；刷新后可能丢失
```

### 15.2 Debug 错误

Debug 可展示：

```txt
- SafeWorkflowError.code
- retryable
- step
- 已脱敏 details
- ToolResult.ok / error
- Wire Event 顺序
```

不得展示：

```txt
- TAVILY_API_KEY
- OPENAI_API_KEY / apiKeyOverride
- Authorization header
- 原始 Provider Response
- Error stack / cause
```

---

## 十六、确定性验证

新增无外部 Key、可进 CI 的验证。

### 16.1 Adapter 单元验证

为 `chat-stream-ui-adapter.ts` 覆盖：

```txt
1. workflow:start → submitted / preparing data part
2. text:delta 连续聚合 → 单一正确 assistant 文本
3. web_search tool:call → searching
4. web_search 成功 tool:result → completed + sources
5. web_search sources=[] → empty，无 Sources 卡片
6. web_search 失败 → failed，无 Sources
7. workflow:finish 文本一致 → success
8. workflow:finish 文本不一致 → protocol_error
9. 已有 delta 后 workflow:error → partial_failed
10. output_safety_rejected → 对应状态
11. persistence_failed → 对应状态
12. 未知 data / tool 不导致 adapter 崩溃
```

### 16.2 Transport 验证

使用 fake `ReadableStream`：

```txt
- 请求 method / headers / body 正确。
- 只发送最后一条用户文本。
- apiKeyOverride 空值不发送。
- Wire Event 同时进入 UI Adapter 与 onWireEvent。
- 非 2xx、空 body、非法 JSON、缺少终止事件均失败。
- AbortSignal 能终止 fetch；但 UI 不因此自动显示 Stop 按钮。
```

### 16.3 组件验证

至少验证纯函数或渲染逻辑：

```txt
- mapPersistedMessagesToUI
- Sources URL 去重与非法 URL 处理
- availability label
- status label
- 无来源时不渲染 Sources
```

### 16.4 验证脚本

新增：

```txt
apps/model-runtime-demo/scripts/verify-chat-ui-adapter.mjs
```

并在 package scripts 增加类似：

```json
{
  "verify:chat-ui-adapter": "pnpm --filter @ying-companion/ai-core build && node scripts/verify-chat-ui-adapter.mjs"
}
```

如果采用仓库现有测试工具，可以改为对应测试命令；但无 Key 可复现门禁不可省略。

---

## 十七、真实人工验收

阶段 1 的 Tavily 与模型 E2E 继续作为前置证据。本阶段追加浏览器走查。

### 场景 A：普通聊天

```txt
前置：Web Search 关闭
操作：发送稳定知识或普通陪伴消息
期望：
- useChat 正常提交并流式更新
- 无 Search 状态
- 无 Sources
- RunDebugPanel Wire Event 完整
- 完成后数据库消息刷新，不重复
```

### 场景 B：开启搜索但无需搜索

```txt
前置：Web Search 可用且 toolCalling=true
操作：发送写作、翻译、陪伴或稳定概念问题
期望：
- Planner no_tool
- 不显示“正在搜索”
- 不消耗 Tavily credits
- 无 Sources
```

### 场景 C：实时问题触发搜索

```txt
前置：TAVILY_API_KEY 有效，toolCalling=true
操作：询问当前新闻、价格、赛程或需要外部核验的问题
期望：
- submitted → planning_tool → searching → streaming → success/degraded
- Sources 来自结构化 ToolResult
- 最多展示 5 条
- Debug 可查看 Planner query、retrieval requests、usage/request id
```

### 场景 D：搜索不可用

```txt
分别验证：
- 缺少 TAVILY_API_KEY
- WEB_SEARCH_BACKEND 不支持
- toolCalling=false

期望：
- Chat Surface 显示明确不可用原因
- web_search 不暴露给 Planner
- 普通聊天仍可运行
```

### 场景 E：搜索失败或空结果

```txt
期望：
- 显示 failed 或 empty 状态
- 不展示伪造 Sources
- 最终回复若继续生成，应明确无法完成联网核验
- Debug 有 ToolResult / Trace 证据
```

### 场景 F：部分流异常

```txt
构造已收到部分 text:delta 后的 workflow:error
期望：
- 保留部分文本
- 状态为 partial_failed
- 不显示 success
```

### 场景 G：输出安全拒绝

```txt
期望：
- 状态为 output_safety_rejected
- 不把先前流式内容当成功完成
- Debug 保留安全错误
```

### 场景 H：刷新与持久化

```txt
期望：
- workflow:finish 后刷新数据库消息
- 无乐观消息重复
- run selector 选中最新 run
- 刷新浏览器后历史消息正常
- 不承诺恢复未持久化的 Sources 卡片
```

---

## 十八、构建与门禁

阶段完成前至少执行：

```bash
pnpm --filter @ying-companion/model-runtime-demo typecheck
pnpm --filter @ying-companion/model-runtime-demo lint
pnpm --filter @ying-companion/model-runtime-demo build
pnpm --filter @ying-companion/model-runtime-demo verify:stream-contract
pnpm --filter @ying-companion/model-runtime-demo verify:chat-ui-adapter
```

并确认阶段 1 相关包不回归：

```bash
pnpm --filter @ying-companion/tool-web-search typecheck
pnpm --filter @ying-companion/tool-web-search lint
pnpm --filter @ying-companion/tool-web-search build
pnpm --filter @ying-companion/tool-web-search-tavily typecheck
pnpm --filter @ying-companion/tool-web-search-tavily lint
pnpm --filter @ying-companion/tool-web-search-tavily build
```

配置真实 `.env` 后人工执行：

```bash
pnpm --filter @ying-companion/tool-web-search-tavily verify:web-search-contract
pnpm --filter @ying-companion/model-runtime-demo verify:web-search-workflow
pnpm --filter @ying-companion/model-runtime-demo dev
```

真实外部服务验证不作为无 Key CI 的默认必跑项，但必须作为 V1.2 完成证据。

---

## 十九、文档事实校准

### 19.1 必须更新

以最终实现为准更新：

```txt
AGENTS.md
README.md
.requirements/README.md
apps/model-runtime-demo/README.md
apps/model-runtime-demo/.env.example
packages/ai-core/README.md
packages/tool-web-search/README.md
packages/tool-web-search-tavily/README.md
docs/ai/core/project-context.md
```

只在实际代码需要时新增独立 UI 文档；不要为同一事实重复创建多份相互漂移的说明。

### 19.2 AGENTS.md

说明 AI/Coding Agent 的阅读顺序与边界：

```txt
- V1.2 总计划与两个 Stage 文档入口
- Web Search 是 Tool，不是 Workflow 特判
- AI SDK UI 只在 Demo Host
- NDJSON 与 Core/Wire Event 不得擅自替换
- 主聊天走 useChat + DemoChatTransport
- Debug Panel 继续使用原始 Wire Events
- 改动代码前先读取对应 package README 与 project-context
```

### 19.3 根 README.md

只展示面向使用者的事实：

```txt
- V1.2 当前能力概览
- Provider 无关 Search Tool + Tavily Adapter
- 自动按意图搜索的前置条件
- Demo 使用 AI SDK UI 管理聊天状态
- 本地启动最短步骤
- 必要环境变量
- 验证命令
- 清晰声明 Demo 是 Debug Workbench，不是生产 UI
```

### 19.4 `.requirements/README.md`

更新版本索引：

```txt
V1.0 → 03-v1.0-plan.md
V1.1 → 04-v1.1-plan.md
V1.2 → 05-v1.2-plan.md
       ├── stage-01/01-web-search-tool.md
       └── stage-02/02-demo-ai-sdk-ui-and-docs.md
```

标记阶段完成状态必须以实际提交为准。

### 19.5 Demo README

必须说明：

```txt
- 当前页面与主 API 路径
- useChat / DemoChatTransport / NDJSON Adapter 的关系
- 为什么没有改成 AI SDK 标准后端流协议
- Model Config / apiKeyOverride 行为
- Web Search availability 三项前置
- 搜索与非搜索示例
- Sources 只表示本轮参考来源
- RunDebugPanel 可查看哪些信息
- 所有 dev / build / verify 命令
- 常见错误排查
```

### 19.6 `.env.example`

只列真实读取的变量，并写明用途：

```txt
WEB_SEARCH_BACKEND=tavily
TAVILY_API_KEY=
OPENAI_MODEL_SUPPORTS_TOOL_CALLING=true
```

同时保留仓库实际使用的 OpenAI-compatible、Ollama、Postgres 配置。不得加入代码未读取的占位环境变量。

### 19.7 `packages/ai-core/README.md`

强调不变边界：

```txt
- ai-core 不依赖 Tavily 或 AI SDK UI
- Tool 与 Model 通过 Provider 注入
- Core Event 可包含运行时对象；Host 负责 Wire 序列化
- executeWorkflow / streamWorkflow 兼容
- Sources 是 Host/UI 概念，不是 Core 专用字段
```

### 19.8 Search Package README

`packages/tool-web-search/README.md`：

```txt
- Provider 无关 DTO
- WebSearchProvider / createWebSearchTool
- Tool 输入、输出与错误语义
- usageInstructions
- 不写 Memory
```

`packages/tool-web-search-tavily/README.md`：

```txt
- Tavily Adapter 配置
- 请求策略与 normalize
- contract verify
- 错误分类
- 不泄漏 API Key / raw response
```

不得在 Stage 02 随意重写已实现的检索策略描述；只校准事实。

### 19.9 `docs/ai/core/project-context.md`

作为架构事实源，更新：

```txt
- 当前 monorepo package 图
- V1.2 Workflow 数据流
- Search Tool / Tavily Adapter / Host / UI 分层
- Core Event / Wire Event / UIMessage 三层关系
- 主聊天与 Debug Surface 双通道
- 当前限制与明确非目标
```

---

## 二十、文档验收规则

文档必须满足：

```txt
- 所有文件路径真实存在。
- 所有命令可在当前 package.json 中找到。
- 所有环境变量在代码中真实读取。
- 不声称支持 Google、Brave、Exa 等尚未实现的 Adapter。
- 不声称支持 Stop、Regenerate、Reconnect、Resume Stream。
- 不声称 Sources 是逐句引用。
- 不声称 Sources 已持久化。
- 不再描述 ConversationWorkspace 为手写消息状态（实施完成后）。
- 不把计划中的文件写成已经存在。
- README 与代码发生冲突时必须修改 README，而不是为保留旧文档扭曲代码。
```

建议在最终代码完成后再统一执行文档收口，避免边实施边反复写入尚未稳定的 API。

---

## 二十一、建议实施顺序

严格按以下顺序执行：

```txt
1. 安装 ai / @ai-sdk/react，确认实际 API。
2. 定义 DemoUIMessage、metadata、data parts 与 DemoTurnStatus。
3. 为 chat-stream-ui-adapter 编写确定性验证。
4. 实现 Wire Event → UIMessage 增量映射。
5. 实现 DemoChatTransport，复用现有 NDJSON parser。
6. 用 useChat 替换 ConversationWorkspace 手写主消息状态。
7. 保持 streamEvents[] 旁路接入 RunDebugPanel。
8. 拆分 Chat Surface / Message / Composer / Sources 组件。
9. 完成 Web Search availability、状态与 Sources 展示。
10. 完成错误、安全、持久化刷新与协议一致性处理。
11. 执行 typecheck / lint / build / verify。
12. 浏览器走查全部验收场景。
13. 最后以实际代码统一更新文档。
```

不得先大规模改 CSS，再补协议 Adapter；本阶段的首要风险是消息流契约，而不是视觉样式。

---

## 二十二、阶段完成定义

只有以下条件全部成立，阶段 2 才算完成：

```txt
[AI SDK UI]
- ConversationWorkspace 主聊天使用 useChat。
- DemoChatTransport 适配现有 POST + NDJSON。
- message.parts 正确承载文本与 Host UI 数据。
- 未将 AI SDK UI 类型引入 ai-core。

[Streaming]
- text:delta 实时渲染。
- workflow:finish 校验聚合文本。
- workflow:error 状态准确。
- RunDebugPanel 仍获得完整 Wire Events。

[Web Search UI]
- availability 原因清晰。
- 搜索过程状态清晰。
- 成功搜索展示结构化 Sources。
- 未搜索、失败、空结果不展示伪造来源。

[Persistence]
- 完成后以数据库消息刷新 UI。
- 无重复乐观消息。
- 最新 run 与 Debug Panel 同步。

[Quality]
- typecheck / lint / build 通过。
- Adapter / Transport 确定性验证通过。
- 真实 Tavily + 模型流程可在浏览器复现。

[Documentation]
- AGENTS.md、README、Demo README、package README 与 project-context 描述实际代码。
- 文档不包含未实现能力、错误路径或过期命令。
```

阶段 2 完成后，V1.2 的最终状态应为：

```txt
Companion Core
→ 保持 Provider / UI 无关

Web Search
→ Provider 无关 Tool + Tavily Adapter

Demo Host
→ 现有 NDJSON Wire Protocol
→ AI SDK UI useChat + Custom Transport
→ Conversation Chat Surface
→ 独立 RunDebugPanel

Documentation
→ 与 V1.2 实际代码一致
```
