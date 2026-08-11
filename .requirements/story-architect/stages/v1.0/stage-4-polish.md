# Stage 4: 体验打磨（重新生成 + 书名 + 章节编辑）

> 所属版本: v1.0 MVP
> 前置文档: [architecture.md](../../architecture.md)、[01-v1.0-plan.md](../../prompts/01-v1.0-plan.md)、[stage-1-framework-worldbuilding.md](stage-1-framework-worldbuilding.md)、[stage-2-characters-outline.md](stage-2-characters-outline.md)、[stage-3-chapters-closure.md](stage-3-chapters-closure.md)

---

## 一、目标与范围

### 1.1 要解决的三个问题

Stage 3 跑通了端到端闭环，但 mvp 体验有三处明显缺陷：

1. **回退到已完成步骤时 AI 会自动重新生成**：每个页面都通过 `kickoffMessage` 在挂载时自动给 AI 发一条"请帮我生成 XX"的消息。用户点顶部进度条回到世界观页想查看或微调时，AI 会立刻重新跑一遍世界观生成，覆盖已保存的内容，体验非常糟糕。用户应该可以随时回退查看，只有**主动点击"重新生成"**才触发重跑，而且重跑要级联清空后续步骤数据、回到线性流程。
2. **没有书名**：`Project.title` 一直是默认值"未命名作品"，没有 AI 生成也没有地方修改。首页项目列表、顶部标题栏都显示"未命名作品"，多写几个作品就分不清。需要 AI 主动生成书名 + 手动可改。
3. **章节正文太短、不可编辑**：实际生成的章节正文普遍只有几百字，远低于 Stage 3 prompt 里写的 1500-2500 字目标；而且 Stage 3 按方案把正文做成只读文本块，用户想改一个字都做不到，只能让 AI 重写整章。需要调 prompt 提高篇幅和写作密度，并开放手动编辑。

### 1.2 本阶段做什么

- **智能 kickoff 改造**：把 ChatPanel 的"挂载即自动 kickoff"改成"只有该步骤内容为空时才自动 kickoff"；已有数据时只显示一条静态欢迎语，不触发 AI。
- **步骤级"重新生成"按钮**：世界观/人物/大纲三个右栏面板底部加"重新生成"按钮；点击后级联清空下游数据、重置 `currentStep`、再回到该步骤触发 kickoff，走标准"下一步"线性流程。
- **章节级"清空本章"按钮**：章节详情视图加"清空本章"按钮，只清当前章节的 content，不影响其他章节。
- **书名生成与编辑**：新增跨步骤工具 `setProjectTitle`；新增 `PATCH /api/projects/[id]/title` API；顶部标题栏右侧的标题改为可点击编辑；AI 在世界观完成后或大纲完成后可主动起名。
- **章节正文调长**：prompt 把篇幅建议从 1500-2500 字提升到 3000-5000 字，增加写作密度/场景数/对话比例/感官描写的硬性要求；prompt 明确"如果输出在剧情中途结束，立即用 appendChapterContent 追加直到达到目标篇幅"。
- **章节正文手动编辑**：扩展 `PATCH /api/projects/[id]/chapters/[chapterId]` 支持 `content` 字段；ChapterPanel 详情视图把只读 div 换成 Textarea，复用 OutlinePanel/CharacterPanel 已有的"draft + dirty + save"模式。

### 1.3 本阶段明确不做

| 不做项                                          | 原因                                                                                         |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Markdown 富文本编辑器（@uiw/react-md-editor）   | 纯 Textarea 足够修改文本，后续版本再上富文本                                                 |
| 重新生成的二次确认弹窗                          | mvp 自由度高，级联清空是预期行为，用户可以通过刷新恢复（其实不能，但下游数据被清是产品意图） |
| 段落级 AI 改写/选中润色                         | Stage 3 已明确不做，Stage 4 仍不做                                                           |
| 章节正文"续写自动继续到目标字数"的 agentic 循环 | 靠 prompt 指导 LLM 自己在一次回复里 save + append 继续写，不做后端驱动的循环                 |
| 书名生成单独成一步                              | 用跨步骤工具让 AI 在合适时机自动起名即可，不增加步骤                                         |
| 多书名候选让用户选                              | AI 直接保存它最推荐的一个，用户不满意可手动改                                                |
| 章节排序、新增、删除                            | 保持大纲一次性生成                                                                           |
| 重新生成后回滚/撤销                             | mvp 不做历史版本                                                                             |

---

## 二、问题现状与设计思路

### 2.1 问题一：回退自动重生成

**根因**：`ChatPanel` 的 `kickoffMessage` 通过 `useEffect` 在挂载时无条件调用 `sendMessage`。三个步骤页（worldbuilding/characters/outline）总是传 kickoffMessage，所以用户每次进入页面（包括回退）都会自动给 AI 发一条指令。

**改造方向**：由**页面**决定是否需要 kickoff，而不是 ChatPanel 自己无脑发。页面判断该步骤的核心数据是否为空（即"首次进入"还是"回退查看"）：

- 首次进入（数据为空）→ 传 `kickoffMessage`，ChatPanel 自动发送，AI 立即开始生成（保持 Stage 1-3 的流畅首次体验）。
- 回退查看（数据非空）→ 不传 `kickoffMessage`，改传一条**静态问候语** `greeting`，ChatPanel 在消息列表为空时把它渲染成一条 assistant 样式的气泡（纯视觉，不发送到 AI）。用户想聊天就正常输入，想重跑就点"重新生成"按钮。

**"重新生成"按钮语义**（放置于右栏面板底部，与"保存修改/下一步"同排）：

| 所在步骤               | 点击行为                                                                                                                                                                      |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 世界观                 | 清空世界观四个字段 + DELETE 所有 characters + DELETE 所有 chapters；PATCH currentStep = WORLDBUILDING；router.refresh() → 页面重新挂载，数据为空 → kickoff 自动触发世界观生成 |
| 人物                   | DELETE 所有 characters + DELETE 所有 chapters；PATCH currentStep = CHARACTERS；router.refresh() → kickoff 自动触发人物生成                                                    |
| 大纲                   | DELETE 所有 chapters（含正文）；PATCH currentStep = OUTLINE；router.refresh() → kickoff 自动触发大纲生成                                                                      |
| 章节（单章"清空本章"） | 仅清空当前章节 content 为 ""（不删章节行）；不重置 currentStep；用户可重新让 AI 生成本章                                                                                      |

"清空"的本质就是让页面回到"数据为空"状态，从而让 kickoff 重新生效；这样"重新生成"不需要新增任何特殊的聊天触发逻辑，只是把"重置数据"这一步做成显式按钮。

**级联清空 API**：新增一个服务端点 `POST /api/projects/[id]/reset-from`，请求体 `{ step: Step }`，服务端根据 step 按上面的级联规则清空下游表和字段，重置 currentStep，返回 `{ success: true }`。章节页的"清空本章"是独立的小操作，直接复用现有的 `PATCH /api/projects/[id]/chapters/[chapterId]`，传 `{ content: "" }` 即可（本阶段扩展该 API 支持 content）。

### 2.2 问题二：书名生成与编辑

**生成方式**：新增跨步骤工具 `setProjectTitle({ title })`，四个步骤都可用。system prompt 中加一段：

> 当你对故事的主题、基调、核心意象有清晰把握时（通常在世界观构建完成、或大纲生成完成时），主动调用 setProjectTitle 给作品起一个贴切、有吸引力、有辨识度的书名（2-8 个字，避免《末世求生》《星际征途》这类泛泛的名字；要能让人一看就想读）。每个项目只起一次，除非用户明确要求改名，否则不要重复调用。

生成时机建议：世界观构建完毕字段填齐后 AI 自然起名一次（此时灵感 + 世界观已经足够起名）；之后大纲生成完如果觉得有更好的可以更新一次，但 prompt 提醒不要反复改。

**编辑方式**：

- 新增 `PATCH /api/projects/[id]/title`（architecture.md 本来就列了），请求体 `{ title: string }`。
- `ProjectHeader` 右侧的标题区域从纯文本改成"点击编辑"的 Input：
  - 默认显示 `title`，hover 出现铅笔图标提示
  - 点击变成 Input，Enter 或失焦时 PATCH 保存并同步到本地状态
  - 空值不允许保存（回退到旧值）
- 首页项目列表已使用 `p.title` 渲染，书名变更后刷新即可显示新名；项目卡片点击跳转逻辑不变。
- 默认值仍是"未命名作品"（项目创建时），AI 起名后或用户手动改后替换。

### 2.3 问题三：章节正文字少、不可编辑

**调长正文**：

- System prompt 篇幅建议从 1500-2500 字改为 **3000-5000 字**。
- 增加"写作密度铁律"（加入到章节阶段指令段）：
  1. **场景密度**：每章至少包含 3-5 个场景转换（地点/时间/视角切换），每个场景都要有独立的环境描写与情节推进，不能一镜到底写完。
  2. **对话占比**：对话（含内心独白）应占正文 40% 以上，用对话推动冲突和揭示人物，不要大段旁白叙述。
  3. **五感描写**：每个关键场景至少调动三种感官（视觉、听觉、触觉、嗅觉、本体感觉），避免只有"他看到"一种描写。
  4. **展示而非讲述**：情绪、性格、关系要通过动作、语气、细节表现，不要写"林野非常愤怒"，要写他攥紧拳头、指节发白、声音压低。
  5. **关键场面要"演出来"**：战斗、对峙、揭秘、情感爆发等剧情高点不能用几句话总结跳过，要逐回合/逐句展开，长度至少 500 字。
  6. **自检出篇幅**：在调用 saveChapterContent 之前，自检字数。如果少于 2500 字，继续往下写，不要急着保存；如果输出被截断（剧情在中途突然中断），立即接着用 appendChapterContent 追加，直到本章达到 3000-5000 字。
- 保留 maxSteps: 5，允许一次回复里 save 后继续 append（模型在工具结果返回后继续写，再 append，再写，直到 5 步或认为写完）。

**正文手动编辑**：

- 扩展 `PATCH /api/projects/[id]/chapters/[chapterId]` 的 schema，支持 `content?: string` 字段 alongside 已有的 `title?/summary?`。
- ChapterPanel 的详情视图改造：
  - 正文从只读 `<div className="whitespace-pre-wrap">` 改为 `<Textarea>` 组件，高度自适应内容（`rows` 根据 content.length 计算，至少 15 行）。
  - 维护 `draft` 状态（与 CharacterPanel/OutlinePanel 一致的模式）：进入详情时用已保存 content 初始化 draft.content，Textarea 改动只更新 draft。
  - 顶部或底部增加"保存修改"按钮：dirty 时高亮，点击 PATCH content；保存成功后同步本地 chapters 状态。
  - 底部增加"清空本章"按钮（文字按钮，危险色）：点击后弹一个 `window.confirm("确认清空本章正文吗？大纲保留，只清空正文。")`（最小确认，不做自定义 Modal），确认后 PATCH `{ content: "" }`。
- 列表视图的卡片"已生成/未生成"状态实时反映 content 是否为空/短/长（现有逻辑已经按 300 字判 partial，保持即可）。
- 详情视图切换回列表时如果有未保存修改，先用 `window.confirm` 提示保存（最小实现，不做复杂状态提升）。

---

## 三、技术架构要点

### 3.1 ChatPanel 改造（核心）

**Props 调整**：

```ts
interface ChatPanelProps {
  projectId: string;
  step: Step;
  /** Auto-sent on mount ONLY if messages are empty AND `greeting` is not set. */
  kickoffMessage?: string;
  /**
   * Static greeting shown as an assistant bubble when there are no messages.
   * DOES NOT trigger an AI call. Used when returning to a completed step.
   */
  greeting?: string;
  body?: Record<string, unknown>;
  onToolUpdated?: (toolName: string) => void;
  onStatusChange?: (status: "idle" | "streaming") => void;
  disabled?: boolean;
  disabledReason?: string;
}
```

**渲染逻辑**：

- 挂载时：若 `kickoffMessage` 存在且 `messages.length === 0` 且无 `greeting`，发送 kickoff（保留首次进入的自动启动体验）。
- 渲染时：若 `messages.length === 0` 且 `greeting` 存在，把 `greeting` 渲染成一条 assistant 风格的静态气泡（不在 useChat 的 messages 数组里，用一个独立的 div 渲染即可，避免污染对话状态）。
- 其他逻辑不变。

**页面如何选择**：

```
// 世界观页伪代码
const worldEmpty = !world.era && !world.geography && !world.socialStructure && !world.powerSystem;
<ChatPanel
  kickoffMessage={worldEmpty ? initialIdea : undefined}
  greeting={worldEmpty ? undefined : "世界观已经完成，可以继续调整某个字段，或者点击右下「重新生成」从头再来。"}
  ...
/>

// 人物页伪代码
const charsEmpty = characters.length === 0;
<ChatPanel
  kickoffMessage={charsEmpty ? "世界观已经构建好，请帮我设计核心人物..." : undefined}
  greeting={charsEmpty ? undefined : "人物已经就位。可以随时补充新角色或调整设定，也可以点「重新生成」重设全部人物（会清空已生成的大纲和章节）。"}
  ...
/>

// 大纲页伪代码
const outlineEmpty = chapters.length === 0;
<ChatPanel
  kickoffMessage={outlineEmpty ? "人物已就位，请帮我生成 10-15 章的大纲..." : undefined}
  greeting={outlineEmpty ? undefined : "大纲已生成。可以让我调整某一章或重新生成，也可以点「下一步」开始写正文。"}
  ...
/>

// 章节页（不改动 kickoff 逻辑，greeting 保持现状：未选章节时禁用输入）
```

这样**页面层的数据状态**决定了用户看到的是"AI 自动开始"还是"安静的查看模式"，ChatPanel 只负责渲染。

### 3.2 级联重置 API

新增 `POST /api/projects/[id]/reset-from`：

- 请求体：`{ step: "WORLDBUILDING" | "CHARACTERS" | "OUTLINE" }`
- 服务端逻辑（单事务）：
  - WORLDBUILDING：UPDATE WorldBuilding SET era='', geography='', socialStructure='', powerSystem='' WHERE projectId=?；DELETE Character WHERE projectId=?；DELETE Chapter WHERE projectId=?；UPDATE Project SET currentStep='WORLDBUILDING' WHERE id=?
  - CHARACTERS：DELETE Character WHERE projectId=?；DELETE Chapter WHERE projectId=?；UPDATE Project SET currentStep='CHARACTERS' WHERE id=?
  - OUTLINE：DELETE Chapter WHERE projectId=?（连带正文）；UPDATE Project SET currentStep='OUTLINE' WHERE id=?
- 返回：`{ success: true }`
- 前端"重新生成"按钮点击：
  1. `fetch(/api/projects/${id}/reset-from, { method: "POST", body: { step } })`
  2. 成功后 `router.refresh()`（让 Server Component 重新取数），页面通过 setState 或直接刷新触发重挂载；数据为空后 kickoffMessage 自动生效

**为什么要重置 currentStep**：用户在世界观页"重新生成"后，如果当前 DB 里 currentStep 还是 CHAPTERS，首页卡片点击还是会跳到章节页；重置后首页会把用户带回世界观页，符合"从头再来"的语义。

### 3.3 书名：工具 + API + UI 三处改动

**工具**（`src/lib/ai.ts`）：

- 新增 `setProjectTitle` 工具：参数 `{ title: string(2-20) }`。
- 工具执行：`UPDATE Project SET title = ?, updatedAt = NOW() WHERE id = ?`；返回 `{ success: true, title }`。
- 加入 `STEP_TOOLS`：四个步骤都可用（`ALL_STEPS: ["setProjectTitle", ...该步原有工具]`，在 `toolDefinitions` 注册，executeTool 里加 case）。
- 通用身份段 prompt 在所有四个阶段都加一段："当故事主题足够清晰时，可以主动调用 setProjectTitle 给作品起名；只起一次，不要频繁改名。" 章节阶段 prompt 不强制要求起名（前面阶段应该已经起好了）。

**API**：

- 新增 `PATCH /api/projects/[id]/title`（`src/app/api/projects/[id]/title/route.ts`）：
  - 请求体：`{ title: string }`
  - 校验：title trim 后长度 1-30
  - 执行：UPDATE Project SET title = ?；返回 `{ success: true, title }`

**UI（ProjectHeader）**：

- 右侧的标题 `<div>` 改为一个受控 Input 的编辑态：
  - 默认状态：`<button className="truncate ...">{title}</button>`，hover 显示"点击重命名" tooltip
  - 点击后变为 `<Input autoFocus value={localTitle} onChange={...} />`
  - Enter 或 blur 触发 save：如果 localTitle.trim() !== title，调用 PATCH title API；成功后更新本地 state；失败则 alert 并回退
  - Esc 取消编辑，回退到旧值
- 编辑过程不影响页面其他部分。
- 保存后页面上的所有使用 title 的地方（header、首页列表）自然会在下次刷新时显示新名；首页列表通过 `router.refresh()` 或重新 fetch 时拿到新值（首页已经在 mount 时 fetch 一次，用户回到首页自然看到最新）。

### 3.4 章节正文扩展

**API 扩展**：

`PATCH /api/projects/[id]/chapters/[chapterId]` 的 `patchSchema` 增加 `content: z.string().optional()`；update data 直接传 content。支持清空（传 `""`）。

**ChapterPanel 详情视图改造**：

- 新增本地 `draft: { [chapterId]: { content?: string } }`（与 OutlinePanel 的 draft 同构）。
- 进入详情视图时，用当前章节的 content 初始化 `draft[selectedId].content`。
- 正文 Textarea：
  - `value={merged.content ?? chapter.content}`
  - `onChange` 更新 draft
  - `rows={Math.max(15, Math.min(40, Math.ceil((merged.content?.length ?? chapter.content.length) / 40)))}`
  - `className="resize-none leading-relaxed"`
- 底部按钮区（在详情视图内，右栏底部 sticky）：
  - 左侧：`<Button variant="destructive" size="sm" onClick={handleClear}>清空本章</Button>`，点击 `confirm()` 后 PATCH `{ content: "" }`，draft 也重置为空
  - 右侧：`<Button variant="outline" onClick={handleSave} disabled={!dirty}>保存修改</Button>`，点击 PATCH content
- 返回列表（←）时，若 dirty 则 `window.confirm("有未保存的修改，确定离开吗？")`，确认才返回，取消就留在详情。

**列表视图**：

- 卡片上"已生成/部分/未生成"的判断沿用现有 300 字阈值；点击卡片行为不变。

**Prompt 调长**：见 §2.3 的写作密度铁律。完整章节阶段指令段在 §六给出。

---

## 四、API 设计（新增/修改）

### 4.1 `POST /api/projects/[id]/reset-from`（新增）

- 请求体：`{ step: "WORLDBUILDING" | "CHARACTERS" | "OUTLINE" }`
- 行为（单 Prisma 事务）：
  | step | 清空 | 重置 currentStep |
  |------|------|------------------|
  | WORLDBUILDING | WorldBuilding 四字段清空；DELETE Character；DELETE Chapter | WORLDBUILDING |
  | CHARACTERS | DELETE Character；DELETE Chapter | CHARACTERS |
  | OUTLINE | DELETE Chapter（连带正文） | OUTLINE |
- 返回：`200 { success: true }`；step 非法返回 400
- 注意：章节步骤不提供 reset-from 入口（单章清空走 PATCH chapters/[id] content="" 即可）

### 4.2 `PATCH /api/projects/[id]/title`（新增）

- 请求体：`{ title: string }`
- 校验：title 非空、trim 后长度 1-30
- 行为：UPDATE Project SET title = trim(title)
- 返回：`200 { success: true, title }`

### 4.3 `PATCH /api/projects/[id]/chapters/[chapterId]`（扩展）

现有 schema 只支持 title/summary，新增：

- 请求体新增字段：`content?: string`
- 其他行为（校验 chapterId 归属、UPDATE）保持不变
- 用于章节手动编辑保存、清空本章

其他前几阶段已有的 API（projects GET/POST、step PATCH、world PATCH、characters PATCH/DELETE、chat POST）不改。

---

## 五、页面与组件设计

### 5.1 ChatPanel 组件改造（见 §3.1）

文件：[src/components/ChatPanel.tsx](../../src/components/ChatPanel.tsx)

- 新增 `greeting?: string` prop
- 消息列表渲染：如果 `messages.length === 0 && greeting`，在容器顶部渲染一条静态 assistant 气泡（和正常 AI 气泡样式一致，只是不参与 useChat 状态）
- kickoff 触发逻辑微调：从"有 kickoffMessage 就发"改为"有 kickoffMessage 且没有 greeting 且消息为空才发"（实际上 greeting 和 kickoffMessage 互斥，页面不同时传）
- error/loading/disabled 等 Stage 3 的能力保持不变

### 5.2 世界观/人物/大纲页改动

三个页面的修改模式高度一致：

1. **判断是否为空状态**：从已加载的数据里判断（world 四字段全空 / characters.length === 0 / chapters.length === 0）。
2. **条件化传 props**：空状态传 `kickoffMessage`，非空状态传 `greeting`。
3. **右栏底部按钮**：原有的"保存修改 / 下一步"两个按钮保留；新增"重新生成"按钮（outline/danger 风格，靠左或靠右视页面而定），点击：
   - 弹窗 `window.confirm("重新生成将清空当前步骤内容及后续所有步骤（人物/大纲/章节），确定继续吗？")`
   - 确认后 POST `/api/projects/[id]/reset-from` body `{ step: <当前 step> }`
   - 成功后 `router.refresh()` + 页面通过 key 重挂载或直接 setState 清空本地数据
4. 世界观页的 kickoffMessage 是 `initialIdea`（现有行为，保持）。
5. 人物页的 kickoffMessage 是现有那段"请帮我设计核心人物..."指令（保持）。
6. 大纲页的 kickoffMessage 是现有那段"请帮我生成 10-15 章大纲..."指令（保持）。

### 5.3 章节页改动（[src/app/p/[id]/chapters/page.tsx](../../src/app/p/[id]/chapters/page.tsx)）

- 不传 kickoffMessage（章节页本来就没有 kickoff；未选章节时禁用输入，已选章节用户自己发"生成本章"——保持现状）
- 不传 greeting（ChatPanel 在 disabled 状态下自己显示 placeholder）
- ChapterPanel 内部承担"清空本章"按钮（见 §5.5）

### 5.4 ProjectHeader 标题编辑（[src/components/ProjectHeader.tsx](../../src/components/ProjectHeader.tsx)）

- 右侧 `<div>{title}</div>` 改为可点击编辑组件（在本文件内直接写，不抽新组件）
- 本地 state：`{ editing: boolean; localTitle: string }`
- 非编辑态：`<button onClick={() => setEditing(true)} className="truncate text-sm text-muted-foreground hover:text-foreground">{title}</button>`
- 编辑态：`<Input autoFocus value={localTitle} onChange={e => setLocalTitle(e.target.value)} onKeyDown={...} onBlur={commitTitle} className="h-7 w-40 text-right text-sm" />`
  - Enter 或 blur → `commitTitle()`：trim 非空且不同则 PATCH title，成功后通过回调或 router.refresh() 同步；失败 alert
  - Esc → 放弃编辑，恢复旧值
- 标题在 ProjectHeader 中由父（layout，Server Component）传入，layout 在每次请求时从 DB 读取，所以保存后 `router.refresh()` 会重新渲染 layout 拿到新标题；编辑过程用本地 state 保证即时响应。

### 5.5 ChapterPanel 改造（[src/components/ChapterPanel.tsx](../../src/components/ChapterPanel.tsx)）

**新增 props**：

```ts
interface ChapterPanelProps {
  chapters: ChapterData[];
  loading?: boolean;
  streaming?: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  // new:
  onChange?: (
    id: string,
    patch: Partial<Pick<ChapterData, "content" | "title" | "summary">>,
  ) => void;
  onSave?: (id: string) => Promise<void>; // parent handles the PATCH + state sync
  onClear?: (id: string) => Promise<void>; // parent handles content="" PATCH
  draft?: Record<string, Partial<ChapterData>>;
  saving?: boolean;
}
```

（为了最小改动，可以让 parent——chapters/page.tsx——像 OutlinePage 那样持有 draft/save 逻辑，ChapterPanel 是纯展示 + 回调。）

**详情视图底部新增按钮区**（sticky 在右栏底部，类似 OutlinePanel 的底部按钮栏）：

```
┌───────────────────────────────┐
│  正文 Textarea                 │
│  ...                           │
│                                │
├────────────────────────────────┤
│ [清空本章]        [保存修改]    │
└────────────────────────────────┘
```

- "清空本章"：`variant="destructive" size="sm"`，点击 confirm → 调用 `onClear(id)`
- "保存修改"：`variant="outline" size="sm"`，dirty 时可点，点击 `onSave(id)`
- "返回列表"按钮保留在顶部

**切换章节保护**：点"返回列表"或点其他章节卡片时，若当前章节有 dirty draft，`window.confirm("有未保存的修改，确定离开吗？")` 拦截。

### 5.6 首页（[src/app/page.tsx](../../src/app/page.tsx)）

不改。`p.title` 已经是卡片渲染字段，title 变更后下一次进入首页自然看到新名。首页在 mount 时 fetch 一次；若用户从项目页返回首页可以看到更新后的值（浏览器会重新执行 mount effect）。

---

## 六、AI Prompt 与工具设计

### 6.1 新增跨步骤工具 `setProjectTitle`

```
工具名: setProjectTitle
描述: 为当前小说设置书名。当你对故事的主题和基调有清晰把握时（通常在世界观完成或大纲完成时）调用一次起一个贴切的书名。不要频繁调用（整个项目 1-2 次即可），除非用户明确要求改名。
参数:
  title: string  // 书名，2-10 个字，要有辨识度、有吸引力，避免过于泛化的名字
返回:
  { success: true, title }
```

**服务端执行逻辑**：

1. 参数校验：title 是字符串，trim 后长度 2-20
2. `UPDATE Project SET title = $1, updatedAt = NOW() WHERE id = $2`
3. 返回新 title
4. 触发前端 onToolUpdated → 各页面在收到该工具事件时可以 refetch 项目（或直接依赖 router 刷新）；Stage 4 最小实现是：ProjectHeader 在工具事件后不做特殊处理，因为 title 在下次路由刷新时自动从 DB 拿；ChatPanel 的 onToolUpdated 回调只做 refetch 当前 step 的数据，title 变更靠"下一次页面加载"显示（mvp 可接受；如果 AI 起名后想立即反馈，可以在 onToolUpdated 里检测 "setProjectTitle" 事件并 window.location.reload() 刷新，体验更直接）。

### 6.2 通用身份段更新

所有四个阶段的通用身份段追加一段：

```
【书名】
- 当你对故事的主题、基调、核心意象有清晰把握时（世界观构建完成或大纲完成时最合适），主动调用 setProjectTitle 给作品起一个贴切、有吸引力、有辨识度的书名（2-8 个字）。
- 避免《末世求生》《星际征途》《都市奇遇》这类泛化的名字；要让人一看就想读、能体现这本书的独特气质。
- 每个项目只主动调用 1-2 次（可以在世界观后起一次，如果大纲出来发现更贴切的再改一次）；用户明确要求改名时再调用，不要反复改。
```

### 6.3 章节阶段指令段更新

替换 Stage 3 章节阶段指令段里的篇幅和质量部分：

```
正文篇幅要求：
- 每章正文 3000-5000 字（中文），这是硬性目标，不要写几百字就结束。
- 如果你的输出在剧情中途被截断（看起来突然中断、句子没写完、剧情没到停顿点），立即继续用 appendChapterContent 追加，直到本章达到目标篇幅。在同一条回复里你可以 save 之后继续 append，再继续 append，直到写完。

写作质量铁律（自检后再调保存工具）：
1. 场景密度：每章至少 3-5 个场景转换，每个场景都要有独立的环境描写 + 人物动作 + 情节推进，不能一镜到底。
2. 对话占比：对话（含简短内心独白）至少占正文 40%，用对话推动冲突、揭示人物、埋下伏笔。避免连续 3 句以上的纯旁白叙述。
3. 五感描写：每个关键场景至少调动三种感官（视觉、听觉、触觉、嗅觉、本体感觉），让场景有质感。
4. 展示而非讲述：情绪/性格/关系通过动作、语气、细节表现。写"他攥紧拳头、指节发白、声音压低了半度"而不是"他非常愤怒"。
5. 关键场面要展开：战斗、对峙、揭秘、情感高潮不能几句话总结跳过，要逐回合/逐句展开，高点场景长度不少于 500 字。
6. 开头钩子，结尾悬念：章节开头用动作/对话/异常事件切入，不要以"这天天气很好"之类的环境白描开头；结尾留悬念（新线索、突发变故、未解之谜），让读者想立刻翻下一章。
7. 严格遵循世界观/人物动机/大纲概要，不要引入与已设定冲突的元素。
```

其余章节阶段的 prompt 规则（工具使用规则、引导策略、不调工具空提醒等）保持 Stage 3 文案不变。

### 6.4 模型与参数

沿用 Stage 3：temperature 0.8，maxSteps: 5（允许 save + 多次 append 循环），不限制 max tokens。章节长文生成时 3000-5000 字可能接近部分模型单次输出上限，但有了 append 续接机制，模型可以在工具结果返回后继续写下一段，maxSteps: 5 足够覆盖 2-3 次追加。

---

## 七、验收用例（Definition of Done）

### 7.1 回退不自动重新生成

**前置**：完成世界观 → 人物 → 大纲 → 章节，已生成第一章正文。

1. 点顶部进度条"① 世界观"，路由跳到 `/worldbuilding`
2. 右栏四个字段全部保留（没有被覆盖）
3. 左栏 AI **没有**自动重新生成；显示静态问候语"世界观已经完成，可以继续调整..."
4. 手动在左栏发送"把社会结构改得更压抑一点"，AI 流式回复并 updateWorld，右栏字段更新
5. 点"② 人物"、"③ 大纲"，同样：数据保留、AI 不自动重跑、显示问候语

### 7.2 重新生成按钮 + 级联清空

1. 在世界观页点击右下"重新生成"，点确认
2. 调用 reset-from API 成功，右栏四字段被清空，人物/章节全部清空
3. AI 自动 kickoff（因为数据为空），重新开始世界观引导
4. 点顶部进度条跳到人物/大纲/章节页，右栏都是空状态（级联生效）
5. 在人物页点"重新生成"，确认：人物清空、章节清空，世界观保留，currentStep = CHARACTERS
6. 在大纲页点"重新生成"，确认：章节清空（含已写正文），世界观/人物保留，currentStep = OUTLINE

### 7.3 书名生成与编辑

1. 走一遍新流程到世界观完成，AI 在对话收尾阶段调用 `setProjectTitle` 保存书名（如《黄浦江的浮尸》或更贴切的）
2. 顶部标题栏右侧书名由"未命名作品"变为新书名（工具事件触发刷新或下次路由切换时显示）
3. 点击书名，变为 Input，输入新名按 Enter
4. PATCH 成功后 Input 消失，显示新名
5. 回到首页，项目卡片显示新书名
6. 再进项目继续走流程，大纲生成完 AI 可以再次更新书名（如改成更贴大纲的），标题栏同步更新

### 7.4 章节正文调长 + 可编辑

1. 在新流程下选第一章，发送"生成本章初稿"
2. AI 流式输出正文，最终通过 saveChapterContent 保存（可能 save 后 append 一次或多次）
3. 右栏详情视图正文字数达到 3000+ 字（验收时手动数一下；如果模型只生成 2000+ 也算通过，prompt 引导下会明显长于 Stage 3）
4. 正文明显多场景、多对话、有五感描写（人工读一遍确认）
5. 在详情视图直接修改 Textarea 里的一段文字（比如改主角名字、加一句对话）
6. 点击"保存修改"，PATCH 成功，按钮变灰
7. 刷新页面，手动修改的内容仍然存在
8. 点击"清空本章"，确认后正文变为空，卡片状态变为"未生成"
9. 点"返回列表"时有未保存修改会弹 confirm 拦截

### 7.5 端到端完整流程

从首页开始：

1. 输入灵感创建项目
2. 世界观页：AI 自动 kickoff → 四字段填满 → AI 起名
3. 点"下一步" → 人物页：AI 自动 kickoff → 生成 3-4 个人物
4. 点"下一步" → 大纲页：AI 自动 kickoff → 生成 10+ 章大纲
5. 点"下一步" → 章节页：选第 1 章 → 发送"生成本章"→ AI 生成 3000+ 字正文 → 保存
6. 手动微调第 1 章正文并保存
7. 选第 2 章，生成正文
8. 回到顶部点"① 世界观" → 查看数据、不自动重生成
9. 点"重新生成"→ 清空所有下游 → 重新走一遍，能再次完成

### 7.6 非功能验收

- [ ] `tsc --noEmit` 通过
- [ ] `next build` 通过
- [ ] 不新增 npm 依赖（仍然不装 @uiw/react-md-editor）
- [ ] ChatPanel 改造后，Stage 1/2/3 的首次进入自动 kickoff 体验保持不变（用户首次到某步时 AI 立即开始生成）
- [ ] 所有 4 步的"数据为空 → kickoff"路径都已验证

---

## 八、风险与注意事项

| 风险                                                                      | 应对策略                                                                                                                                                                                                              |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 模型仍然生成短章节（prompt 控制有限）                                     | prompt 中加入"自检字数不足 2500 字不要调 save"的硬指令 + maxSteps 允许 save 后 append 继续；验收接受 ≥2500 字即可，不追求绝对达标                                                                                     |
| 模型 save 后不再 append（把 save 当作终止信号）                           | prompt 明确"如果被截断，在 save 之后继续用 append 追加"；工具描述里也暗示这是正常用法                                                                                                                                 |
| 书名工具被 LLM 滥用（每轮都改名）                                         | prompt 限制"每个项目主动调用 1-2 次"；工具本身不做频率限制，依靠 LLM 自觉                                                                                                                                             |
| 手动编辑 Textarea 和 AI 流式保存同时发生（用户改了一半，AI 保存了新版本） | 详情视图里 AI save/append 触发的 refetch 会用服务器新值覆盖本地 draft 吗？需要实现：refetch 时如果本地有 dirty draft，不覆盖 draft，只更新"已保存"基线；用户点保存时用 draft 覆盖服务器。与 OutlinePanel 现有模式一致 |
| reset-from 事务中途失败                                                   | 用 Prisma `$transaction` 包裹所有 DELETE/UPDATE，原子性保证                                                                                                                                                           |
| 回退后又点"下一步"推进，但 currentStep 被重置了导致 router.push 路径问题  | reset-from 已重置 currentStep，下一步按钮的 handleNext 逻辑沿用现有 PATCH step + router.push，无额外复杂度                                                                                                            |
| 静态 greeting 和真实 AI 消息视觉混淆                                      | greeting 气泡样式与 AI 消息一致，但不在 messages 数组里；用户一发消息它就被新消息覆盖或向上推移，体验自然，不需要"greeting"特殊徽标                                                                                   |
| 章节详情的 Textarea 高度在长正文下撑爆右栏                                | Textarea 外层容器限制 max-height + overflow-y-auto，或者让整个右栏滚动（Stage 3 已经是整个右栏 overflow-y-auto）                                                                                                      |

---

## 九、交付物清单

Stage 4 完成后仓库新增/修改：

**新建 API**：

- `src/app/api/projects/[id]/reset-from/route.ts`（POST 级联清空）
- `src/app/api/projects/[id]/title/route.ts`（PATCH 修改书名）

**修改文件**：

- `src/lib/ai.ts`：
  - 新增 `setProjectTitle` 工具（def + execute case）
  - `STEP_TOOLS` 四个步骤都加上 `"setProjectTitle"`
  - 四个阶段的通用身份段追加书名规则
  - 章节阶段指令段替换为 §6.3 的"3000-5000 字 + 写作密度铁律"版本
- `src/app/api/chat/[id]/route.ts`：章节 prompt 构造部分使用新指令段；其他不变
- `src/app/api/projects/[id]/chapters/[chapterId]/route.ts`：patchSchema 增加 `content?: string`
- `src/components/ChatPanel.tsx`：新增 `greeting` prop；挂载时按 kickoff/greeting 条件渲染
- `src/components/ProjectHeader.tsx`：右侧标题改为可点击编辑组件（Input 切换 + PATCH title）
- `src/components/ChapterPanel.tsx`：详情视图正文从只读 div 改为 Textarea；新增 draft/onChange/onSave/onClear 相关 props 和底部按钮栏；切换章节 dirty 拦截
- `src/app/p/[id]/worldbuilding/page.tsx`：判断 world 是否为空，条件化传 kickoffMessage/greeting；右栏底部加"重新生成"按钮
- `src/app/p/[id]/characters/page.tsx`：判断 characters 是否为空，条件化传 kickoffMessage/greeting；右栏底部加"重新生成"按钮
- `src/app/p/[id]/outline/page.tsx`：判断 chapters 是否为空，条件化传 kickoffMessage/greeting；右栏底部加"重新生成"按钮
- `src/app/p/[id]/chapters/page.tsx`：持有章节 draft 状态；新增 saveChapter / clearChapter 回调传给 ChapterPanel（调 PATCH chapter API）

**不改动**：

- `prisma/schema.prisma`（title/content 字段都已存在）
- 首页 `src/app/page.tsx`（依赖 title 字段渲染，自动生效）
- 项目通用布局 `src/app/p/[id]/layout.tsx`（title 作为 prop 传入，本身不改）
- 数据库已有的所有字段
- `package.json`（不新增依赖）

Stage 4 完成后，v1.0 MVP 的 mvp 体验从"能跑通"升级到"能用得舒服"：用户可以自由回退查看、主动触发重生成、看到有辨识度的书名、读到篇幅合理的章节正文、手动润色 AI 初稿。
