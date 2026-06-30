# .requirements

Root archive for **ying-companion requirement and planning documents**. AI agents use this directory to understand project intent, plan work, and execute staged implementation tasks.

> **AI entry:** [AGENTS.md](../AGENTS.md) — start there, then use this README for layout and conventions → read `prompts/` for planning context → read the relevant `stages/{version}/stage-{NN}/` task doc before implementing. Requirement **content is Chinese**; this README is English for agent readability.

---

## Directory Layout

```txt
.requirements/
  README.md                 # This file: layout, conventions, read order
  prompts/                  # Task-planning prompt chain (how the plan was produced)
    00-basic.md
    01-detail.md
    02-execution.md
    03-v1.0-plan.md
    04-v1.1-plan.md
  stages/                   # Versioned executable stage task archives
    v1.0/
    v1.1/
      stage-{NN}/
        {NN}-{topic}.md       # Main stage spec (source of truth when merged)
        {NN}-{topic}-patch.md # Optional amendment / change record
```

- **`prompts/`** — inputs used to **plan** the project (vision → core capabilities → execution constraints → master roadmap). Read for _why_ and _overall shape_; do not treat as the live task checklist.
- **`stages/{version}/`** — **actionable specs** for each implementation stage in that release. Read the main `{NN}-{topic}.md` in the target stage folder before coding; patches document deltas and history.

---

## `prompts/` — Planning Prompt Chain

Numbered files form a **sequential planning pipeline**. Read in order when you need full product/architecture context.

| File                                                 | Role                     | Summary                                                                                                                                                                                  |
| ---------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`prompts/00-basic.md`](prompts/00-basic.md)         | Project baseline         | Monorepo vision: RBAC admin + user frontend + AI companion core; shared toolchain (pnpm, turbo, TS, eslint, prettier, commitlint)                                                        |
| [`prompts/01-detail.md`](prompts/01-detail.md)       | Core module capabilities | Context recall, tool use, agent pipeline, persona, memory, emotion, safety — _what_ the AI companion core must support                                                                   |
| [`prompts/02-execution.md`](prompts/02-execution.md) | Execution constraints    | V1 scope boundaries: pure core/SDK, no auth/users/deploy, pluggable slots, env vars, no tests/UI focus for v1, structured stage output format                                            |
| [`prompts/03-v1.0-plan.md`](prompts/03-v1.0-plan.md) | V1.0 master roadmap      | **AI Companion Core V1.0** eight-stage plan (Model Runtime → Core abstractions → chat loop → memory → emotion → tools → workflow → debug UI); lists planned sub-task filenames per stage |
| [`prompts/04-v1.1-plan.md`](prompts/04-v1.1-plan.md) | V1.1 master roadmap      | **V1.1** eight-stage plan (Persona → stream contract → model profiles → step refactor → streaming workflow → Ollama → NDJSON workbench → documentation & review)                         |

**Relationship:** `02-execution.md` was used to produce `03-v1.0-plan.md` and constrains both releases. Stage task files under `stages/{version}/` are the **detailed specs** — prefer them over high-level bullets inside plan files when implementing.

---

## `stages/` — Executable Stage Tasks

Each **`stages/{version}/stage-{NN}/`** folder holds specs for one roadmap stage from that version's roadmap.

### Folder naming

| Part              | Rule                                    | Example                |
| ----------------- | --------------------------------------- | ---------------------- |
| `{version}`       | Release archive                         | `v1.0`                 |
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

List `.requirements/stages/*/` to see which version archives exist. As of repo state:

```txt
stages/v1.0/stage-01/
  01-model-runtime.md          # Stage 1 — Model Runtime (merged spec; primary)
  01-model-runtime-patch.md    # Patch: move demo to apps/model-runtime-demo
  01-model-runtime-patch-2.md  # Patch: retry, fallback, runtime info
stages/v1.0/stage-02/
  02-core-abstractions.md
stages/v1.0/stage-03/
  03-chat-main-pipeline.md
stages/v1.0/stage-04/
  04-memory-system.md
stages/v1.0/stage-05/
  05-emotion-engine.md
stages/v1.0/stage-06/
  06-tool-system.md
stages/v1.0/stage-07/
  07-workflow-layer.md
stages/v1.0/stage-08/
  08-debug-ui-and-observability.md
```

**V1.0 topic:** `@ying-companion/ai-core` core SDK plus `apps/model-runtime-demo` debug workbench. The release covers runtime, DI, chat workflow, memory, emotion, tools, workflow orchestration, and observability. Core must **not** read env vars or host demo UI.

**V1.1 topic:** Persona extensions, workflow-level streaming (`streamWorkflow`), model capability profiles, tool planning, Ollama adapter (`packages/model-ollama`), NDJSON debug workbench. V1.0 `executeWorkflow()` remains compatible. **Stage 8** is documentation, manual acceptance, and review archive only — no new Core features.

```txt
stages/v1.1/stage-01/  01-persona-profile.md
stages/v1.1/stage-02/  02-v1.1-contract.md
stages/v1.1/stage-03/  03-model-provider-strategy.md
stages/v1.1/stage-04/  04-workflow-step-refactor.md
stages/v1.1/stage-05/  05-streaming-workflow.md (+ refactor patch)
stages/v1.1/stage-06/  06-ollama-model-adapter.md
stages/v1.1/stage-07/  07-debug-workbench-streaming.md
stages/v1.1/stage-08/  08-documentation-and-review.md
```

Reviews: [`.code-reviews/v1.1/`](../.code-reviews/v1.1/conclusion.md). Do not rewrite frozen stage docs to fake history; new work builds on the V1.1 baseline.

---

## Typical Agent Workflow

```txt
1. Planning / orientation
   → prompts/00-basic.md → 01-detail.md → 03-v1.0-plan.md or 04-v1.1-plan.md

2. Before implementing a stage
   → stages/{version}/stage-{NN}/{NN}-{topic}.md (main spec)
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

**"What are the V1.0 stages?"** → [`prompts/03-v1.0-plan.md`](prompts/03-v1.0-plan.md) § 总体阶段规划

**"What are the V1.1 stages?"** → [`prompts/04-v1.1-plan.md`](prompts/04-v1.1-plan.md) · [`stages/v1.1/`](stages/v1.1/)

**"What was implemented for stage 1?"** → [`stages/v1.0/stage-01/01-model-runtime.md`](stages/v1.0/stage-01/01-model-runtime.md)

**"Why is there a separate demo app?"** → [`stages/v1.0/stage-01/01-model-runtime-patch.md`](stages/v1.0/stage-01/01-model-runtime-patch.md)

**"Where did requirements move from?"** → Former path `docs/requirements/` → now `.requirements/`. Prefer `.requirements/` in new links and reads.

---

## Related Paths

| Path                                                                  | Purpose                                                     |
| --------------------------------------------------------------------- | ----------------------------------------------------------- |
| [`.code-reviews/`](../.code-reviews/README.md)                        | Code review reports tied to commits/stages                  |
| [`docs/ai/core/`](../docs/ai/core/)                                   | Agent operating rules for implementation                    |
| [`.codex/skills/code-review/`](../.codex/skills/code-review/SKILL.md) | Review skill; loads stage docs when reviewing `packages/**` |
