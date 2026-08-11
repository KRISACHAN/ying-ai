# AI Guidance Schema

Canonical schema for AI agent documentation in this repository.

## Role & Intent

| Surface                                | Purpose                                                                     |
| -------------------------------------- | --------------------------------------------------------------------------- |
| [`AGENTS.md`](../../AGENTS.md)         | **Single entry for all tools** — wizard only, not detailed prompts          |
| [`docs/ai/core/`](core/)               | Tool-agnostic rules all agents must follow                                  |
| [`docs/ai/platforms.md`](platforms.md) | Cross-tool adapter map; tool-specific behavior in `.{tool}/*` native assets |
| Package `README.md`                    | App- or package-scoped context (e.g. `apps/model-runtime-demo/README.md`)   |

## File Taxonomy

```
docs/ai/
├── guidance-schema.md     # This file — extension contract
├── platforms.md           # Cross-tool adapter map (all IDEs)
├── core/                  # Universal rules (no tool paths)
│   ├── principles.md
│   ├── working-agreements.md
│   ├── verification.md
│   ├── git-protocol.md
│   └── project-context.md
.{tool}/                   # Native assets only
├── .agents/rules/         # Project rules (canonical)
├── .agents/skills/        # Antigravity skills
├── .codex/rules/          # Codex adapters → .agents/rules/
├── .codex/skills/         # Codex skills
├── .cursor/rules/         # Cursor adapters → .agents/rules/
├── .claude/rules/         # Claude Code adapters → .agents/rules/
├── .claude/skills/        # Claude Code skills
└── .agents/workflows/     # Antigravity workflows
```

## Precedence

1. User chat prompt (highest)
2. Nearest package `README.md` (e.g. under `apps/`)
3. Root `AGENTS.md` (sole project entry; `CLAUDE.md` / `GEMINI.md` redirect here)
4. `docs/ai/core/*`
5. `.agents/rules/*`
6. Platform native assets (`.codex/*`, `.cursor/rules/*`, `.claude/*`, `.agents/skills/*`)

## Adding a New Platform

1. Add a `.<tool>/` native directory if the tool needs project-scoped assets
2. Add a row to [platforms.md](platforms.md) and root `AGENTS.md`
3. Optional repo-root redirect (e.g. `CLAUDE.md` → `AGENTS.md`)
4. Do not duplicate `core/` rules in native files — link instead

## Adding a New Skill or Workflow

| Platform           | Location                                                              |
| ------------------ | --------------------------------------------------------------------- |
| All tools (rules)  | `.agents/rules/<name>.md` (canonical)                                 |
| Codex              | `.codex/rules/<name>.md` (adapter), `.codex/skills/<name>/SKILL.md`   |
| Claude Code        | `.claude/rules/<name>.md` (adapter), `.claude/skills/<name>/SKILL.md` |
| Antigravity        | `.agents/skills/<name>/SKILL.md`, `.agents/workflows/<name>.md`       |
| Cursor             | `.cursor/rules/<name>.mdc` (adapter → `.agents/rules/`)               |
| Universal behavior | `docs/ai/core/<topic>.md` only — no tool syntax                       |

## Language & Tone

- English, imperative mood
- `core/` files must not contain tool-specific syntax (Cursor modes, etc.)
- Native asset files may reference tool-native commands and paths
- Link to `core/` instead of copying universal rules

## Guidance Section Mapping

- **Role & Intent** → root `AGENTS.md` (sole onboarding entry)
- **Operating Principles** → `docs/ai/core/principles.md`
- **Verification & Completion** → `docs/ai/core/verification.md`
- **Git & Commits** → `docs/ai/core/git-protocol.md`
- **Project Context** → `docs/ai/core/project-context.md`
