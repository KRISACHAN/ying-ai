---
name: code-review
description: "[OMX] Comprehensive code review: OMX dual-lane (code-reviewer + architect), ying-companion project standards and AI editor rules, scope from user commit/paths else staged else unstaged; write numbered Chinese reports to .code-reviews/{n}-{slug}/ with tool-attributed filenames. Use for code review, PR review, or quality assessment."
---

# Code Review

OMX dual-lane review + project standards + AI editor rules. Skill instructions are in English; **report output is Chinese** and saved under `.code-reviews/`.

## When to Use

- User requests a code review
- Before merging a PR or after completing a major feature
- User specifies a commit, paths, or leaves scope unset (staged/unstaged changes)

**Out of scope:** follow-up on an existing review report or cross-validation → use the **`code-review-followup`** skill.

## Workflow Overview

1. **Determine scope** (priority rules below)
2. **Load standards** (project + editor rules)
3. **Run dual-lane review in parallel** (`code-reviewer` + `architect`)
4. **Synthesize verdict** per OMX rules
5. **Write Chinese report** to `.code-reviews/{n}-{slug}/`

---

## 1. Determine Review Scope (Priority)

Take the **first** matching item in order; do not fall back once matched.

| Priority | Condition | Git command | Folder `{slug}` example |
| -------- | --------- | ----------- | ----------------------- |
| 1a | User-specified commit / short SHA / HEAD (latest commit) | `git show <commit>` / `git rev-parse HEAD` | `63288da` (first 7 chars of full SHA) → folder `0-63288da` |
| 1b | User-specified path(s)/directory | `git diff [--cached] -- <paths>` | `packages-ai-core` → folder `2-packages-ai-core` |
| 2 | Staged changes exist | `git diff --cached --stat` → if non-empty, `git diff --cached --no-color` | `staged` → folder `2-staged` |
| 3 | Unstaged working-tree changes | `git diff --stat` → if non-empty, `git diff --no-color` | `unstaged` → folder `2-unstaged` |

If all three are empty → tell the user there is nothing to review and stop.

---

## 2. Load Standards (Required Before Review)

When project rules exist, **do not** rely on generic best practices alone. Record loaded files under **Standards Referenced** in the report.

### Always Load

| File | Purpose |
| ---- | ------- |
| [AGENTS.md](../../../AGENTS.md) | Project entry point |
| [docs/ai/core/principles.md](../../../docs/ai/core/principles.md) | Operating principles |
| [docs/ai/core/working-agreements.md](../../../docs/ai/core/working-agreements.md) | Diff size, patterns, verification |
| [docs/ai/core/verification.md](../../../docs/ai/core/verification.md) | Verification loop |
| [docs/ai/core/project-context.md](../../../docs/ai/core/project-context.md) | Monorepo layout and commands |
| [.cursor/rules/ai-guide.mdc](../../../.cursor/rules/ai-guide.mdc) | Cursor AI rules entry |
| [eslint.config.mjs](../../../eslint.config.mjs) | Lint (`consistent-type-imports`, `no-explicit-any`, etc.) |
| [prettier.config.mjs](../../../prettier.config.mjs) | Formatting |

### Load by Scope

| Condition | Also read |
| --------- | --------- |
| `apps/**` | [.cursor/rules/project-context.mdc](../../../.cursor/rules/project-context.mdc) |
| `apps/web/**` | [apps/web/README.md](../../../apps/web/README.md) |
| `apps/api/**` | [apps/api/README.md](../../../apps/api/README.md) |
| `packages/**` | Package conventions; read `docs/requirements/` when architecture-related |
| Reviewing commit / message | [docs/ai/core/git-protocol.md](../../../docs/ai/core/git-protocol.md), [commitlint.config.mjs](../../../commitlint.config.mjs) |

Dual-lane prompts must include: **summary of loaded standards** + **git diff for scope**.

---

## 3. OMX Dual-Lane Review

**Do not** substitute one lane for a missing lane. If either lane is unavailable → report "independent review unavailable" and **do not** mark merge-ready.

### code-reviewer lane

Responsible for: standards compliance, security, code quality, performance, maintainability.

**Check dimensions**

- **Security** — hardcoded secrets, injection, XSS, CSRF, auth
- **Code Quality** — complexity, duplication, naming, function size
- **Performance** — N+1, caching, algorithm efficiency, unnecessary re-renders
- **Best Practices** — error handling, logging, docs, tests
- **Project standards** — AGENTS.md, docs/ai/core, eslint/prettier loaded above; violations must be tagged `[standard: path]`

**Severity:** CRITICAL / HIGH / MEDIUM / LOW → report as Critical / High / Medium / Low

**Output:** files reviewed, findings by severity (with file:line), fix suggestions, lane recommendation (APPROVE / REQUEST CHANGES / COMMENT)

### architect lane

Responsible for: architecture/design tradeoffs, devil's advocate perspective.

**Check dimensions**

- System boundaries and interfaces
- Hidden coupling and long-term maintenance risk
- Tradeoffs the primary reviewer may miss
- Strongest argument against approving as-is

**Architecture status** (pick one):

| Status | Meaning |
| ------ | ------- |
| **CLEAR** | No unresolved architecture blockers |
| **WATCH** | Non-blocking design concerns; must appear in final synthesis |
| **BLOCK** | Unresolved design issue; not merge-ready |

**Output:** Architectural Status, file:line evidence, design recommendations

### Parallel Delegation

```
delegate(
  role="code-reviewer",
  tier="THOROUGH",
  prompt="CODE REVIEW TASK

Review quality, security, maintainability, and **project standards** (see list below).
This is the code/spec/security lane; it does not own architecture.

Scope: [git diff or specified files]
Loaded standards: [list]

Checklist: OWASP, code quality, performance, best practices, project ESLint/AGENTS.md/docs/ai/core compliance

Output: file count, CRITICAL/HIGH/MEDIUM/LOW, file:line, fix suggestions, APPROVE/REQUEST CHANGES/COMMENT"
)

delegate(
  role="architect",
  tier="THOROUGH",
  prompt="ARCHITECTURE REVIEW TASK

Architecture/tradeoff review for the same scope.

Scope: [git diff or specified files]
Loaded standards: [list]

Focus: boundaries, coupling, long-term risk, reasons to reject approval

Output: CLEAR/WATCH/BLOCK, file:line, design recommendations"
)
```

Run both lanes **in parallel**, then synthesize.

### External Model Cross-Check (Optional)

1. Complete this lane's review independently first
2. Consult Codex for cross-validation when available
3. Adopt critically; do not cite blindly
4. External consult unavailable is **non-blocking**; it cannot replace the required dual lanes

---

## 4. Synthesis Rules (OMX)

| Condition | Final verdict (in report) |
| --------- | ------------------------- |
| architect = **BLOCK** | **需修改** |
| code-reviewer = **REQUEST CHANGES** | **需修改** |
| architect = **WATCH** | **建议** |
| Otherwise | Follow code-reviewer → **批准** / **建议** |

Mapping: APPROVE → 批准; COMMENT → 建议; REQUEST CHANGES → 需修改

If either lane delegation fails or is skipped → **需修改** (independent review unavailable); do not approve.

---

## 5. Output

### Language

Reports are **written in Chinese** (headings, summary, findings, checklist, notes). Paths, SHAs, and code identifiers stay as-is. This skill file stays in English for agent readability.

### Directory Layout

```
.code-reviews/
  {n}-{slug}/
    {tool}-review.md       # initial review
```

- Root: `.code-reviews/` (create if missing)
- One review scope → **one subfolder**; different AI tools write separate files under the same scope without overwriting

### Folder Naming `{n}-{slug}`

| Part | Rule |
| ---- | ---- |
| `{n}` | Scan `.code-reviews/` for folders matching `^\d+-`, take max+1; start at `0` if empty |
| `{slug}` | See table below |

| Scope type | `{slug}` rule | Example |
| ---------- | ------------- | ------- |
| User-specified commit, short SHA, or **HEAD / latest commit** | First **7 lowercase chars** of full SHA | `0-63288da`, `1-ca46e25` |
| Staged / unstaged / path scope (no commit context) | kebab-case scope hint (≤40 chars) | `staged`, `packages-ai-core` |

**Commit scopes must** use `{n}-{7-char-sha}` format, consistent with archived folders `.code-reviews/0-63288da` and `.code-reviews/1-ca46e25`.

When resolving slug: if scope maps to a commit, run `git rev-parse` for the full SHA, then take the first 7 characters.

### File Naming `{tool}-review.md`

| Part | Rule |
| ---- | ---- |
| `{tool}` | AI tool identifier that performed the review, **lowercase kebab-case** |
| Suffix | `-review.md` |

Common `{tool}` values:

| Tool | `{tool}` | Display name (in report) |
| ---- | -------- | ------------------------ |
| Cursor | `cursor` | Cursor |
| Codex / OMX | `codex` | Codex |
| Claude Code | `claude` | Claude Code |
| Antigravity | `antigravity` | Antigravity |
| Other | Platform name in kebab-case | Readable display name |

**Regardless of AI tool**, attribute source in **both** the filename and report body (see **审查工具** in template). If the current model name is known, **must** include the **模型** field.

### Report Template (`{tool}-review.md`)

Reference: `.code-reviews/0-63288da/cursor-review.md`, `.code-reviews/1-ca46e25/cursor-review.md`.

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

### Chat Reply

After writing the file, reply briefly with: verdict, key findings, report path (e.g. `.code-reviews/2-ca46e25/cursor-review.md`).

---

## Related OMX Skills

```
/team "review recent auth changes"
/ralph code-review then fix all issues   # Ralph path may auto-fix; pure code-review is read-only
/ultrawork review all files in src/
```

**Follow-up / cross-validation** (verify fixes against an existing `{tool}-review.md`, accept/reject findings) is **not** this skill. Use **`code-review-followup`** (`.codex/skills/code-review-followup/`). That skill writes `{model}-followup.md`, where `{model}` is the identifier of the model that produced the follow-up.

## Best Practices

- Review early and in small batches; prioritize CRITICAL/HIGH
- Consider context — some "issues" may be intentional tradeoffs
- Resolve or explicitly record WATCH items before merge
