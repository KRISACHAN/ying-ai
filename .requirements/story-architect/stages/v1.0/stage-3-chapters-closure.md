# Stage 3: 章节生成 + 流程闭环

> 所属版本: v1.0 MVP
> 前置文档: [architecture.md](../../architecture.md)、[01-v1.0-plan.md](../../prompts/01-v1.0-plan.md)、[stage-1-framework-worldbuilding.md](stage-1-framework-worldbuilding.md)、[stage-2-characters-outline.md](stage-2-characters-outline.md)

---

## 一、目标与范围

### 1.1 核心目标

完成最后一步——**章节正文生成**，并把前三阶段已经搭好的骨架封成一个可端到端跑通的闭环 mvp：

```
灵感输入 → 世界观 → 人物 → 大纲 → 章节正文（AI 流式生成 + 自动保存）
                                            ↑
                                            └── 本阶段交付
```

本阶段是 v1.0 MVP 的收尾：技术链路在前两阶段已验证，本阶段不再引入新的基础设施，只增加**章节写作 prompt + 章节内容保存工具 + 章节页面**，再补上使 mvp 完整可用的最小收尾（基础错误提示、loading 状态、回退跳转）。

### 1.2 本阶段做什么

- 章节页面 `/p/[id]/chapters`：
  - 替换 Stage 2 的占位页，落地为真实章节页
  - 左栏聊天，右栏章节列表，点击某章选中
  - 选中章节后，右栏在列表下方（或列表切换为详情视图）用预格式化文本块只读展示该章已生成的正文
  - 「生成初稿」「续写」都由 AI 通过工具自动落库
- AI 章节写作：
  - 新增 `saveChapterContent` 工具（覆盖式保存，用于初稿）
  - 新增 `appendChapterContent` 工具（尾部追加，用于续写）
  - 章节阶段 system prompt：注入世界观、人物、全部章节大纲、当前选中章节的已有正文
  - 用户说"生成本章"，AI 流式生成完整章节正文，调用工具自动保存到 `Chapter.content`
  - 用户说"续写"，AI 从当前结尾继续生成，追加到末尾
- 流程闭环收尾：
  - 顶部进度条改为**可点击回退**到任意已完成步骤（architecture.md 已约定）
  - 基础错误提示（AI 调用失败、网络异常时 toast/红字提示重试）
  - 基础 loading 状态（流式输出中、保存中的视觉反馈）
  - 首页项目卡片点击进入章节页时，若已有正文应正确展示
  - 端到端流程走查：从创建项目到第一章正文生成再到续写

### 1.3 本阶段明确不做

| 不做项                                        | 原因                                                        |
| --------------------------------------------- | ----------------------------------------------------------- |
| Markdown 富文本编辑器（@uiw/react-md-editor） | plan 已明确：MVP 用预格式化文本块只读展示即可，编辑能力后置 |
| 选中改写、润色、反馈建议、章节摘要生成        | architecture.md 明确 mvp 不需要                             |
| 章节正文的手动编辑/保存 API                   | 只读展示 + AI 生成，不开放手动编辑（后续版本再做）          |
| 章节的新增/删除/重排                          | 大纲在 Stage 2 已固定，章节页只负责正文                     |
| 导出小说（txt/md/epub）                       | v1.0 不做导出，复制粘贴即可                                 |
| 项目删除、标题编辑、世界观/人物手动编辑       | 仍保持前两阶段的极简程度，不扩范围                          |
| 多章节批量生成（"一次写完所有章节"）          | mvp 逐章生成即可，批量生成会拉长单次响应时间、失败成本高    |
| 响应式/移动端适配                             | 固定桌面布局                                                |

---

## 二、技术架构要点

### 2.1 整体调用链（新增部分高亮）

```
浏览器                        Next.js Server                  DB / LLM
  │                              │                             │
  │  （Stage 1/2 已有：创建项目→世界观→人物→大纲）              │
  │                              │                             │
  │  1. 大纲页点「下一步」→ 跳到 /p/[id]/chapters               │
  │ ──────────────────────────► │                             │
  │                              │ ── UPDATE step=CHAPTERS ──► │
  │                              │ ── SELECT Project+World+   │
  │                              │    Characters+Chapters ────►│
  │  ◄── 渲染章节页（左聊天/右列表）                           │
  │                              │                             │
  │  2. 用户点击右侧章节列表中的"第 3 章"                       │
  │ ──────────────────────────► │                             │
  │  ◄── 右栏切到详情视图，展示第 3 章已有正文                 │
  │                              │                             │
  │  3. 用户在聊天框输入"生成本章初稿"，POST /api/chat/[id]     │
  │     { step: "CHAPTERS", currentChapterId: "xxx" }         │
  │ ──────────────────────────► │                             │
  │                              │ ── SELECT 全量上下文 +     │
  │                              │    当前 chapter.content ──►│
  │                              │ ── streamText(step=CHAPS, │
  │                              │   tools=[saveChap,append])► LLM
  │  ◄── 流式文本 chunk（正文逐字出现）                        │
  │                              │ ◄── tool call saveChapter  │
  │                              │ ── UPDATE Chapter.content ►│
  │  ◄── tool result 事件 ─────  │  （右栏详情视图刷新正文）   │
  │                              │                             │
  │  4. 用户说"继续写"，POST /api/chat/[id]                    │
  │     { step: "CHAPTERS", currentChapterId: "xxx" }         │
  │ ──────────────────────────► │                             │
  │                              │ ── SELECT 全量+当前章content│
  │                              │ ── streamText(...) ──────► LLM
  │  ◄── 流式续写 chunk ───────  │                             │
  │                              │ ◄── tool call appendChapter │
  │                              │ ── UPDATE content=content+│
  │                              │    "\n\n"+newText ────────►│
  │  ◄── tool result 事件 ─────  │  （右栏追加显示新段落）     │
  │                              │                             │
  │  5. 用户点顶部进度条"② 人物"回退                            │
  │ ──────────────────────────► │ 直接 router.push 到对应页  │
  │                              │ （currentStep 不必回退，允许前进）
```

### 2.2 复用原则

Stage 3 **不新增基础设施类代码**，完全复用 Stage 1/2：

- 复用 `ChatPanel` 组件：新增一个 `extraBody` 参数（或直接用 `body` 透传），把 `currentChapterId` 带给 `/api/chat/[id]`
- 复用项目通用布局 `/p/[id]/layout.tsx`（左右两栏结构不变；顶部进度条改为可点击，是对 `StepProgress` 的小升级，见 §5.4）
- 复用 `/api/chat/[id]` 的 `streamText` 主流程，仅增加 `CHAPTERS` 分支映射到新 prompt + 两个新工具
- 复用 `lib/db.ts`、`lib/utils.ts`、shadcn 基础组件

Stage 3 新增代码集中在：

- `src/lib/ai.ts`：追加章节阶段 prompt、`saveChapterContent`、`appendChapterContent` 工具
- `src/app/p/[id]/chapters/page.tsx`：从占位升级为真实章节页
- `src/components/ChapterPanel.tsx`：新建，章节列表 + 选中详情视图
- `src/components/StepProgress.tsx`：小改，已完成步骤支持点击回退（最小改动）
- 通用错误/loading 处理：在 `ChatPanel` 内或顶层加一个轻量 toast/inline error 即可，不引入新库

### 2.3 上下文注入策略

章节阶段是所有步骤中**上下文最重**的一步（要让 LLM 写出与前文一致的正文），但仍需控制 token：

- **必注入**：
  - 初始灵感 `initialIdea`
  - 世界观四个字段
  - 人物列表（每位：name / role / identity / motivation / personality；appearance/arc/relationships 按需，过长时省略）
  - **全部章节的 number / title / summary**（让 LLM 知道全书节奏与相邻章节剧情，避免本章与其他章节冲突）
  - **当前选中章节的完整 `content`**（用于续写时知道停在哪里；初稿时为空，告诉 LLM 可以从头写）
- **不注入**：
  - 其他章节的 content（mvp 阶段避免 token 爆炸；如果用户写第 5 章，不会自动把前 4 章正文喂给 LLM。一致性靠大纲和人物保证；后续版本可做"近 N 章摘要"）

### 2.4 无状态对话原则（重申）

- 每轮 `/api/chat/[id]` 请求都从数据库读取**最新**全量结构化数据，拼入 system prompt
- 聊天记录不持久化；刷新页面左栏清空、右栏从 DB 重建
- AI 通过工具调用把正文写入 `Chapter.content`，不在聊天文本里事后解析
- 刷新章节页后：左侧欢迎语 + 右侧章节列表 + 选中章的已保存正文全部从 DB 重建

### 2.5 目录结构（Stage 3 实际产出）

在 Stage 2 基础上新增/修改：标 ★ 为新增/改动，标 · 为沿用 Stage 2 不改动：

```
ying-story-architect/
├── prisma/
│   └── schema.prisma                    · 完整 Schema 已在 Stage 1 建好，不改
├── src/
│   ├── app/
│   │   ├── layout.tsx                   ·
│   │   ├── page.tsx                     · （首页卡片跳转已在 Stage 2 支持 currentStep 映射，不改）
│   │   ├── globals.css                  ·
│   │   ├── p/[id]/
│   │   │   ├── layout.tsx               · 通用布局，不改
│   │   │   ├── worldbuilding/page.tsx   ·
│   │   │   ├── characters/page.tsx      ·
│   │   │   ├── outline/page.tsx         ·
│   │   │   └── chapters/page.tsx        ★ 从占位页升级为真实章节页
│   │   └── api/
│   │       ├── projects/
│   │       │   └── route.ts             ·
│   │       ├── chat/[id]/route.ts       ★ 扩展 step=CHAPTERS 分支；接收 currentChapterId
│   │       └── projects/[id]/
│   │           ├── step/route.ts        ·
│   │           ├── world/route.ts       ·
│   │           └── chapters/[chapterId]/route.ts  - 本阶段仍不实现手动 PATCH（AI 通过 chat 工具写入）
│   ├── components/
│   │   ├── ui/                          ·
│   │   ├── ChatPanel.tsx                ★ 小改：支持透传 extraBody（currentChapterId）；加基础 error/loading 态
│   │   ├── StepProgress.tsx             ★ 小改：已完成步骤可点击回退
│   │   ├── CharacterPanel.tsx           ·
│   │   ├── OutlinePanel.tsx             ·
│   │   └── ChapterPanel.tsx             ★ 新建：章节列表 + 选中详情
│   └── lib/
│       ├── db.ts                        ·
│       ├── ai.ts                        ★ 新增章节 prompt + saveChapterContent + appendChapterContent
│       └── utils.ts                     ·
├── .env.example                         ·
└── package.json                         · 不新增依赖（@uiw/react-md-editor 本阶段不装）
```

> 注：`api/projects/[id]/chapters/[chapterId]/route.ts` 按 architecture.md 预留了路径，但本阶段不实现手动编辑（只读展示 + AI 通过 chat 工具写入），保持架构精简。

---

## 三、数据模型

### 3.1 表结构

完全复用 Stage 1 已经建好的 Prisma Schema，**不做任何修改**：

- `Chapter` 表：`id / projectId / number / title / summary / content / createdAt / updatedAt`，`@@unique([projectId, number])`
  - `content` 字段 Stage 1/2 一直是空字符串，本阶段正式写入正文（Markdown 纯文本）

### 3.2 数据写入约定

**章节正文保存（saveChapterContent）**：

- 工具接收 `chapterId` + `content`（完整正文）
- 服务端执行 `UPDATE Chapter SET content = ? WHERE id = ? AND projectId = ?`
- **覆盖语义**：用于"生成初稿"。如果该章已有内容，会被完全覆盖；prompt 中会明确告知 LLM 这个行为，避免在已有正文的章节上误调用
- 返回更新后的 chapter（含最新 content 长度/前 100 字预览）供 LLM 确认

**章节正文续写（appendChapterContent）**：

- 工具接收 `chapterId` + `content`（要追加的新文本，不包含已有内容）
- 服务端执行：读取现有 content，拼接 `\n\n` + 新文本，UPDATE 回去（也可以用 SQL `concat`，但 Prisma 里先读后写更直观）
- **追加语义**：用于"续写"。新文本会加到末尾，不会覆盖已有内容
- 为了避免续写时开头重复上一段结尾，服务端可以做一个轻度去重：如果新文本的前 30 个字符与现有 content 的末尾 30 个字符重叠，自动去掉重叠部分（容错即可，不追求完美）
- 返回追加后的总长度

**为什么拆成两个工具而不是一个工具 + mode 参数**：让 LLM 的意图在工具名上就一目了然，降低误调用概率（LLM 在生成长文时容易"顺手"再调一次 save 覆盖已有内容，拆分后 append 是显式动作）。

---

## 四、API 设计（Stage 3 涉及的）

### 4.1 `POST /api/chat/[id]`（扩展）

- **请求体**新增 step 值 + currentChapterId：
  ```ts
  {
    messages: UIMessage[],
    step: "WORLDBUILDING" | "CHARACTERS" | "OUTLINE" | "CHAPTERS",
    currentChapterId?: string   // CHAPTERS 步骤必传
  }
  ```
- **服务端处理流程**（Stage 2 基础上扩展）：
  1. 根据 `id` 查询 Project，关联查询 `world`、`characters`（order by order asc）、`chapters`（order by number asc）
  2. 若 `step === "CHAPTERS"`：
     - 校验 `currentChapterId` 存在且属于该 project（否则返回 400）
     - 额外查出当前选中章节对象（含 content）
  3. 根据 `step` 选择 system prompt + 工具集（新增 `CHAPTERS` 分支）
  4. 构造最终 system prompt（通用身份段 + 项目上下文段 + 阶段指令段，章节阶段的上下文段最重，见 §6.2）
  5. `streamText({ model, system, messages, tools, temperature: 0.8, maxSteps: 5 })`
- **项目上下文段动态拼装**（章节阶段）：
  - 世界观四个字段
  - 人物列表（精简展示 name/role/identity/motivation/personality）
  - 全部章节的 number/title/summary（让 LLM 知道相邻章节剧情）
  - 当前章节的 number/title/summary + 已有 content（若有）

### 4.2 `PATCH /api/projects/[id]/step`（沿用）

Stage 3 不再新增 step 值，但章节页是最后一步，不需要再 PATCH 推进；「完成」感通过 UI 文案（没有下一步按钮，显示"恭喜，初稿已生成"或类似）体现即可，不做专门的 FINISHED 状态。

### 4.3 工具的 HTTP 暴露

两个新工具**不**作为独立 HTTP endpoint 暴露，只存在于 `/api/chat/[id]` 的 `tools` 定义里，由 LLM tool call 触发，在 `onToolCall` 回调中写库，与前三个阶段完全一致。

---

## 五、页面与组件设计

### 5.1 章节页 `/p/[id]/chapters`

替换 Stage 2 占位页。沿用通用左右两栏布局：

**左栏（55%）**：`<ChatPanel step="CHAPTERS" body={{ currentChapterId }} onToolUpdated={refreshChapter} initialMessages={...} />`

- 欢迎语示例：

  > 大纲已经规划好了，现在开始写正文。在右侧点选你要写的章节，然后告诉我"生成本章初稿"，我会基于世界观、人物和大纲为你写出这一章的内容。写完后你也可以说"续写"，我会从结尾继续往下写。

- 交互约束：
  - 用户若未选中任何章节就发消息（例如直接说"写第一章"），AI 应在自然语言回复里提示"请先在右侧点选要写的章节"，不调用工具
  - 流式输出过程中，禁止用户切换选中章节（按钮 disabled），避免 currentChapterId 与正在生成的内容错位

**右栏（45%）**：`<ChapterPanel />`，两个视图状态：列表视图（默认）和详情视图（选中某章后）。

#### 5.1.1 列表视图（未选中或点击"返回列表"）

```
┌───────────────────────────┐
│  章节正文（共 10 章）      │
├───────────────────────────┤
│                           │
│  ┌─────────────────────┐  │
│  │ 第 1 章 · 黄浦江的浮尸 │
│  │ 林野从昏迷中醒来...  │  │
│  │              未生成 ✎ │  │
│  └─────────────────────┘  │
│                           │
│  ┌─────────────────────┐  │
│  │ 第 2 章 · 掮客的邀请  │
│  │ 林野根据线索找到...  │  │
│  │           已生成 ●   │  │
│  └─────────────────────┘  │
│                           │
│  ┌─────────────────────┐  │
│  │ 第 3 章 · ...        │  │
│  │ ...                  │  │
│  │              未生成 ✎ │  │
│  └─────────────────────┘  │
│                           │
│  ...                      │
│                           │
└───────────────────────────┘
```

- 每个章节卡片显示：章节号 + 标题 + summary 前两行截断 + 状态（未生成 / 已生成 ● 实心小圆点 / 部分生成）
- 整张卡片可点击，点击进入详情视图
- 已生成的章节卡片在右侧显示一个绿色实心圆点，未生成的显示一个铅笔图标或灰色空圈
- 顶部"章节正文（共 N 章）"标题
- 列表按 number 升序

#### 5.1.2 详情视图（选中某章后）

```
┌───────────────────────────┐
│  ← 返回列表               │
│  第 3 章 · 标题            │
├───────────────────────────┤
│                           │
│  （概要折叠为一行小字，    │
│   可点击展开）             │
│  ───────────────────────  │
│                           │
│  正文内容第一段...         │
│                           │
│  正文内容第二段...         │
│                           │
│  （正文以 pre-wrap 方式     │
│   只读展示，保留换行和     │
│   段落间距；内容过长时     │
│   内部滚动）               │
│                           │
│  （空状态：本章还没有正文， │
│   在左侧告诉 AI "生成本章   │
│   初稿" 开始创作）         │
│                           │
└───────────────────────────┘
```

- 顶部 "← 返回列表"按钮，点击回到列表视图
- 章节标题下方用一行灰色小字显示概要（完整概要，不截断）
- 正文区：
  - 用 `<div class="whitespace-pre-wrap leading-relaxed">` 之类的样式展示纯文本（保留换行和段落间距）
  - **只读**，不提供编辑框、不提供 @uiw/react-md-editor
  - 正文为空时显示空状态文案
  - 内容很长时右栏内部滚动（整个右栏滚动，不是正文区单独嵌滚动条，视觉更简洁）
- 详情视图**不**提供"删除本章正文""重新生成"按钮（mvp 阶段用户可以通过聊天告诉 AI "重写本章"，由 AI 调用 saveChapterContent 覆盖；或直接刷新页面重来）

**ChapterPanel 设计要点**：

- 进入页面时 fetch 一次该 project 的 chapters（order by number asc），与 Stage 2 的 OutlinePanel 一致
- 内部用 `selectedChapterId` 状态决定视图
- 列表视图的卡片点击 → 设置 `selectedChapterId` → 切到详情视图 → 回调父页面 `onSelectChapter?(chapterId)`，父页面把 `currentChapterId` 更新到 ChatPanel 的 body 里
- 当 `onToolUpdated` 触发（工具名 `saveChapterContent` 或 `appendChapterContent`）时，重新 fetch chapters 列表并刷新当前选中章的 content
- 流式输出期间，正文区可以实时反映进度（见 §5.3 关于 partial streaming 的说明）

### 5.2 通用布局的收尾改动

章节页不再放「下一步」按钮（已经是最后一步）。其他三个步骤页的「下一步」按钮保留。

章节页右栏顶部的"章节正文"标题下，可以加一行细灰字提示："回到顶部进度条可以返回前面步骤修改"。

### 5.3 流式正文的实时展示（关键体验点）

章节正文比世界观/人物/大纲的文本**长得多**（每章 1000-3000 字），必须让用户在 AI 生成过程中看到正文逐段出现，而不是等工具调用完才一次性显示。两种实现策略（按优先级选择最简单的一种）：

**方案 A（推荐，MVP 最小实现）**：流式文本直接显示在**左栏聊天气泡里**，工具调用完成后右栏一次性刷新为最终正文。

- 左栏：AI 一边写一边在自己的气泡里流式输出正文（和普通聊天一样），用户能实时看到
- 当 AI 写完并调用 `saveChapterContent`/`appendChapterContent` 后，工具结果事件到达前端，右栏 refetch 展示最终版
- 优点：零新机制，完全复用 Stage 1/2 的 ChatPanel 流式渲染；缺点：正文同时出现在左栏气泡和右栏，略有重复感

**方案 B（进阶，可选）**：AI 回复时**不**在左栏气泡里展示正文，而是把流式 chunk 直接管道到右栏正文区（需要在 ChatPanel 暴露 onPartialUpdate 回调）。

- 优点：体验更接近"AI 直接往你稿子上写"；缺点：需要额外机制把 partial text 同步到右栏，而且工具调用后仍需 refetch 最终内容，复杂度上升

**本阶段采用方案 A**。左栏气泡里 AI 可以在正文前后加一句自然语言过渡（如"好的，这是第 3 章的初稿："，正文，"已保存到右侧"），让"左栏对话 + 右栏结果"的既有模式保持一致。这也意味着：

- AI 应该在**生成完正文之后**一次性调用 `saveChapterContent` 工具（把整篇正文作为参数传过去），而不是边写边调
- Prompt 里要明确：先把正文完整输出为自然语言消息（供用户在左栏阅读），消息结束前调用一次 saveChapterContent 把完整正文入库
- 续写时同理：AI 先输出续文段落，再调用 `appendChapterContent`

> 这个设计选择很重要：长文生成 + 工具调用的时机要在 prompt 里明确，避免 AI 边写边调工具导致左栏只有工具调用没有正文可读性。

### 5.4 StepProgress 组件升级（可点击回退）

最小改动让已完成步骤可点击：

- 输入：`currentStep: Step`
- 渲染规则：
  - **已完成步骤**（序号 < currentStep 序号）：渲染为 `<Link href="/p/[id]/对应路径">`，可点击，主色描边 + 勾
  - **当前步骤**：主色填充 + 加粗，不可点击
  - **未完成步骤**（序号 > currentStep 序号）：灰色描边，不可点击
- 映射表（固定）：
  ```
  WORLDBUILDING → /p/[id]/worldbuilding
  CHARACTERS    → /p/[id]/characters
  OUTLINE       → /p/[id]/outline
  CHAPTERS      → /p/[id]/chapters
  ```
- 不修改 `currentStep` 的值：回退只是前端路由跳转，`currentStep` 在数据库里保留最高进度，方便用户随时跳到最后一步。这与 architecture.md 中"可点击回退任意已完成步骤"一致（回退是查看/修改已完成步骤，不是重置进度）
- Stage 1/2 中进度条节点是 `<span>`，Stage 3 把已完成节点改为 `<Link>`，当前/未完成节点保持 `<span>`

### 5.5 ChatPanel 小改

- **extraBody 透传**：新增可选 prop `body?: Record<string, unknown>`，合并到 `useChat({ body: { step, ...body } })` 里。章节页传 `{ currentChapterId }`，其他步骤页不传
- **基础错误提示**：
  - 监听 `useChat` 返回的 `error` 对象，有错误时在输入框上方显示一行红字："AI 响应异常，请重试"（不做复杂 retry，用户点发送按钮重发即可）
  - 网络错误、LLM 限流、工具执行失败都归并为这个提示
- **基础 loading 状态**：
  - `isLoading` 为 true 时输入框 disabled，发送按钮显示 "AI 正在创作中..."
  - 工具调用期间流式气泡里显示轻量状态（AI SDK 默认会渲染 tool-call 状态，不额外处理）
- 其他行为保持 Stage 1/2 不变

### 5.6 首页

不改。Stage 2 已经支持按 `currentStep` 映射到对应路径，章节页（CHAPTERS）也在映射表里，项目卡片点击会自动跳章节页。

---

## 六、AI Prompt 与工具设计

### 6.1 System Prompt 通用结构

延续前三阶段的三段拼接：`[通用身份段] + [项目上下文段（动态）] + [阶段指令段]`。

**通用身份段**保持 Stage 2 文案，阶段名替换为"章节写作"：

```
你是「Ying Story Architect」的 AI 创作伙伴，协助用户一步步完成小说创作。
你当前处于「章节写作」阶段。

核心规则：
- 你只通过"自然语言对话 + 工具调用"工作，不要输出 JSON 或代码块作为回复正文。
- 章节正文先以自然语言消息的形式完整输出（方便用户在左侧直接阅读），在同一条消息的末尾调用一次保存工具把正文写入数据库；不要边写边调工具，也不要只调工具不输出正文。
- 对话无状态：你每次收到的系统提示都附带了当前已保存的所有创作数据，你不需要重复询问已经保存的内容。
- 回答使用中文，正文使用小说文体（不是剧本、不是大纲、不是说明文）；对话语气像一个有经验的创作教练，简洁友好，不要太客套。
```

### 6.2 章节阶段 Prompt（项目上下文段）

服务端动态拼接。`//` 后是说明，不写入 prompt：

```
用户的初始灵感：
"""
{project.initialIdea}
"""

已构建的世界观：
- 时代背景：{world.era || "（未设置）"}
- 地理环境：{world.geography || "（未设置）"}
- 社会结构：{world.socialStructure || "（未设置）"}
- 力量体系：{world.powerSystem || "（未设置）"}

核心人物：
{ characters.length === 0
  ? "（暂无）"
  : characters.map(c =>
      `- ${c.name}（${roleLabel(c.role)}）：${c.identity}。动机：${c.motivation || "未明确"}。性格：${c.personality || "未明确"}`
    ).join("\n")
}

全书章节大纲：
{ chapters.map(c =>
    `- 第${c.number}章 ${c.title}：${c.summary}`
  ).join("\n")
}

当前用户选中的章节：第 {current.number} 章 《{current.title}》
本章概要：{current.summary}
本章已生成内容长度：{current.content.length} 字
{ current.content.length > 0
  ? `本章已有内容（用于续写时参考，请从结尾自然延续，不要重复已写段落）：\n"""\n${current.content}\n"""`
  : "本章尚未生成任何内容（需要生成初稿）。"
}
```

> 注意：人物段省略了 appearance/arc/relationships 以省 token；大纲段只展示 number/title/summary 三字段（Stage 2 已约定）；当前章 content 在初稿时为空，续写时把完整已有正文注入（用户一章一般 1000-3000 字，token 可接受）。

### 6.3 章节阶段指令段

```
你的任务是协助用户撰写选中章节的正文。你能做两件事：

A. 生成本章初稿：当用户要求"生成本章"、"写本章"、"开始写"等，或本章尚无正文且用户让你开始创作时：
   1. 先在自然语言回复中用一句话过渡（如"好的，这是第 X 章《XX》的初稿："）。
   2. 然后输出完整的章节正文（Markdown 纯文本，章节内用空行分段，可使用少量 **加粗** 标记强调关键意象/对话锚点；不要写章节号和标题，它们已在右侧展示）。
   3. 正文篇幅建议 1500-2500 字，节奏要贴合大纲概要。
   4. 正文结束后，立即调用一次 saveChapterContent 工具，把整篇正文作为 content 参数一次性保存。
   5. 用一句简短的话收尾（如"初稿已保存。可以继续让我续写，也可以点其他章节切换创作。"）。

B. 续写：当用户要求"续写"、"继续"、"往下写"等，且本章已有正文时：
   1. 先简单过渡（如"接着上文往下："）。
   2. 输出续写的新段落（从已有内容的结尾自然接续，不要重复已有文字，不要生硬回顾）。
   3. 续写篇幅建议 800-1500 字，在剧情自然停顿处收尾。
   4. 输出完后立即调用一次 appendChapterContent 工具，把新文本作为 content 参数追加保存。
   5. 简短收尾，告诉用户可以继续续写或切换章节。

写作质量要求：
- 遵循"展示而非讲述"原则：用动作、对话、细节、环境描写推进剧情，避免大段内心独白或设定说明。
- 严格遵守世界观、人物动机、大纲概要；不要引入与已设定冲突的新人物/地点/能力（除非剧情自然需要并符合前文逻辑）。
- 对话要体现人物性格差异，避免所有角色一个腔调。
- 章节开头要有钩子（动作/对话/悬念），结尾要有悬念或转折，引导读者想看下一章。
- 本阶段你只看到本章的已有正文，没有其他章节正文，所以不要假设你知道前一章正文里具体写了哪些细节；按照大纲概要和人物设定推进即可，不要引用"前一章提到过..."这类跨章细节。

工具使用规则：
- 本章已有正文时，除非用户明确说"重写本章"、"重新生成"、"推倒重写"，否则不要调用 saveChapterContent（会覆盖原文）。续写请用 appendChapterContent。
- 每次生成/续写只调用一次工具（保存整篇或追加一段），不要分多次短调用。
- 如果用户未选中任何章节（system prompt 里不会出现"当前用户选中的章节"段），用自然语言提示用户先在右侧面板点选要写的章节，不要调用工具。
- 不要输出 JSON、字段清单或代码块给用户看；正文直接是自然文本，工具调用对用户透明。

引导策略：
- 第一轮进入章节阶段时，AI 欢迎语已经提示用户选章节并说"生成本章初稿"；如果用户直接开始聊天，按上面的规则响应。
- 如果用户对生成的初稿不满意（如"这段对话不好"、"主角反应不对"），先用自然语言讨论修改方向，然后调用 saveChapterContent 覆盖保存新的完整正文（你需要重新输出完整正文，而不是只输出修改的段落；因为工具是覆盖式的）。
- 如果用户对续写不满意，同样讨论后重新 append 是不可行的（会追加重复内容），应该提示用户"需要重写整章，请告诉我"，或在聊天里给出修改建议；mvp 阶段不做段落级编辑。
```

### 6.4 `saveChapterContent` 工具定义

```
工具名: saveChapterContent
描述: 覆盖保存当前章节的完整正文。用于生成初稿，或在用户要求"重写本章"时替换整篇正文。会完全覆盖该章已有的 content，请谨慎使用。
参数:
  chapterId: string  // 要保存的章节 ID（必填；由系统上下文提供，不要自己编造）
  content:   string  // 完整的章节正文（Markdown 纯文本）
返回:
  { success: true, chapterId, length: number, preview: string }
  // preview 是正文前 100 字，供 AI 确认已保存
```

**服务端执行逻辑**：

1. 参数校验（zod）：chapterId 非空、属于当前 project、content 非空字符串
2. `UPDATE Chapter SET content = ?, updatedAt = NOW() WHERE id = ? AND projectId = ?`
3. 返回 `{ chapterId, length: content.length, preview: content.slice(0, 100) }`
4. 工具副作用触发前端 `onToolUpdated("saveChapterContent")`，右栏 refetch 当前章节

### 6.5 `appendChapterContent` 工具定义

```
工具名: appendChapterContent
描述: 在当前章节末尾追加新正文（续写用）。新内容会拼接到已有 content 末尾，不会覆盖。请只传新增段落，不要重复传已有内容。
参数:
  chapterId: string  // 目标章节 ID（必填）
  content:   string  // 要追加的新文本（不包含已有正文）
返回:
  { success: true, chapterId, appendedLength: number, totalLength: number }
```

**服务端执行逻辑**：

1. 参数校验：chapterId 属于当前 project，content 非空
2. 读取当前 chapter.content
3. 轻度去重：若 content 的前 N 个字符（N 取 30）与现有 content 末尾重叠，裁掉重叠部分（避免 LLM 续写时意外重复最后一句）
4. 拼接：`newContent = existing + (existing.endsWith("\n") ? "" : "\n\n") + dedupedAppend`
5. UPDATE 回库
6. 返回追加长度和总长度
7. 触发前端 `onToolUpdated("appendChapterContent")`，右栏 refetch

### 6.6 模型与参数

沿用 Stage 2：

- Provider / Model 从环境变量读取
- Temperature: `0.8`（创作类任务保留发散度）
- `maxSteps: 5`（与 Stage 2 一致；章节阶段单次只调一个工具，5 步是安全上限）
- 不限制 max tokens，由流自然结束

> 长文生成可能触发模型的输出上限（如 4k/8k token）。mvp 阶段接受这一限制：一章 1500-2500 字约 2k-4k token，主流模型能一次生成完；如果被截断，用户可以再说"续写"接着写，体验上自然。prompt 里建议的 1500-2500 字篇幅也是基于这个考量。

---

## 七、验收用例（Definition of Done）

### 7.1 章节步骤主流程（端到端闭环）

**前置**：已有一个完成世界观 + 人物 + 大纲（例如 6 章）的项目，停在章节页。

1. **进入章节页**
   - 从大纲页点「下一步」，页面跳到 `/p/[id]/chapters`
   - 进度条「章节」节点高亮，且前三个节点（世界观/人物/大纲）是可点击的链接
   - 左栏 ChatPanel 显示章节阶段欢迎语
   - 右栏显示章节列表（共 6 章），每章卡片显示章节号+标题+概要+未生成状态

2. **选中章节**
   - 用户点击"第 1 章"卡片
   - 右栏切到详情视图：顶部"← 返回列表"，下方显示"第 1 章 · 标题"+ 概要 + 空状态文案"本章还没有正文..."
   - （内部 currentChapterId 已更新到 ChatPanel）

3. **生成初稿**
   - 用户在左栏发送："生成本章初稿"
   - AI 流式回复：先过渡句"好的，这是第 1 章《XX》的初稿："，然后逐段流式输出正文（1500 字左右）
   - 左栏气泡里正文逐字出现（流式体验正常）
   - 正文输出结束后，AI 调用一次 `saveChapterContent` 工具（UI 显示工具调用状态）
   - 工具返回后右栏详情视图刷新，完整正文以只读文本块形式展示（段落换行保留）
   - AI 在左栏收尾："初稿已保存。..."
   - 点击"← 返回列表"回到列表视图，第 1 章卡片状态变为"已生成 ●"

4. **切换章节并生成**
   - 在列表视图点击第 2 章，进入详情视图（空状态）
   - 用户发送："写这一章"
   - AI 生成第 2 章初稿并保存
   - 右栏展示第 2 章正文
   - 返回列表，第 2 章也显示"已生成"

5. **续写**
   - 回到第 1 章详情（已有正文）
   - 用户发送："继续往下写"
   - AI 流式输出续写段落（约 1000 字），从原文结尾自然延续
   - 续文结束后调用 `appendChapterContent`
   - 右栏正文区末尾追加新段落，原有内容保留
   - AI 简短收尾

6. **持久化验证**
   - 刷新页面
   - 左栏聊天重置为欢迎语（无状态，正确）
   - 右栏列表第 1、2 章显示"已生成"
   - 点击第 1 章进入详情，正文（含续写部分）**完整保留**
   - 点击第 2 章，正文完整保留

7. **回退修改**
   - 点击顶部进度条的"② 人物"
   - 路由跳到 `/p/[id]/characters`，右栏人物卡片都还在
   - 再点进度条"④ 章节"回到章节页
   - 章节和正文数据都还在，`currentStep` 没有被重置（仍然是 CHAPTERS）

### 7.2 边界与异常

1. **未选章节就发消息**
   - 在列表视图（未选中）直接发送"写第一章"
   - AI 回复自然语言："请先在右侧点选要写的章节，我再开始创作。"
   - 不调用任何工具

2. **AI 失败重试**
   - （手动断网或模拟 API key 错误）触发 AI 调用失败
   - ChatPanel 在输入框上方显示红字"AI 响应异常，请重试"
   - 网络恢复后用户重新发送，能正常生成

3. **覆盖保护**
   - 在已有正文的第 1 章发送"生成本章初稿"
   - AI 应回复询问/确认（因为这会覆盖已有内容），或在 prompt 指导下理解这是"重写"并直接覆盖——验收时接受 AI 询问或直接覆盖任一行为，只要不默默丢失内容且结果一致即可
   - （MVP 不做二次确认弹窗，覆盖行为由 AI 自然语言确认）

4. **首页恢复**
   - 回到首页，项目卡片显示该作品（可能标题还是"未命名作品"，Stage 1-3 都不做标题编辑）
   - 点击卡片，根据 currentStep=CHAPTERS 直接跳到 `/chapters` 页
   - 章节和正文完整展示

### 7.3 完整端到端流程（一次走完）

从首页开始：

1. 首页输入灵感："赛博朋克都市，2087 年新上海，一个失忆的侦探追查自己的过去"
2. 创建项目 → 世界观页：与 AI 对话 3-5 轮，四个字段被自动保存
3. 点"下一步" → 人物页：AI 首轮提议 2-3 位角色，自动保存；再加 1 位配角
4. 点"下一步" → 大纲页：告诉 AI "按 6 章生成"，AI 批量生成章节
5. 点"下一步" → 章节页：选中第 1 章，让 AI 生成初稿
6. 让 AI 续写第 1 章一段
7. 切换到第 2 章，生成初稿
8. 刷新页面，确认所有数据保留
9. 点进度条回退到"人物"查看，再回到章节页继续写

**总时长目标：5-10 分钟完成**（符合 architecture.md 与 plan 的承诺）。

### 7.4 非功能验收

- [ ] 控制台无无意义报错；工具调用异常能看到明确错误
- [ ] 流式正文首 token < 3s，整章生成过程流畅（无长时间卡顿）
- [ ] 代码通过 `tsc --noEmit` 无类型错误
- [ ] `lib/ai.ts` 中 step → (prompt, tools) 映射表清晰，新增 CHAPTERS 分支不破坏其他三步
- [ ] Prisma schema 与 architecture.md 一致（Stage 3 不动 schema）
- [ ] 不引入新的 npm 依赖（@uiw/react-md-editor 未安装）
- [ ] `StepProgress` 改动最小，Stage 1/2 的视觉（当前步高亮、未完成步灰）在章节页保持一致
- [ ] ChatPanel 的 error/loading 改动不影响世界观/人物/大纲三步的原有体验

---

## 八、风险与注意事项

| 风险                                                                | 应对策略                                                                                                                                                                                                                         |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LLM 输出超长被截断，章节不完整                                      | Prompt 建议篇幅 1500-2500 字（落在主流模型单次输出上限内）；被截断时用户自然会说"续写"，appendChapterContent 能接续，体验上可接受                                                                                                |
| LLM 在长正文场景下忘记调工具，正文只出现在左栏不入库                | System prompt 明确"正文结束后立即调用一次 saveChapterContent"，并用 few-shot 风格强调顺序；Stage 2 已验证 maxSteps:5 能支持工具调用                                                                                              |
| LLM 边写边调工具（把正文拆成多次 save 调用互相覆盖）                | Prompt 明确"先输出完整正文，消息结束前一次性调用工具"；工具拆成 save/append 两个，名字即意图；极端情况靠 maxSteps 上限截断循环                                                                                                   |
| 续写时 LLM 重复已有内容末尾                                         | System prompt 明确"不要重复已写段落"；服务端 append 做前 30 字重叠的轻度去重（容错，不追求完美）                                                                                                                                 |
| 章节上下文过长（人物多 + 大纲长 + 当前章已有正文长）导致 token 压力 | 人物段只展示 name/role/identity/motivation/personality（5 字段）；大纲段只展示 number/title/summary（省略前两章已写的 content）；当前章 content 超过 4000 字时考虑截断尾部（mvp 阶段通常不会到这个长度，先不做，等出现问题再补） |
| 右栏刷新与左栏流式不同步，导致用户看到两份正文                      | 采用方案 A（§5.3）：左栏流式正文只是"预览"，右栏工具调用后才是"定稿"。在左栏 AI 收尾文案里明确"已保存到右侧"，引导用户视右栏为准                                                                                                 |
| 进度条回退让用户误以为进度丢失                                      | 只改前端路由，不修改 `currentStep` 数据库值；文案提示"回到前面步骤修改，章节进度会保留"；回退后再点进度条能随时跳回章节                                                                                                          |
| 未选章节时 currentChapterId 为空，AI 胡乱生成                       | `/api/chat/[id]` 校验 currentChapterId 缺失时不传 CHAPTERS 工具集；prompt 指示 AI 提示用户选章节；双重保险                                                                                                                       |
| appendChapterContent 的"先读后写"在并发下有竞态                     | mvp 单用户单会话，不会并发；忽略                                                                                                                                                                                                 |

---

## 九、交付物清单

Stage 3 完成后仓库新增/修改：

**新建页面**：

- `src/app/p/[id]/chapters/page.tsx`（从占位升级为真实章节页）

**新建组件**：

- `src/components/ChapterPanel.tsx`（章节列表 + 选中详情视图）

**修改文件**：

- `src/lib/ai.ts`：追加章节阶段 prompt（身份段 + 上下文段 + 指令段）、`saveChapterContent` 工具、`appendChapterContent` 工具；step → (prompt, tools) 映射表增加 CHAPTERS 分支
- `src/app/api/chat/[id]/route.ts`：查询 Project 时在 CHAPTERS 分支额外查询 currentChapter；校验 currentChapterId 归属；把当前章节对象传入 prompt 构造
- `src/components/ChatPanel.tsx`：新增 `body` prop 透传额外字段（currentChapterId）；加基础 error/loading 提示
- `src/components/StepProgress.tsx`：已完成步骤渲染为 `<Link>` 支持点击回退；维护 step → path 映射表

**不改动**：

- `prisma/schema.prisma`
- `src/app/p/[id]/layout.tsx`
- `src/app/p/[id]/worldbuilding/page.tsx`
- `src/app/p/[id]/characters/page.tsx`
- `src/app/p/[id]/outline/page.tsx`
- `src/app/api/projects/[id]/step/route.ts`
- `src/app/page.tsx`
- `package.json`（不新增依赖）

Stage 3 完成后，v1.0 MVP 的端到端流程**完整可用**：一句话灵感 → 世界观 → 人物 → 大纲 → 章节正文（生成 + 续写 + 自动保存 + 回退修改），实现了 architecture.md 中定义的 mvp 版核心价值。
