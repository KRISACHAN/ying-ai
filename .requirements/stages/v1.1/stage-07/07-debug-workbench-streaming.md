# AI Companion Core V1.1 - 阶段 7：Debug Workbench Streaming 实施文档

## 一、阶段目标

在阶段 1～6 已完成 Persona 扩展、V1.1 契约与 Wire 协议、模型能力与工具规划、工作流步骤函数化、工作流级流式执行、Ollama Adapter 的基础上，将 `apps/model-runtime-demo` 升级为长期保留的 **Core Workflow Debug Workbench**。

本阶段的目标不是只做一个“打字机效果”，而是让 Demo 可以稳定完成以下闭环：

```txt
Demo 表单配置
↓
POST 聊天请求
↓
服务端创建持久化 pending run
↓
core.streamWorkflow()
↓
Core Event → Wire Event
↓
NDJSON Response
↓
浏览器增量解析并实时更新聊天与 Timeline
↓
Core workflow:finish
↓
Demo 持久化本轮结果
↓
向浏览器发送最终 workflow:finish
↓
刷新持久化详情并展示完整 Debug Context
```

本阶段交付的是：

1. Provider / 模型 / Persona 的调试配置入口；
2. 面向持久化会话的 NDJSON 聊天 Route；
3. 前端 NDJSON 增量解析与聊天状态机；
4. 流式文本、工作流 Timeline、模型 Runtime、工具、记忆、情绪、摘要与写回结果的可视化；
5. 成功、降级、部分输出失败、Output Safety 拒绝、持久化失败的可区分 UI 状态；
6. 不依赖 console 的人工验收路径。

本阶段不更新项目总文档与 V1.1 review 收口；这些属于阶段 8。

---

## 二、前置基线

### 2.1 阶段 1～6 已完成能力

本阶段必须以 `prod` 当前阶段 1～6 的实现为唯一基线：

```txt
阶段 1
├── CompanionPersona 扩展
├── buildPersonaPrompt()
├── normalizeCompanionPersona()
└── Effective Persona / Persona Prompt Preview

阶段 2
├── CompanionCore.streamWorkflow()
├── ChatWorkflowStreamEvent
├── ChatWorkflowStreamWireEvent
├── SafeWorkflowError
└── POST + fetch + ReadableStream + NDJSON 协议

阶段 3
├── ModelProfile / ModelCapabilities
├── primary / fallback 具体模型能力语义
└── ToolPlanningProvider / ToolPlan

阶段 4
├── SimpleChatWorkflow 共享步骤函数
└── execute() 与 stream() 行为边界收敛

阶段 5
├── SimpleChatWorkflow.stream()
├── text:delta × N
├── workflow:finish / workflow:error
└── 完整文本后的 Safety / Summary / Memory 后置处理

阶段 6
└── OllamaChatModel 独立 Adapter
```

### 2.2 当前 Demo 路由基线

当前 Demo 已同时存在两类聊天入口：

```txt
/api/chat
→ 旧调试入口。
→ 当前以 executeWorkflow() 一次性 JSON 返回。
→ 已有 legacy 注释，不应作为 V1.1 长期流式主通道。

/api/conversations/[id]/messages
→ 持久化会话主入口。
→ 当前先创建 pending run，再 executeWorkflow()，最后 completeRun()。
→ 阶段 7 必须升级该路由为流式主通道。
```

### 2.3 本阶段必须遵守的架构边界

```txt
packages/ai-core
→ 只负责 Core Event、streamWorkflow() 与业务工作流。
→ 不依赖 HTTP、NDJSON、Next.js、React、数据库或 Demo DTO。

apps/model-runtime-demo
→ 负责 ModelConfig 装配、Core Event → Wire Event、NDJSON 写入和读取、持久化会话、前端状态。

packages/model-ollama
→ 只负责 Ollama ChatModel Adapter。
→ 不负责 HTTP 流协议或 Demo UI。

DebugRepository
→ 负责 debug companions / conversations / messages / workflow runs 的持久化。
→ 不感知 Core Event 的内部实现细节。
```

---

## 三、阶段完成标准

完成本阶段后，必须满足：

- Demo 可选择 `openai-compatible` 或 `ollama` Provider；
- Demo 可配置模型名、非敏感模型参数与 Persona；
- API Key 不写入 `debug_*` 数据表、不进入 Wire Event、不出现在 Debug Panel 或日志中；
- 正式流式聊天入口为 `POST /api/conversations/[id]/messages`；
- 路由响应为 `application/x-ndjson; charset=utf-8`；
- 前端可正确处理一个网络 chunk 内的多行 JSON，以及一行 JSON 被拆到多个网络 chunk 的情况；
- 前端按 `event.type` 更新状态，不通过解析 console 文本、模型自然语言或 Observer 文本猜测状态；
- `text:delta` 实时更新当前 assistant 临时消息；
- 正常完成时，所有 delta 拼接文本必须等于最终 `workflow:finish.output.text`；
- `workflow:finish` 只在 Core 完成且 Demo 成功写入本轮持久化数据后才发送给浏览器；
- Output Safety 拒绝、首个 delta 前失败、已输出文本后的模型失败、Wire 映射失败、持久化失败均不得伪造 `workflow:finish`；
- 已输出文本后失败时，UI 保留 partial text，但明确标记“本轮未成功完成”；
- Summary / Memory / Emotion 的可恢复失败若被 Core 标记为 degraded，UI 仍显示完成，但 Timeline 与 Debug Context 必须显示降级信息；
- 工作流 Timeline、最终 Prompt、Effective Persona、模型 Runtime、fallback、工具、记忆、情绪、摘要及写回结果均可在页面查看；
- 刷新页面后，已成功完成的会话仍由数据库中的 messages / workflow runs 恢复；
- 相关 package 的 typecheck、lint、build 通过；
- 完成本文件定义的人工验收场景。

---

## 四、范围与非目标

### 4.1 本阶段必须做

```txt
- Provider / Model / Persona 的 Debug 配置 UI
- 统一 ModelConfig 装配
- 持久化会话消息 Route 的 NDJSON 化
- Core Event → Wire Event 单一映射
- NDJSON 服务端编码与浏览器增量解码
- 当前轮 assistant 临时流消息
- Workflow Timeline
- 最终结果与持久化详情刷新
- 成功 / degraded / partial-failed / failed / safety-rejected / persistence-failed UI 状态
- 模型 runtime、fallback、能力档案展示
```

### 4.2 本阶段明确不做

```txt
- 正式产品聊天 UI
- 用户系统、鉴权、多租户
- AbortController 取消、停止生成
- 断线重连、续传、token 重放
- SSE / EventSource 主通道
- WebSocket
- 流中实时内容安全拦截
- 流式多轮工具调用
- 将 API Key 长期保存到数据库或浏览器 localStorage
- 模型自动智能路由
- 新增 LangChain、LangGraph、多 Agent
- 项目总文档与最终 review 收口（阶段 8）
```

---

## 五、目录与职责

建议涉及的目录如下。实际组件拆分可按当前项目结构调整，但职责边界不得改变。

```txt
apps/model-runtime-demo/
  app/
    api/
      conversations/
        [id]/
          messages/
            route.ts                       # 持久化会话 NDJSON 流式入口
    components/ 或现有 app 组件目录/
      conversation-chat-panel.tsx         # 聊天、临时 assistant 消息、状态展示
      workflow-stream-timeline.tsx        # 主 Stream Event Timeline
      workflow-debug-panel.tsx            # 最终 output / prompt / memory / tool 等
      model-config-form.tsx               # Provider / 模型配置
      companion-form.tsx                  # Persona 配置（沿用阶段 1）
  app/lib/
    chat-stream-wire.ts                   # Wire DTO、单一 Core → Wire 映射
    chat-stream-transport.ts              # NDJSON encode / decode / runtime guard
    model-config.ts                       # 环境默认配置 + 非敏感配置规则
    model-factory.ts                      # createConfiguredModel()
    companion-runtime.ts                  # 创建 conversation runtime
    debug-repository.ts                   # pending / complete / fail run
    http.ts                               # 非流式错误响应辅助
```

职责约束：

```txt
Route
→ 创建 runtime、创建 pending run、消费 Core stream、映射 Wire Event、控制终止发送顺序、持久化。

Wire Mapper
→ 唯一负责 ChatWorkflowStreamEvent → ChatWorkflowStreamWireEvent。
→ 不读取 Request、不访问数据库、不调用 React State。

Transport
→ 唯一负责 NDJSON 行编码、TextDecoder 增量解析、Wire Event runtime 校验。
→ 不决定聊天业务状态。

React Chat State
→ 消费已经校验通过的 Wire Event。
→ 仅根据 event.type 更新 UI。
→ 不理解 ai-core 内部 raw、Provider SDK 对象或数据库实现。

Repository
→ 只保存或读取已定义的持久化数据。
→ 不自行拼接 delta，不自行判断 workflow 是否成功。
```

---

## 六、模型与 Persona 配置能力

### 6.1 Provider 配置模型

Demo 使用宿主侧 `ModelConfig`，Core 仍只接收已经创建完成的 `ChatModel`。

```ts
export type DebugModelConfig =
  | {
      provider: "openai-compatible";
      model: string;
      baseUrl?: string;
      retry?: {
        maxAttempts?: number;
        initialDelayMs?: number;
      };
      fallback?: {
        model: string;
        capabilities?: Partial<ModelCapabilities>;
      };
      capabilities?: Partial<ModelCapabilities>;
      /** 仅当前浏览器页面会话内使用，绝不持久化或回传。 */
      apiKeyOverride?: string;
    }
  | {
      provider: "ollama";
      model: string;
      host?: string;
      keepAlive?: string;
      capabilities?: Partial<ModelCapabilities>;
    };
```

约束：

```txt
- provider、model、baseUrl、host、keepAlive、retry、capability override 可作为 Debug 配置保存或由环境变量提供默认值；
- apiKeyOverride 只能存在于当前浏览器内存和当前请求体中；
- apiKeyOverride 不得写入 debug_companions、conversations、workflow_runs、messages 或任何 audit / trace 字段；
- API Route 不得在成功或失败响应中回显 api key；
- 未填写 apiKeyOverride 时，OpenAI-compatible 使用服务端环境变量；
- Ollama 默认 host 由服务器侧配置或 `http://127.0.0.1:11434` 决定；
- 前端不根据 provider 名称猜测 tool / stream 能力，必须读取服务端返回的 effective model profile / runtime 信息。
```

### 6.2 Persona 配置

阶段 1 已完成的 `CompanionPersona` 是唯一 Persona 事实来源：

```txt
- name / gender / relationship
- personality / speakingStyle / background
- userDisplayName / userAddress
- profile.hobbies
- appearance.heightCm / weightKg / hair / bodyType / additionalTraits
- systemPrompt
```

Stage 7 不重新发明 Persona 表单或 Prompt Builder：

```txt
- 沿用现有 companion-form；
- 保存后下一次请求由 conversation runtime 从 DebugRepository 读取最新 companion；
- Prompt Preview 必须显示 Core 产出的 Persona Prompt / Final System Prompt；
- 不允许 Demo 再次通过 host workaround 拼接 userAddress 或外貌字段。
```

---

## 七、NDJSON 路由与持久化终止语义

### 7.1 规范聊天入口

V1.1 的长期流式聊天入口固定为：

```txt
POST /api/conversations/[id]/messages
Content-Type: application/json
Accept: application/x-ndjson
```

请求体最低包含：

```json
{
  "message": "你好"
}
```

会话、历史、伴侣 Persona、memory scope、summary scope 与当前 emotion 必须由服务端按 `conversationId` 从 `DebugRepository` 读取和构建。

禁止客户端继续提交完整 `history` 作为真相来源。

`/api/chat` 可继续保留为 legacy 非流式调试入口，但必须：

```txt
- 在代码与 README 中明确标记 legacy；
- 不承载 V1.1 流式验收；
- 不作为新页面或新组件默认调用目标；
- 不复制一套与 /conversations 路由不同的流协议。
```

### 7.2 服务端执行顺序

路由处理顺序必须如下：

```txt
1. 校验 conversationId 与 message。
2. 从 DebugRepository 读取 conversation detail。
3. createPendingRun()：持久化 user message + workflow run(pending)。
4. createConversationRuntime()：装配 model / persona / memory / emotion / tools / observer。
5. 调用 runtime.core.streamWorkflow(input)。
6. 对每个 Core Event 调用唯一的 toChatWorkflowStreamWireEvent()。
7. 除 workflow:finish 外，按顺序实时写入 NDJSON。
8. 收到 Core workflow:finish 时，先暂存其 output，暂不立刻发给浏览器。
9. 调用 repository.completeRun() 写入 assistant message、conversation 状态、workflow run 与调试结果。
10. completeRun 成功后，发送暂存的 workflow:finish Wire Event。
11. 关闭 stream。
```

关键规则：

```txt
workflow:finish 对浏览器的语义
= Core 成功完成
+ Demo 成功持久化本轮可恢复结果。

因此 Route 不得把 Core workflow:finish 立即透传给前端。
```

### 7.3 Core 成功但持久化失败

可能出现：

```txt
text:delta × N 已发送
↓
Core workflow:finish 已收到（服务端暂存）
↓
repository.completeRun() 失败
```

此时 Route 必须：

```txt
- 不发送 workflow:finish；
- 尽可能调用 markRunPersistenceFailure() 或 failRun()；
- 发送 workflow:error；
- error.code 使用 persistence_failed（或阶段 2 已定义的等价安全码）；
- UI 保留已流出的 partial text；
- UI 标记“模型回复已生成，但本轮未成功持久化；刷新后可能丢失”；
- 结束 NDJSON Response。
```

这不是 Core 的 `workflow:error` 语义变更，而是 Demo / HTTP 宿主在 Core 成功后的持久化失败终止语义。

### 7.4 Core workflow:error

当 Core 发送 `workflow:error`：

```txt
- Route 必须按 Wire Mapper 映射后立即发送；
- 不得再发送 workflow:finish；
- pending run 必须写为 failed / partial failed 的既有持久化状态；
- 已有 delta 时保留文本，并标记当前 assistant 临时消息为 partial-failed；
- 无 delta 时不创建成功 assistant message；
- 关闭 Response。
```

### 7.5 HTTP 响应约定

成功建立流式 Response 后，必须使用：

```txt
Content-Type: application/x-ndjson; charset=utf-8
Cache-Control: no-cache, no-transform
Connection: keep-alive
X-Content-Type-Options: nosniff
```

HTTP 400 / 404 等“尚未建立工作流”的请求错误可以继续返回普通 JSON 错误响应。

一旦已开始写入 NDJSON，不得试图切换为 `jsonResponse()`。

---

## 八、Wire Event 与 NDJSON 编解码

### 8.1 单一映射函数

Demo 只能通过一个函数完成 Core Event → Wire Event 映射：

```ts
export function toChatWorkflowStreamWireEvent(
  event: ChatWorkflowStreamEvent,
): ChatWorkflowStreamWireEvent;
```

约束：

```txt
- Route、React Client、Debug Panel 不得各自复制映射；
- Date 一律转 ISO string；
- raw、SDK response、Error、Function、Symbol、BigInt、循环引用不得进入 Wire Event；
- 无法安全映射的字段必须触发可观测失败，不得静默吞掉关键终止信息；
- text:delta 必须原样保留空白文本；空字符串 delta 不得发送。
```

### 8.2 NDJSON 服务端编码

推荐接口：

```ts
function encodeNdjson(event: ChatWorkflowStreamWireEvent): Uint8Array {
  return encoder.encode(`${JSON.stringify(event)}\n`);
}
```

约束：

```txt
- 一条 Wire Event 必须独占一行；
- 不插入 console 前缀、日志文本或 markdown；
- 不在同一行拼接多条 JSON；
- 服务端写入顺序必须等于事件发生顺序；
- workflow:finish / workflow:error 是终止事件，发送后不得继续写入业务事件。
```

### 8.3 浏览器增量解码

浏览器必须使用：

```txt
fetch
↓
response.body.getReader()
↓
TextDecoder.decode(chunk, { stream: true })
↓
pendingBuffer += decodedText
↓
按 "\n" 取出完整行
↓
JSON.parse
↓
validateChatWorkflowStreamWireEvent
↓
dispatchWireEvent
```

禁止：

```txt
- 假设一个 ReadableStream chunk 等于一条完整 JSON；
- 假设一条 JSON 不会被拆分；
- 直接把未验证的 unknown JSON 写入 React State；
- 用 EventSource 发送 POST 聊天请求；
- 依赖最后一次性 JSON 响应伪造流式效果。
```

解析规则：

```txt
- 空行忽略；
- 末尾不完整行保留到下一个 chunk；
- stream 结束后若 pendingBuffer 只有空白，可忽略；
- stream 结束后若 pendingBuffer 含非空未完成 JSON，标记 protocol_error；
- JSON.parse 失败、未知 event.type、字段不合法均标记 protocol_error；
- protocol_error 后停止处理当前轮，并明确提示用户；
- 收到 workflow:finish 或 workflow:error 后忽略后续业务事件并记录协议异常。
```

---

## 九、前端聊天状态机

### 9.1 当前轮状态

建议为当前发送轮维护独立状态，而不是只复用 `isLoading`：

```ts
type ChatTurnStatus =
  | "idle"
  | "preparing"
  | "streaming"
  | "completed"
  | "degraded"
  | "partial-failed"
  | "safety-rejected"
  | "persistence-failed"
  | "failed";
```

语义：

```txt
idle
→ 无请求。

preparing
→ 已发送 POST，尚未收到 workflow:start / text:delta。

streaming
→ 已收到 text:delta，临时 assistant message 正持续拼接。

completed
→ 收到 workflow:finish，且后续刷新持久化 detail 成功。

degraded
→ 收到 workflow:finish，但 trace / debugContext 中存在可恢复后置步骤 degraded。

partial-failed
→ 已收到 text:delta，随后 workflow:error（模型流失败、协议错误等）。

safety-rejected
→ 已有或未有文本，但终止 error 为 output_safety_rejected。

persistence-failed
→ Core 成功完成，但 Demo 持久化失败，Route 发送 persistence_failed。

failed
→ 首个 delta 前失败、请求错误、conversation 不存在或无法创建 pending run。
```

### 9.2 消息显示规则

开始请求时：

```txt
- 禁用重复发送；
- 创建本地 pending user message；
- 创建本地 pending assistant message，text 初始为空；
- 保留一个 localTurnId，避免旧请求事件写入新请求。
```

收到 `text:delta`：

```txt
- 将 text 追加到当前 pending assistant message；
- 状态切换为 streaming；
- 不把 delta 当作已成功持久化 assistant message；
- 不立即写入历史真相源。
```

收到 `workflow:finish`：

```txt
- 校验 delta 聚合文本严格等于 output.text；
- 使用 output 更新最终 Debug Panel；
- 将当前轮标记 completed 或 degraded；
- 请求 conversation detail / messages 的刷新接口，以数据库返回内容替换临时消息；
- 刷新成功后才将本地 pending assistant message 视为持久化完成。
```

收到 `workflow:error`：

```txt
- 停止当前轮；
- 根据 error.code 映射 partial-failed / safety-rejected / persistence-failed / failed；
- 保留已经展示的 delta；
- 不把临时 assistant message 写入 completed history；
- 展示安全错误消息和可读错误码；
- 允许用户发起下一轮，但不得自动重试本轮。
```

### 9.3 文本一致性校验

客户端收到 `workflow:finish` 后必须：

```txt
- 聚合所有 text:delta；
- 与 finish.output.text 做严格字符串比较；
- 不相等时标记 protocol_error；
- 不把该轮标为 completed；
- 显示已收到文本与最终文本不一致的调试信息；
- 刷新后不得把不一致的临时文本覆盖为成功状态。
```

此规则是 Stage 2 的协议验收要求，不能因为 UI 看起来“差不多”而放弃。

---

## 十、Debug Workbench 展示要求

### 10.1 聊天主面板

必须展示：

```txt
- 用户输入；
- 当前 assistant 流式文本；
- preparing / streaming / completed / degraded / failed 等状态；
- 当前 workflowId；
- partial failure 提示；
- Output Safety 拒绝提示；
- persistence failure 提示；
- 发送按钮禁用状态；
- 会话刷新后的持久化消息状态。
```

推荐状态文案：

```txt
准备工作流中
正在生成回复
本轮完成
本轮完成，但部分后置步骤降级
本轮未成功完成，已保留部分输出
输出未通过安全审计，本轮未成功完成
模型回复已生成，但会话持久化失败；刷新后可能丢失
```

### 10.2 Workflow Stream Timeline

Timeline 必须以 `ChatWorkflowStreamWireEvent` 为主时间线，不得用 `CoreObserver` 事件替代。

至少展示：

```txt
workflow:start
step:start
step:end（success / degraded / failed）
tool:call
tool:result
text:delta（可折叠聚合显示，不要求逐 token 单独占大量视觉空间）
workflow:finish
workflow:error
```

每个事件建议展示：

```txt
- 顺序序号；
- type；
- step / status；
- timestamp；
- 精简 summary；
- 可展开 JSON-safe payload；
- 对 tool call / tool result 显示名称、参数和结果摘要。
```

### 10.3 最终 Debug Panel

收到 `workflow:finish` 后，至少可查看：

```txt
- Effective Persona JSON；
- Persona Prompt；
- Final System Prompt；
- effective model profile；
- primary / fallback runtime；
- capabilities 与实际生效能力；
- retry / fallback 信息；
- recalled memories；
- emotion transition；
- tool plan / tool calls / tool results；
- summary read / update；
- extracted / saved / skipped memories；
- workflow trace；
- safety result；
- degraded step 原因。
```

约束：

```txt
- 不展示 modelOutput.raw；
- 不展示 Provider SDK 原始对象；
- 不展示 API key；
- 不将 Console Event 文本当作 Debug 真相来源；
- 页面显示的数据必须来自 Wire finish output、Wire step events 或已持久化 workflow run。
```

### 10.4 CoreObserver 面板

V1.0 的 `CoreObserver` 面板可以继续保留，但必须明确标注：

```txt
CoreObserver
→ 辅助旁路观测。
→ 用于与 V1.0 诊断信息对照。
→ 不是流式聊天 UI 的状态驱动源。
```

---

## 十一、实施子任务

### 11.1 07-01：收敛 Demo 模型配置入口

**目标**

让 Demo 可以选择 OpenAI-compatible 或 Ollama，并以统一 `ModelConfig` 创建 runtime，同时不泄露或持久化敏感凭据。

**怎么做**

```txt
1. 扩展或收敛现有 model-config.ts / model-factory.ts；
2. Provider 切换后按 provider 显示对应字段；
3. OpenAI-compatible 显示 model、baseUrl、fallback、retry、capabilities override；
4. Ollama 显示 model、host、keepAlive、capabilities override；
5. API key 可选 override 仅存在于当前前端内存与单次请求；
6. API Route 将 config 传入 createConversationRuntime() 或等价宿主工厂；
7. Debug Panel 只展示已脱敏的配置和 effective model profile。
```

**完成标准**

```txt
- 切换 Provider 后无需修改 ai-core；
- Ollama 与 OpenAI-compatible 均可创建 ChatModel；
- API key 不落库、不回传、不出现在 trace；
- effective profile 可在页面看到。
```

### 11.2 07-02：实现 Core Event → Wire Event → NDJSON 服务端管道

**目标**

使持久化会话 Route 可以实时把安全的 Wire Event 写给浏览器。

**怎么做**

```txt
1. 实现或完善 chat-stream-wire.ts 的唯一映射函数；
2. 实现 chat-stream-transport.ts 的 encodeNdjson()；
3. 将 /api/conversations/[id]/messages 改为 ReadableStream Response；
4. 先 createPendingRun()，再开始核心 stream；
5. 逐个消费 core.streamWorkflow()；
6. 非 finish 事件即时 enqueue；
7. finish 先暂存，completeRun() 成功后才 enqueue；
8. 任何已开始流后的错误转换为 workflow:error 并 close；
9. 保持 legacy /api/chat 不变或显式标记 legacy。
```

**完成标准**

```txt
- 浏览器可在模型未完成时收到 text:delta；
- 每行是合法独立 JSON；
- workflow:finish 只在持久化成功后发送；
- Core 成功但持久化失败时发送 persistence_failed，而不是 finish。
```

### 11.3 07-03：实现浏览器 NDJSON Parser 与 Wire Event Guard

**目标**

让前端在真实网络分片下可靠消费 NDJSON。

**怎么做**

```txt
1. 用 TextDecoder 的 stream 模式；
2. 引入 pendingBuffer；
3. 封装可复用 async generator 或 parser；
4. 对每行 JSON.parse；
5. 用 runtime guard 校验 Wire Event type 与必要字段；
6. 对半行、空行、多行同批、非法 JSON、未知 type、finish/error 后额外事件建立明确错误处理；
7. 不将 parser 与 React 组件逻辑混写。
```

**完成标准**

```txt
- 人为将一条 JSON 拆成多个 chunk 仍可解析；
- 人为一个 chunk 放入多行 JSON 仍可按顺序解析；
- 非法 Wire Event 进入 protocol_error，而不是 silent ignore；
- Parser 可由页面与本地验证脚本复用。
```

### 11.4 07-04：升级会话聊天 UI 为流式状态机

**目标**

让聊天 UI 使用 Stream Event 实时展示输出，并和数据库持久化结果正确收敛。

**怎么做**

```txt
1. 将当前一次性 response.json() 消费逻辑改为 NDJSON consume；
2. 引入 localTurnId 和 ChatTurnStatus；
3. 创建临时 user / assistant message；
4. text:delta 只追加临时 assistant 文本；
5. finish 时校验文本一致性并刷新 conversation detail；
6. error 时保留 partial text 并显示明确失败状态；
7. 禁止把 client history 作为服务端会话历史真相来源；
8. 发送按钮在当前轮终止前禁用。
```

**完成标准**

```txt
- 回复逐字可见；
- 页面刷新后成功消息来自 DB；
- partial failure 不被显示为 completed；
- 用户可以区分模型失败、安全拒绝、持久化失败与可恢复降级。
```

### 11.5 07-05：实现 Timeline 与最终 Debug Panel 收敛

**目标**

让 Debug Workbench 不需要 console 就可以验证全部 V1.1 主链路。

**怎么做**

```txt
1. 新增或升级 Workflow Stream Timeline；
2. 显示每个 step:start / step:end 的状态与 summary；
3. 聚合展示 text:delta，避免一 token 一行造成 UI 不可用；
4. finish 时展示 SerializableChatWorkflowOutput；
5. error 时展示 SafeWorkflowError、已累积文本和终止位置；
6. 保留并明确区分 Observer Events 与 Stream Timeline；
7. 展示 provider / effective model profile / runtime / fallback / capability。
```

**完成标准**

```txt
- 不打开开发者工具即可完成全部人工验收；
- Timeline 能解释一次回复为何调用工具、为何降级或为何失败；
- Debug Panel 不展示敏感凭据和不可序列化 raw。
```

### 11.6 07-06：人工验证脚本与回归记录

**目标**

为阶段 7 提供可重复的浏览器与本地 Console 验证路径，不引入单元测试或 E2E 测试体系。

**怎么做**

```txt
1. 在合适位置新增 NDJSON parser / encoder 的开发验证脚本；
2. 通过可控 mock stream 构造半行、多行、finish、error、protocol error；
3. 在 Demo 页面验证真实 OpenAI-compatible 与 Ollama 流；
4. 将每个场景的实际结果记录到 .code-reviews/v1.1/ 对应 Stage 7 review；
5. 不要求引入 Vitest、Playwright、E2E。
```

**完成标准**

```txt
- 每个验收场景有操作步骤、预期与实际结果；
- 失败场景可在 Demo 中看见，而不是只依赖 terminal stack trace；
- Stage 7 review 可支撑阶段 8 最终收口。
```

---

## 十二、人工验收场景

### 场景 A：OpenAI-compatible 正常流式聊天

```txt
1. 选择 provider=openai-compatible；
2. 配置有效 model 与环境变量 / 当前页 API key；
3. 选择一个已有 conversation；
4. 发送普通聊天消息。

预期：
- 先出现 workflow:start / 前置步骤；
- assistant 文本逐字或分段出现；
- 结束后出现 workflow:finish；
- UI 标记 completed；
- 刷新页面仍存在用户和 assistant 消息；
- Debug Panel 可看到 Persona、Prompt、Runtime、Trace。
```

### 场景 B：Ollama 正常流式聊天

```txt
1. 本地启动 Ollama；
2. 选择 provider=ollama；
3. 配置 host 与一个已拉取的支持 stream 的模型；
4. 发送普通聊天消息。

预期：
- Core API 不变；
- 仍有 text:delta；
- 页面显示 provider=ollama 与 effective model profile；
- Persona、Memory、Emotion 仍正常参与；
- Embedding Provider 仍使用既有宿主配置，不要求 Ollama embedding。
```

### 场景 C：工具规划与最终流式回复

```txt
1. 使用支持 toolCalling 的模型 profile；
2. 发送需要当前时间或 memory 查询的消息。

预期：
- Timeline 显示 tool planning、tool:call、tool:result；
- 最终自然语言回复才产生 text:delta；
- 不产生一份被丢弃的非流式最终回答；
- finish output 中可看到 toolResults。
```

### 场景 D：无工具调用

```txt
1. 发送普通寒暄消息。

预期：
- 不出现 tool:call / tool:result；
- 直接进入最终 text:delta；
- 不因 tool plan 产生重复面向用户回答。
```

### 场景 E：模型 fallback 与能力变化

```txt
1. 配置 primary / fallback；
2. 让 primary 在首个 delta 前失败；
3. fallback profile 与 primary 的能力不同。

预期：
- Timeline / Runtime 显示 retry 或 fallback；
- effective profile 以实际接管模型为准；
- tool 流程按当前有效能力降级，不按 provider 名称猜测；
- 可成功时仍走 finish；无可用 fallback 时走 error。
```

### 场景 F：已输出文本后的失败

```txt
1. 使用可控模型或开发 mock，让首个 text:delta 后抛出失败。

预期：
- 已有文本保留；
- UI 标记 partial-failed；
- 不发送 workflow:finish；
- 该轮不写为 completed assistant message；
- Timeline 有 workflow:error。
```

### 场景 G：Output Safety 拒绝

```txt
1. 使用可控 Safety Provider 触发 output_safety_rejected。

预期：
- 即使已有 delta，页面明确显示输出未通过安全审计；
- 不标记完成；
- 不发送 workflow:finish；
- 不伪装为普通模型失败。
```

### 场景 H：Core 成功但持久化失败

```txt
1. 使用可控 Repository 或临时故障触发 completeRun 失败。

预期：
- text:delta 已保留；
- 不发送 workflow:finish；
- 收到 persistence_failed；
- 页面显示刷新后可能丢失；
- 不把当前临时消息加入 completed history。
```

### 场景 I：NDJSON 网络分片

```txt
1. 使用开发验证脚本或 mock Response；
2. 分别构造：
   - 一条 JSON 被拆成多个 chunk；
   - 一个 chunk 中有多条 JSON；
   - 空行；
   - 非法 JSON；
   - finish 后额外 event。

预期：
- 半行可正确拼接；
- 多行按顺序 dispatch；
- 空行忽略；
- 非法协议显示 protocol_error；
- finish/error 后额外事件不污染当前轮。
```

### 场景 J：Persona 与 Prompt Preview

```txt
1. 在 companion-form 配置 userAddress、hobbies、appearance；
2. 保存后发送消息。

预期：
- 下一轮 runtime 使用最新 companion；
- Prompt Preview 与 finish debugContext 一致；
- 伴侣可自然使用称呼；
- 不出现 Demo 侧重复注入的称呼文本。
```

---

## 十三、阶段交付清单

```txt
[Route]
- /api/conversations/[id]/messages 使用 NDJSON
- pending / complete / fail / persistence-failed 语义明确

[Transport]
- Core → Wire 单一 mapper
- NDJSON encoder
- Browser incremental parser + runtime guard

[UI]
- 流式 assistant 临时消息
- ChatTurnStatus
- Workflow Stream Timeline
- Final Debug Panel
- Provider / model / Persona 配置入口

[Security]
- api key 不持久化、不回显、不进 trace
- raw / SDK 对象不进入 Wire Event

[Verification]
- OpenAI-compatible / Ollama 正常流
- Tool / no-tool
- fallback 能力变化
- partial failure
- safety rejection
- persistence failure
- NDJSON split / malformed protocol
```

---

## 十四、完成定义

本阶段完成不等于“页面上有一个逐字显示的回复”。

真正完成标志是：

> Demo 能以 `POST + fetch + ReadableStream + NDJSON` 稳定消费 `core.streamWorkflow()` 的结构化工作流事件；用户可实时看到伴侣回复，开发者可在同一页面确认模型、Persona、工具、记忆、情绪、Safety、写回与失败语义；并且只有在 Core 与 Demo 持久化均成功后，该轮才会被标记为完成。

阶段 7 完成后，才能进入阶段 8 的文档同步、V1.1 review 归档与最终验收收口。
