---
name: code-review
description: "[OMX] Comprehensive code review: OMX dual-lane (code-reviewer + architect), ying-companion project standards and AI editor rules, scope from user commit/paths else staged else unstaged; write numbered Chinese reports to .code-reviews/{n}-{slug}/ with tool-attributed filenames. Use for code review, PR review, or quality assessment."
---

# Code Review

OMX 双车道审查 + 本项目规范 + AI 编辑器规则。报告**全文中文**，写入 `.code-reviews/`。

## 何时使用

- 用户请求 code review / 审查代码
- PR 合并前、重大功能完成后
- 用户指定 commit、路径，或未指定时审查暂存/未暂存变更

**不包含**：对已有 review 报告的修复跟进或交叉复核 → 使用 **`code-review-followup`** skill。

## 工作流总览

1. **确定 scope**（优先级见下）
2. **加载规范**（项目 + 编辑器规则）
3. **并行双车道审查**（`code-reviewer` + `architect`）
4. **按 OMX 规则合成结论**
5. **写入中文报告**到 `.code-reviews/{n}-{slug}/`

---

## 1. 确定审查范围（优先级）

按顺序取**第一个**匹配项，确定后不再降级。

| 优先级 | 条件 | Git 命令 | 文件夹 `{slug}` 示例 |
| ------ | ---- | -------- | -------------------- |
| 1a | 用户指定 commit / 短 SHA / HEAD（最新 commit） | `git show <commit>` / `git rev-parse HEAD` | `63288da`（完整 SHA 前 7 位）→ 文件夹 `0-63288da` |
| 1b | 用户指定路径/目录 | `git diff [--cached] -- <paths>` | `packages-ai-core` → 文件夹 `2-packages-ai-core` |
| 2 | 暂存区有变更 | `git diff --cached --stat` → 非空则 `git diff --cached --no-color` | `staged` → 文件夹 `2-staged` |
| 3 | 工作区有未暂存变更 | `git diff --stat` → 非空则 `git diff --no-color` | `unstaged` → 文件夹 `2-unstaged` |

三者皆空 → 告知用户无可审查内容并停止。

---

## 2. 加载规范（审查前必读）

有项目规则时**不得**仅用通用 best practice。将已读文件记入报告 **依据规范**。

### 始终加载

| 文件 | 用途 |
| ---- | ---- |
| [AGENTS.md](../../../AGENTS.md) | 项目入口 |
| [docs/ai/core/principles.md](../../../docs/ai/core/principles.md) | 操作原则 |
| [docs/ai/core/working-agreements.md](../../../docs/ai/core/working-agreements.md) | diff 规模、模式、验证 |
| [docs/ai/core/verification.md](../../../docs/ai/core/verification.md) | 验证循环 |
| [docs/ai/core/project-context.md](../../../docs/ai/core/project-context.md) | monorepo 布局与命令 |
| [.cursor/rules/00-ai-guide.mdc](../../../.cursor/rules/00-ai-guide.mdc) | Cursor AI 规则入口 |
| [eslint.config.mjs](../../../eslint.config.mjs) | Lint（如 `consistent-type-imports`, `no-explicit-any`） |
| [prettier.config.mjs](../../../prettier.config.mjs) | 格式化 |

### 按 scope 追加

| 条件 | 追加读取 |
| ---- | -------- |
| `apps/**` | [.cursor/rules/10-project-context.mdc](../../../.cursor/rules/10-project-context.mdc) |
| `apps/web/**` | [apps/web/AGENTS.md](../../../apps/web/AGENTS.md) |
| `apps/api/**` | [apps/api/AGENTS.md](../../../apps/api/AGENTS.md) |
| `packages/**` | 包内约定；架构相关则读 `docs/requirements/` |
| 审查 commit / message | [docs/ai/core/git-protocol.md](../../../docs/ai/core/git-protocol.md), [commitlint.config.mjs](../../../commitlint.config.mjs) |

双车道 prompt 中须注入：**已加载规范摘要** + **scope 的 git diff**。

---

## 3. OMX 双车道审查

**禁止**用当前 lane 替代缺失的另一 lane。任一路不可用 → 报告「独立审查不可用」，**不得**标记为可合并。

### code-reviewer lane

负责：规范合规、安全、代码质量、性能、可维护性。

**检查维度**

- **Security** — 硬编码密钥、注入、XSS、CSRF、鉴权
- **Code Quality** — 复杂度、重复、命名、函数规模
- **Performance** — N+1、缓存、算法效率、多余重渲染
- **Best Practices** — 错误处理、日志、文档、测试
- **项目规范** — 上文已加载的 AGENTS.md、docs/ai/core、eslint/prettier；违规须标注 `[规范: path]`

**严重级别**：CRITICAL / HIGH / MEDIUM / LOW → 报告对应 严重/高/中/低

**输出**：审查文件数、各级问题（含 file:line）、修复建议、lane 建议（APPROVE / REQUEST CHANGES / COMMENT）

### architect lane

负责：架构/设计 tradeoff、魔鬼代言人视角。

**检查维度**

- 系统边界与接口
- 隐藏耦合与长期维护风险
- 主 reviewer 可能遗漏的 tradeoff
- 反对「按现状批准」的最强论据

**架构状态**（必选其一）：

| 状态 | 含义 |
| ---- | ---- |
| **CLEAR** | 无未解决架构阻塞 |
| **WATCH** | 非阻塞设计顾虑，须写入最终合成 |
| **BLOCK** | 未解决设计问题，不可 merge-ready |

**输出**：Architectural Status、file:line 证据、设计建议

### 并行委派

```
delegate(
  role="code-reviewer",
  tier="THOROUGH",
  prompt="CODE REVIEW TASK

审查质量、安全、可维护性及**本项目规范**（见下方规范列表）。
此为 code/spec/security lane，不承担架构所有权。

Scope: [git diff 或指定文件]
已加载规范: [列表]

Checklist: OWASP、代码质量、性能、最佳实践、项目 ESLint/AGENTS.md/docs/ai/core 合规

Output: 文件数、CRITICAL/HIGH/MEDIUM/LOW、file:line、修复建议、APPROVE/REQUEST CHANGES/COMMENT"
)

delegate(
  role="architect",
  tier="THOROUGH",
  prompt="ARCHITECTURE REVIEW TASK

同一 scope 的架构/tradeoff 审查。

Scope: [git diff 或指定文件]
已加载规范: [列表]

Focus: 边界、耦合、长期风险、反对批准的理由

Output: CLEAR/WATCH/BLOCK、file:line、设计建议"
)
```

两 lane **并行**执行，再合成。

### 外部模型交叉验证（可选）

1. 先独立完成本 lane 审查
2. 可用时 consult Codex 交叉验证
3. 批判性采纳，不盲目引用
4. 外部 consult 不可用**不阻塞**；但不可替代必需的双 lane

---

## 4. 合成规则（OMX）

| 条件 | 最终结论（中文） |
| ---- | ---------------- |
| architect = **BLOCK** | **需修改** |
| code-reviewer = **REQUEST CHANGES** | **需修改** |
| architect = **WATCH** | **建议** |
| 其余 | 跟随 code-reviewer → **批准** / **建议** |

映射：APPROVE → 批准；COMMENT → 建议；REQUEST CHANGES → 需修改

任一路 delegation 失败/跳过 → **需修改**（独立审查不可用），不得批准。

---

## 5. 输出

### 语言

报告**全文中文**（标题、摘要、问题、检查项、备注）。路径、SHA、代码标识符保持原文。

### 目录结构

```
.code-reviews/
  {n}-{slug}/
    {tool}-review.md       # 初次审查
```

- 根目录：`.code-reviews/`（不存在则创建）
- 每个审查 scope 对应**一个子文件夹**；同一 scope 下不同 AI 工具各写独立文件，不覆盖彼此

### 文件夹命名 `{n}-{slug}`

| 部分 | 规则 |
| ---- | ---- |
| `{n}` | 扫描 `.code-reviews/` 下匹配 `^\d+-` 的文件夹，取 max+1；目录为空则从 `0` 开始 |
| `{slug}` | 见下表 |

| scope 类型 | `{slug}` 规则 | 示例 |
| ---------- | ------------- | ---- |
| 用户指定 commit、短 SHA、或 **HEAD / 最新 commit** | 完整 SHA 的**前 7 位小写** | `0-63288da`、`1-ca46e25` |
| 已暂存 / 未暂存 / 路径范围（无 commit 上下文） | kebab-case 范围提示（≤40 字符） | `staged`、`packages-ai-core` |

**commit 类 scope 必须**使用 `{n}-{7-char-sha}` 格式，与用户已归档的 `.code-reviews/0-63288da`、`.code-reviews/1-ca46e25` 保持一致。

确定 slug 时：若 scope 对应某个 commit，先 `git rev-parse` 得到完整 SHA，再取前 7 位。

### 文件名 `{tool}-review.md`

| 部分 | 规则 |
| ---- | ---- |
| `{tool}` | 执行审查的 AI 工具标识，**小写 kebab-case** |
| 后缀 | `-review.md` |

常见 `{tool}` 取值：

| 工具 | `{tool}` | 显示名（写入报告） |
| ---- | -------- | ------------------ |
| Cursor | `cursor` | Cursor |
| Codex / OMX | `codex` | Codex |
| Claude Code | `claude` | Claude Code |
| Antigravity | `antigravity` | Antigravity |
| 其他 | 按平台名 kebab-case | 可读显示名 |

**不论哪个 AI 工具**，都必须在文件名与报告正文中**双重标注来源**（见模板「审查工具」字段）。若当前环境可知模型名称，**必须**写入「模型」字段。

### 报告模板（`{tool}-review.md`）

参考：`.code-reviews/0-63288da/cursor-review.md`、`.code-reviews/1-ca46e25/cursor-review.md`。

```markdown
# 代码审查 — {范围简述}

**日期：** {YYYY-MM-DD}
**审查工具：** {Cursor | Codex | Claude Code | …}
**模型：** {当前模型名称；不可知则省略此行}
**审查范围：** {用户指定 commit / 已暂存 / 未暂存 / 路径}
**引用：** {commit SHA、路径、git 命令}
**结论：** {批准 | 建议 | 需修改}

## 依据规范

{实际读取的规范与规则文件列表；可用 markdown 链接或反引号路径}

## 摘要

{2–4 句；变更是否符合项目规范；双车道概览}

## 审查统计

- 审查文件数：{n}
- 问题总数：{n}（严重 {n} / 高 {n} / 中 {n} / 低 {n}）
- code-reviewer 建议：{APPROVE | REQUEST CHANGES | COMMENT}
- 架构状态：{CLEAR | WATCH | BLOCK}

## 问题清单

### 严重

无。（或列出）

- [`{file}:{line}`] [规范: {path}] {问题描述}

  **修复建议：** {具体建议；复杂修复可附代码块}

### 高

- ...

### 中

- ...

### 低

- ...

（无则写「无」。项目规范类须带 `[规范: …]` 或 `[规则: …]`。高级别问题可含**复现路径**、**当前影响**、**修复建议**分段。）

## 架构关注项

{architect lane 的 WATCH/BLOCK 项；CLEAR 时写「无阻塞架构问题」}

- [`{file}:{line}`] **{WATCH|BLOCK}** — {顾虑与建议}

## 合成说明

- code-reviewer：{建议}
- 架构状态：{CLEAR/WATCH/BLOCK}
- 最终结论：**{批准|建议|需修改}**（依据 OMX 合成规则）

## 检查项

### 安全

- [ ] 无硬编码密钥；输入校验；注入/XSS/CSRF；鉴权

### 代码质量

- [ ] 复杂度与重复；命名；DRY

### 性能

- [ ] N+1；缓存；算法；多余重渲染

### 项目规范

- [ ] docs/ai/core/ 原则与工作约定
- [ ] .cursor/rules/ 与相关 AGENTS.md
- [ ] ESLint / Prettier / TypeScript

### 架构

- [ ] 边界与接口明确；耦合风险已评估；状态为 CLEAR/WATCH/BLOCK

### 验证

- [ ] 测试与验证说明（verification.md）；已执行的命令与结果

## 备注

{未审查范围、建议验证命令、独立 lane 是否可用}
```

### 聊天回复

写入文件后简短回复：结论、主要发现、报告路径（如 `.code-reviews/2-ca46e25/cursor-review.md`）。

---

## 与其他 OMX Skill 联用

```
/team "review recent auth changes"
/ralph code-review then fix all issues   # Ralph 路径可自动修复；纯 code-review 只读
/ultrawork review all files in src/
```

**修复跟进 / 交叉复核**（对已有 `{tool}-review.md` 验证修复、采纳/驳回结论）不属于本 skill，请使用独立 skill **`code-review-followup`**（`.codex/skills/code-review-followup/`）。该 skill 负责写入 `{model}-followup.md`，其中 `{model}` 是本次实际回复的模型标识。

## 最佳实践

- 早审、小步审；优先 CRITICAL/HIGH
- 结合上下文——部分「问题」可能是 intentional tradeoff
- 有 WATCH 项时在 merge 前处理或明确记录
