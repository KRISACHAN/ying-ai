# AI Companion Core V1.2 - 阶段 2：Demo AI SDK UI 与文档收口

## 一、阶段目标

在阶段 1 已完成 Web Search Tool、Tavily Adapter、Tool Planning、Wire Event 与 Web Search Debug Log 的基础上，升级 `apps/model-runtime-demo` 的主聊天体验，并将仓库文档同步到实际代码。

本阶段只完成三件事：

```txt
1. 使用 AI SDK UI 的 useChat 管理 Demo 主聊天消息与请求生命周期。
2. 保留现有 POST + NDJSON 后端协议，通过 Custom Transport / Adapter 转换为 UIMessage。
3. 展示搜索过程、Sources、失败状态，并按最终实现校准文档。
```

完成后的主路径：

```txt
用户输入
↓
useChat.sendMessage({ text })
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
├── 手写 messages / input / isSending / turnStatus
├── 手写 fetch POST
├── 使用 parseNdjsonWireEvents() 消费 NDJSON
├── 手工聚合 text:delta
├── 手工处理 workflow:finish / workflow:error
├── 保存 streamEvents[]
└── 渲染基础 message bubble、模型配置与 composer

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
- deriveWebSearchMetadataFromToolResult()
- DemoWorkflowWebSearchMetadata
- WebSearchAvailability
- tool:call / tool:result / workflow:* Wire Event
- RunDebugPanel Web Search Log
- 搜索关闭、不可用、成功、失败与空结果语义
```

---

## 三、阶段边界

### 3.1 必须保持

```txt
- packages/ai-core 不依赖 ai、@ai-sdk/react 或 UIMessage 类型。
- packages/ai-core 不读取浏览器状态或环境变量。
- 后端继续输出 application/x-ndjson。
- Core Event 与 Wire Event 的分层保持不变。
- ConversationWorkspace 使用 useChat 管理主聊天消息与请求生命周期。
- RunDebugPanel 继续独立维护完整 streamEvents[]。
- Sources 只来自结构化 ToolResult / Host Metadata。
- Host 不回写或修改 Core ChatWorkflowOutput 的语义。
- Web Search 结果不写入长期 Memory。
- 数据库持久化消息仍是刷新后的事实源。
```

### 3.2 明确不做

```txt
- 不将后端改为 streamText() + toUIMessageStreamResponse()。
- 不让 AI SDK UI 接管 Companion Core 工作流。
- 不修改阶段 1 的 Tavily Search 策略。
- 不实现多轮流式 Tool Loop。
- 不实现断线续传、流恢复或 reconnect。
- 不实现搜索历史、来源收藏或 Sources 持久化。
- 不实现账号、权限、计费或生产部署。
- 不为 Legacy /api/chat + chat-panel.tsx 做完整双轨重写。
- 不在缺少真实产品语义时展示 Regenerate。
- 不引入 Tailwind、shadcn 或完整主题系统；沿用现有 page.css 与 className。
```

### 3.3 Stop 语义

`DemoChatTransport` 必须把 AI SDK 提供的 `AbortSignal` 传给 `fetch`。

只有在以下条件全部成立时，Chat Surface 才允许展示 Stop：

```txt
- useChat.stop() 能触发当前 Transport abort；
- fetch 与 NDJSON parser 会实际停止；
- UI 将本轮标记为 cancelled / failed，而不是 success；
- 不误导为服务端可恢复的 workflow cancellation。
```

如果实施时未完成上述语义，则不展示 Stop。

---

## 四、阶段完成标准

```txt
- apps/model-runtime-demo 安装并使用 ai 与 @ai-sdk/react。
- 使用 AI SDK 6.x 当前稳定版本，并由 pnpm-lock.yaml 锁定实际版本。
- ConversationWorkspace 的主消息状态由 useChat 管理。
- 使用自定义 Chat Transport 调用现有 conversation messages API。
- 请求仍可传 message、modelConfig、apiKeyOverride、webSearchEnabled。
- 后端 NDJSON Wire Event 格式不变。
- text:delta 被转换为 assistant text part，并保持增量更新。
- tool:call / tool:result 驱动规划、搜索中、搜索完成、空结果、搜索失败状态。
- workflow:finish 校验最终文本一致性并完成 assistant message。
- workflow:error 正确区分 failed、partial_failed、output_safety_rejected、persistence_failed。
- 原始 Wire Events 继续完整送入 RunDebugPanel。
- 成功搜索后展示 Sources；未搜索、失败或空结果时不展示伪造来源。
- Chat Surface 提供当前页面有效的 Web Search Toggle。
- Toggle 不覆盖宿主能力：Provider、API Key 或 toolCalling 不可用时必须禁用并说明原因。
- 刷新后仍以数据库持久化消息为准，不将 UIMessage 当数据库事实源。
- typecheck、lint、build、verify:stream-contract、verify:chat-ui-adapter 全部通过。
- 配置真实 .env 后 Stage 01 的真实验证不回归，浏览器场景 A～I 通过。
- README 与 docs 只描述最终实际实现。
```

---

## 五、建议目录与职责

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
│       ├── web-search-ui-metadata.ts      # 可选，只负责展示格式化
│       ├── chat-stream-transport.ts       # 现有 NDJSON parser
│       ├── chat-stream-wire.ts            # 现有 Wire 契约
│       ├── web-search-runtime.ts          # Stage 01 DTO 派生唯一来源
│       ├── web-search-availability.ts
│       └── web-search-debug-log.ts
├── scripts/
│   └── verify-chat-ui-adapter.mjs
├── package.json
└── README.md
```

职责：

```txt
conversation-workspace.tsx
→ 编排 useChat、模型配置、页面级 Web Search Toggle、持久化刷新、RunDebugPanel 与 Chat Surface。

DemoChatTransport
→ 将 useChat 请求转换为现有 conversation messages API 请求，读取 NDJSON，并旁路原始 Wire Event。

chat-stream-ui-adapter.ts
→ 纯函数式地将 Wire Event 转换为 AI SDK UI chunk / Demo UI 状态。

ConversationChatSurface
→ 只负责消息、状态、Sources 与 composer 的表现。

RunDebugPanel
→ 继续消费原始 Wire Event 和持久化 Run，不依赖 UIMessage 反推调试信息。

web-search-runtime.ts
→ ToolResult 解析和 DemoWorkflowWebSearchMetadata 派生的唯一来源。

web-search-ui-metadata.ts（可选）
→ 只做 URL 安全解析、去重、截断和展示 label，不复制 DTO 定义。
```

避免把所有状态、解析、视图和数据刷新继续堆在 `conversation-workspace.tsx`。

---

## 六、AI SDK 依赖与版本基线

实施时安装 AI SDK 当前稳定主版本。本阶段固定采用 AI SDK 6.x：

```bash
pnpm --filter @ying-companion/model-runtime-demo add ai@^6 @ai-sdk/react@^3
```

如果实际 npm peer dependency 要求不同，以安装结果为准，但必须满足：

```txt
- ai 与 @ai-sdk/react 属于兼容代际。
- 实际版本写入 package.json 并由 pnpm-lock.yaml 锁定。
- 实施者先读取已安装版本导出的 ChatTransport、UIMessage、UIMessageChunk 与 useChat 类型。
- 不为迎合本计划中的示意代码绕过 TypeScript 类型。
- useChat 使用 transport 参数。
- 使用 sendMessage({ text }) 发送。
- 使用 message.parts 渲染，不依赖 message.content。
- 不引入 AI SDK Provider；模型调用仍由 Companion Core Model Adapter 完成。
```

若 AI SDK 6 与当前 React / Next.js / TypeScript 基线出现无法合理解决的兼容问题，允许退回兼容稳定版本，但必须在 Stage 完成记录与 Demo README 中说明原因和最终版本。

---

## 七、Demo UIMessage 数据模型

在 Demo Host 定义 UIMessage 泛型，不向 Core 泄漏：

```ts
import type { UIMessage } from "ai";

import type { DemoWorkflowWebSearchMetadata } from "./web-search-runtime";

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

上面的泛型仅表达逻辑目标。最终声明必须以已安装 AI SDK 版本的真实类型为准。

逻辑边界：

```txt
metadata
→ 当前 message 的稳定结果信息。

data parts
→ 流式过程中的工作流、工具、来源和错误信息。

text parts
→ 只承载面向用户的 assistant 文本。

streamEvents[]
→ 完整原始 Wire Event，只供 Debug Workbench。
```

### 7.1 初始持久化消息转换

新增纯函数：

```ts
mapPersistedMessagesToUI(initialDetail.messages): DemoUIMessage[]
```

要求：

```txt
- role=user / assistant 保持一致。
- content → 单一 text part。
- id 使用持久化 message id。
- status / errorSummary / model 写入 metadata。
- 不从历史 message content 推断 Sources。
- Chat Surface 只保证当前流式回合的 Sources。
- 历史 Sources 可在 RunDebugPanel 的 toolSnapshot 中查看。
- V1.2 不新增 Sources 数据库表，不承诺刷新后恢复 Sources 卡片。
```

---

## 八、页面级 Web Search Toggle

### 8.1 能力与用户选择分层

```txt
宿主能力 availability
= WEB_SEARCH_ENABLED=true
+ WEB_SEARCH_BACKEND 已实现
+ 对应 API Key 有效
+ 当前模型 capabilities.toolCalling=true

页面级 webSearchEnabled
= 用户是否允许本次请求向 Planner 暴露 web_search
```

规则：

```txt
- availability 不可用时，Toggle disabled=false 不成立；控件必须禁用并显示具体原因。
- availability 可用时，Toggle 默认开启。
- Toggle 只保存在当前页面 React state，不写数据库、不写长期 Memory。
- 刷新页面后恢复默认值，不承诺跨会话同步。
- 关闭 Toggle 时，本次请求不得注册 / 注入 web_search。
- 开启 Toggle 只代表允许搜索；最终是否搜索仍由 ToolPlanningProvider 决定。
```

### 8.2 请求契约

现有请求体扩展为：

```json
{
  "message": "用户最后一条文本",
  "modelConfig": {},
  "apiKeyOverride": "可选",
  "webSearchEnabled": true
}
```

后端 Host 规则：

```txt
- webSearchEnabled 必须是 boolean；缺失时使用安全默认值 false，避免旧调用方意外联网。
- 只有 availability 可用且 webSearchEnabled=true 时才向当前 runtime 注入 web_search。
- webSearchEnabled=false 不影响普通聊天和其他 Tool。
- 不修改 packages/ai-core、packages/tool-web-search 或 Tavily Adapter。
- 不把用户选择写回 Core Output。
```

---

## 九、Custom Transport

主聊天固定采用：

```txt
useChat({ transport: new DemoChatTransport(...) })
```

不得只使用 AI SDK UI 视觉组件，却继续手写主消息流状态。

### 9.1 Transport Context

```ts
interface DemoChatTransportContext {
  conversationId: string;
  getModelConfig(): DebugModelConfig;
  getApiKeyOverride(): string;
  getWebSearchEnabled(): boolean;
  onWireEvent(event: ChatWorkflowStreamWireEvent): void;
  onWorkflowTerminal(event: WorkflowTerminalWireEvent): void | Promise<void>;
}
```

### 9.2 输入要求

```txt
- 不提交全部 UIMessage 历史；后端已通过 conversationId 加载持久化历史。
- 只提取本次 sendMessage 新增的用户文本。
- apiKeyOverride 为空时不进入 body。
- 请求头使用 Content-Type: application/json。
- Accept 使用 application/x-ndjson。
- HTTP 非 2xx、空 body、非法 NDJSON 转成可控错误。
- AI SDK 提供的 AbortSignal 必须传给 fetch。
```

### 9.3 输出要求

每个 NDJSON Wire Event 同时进入两个方向：

```txt
方向 A：chat-stream-ui-adapter
→ 生成已安装 AI SDK 版本可消费的 UI message chunk。

方向 B：onWireEvent
→ append 到 ConversationWorkspace.streamEvents[]。
→ RunDebugPanel 获得完整原始事件。
```

禁止先转换为 UIMessage 再反推 Debug Event。

### 9.4 ChatTransport 契约

`DemoChatTransport` 必须实现已安装 AI SDK 版本要求的 `ChatTransport<DemoUIMessage>` 接口。

本文档不写死方法精确签名；TypeScript 类型是最终事实源。

必须具备的行为：

```txt
- 发起现有 POST 请求。
- 读取并解析 Companion NDJSON Wire Protocol。
- 将 Wire Event 转成 UIMessageChunk / 对应流片段。
- 旁路调用 onWireEvent。
- 传递 AbortSignal。
- reconnect / resume 返回“不支持恢复”的合法结果。
- 不使用 DefaultChatTransport 或 TextStreamChatTransport 直接消费 Companion NDJSON。
```

实施顺序：先完成 Wire Event → UI chunk 的纯函数与验证，再实现 Transport 和 useChat 接入。

---

## 十、Wire Event → AI SDK UI 映射

`chat-stream-ui-adapter.ts` 必须是纯映射层，不直接操作 React state。

### 10.1 workflow:start

```txt
- 记录 workflowId。
- 推送 submitted / preparing 状态数据。
- 不创建额外可见 assistant 文本。
```

### 10.2 step:start / step:end

```txt
step:start && step === "tool:plan"
→ planning_tool

step:end && status === "degraded"
→ 记录 degraded，不提前完成 assistant message

其他内部步骤
→ 只供 Debug，不向 Chat Surface 展示内部步骤名
```

`searching` 不由 `tool:execute` 的 step:start 驱动，而由 `web_search` 的 `tool:call` 驱动，避免重复和乱序。

### 10.3 text:delta

```txt
- 按顺序追加 assistant text part。
- event.model 写入 message metadata。
- Adapter 内维护 aggregatedText。
- React 组件不再维护第二份 delta 拼接逻辑。
```

### 10.4 tool:call

当 `call.name === "web_search"`：

```txt
- 保存 Planner query / arguments。
- 状态设为 searching。
- Chat Surface 显示“正在搜索 Web…”；原始参数只在 Debug 展示。
```

其他工具可映射为通用工具状态；本阶段不要求专属卡片。

### 10.5 tool:result

成功的 `web_search`：

```txt
- 调用 deriveWebSearchMetadataFromToolResult()。
- sources.length > 0 → completed。
- sources.length === 0 → empty。
- 推送 web-search-sources data part。
- 继续等待最终 assistant 回复。
```

失败的 `web_search`：

```txt
- 状态设为 failed。
- 保存安全错误摘要。
- 不创建 Sources。
- 允许后续模型给出普通或降级回答。
```

禁止从模型自然语言解析 URL，禁止把 Tavily 原始响应放入 UIMessage，禁止在 Adapter 重写 Stage 01 normalize。

### 10.6 workflow:finish

```txt
1. 校验 aggregatedText === event.output.text。
2. 不一致时抛出 protocol_error，不显示 success。
3. 从已收集 ToolResult 或 event.output.toolResults 调用 deriveWebSearchMetadataFromToolResult()。
4. Host Metadata 写入 UIMessage metadata / data part，不回写 event.output。
5. 完成当前 assistant message。
6. 根据 trace 设置 success 或 degraded。
7. 触发宿主持久化刷新回调。
```

### 10.7 workflow:error

```txt
output_safety_rejected
→ output_safety_rejected

workflow_failed + reason=persistence_failed
→ persistence_failed

已有 text:delta 后发生其他 error
→ partial_failed，保留部分文本

未产生 text:delta
→ failed
```

已经产生部分文本的异常回合不得显示为 success。

---

## 十一、聊天状态模型

AI SDK `useChat.status` 只代表请求生命周期，不能替代 Companion Workflow 状态。

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
  | "cancelled"
  | "failed";
```

迁移时一次性替换现有 kebab-case 状态，不长期并存两套枚举。

```txt
useChat.status=submitted → submitted
step:start tool:plan → planning_tool
web_search tool:call → searching
首次 text:delta → streaming
workflow:finish normal → success
workflow:finish degraded → degraded
workflow:error → 按第十节映射
AbortSignal 主动中止 → cancelled
```

Chat Surface 展示简短状态，RunDebugPanel 展示精确 Wire Event。

---

## 十二、ConversationWorkspace 重构

### 12.1 保留职责

```txt
- conversationId 与初始持久化消息
- runs / selectedRun
- memory health
- modelConfig
- apiKeyOverride
- Web Search availability
- 页面级 webSearchEnabled
- streamEvents[]
- refreshConversationState / refreshRunsOnly / selectRun
```

### 12.2 移交给 useChat

移除或停止自行维护：

```txt
- 主 messages useState
- 手写 optimistic user / pending assistant message
- isSending
- 手写 fetch 主循环
- 组件内 deltaText 聚合
- 组件内 Wire Protocol mapping
```

改为使用：

```txt
useChat
├── messages
├── sendMessage
├── status
├── error
└── setMessages
```

### 12.3 持久化刷新

```txt
workflow:finish
↓
Transport / Adapter 完成当前 UI message
↓
refreshConversationState()
↓
数据库最新 messages → mapPersistedMessagesToUI()
↓
setMessages()
↓
刷新 runs 并选中最新 run
```

要求：

```txt
- 乐观 ID 与持久化 ID 不得长期并存造成重复。
- 刷新失败不得抹掉已流出的文本；显示 refresh / persistence warning。
- router.refresh() 不得重置正在流式的本轮。
```

---

## 十三、Chat Surface 设计

目标是“可用、清晰、比当前 Demo 更像聊天界面”，不是商业化视觉系统。

沿用 `apps/model-runtime-demo/app/page.css` 和现有 className，不引入 Tailwind、shadcn 或完整主题系统。

### 13.1 布局

```txt
桌面宽屏
├── Debug Pane：可滚动、合理固定宽度
└── Chat Pane：主要空间

窄屏
├── Chat Pane 优先
└── Debug Pane 移至下方或可折叠
```

至少保证常用桌面窗口无横向溢出；完整移动端产品化不属于本阶段。

### 13.2 Chat Pane

```txt
Chat Header
├── Companion / conversation title
├── Model 简要信息
├── Web Search availability badge
└── 页面级 Web Search Toggle

Message List
├── User Message
├── Assistant Message
│   ├── Text Parts
│   ├── Turn Status
│   └── Sources（存在时）
└── 当前流式状态

Composer
├── Textarea
└── Send / 可选 Stop
```

模型详细配置可保留在折叠区或 Header 下方，不长期占据聊天主视觉。

### 13.3 消息渲染

必须遍历 `message.parts`：

```txt
text → 回答文本，保留换行
data-web-search-status → 搜索过程
data-web-search-sources → Sources
data-workflow-error → 失败 / 部分失败提示
未知 part → 安全忽略或开发占位，不得崩溃
```

### 13.4 Composer

```txt
- Enter 发送，Shift + Enter 换行。
- 空白消息不发送。
- submitted / streaming 时禁止重复发送。
- 发送后清空输入框。
- 不可用的 Web Search Toggle 禁用并显示原因，不影响普通聊天。
- Stop 只有在第三节语义满足时才展示。
- 不展示无真实语义的 Regenerate。
```

---

## 十四、Web Search UI

### 14.1 Availability

沿用 `WebSearchAvailability` 与 `formatWebSearchAvailabilityLabel()`，不得自造 reason 枚举。

```txt
available → Web Search 可用
disabled → WEB_SEARCH_ENABLED 未启用
missing_api_key → TAVILY_API_KEY 未配置
unsupported_backend → 不支持的 WEB_SEARCH_BACKEND
tool_calling_unsupported → 当前模型未声明 toolCalling
provider_initialization_failed → Provider 初始化失败
```

### 14.2 搜索过程

```txt
Toggle 关闭 → Web Search 已关闭（当前页面）
Planner 未选择 web_search → 不展示搜索状态块
Planner 已选择 → 正在搜索 Web…
搜索完成且有来源 → 已搜索 Web · N 个来源
搜索完成但无来源 → 搜索完成，但未找到可靠来源
搜索失败 → Web Search 失败，本轮未提供联网来源
```

### 14.3 Sources

最少展示：

```txt
- favicon（可选）
- title
- hostname
- snippet（截断）
- 可点击 URL
```

约束：

```txt
- 默认最多 5 条。
- target="_blank" + rel="noopener noreferrer"。
- hostname 使用 URL 安全解析；非法 URL 不渲染链接。
- snippet 不使用 dangerouslySetInnerHTML。
- 不显示 Tavily score 给普通用户。
- 标题使用“本轮参考来源”，不宣称逐句引用。
- 同一 URL 去重，保留排序最靠前来源。
- Sources 数据优先来自当前流的成功 ToolResult，其次是 workflow:finish.toolResults。
- 不从 assistant 文本解析 URL。
- 搜索失败或 sources=[] 时组件返回 null。
```

---

## 十五、RunDebugPanel 保持独立

阶段 2 不得改为从 `useChat.messages` 反推调试信息。

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

可增加：

```txt
- DemoTurnStatus
- AI SDK useChat status
- 页面级 webSearchEnabled
- 本轮 Sources 数量
- protocol_error 摘要
```

这些信息由 Workspace 显式传入，不污染 Core Trace。

---

## 十六、错误与安全展示

用户区域只展示安全、简短信息：

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

cancelled
→ 已停止本轮生成
```

Debug 可展示脱敏后的错误 code、retryable、step、details、ToolResult 和 Wire Event 顺序。

不得展示 API Key、Authorization、原始 Provider Response、stack 或 cause。

---

## 十七、验证策略

本阶段不要求修改 GitHub Actions / CI 配置，但所有无外部 Key 的确定性验证必须可在 CI 环境运行。

验证分两层：

```txt
[确定性验证]
verify:chat-ui-adapter
→ 无 API Key、无网络可运行；覆盖 Adapter、Transport 和展示纯逻辑。

[真实验收证据]
verify:web-search-contract
+ verify:web-search-workflow
+ 浏览器场景 A～I
→ 使用本地真实 .env；用于 Stage 完成与 Release Evidence。
```

### 17.1 Adapter 验证

```txt
1. workflow:start → submitted
2. text:delta 连续聚合 → 单一正确文本
3. web_search tool:call → searching
4. 成功 tool:result → completed + sources
5. sources=[] → empty，无 Sources 卡片
6. tool 失败 → failed，无 Sources
7. workflow:finish 文本一致 → success
8. workflow:finish 文本不一致 → protocol_error
9. 已有 delta 后 workflow:error → partial_failed
10. output_safety_rejected
11. persistence_failed
12. 主动 abort → cancelled
13. 未知 data / tool 不崩溃
```

### 17.2 Transport 验证

使用 fake `ReadableStream` 和 fake fetch：

```txt
- method / headers / body 正确。
- 只发送最后一条用户文本。
- apiKeyOverride 空值不发送。
- webSearchEnabled 正确发送。
- Wire Event 同时进入 Adapter 与 onWireEvent。
- 非 2xx、空 body、非法 JSON、缺少终止事件均失败。
- AbortSignal 能终止 fetch。
- reconnect / resume 返回不支持语义。
```

### 17.3 组件 / 纯函数验证

```txt
- mapPersistedMessagesToUI
- Sources URL 去重与非法 URL 处理
- availability label
- status label
- 无来源时不渲染 Sources
- Toggle 不可用时禁用
```

### 17.4 验证脚本

新增：

```txt
apps/model-runtime-demo/scripts/verify-chat-ui-adapter.mjs
```

`package.json`：

```json
{
  "verify:chat-ui-adapter": "node scripts/verify-chat-ui-adapter.mjs"
}
```

若采用仓库现有测试工具，可使用对应测试命令，但确定性验证和真实验收均不可省略。

---

## 十八、真实人工验收

### 场景 A：普通聊天，宿主搜索关闭

```txt
- useChat 正常提交并流式更新。
- 无搜索状态，无 Sources。
- RunDebugPanel Wire Event 完整。
- 完成后数据库消息刷新且不重复。
```

### 场景 B：搜索可用，但页面 Toggle 关闭

```txt
- 实时问题也不向 Planner 暴露 web_search。
- 不消耗 Tavily credits。
- 普通聊天正常。
```

### 场景 C：Toggle 开启，但无需搜索

```txt
- 稳定知识、写作、翻译或陪伴输入由 Planner 输出 no_tool。
- 不显示“正在搜索”，不消耗 Tavily credits，无 Sources。
```

### 场景 D：实时问题触发搜索

```txt
- submitted → planning_tool → searching → streaming → success/degraded。
- Sources 来自结构化 ToolResult。
- 最多展示 5 条。
- Debug 可查看 query、retrieval requests、usage / request id。
```

### 场景 E：搜索能力不可用

分别验证缺少 API Key、backend 不支持、toolCalling=false：

```txt
- Toggle 禁用并显示明确原因。
- web_search 不暴露给 Planner。
- 普通聊天仍可运行。
```

### 场景 F：搜索失败或空结果

```txt
- 显示 failed 或 empty。
- 不展示伪造 Sources。
- Debug 有 ToolResult / Trace 证据。
```

### 场景 G：部分流异常

```txt
- 已收到部分 text:delta 后 workflow:error。
- 保留部分文本，状态为 partial_failed，不显示 success。
```

### 场景 H：输出安全拒绝 / 持久化失败

```txt
- 安全拒绝不显示成功完成。
- persistence_failed 保留文本并提示保存失败。
- Debug 保留安全错误和持久化错误。
```

### 场景 I：刷新与持久化

```txt
- workflow:finish 后刷新数据库消息。
- 无乐观消息重复。
- run selector 选中最新 run。
- 刷新浏览器后历史文本消息正常。
- 不承诺恢复 Sources 卡片或页面 Toggle 状态。
```

---

## 十九、构建与门禁

阶段完成前执行：

```bash
pnpm --filter @ying-companion/model-runtime-demo typecheck
pnpm --filter @ying-companion/model-runtime-demo lint
pnpm --filter @ying-companion/model-runtime-demo build
pnpm --filter @ying-companion/model-runtime-demo verify:stream-contract
pnpm --filter @ying-companion/model-runtime-demo verify:chat-ui-adapter
```

确认 Stage 01 相关包不回归：

```bash
pnpm --filter @ying-companion/tool-web-search typecheck
pnpm --filter @ying-companion/tool-web-search lint
pnpm --filter @ying-companion/tool-web-search build
pnpm --filter @ying-companion/tool-web-search-tavily typecheck
pnpm --filter @ying-companion/tool-web-search-tavily lint
pnpm --filter @ying-companion/tool-web-search-tavily build
```

配置真实 `.env` 后执行：

```bash
pnpm --filter @ying-companion/tool-web-search-tavily verify:web-search-contract
pnpm --filter @ying-companion/model-runtime-demo verify:web-search-workflow
pnpm --filter @ying-companion/model-runtime-demo dev
```

Stage 02 完成前，真实验证与浏览器场景 A～I 必须通过。

---

## 二十、文档事实校准

最终实现稳定后，以实际代码更新：

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

文档必须说明：

```txt
- V1.2 总计划和两个 Stage 文档入口。
- Web Search 是可注入 Tool，不是 Workflow 特判。
- Tavily 是首个 Adapter，不是 Core 固定依赖。
- AI SDK UI 只存在于 Demo Host。
- NDJSON、Core Event、Wire Event、UIMessage 的边界。
- useChat、DemoChatTransport、Adapter、RunDebugPanel 的职责。
- Web Search availability 与页面级 Toggle 的区别。
- WEB_SEARCH_ENABLED 是宿主总开关；页面 Toggle 只控制本次请求是否允许搜索。
- TAVILY_API_KEY 只在宿主读取。
- toolCalling=true 是自动搜索硬前置。
- Sources 是本轮参考来源，不是逐句引用，也不持久化。
- 搜索、非搜索、不可用、失败、部分失败和安全拒绝的走查方式。
- 实际安装的 AI SDK 版本和验证命令。
```

### 20.1 `.env.example`

只列代码真实读取的变量：

```txt
WEB_SEARCH_ENABLED=false
WEB_SEARCH_BACKEND=tavily
TAVILY_API_KEY=
OPENAI_MODEL_SUPPORTS_TOOL_CALLING=true
```

同时保留仓库真实使用的 OpenAI-compatible、Ollama、Postgres 配置，不加入未读取变量。

### 20.2 文档验收规则

```txt
- 所有路径真实存在。
- 所有命令可在 package.json 找到。
- 所有环境变量在代码真实读取。
- 不声称支持未实现的 Google / Brave / Exa Adapter。
- 不声称支持 Reconnect / Resume Stream。
- Stop 只在真实 abort 语义完成后描述。
- 不声称 Sources 是逐句引用或已持久化。
- 不把计划文件写成已经存在的实现。
- README 与代码冲突时修改 README，不为保留旧文档扭曲代码。
```

---

## 二十一、建议实施顺序

```txt
1. 安装 AI SDK 6.x，读取真实 ChatTransport / UIMessage / UIMessageChunk 类型。
2. 定义 DemoUIMessage、data parts、metadata 与 DemoTurnStatus。
3. 扩展 Host 请求体的 webSearchEnabled，并完成页面 Toggle 的能力门控。
4. 先写 chat-stream-ui-adapter 的确定性验证。
5. 实现 Wire Event → AI SDK UI chunk 的纯映射。
6. 实现 DemoChatTransport 与 NDJSON parser 适配。
7. 用 useChat 替换 ConversationWorkspace 的手写主消息流状态。
8. 保持 streamEvents[] 旁路接入 RunDebugPanel。
9. 拆分 Chat Surface、Message、Composer、Search Status、Sources 组件。
10. 完成错误、安全、abort 与持久化刷新处理。
11. 执行 typecheck / lint / build / verify。
12. 完成浏览器场景 A～I。
13. 最后按实际代码统一更新文档。
```

不得先大规模改 CSS 再补协议 Adapter；本阶段首要风险是消息流契约，而不是视觉样式。

---

## 二十二、阶段完成定义

只有以下条件全部成立，阶段 2 才算完成：

```txt
[AI SDK UI]
- ConversationWorkspace 主聊天使用 useChat。
- DemoChatTransport 适配现有 POST + NDJSON。
- message.parts 正确承载文本与 Host UI 数据。
- 未将 AI SDK UI 类型引入 ai-core。

[Web Search Control]
- 宿主 availability 与页面级 Toggle 职责分离。
- Toggle 关闭时当前请求不可使用 web_search。
- Toggle 开启时仍由 Planner 决定是否搜索。

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
- typecheck / lint / build / verify:stream-contract / verify:chat-ui-adapter 通过。
- 配置真实 .env 后 Stage 01 的 contract 与 workflow E2E 不回归。
- 浏览器场景 A～I 通过。

[Documentation]
- AGENTS.md、README、Demo README、package README 与 project-context 描述实际代码。
- 文档不包含未实现能力、错误路径或过期命令。
```

阶段 2 完成后的 V1.2 状态：

```txt
Companion Core
→ 保持 Provider / UI 无关

Web Search
→ Provider 无关 Tool + Tavily Adapter

Demo Host
→ 现有 NDJSON Wire Protocol
→ AI SDK UI useChat + Custom Transport
→ 页面级 Web Search Toggle
→ Conversation Chat Surface
→ 独立 RunDebugPanel

Documentation
→ 与 V1.2 实际代码一致
```
