# Stage 1: 基础框架 + 世界观 AI 闭环

> 所属版本: v1.0 MVP
> 前置文档: [architecture.md](../../architecture.md)、[01-v1.0-plan.md](../../prompts/01-v1.0-plan.md)

---

## 一、目标与范围

### 1.1 核心目标

搭建最小可用的技术骨架，打通**端到端 AI 链路**：

```
用户输入灵感 → 创建项目 → 进入世界观页 → 多轮对话引导
     → AI 流式回复 + 自动调用 updateWorld 工具 → 数据落库
     → 右侧面板实时展示世界观字段 → 点击「下一步」推进
```

这是整个产品最关键的技术验证阶段。Stage 2/3 的人物、大纲、章节步骤将完全复用本阶段建立的 AI 流式对话 + Tool Calling 模式，因此本阶段的架构设计需要具备**可复用性**，即便视觉和交互可以极简。

### 1.2 本阶段做什么

- Next.js 16 + TypeScript + Tailwind v4 项目骨架
- Prisma + PostgreSQL 数据层（Schema 包含所有表，但 Stage 1 只使用 Project + WorldBuilding）
- 极简首页：灵感输入创建项目 + 项目列表
- 项目页通用布局：顶部标题 + 4 步进度指示器 + 左右两栏
- AI 对话核心链路：OpenAI 兼容客户端、流式响应、Tool Calling
- 世界观步骤：system prompt + `updateWorld` 工具 + 右侧只读展示
- 基础导航：世界观 → 人物页的跳转（人物页留空占位即可）

### 1.3 本阶段明确不做

| 不做项                     | 原因                                         |
| -------------------------- | -------------------------------------------- |
| 人物、大纲、章节的 AI 逻辑 | 复用 Stage 1 模式，Stage 2/3 实现            |
| 右侧面板字段编辑           | Stage 1 只展示 AI 自动保存结果，手动编辑后置 |
| 回退到已完成步骤           | 进度条只展示，不可点击                       |
| 标题编辑、项目删除         | 首页只做创建和列表                           |
| 错误重试、loading 细节打磨 | 有基础状态即可                               |
| 响应式/移动端              | 固定桌面布局                                 |
| 深色主题细节               | 先跑通，样式后置                             |

---

## 二、技术架构要点

### 2.1 整体调用链

```
浏览器                        Next.js Server                  DB / LLM
  │                              │                             │
  │  1. 输入灵感 POST /api/projects                         │
  │ ──────────────────────────► │                             │
  │                              │ ── INSERT Project ────────► │
  │                              │ ◄── 返回 project id ─────── │
  │  ◄── 201 { id } ───────────  │                             │
  │                              │                             │
  │  2. 路由跳转到 /p/[id]/worldbuilding                      │
  │ ──────────────────────────► │                             │
  │                              │ ── SELECT Project+World ──► │
  │  ◄── 渲染初始页面 ──────────  │                             │
  │                              │                             │
  │  3. 用户发消息 POST /api/chat/[id]                         │
  │ ──────────────────────────► │                             │
  │                              │ ── 加载完整结构化上下文 ──► │
  │                              │ ── streamText + tools ────► LLM
  │  ◄── 流式文本 chunk ───────  │                             │
  │                              │ ◄── tool call (updateWorld) │
  │                              │ ── UPSERT WorldBuilding ──► │
  │  ◄── tool result 事件 ─────  │  （前端触发面板刷新）       │
  │                              │                             │
```

### 2.2 无状态对话原则

严格遵循 architecture.md 中的核心设计：

- **聊天记录不持久化**：`/api/chat/[id]` 接收前端内存中的 `messages[]`，用完即弃
- **每轮请求携带全量结构化数据**：服务端每次都从数据库读取最新的 Project + World（未来还有 Character、Chapter），拼入 system prompt 作为上下文
- **刷新页面聊天清空，但结构化数据保留**：前端 messages 状态在页面刷新后重置为一条 AI 欢迎语
- **AI 通过工具写入事实数据**：用户真正想保留的信息由 AI 主动调用工具入库，而不是从聊天记录里事后提取

### 2.3 目录结构（Stage 1 实际产出）

相比 architecture.md 中的「完整版」目录，Stage 1 只需创建标 ★ 的文件：

```
ying-story-architect/
├── prisma/
│   └── schema.prisma                    ★ 定义完整 Schema（含未来表）
├── src/
│   ├── app/
│   │   ├── layout.tsx                   ★ 全局布局
│   │   ├── page.tsx                     ★ 首页
│   │   ├── globals.css                  ★ Tailwind 入口
│   │   ├── p/[id]/
│   │   │   ├── layout.tsx               ★ 项目通用布局 + 进度条
│   │   │   ├── worldbuilding/page.tsx   ★ Step 1 页面
│   │   │   ├── characters/page.tsx      ☆ 占位页（跳转目标，内容简单）
│   │   │   ├── outline/page.tsx         - 本阶段不创建
│   │   │   └── chapters/page.tsx        - 本阶段不创建
│   │   └── api/
│   │       ├── projects/
│   │       │   └── route.ts             ★ GET 列表 + POST 创建
│   │       ├── chat/[id]/route.ts       ★ AI 对话端点（核心）
│   │       └── projects/[id]/
│   │           ├── step/route.ts        ★ PATCH 更新 currentStep
│   │           └── world/route.ts       - 本阶段不实现手动编辑，预留即可
│   ├── components/
│   │   ├── ui/                          ★ shadcn Button/Input/Textarea
│   │   ├── ChatPanel.tsx                ★ 通用聊天面板（复用核心）
│   │   └── StepProgress.tsx             ★ 4 步进度指示器
│   └── lib/
│       ├── db.ts                        ★ Prisma client 单例
│       ├── ai.ts                        ★ AI client + world prompt + tools
│       └── utils.ts                     ★ cn() 等工具函数
├── .env.example                         ★
├── package.json                         ★
└── tsconfig.json                        ★
```

---

## 三、数据模型

Stage 1 就把完整版 Schema 一次性建好（避免后续迁移），但**只读写 Project 和 WorldBuilding 两张表**。使用 architecture.md 中定义的完整 Prisma Schema，不做修改：

- `Project`：`id / title / initialIdea / currentStep / createdAt / updatedAt`
- `WorldBuilding`：`id / projectId (unique) / era / geography / socialStructure / powerSystem`
- `Character`、`Chapter`：表存在，Stage 1 不写入

初始化方式：`npx prisma db push`（MVP 阶段直接 push，不做 migration 历史）。

---

## 四、API 设计（仅 Stage 1 涉及的）

### 4.1 `POST /api/projects` — 创建项目

- **请求体**：`{ initialIdea: string }`
- **行为**：
  1. 创建 `Project` 记录，`currentStep = WORLDBUILDING`，`title = "未命名作品"`
  2. 同步创建空的 `WorldBuilding` 记录（四个字段空字符串），避免后续 upsert 判空逻辑
- **返回**：`201 { id: string }`
- **错误**：`initialIdea` 为空返回 400

### 4.2 `GET /api/projects` — 项目列表

- **返回**：`200 [{ id, title, initialIdea, currentStep, updatedAt }]`
- **排序**：`updatedAt desc`
- **不做分页**：mvp 阶段数据量小

### 4.3 `PATCH /api/projects/[id]/step` — 推进步骤

- **请求体**：`{ step: Step }`（`"WORLDBUILDING" | "CHARACTERS" | "OUTLINE" | "CHAPTERS"`）
- **行为**：更新 `currentStep`，前端在「下一步」按钮点击时调用
- **返回**：`200 { success: true }`
- **Stage 1 仅用到**：世界观页 → 跳人物页之前，把 step 更新为 CHARACTERS

### 4.4 `POST /api/chat/[id]` — AI 流式对话（核心）

- **请求体**：
  ```ts
  {
    messages: UIMessage[],   // 前端内存中的聊天记录
    step: "WORLDBUILDING"    // Stage 1 只会收到这个值
  }
  ```
- **服务端处理流程**：
  1. 根据 `id` 查询 `Project`（包含 `world`），不存在返回 404
  2. 根据 `step` 选择 system prompt 片段和工具集（Stage 1 只映射到 `WORLDBUILDING`）
  3. 构造最终 system prompt：
     - 通用前缀（角色介绍、对话无状态说明、工具使用规则）
     - 当前项目上下文（`initialIdea` + 已有世界观字段）
     - 世界观场景指令（引导策略、何时调用工具）
  4. 调用 `streamText({ model, system, messages, tools, temperature: 0.8 })`
  5. 返回 `result.toDataStreamResponse()`
- **工具集（Stage 1）**：仅 `updateWorld`（见 §六）
- **工具调用副作用**：服务端在 `onToolCall` 回调里把结构化数据写入 `WorldBuilding` 表，写入成功后把结果返回给 LLM，LLM 继续流式回复确认

> 注：不单独做 `world/route.ts` PATCH 手动保存（Stage 3 再补）；但文件可以预留空壳，避免 Stage 2/3 改路径。

---

## 五、页面与组件设计

### 5.1 首页 `/`

极简两栏垂直布局：

```
┌─────────────────────────────────────────────┐
│                                             │
│            Ying Story Architect             │
│              AI 小说创作伙伴                 │
│                                             │
│   ┌─────────────────────────────────────┐   │
│   │ 输入一句故事灵感，开启你的创作...    │   │
│   └─────────────────────────────────────┘   │
│                  [ 开始创作 ]               │
│                                             │
│  ───────────  我的作品  ───────────         │
│                                             │
│   ┌─────────────────────────────────────┐   │
│   │ 未命名作品                   3分钟前 │   │
│   │ 赛博朋克都市，2087年...             │   │
│   └─────────────────────────────────────┘   │
│   ┌─────────────────────────────────────┐   │
│   │ ...                                 │   │
│   └─────────────────────────────────────┘   │
│                                             │
│   （空状态：还没有作品，输入灵感开始吧）     │
└─────────────────────────────────────────────┘
```

**交互细节**：

- 输入框按回车或点击按钮触发创建；空输入按钮禁用
- 创建成功后 `router.push(\`/p/${id}/worldbuilding\`)`
- 项目卡片整张可点击，点击进入对应步骤页（根据 `currentStep` 决定跳到哪，Stage 1 都是世界观）
- 不做删除按钮、不做标题编辑

### 5.2 项目通用布局 `/p/[id]/layout.tsx`

所有 4 个步骤共享此布局：

```
┌─────────────────────────────────────────────────────────────┐
│  ←  Ying Story Architect    ① 世界观  ② 人物  ③ 大纲  ④ 章节 │
├────────────────────────────────┬────────────────────────────┤
│                                │                            │
│         （步骤页内容）          │      （步骤页内容）         │
│                                │                            │
└────────────────────────────────┴────────────────────────────┘
```

**要点**：

- 左上角：「← Ying Story Architect」返回首页（用 `<Link href="/">` 即可）
- 右上角：`StepProgress` 组件，展示 4 步，当前步高亮，已完成步实心，未来步空心
  - Stage 1 中进度条**不可点击**（Stage 3 再做回退）
- 左右两栏：左 55% / 右 45%，中间 1px 分隔线
- 布局本身是 Server Component，接收 `params.id` 后查询 `Project` 拿到 `currentStep` 和 `title` 作为初始状态（后续步骤页客户端组件会自行 fetch 最新数据）
- 子页面通过 `children` 注入

### 5.3 StepProgress 组件

- 输入：`currentStep: Step`
- 4 个节点横向排列：世界观 → 人物 → 大纲 → 章节
- 当前步：主色填充 + 加粗
- 已完成步（序号 < current）：主色描边 + 勾
- 未来步（序号 > current）：灰色描边
- Stage 1 所有项都是 `<span>` 不可点击，未来改为 `<button>` 或 `<Link>`

### 5.4 ChatPanel 组件（关键复用组件）

这是 Stage 1 最重要的 UI 组件，后续 4 个步骤都复用它：

**职责**：

- 渲染消息列表（用户消息靠右、AI 消息靠左，支持 markdown 简单渲染）
- 渲染输入框 + 发送按钮
- 持有 `messages` 状态（`useUIMessages` from `ai/react`）
- 处理流式输入：`useChat({ api: /api/chat/${projectId}, body: { step } })`
- 处理工具调用事件：当 `updateWorld` 工具被调用并返回后，触发一个回调 `onStructuredUpdate?.()` 让右侧面板重新拉数据

**Props**：

```ts
{
  projectId: string
  step: Step
  initialMessages?: UIMessage[]   // 首次进入时的 AI 欢迎语
  onToolUpdated?: (toolName: string) => void   // 供右侧面板刷新
}
```

**交互细节**：

- 输入框支持 Shift+Enter 换行、Enter 发送
- 流式回复中输入框禁用，显示「AI 正在思考...」状态
- 长消息滚动区域自动滚到底部
- 欢迎语由调用方传入（每个步骤有不同开场），Stage 1 世界观页传入：「你好！我是你的创作伙伴。我们先来构建故事的世界观吧。你的故事发生在什么样的时代和地点？」

### 5.5 世界观页 `/p/[id]/worldbuilding`

**数据获取**：

- 进入页面时 fetch `GET /api/projects` 或者直接 layout 已经注入的 project 数据；右侧面板单独 fetch 世界观字段（或者通过 layout 传下来）
- Stage 1 不引入 SWR，直接用 `useEffect + fetch` 管理世界观数据 state

**左栏（55%）**：`<ChatPanel step="WORLDBUILDING" onToolUpdated={refreshWorld} />`

**右栏（45%）**：世界观只读展示面板

```
┌───────────────────────────┐
│  世界观设定               │
├───────────────────────────┤
│  时代背景                 │
│  ┌─────────────────────┐  │
│  │ 2087 年的新上海...  │  │
│  └─────────────────────┘  │
│                           │
│  地理环境                 │
│  ┌─────────────────────┐  │
│  │ （空）等待 AI 生成  │  │
│  └─────────────────────┘  │
│                           │
│  社会结构                 │
│  ┌─────────────────────┐  │
│  │ ...                 │  │
│  └─────────────────────┘  │
│                           │
│  力量/科技体系            │
│  ┌─────────────────────┐  │
│  │ ...                 │  │
│  └─────────────────────┘  │
│                           │
│         [ 下一步 → ]      │
└───────────────────────────┘
```

**细节**：

- 四个字段垂直排列，`<label>` + `<div>` 只读展示（Stage 1 用 div 不用 textarea，点击不编辑）
- 字段为空时显示浅灰色占位符「待 AI 生成」
- 当 `onToolUpdated` 触发时，重新 fetch 世界观数据并填充
- 底部「下一步」按钮：
  - 点击后先 `PATCH /api/projects/[id]/step { step: "CHARACTERS" }`
  - 成功后 `router.push(\`/p/${id}/characters\`)`
  - Stage 1 不强制校验字段是否填完（允许空着跳，mvp 自由度高）

### 5.6 人物页占位 `/p/[id]/characters`

Stage 1 只需要是一个可到达的页面：

- 复用通用布局（进度条自动高亮「人物」）
- 中间显示一行字：「人物构建将在 Stage 2 开放」+ 一个返回世界观的链接
- 不需要右侧面板、不需要聊天

---

## 六、AI Prompt 与工具设计

### 6.1 System Prompt 结构

整段 system prompt 是三段拼接：

```
[通用身份段]
你是「Ying Story Architect」的 AI 创作伙伴，协助用户一步步完成小说创作。
你当前处于「世界观构建」阶段。

核心规则：
- 你只通过"自然语言对话 + 工具调用"工作，不要输出 JSON 或代码块作为回复正文。
- 当用户提供的信息足以填充某个结构化字段时，主动调用 updateWorld 工具保存，不需要等用户明确要求。
- 你可以一次只保存部分字段，也可以多次调用工具完善字段；每次保存后用一句话自然告知用户已记录。
- 对话无状态：你每次收到的系统提示都附带了当前已保存的世界观数据，你不需要重复询问已经保存的内容。
- 引导时一次只问 1-2 个问题，不要一口气抛出长清单。
- 如果用户的描述比较模糊，先用简单的追问把关键信息具象化，然后再调工具。

[项目上下文段（服务端动态拼接）]
用户的初始灵感：
"""
{project.initialIdea}
"""

当前已保存的世界观：
- 时代背景：{world.era || "（未设置）"}
- 地理环境：{world.geography || "（未设置）"}
- 社会结构：{world.socialStructure || "（未设置）"}
- 力量体系：{world.powerSystem || "（未设置）"}

[世界观阶段指令段]
你的任务是通过对话帮助用户把世界观的四个字段完善：
1. era 时代背景：故事发生的年代、科技/文明水平
2. geography 地理环境：主要地点、自然/城市环境
3. socialStructure 社会结构：势力、阶层、政治/经济形态
4. powerSystem 力量/科技/魔法体系：故事中特殊力量或核心技术

引导策略：
- 第一轮先基于初始灵感，询问时代和地理
- 之后根据用户回答自然推进，避免刻板问卷式提问
- 如果用户一次性给出了多个维度的信息，直接用工具一次性保存，不必拆分
- 所有四个字段都有实质内容后，可以主动说"世界观已基本成型，随时可以点击下一步进入人物设定"，但不要催促
- 回答使用中文，语气像一个有经验的创作教练，简洁友好，不要太客套
```

### 6.2 `updateWorld` 工具定义

用 Zod 定义参数，交给 `streamText` 的 `tools` 选项：

```ts
// 以下是方案描述，不是代码：
工具名: updateWorld
描述: 保存或更新世界观设定。当从用户对话中收集到任何字段的实质内容时调用。可以一次更新部分字段，已传入的字段会覆盖数据库中的值，未传入的字段保持不变。
参数:
  era?:           string  // 时代背景
  geography?:     string  // 地理环境
  socialStructure?: string // 社会结构
  powerSystem?:   string  // 力量/科技/魔法体系
返回:
  { success: true, saved: { era, geography, socialStructure, powerSystem } }
```

**服务端执行逻辑**：

1. 拿到 LLM 传过来的部分字段
2. 对 `WorldBuilding` 表按 `projectId` 执行 `update`（仅更新非 undefined 的字段）
3. 返回更新后的完整世界观对象（让 LLM 知道现在库里是什么）
4. **重要**：工具执行是服务端的副作用，它同时会让 AI SDK 向前端流一个 tool-result 事件，ChatPanel 监听该事件并通过 `onToolUpdated` 回调让右栏刷新

### 6.3 模型与参数

- Provider：OpenAI 兼容（`createOpenAI({ apiKey, baseUrl })`），从环境变量读取
- Model：`process.env.AI_MODEL`（默认 `gpt-4o`）
- Temperature：`0.8`（创作类任务需要一定发散度）
- Max tokens：不限制，由流自然结束
- 不开启 `maxSteps` 自动循环，Stage 1 工具调用单次即可，LLM 自己会在 tool result 后用文本收尾

---

## 七、环境配置

### 7.1 本地数据库

使用任意方式运行本地 PostgreSQL 16（Homebrew、Postgres.app、系统包管理器均可），创建数据库 `ying_story`，然后在 `.env` 中填入对应 `DATABASE_URL`。

### 7.2 .env.example

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ying_story?schema=public"
AI_API_KEY="sk-xxx"
AI_BASE_URL="https://api.openai.com/v1"
AI_MODEL="gpt-4o"
```

### 7.3 依赖清单（package.json）

仅添加 architecture.md 第六节列出的**核心依赖**；Stage 1 暂不需要 `@uiw/react-md-editor`（章节页才用），可延到 Stage 3 再装。

需要现在装的：

- `next@16`, `react@19`, `react-dom@19`
- `typescript`, `@types/node`, `@types/react`, `@types/react-dom`
- `tailwindcss@4`, `@tailwindcss/postcss`
- `@prisma/client`, `prisma` (dev)
- `ai`, `@ai-sdk/openai`
- `zod`
- `class-variance-authority`, `clsx`, `tailwind-merge`, `tailwindcss-animate`
- `lucide-react`

shadcn 初始化方式：`npx shadcn@latest init` 后手动 add `button`、`input`、`textarea` 三个组件。

---

## 八、启动流程（Stage 1 验收时使用）

1. 确保本地 PostgreSQL 运行并创建好 `ying_story` 数据库
2. `cp .env.example .env`，填入 `DATABASE_URL` / AI_API_KEY / AI_BASE_URL / AI_MODEL
3. `pnpm install`
4. `npx prisma generate && npx prisma db push`
5. `pnpm dev`，访问 `http://localhost:3000`
6. 按 §九 的验收用例走一遍

---

## 九、验收标准（Definition of Done）

### 9.1 主流程用例

1. **创建项目**
   - 首页输入「赛博朋克都市，2087 年新上海，一个失忆的侦探追查自己的过去」，点击「开始创作」
   - 页面跳转到 `/p/<id>/worldbuilding`
   - 进度条显示「世界观」高亮

2. **AI 首轮引导**
   - 左栏 AI 自动发送欢迎语，询问时代/地理相关问题
   - 文字流式逐字输出，非整段返回

3. **多轮对话 + 自动保存**
   - 用户回复：「就设定在 2087 年新上海，黄浦江被改造成了全息广告河」
   - AI 流式回复，过程中可见 tool-call 状态
   - 右侧面板「时代背景」「地理环境」自动出现 AI 填写的文字
   - AI 用自然语言确认已记录，并继续追问下一个维度

4. **补全四个字段**
   - 经过 3-5 轮对话，四个字段都被填充
   - 每次保存后右侧面板对应字段实时更新
   - 用户没有手动点任何「保存」按钮

5. **下一步跳转**
   - 点击右下角「下一步」
   - 页面跳转到 `/p/<id>/characters`
   - 进度条高亮切换到「人物」

6. **持久化验证**
   - 在世界观页刷新浏览器
   - 聊天记录重置为欢迎语（正确行为：无状态）
   - 右侧面板四个字段**仍然存在**（从数据库加载）
   - 回到首页，项目列表中出现该作品卡片，点击能回到世界观页

### 9.2 非功能验收

- [ ] 控制台无无意义的报错（tool call 异常要能看到明确错误）
- [ ] 流式输出无明显卡顿（首 token < 2s）
- [ ] 代码通过 `tsc --noEmit` 无类型错误
- [ ] Prisma schema 与 architecture.md 一致
- [ ] 目录结构与 §2.3 一致（标 ★ 文件齐全，标 - 文件不存在）
- [ ] Stage 1 产出的 ChatPanel / ai.ts 结构能被 Stage 2 直接复用（人物步骤只需加 prompt + tool）

---

## 十、风险与注意事项

| 风险                                                | 应对策略                                                                                                                                                            |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LLM 不稳定，有时不主动调工具                        | system prompt 明确「主动调用、不必等用户许可」；temperature 不要太低；如测试发现漏调，可在 prompt 里加 1-2 个 few-shot 示例                                         |
| 工具调用后 LLM 又重复描述已保存内容                 | system prompt 中说明「保存后只用一句话简短确认，不要重述字段内容」                                                                                                  |
| 前端刷新后 `messages` 丢失，用户感觉「对话被清空」  | 这是产品设计上**有意为之**（architecture.md 明确无状态）。在欢迎语或 tooltip 里轻量提示「对话记录不保存，创作数据已在右侧面板永久保留」即可；Stage 1 可以先不加提示 |
| `streamText` 工具调用结果返回时序问题导致右栏不刷新 | 用 AI SDK 的 `onToolCall` / 前端 `useChat` 的 tool 消息事件双重保险，ChatPanel 通过回调通知右栏；必要时工具调用完成后统一 refetch                                   |
| Prisma 单例在 dev 热重载下重复实例化                | 采用 `globalThis` 缓存的标准 Next.js Prisma 单例模式                                                                                                                |
| Next.js 16 + Tailwind v4 版本变动                   | 以官方文档为准；shadcn 最新版默认已是 Tailwind v4，init 时选对版本                                                                                                  |

---

## 十一、交付物清单

完成后仓库应新增/修改：

- 项目配置类：`package.json`、`tsconfig.json`、`next.config.ts`、`postcss.config.mjs`、`tailwind.config.ts`（v4 可能不需要）、`.env.example`、`.gitignore`
- Prisma：`prisma/schema.prisma`
- App Router：`src/app/layout.tsx`、`src/app/page.tsx`、`src/app/globals.css`、`src/app/p/[id]/layout.tsx`、`src/app/p/[id]/worldbuilding/page.tsx`、`src/app/p/[id]/characters/page.tsx`
- API：`src/app/api/projects/route.ts`、`src/app/api/projects/[id]/step/route.ts`、`src/app/api/chat/[id]/route.ts`
- 组件：`src/components/ui/button.tsx`、`src/components/ui/input.tsx`、`src/components/ui/textarea.tsx`、`src/components/ChatPanel.tsx`、`src/components/StepProgress.tsx`
- Lib：`src/lib/db.ts`、`src/lib/ai.ts`、`src/lib/utils.ts`

Stage 1 完成后不应出现任何人物/大纲/章节相关的业务逻辑代码（占位页除外）。
