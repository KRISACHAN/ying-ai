# AI 小说创作 Agent MVP 需求文档

## 一、项目概述

**产品名称**: Ying Story Architect

**包名称**: `@ying/story-architect`

**核心价值**: 演示 AI 小说创作 Agent 能力 —— 用户从一句故事灵感开始，通过多轮 AI 对话引导，分四个阶段逐步构建：世界观设定 → 人物关系 → 故事大纲 → 章节内容，最终完成小说初稿。

**核心设计原则**:

- AI 每轮响应 = 自然语言回复 + 工具调用（自动保存结构化数据）
- 右侧面板实时展示 AI 提取的结构化内容
- 用户可以手动编辑任何结构化字段
- **对话无状态**：每轮 AI 请求都携带当前最新的所有结构化数据作为上下文，聊天记录不持久化（刷新页面聊天记录清空，但结构化创作数据永久保存）
- 优先保证核心流程跑通，一切非必要功能全部裁剪

**技术选型**:

- Next.js 16 (App Router) + TypeScript + React 19
- PostgreSQL + Prisma ORM
- Vercel AI SDK v5 (streaming + tool calling)
- Tailwind CSS v4 + shadcn/ui
- lucide-react 图标
- 无用户系统，无分享功能，单用户本地 mvp

---

## 二、创作流程

**四步引导式线性流程**（灵感在创建项目时一次性输入，不单独作为一个阶段）：

```
首页输入灵感创建项目 → Step1 世界观 → Step2 人物 → Step3 大纲 → Step4 章节
                          ↑            ↑         ↑         ↑
                          └───────────── 可点击回退任意已完成步骤 ─────────────┘
```

### 通用页面布局（所有 4 个步骤完全一致）

```
┌─────────────────────────────────────────────────────────────┐
│  故事标题         [←回首页]  ① 世界观  ② 人物  ③ 大纲  ④ 章节 │
├────────────────────────────────┬────────────────────────────┤
│                                │                            │
│          AI 对话区域           │      结构化数据面板        │
│                                │                            │
│  AI: 让我们构建你的世界...     │  ┌────────────────────────┐│
│                                │  │ 世界观设定              ││
│  你: 赛博朋克都市，2087年       │  │ 时代：2087 新上海       ││
│                                │  │ 地理：黄浦江畔...       ││
│  AI: 好的，已保存。再聊聊...   │  │ 力量体系：...           ││
│                                │  └────────────────────────┘│
│  ┌──────────────────────────┐ │                            │
│  │ 输入你的想法...          │ │                            │
│  └──────────────────────────┘ │                            │
└────────────────────────────────┴────────────────────────────┘
```

- **左侧 55%**: 聊天对话区，流式 AI 回复
- **右侧 45%**: 结构化内容展示 + 简单编辑
- **顶部**: 4 步进度指示器，已完成可点击回退
- 章节写作页面不做特殊三栏布局，保持同样左右结构：右侧展示章节列表，AI 在左侧聊天辅助写作，点击章节打开编辑器。

---

### 首页 `/`

极简设计：

1. 顶部标题 + 「新建小说」输入框（输入一句话灵感，点击创建直接进入世界观步骤）
2. 下方展示已有小说列表，每张卡片显示标题、更新时间，点击进入，点击删除直接删除（无确认弹窗）
3. 空状态提示："还没有作品，输入灵感开始创作吧"

---

### Step 1: 世界观设定 (`/p/[id]/worldbuilding`)

**AI 行为**:

- 基于用户初始灵感，提问引导构建世界观（时代、地理、社会、力量体系）
- 信息足够时调用 `updateWorld` 工具保存

**结构化字段**（全部为简单文本字段）:
| 字段 | 说明 |
|------|------|
| era | 时代背景 |
| geography | 地理环境 |
| socialStructure | 社会结构 |
| powerSystem | 力量/魔法/科技体系 |

右侧面板使用简单文本展示，点击即可编辑，失焦自动保存。

---

### Step 2: 人物关系 (`/p/[id]/characters`)

**AI 行为**:

- 基于灵感 + 世界观，提议核心角色
- 每轮添加/更新 1-2 个角色，调用 `addCharacter`/`updateCharacter` 工具

**人物字段**:
| 字段 | 说明 |
|------|------|
| name | 姓名 |
| role | protagonist/antagonist/supporting |
| identity | 身份 |
| motivation | 核心动机 |
| personality | 性格 |
| appearance | 外貌 |
| arc | 成长弧光 |
| relationships | 人物关系（纯文本描述，不需要单独关系表） |

右侧面板展示人物卡片列表，支持删除。

---

### Step 3: 故事大纲 (`/p/[id]/outline`)

**AI 行为**:

- 直接生成扁平的章节大纲（不做幕/场景层级拆分）
- 每章包含：章节号、标题、一句话概要
- 工具: `addChapterOutline` 批量生成所有章节，`updateChapterOutline` 更新单个

**大纲结构**: 简单章节数组，每个章节 `{ number, title, summary }`

右侧面板展示章节列表，支持编辑标题和概要，不需要拖拽排序。

---

### Step 4: 章节内容 (`/p/[id]/chapters`)

**布局保持一致**：左侧聊天，右侧面板。

- 右侧面板：章节列表，点击章节在当前页展开 Markdown 编辑器
- 编辑器支持直接编辑，自动保存
- AI 功能：
  1. **生成章节初稿**：基于大纲 + 世界观 + 人物，流式生成当前选中章节内容
  2. **续写**：从当前结尾继续写
- 删除：选中改写、反馈建议、章节摘要生成等复杂功能（mvp 不需要）

---

## 三、数据库 Schema (Prisma)

大幅简化，去掉所有非核心表和字段：

```prisma
model Project {
  id          String   @id @default(cuid())
  title       String   @default("未命名作品")
  initialIdea String
  currentStep Step     @default(WORLDBUILDING)

  world       WorldBuilding?
  characters  Character[]
  chapters    Chapter[]

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

enum Step {
  WORLDBUILDING
  CHARACTERS
  OUTLINE
  CHAPTERS
}

model WorldBuilding {
  id              String   @id @default(cuid())
  projectId       String   @unique
  project         Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)

  era             String   @default("")
  geography       String   @default("")
  socialStructure String   @default("")
  powerSystem     String   @default("")
}

model Character {
  id            String   @id @default(cuid())
  projectId     String
  project       Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)

  name          String
  role          String   // "protagonist" | "antagonist" | "supporting"
  identity      String   @default("")
  motivation    String   @default("")
  personality   String   @default("")
  appearance    String   @default("")
  arc           String   @default("")
  relationships String   @default("") // 纯文本描述，不单独建表
  order         Int      @default(0)

  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

model Chapter {
  id         String   @id @default(cuid())
  projectId  String
  project    Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)

  number     Int
  title      String
  summary    String   @default("") // 大纲概要
  content    String   @default("") // 正文 Markdown

  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@unique([projectId, number])
}
```

**已删除**:

- Relationship 独立表 → 合并为 Character 纯文本字段
- OutlineNode 树形结构 → 直接用 Chapter 表的 summary 字段
- Message 持久化表 → 聊天记录不入库
- 所有 done 布尔标记、shareId、extraFields、coreRules 数组、targetAudience 等非核心字段

---

## 四、API 设计

仅保留核心 API：

| 方法   | 路径                                      | 说明                               |
| ------ | ----------------------------------------- | ---------------------------------- |
| GET    | `/api/projects`                           | 获取所有小说列表                   |
| POST   | `/api/projects`                           | 创建新项目，入参 `{ initialIdea }` |
| DELETE | `/api/projects/[id]`                      | 删除小说                           |
| PATCH  | `/api/projects/[id]/step`                 | 更新当前步骤                       |
| PATCH  | `/api/projects/[id]/title`                | 更新标题                           |
| PATCH  | `/api/projects/[id]/world`                | 手动保存世界观                     |
| POST   | `/api/projects/[id]/characters`           | 新增人物                           |
| PATCH  | `/api/projects/[id]/characters/[charId]`  | 更新人物                           |
| DELETE | `/api/projects/[id]/characters/[charId]`  | 删除人物                           |
| PATCH  | `/api/projects/[id]/chapters/[chapterId]` | 保存章节（标题/概要/正文）         |
| POST   | `/api/chat/[id]`                          | 核心 AI 流式对话入口               |

### 核心 AI API `/api/chat/[id]`

请求参数:

```typescript
{
  messages: UIMessage[],  // 当前聊天记录（前端内存中，不持久化）
  step: Step,
  currentChapterId?: string // 章节步骤时传入
}
```

服务端逻辑:

1. 根据项目 ID 加载**所有已保存的结构化数据**（世界观、人物、章节），这是 AI 上下文的核心
2. 根据当前 step 选择对应 system prompt 和工具集
3. `streamText()` 流式响应，工具调用直接写入数据库
4. 无需持久化消息，聊天记录仅前端内存保存

---

## 五、目录结构

尽量精简，减少文件数量：

```
ying-story-architect/
├── prisma/
│   └── schema.prisma
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                    # 首页：列表 + 新建
│   │   ├── globals.css
│   │   ├── p/[id]/
│   │   │   ├── layout.tsx              # 通用布局：顶部进度条 + 两栏
│   │   │   ├── worldbuilding/page.tsx  # Step1
│   │   │   ├── characters/page.tsx     # Step2
│   │   │   ├── outline/page.tsx        # Step3
│   │   │   └── chapters/page.tsx       # Step4
│   │   └── api/
│   │       ├── projects/
│   │       │   ├── route.ts
│   │       │   └── [id]/route.ts
│   │       ├── chat/[id]/route.ts      # AI 对话端点
│   │       └── projects/[id]/
│   │           ├── step/route.ts
│   │           ├── title/route.ts
│   │           ├── world/route.ts
│   │           ├── characters/
│   │           │   ├── route.ts
│   │           │   └── [charId]/route.ts
│   │           └── chapters/[chapterId]/route.ts
│   ├── components/
│   │   ├── ui/               # shadcn 基础组件（button/input/card/textarea）
│   │   ├── ChatPanel.tsx     # 通用聊天面板
│   │   ├── StepProgress.tsx  # 4步进度条
│   │   ├── WorldPanel.tsx
│   │   ├── CharacterPanel.tsx
│   │   ├── OutlinePanel.tsx
│   │   └── ChapterPanel.tsx
│   └── lib/
│       ├── db.ts             # Prisma client
│       ├── ai.ts             # AI client + prompts + tools 单文件搞定
│       └── utils.ts
├── .env.example
├── package.json
└── tsconfig.json
```

**已精简**: 拆分的 hooks/types/ai/tools/prompts 多目录全部合并，减少文件数。

---

## 六、技术栈依赖

只保留核心依赖：

| 包名                                             | 用途          |
| ------------------------------------------------ | ------------- |
| next@16                                          | 框架          |
| react@19 + react-dom@19                          | UI            |
| @prisma/client + prisma                          | ORM           |
| ai + @ai-sdk/openai                              | Vercel AI SDK |
| zod                                              | 工具参数验证  |
| @uiw/react-md-editor                             | Markdown 编辑 |
| class-variance-authority + clsx + tailwind-merge | 样式工具      |
| lucide-react                                     | 图标          |
| tailwindcss@4 + @tailwindcss/postcss             | 样式          |
| typescript                                       | 类型          |

**已删除**: nanoid（用 cuid 足够）、dnd-kit（拖拽）、swr（数据获取）、@dnd-kit/utilities 等。

---

## 七、环境变量

```env
# PostgreSQL
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ying_story?schema=public"

# AI 配置（支持任意 OpenAI 兼容 API）
AI_API_KEY="sk-xxx"
AI_BASE_URL="https://api.openai.com/v1"
AI_MODEL="gpt-4o"
```

---

## 八、启动流程

1. 确保本地有可用的 PostgreSQL（任意方式安装均可）
2. 安装依赖: `pnpm install`
3. 配置环境变量: `cp .env.example .env` 填写数据库连接串与 API key
4. 初始化数据库: `npx prisma generate && npx prisma db push`
5. 启动开发: `pnpm dev`，访问 `http://localhost:3000`

---

## 九、裁剪说明

为了快速交付 mvp，以下功能明确**不做**：

❌ 用户系统/登录
❌ 分享链接（直接用数据库 id 访问）
❌ 对话历史持久化（聊天刷新即失，结构化数据保留）
❌ 章节摘要生成 / token 优化
❌ 大纲/章节拖拽排序
❌ 人物关系图/独立关系表
❌ 三级树形大纲结构（幕→章→场景）
❌ AI 选中改写/文本评估反馈
❌ 章节页面三栏布局
❌ 响应式移动端适配
❌ 自定义字体/思源宋体（用系统默认字体）
❌ 二次确认弹窗/各种空状态打磨
❌ 额外的自定义字段/扩展能力
❌ SWR 等复杂数据获取库（直接 fetch 即可）
❌ 示例灵感卡片
❌ 类型校验枚举（角色 role 用字符串即可）

**保留的核心能力**:
✅ 四阶段创作流程完整跑通
✅ AI 多轮对话 + 流式回复
✅ AI 自动调用工具保存结构化数据
✅ 右侧实时展示结构化产物
✅ 用户可以手动编辑任何字段
✅ 世界观/人物/大纲/章节全部功能可用
✅ AI 生成章节正文 + 续写
✅ 数据持久化到 PostgreSQL
✅ 回退修改已完成步骤
✅ 深色主题
