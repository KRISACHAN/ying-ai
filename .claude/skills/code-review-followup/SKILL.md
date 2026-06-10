---
name: code-review-followup
description: Follow up on an existing code review report: verify each finding against current code and project standards; classify as accepted/fixed, invalid, deferred, or unaddressed; apply safe fixes when requested; rerun required verification; write Chinese `{model}-followup.md` in the same `.code-reviews/{n}-{slug}/` directory, where `{model}` is the identifier of the model producing the follow-up. Use when the user references Cursor/Codex/Claude review results, asks whether review findings are valid, requests fixes for review findings, or asks for a follow-up response document.
---

# Code Review Followup

Handles follow-up verification and response for existing code review reports. Do **not** use this for a brand-new initial review; use `code-review` instead. Skill instructions are in English; **report output is Chinese**.

## Workflow

1. Read the review report the user referenced, plus any existing follow-up examples in the same `.code-reviews/{n}-{slug}/` directory.
2. Read relevant current code, docs, and diffs; verify each review finding. Prefer `rg`, `git diff`, and targeted file reads.
3. Classify each actionable finding:
   - **Accepted and Fixed:** finding is valid and fixed in this pass, or already fixed in current code.
   - **Not Valid:** current code, project constraints, or dependency behavior refutes the finding.
   - **Retained Concern:** finding is valid but non-blocking, or explicitly deferred to a later stage.
   - **Unaddressed:** finding is valid but not fixed; reason must be stated.
4. If the user requests fixes, make safe, localized code changes first, then write the follow-up document. Scope changes only to findings under review.
5. Run minimal verification that proves the fixes. For code changes, prefer target package typecheck/lint/build; run root commands when impact is broad.
6. Write `{model}-followup.md` in the same review directory. `{model}` must be the identifier of the model producing this follow-up — e.g. Codex → `codex-followup.md`, Cursor → `cursor-followup.md`, Claude → `claude-followup.md`.
7. Final chat reply: brief verdict, key actions, verification evidence, and follow-up path only.

## Directory Rules

Prefer the same directory as the referenced review:

```txt
.code-reviews/
  {n}-{slug}/
    cursor-review.md
    {model}-followup.md
```

`{model}` in `{model}-followup.md`:

- Use the model/tool identifier that **produces this follow-up**, not the original review author.
- Lowercase kebab-case: `codex`, `cursor`, `claude`, `gemini`, `gpt-5.5`, etc.
- If only the tool is known, use the tool name; if the exact model is known and the project requires it, use the model name.
- Filename must match the follow-up source stated in the report body.

If the referenced report is not under `.code-reviews/`, write the follow-up next to that report unless the user specifies otherwise.

## Follow-Up Template

Output in Chinese. Use this structure:

```markdown
# 代码审查复核 — {范围简述}

**日期：** {YYYY-MM-DD}
**审查工具：** {Codex | Cursor | …}
**模型：** {当前模型名称；不可知则省略此行}
**审查范围：** `{review-path}` 及当前实现
**引用：** `{review-path}`
**结论：** {批准 | 建议 | 需修改}

## 依据规范

{实际读取的规范与上下文文件}

## 摘要

{2–4 句说明 review 结论是否成立、已修复内容、剩余风险}

## 审查统计

- 复核问题数：{n}
- 已采纳并修复：{n}
- 不成立：{n}
- 保留关注：{n}
- 未处理：{n}
- code-reviewer 建议：{APPROVE | COMMENT | REQUEST CHANGES}
- 架构状态：{CLEAR | WATCH | BLOCK}

## 复核结论

### 已采纳并修复

- [{file}] {处理结果}

### 不成立

- [{file}] {驳回依据}

### 保留关注

- [{file}] {保留原因与后续触发条件}

### 未处理

无。（或列出）

## 验证

- `{command}`：{通过 | 失败 | 未运行，原因}

## 合成说明

- code-reviewer：{建议}
- 架构状态：{CLEAR/WATCH/BLOCK}
- 最终结论：**{批准 | 建议 | 需修改}**。{一句话理由}
```

## Verdict Rules

Report verdicts use Chinese: **需修改** / **建议** / **批准**.

- If valid, unaddressed Critical/High findings remain in scope → **需修改**.
- If fixes are done but non-blocking WATCH or deferred items remain → **建议**.
- **批准** only when all findings are fixed or fully rebutted and verification passes.
- Do not defer blindly to the original review; verify against current files and project standards.
- Do not claim verification that was not run; state exact commands and results.
- Follow-up documents are **written in Chinese**; paths, commands, and code identifiers stay as-is.
