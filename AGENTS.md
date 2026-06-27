# ying-companion — AI Entry

> **Single entry for all AI tools.** Read this file first. [CLAUDE.md](CLAUDE.md) and [GEMINI.md](GEMINI.md) redirect here.
> Human overview: [README.md](README.md)

**USER-MANAGED:** Content above `<!-- OMX:AGENTS:START -->` is the portable wizard. Do not run `omx setup --force` on this file. Prefer `omx setup --merge-agents` only when refreshing the model table.

---

## Read Path

```txt
1. AGENTS.md              ← you are here
2. docs/ai/core/          ← universal rules (required before coding)
3. docs/ai/platforms.md   ← tool map; then native assets for your IDE
4. docs/ai/oh-my-codex.md ← OMX orchestration (required when using .codex/)
5. .requirements/         ← what to build (stage specs)
6. apps/*/README.md       ← package context when editing code
7. .code-reviews/         ← past reviews when relevant
```

**Rule precedence:** user prompt → nearest package `README.md` → this file → `docs/ai/core/` → native tool assets (`.codex/`, `.cursor/rules/`, `.agents/`). Details: [docs/ai/guidance-schema.md](docs/ai/guidance-schema.md) · [docs/ai/platforms.md](docs/ai/platforms.md).

---

## Project Snapshot

| Layer           | Location                  | Status                                                                         |
| --------------- | ------------------------- | ------------------------------------------------------------------------------ |
| **AI Core SDK** | `packages/ai-core`        | V1.1 in progress — persona/profile, stream contract, model provider strategy   |
| **Debug app**   | `apps/model-runtime-demo` | V1.1 debug workbench — persisted state, persona config, provider observability |
| **Product API** | `apps/api`                | Scaffold — planned RBAC backend                                                |
| **Product web** | `apps/web`                | Scaffold — planned user frontend                                               |

**V1 boundary** ([`.requirements/prompts/02-execution.md`](.requirements/prompts/02-execution.md)): pure core/SDK — no auth, user system, or deployment. `ai-core` does **not** read env vars; apps pass config in.

**Current package:** V1.0 is frozen under [`.requirements/stages/v1.0/`](.requirements/stages/v1.0/) with reviews under [`.code-reviews/v1.0/`](.code-reviews/v1.0/). V1.1 execution is tracked under [`.requirements/stages/v1.1/`](.requirements/stages/v1.1/) with roadmap [`.requirements/prompts/04-v1.1-plan.md`](.requirements/prompts/04-v1.1-plan.md).

---

## `.requirements/` — what to build

| When                           | Read                                                                |
| ------------------------------ | ------------------------------------------------------------------- |
| Product vision                 | `prompts/00-basic.md`, `01-detail.md`                               |
| V1 scope / constraints         | `prompts/02-execution.md`                                           |
| Full V1.0 roadmap              | `prompts/03-v1.0-plan.md`                                           |
| Full V1.1 roadmap              | `prompts/04-v1.1-plan.md`                                           |
| Implement / inspect V1.0 stage | `stages/v1.0/stage-{NN}/{NN}-{topic}.md` (patches only for history) |
| Implement / inspect V1.1 stage | `stages/v1.1/stage-{NN}/{NN}-{topic}.md`                            |

- **`prompts/`** — planning context (why and overall shape); not the live task checklist.
- **`stages/`** — executable specs with acceptance criteria; read the main `{NN}-{topic}.md` before coding.

Full conventions: [`.requirements/README.md`](.requirements/README.md). Requirement **content is Chinese**.

---

## `.code-reviews/` — review archive

| When                                | Read / do                                                            |
| ----------------------------------- | -------------------------------------------------------------------- |
| Check if a V1.0 commit was reviewed | `v1.0/{n}-{7-char-sha}/` folder                                      |
| Understand past findings            | `{tool}-review.md` in that versioned folder                          |
| Verify fixes                        | `{model}-followup.md` in same folder                                 |
| Write a new review                  | `.codex/skills/code-review/` → `.code-reviews/{version}/{n}-{slug}/` |

Full naming rules: [`.code-reviews/README.md`](.code-reviews/README.md). Follow-up skill: `.codex/skills/code-review-followup/`.

---

## Operating Rules (`docs/ai/core/`)

| File                                                        | Topic                                                         |
| ----------------------------------------------------------- | ------------------------------------------------------------- |
| [principles.md](docs/ai/core/principles.md)                 | Operating principles                                          |
| [working-agreements.md](docs/ai/core/working-agreements.md) | Diff size, patterns                                           |
| [verification.md](docs/ai/core/verification.md)             | Verify before claiming done                                   |
| [git-protocol.md](docs/ai/core/git-protocol.md)             | Commits (Chinese, conventional)                               |
| [project-context.md](docs/ai/core/project-context.md)       | Monorepo layout and commands                                  |
| [oh-my-codex.md](docs/ai/oh-my-codex.md)                    | OMX orchestration — **read when using `.codex/`** (all tools) |

---

## Platform Adapter

Shared tool map: [docs/ai/platforms.md](docs/ai/platforms.md). Tool-specific behavior lives in native asset dirs — not duplicated in `docs/`.

| Tool            | Native assets                                                                           |
| --------------- | --------------------------------------------------------------------------------------- |
| **Codex + OMX** | `.codex/` — `skills/`, `agents/`, `prompts/` + [oh-my-codex.md](docs/ai/oh-my-codex.md) |
| **Cursor**      | `.cursor/rules/`                                                                        |
| **Antigravity** | `.agents/skills/`, `.agents/workflows/`                                                 |
| **Claude Code** | — (uses AGENTS.md + `docs/ai/core/`; [CLAUDE.md](CLAUDE.md) redirects here)             |

---

## Package Context

When editing under `apps/` or `packages/`, read that package's `README.md`:

- [apps/model-runtime-demo/README.md](apps/model-runtime-demo/README.md) — V1.0 debug workbench env vars and local run
- [apps/web/README.md](apps/web/README.md) · [apps/api/README.md](apps/api/README.md) — product scaffolds

---

## Non-Negotiables

- **Verify before done** → [docs/ai/core/verification.md](docs/ai/core/verification.md)
- **Small, focused diffs** → [docs/ai/core/working-agreements.md](docs/ai/core/working-agreements.md)
- **Commits** → [docs/ai/core/git-protocol.md](docs/ai/core/git-protocol.md)
- **Monorepo commands** → [docs/ai/core/project-context.md](docs/ai/core/project-context.md)

<!-- OMX:AGENTS:START -->
<!-- omx:generated:agents-md -->
<!-- AUTONOMY DIRECTIVE — DO NOT REMOVE -->

YOU ARE AN AUTONOMOUS CODING AGENT. EXECUTE TASKS TO COMPLETION WITHOUT ASKING FOR PERMISSION.
DO NOT STOP TO ASK "SHOULD I PROCEED?" — PROCEED. DO NOT WAIT FOR CONFIRMATION ON OBVIOUS NEXT STEPS.
IF BLOCKED, TRY AN ALTERNATIVE APPROACH. ONLY ASK WHEN TRULY AMBIGUOUS OR DESTRUCTIVE.
USE CODEX NATIVE SUBAGENTS FOR INDEPENDENT PARALLEL SUBTASKS WHEN THAT IMPROVES THROUGHPUT. THIS IS COMPLEMENTARY TO OMX TEAM MODE.

<!-- END AUTONOMY DIRECTIVE -->

Codex/OMX orchestration: [docs/ai/oh-my-codex.md](docs/ai/oh-my-codex.md) · Skills: `.codex/skills/` · Agents: `.codex/agents/`

<!-- OMX:MODELS:START -->

## Model Capability Table

Auto-generated by `omx setup` from the current `config.toml` plus OMX model overrides.

| Role                        | Model                 | Reasoning Effort | Use Case                                                                                                                                                                           |
| --------------------------- | --------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontier (leader)           | `gpt-5.5`             | high             | Primary leader/orchestrator for planning, coordination, and frontier-class reasoning.                                                                                              |
| Spark (explorer/fast)       | `gpt-5.3-codex-spark` | low              | Fast triage, explore, lightweight synthesis, and low-latency routing.                                                                                                              |
| Standard (subagent default) | `gpt-5.5`             | high             | Default standard-capability model for installable specialists and secondary worker lanes unless a role is explicitly frontier or spark.                                            |
| `explore`                   | `gpt-5.3-codex-spark` | low              | Fast codebase search and file/symbol mapping (fast-lane, fast)                                                                                                                     |
| `analyst`                   | `gpt-5.5`             | medium           | Requirements clarity, acceptance criteria, hidden constraints (frontier-orchestrator, frontier)                                                                                    |
| `planner`                   | `gpt-5.4-mini`        | high             | Task sequencing, execution plans, risk flags (frontier-orchestrator, frontier)                                                                                                     |
| `architect`                 | `gpt-5.4-mini`        | high             | System design, boundaries, interfaces, long-horizon tradeoffs (frontier-orchestrator, frontier)                                                                                    |
| `debugger`                  | `gpt-5.5`             | high             | Root-cause analysis, regression isolation, failure diagnosis (deep-worker, standard)                                                                                               |
| `executor`                  | `gpt-5.5`             | medium           | Code implementation, refactoring, feature work (deep-worker, standard)                                                                                                             |
| `team-executor`             | `gpt-5.5`             | medium           | Supervised team execution for conservative delivery lanes (deep-worker, frontier)                                                                                                  |
| `verifier`                  | `gpt-5.5`             | high             | Completion evidence, claim validation, test adequacy (frontier-orchestrator, standard)                                                                                             |
| `code-reviewer`             | `gpt-5.5`             | high             | Comprehensive review across all concerns (frontier-orchestrator, frontier)                                                                                                         |
| `dependency-expert`         | `gpt-5.5`             | high             | External SDK/API/package evaluation (frontier-orchestrator, standard)                                                                                                              |
| `test-engineer`             | `gpt-5.5`             | medium           | Test strategy, coverage, flaky-test hardening (deep-worker, frontier)                                                                                                              |
| `designer`                  | `gpt-5.5`             | high             | UX/UI architecture, interaction design (deep-worker, standard)                                                                                                                     |
| `writer`                    | `gpt-5.5`             | high             | Documentation, migration notes, user guidance (fast-lane, standard)                                                                                                                |
| `git-master`                | `gpt-5.5`             | high             | Commit strategy, history hygiene, rebasing (deep-worker, standard)                                                                                                                 |
| `code-simplifier`           | `gpt-5.5`             | high             | Simplifies recently modified code for clarity and consistency without changing behavior (deep-worker, frontier)                                                                    |
| `researcher`                | `gpt-5.4-mini`        | high             | External documentation and reference research (fast-lane, standard)                                                                                                                |
| `prometheus-strict-metis`   | `gpt-5.5`             | high             | Prometheus Strict requirements interviewer and ambiguity mapper (frontier-orchestrator, frontier)                                                                                  |
| `prometheus-strict-momus`   | `gpt-5.5`             | high             | Prometheus Strict adversarial plan critic and risk challenger (frontier-orchestrator, frontier)                                                                                    |
| `prometheus-strict-oracle`  | `gpt-5.5`             | high             | Prometheus Strict implementation readiness verifier and handoff judge (frontier-orchestrator, standard)                                                                            |
| `critic`                    | `gpt-5.5`             | high             | Plan/design critical challenge and review (frontier-orchestrator, frontier)                                                                                                        |
| `scholastic`                | `gpt-5.5`             | high             | Ontology-first reasoning reviewer: category mistakes, hidden assumptions, modality separation, scholastic critique, and minimal-repair proposals (frontier-orchestrator, frontier) |
| `vision`                    | `gpt-5.5`             | low              | Image/screenshot/diagram analysis (fast-lane, frontier)                                                                                                                            |

<!-- OMX:MODELS:END -->

<!-- OMX:AGENTS:END -->
