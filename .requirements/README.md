# .requirements

Root archive for **ying-companion requirement and planning documents**. AI agents use this directory to understand project intent, plan work, and execute staged implementation tasks.

> **AI entry:** [AGENTS.md](../AGENTS.md) — start there, then use this README for layout and conventions → read `prompts/` for planning context → read the relevant `stages/stage-{NN}/` task doc before implementing. Requirement **content is Chinese**; this README is English for agent readability.

---

## Directory Layout

```txt
.requirements/
  README.md                 # This file: layout, conventions, read order
  prompts/                  # Task-planning prompt chain (how the plan was produced)
    00-basic.md
    01-detail.md
    02-execution.md
    03-plan.md
  stages/                   # Executable stage tasks (what to build now)
    stage-{NN}/
      {NN}-{topic}.md       # Main stage spec (source of truth when merged)
      {NN}-{topic}-patch.md # Optional amendment / change record
```

- **`prompts/`** — inputs used to **plan** the project (vision → core capabilities → execution constraints → master roadmap). Read for _why_ and _overall shape_; do not treat as the live task checklist.
- **`stages/`** — **actionable specs** for each implementation stage. Read the main `{NN}-{topic}.md` in the target stage folder before coding; patches document deltas and history.

---

## `prompts/` — Planning Prompt Chain

Numbered files form a **sequential planning pipeline**. Read in order when you need full product/architecture context.

| File                                                 | Role                     | Summary                                                                                                                                                                                |
| ---------------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`prompts/00-basic.md`](prompts/00-basic.md)         | Project baseline         | Monorepo vision: RBAC admin + user frontend + AI companion core; shared toolchain (pnpm, turbo, TS, eslint, prettier, commitlint)                                                      |
| [`prompts/01-detail.md`](prompts/01-detail.md)       | Core module capabilities | Context recall, tool use, agent pipeline, persona, memory, emotion, safety — _what_ the AI companion core must support                                                                 |
| [`prompts/02-execution.md`](prompts/02-execution.md) | Execution constraints    | V1 scope boundaries: pure core/SDK, no auth/users/deploy, pluggable slots, env vars, no tests/UI focus for v1, structured stage output format                                          |
| [`prompts/03-plan.md`](prompts/03-plan.md)           | Master roadmap           | **AI Companion Core V1** eight-stage plan (Model Runtime → Core abstractions → chat loop → memory → emotion → tools → workflow → debug UI); lists planned sub-task filenames per stage |

**Relationship:** `02-execution.md` was used to produce `03-plan.md`. Stage task files under `stages/` are the **detailed specs** derived from that roadmap — prefer them over the high-level bullets inside `03-plan.md` when implementing.

---

## `stages/` — Executable Stage Tasks

Each **`stage-{NN}/`** folder holds specs for one roadmap stage from `prompts/03-plan.md`.

### Folder naming

| Part              | Rule                                    | Example                |
| ----------------- | --------------------------------------- | ---------------------- |
| `stage-{NN}`      | Two-digit stage number from master plan | `stage-01`, `stage-02` |
| `{NN}-{topic}.md` | Stage number + kebab-case topic         | `01-model-runtime.md`  |

### File roles

| Pattern                      | Role                                                                                                                                                                        |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `{NN}-{topic}.md`            | **Primary spec** for the stage — acceptance criteria, directory layout, interfaces, verification. When patches are merged into the main doc, treat this as source of truth. |
| `{NN}-{topic}-patch.md`      | **Amendment record** — documents a course correction after initial implementation. May be merged into the main doc; keep file for history.                                  |
| `{NN}-{topic}-patch-2.md`, … | Further amendments in sequence                                                                                                                                              |

### Patch vs main doc

When the main doc states it has **absorbed** patch content (see merge note at top), implement and verify against the **main doc only**. Use patch files to understand _why_ a change happened, not as a second conflicting spec.

---

## Current Layout (discover by listing)

List `.requirements/stages/*/` to see which stages exist. As of repo state:

```txt
stages/stage-01/
  01-model-runtime.md          # Stage 1 — Model Runtime (merged spec; primary)
  01-model-runtime-patch.md    # Patch: move demo to apps/model-runtime-demo
  01-model-runtime-patch-2.md  # Patch: retry, fallback, runtime info
```

**Stage 1 topic:** `@ying-companion/ai-core` Model Runtime — abstractions, OpenAI-compatible provider via Vercel AI SDK, factory, generate/stream, retry/fallback, `apps/model-runtime-demo` for env + observability. Core must **not** read env vars or host demo UI.

Stages 2–8 are defined at a high level in [`prompts/03-plan.md`](prompts/03-plan.md); detailed `stages/stage-{NN}/` files appear when each stage is ready to execute.

---

## Typical Agent Workflow

```txt
1. Planning / orientation
   → prompts/00-basic.md → 01-detail.md → 03-plan.md (skip 02 unless tracing plan origin)

2. Before implementing a stage
   → stages/stage-{NN}/{NN}-{topic}.md (main spec)
   → skim patches only if merge note or ambiguity requires history

3. During implementation
   → follow docs/ai/core/ and package AGENTS.md
   → code-review against stage acceptance criteria

4. After stage work
   → archive reviews under .code-reviews/
```

---

## Language and Format

| Asset                            | Language                                     |
| -------------------------------- | -------------------------------------------- |
| This README                      | English (agent conventions)                  |
| `prompts/*.md`, `stages/**/*.md` | **Chinese** (authoritative requirement text) |
| Code, paths, env var names       | As in repo (usually English)                 |

When generating **new** requirement or stage docs, follow project convention: **Chinese prose**, structured markdown, minimal tables (per `prompts/02-execution.md` output requirements).

---

## Quick Lookup

**"What is this project?"** → [`prompts/00-basic.md`](prompts/00-basic.md)

**"What must the AI core do?"** → [`prompts/01-detail.md`](prompts/01-detail.md)

**"What are the V1 stages?"** → [`prompts/03-plan.md`](prompts/03-plan.md) § 总体阶段规划

**"What should I implement now for stage 1?"** → [`stages/stage-01/01-model-runtime.md`](stages/stage-01/01-model-runtime.md)

**"Why is there a separate demo app?"** → [`stages/stage-01/01-model-runtime-patch.md`](stages/stage-01/01-model-runtime-patch.md)

**"Where did requirements move from?"** → Former path `docs/requirements/` → now `.requirements/`. Prefer `.requirements/` in new links and reads.

---

## Related Paths

| Path                                                                  | Purpose                                                     |
| --------------------------------------------------------------------- | ----------------------------------------------------------- |
| [`.code-reviews/`](../.code-reviews/README.md)                        | Code review reports tied to commits/stages                  |
| [`docs/ai/core/`](../docs/ai/core/)                                   | Agent operating rules for implementation                    |
| [`.codex/skills/code-review/`](../.codex/skills/code-review/SKILL.md) | Review skill; loads stage docs when reviewing `packages/**` |
