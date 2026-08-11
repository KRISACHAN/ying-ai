# Stage 2: 人物 + 大纲步骤

> 所属版本: v1.0 MVP
> 前置文档: [architecture.md](../../architecture.md)、[01-v1.0-plan.md](../../prompts/01-v1.0-plan.md)、[stage-1-framework-worldbuilding.md](stage-1-framework-worldbuilding.md)

---

## 一、目标与范围

### 1.1 核心目标

复用 Stage 1 已验证的 **AI 流式对话 + Tool Calling + 右侧结构化面板** 模式，快速完成创作流程的中间两个步骤：

```
世界观（Stage 1 已完成）→ 人物关系 → 故事大纲 → 章节（Stage 3）
                              ↑          ↑
                              └── 本阶段交付 ───┘
```

人物和大纲两个步骤在技术形态上完全对称：左栏聊天引导、AI 通过工具批量/增量写入结构化数据、右栏只读卡片/列表展示、底部「下一步」线性推进。本阶段的关键不是新架构，而是**在现有骨架上增加两组 prompt + 两组工具 + 两个页面**，让流程能线性走通到章节页门口。

### 1.2 本阶段做什么

- 人物步骤 `/p/[id]/characters`：
  - 新增 `addCharacter` 工具（增量追加单个人物）
  - 人物阶段 system prompt：基于灵感 + 世界观提议核心角色
  - 右侧人物卡片列表（只读展示，不做编辑/删除）
  - 底部「下一步」跳大纲页，更新 currentStep
- 大纲步骤 `/p/[id]/outline`：
  - 新增 `batchCreateChapters` 工具（一次性批量生成全部章节）
  - 大纲阶段 system prompt：生成扁平章节数组（章节号 + 标题 + 一句话概要）
  - 右侧章节列表（只读展示标题和概要，不做编辑/拖拽排序）
  - 底部「下一步」跳章节页占位，更新 currentStep
- `/api/chat/[id]` 按 step 分发到不同 prompt + 工具集的分发逻辑
- 章节页 `/p/[id]/chapters` 占位页（类似 Stage 1 的人物占位）

### 1.3 本阶段明确不做

| 不做项                                 | 原因                                                           |
| -------------------------------------- | -------------------------------------------------------------- |
| 人物字段编辑、删除                     | Stage 3 或之后再补手动编辑                                     |
| 人物关系图、独立关系表                 | architecture.md 已明确用纯文本 relationships 字段              |
| `updateCharacter` 工具                 | mvp 阶段人物一次成型即可，不支持 AI 回改（用户手动改留给后续） |
| 大纲拖拽排序、三级树结构（幕/章/场景） | architecture.md 明确扁平章节数组                               |
| 单章增量 `addChapterOutline` 工具      | 用 `batchCreateChapters` 一次性生成，简化流程                  |
| 章节正文生成                           | Stage 3 职责                                                   |
| 回退到已完成步骤（进度条可点击）       | 进度条仍只展示，Stage 3 再做回退                               |
| 标题编辑、项目删除、世界观手动编辑     | 仍保持 Stage 1 的极简程度                                      |
| 错误重试/loading 细节打磨              | 保持 Stage 1 水平                                              |

---

## 二、技术架构要点

### 2.1 整体调用链（新增部分高亮）

Stage 2 在 Stage 1 已有的调用链基础上，仅在两处扩展：

1. **`/api/chat/[id]` 的 step 分发**：Stage 1 只识别 `WORLDBUILDING`，本阶段新增 `CHARACTERS` / `OUTLINE` 两个分支，各自映射到一组 system prompt 片段 + 工具集
2. **两类新工具的副作用写入**：
   - `addCharacter` → INSERT 到 `Character` 表
   - `batchCreateChapters` → 先清空该 project 已有 Chapter（保证幂等），再批量 INSERT

```
浏览器                        Next.js Server                  DB / LLM
  │                              │                             │
  │  （Stage 1 已有：创建项目、世界观对话）                    │
  │                              │                             │
  │  1. 用户在世界观页点「下一步」                             │
  │ ──────────────────────────► │                             │
  │                              │ ── UPDATE step=CHARACTERS ► │
  │  ◄── 跳转 /p/[id]/characters│                             │
  │                              │                             │
  │  2. 人物页：用户发消息                                      │
  │ ──────────────────────────► │                             │
  │                              │ ── SELECT Project+World+   │
  │                              │    Characters (已存在) ────► │
  │                              │ ── streamText(step=CHARS,  │
  │                              │    tools=[addCharacter]) ──► LLM
  │  ◄── 流式文本 chunk ───────  │                             │
  │                              │ ◄── tool call addCharacter  │
  │                              │ ── INSERT Character ──────► │
  │  ◄── tool result 事件 ─────  │  （右栏刷新人物卡片）       │
  │                              │                             │
  │  3. 点「下一步」→ 大纲页，step=OUTLINE                      │
  │                              │                             │
  │  4. 大纲页：用户让 AI 生成大纲                              │
  │ ──────────────────────────► │                             │
  │                              │ ── SELECT 全量上下文 ──────► │
  │                              │ ── streamText(step=OUTLINE,│
  │                              │    tools=[batchCreateCh.]) ► LLM
  │  ◄── 流式文本 chunk ───────  │                             │
  │                              │ ◄── tool call batchCreateCh.│
  │                              │ ── DELETE existing Chapters│
  │                              │ ── INSERT N Chapters ──────► │
  │  ◄── tool result 事件 ─────  │  （右栏刷新章节列表）       │
  │                              │                             │
  │  5. 点「下一步」→ 章节页占位，step=CHAPTERS                │
  │                              │                             │
```

### 2.2 复用原则

Stage 2 **不新增任何基础设施类代码**，完全复用 Stage 1：

- 复用 `ChatPanel` 组件（`step` 参数改成传 `"CHARACTERS"` / `"OUTLINE"`，`onToolUpdated` 回调原样使用）
- 复用 `StepProgress` 组件（currentStep 变化后自动高亮对应节点）
- 复用项目通用布局 `/p/[id]/layout.tsx`（左右两栏结构不变）
- 复用 `/api/chat/[id]` 的 streamText 主流程，只加 prompt/tool 映射分支
- 复用 `PATCH /api/projects/[id]/step` 推进步骤
- 复用 `lib/db.ts`、`lib/utils.ts`、shadcn 基础组件

Stage 2 新增的代码量应主要集中在：

- `src/lib/ai.ts` 里追加人物 prompt、大纲 prompt、两个新工具定义
- `src/app/p/[id]/characters/page.tsx`
- `src/app/p/[id]/outline/page.tsx`
- `src/app/p/[id]/chapters/page.tsx`（占位）
- `src/components/CharacterPanel.tsx`
- `src/components/OutlinePanel.tsx`
- API 层本阶段**不需要新增独立 route 文件**（工具通过 `/api/chat/[id]` 的 onToolCall 写入；手动编辑 API 仍按 Stage 1 策略留空或提供最小空壳）

### 2.3 无状态对话原则（重申）

人物和大纲阶段严格沿用 Stage 1 的无状态约定：

- 每轮 `/api/chat/[id]` 请求都从数据库读取**最新**的 Project + World + Characters（+ 大纲阶段还要读 Chapters），拼入 system prompt
- 聊天记录不持久化；刷新页面左栏清空、右栏从 DB 重建
- AI 通过工具调用写入事实数据；不在聊天文本里事后解析

人物阶段需要特别注意：prompt 中要把**已生成的人物列表**告诉 LLM，避免它重复生成同名角色或忘记已有人物。大纲阶段同理：如果 Chapters 已经存在，prompt 要告知"当前已有 X 章"，决定是覆盖还是提示用户。

### 2.4 目录结构（Stage 2 实际产出）

在 Stage 1 基础上新增/修改：标 ★ 的为新增/改动，标 · 的为沿用 Stage 1 不改动：

```
ying-story-architect/
├── prisma/
│   └── schema.prisma                    · 完整 Schema 已在 Stage 1 建好，不改
├── src/
│   ├── app/
│   │   ├── layout.tsx                   ·
│   │   ├── page.tsx                     ·
│   │   ├── globals.css                  ·
│   │   ├── p/[id]/
│   │   │   ├── layout.tsx               · 通用布局，不改
│   │   │   ├── worldbuilding/page.tsx   · 世界观页，不改
│   │   │   ├── characters/page.tsx      ★ 从占位页升级为真实人物页
│   │   │   ├── outline/page.tsx         ★ 新建大纲页
│   │   │   └── chapters/page.tsx        ★ 新建章节占位页
│   │   └── api/
│   │       ├── projects/
│   │       │   └── route.ts             ·
│   │       ├── chat/[id]/route.ts       ★ 扩展 step 分发，注入新 prompt/工具
│   │       └── projects/[id]/
│   │           ├── step/route.ts        ·
│   │           ├── world/route.ts       · 仍然留空
│   │           └── characters/
│   │               ├── route.ts         - 本阶段仍不实现手动 POST（AI 通过 chat 工具写入）
│   │               └── [charId]/route.ts - 本阶段不实现
│   ├── components/
│   │   ├── ui/                          ·
│   │   ├── ChatPanel.tsx                · 不改，直接复用
│   │   ├── StepProgress.tsx             · 不改（currentStep 自动传）
│   │   ├── CharacterPanel.tsx           ★ 新建，人物卡片列表
│   │   └── OutlinePanel.tsx             ★ 新建，章节列表
│   └── lib/
│       ├── db.ts                        ·
│       ├── ai.ts                        ★ 新增人物/大纲 prompt + addCharacter/batchCreateChapters 工具
│       └── utils.ts                     ·
├── .env.example                         ·
└── package.json                         · 不新增依赖
```

> 注：`api/projects/[id]/characters/route.ts` 等手动编辑 API 本阶段仍然不实现，因为 architecture.md 中手动编辑字段的能力 Stage 2 也不做（只读展示）。如果后续阶段补手动编辑再打开。

---

## 三、数据模型

### 3.1 表结构

完全复用 Stage 1 已经建好的 Prisma Schema，不做任何修改：

- `Character` 表字段：`id / projectId / name / role / identity / motivation / personality / appearance / arc / relationships / order / createdAt / updatedAt`
- `Chapter` 表字段：`id / projectId / number / title / summary / content / createdAt / updatedAt`，`@@unique([projectId, number])`

Stage 1 已经 `prisma db push` 过，本阶段不需要任何 migration。

### 3.2 数据写入约定

**人物写入（addCharacter）**：

- 每次工具调用写入一条 Character 记录
- `order` 字段取当前该 project 下人物数量（`count`）作为新人物的排序值，保证插入顺序即展示顺序
- `role` 接受字符串：`"protagonist"` / `"antagonist"` / `"supporting"`（architecture 已明确不枚举校验）
- 不做同名去重（让 LLM 自己注意，prompt 里提醒即可）

**大纲写入（batchCreateChapters）**：

- 工具接收完整章节数组，服务端执行**幂等覆盖**语义：
  1. 在一个交互/事务里先 DELETE 该 projectId 下所有 Chapter（`content` 字段在本阶段肯定是空，但 Stage 3 之后要小心——不过 Stage 3 生成本身也在大纲确认之后，所以 Stage 2 期间覆盖是安全的）
  2. 批量 INSERT 新章节数组
- `number` 字段从 1 开始递增；工具入参里也可以显式传 number，服务端以入参为准并校验连续
- `content` 字段留空字符串（Stage 3 使用）
- `summary` 是一句话概要（不是正文）

为什么是"批量全量覆盖"而不是"增量添加"：architecture.md 明确大纲由 AI 一次性生成扁平章节列表，用户体验上"让 AI 重新生成大纲"是自然操作，全量覆盖比"删除部分 + 追加部分"简单且不会留脏数据。

---

## 四、API 设计（Stage 2 涉及的）

### 4.1 `POST /api/chat/[id]`（扩展）

- **请求体**新增 step 值：
  ```ts
  {
    messages: UIMessage[],
    step: "WORLDBUILDING" | "CHARACTERS" | "OUTLINE"  // 新增两个
  }
  ```
- **服务端处理流程**（Stage 1 基础上扩展）：
  1. 根据 `id` 查询 Project，**关联查询** `world`、`characters`（order by `order` asc）、`chapters`（order by `number` asc）
  2. 根据 `step` 选择 system prompt 片段和工具集：
     - `WORLDBUILDING` → 世界观 prompt + `updateWorld`（Stage 1）
     - `CHARACTERS` → 人物 prompt + `addCharacter`（Stage 2 新增）
     - `OUTLINE` → 大纲 prompt + `batchCreateChapters`（Stage 2 新增）
  3. 构造最终 system prompt（通用身份段 + 项目上下文段 + 阶段指令段）
  4. `streamText()` 调用保持不变
- **项目上下文段动态拼装**：
  - 人物阶段追加当前已有人物列表（name / role / identity / motivation 精简展示），方便 LLM 避免重复
  - 大纲阶段追加世界观完整字段 + 人物列表（name / role），让生成的大纲与人物动机对齐

### 4.2 `PATCH /api/projects/[id]/step`（沿用）

不改动，Stage 2 只是从前端多调用两次：

- 人物页 → 大纲页：`{ step: "OUTLINE" }`
- 大纲页 → 章节页占位：`{ step: "CHAPTERS" }`

### 4.3 工具的 HTTP 暴露

两个新工具**不**作为独立 HTTP endpoint 暴露，它们只存在于 `/api/chat/[id]` 的 `tools` 定义里，由 LLM 的 tool call 触发，在 `onToolCall` 回调中直接写库。

> 这是 Stage 1 已经验证的模式（`updateWorld` 也是这样），保持一致以降低认知负担。独立 REST API 留给后续手动编辑功能。

---

## 五、页面与组件设计

### 5.1 人物页 `/p/[id]/characters`

替换 Stage 1 的占位内容。完全沿用通用左右两栏布局：

**左栏（55%）**：`<ChatPanel step="CHARACTERS" onToolUpdated={refreshCharacters} initialMessages={...} />`

- 欢迎语示例：
  > 世界观已经搭建好了，接下来我们来设计故事的核心人物。我会先基于你的灵感和世界观提议几位主要角色，你可以告诉我喜欢哪些、想调整哪些。准备好了吗？

**右栏（45%）**：`<CharacterPanel />`

```
┌───────────────────────────┐
│  人物角色                 │
├───────────────────────────┤
│                           │
│  ┌─────────────────────┐  │
│  │ 林野 · 主角         │  │
│  │ 失忆的私家侦探      │  │
│  │                     │  │
│  │ 动机：找回失去的   │  │
│  │ 记忆，查明自己过   │  │
│  │ 去的真相            │  │
│  └─────────────────────┘  │
│                           │
│  ┌─────────────────────┐  │
│  │ 苏鸦 · 对手         │  │
│  │ 掌控新上海地下情报 │  │
│  │ 网的掮客            │  │
│  │ ...                 │  │
│  └─────────────────────┘  │
│                           │
│  （空状态：等待 AI 生成   │
│   第一位角色）            │
│                           │
│         [ 下一步 → ]      │
└───────────────────────────┘
```

**CharacterPanel 设计要点**：

- 进入页面时 fetch 一次该 project 的 characters（`fetch('/api/projects/...')` 或者通过 layout 传下来；Stage 1 已有做法是 useEffect + fetch，这里保持一致不引入 SWR）
- 卡片垂直排列，按 `order` 升序
- 每张卡片展示：
  - 第一行：**姓名 · 角色标签**（主角 / 对手 / 配角，中文映射展示）
  - 第二行：身份（灰色小字）
  - 第三行起：动机（截断显示前 2 行，超出省略；Stage 2 不做展开/折叠，简单截断即可）
- 空状态：浅灰文案"等待 AI 生成第一位角色"
- 不提供编辑按钮、删除按钮、新增按钮（纯 AI 生成展示）
- 当 `onToolUpdated` 触发（工具名是 `addCharacter`）时，重新 fetch 人物列表
- 底部「下一步」按钮：点击 → `PATCH step=OUTLINE` → `router.push('/p/[id]/outline')`
- 不校验人物数量（允许 0 个也能下一步，保持 Stage 1 的自由度）

### 5.2 大纲页 `/p/[id]/outline`

**左栏（55%）**：`<ChatPanel step="OUTLINE" onToolUpdated={refreshChapters} initialMessages={...} />`

- 欢迎语示例：
  > 人物就位，现在来规划整本书的章节。我会基于世界观和人物，一次性生成全部章节（包括章节号、标题和一句话概要）。你想写多少章？或者直接告诉我"生成大纲"，我来决定合适的长度。

**右栏（45%）**：`<OutlinePanel />`

```
┌───────────────────────────┐
│  故事大纲（共 12 章）      │
├───────────────────────────┤
│                           │
│  第 1 章                  │
│  黄浦江的浮尸             │
│  ───────────────────────  │
│  林野从昏迷中醒来，发    │
│  现自己躺在一条漂着全    │
│  息广告的河道边，兜里    │
│  只有一张写着"别相信    │
│  苏鸦"的纸条。           │
│                           │
│  第 2 章                  │
│  掮客的邀请               │
│  ───────────────────────  │
│  林野根据线索找到地下    │
│  情报网，却被苏鸦的人    │
│  先一步堵住，对方递来    │
│  一份交易...              │
│                           │
│  ...                      │
│                           │
│         [ 下一步 → ]      │
└───────────────────────────┘
```

**OutlinePanel 设计要点**：

- 进入页面时 fetch 该 project 的 chapters（order by number asc）
- 顶部显示章节总数
- 每个章节块垂直堆叠，展示：
  - `第 N 章`（小字灰色）
  - 章节标题（加粗）
  - 分隔线
  - 概要正文（多行，不截断）
- 空状态：浅灰文案"等待 AI 生成大纲"
- 不提供编辑、删除、上移下移、新增按钮
- 批量工具返回后，整个章节列表会被覆盖式刷新（重新 fetch）
- 底部「下一步」按钮：点击 → `PATCH step=CHAPTERS` → `router.push('/p/[id]/chapters')`
- 不校验章节数量

### 5.3 章节页占位 `/p/[id]/chapters`

与 Stage 1 人物占位页对称：

- 复用通用布局（进度条自动高亮「章节」）
- 中间显示一行字：「章节写作将在 Stage 3 开放」+ 一个返回大纲页的链接
- 不需要右侧面板、不需要聊天

### 5.4 首页

不改。项目卡片点击后根据 `currentStep` 跳到对应步骤页：

- Stage 2 验收时，如果有作品停在 CHARACTERS / OUTLINE / CHAPTERS 步骤，点卡片要能正确跳到 `/characters`、`/outline`、`/chapters`（Stage 1 固定跳 worldbuilding 的逻辑要改成按 `currentStep` 分发）

> 这是 Stage 2 唯一需要微调的非新增页面逻辑：首页的跳转目标需要映射 `currentStep → path`。

### 5.5 StepProgress 组件

不改。父布局传入当前 `currentStep`，组件按 Stage 1 规则渲染高亮即可。Stage 2 让人物/大纲/章节节点都能被渲染出来，但仍保持**不可点击**（回退能力 Stage 3 再做）。

---

## 六、AI Prompt 与工具设计

### 6.1 System Prompt 通用结构

延续 Stage 1 的三段拼接：`[通用身份段] + [项目上下文段（动态）] + [阶段指令段]`。

**通用身份段**保持 Stage 1 文案，只是把阶段名从「世界观构建」替换成对应步骤，并调整核心规则里提到的工具名：

```
你是「Ying Story Architect」的 AI 创作伙伴，协助用户一步步完成小说创作。
你当前处于「{阶段名}」阶段。

核心规则：
- 你只通过"自然语言对话 + 工具调用"工作，不要输出 JSON 或代码块作为回复正文。
- 信息足够时主动调用工具保存结构化数据，不需要等用户明确要求。
- 你可以多次调用工具逐步完善；每次保存后用一句话自然告知用户已记录。
- 对话无状态：你每次收到的系统提示都附带了当前已保存的所有创作数据，你不需要重复询问已经保存的内容。
- 引导时一次只问 1-2 个问题，不要一口气抛出长清单。
- 回答使用中文，语气像一个有经验的创作教练，简洁友好，不要太客套。
```

### 6.2 人物阶段 Prompt

**项目上下文段（服务端动态拼接）**：

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

已创建的人物（{characters.length} 位）：
{ characters.length === 0
  ? "（暂无）"
  : characters.map(c =>
      `- ${c.name}（${roleLabel(c.role)}）：${c.identity}。动机：${c.motivation || "（未填写）"}`
    ).join("\n")
}
```

其中 `roleLabel` 做简单映射：protagonist → 主角 / antagonist → 对手 / supporting → 配角。

**阶段指令段**：

```
你的任务是通过对话帮助用户塑造故事的核心人物阵容。每位人物包含以下字段：
1. name 姓名：角色的名字或称呼
2. role 角色类型：protagonist（主角）、antagonist（对手/反派）、supporting（配角）
3. identity 身份：职业、社会身份或在故事中的定位
4. motivation 核心动机：驱动这个角色行动的根本欲望或目标
5. personality 性格：2-3 个关键词概括的性格特征
6. appearance 外貌：简短的外貌描述（可留白）
7. arc 成长弧光：角色在故事中将经历怎样的转变（可留白）
8. relationships 人物关系：与其他角色的关系、与世界观中势力的关联（一段纯文本描述）

引导策略：
- 第一轮基于灵感和世界观，主动提议 2-3 位核心角色（通常包含 1 位主角，必要时包含 1 位对手），可以直接调用 addCharacter 工具一次性添加，再用自然语言简单介绍。
- 之后根据用户反馈迭代：用户说"再加个配角"或"苏鸦设定改一下"，你就新增人物或询问修改方向。
- 注意不要重复生成已存在的人物（参考上文「已创建的人物」列表）。如果用户想改一个已有角色，先用自然语言追问要改什么；本阶段的工具只支持新增，不支持修改（修改字段等后续手动编辑即可）。
- 主角（protagonist）通常 1 位即可，对手（antagonist）0-2 位，其余为配角。总人数控制在 3-6 位为宜，避免人物过多让读者难以记忆。
- 每个角色的核心动机必须明确，这是后续大纲冲突设计的基础。如果用户没说清，主动追问。
- relationships 字段可以等至少有 2 位人物之后再自然填写，描述他们之间的恩怨、立场、利益关系。
- 不要输出 JSON 或字段清单给用户看；用自然语言介绍角色，数据通过工具保存。
- 人物基本齐备（主角明确、1-2 个关键配角或对手、动机清晰）后，可以主动说"人物已经搭建得差不多了，随时可以点下一步进入大纲规划"，但不要催促。
```

### 6.3 大纲阶段 Prompt

**项目上下文段**：

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

核心人物（{characters.length} 位）：
{ characters.length === 0
  ? "（暂无）"
  : characters.map(c => `- ${c.name}（${roleLabel(c.role)}）：${c.identity}。动机：${c.motivation || "（未填写）"}`).join("\n")
}

当前已有章节：
{ chapters.length === 0
  ? "（暂无大纲）"
  : `共 ${chapters.length} 章，标题如下：\n` + chapters.map(c => `- 第${c.number}章 ${c.title}`).join("\n")
}
```

**阶段指令段**：

```
你的任务是基于已有的世界观和人物，生成整部小说的扁平章节大纲。每章只有三个字段：
1. number 章节号（从 1 开始的连续整数）
2. title 章节标题（简短、有吸引力、能暗示本章核心事件）
3. summary 一句话概要（一句话说明本章发生什么、推进了什么剧情或人物关系）

工具使用规则：
- 当用户要求"生成大纲"或给出明确的章节数/长度时，一次性调用 batchCreateChapters，传入完整的章节数组。
- batchCreateChapters 会**覆盖**已有的章节列表（全量替换），所以每次调用都要传完整的新大纲，不要只传新增章节。
- 如果用户已经有大纲，又说"重新生成"或"改成 10 章"，直接调用 batchCreateChapters 覆盖即可，无需用户确认删除。
- 不要分多次一章一章调用工具（没有单章添加工具）。

引导策略：
- 第一轮询问期望长度（短篇 6-8 章 / 中篇 12-15 章 / 长篇 20+ 章），或直接问"要我按合适长度先生成一版吗？"
- 生成时确保：
  - 第 1 章建立世界观与主角日常/初始事件
  - 前 1/3 引入冲突与主要对手
  - 中段有关键转折和人物关系变化
  - 倒数几章推向高潮
  - 最后一章收束主线（开放式结局也可以，但要完整）
- 每个章节概要要具体到发生了什么事件，不要写"剧情进一步发展"这种空话。要让 Stage 3 的章节写作 AI 看了标题+概要就能写出内容。
- 章节标题风格保持一致（要么全 2-4 字短标题，要么全 6-10 字描述性标题，不要混风格）。
- 生成完成后用自然语言简单点评大纲的结构（三幕节奏、关键转折点），告诉用户可以点下一步进入章节写作。
- 如果用户要求局部修改（"第 3 章改成...多一点"），你应该重新生成并调用一次 batchCreateChapters 覆盖全文，因为没有单章更新工具。

不要输出 JSON 或章节清单给用户看（工具调用后右侧面板会展示）；正文用自然语言过渡即可。
```

### 6.4 `addCharacter` 工具定义

```
工具名: addCharacter
描述: 新增一位人物角色到当前小说。当从对话中形成一位角色的基本设定时调用。每次调用添加一位，可多次调用。
参数:
  name:           string  // 姓名，必填
  role:           string  // "protagonist" | "antagonist" | "supporting"，必填
  identity:       string  // 身份/职业，必填（简短）
  motivation:     string  // 核心动机，必填
  personality:    string  // 性格，可填简单关键词
  appearance?:    string  // 外貌，可选
  arc?:           string  // 成长弧光，可选
  relationships?: string  // 与其他角色/势力的关系，可选（纯文本一段）
返回:
  { success: true, character: { id, name, role, ...完整字段 }, totalCount: number }
```

**服务端执行逻辑**：

1. 参数校验（zod）：name / role / identity / motivation 必填
2. 查询当前 project 下 characters 数量作为 `order`
3. INSERT 一条 Character 记录
4. 返回新记录 + 当前总人数（让 LLM 知道已经有多少人）
5. 工具副作用通过 AI SDK 流向前端，触发 `onToolUpdated("addCharacter")`，右栏刷新

### 6.5 `batchCreateChapters` 工具定义

```
工具名: batchCreateChapters
描述: 批量创建/覆盖全书章节大纲。传入完整的章节数组（从第 1 章开始），会覆盖当前已有的所有章节。用于一次性生成整部书的大纲，或在用户要求调整时整体替换。
参数:
  chapters: array of {
    number:  integer // 章节号，从 1 开始连续递增
    title:   string  // 章节标题
    summary: string  // 一句话概要
  }
返回:
  { success: true, count: number, chapters: [...] }
```

**服务端执行逻辑**：

1. 参数校验：chapters 数组非空，number 连续从 1 开始（不连续可以在服务端自动重排，以数组下标为准）
2. 在一个 Prisma `$transaction` 中：
   a. DELETE FROM Chapter WHERE projectId = ?
   b. 批量 INSERT 传入的章节（content 字段为空字符串）
3. 返回新章节列表 + 数量
4. 工具副作用触发 `onToolUpdated("batchCreateChapters")`，右栏整体刷新

### 6.6 模型与参数

沿用 Stage 1：

- Provider / Model / Temperature: 0.8 / 无 max tokens 限制
- 人物阶段：LLM 可能一轮调用 2-3 次 `addCharacter`，需要开启 `maxSteps: 5`（允许一个回合内多次工具调用）
  - Stage 1 只有 `updateWorld` 一个工具，单次即可；Stage 2 要支持"一次对话添加 2-3 个人物"的体验
  - 大纲阶段也是单次 `batchCreateChapters` 即可，但保持 maxSteps 一致为 5
- 其他参数与 Stage 1 相同

> **实施注意**：`streamText({ maxSteps: 5 })` 会让 AI SDK 在工具返回后自动继续驱动 LLM，直到 LLM 不再调工具或达到步数上限。Stage 1 的 `maxSteps` 是默认值（1），这里改成 5，要确认 Stage 1 的世界观流程不受影响（世界观只调一次 updateWorld，然后自然停，5 步是上限不是必跑）。

---

## 七、验收用例（Definition of Done）

### 7.1 人物步骤主流程

**前置**：已有一个完成世界观设定的项目。

1. **进入人物页**
   - 从世界观页点「下一步」，页面跳到 `/p/[id]/characters`
   - 进度条「人物」节点高亮
   - 左栏 ChatPanel 显示人物阶段欢迎语
   - 右栏显示"等待 AI 生成第一位角色"空状态

2. **AI 首轮生成角色**
   - 用户发送："可以，开始吧"
   - AI 流式回复，介绍它构思的角色
   - 对话过程中可见 AI 连续调用 2-3 次 `addCharacter` 工具（流式 UI 上有工具调用状态）
   - 右栏依次出现 2-3 张人物卡片（主角、对手等），每张显示姓名、角色标签、身份、动机
   - AI 用自然语言收尾，询问是否要补充或调整

3. **增量追加角色**
   - 用户发送："再加一个苏鸦身边的女杀手配角"
   - AI 流式回复，调用一次 `addCharacter`
   - 右栏新增一张配角卡片，总数变为 4

4. **持久化验证**
   - 刷新页面
   - 左栏聊天重置为欢迎语（无状态，正确）
   - 右栏 4 张人物卡片**全部还在**（从数据库加载）

5. **跳过大纲**
   - 点「下一步」，PATCH step=OUTLINE 成功，跳到 `/p/[id]/outline`
   - 进度条「大纲」节点高亮

### 7.2 大纲步骤主流程

**前置**：已有完成世界观 + 人物的项目。

1. **进入大纲页**
   - 进度条「大纲」高亮
   - 左栏 ChatPanel 显示大纲阶段欢迎语
   - 右栏显示"等待 AI 生成大纲"空状态

2. **AI 首轮生成大纲**
   - 用户发送："帮我按 10 章生成一版"
   - AI 流式回复，描述它对结构的思考
   - AI 调用一次 `batchCreateChapters` 工具，传入 10 章
   - 右栏顶部显示"故事大纲（共 10 章）"，下方按章节号堆叠 10 个章节块
   - 每个章节块显示"第 N 章 / 标题 / 分隔线 / 概要"
   - AI 收尾点评结构节奏，提示可点下一步

3. **覆盖重生成**
   - 用户发送："太长了，缩短到 6 章，节奏更紧凑一点"
   - AI 再次调用 `batchCreateChapters`，传入 6 章
   - 右栏刷新后显示新的 6 章（旧的 10 章被覆盖，不残留）

4. **持久化验证**
   - 刷新页面
   - 右栏 6 章节**仍然存在**
   - 左栏重置为欢迎语

5. **跳到章节占位**
   - 点「下一步」，PATCH step=CHAPTERS，跳到 `/p/[id]/chapters`
   - 页面显示「章节写作将在 Stage 3 开放」+ 返回链接
   - 进度条「章节」节点高亮

### 7.3 回退/恢复验证（线性流程）

- 回到首页，项目卡片可见
- 点击项目卡片，根据 `currentStep=CHAPTERS`，应自动跳到 `/chapters` 占位页（而不是回到世界观页）
- 通过浏览器后退按钮能回退到大纲页，右栏章节数据仍在
- 整段流程（世界观→人物→大纲→章节占位）可以在 5-8 分钟内走完

### 7.4 非功能验收

- [ ] 控制台无无意义报错
- [ ] 代码通过 `tsc --noEmit` 无类型错误
- [ ] `lib/ai.ts` 中 step → prompt/tool 的分发是一个清晰的 switch/map，未来 Stage 3 加章节步骤只需追加一个分支
- [ ] `ChatPanel` / `StepProgress` / layout 文件在 Stage 2 期间零修改（验证了 Stage 1 的可复用性）
- [ ] Prisma schema 与 architecture.md 一致（Stage 2 不动 schema）
- [ ] 不引入任何新的 npm 依赖
- [ ] Stage 2 结束时，`api/projects/[id]/characters/route.ts`、`api/projects/[id]/chapters/[chapterId]/route.ts` 等手动编辑 API 仍未实现（保持架构精简）

---

## 八、风险与注意事项

| 风险                                                             | 应对策略                                                                                                                                                                |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AI 连续多次调用 `addCharacter` 可能超过默认 maxSteps             | 把 `streamText({ maxSteps })` 提升到 5；监控 tool call 循环，极端情况 LLM 自嗨时由步数上限截断                                                                          |
| 人物生成重复/与已有角色重名                                      | 项目上下文段已列出现有人物；prompt 明确"不要重复生成已存在的人物"                                                                                                       |
| `batchCreateChapters` 覆盖已有章节，Stage 3 之后可能误删 content | 本阶段 Chapter.content 始终为空，覆盖安全；prompt 明说"会覆盖"；Stage 3 实现章节写作时要再评估（可能改用只在 content 全部为空时才允许覆盖，或者提供"重置大纲"二次确认） |
| 大纲章节号不连续/重复                                            | 服务端以数组下标重排 number，不信任 LLM 传入的 number；zod 校验非空                                                                                                     |
| 人物/大纲页面右栏在工具事件和初次加载之间的竞态                  | 沿用 Stage 1 做法：onToolUpdated 触发后统一 refetch，不做增量 append 的乐观更新（mvp 简单可靠）                                                                         |
| 首页卡片跳转到正确步骤的逻辑如果遗漏，用户回不来                 | 实现时显式维护 step → path 的映射表；验收用例覆盖                                                                                                                       |
| 两个新 prompt 过长导致 token 压力                                | 项目上下文段只展示人物的 name/role/identity/motivation 四字段，appearance/arc/relationships 可省略；大纲阶段的 chapters 只展示标题不展示概要                            |

---

## 九、交付物清单

Stage 2 完成后仓库新增/修改：

**新建页面**：

- `src/app/p/[id]/characters/page.tsx`（从占位升级为真实页）
- `src/app/p/[id]/outline/page.tsx`
- `src/app/p/[id]/chapters/page.tsx`（占位）

**新建组件**：

- `src/components/CharacterPanel.tsx`
- `src/components/OutlinePanel.tsx`

**修改文件**：

- `src/lib/ai.ts`：追加人物 prompt 片段、大纲 prompt 片段、`addCharacter` 工具、`batchCreateChapters` 工具；把 step → (prompt, tools) 的分发改成映射表；`maxSteps` 提升到 5
- `src/app/api/chat/[id]/route.ts`：查询 Project 时追加 include characters / chapters；使用 ai.ts 中新的分发映射
- `src/app/page.tsx`（首页）：项目卡片点击跳转按 currentStep 映射到对应路径
- `src/app/p/[id]/worldbuilding/page.tsx`：世界观页「下一步」逻辑保持不变（已经调 PATCH step=CHARACTERS）

**不改动**：

- `prisma/schema.prisma`
- `src/components/ChatPanel.tsx`
- `src/components/StepProgress.tsx`
- `src/app/p/[id]/layout.tsx`
- `src/app/api/projects/[id]/step/route.ts`
- `package.json`（不新增依赖）

Stage 2 完成后，端到端流程的"骨架"（世界观 → 人物 → 大纲 → 章节占位）全部跑通；Stage 3 只需要专注最后一个章节正文生成环节即可收尾。
