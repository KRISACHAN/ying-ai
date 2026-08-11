# ying-ai — Claude Code

Cross-tool entry: [AGENTS.md](../AGENTS.md). Universal rules: [docs/ai/core/](../docs/ai/core/).

## Project rules

Canonical rules live in [`.agents/rules/`](../.agents/rules/). Claude loads adapters from `.claude/rules/`:

| Rule                                           | Scope               |
| ---------------------------------------------- | ------------------- |
| [ai-guide.md](rules/ai-guide.md)               | Always (no `paths`) |
| [project-context.md](rules/project-context.md) | `apps/**`           |

## Skills

Project skills in `.claude/skills/`:

| Skill                  | Path                                                                         |
| ---------------------- | ---------------------------------------------------------------------------- |
| `code-review`          | [skills/code-review/SKILL.md](skills/code-review/SKILL.md)                   |
| `code-review-followup` | [skills/code-review-followup/SKILL.md](skills/code-review-followup/SKILL.md) |
| `git-commit`           | [skills/git-commit/SKILL.md](skills/git-commit/SKILL.md)                     |

Shared copies also live under [`.agents/skills/`](../.agents/skills/) for Antigravity.
