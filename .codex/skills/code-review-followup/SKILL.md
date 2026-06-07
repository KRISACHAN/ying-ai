---
name: code-review-followup
description: 对已有代码审查报告进行跟进复核：逐条核实现有 review finding 是否成立，按当前代码与项目规范判断采纳、驳回、延期或未处理；在用户要求时实施安全修复；重新运行必要验证；并在同一个 `.code-reviews/{n}-{slug}/` 目录写入 `{model}-followup.md` 回复文档，其中 `{model}` 是本次实际回复的模型标识。适用于用户引用 Cursor/Codex/Claude 等 review 结果、要求判断 review 是否有问题、要求修复 review finding、或要求生成 follow-up 回复文档的场景。
---

# Code Review Followup

用于处理已有代码审查报告的后续复核与回复。不要用它做全新的初次代码审查；初次审查使用 `code-review`。

## 工作流

1. 读取用户引用的 review 报告，以及同一 `.code-reviews/{n}-{slug}/` 目录下已有的 follow-up 示例。
2. 读取相关当前代码、文档和 diff，逐条核实 review finding。优先使用 `rg`、`git diff` 和定向文件读取。
3. 对每条可执行 finding 分类：
   - **已采纳并修复**：finding 成立，并已在本轮修复，或当前代码已经修复。
   - **不成立**：当前代码、项目约束或依赖行为能反证该 finding。
   - **保留关注**：finding 成立，但非阻塞，或明确属于后续阶段。
   - **未处理**：finding 成立但未修复；必须说明原因。
4. 如果用户要求实现修复，先做安全、局部的代码改动，再写 follow-up 文档。改动范围只覆盖被复核的 finding。
5. 运行能证明修复的最小验证。代码改动优先跑目标包 typecheck/lint/build；影响范围较大时再跑根命令。
6. 在同一个 review 目录写入 `{model}-followup.md`。`{model}` 必须是本次实际回复的模型标识；例如当前由 Codex 回复时写 `codex-followup.md`，Cursor 回复时写 `cursor-followup.md`，Claude 回复时写 `claude-followup.md`。
7. 最终回复只简要说明结论、关键处理、验证证据和 follow-up 路径。

## 目录规则

优先写入被引用 review 所在的同一个目录：

```txt
.code-reviews/
  {n}-{slug}/
    cursor-review.md
    {model}-followup.md
```

`{model}-followup.md` 的 `{model}` 取值规则：

- 使用本次实际生成 follow-up 的模型/工具标识，而不是原始 review 的作者。
- 取小写 kebab-case：`codex`、`cursor`、`claude`、`gemini`、`gpt-5.5` 等。
- 如果当前环境只能确定工具而不能确定具体模型名，用工具名；如果能确定模型名且项目要求精确模型名，用模型名。
- 文件名必须与正文里的复核来源保持一致。

如果用户引用的报告不在 `.code-reviews/` 下，除非用户另有指定，否则把 follow-up 写在该报告旁边。

## Follow-Up 模板

```markdown
# 代码审查复核 — {范围简述}

**日期：** {YYYY-MM-DD}
**审查范围：** `{review-path}` 及当前实现
**引用：** `{review-path}`
**结论：** {批准 | 建议 | 需修改}

## 依据规范

{实际读取的规范与上下文文件}

## 摘要

{2-4 句说明 review 结论是否成立、已修复内容、剩余风险。}

## 审查统计

- 复核问题数：{n}
- 已采纳并修复：{n}
- 不成立：{n}
- 保留为后续关注：{n}
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
- 架构状态：{CLEAR | WATCH | BLOCK}
- 最终结论：**{批准 | 建议 | 需修改}**。{一句话理由}
```

## 判定规则

- 如果当前范围内仍有成立且未修复的严重/高优先级 finding，结论写 **需修改**。
- 如果修复已完成，但仍有非阻塞 WATCH 或延期项，结论写 **建议**。
- 只有当所有 finding 都已修复或可充分驳回，并且验证通过时，才写 **批准**。
- 不盲从原始 review；必须基于当前文件和项目规范复核。
- 不声称未运行的验证；写清楚具体命令和结果。
- 回复文档以中文为主；路径、命令和代码标识保持原文。
