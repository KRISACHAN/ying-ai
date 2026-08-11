# AI Companion Core V1.1 - 阶段 8：Documentation and Review 实施文档

## 一、阶段目标

在阶段 1～7 已完成 Persona 扩展、V1.1 契约与 Wire 协议、模型能力档案与工具规划、工作流步骤函数化、工作流级流式执行、Ollama Adapter、Debug Workbench 流式闭环之后，完成 V1.1 的**文档同步、人工验收、代码审查归档与版本收口**。

本阶段不是新增功能阶段。

本阶段要确保仓库对人和对 AI 都能准确回答以下问题：

```txt
V1.1 做了什么？
当前 Core 如何以流式方式工作？
宿主如何配置 OpenAI-compatible 与 Ollama？
哪些能力属于 Core，哪些属于 Demo？
流式完成、部分失败、降级、持久化失败分别代表什么？
后续开发者应从哪里阅读和继续扩展？
V1.1 是否已经具备可冻结、可回归、可继续演进的质量基线？
```

本阶段交付：

1. 与真实代码一致的项目、包级与调试工作台文档；
2. V1.1 全链路人工验收记录；
3. `.code-reviews/v1.1/` 版本化 review archive；
4. V1.1 结论与遗留风险记录；
5. 可供后续 V1.2 / 用户系统阶段复用的稳定基线说明。

---

## 二、前置基线

### 2.1 阶段 1～7 已完成能力

本阶段以 `prod` 分支中已经完成的 V1.1 Stage 1～7 为唯一实现基线。

```txt
阶段 1：Persona Profile
├── CompanionPersona 扩展
├── 用户显示名 / 用户称呼
├── 兴趣与外貌画像
├── Effective Persona
├── Persona Prompt Preview
└── Demo Persona 编辑与持久化

阶段 2：V1.1 Contract / Stream / Wire
├── executeWorkflow() 保持兼容
├── streamWorkflow()
├── ChatWorkflowStreamEvent
├── ChatWorkflowStreamWireEvent
├── SafeWorkflowError
└── POST + fetch + ReadableStream + NDJSON

阶段 3：Model Provider Strategy
├── ModelProfile / ModelCapabilities
├── primary / fallback 能力语义
├── ToolPlanningProvider / ToolPlan
└── 宿主侧 ModelConfig 策略装配

阶段 4：Workflow Step Refactor
├── execute / stream 共用步骤函数
├── trace / observer / degraded 语义保持一致
└── 不再由两套工作流路径各自维护流程

阶段 5：Streaming Workflow
├── SimpleChatWorkflow.stream()
├── text:delta × N
├── workflow:finish / workflow:error
├── 完整文本后的 output safety
└── Summary / Memory 后置写回

阶段 6：Ollama Adapter
├── packages/model-ollama
├── OllamaChatModel
└── ChatModel 契约兼容

阶段 7：Debug Workbench Streaming
├── Provider / Model / Persona 配置
├── 持久化会话 NDJSON 流式入口
├── 浏览器增量解析
├── Workflow Timeline
├── runtime / fallback / tool / memory / emotion / summary 观察
└── 成功、降级、部分失败、拒绝、持久化失败状态展示
```

### 2.2 本阶段职责边界

```txt
packages/ai-core
→ Core 契约、工作流、流事件、模型能力抽象。
→ 不负责 HTTP、NDJSON、Next.js、数据库、环境变量或 Demo UI。

packages/model-ollama
→ Ollama ChatModel Adapter。
→ 不负责 Demo 路由、数据库、Wire Event 或前端状态。

apps/model-runtime-demo
→ 宿主配置、模型工厂、NDJSON、持久化会话、可观测调试 UI。

.docs / README / AGENTS.md
→ 解释真实架构、运行方式、边界、验收与后续阅读路径。

.code-reviews/v1.1
→ 保存阶段实施后的审查、复核、修复跟踪与最终结论。
```

---

## 三、阶段完成标准

完成本阶段后，必须满足：

- `README.md`、`AGENTS.md`、`.requirements/README.md`、相关 package README 与 `docs/` 不包含已过期的 V1.0-only 描述；
- 所有文档描述必须以 `prod` 当前代码为准，不得把计划中的未来能力写成已经完成；
- 人类阅读入口能够说明 V1.1 的架构、运行方式、环境变量、Demo 使用方法与边界；
- AI 阅读入口能够明确 V1.1 当前状态、阅读顺序、阶段文档与 review archive 路径；
- `packages/ai-core` 文档明确 `executeWorkflow()` 与 `streamWorkflow()` 的区别、Core Event / Wire Event 边界、能力档案与扩展方式；
- `packages/model-ollama` 文档明确本地 Ollama 前置条件、配置方法、能力声明与限制；
- `apps/model-runtime-demo` 文档明确本地启动、模型配置、API key 处理、NDJSON 流式调试与持久化行为；
- V1.1 人工验收场景全部完成并记录结果；
- V1.1 代码审查记录进入 `.code-reviews/v1.1/`；
- 发现的问题必须区分为：已修复、可接受限制、后续版本待办；
- 相关 package 的 typecheck、lint、build 均通过；
- 不因补文档或 review 而引入与 V1.1 无关的重构。

---

## 四、本阶段范围与非目标

### 4.1 本阶段必须做

```txt
- 真实代码与文档逐项对齐
- 更新 README.md
- 更新 AGENTS.md
- 更新 .requirements/README.md
- 更新 packages/ai-core/README.md
- 新增或更新 packages/model-ollama/README.md
- 更新 apps/model-runtime-demo/README.md
- 更新 docs/ 中与 V1.1 架构、运行方式、调试方式相关的文档
- 补充 V1.1 人工验收 checklist 与执行结果
- 按仓库规范创建 .code-reviews/v1.1/ review archive
- 产出 V1.1 conclusion / release readiness 结论
```

### 4.2 本阶段明确不做

```txt
- 新增 Core 功能
- 改变 Persona、Memory、Emotion、Tool、Workflow 的业务语义
- 新增用户系统、鉴权、多租户、部署、商业化
- 新增 LangChain、LangGraph、多 Agent
- 新增流式中断恢复、断线续传、WebSocket、SSE 主通道
- 新增 Ollama Embedding Provider
- 为“文档看起来完整”而虚构不在代码中的能力
- 因文档阶段重写 Stage 1～7 已完成代码
```

---

## 五、文档更新矩阵

### 5.1 根目录 `README.md`：面向人类的项目总览

必须更新或确认以下内容：

```txt
项目定位
→ AI Companion Core SDK + Debug Workbench。

当前版本状态
→ V1.0 已冻结；V1.1 已完成 Persona、流式工作流、多模型策略、Ollama 与 Debug Workbench 升级。

Monorepo 结构
→ apps / packages / docs / requirements / code-reviews 的职责。

快速开始
→ 安装依赖、数据库准备、环境变量、启动 Demo。

模型 Provider
→ OpenAI-compatible 与 Ollama 的基本配置方式。

调试能力
→ Persona 配置、流式输出、Timeline、runtime、memory、emotion、summary、tool 结果。

边界
→ 当前无用户系统、无鉴权、无生产部署；Demo 不等于正式产品 UI。

阅读入口
→ 人类从 README 开始；AI 从 AGENTS.md 开始。
```

禁止：

```txt
- 把 API key 写进示例值或截图；
- 把旧的“一次性 JSON 聊天入口”描述为推荐主通道；
- 把未完成的 V1.2 / 产品层功能写成当前能力；
- 仅罗列技术栈而不说明实际架构边界。
```

### 5.2 `AGENTS.md`：面向 AI 的仓库入口

必须更新或确认：

```txt
Read Path
→ 继续要求先读 AGENTS.md、docs/ai/core、requirements、package README、code-reviews。

Project Snapshot
→ 将 ai-core、model-ollama、Debug Workbench 的 V1.1 状态更新为真实完成状态。

Current Package / Current Version
→ V1.0 frozen；V1.1 已完成并指向对应 stage 与 review archive。

Requirement Map
→ 明确 04-v1.1-plan.md 与 stages/v1.1/stage-01 ~ stage-08 的关系。

Package Context
→ 增加 packages/model-ollama/README.md 的阅读入口。

Non-Negotiables
→ 保持 ai-core 不读 env、不依赖第三方 SDK / HTTP / 数据库；模型 Adapter 与宿主职责分离；Wire Event 不直接透传 Core raw。
```

### 5.3 `.requirements/README.md`：需求体系说明

必须补充：

```txt
- V1.1 已完成的阶段目录结构；
- Stage 8 的定位：文档、验收、review 收口，不新增功能；
- prompts 是总体规划，stages 是执行规格，code-reviews 是实施后审查记录；
- 后续版本必须以冻结的 V1.1 基线为前置条件，不修改历史 stage 文档来伪造过程。
```

### 5.4 `packages/ai-core/README.md`：Core SDK 文档

必须准确说明：

```txt
核心入口
→ createCompanionCore()
→ executeWorkflow()
→ streamWorkflow()

双路调用语义
→ executeWorkflow：完整结果、兼容旧宿主、后台或非流式场景。
→ streamWorkflow：AsyncIterable<ChatWorkflowStreamEvent>，用于聊天 UI 与实时调试。

流事件
→ workflow:start / step:start / step:end / text:delta / tool:call / tool:result / workflow:finish / workflow:error。

完成语义
→ workflow:finish 代表 Core 已完成完整工作流；仅有 text:delta 不代表成功完成。

错误语义
→ 首个 delta 前失败、已输出部分文本后失败、Safety 拒绝、degraded 后置任务的差异。

Persona
→ Effective Persona、Prompt Builder、systemPrompt 与结构化 Persona 的关系。

模型
→ ChatModel、ModelProfile、ModelCapabilities、primary / fallback 语义。

扩展点
→ PersonaProvider、MemoryProvider、EmotionEngine、ToolRegistry / ToolProvider、SafetyProvider、ToolPlanningProvider、ChatWorkflow、Observer。

边界
→ ai-core 不读取环境变量、不依赖 OpenAI / Ollama SDK、不依赖数据库、不依赖 Next.js / HTTP / NDJSON。
```

### 5.5 `packages/model-ollama/README.md`：Ollama Adapter 文档

必须说明：

```txt
前置条件
→ 本地 Ollama 服务可用。
→ 对应模型已 pull 并可被 Ollama 运行。

安装与运行示例
→ 仅给出不含私钥的 host / model / keepAlive 示例。

Adapter 入口
→ createOllamaChatModel() 或当前真实导出 API。

能力配置
→ ModelProfile / ModelCapabilities 可由宿主按具体模型声明或覆盖。

限制
→ V1.1 不提供 Ollama Embedding Provider。
→ 具体模型是否支持工具调用、usage、稳定流式能力取决于模型与宿主声明。
→ Core 不通过 provider 名称猜测能力。

边界
→ package 只实现 ChatModel Adapter，不负责 Demo、HTTP、NDJSON、数据库或 env 读取。
```

### 5.6 `apps/model-runtime-demo/README.md`：Debug Workbench 文档

必须说明：

```txt
应用定位
→ 长期保留的 Core Workflow Debug Workbench，不是正式产品 UI。

启动方法
→ 安装、数据库、迁移、启动命令，以仓库真实脚本为准。

Provider 配置
→ OpenAI-compatible / Ollama。
→ API key 只存在于页面内存与单次 POST；不得写入数据库、sessionStorage、trace、Wire Event 或日志。

数据持久化
→ companion / conversation / messages / workflow runs 的调试用途与恢复边界。

流式协议
→ POST + fetch + ReadableStream + NDJSON。
→ EventSource / SSE 不是主通道。

可观测性
→ Prompt、Effective Persona、Timeline、runtime、fallback、工具、记忆、情绪、摘要、写回结果。

状态解释
→ success / degraded / partial-failed / failed / safety-rejected / persistence-failed。

安全边界
→ Demo 仅用于本地调试；不等同于生产安全体系。
```

### 5.7 `docs/`：架构与运行文档

按现有文档组织方式更新；不要为了 V1.1 新建重复的“第二套架构文档”。

至少需要覆盖：

```txt
- V1.1 Core Architecture
- Stream Workflow Lifecycle
- Core Event / Wire Event / NDJSON Boundary
- Model Provider Strategy and Capability Profiles
- Ollama Local Development Guide
- Debug Workbench Observability Guide
- V1.1 Limitations and Future Extension Points
```

文档内容应以链接方式复用 `packages/*/README.md` 与 `.requirements/stages/v1.1/*`，避免把同一份接口定义复制到多处后漂移。

---

## 六、V1.1 人工验收规范

本项目当前不要求补齐单元测试与 E2E 测试；但阶段 8 必须完成可重复执行的人工验收，并记录证据。

### 6.1 验收记录位置

建议新增：

```txt
.code-reviews/v1.1/
  acceptance/
    manual-verification.md
    environment-template.md
    evidence-index.md
  conclusion.md
```

若仓库已有更严格的 `.code-reviews/README.md` 命名规范，以该规范为准；不得绕开既有 review archive 规则。

`manual-verification.md` 必须记录：

```txt
- 验收日期
- 使用的 commit SHA
- 本地环境说明（不得记录 API key）
- Provider / 模型名称
- 执行场景
- 预期结果
- 实际结果
- 证据位置（截图、控制台脱敏摘要、workflow run id、代码引用）
- 结论：通过 / 失败 / 已知限制
```

### 6.2 必测场景

#### 场景 A：Persona 配置与 Prompt 生效

```txt
准备：
- 设置 userDisplayName：陈大鱼头
- 设置 userAddress：鱼头
- 设置 hobbies：烘焙、电影
- 设置 heightCm：165
- 设置 hair：黑色长直发

验证：
- Effective Persona JSON 正确；
- Persona Prompt Preview 与 Final System Prompt 分区清晰；
- 未填写字段不出现占位噪音；
- 伴侣可自然使用“鱼头”，但不要求每句都使用；
- Persona 配置没有被写入 Memory / Summary。
```

#### 场景 B：OpenAI-compatible 正常流式聊天

```txt
验证：
- POST 持久化会话消息入口返回 application/x-ndjson；
- UI 在收到 text:delta 时增量显示文本；
- 多个 delta 拼接后严格等于 workflow:finish.output.text；
- workflow:finish 后页面能展示最终 runtime、Prompt、Emotion、Memory、Summary 与写回结果；
- 刷新页面后，成功消息与 workflow run 可恢复。
```

#### 场景 C：Ollama 正常流式聊天

```txt
准备：
- 本地 Ollama 服务可用；
- 使用已 pull 的聊天模型；
- 在 Demo 切换 provider=ollama。

验证：
- Core API 不因 provider 改变而变化；
- 流式回复可正常显示；
- runtime / effective model profile 正确显示 ollama 与模型名；
- 未支持工具调用的模型不会被宿主按 provider 名称强行走工具分支。
```

#### 场景 D：工具规划与最终流式回答

```txt
验证：
- 工具规划只得到 no_tool 或 tool_calls；
- no_tool 时直接进入 Final Response Stream；
- tool_calls 时先执行工具，再进入最终回复流；
- 不出现“先 generate 一段用户可见回答，丢弃后再 stream 一段”的双回答；
- Timeline 可区分 tool planning、tool call、tool result 与 text:delta。
```

#### 场景 E：模型 fallback 与能力差异

```txt
验证：
- 主模型失败且 fallback 接管时，runtime 标明实际模型；
- fallback 能力与主模型不同，Workflow 按实际 effective profile 决策；
- fallback 不支持 streaming 时，在首个 delta 前明确 workflow:error，不伪造流式完成；
- fallback 不支持 tool calling 时，工具规划降级为 no_tool，并留下可观察标记；
- 不通过 provider 名称判断 capability。
```

#### 场景 F：Output Safety 与后置任务语义

```txt
验证：
- 流结束后才执行完整文本 output safety 审计；
- output safety 拒绝时不得发送 workflow:finish；
- Summary / Memory / Emotion 的可恢复失败被标为 degraded 时，主回复可以完成，但 Debug Context / Timeline 必须清楚展示；
- 已输出部分文本后发生模型或后置错误时，UI 保留 partial text 并明确标为未成功完成。
```

#### 场景 G：Wire / NDJSON 健壮性

```txt
验证：
- 一个网络 chunk 含多行 JSON 时可正确解析；
- 一行 JSON 被拆到多个网络 chunk 时可正确解析；
- 非法 JSON、非法 event type、Wire DTO 不合法时 UI 不静默成功；
- Core Event 的 Date、raw、Error 实例等不会直接泄漏进 Wire Event；
- API key 不存在于 Wire Event、数据库、Timeline、trace 或日志。
```

#### 场景 H：回归与工程检查

```txt
验证：
- executeWorkflow() 旧调用路径仍可得到完整 ChatWorkflowOutput；
- streamWorkflow() 与 executeWorkflow() 在等价输入下，Persona / Memory / Emotion / Tool / Summary 语义一致；
- ai-core 不读取 env，不引入 Ollama/OpenAI SDK，不依赖 HTTP、Next.js 或数据库；
- model-ollama 不依赖 Demo；
- typecheck、lint、build 全部通过。
```

---

## 七、代码审查与复核要求

### 7.1 Review 范围

V1.1 review 必须覆盖：

```txt
架构边界
- ai-core / model-ollama / demo 的依赖方向是否正确。
- Core Event 与 Wire Event 是否真正分离。

API 兼容
- executeWorkflow() 是否保持旧宿主可用。
- streamWorkflow() 是否有稳定完成与错误语义。

模型策略
- capabilities 是否按具体模型 profile 生效。
- primary / fallback 切换是否可观测。
- 不支持能力时是否显式失败或降级。

流式与持久化
- NDJSON 编解码是否处理 chunk 边界。
- finish 是否严格晚于持久化成功。
- partial failure 是否不会伪装成功。

Persona
- 结构化字段与 systemPrompt 是否避免重复注入。
- 配置变更是否不会污染 Memory / Summary。

安全与隐私
- API key 是否可能进入持久化、Wire、trace、日志。
- raw Provider SDK 对象是否可能穿透网络层。

文档一致性
- README / AGENTS / package README / docs 是否与代码一致。
```

### 7.2 Review Archive 结构

遵循仓库既有 `.code-reviews/README.md` 的目录和命名规则。

V1.1 至少应具备：

```txt
.code-reviews/v1.1/
  {n}-{short-sha}/
    cursor-review.md
    codex-review.md
    claude-review.md
    {tool}-followup.md
  acceptance/
    manual-verification.md
    evidence-index.md
  conclusion.md
```

并非每一种工具都必须产生 review；但每个实际执行的 review 必须保留原始结论、修复动作与复核结果。

### 7.3 问题分级与收口原则

```txt
P0
→ 会破坏数据、泄漏密钥、伪造成功、破坏 API 兼容、导致工作流无法可靠完成。
→ 必须修复后才可冻结 V1.1。

P1
→ 功能可用但边界错误、可观测性缺失、文档与代码冲突、明显扩展风险。
→ 原则上修复；若不修复，必须写入 conclusion 的已知限制。

P2
→ 命名、局部重复、非关键展示体验、可后续优化。
→ 可记录为 V1.2 候选，不阻塞 V1.1。
```

---

## 八、V1.1 最终结论文档

新增或更新：

```txt
.code-reviews/v1.1/conclusion.md
```

必须包含：

```txt
1. V1.1 范围完成情况
2. 最终基线 commit SHA
3. 已完成能力摘要
4. 已执行人工验收与结果索引
5. 已执行 review 与结果索引
6. 已修复问题摘要
7. 可接受的已知限制
8. 明确不属于 V1.1 的后续候选
9. 是否建议冻结 / 打 tag 的结论
```

### 8.1 可接受的 V1.1 已知限制候选

以下限制可以保留，但必须如实记录，不能在 README 中隐藏：

```txt
- 不支持停止生成、断线重连、续传、token 重放；
- 不支持文本已输出后的模型切换继续生成；
- 不支持真正的流式多轮 Tool Loop；
- output safety 为完整文本后的审计，不是逐 token 拦截；
- Ollama 是否支持 tool calling / usage 取决于具体模型与配置；
- 不包含 Ollama Embedding Provider；
- Demo 是调试工作台，不是正式产品 UI 或生产安全方案；
- 不包含用户系统、鉴权、多租户隔离与商业化。
```

---

## 九、建议执行顺序

```txt
1. 读取 Stage 1～7 的最终代码与 review 记录
2. 执行 typecheck / lint / build，记录真实结果
3. 按第六章逐项完成本地人工验收
4. 修复 P0 / P1 问题，必要时回写对应 Stage 的 follow-up review
5. 更新 package README 与 docs
6. 更新根 README、AGENTS.md、.requirements/README.md
7. 创建 / 补全 .code-reviews/v1.1 archive
8. 生成 conclusion.md
9. 对照本文件完成标准做最终复核
10. 决定是否冻结 V1.1 / 创建 tag
```

> 文档必须在人工验收与 review 之后收口。先写文档、后发现真实行为不同，会让文档再次漂移。

---

## 十、最终验收清单

```txt
架构
[ ] ai-core 仍是纯 SDK，不读 env、不依赖第三方模型 SDK / HTTP / DB。
[ ] model-ollama 是独立 Adapter，不依赖 Demo。
[ ] Demo 负责 NDJSON、持久化、UI 和宿主配置。

功能
[ ] Persona 扩展真实影响后续聊天。
[ ] OpenAI-compatible 与 Ollama 都可通过同一 Core API 聊天。
[ ] 流式文本真实增量输出。
[ ] executeWorkflow 与 streamWorkflow 都可用。
[ ] 工具规划、工具执行、最终流回答边界明确。
[ ] fallback 与 capability 差异可观察。

流与错误
[ ] Core Event 与 Wire Event 分离。
[ ] NDJSON 可处理网络 chunk 边界。
[ ] workflow:finish 不会在持久化失败或工作流失败时伪造发送。
[ ] partial-failed、failed、safety-rejected、degraded 可区分。

安全
[ ] API key 不进入数据库、Wire Event、Timeline、trace、日志或文档示例。
[ ] raw / Error / 不可序列化对象不进入 Wire Event。

文档与审查
[ ] README、AGENTS、requirements、package README、docs 与代码一致。
[ ] .code-reviews/v1.1 有可追溯 review archive。
[ ] manual verification 有真实结果与证据索引。
[ ] conclusion.md 明确冻结结论与已知限制。
```

---

## 十一、阶段完成后状态

完成阶段 8 后，V1.1 应达到：

```txt
一个可配置 Persona、
支持 OpenAI-compatible 与 Ollama、
可流式输出完整工作流事件、
具备可观测 Debug Workbench、
保留 executeWorkflow 兼容路径、
边界与已知限制清楚、
文档和 review 可追溯的 AI Companion Core SDK 基线。
```

后续 V1.2 或产品层开发必须以冻结后的 V1.1 基线为前提；不得通过修改本阶段文档来掩盖后续需求变化。
