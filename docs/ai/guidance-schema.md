# AI Guidance Schema

Canonical schema for AI agent documentation in this repository.

## Role & Intent

| Surface                            | Purpose                                                            |
| ---------------------------------- | ------------------------------------------------------------------ |
| [`AGENTS.md`](../../AGENTS.md)     | **Single entry for all tools** — wizard only, not detailed prompts |
| [`docs/ai/core/`](core/)           | Tool-agnostic rules all agents must follow                         |
| [`docs/ai/platforms/`](platforms/) | Platform-specific orchestration and adapters                       |
| Nested `AGENTS.md`                 | Package- or directory-scoped context (e.g. `apps/web/AGENTS.md`)   |

## File Taxonomy

```
docs/ai/
├── README.md              # Master onboarding
├── guidance-schema.md     # This file — extension contract
├── core/                  # Universal rules (no $keywords, no tool paths)
│   ├── principles.md
│   ├── working-agreements.md
│   ├── verification.md
│   ├── git-protocol.md
│   └── project-context.md
└── platforms/             # Per-tool orchestration
    ├── codex-omx.md       # Codex + oh-my-codex
    ├── cursor.md
    ├── antigravity.md
    └── claude.md
```

## Precedence

1. User chat prompt (highest)
2. Nearest nested `AGENTS.md`
3. Root `AGENTS.md` (sole project entry — no `CLAUDE.md` / `GEMINI.md` at root)
4. `docs/ai/platforms/*` (tool-specific adapter for the active IDE)
5. `docs/ai/core/*`
6. Platform native assets (`.codex/prompts/*`, `.cursor/rules/*`, `.agents/*`)

## Adding a New Platform

1. Create `docs/ai/platforms/<tool>.md` with entry points, config paths, and links to `core/`
2. Add a row to the platform table in root `AGENTS.md`
3. Add an adapter directory if the tool needs one (e.g. `.cursor/rules/` for Cursor)
4. Document setup steps in the platform file — do not duplicate `core/` rules

## Adding a New Skill or Workflow

| Platform              | Location                                                                       |
| --------------------- | ------------------------------------------------------------------------------ |
| Codex / OMX           | `.codex/skills/<name>/SKILL.md` — document in `platforms/codex-omx.md`         |
| Antigravity           | `.agents/skills/<name>.md` — document in `platforms/antigravity.md`            |
| Antigravity pipelines | `.agents/workflows/<name>.md`                                                  |
| Cursor                | User or project skills under `.cursor/skills/` or rules under `.cursor/rules/` |
| Universal behavior    | `docs/ai/core/<topic>.md` only — no tool syntax                                |

## OMX Marker Contract

OMX-managed sections in `AGENTS.md` use explicit HTML comment markers. **Do not edit content inside these markers manually** — use `omx setup --merge-agents` instead.

User-owned wizard content must live **above** `<!-- OMX:AGENTS:START -->`. OMX `setup --merge-agents` replaces everything between the START/END markers with its managed template (model table + optional contract). After merge, trim the managed block back to a redirect pointing at `platforms/codex-omx.md` if you want a thin cross-tool AGENTS.md.

| Marker                               | Owner             | Purpose                                          |
| ------------------------------------ | ----------------- | ------------------------------------------------ |
| `<!-- OMX:AGENTS:START/END -->`      | OMX setup         | Model table and managed refreshes                |
| `<!-- OMX:MODELS:START/END -->`      | OMX setup         | Auto-generated model capability table            |
| `<!-- OMX:RUNTIME:START/END -->`     | OMX runtime hooks | Session overlays                                 |
| `<!-- OMX:TEAM:WORKER:START/END -->` | OMX team mode     | Ephemeral worker overlay (stripped on `$cancel`) |

User-owned content lives **outside** these markers. Never run `omx setup --force` on `AGENTS.md` unless you intend to refresh managed blocks — prefer `--merge-agents`.

## Language & Tone

- English, imperative mood
- `core/` files must not contain tool-specific syntax (`$ralph`, `omx question`, Cursor modes, etc.)
- Platform files may reference tool-native commands and paths
- Link to `core/` instead of copying universal rules

## Guidance Section Mapping (OMX compatibility)

For tools that expect the OMX guidance schema:

- **Role & Intent** → root `AGENTS.md` + `docs/ai/README.md`
- **Operating Principles** → `docs/ai/core/principles.md`
- **Execution Protocol** → `docs/ai/platforms/codex-omx.md`
- **Constraints & Safety** → `docs/ai/platforms/codex-omx.md` (keyword detection, cancellation, state)
- **Verification & Completion** → `docs/ai/core/verification.md` + codex-omx execution protocols
- **Recovery & Lifecycle Overlays** → OMX runtime markers in `AGENTS.md`
