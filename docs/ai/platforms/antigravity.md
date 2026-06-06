# Antigravity

Antigravity adapter for ying-companion. **Entry is root [AGENTS.md](../../AGENTS.md) only** — no separate `GEMINI.md`.

## Entry Points

| Surface          | Path                                             | Notes                               |
| ---------------- | ------------------------------------------------ | ----------------------------------- |
| **Single entry** | [AGENTS.md](../../AGENTS.md)                     | Auto-loaded in Antigravity v1.20.3+ |
| Platform adapter | This file                                        | Antigravity-specific behavior       |
| Modular skills   | [`.agents/skills/`](../../.agents/skills/)       | Task-specific instruction manuals   |
| Workflows        | [`.agents/workflows/`](../../.agents/workflows/) | Slash-command pipelines             |
| Universal rules  | [docs/ai/core/](../core/)                        | Shared with all tools               |

## Precedence (Antigravity)

1. User chat prompt (highest)
2. Nearest nested `AGENTS.md` (e.g. `apps/web/AGENTS.md`)
3. Root `AGENTS.md`
4. [docs/ai/platforms/antigravity.md](antigravity.md) — Antigravity-only overrides (this file)
5. [docs/ai/core/](../core/)
6. `.agents/skills/` and `.agents/workflows/`

If you use Antigravity's legacy `GEMINI.md` support globally, keep personal overrides in `~/.gemini/GEMINI.md` — not in this repo. Project-specific Antigravity overrides belong in this file or `.agents/`.

## Directory Layout

```
.agents/
├── skills/       # Modular .md skill files (e.g. deploy_app.md)
└── workflows/    # Slash-command orchestration (e.g. startcycle.md)
```

Antigravity natively recognizes `.agents/` for extending built-in AI behavior.

## Global vs Project

- **Global:** `~/.gemini/AGENTS.md` — personal preferences across projects
- **Project:** `./AGENTS.md` — commit to git for team sharing (sole project entry)
- **Nested:** `apps/<pkg>/AGENTS.md` — package-scoped rules

Enable nested AGENTS.md in Settings → Agent → Load nested AGENTS.md files.

## Antigravity-Only Overrides

Add tool-specific rules here (not in root). Examples:

- Design artifact handling
- Knowledge Items references
- Antigravity UI preferences

Do not duplicate universal rules from `docs/ai/core/`.

## Adding Antigravity Workflows

1. Create `.agents/workflows/<name>.md` defining the slash command orchestration
2. Reference skills from `.agents/skills/` and navigation from AGENTS.md
3. Document the workflow in this file

Example workflow trigger: `/startcycle <idea>` orchestrates PM → dev → QA using `.agents/skills/` modules.
