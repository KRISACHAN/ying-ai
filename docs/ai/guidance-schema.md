# AI Guidance Schema

Canonical schema for AI agent documentation in this repository.

## Role & Intent

| Surface                                    | Purpose                                                                     |
| ------------------------------------------ | --------------------------------------------------------------------------- |
| [`AGENTS.md`](../../AGENTS.md)             | **Single entry for all tools** — wizard only, not detailed prompts          |
| [`docs/ai/core/`](core/)                   | Tool-agnostic rules all agents must follow                                  |
| [`docs/ai/platforms.md`](platforms.md)     | Cross-tool adapter map; tool-specific behavior in `.{tool}/*` native assets |
| [`docs/ai/oh-my-codex.md`](oh-my-codex.md) | OMX orchestration contract (OMX-generated; read when using `.codex/`)       |
| Package `README.md`                        | App- or package-scoped context (e.g. `apps/web/README.md`)                  |

## File Taxonomy

```
docs/ai/
├── guidance-schema.md     # This file — extension contract
├── platforms.md           # Cross-tool adapter map (all IDEs)
├── oh-my-codex.md         # OMX orchestration (OMX-generated template)
├── core/                  # Universal rules (no $keywords, no tool paths)
│   ├── principles.md
│   ├── working-agreements.md
│   ├── verification.md
│   ├── git-protocol.md
│   └── project-context.md
.{tool}/                   # Native assets only (no README in .codex/)
├── .codex/                # skills/, agents/, prompts/
├── .cursor/rules/         # Cursor
└── .agents/               # Antigravity skills and workflows
```

## Precedence

1. User chat prompt (highest)
2. Nearest package `README.md` (e.g. under `apps/`)
3. Root `AGENTS.md` (sole project entry; `CLAUDE.md` / `GEMINI.md` redirect here)
4. `docs/ai/core/*`
5. `docs/ai/oh-my-codex.md` (when `.codex/` skills, agents, or prompts apply — all tools)
6. Platform native assets (`.codex/*`, `.cursor/rules/*`, `.agents/*`)

## Adding a New Platform

1. Add a `.<tool>/` native directory if the tool needs project-scoped assets
2. Add a row to [platforms.md](platforms.md) and root `AGENTS.md`
3. Optional repo-root redirect (e.g. `CLAUDE.md` → `AGENTS.md`)
4. Do not duplicate `core/` rules in native files — link instead

## Adding a New Skill or Workflow

| Platform           | Location                                                                       |
| ------------------ | ------------------------------------------------------------------------------ |
| Codex / OMX        | `.codex/skills/<name>/SKILL.md` — document in [oh-my-codex.md](oh-my-codex.md) |
| Antigravity        | `.agents/skills/<name>.md`, `.agents/workflows/<name>.md`                      |
| Cursor             | `.cursor/skills/` or `.cursor/rules/`                                          |
| Universal behavior | `docs/ai/core/<topic>.md` only — no tool syntax                                |

## OMX Marker Contract

OMX-managed sections in `AGENTS.md` use explicit HTML comment markers. **Do not edit content inside these markers manually** — use `omx setup --merge-agents` instead.

User-owned wizard content must live **above** `<!-- OMX:AGENTS:START -->`. OMX `setup --merge-agents` replaces everything between the START/END markers with its managed template (model table + optional contract).

| Marker                               | Owner             | Purpose                                          |
| ------------------------------------ | ----------------- | ------------------------------------------------ |
| `<!-- OMX:AGENTS:START/END -->`      | OMX setup         | Model table and managed refreshes                |
| `<!-- OMX:MODELS:START/END -->`      | OMX setup         | Auto-generated model capability table            |
| `<!-- OMX:RUNTIME:START/END -->`     | OMX runtime hooks | Session overlays                                 |
| `<!-- OMX:TEAM:WORKER:START/END -->` | OMX team mode     | Ephemeral worker overlay (stripped on `$cancel`) |

User-owned content lives **outside** these markers. Never run `omx setup --force` on `AGENTS.md` unless you intend to refresh managed blocks — prefer `--merge-agents`.

OMX full orchestration template: [oh-my-codex.md](oh-my-codex.md) (not under `.codex/`).

## Language & Tone

- English, imperative mood
- `core/` files must not contain tool-specific syntax (`$ralph`, `omx question`, Cursor modes, etc.)
- Native asset files may reference tool-native commands and paths
- Link to `core/` instead of copying universal rules

## Guidance Section Mapping (OMX compatibility)

For tools that expect the OMX guidance schema:

- **Role & Intent** → root `AGENTS.md` (sole onboarding entry)
- **Operating Principles** → `docs/ai/core/principles.md`
- **Execution Protocol** → `docs/ai/oh-my-codex.md`
- **Constraints & Safety** → `docs/ai/oh-my-codex.md` (keyword detection, cancellation, state)
- **Verification & Completion** → `docs/ai/core/verification.md` + `docs/ai/oh-my-codex.md` execution protocols
- **Recovery & Lifecycle Overlays** → OMX runtime markers in `AGENTS.md`
