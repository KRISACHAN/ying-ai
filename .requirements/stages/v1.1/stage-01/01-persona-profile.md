# AI Companion Core V1.1 - 阶段 1：Persona Profile 实施文档

## 一、阶段目标

在不引入用户系统、鉴权、**Core 侧 Persona 持久化 Provider** 或正式产品 UI 的前提下，扩展 `CompanionPersona`，使 Core 可以稳定表达：

1. 伴侣对用户的显示名与日常称呼；
2. 伴侣自身的兴趣设定；
3. 伴侣自身的外貌设定；
4. 面向未来扩展的附加特征；
5. 将以上设定以可控、可预览、不会产生 Prompt 噪音的方式注入聊天工作流。

本阶段交付的是 **Persona 数据契约 + Prompt 构建升级 + Debug Workbench 配置与验证能力**。

本阶段不改造流式工作流，不接入 Ollama，不增加用户档案系统，也不把 Persona 当作 Memory 写入。

> **边界说明：** Demo 可以继续使用自己的 PostgreSQL 保存 companion 配置；本阶段禁止的是在 `ai-core` 内新增 `PersonaProvider` 的数据库实现或让 Core 直接读写 Demo 表。

---

## 二、前置基线

### 2.1 V1.0 Core 已有能力

V1.0 已有 `CompanionPersona` 与 `PersonaProvider`：

```ts
export interface CompanionPersona {
  id: string;
  name: string;
  gender: CompanionGender;
  relationship?: string;
  personality?: string;
  speakingStyle?: string;
  background?: string;
  systemPrompt?: string;
  metadata?: Record<string, unknown>;
}
```

当前 Persona 由 `PersonaProvider.load()` 提供，并由 `SimpleChatWorkflow` 内的 `buildPersonaSystemPrompt()` 拼入 system prompt。

V1.1 必须在此基础上做**增量扩展**：旧配置、旧 Provider、旧 Demo 配置和旧宿主调用均不得因新增字段失效。

### 2.2 V1.0 Demo 已有半成品（本阶段须迁移）

V1.0 Stage 8 已在 Demo 中部分支持「对用户的称呼」，但**尚未进入 Core 契约**：

```txt
已有
├── debug_companions.user_address（PostgreSQL 列）
├── CompanionForm 字段 userAddress（UI 文案：「她对我的称呼」）
├── customInstructions → 映射为 CompanionPersona.systemPrompt
└── 每条聊天请求从 DB 读取 companion 并重建 runtime

未完成 / 需迁移
├── userAddress 未进入 CompanionPersona，而是通过宿主 workaround 注入 systemPrompt
├── buildHostPersonaSystemPrompt() 把称呼写进 systemPrompt 文本
├── 无 userDisplayName / hobbies / appearance 等扩展字段
├── 无独立的 Persona Prompt Preview（仅有完整 systemPrompt）
└── Prompt 构建逻辑仍内联在 simple-chat-workflow.ts
```

**本阶段必须完成的迁移：**

1. 将 `userAddress`（以及新增 `userDisplayName` 等）正式映射到 `CompanionPersona` 字段；
2. **删除** Demo 侧 `buildHostPersonaSystemPrompt()` 对称呼的注入逻辑，避免与 Core 结构化 Prompt 重复；
3. `customInstructions` 继续只映射到 `CompanionPersona.systemPrompt`，UI 可保留现有文案「自定义指令（仅补充角色设定）」；
4. 扩展 Demo 表结构与表单，但**优先扩展现有 `companion-form.tsx`**，不要平行新建一套重复表单。

---

## 三、阶段完成标准

完成本阶段后，必须满足：

- `CompanionPersona` 支持用户显示名、用户称呼、兴趣与外貌设定；
- 所有新增字段均为 optional，旧 Persona 保持有效；
- 从 `buildPersonaSystemPrompt()` 中抽出纯 Persona 构建函数，并按固定结构渲染；
- 未配置字段不输出「未知」「未设置」「空数组」等文本；
- `systemPrompt` 只能作为结构化 Persona 的补充指令，不能替代或覆盖字段的固定语义；
- Demo 可以编辑扩展 Persona，并使**下一次**聊天请求真实使用最新配置；
- Demo 可以查看 normalize 后的 Effective Persona JSON；
- Demo 可以分别查看 **Persona Prompt Preview** 与 **Final System Prompt**；
- `ChatWorkflowDebugContext` 新增 `personaPrompt`（或等价字段），供 Demo 展示 Persona 段落；
- 同一配置不会在 Prompt 中因 Demo workaround 与 Core Builder 重复注入（尤其 `userAddress`）；
- Persona 配置变更不会自动写入 Memory、Summary、Emotion 或会话历史；
- `packages/ai-core` 仍不读取环境变量、不直接依赖 Demo UI、不依赖数据库或第三方模型 SDK；
- `pnpm` 下相关 package 的 typecheck、lint、build 均通过；
- 至少完成本文件定义的人工验收场景。

---

## 四、目录与职责

建议涉及的目录如下。实际文件名可与当前仓库结构保持一致，但职责边界不得改变。

```txt
packages/ai-core/
  src/
    abstractions/
      persona.ts                              # Persona 类型与 Provider 契约
      workflow.ts                             # ChatWorkflowDebugContext 增加 personaPrompt
    implementations/
      persona/
        default-persona-provider.ts           # 默认 Persona Provider（扩字段透传）
        persona-prompt-builder.ts             # Persona 段落纯函数 + normalize 防御
      workflow/
        simple-chat-workflow.ts               # buildPersonaSystemPrompt 改为组合 personaPrompt + 其他块
    index.ts                                  # 导出 buildPersonaPrompt / normalizePersona（供 Demo 复用）

apps/model-runtime-demo/
  app/
    companion-form.tsx                        # 扩展现有表单（优先于新建平行组件）
    chat-panel.tsx                            # Prompt Debug Panel 增加 Persona Prompt Preview
    lib/
      companion-runtime.ts                    # 移除 buildHostPersonaSystemPrompt 称呼注入
      debug-repository.ts                     # companion 读写 + migration
      debug-types.ts                          # DebugCompanion 扩展字段
  migrations/
    000X_extend_debug_companion_persona.sql   # 新增 persona 扩展列或 JSON 列
```

职责约束：

```txt
ai-core
→ 定义 Persona 数据、加载契约、Persona Prompt 构建与防御性 normalize。

Demo
→ 扩展 companion 编辑、Demo 级 PostgreSQL 持久化、请求装配、结果展示。

宿主
→ 决定 Persona 的来源；当前由 Demo 从 debug_companions 读取并注入 DefaultPersonaProvider。
```

---

## 五、Persona 数据契约

### 5.1 扩展后的推荐结构

```ts
export interface CompanionPersona {
  id: string;
  name: string;
  gender: CompanionGender;

  relationship?: string;
  personality?: string;
  speakingStyle?: string;
  background?: string;
  systemPrompt?: string;

  /** 用户在当前伴侣关系中的显示名，例如：陈大鱼头。 */
  userDisplayName?: string;

  /** 伴侣对用户的建议日常称呼，例如：鱼头、亲爱的、宝贝。 */
  userAddress?: string;

  /** 伴侣自身的兴趣画像。 */
  profile?: {
    hobbies?: string[];
  };

  /** 伴侣自身的外貌画像。 */
  appearance?: {
    heightCm?: number;
    weightKg?: number;
    hair?: string;
    bodyType?: string;
    additionalTraits?: Record<string, string>;
  };

  metadata?: Record<string, unknown>;
}
```

### 5.2 字段语义

```txt
userDisplayName
→ 用户名字或希望被识别的名称。
→ 例如：陈大鱼头。
→ 不等同于未来用户系统的 userId。

userAddress
→ 伴侣建议使用的日常称呼。
→ 例如：鱼头、亲爱的、宝贝、先生。
→ 只影响语气与称呼习惯，不要求每句话都强制出现。
→ V1.0 Demo 已有同名字段；本阶段改为 Core 一等字段，不再通过 systemPrompt 注入。

profile.hobbies
→ 伴侣自己的兴趣。
→ 例如：烘焙、电影、旅行。
→ 必须使用 string[]，不使用以逗号分隔的单个字符串。

appearance.heightCm
→ 数值，单位固定为 cm。

appearance.weightKg
→ 数值，单位固定为 kg。

appearance.hair / bodyType
→ 自然语言短描述。
→ 例如：黑色长直发、匀称。

appearance.additionalTraits
→ 预留扩展字段。
→ 可用于瞳色、穿衣风格、声音、常用饰品、气味等。
→ key 与 value 都必须是非空字符串。
```

### 5.3 Demo 字段与 Core 字段映射

```txt
Demo（DebugCompanion / 表单）          → Core（CompanionPersona）
─────────────────────────────────────────────────────────────
name                                   → name
gender                                 → gender
relationship                           → relationship
personality                            → personality
speakingStyle                          → speakingStyle
background                             → background
customInstructions                     → systemPrompt
userAddress                            → userAddress
userDisplayName（新增）                → userDisplayName
hobbies（新增）                        → profile.hobbies
heightCm / weightKg / hair / bodyType  → appearance.*
additionalTraits（新增）               → appearance.additionalTraits
```

### 5.4 输入约束与职责分工

本阶段不引入复杂的领域校验框架，但必须在 Demo 与 Core 边界完成最小规范化：

**Demo（保存 / 装配时）**

```txt
- 所有 string 字段 trim 后为空时视为未设置；
- hobbies 过滤空字符串、去除首尾空白，并保持用户输入顺序；
- heightCm / weightKg 必须是有限正数；无效值不写入 DB / Persona；
- additionalTraits 忽略空 key 或空 value；
- 不因表单输入错误而让整个聊天请求失败。
```

**Core（Prompt Builder 渲染时，防御性二次过滤）**

```txt
- 对外部 PersonaProvider 返回的数据再次 normalize，忽略非法值；
- 即使 Demo 漏规范化，Builder 也不得输出 undefined / [] / 占位噪音；
- normalize 后的结果用于 buildPersonaPrompt 与 output.persona（Effective Persona）。
```

数值上限不在本阶段写死为产品规则；但 Demo 应给出合理输入控件，避免负数、`NaN` 与无穷大进入请求。

**关于 gender=unknown：** `gender` 是必填 enum 而非 optional 缺失；现有 `formatGender("unknown") → "未指定"` 可保留，不视为「缺失字段占位文案」。

---

## 六、Prompt 构建规范

### 6.1 目标与拆分

Prompt Builder 必须是 `ai-core` 内的纯逻辑：输入为 `CompanionPersona`，输出为稳定、可审查的 **Persona 段落**。

它不能读取环境变量、不能访问数据库、不能修改 Persona、不能写入 Memory。

**与 V1.0 的关键差异：**

```txt
V1.0
└── buildPersonaSystemPrompt(persona, { summary, memory, emotion, tools })
    └── 内联 persona 字段 + systemPrompt + 其他上下文 + 回复要求

V1.1（本阶段）
├── buildPersonaPrompt(persona)              ← 仅 Persona 段落（新建，可导出）
├── buildPersonaSystemPrompt(...)            ← 组合 personaPrompt + summary/memory/emotion/tools/回复要求
└── debugContext.personaPrompt               ← workflow 写入，供 Demo 展示
```

**公开 API 约定：**

- 从 `@ying-companion/ai-core` 导出 `buildPersonaPrompt` 与 `normalizeCompanionPersona`（名称可按项目约定微调）；
- Demo **不得**复制 Prompt 拼接逻辑；Preview 必须调用 Core 导出函数或读取 `debugContext.personaPrompt`。

**相对 V1.0 的可见顺序变化：** `systemPrompt` 从「persona 基础字段之后、Summary/Memory 之前」调整为「结构化 Persona 各分区最后的 [补充指令]」。Summary / Memory / Emotion 仍在 Persona 段落之后拼接，整体行为更符合「结构化字段优先、补充指令兜底」。

### 6.2 固定分区

Persona 段落（`buildPersonaPrompt` 输出）至少按以下顺序组织：

```txt
[伴侣身份]
- 名称
- 性别
- 关系
- 性格
- 说话风格
- 背景

[伴侣画像]
- 兴趣
- 身高 / 体重
- 发型
- 身材
- 其他特征

[用户称呼偏好]
- 用户显示名
- 建议称呼

[补充指令]
- systemPrompt
```

分区规则：

1. 「伴侣自身设定」与「用户信息」必须分开；
2. 缺失字段不生成占位文本；
3. 空数组、空对象不能生成任何行；
4. `systemPrompt` 必须在 Persona 段落末尾追加，明确其是补充指令；
5. 结构化 Persona 是主数据源，`systemPrompt` 不能用于悄悄重定义伴侣姓名、性别或用户称呼；
6. Persona 静态设定只进入 Persona Prompt，不重复复制到 Summary 或 Memory；
7. Prompt Builder 不负责判断内容是否适宜，也不调用 Safety Provider；
8. Prompt Builder 输出必须适合直接展示在 Demo 的 Persona Prompt Preview 中。

### 6.3 建议输出示例

输入：

```json
{
  "id": "default-companion",
  "name": "小雨",
  "gender": "female",
  "relationship": "亲密伴侣",
  "personality": "温柔、好奇、偶尔俏皮",
  "speakingStyle": "自然、简洁、有陪伴感",
  "userDisplayName": "陈大鱼头",
  "userAddress": "鱼头",
  "profile": {
    "hobbies": ["烘焙", "电影"]
  },
  "appearance": {
    "heightCm": 165,
    "hair": "黑色长直发",
    "bodyType": "匀称",
    "additionalTraits": {
      "穿衣风格": "简约温柔"
    }
  },
  "systemPrompt": "避免每句话都使用昵称；称呼应自然。"
}
```

输出示意：

```txt
[伴侣身份]
你叫小雨，性别为女性。你与用户的关系是：亲密伴侣。
你的性格：温柔、好奇、偶尔俏皮。
你的说话风格：自然、简洁、有陪伴感。

[伴侣画像]
你的兴趣：烘焙、电影。
你的身高约为 165 cm。
你的发型：黑色长直发。
你的身材描述：匀称。
其他特征：穿衣风格：简约温柔。

[用户称呼偏好]
用户显示名：陈大鱼头。
你通常可以称呼用户为“鱼头”；请结合语境自然使用，不要求每句话都出现。

[补充指令]
避免每句话都使用昵称；称呼应自然。
```

说明：示例只用于确定语义与分区，不要求逐字一致；实现必须保证输出稳定、可预测、便于后续测试与审查。

---

## 七、Demo 配置与调试要求

### 7.1 Demo 的角色

`apps/model-runtime-demo` 在 V1.1 中继续是 Debug Workbench，而不是正式产品 UI。

本阶段只要求它支持本地调试使用：

```txt
1. 查看当前 Persona；
2. 编辑扩展字段；
3. 保存到 Demo 自己的 PostgreSQL（沿用现有 debug_companions 机制）；
4. 下一次聊天请求从 DB 读取最新 companion 并装配 Persona；
5. 查看 normalize 后的 Effective Persona JSON；
6. 分别查看 Persona Prompt Preview 与 Final System Prompt；
7. 通过真实模型回复验证称呼与设定已生效。
```

### 7.2 表单字段

在现有 `companion-form.tsx` 上扩展，至少支持：

```txt
基础设定
- name
- gender
- relationship
- personality
- speakingStyle
- background
- customInstructions（映射到 CompanionPersona.systemPrompt）

用户称呼
- userDisplayName（新增）
- userAddress（已有，改为走 Core 字段）

伴侣兴趣
- hobbies（可新增 / 删除多个条目）

伴侣外貌
- heightCm
- weightKg
- hair
- bodyType
- additionalTraits（可新增 / 删除键值对）
```

### 7.3 保存范围与数据库迁移

V1.1 **不在 ai-core 内**增加正式的 Persona 持久化 Provider；但 Demo **继续使用** V1.0 已有的 PostgreSQL companion 存储。

本阶段 Demo 侧重：

```txt
- 扩展 debug_companions 表（新增列或 JSON 列存放 profile / appearance / userDisplayName）；
- 扩展 DebugRepository / DebugCompanion / CompanionFormInput 读写；
- 每条 /api/conversations/[id]/messages 请求从 DB 读取最新 companion 并 createConversationRuntime；
- 保存策略属于 Demo，不属于 ai-core；
- 任何保存行为不得写入 Memory；
- 后续接入用户系统或角色卡存储时，不需要修改 ai-core Persona 契约。
```

**不要求**本阶段引入 localStorage 或页面内临时状态作为唯一持久化方案；若仅内存编辑、刷新即丢失，不算本阶段完成。

### 7.4 可观测面板

在现有 Prompt Debug Panel 上扩展，至少提供：

```txt
[Effective Persona]
→ output.persona（normalize 后、实际传入 Prompt Builder 的结构）

[Persona Prompt Preview]
→ debugContext.personaPrompt
→ 或 buildPersonaPrompt(output.persona) 的同等结果

[Final System Prompt]
→ debugContext.systemPrompt（Persona + Summary + Memory + Emotion + 工具说明 + 回复要求）

[Chat Result]
→ 用真实模型回复验证配置是否被自然使用
```

Final System Prompt 在 V1.0 已存在；本阶段重点是补齐 **Persona Prompt Preview** 与 **Effective Persona** 的 normalize 语义。

---

## 八、实施步骤

### 8.1 更新 Core Persona 类型

1. 在 `packages/ai-core` 的 Persona 抽象中增加新字段；
2. 确保所有新增字段为 optional；
3. 更新 `DefaultPersonaProvider`，透传 `userDisplayName` / `userAddress` / `profile` / `appearance`；
4. 检查所有 `PersonaProvider` 实现与 demo 配置，保证 TypeScript 类型通过；
5. 不修改 `PersonaLoadInput`；本阶段不要为了扩展字段引入 session 级 Persona 持久化。

### 8.2 实现 Persona Prompt Builder 升级

1. 新建 `persona-prompt-builder.ts`，实现 `normalizeCompanionPersona()` 与 `buildPersonaPrompt()`；
2. 重构 `buildPersonaSystemPrompt()`：先 `buildPersonaPrompt(normalize(persona))`，再拼接 Summary / Memory / Emotion / 工具 / 回复要求；
3. 在 `ChatWorkflowDebugContext` 增加 `personaPrompt: string`；
4. Workflow 在 prompt 构建完成后写入 `debugContext.personaPrompt`；
5. 从 `index.ts` 导出 `buildPersonaPrompt` 与 normalize 函数，供 Demo 复用；
6. 确保 `systemPrompt` 固定作为 Persona 段落末尾补充。

### 8.3 更新工作流接入点

1. 确认 Workflow 继续通过 `PersonaProvider.load()` 获取 Persona；
2. 确认扩展 Persona 进入最终模型上下文；
3. 确认 Persona 配置不被 Summary、Memory Extract、Emotion State 写入或覆盖；
4. 确认旧 Persona 没有扩展字段时，聊天行为与 V1.0 保持兼容；
5. 确认 `output.persona` 返回 normalize 后的 Effective Persona。

### 8.4 升级 Demo 配置、迁移与预览

1. 添加 `debug_companions` migration，扩展 persona 相关列；
2. 扩展 `companion-form.tsx` 与 repository 读写；
3. 更新 `createConversationRuntime()`：把 companion 字段映射到 `DefaultPersonaProvider`；
4. **删除** `buildHostPersonaSystemPrompt()` 中对 `userAddress` 的注入；`customInstructions` 仍可映射为 `systemPrompt`；
5. 扩展 Prompt Debug Panel：展示 Effective Persona、Persona Prompt Preview、Final System Prompt；
6. 选择至少两组不同 Persona 配置，验证模型回复有可见差异。

### 8.5 文档同步

本阶段完成时同步更新：

```txt
packages/ai-core/README.md
apps/model-runtime-demo/README.md
README.md（如根文档有能力概览）
AGENTS.md（如 AI 执行入口或目录说明已变化）
docs/ 中与 Persona / Prompt 相关的说明
```

只更新与本阶段真实变化相关的内容；不要提前写入尚未实现的 Stream、Ollama 或 Wire 协议细节。

---

## 九、人工验收场景

本项目当前不要求单元测试与 E2E 测试，但本阶段必须完成以下人工验证，并在 `.code-reviews/v1.1/` 对应 review 文档中记录结果。

### 场景 A：旧 Persona 兼容

```txt
给 PersonaProvider 返回 V1.0 结构的 Persona：
仅包含 id / name / gender / personality 等旧字段。

预期：
- typecheck 与构建通过；
- 聊天链路可运行；
- Prompt 中不出现「未设置」「undefined」「[]」；
- 行为与 V1.0 不发生可见退化。
```

### 场景 B：用户称呼生效

```txt
配置：
- userDisplayName：陈大鱼头
- userAddress：鱼头

输入：
「今天工作好累。」

预期：
- Persona Prompt Preview 明确存在用户显示名和建议称呼；
- Final System Prompt 中称呼只出现一次（结构化分区），不因 Demo workaround 重复；
- 模型回复可自然使用「鱼头」或等价称呼；
- 不要求每句话都强制使用昵称；
- 称呼不被写入长期 Memory。
```

### 场景 C：外貌与兴趣生效

```txt
配置：
- hobbies：烘焙、电影
- heightCm：165
- hair：黑色长直发
- bodyType：匀称
- additionalTraits：穿衣风格 = 简约温柔

输入：
「你周末一般喜欢做什么？」

预期：
- Persona Prompt Preview 中展示完整、单位正确的设定；
- 模型能自然提及烘焙、电影或其他已配置的伴侣设定；
- 没有未配置字段的占位文案。
```

### 场景 D：空值与非法值防御

```txt
配置：
- hobbies： ["", "  ", "电影"]
- heightCm：-1 或非数值
- additionalTraits：空 key / 空 value

预期：
- 聊天请求不失败；
- 有效值可保留；
- 无效字段不进入 Effective Persona 与 Persona Prompt Preview；
- 不生成无意义文本。
```

### 场景 E：Persona 修改只影响后续请求

```txt
步骤：
1. 用称呼「鱼头」发起一次聊天；
2. 在 companion 表单改为「亲爱的」并保存；
3. 在同一会话发起下一次聊天。

预期：
- 第二次请求使用最新 Persona（messages route 每次从 DB 重建 runtime）；
- 旧聊天记录不会被重写；
- Memory、Summary、Emotion 不被作为 Persona 配置存储或反向覆盖。
```

### 场景 F：V1.0 userAddress 迁移无重复

```txt
步骤：
1. 使用 V1.0 已有 companion（仅配置了 userAddress，无 userDisplayName）；
2. 发起一次聊天；
3. 检查 Persona Prompt Preview 与 Final System Prompt。

预期：
- userAddress 通过 Core 结构化分区生效；
- Prompt 中不存在「你对用户的固定称呼是…」这类旧宿主注入文案；
- customInstructions 仍作为 [补充指令] 出现，不与 userAddress 混写。
```

---

## 十、非目标与禁止事项

本阶段明确不做：

```txt
- 用户表、用户档案、账号绑定、鉴权；
- ai-core 内的 Persona PostgreSQL 持久化 Provider；
- 多角色市场、角色卡导入导出协议；
- 好感度、剧情、关系数值系统；
- 根据用户历史自动修改伴侣外貌或性格；
- 将 Persona 写入 Memory 或从 Memory 自动回填 Persona；
- 引入 LangChain、LangGraph；
- 修改模型 Provider、流式协议、Tool Planning、NDJSON 网络协议；
- 为本阶段额外引入外部 SDK。
```

禁止事项：

1. 不得把 `userDisplayName` 误当作未来用户系统的稳定身份标识；
2. 不得把 `userAddress` 实现为每句回复的强制前缀；
3. 不得将外貌、兴趣字段拆散到 `metadata`，导致 Prompt Builder 无法稳定理解；
4. 不得让 Demo 表单状态直接污染 Core 内全局单例；
5. 不得通过 Memory 写回实现 Persona 持久化；
6. 不得在 `ai-core` 中读取 `.env`、`localStorage`、浏览器 API 或数据库；
7. 不得保留 `buildHostPersonaSystemPrompt()` 对 `userAddress` 的注入（会与 Core 重复）；
8. 不得在 Demo 内复制 Persona Prompt 拼接逻辑（必须复用 Core 导出或 debugContext）。

---

## 十一、阶段交付物

阶段完成后，仓库至少应包含：

```txt
1. 更新后的 CompanionPersona 类型与 DefaultPersonaProvider；
2. buildPersonaPrompt / normalizeCompanionPersona 与 workflow 接入；
3. ChatWorkflowDebugContext.personaPrompt；
4. Demo migration + companion 表单扩展 + 旧 userAddress 迁移；
5. Persona Prompt Preview 与 Effective Persona 展示；
6. 人工验收记录（含场景 F）；
7. 与实际实现一致的 README / docs 更新；
8. 本阶段 code review 文档。
```

当且仅当上述交付物与人工验收场景均完成后，才进入 V1.1 阶段 2：契约、事件与 Wire 协议。
