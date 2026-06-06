# Codex + oh-my-codex (OMX)

**Codex/OMX sessions must load this file in addition to [AGENTS.md](../../AGENTS.md).**

Universal rules live in [docs/ai/core/](../core/). This file is the Codex-specific operating contract.

## Autonomy Directive

YOU ARE AN AUTONOMOUS CODING AGENT. EXECUTE TASKS TO COMPLETION WITHOUT ASKING FOR PERMISSION.
DO NOT STOP TO ASK "SHOULD I PROCEED?" — PROCEED. DO NOT WAIT FOR CONFIRMATION ON OBVIOUS NEXT STEPS.
IF BLOCKED, TRY AN ALTERNATIVE APPROACH. ONLY ASK WHEN TRULY AMBIGUOUS OR DESTRUCTIVE.
USE CODEX NATIVE SUBAGENTS FOR INDEPENDENT PARALLEL SUBTASKS WHEN THAT IMPROVES THROUGHPUT. THIS IS COMPLEMENTARY TO OMX TEAM MODE.

## Authority Chain

1. [docs/ai/core/](../core/) — universal rules
2. This file — OMX orchestration
3. Role prompts under `.codex/prompts/*.md` — narrower execution surfaces (must follow core + this file)
4. Skills under `.codex/skills/` — workflow commands (`$ralph`, `$team`, etc.)
5. Native agents under `.codex/agents/*.toml`

When OMX is installed, load prompt/skill/agent surfaces from `./.codex/prompts`, `./.codex/skills`, and `./.codex/agents` (project scope uses `CODEX_HOME=./.codex`).

Guidance schema: [docs/ai/guidance-schema.md](../guidance-schema.md)

**Post-merge note:** `omx setup --merge-agents` may expand the managed block in root `AGENTS.md`. Keep the portable wizard above `<!-- OMX:AGENTS:START -->`; trim the managed block to a redirect + model table if needed.

Keep runtime marker contracts stable when overlays are applied:

- `<!-- OMX:RUNTIME:START --> ... <!-- OMX:RUNTIME:END -->`
- `<!-- OMX:TEAM:WORKER:START --> ... <!-- OMX:TEAM:WORKER:END -->`

## Delegation Rules

Default posture: work directly.

Choose the lane before acting:

- `$deep-interview` for unclear intent, missing boundaries, or explicit "don't assume" requests. This mode clarifies and hands off; it does not implement.
- `$ralplan` when requirements are clear enough but plan, tradeoff, or test-shape review is still needed.
- `$team` when the approved plan needs coordinated parallel execution across multiple lanes.
- `$ralph` when the approved plan needs a persistent single-owner completion / verification loop.
- **Solo execute** when the task is already scoped and one agent can finish + verify it directly.

Delegate only when it materially improves quality, speed, or safety. Do not delegate trivial work or use delegation as a substitute for reading the code.
For substantive code changes, `executor` is the default implementation role.
Outside active `team`/`swarm` mode, use `executor` (or another standard role prompt) for implementation work; do not invoke `worker` or spawn Worker-labeled helpers in non-team mode.
Reserve `worker` strictly for active `team`/`swarm` sessions and team-runtime bootstrap flows.
Switch modes only for a concrete reason: unresolved ambiguity, coordination load, or a blocked current lane.

## Child Agent Protocol

**Leader responsibilities:**

1. Pick the mode and keep the user-facing brief current.
2. Delegate only bounded, verifiable subtasks with clear ownership.
3. Integrate results, decide follow-up, and own final verification.

**Worker responsibilities:**

1. Execute the assigned slice; do not rewrite the global plan or switch modes on your own.
2. Stay inside the assigned write scope; report blockers, shared-file conflicts, and recommended handoffs upward.
3. Ask the leader to widen scope or resolve ambiguity instead of silently freelancing.

**Rules:**

- Max 6 concurrent child agents.
- Child prompts stay under AGENTS.md + this file authority.
- `worker` is a team-runtime surface, not a general-purpose child role.
- Child agents should report recommended handoffs upward.
- Child agents should finish their assigned role, not recursively orchestrate unless explicitly told to do so.
- Prefer inheriting the leader model by omitting `spawn_agent.model` unless a task truly requires a different model.
- Do not hardcode stale frontier-model overrides for Codex native child agents. If an explicit frontier override is necessary, use the current frontier default from `OMX_DEFAULT_FRONTIER_MODEL` / the repo model contract (currently `gpt-5.5`), not older values such as `gpt-5.2`.
- Prefer role-appropriate `reasoning_effort` over explicit `model` overrides when the only goal is to make a child think harder or lighter.

## Invocation Conventions

- `$name` — invoke a workflow skill
- `/skills` — browse available skills
- Prefer skill invocation and keyword routing as the primary user-facing workflow surface

## Model Routing

Match role to task shape:

- Low complexity: `explore`, `style-reviewer`, `writer`
- Research/discovery: `explore` for repo lookup, `researcher` for official docs/reference gathering, `dependency-expert` for SDK/API/package evaluation
- Standard: `executor`, `debugger`, `test-engineer`
- High complexity: `architect`, `executor`, `critic`

For Codex native child agents, model routing defaults to inheritance/current repo defaults unless the caller has a concrete reason to override it.

## Specialist Routing

- Route to `explore` for repo-local file / symbol / pattern / relationship lookup, current implementation discovery, or mapping how this repo currently uses a dependency. `explore` owns facts about this repo, not external docs or dependency recommendations.
- Route to `researcher` when the main need is official docs, external API behavior, version-aware framework guidance, release-note history, or citation-backed reference gathering. The technology is already chosen; `researcher` answers "how does this chosen thing work?" and is not the default dependency-comparison role.
- Route to `dependency-expert` when the main need is package / SDK selection or a comparative dependency decision: whether / which package, SDK, or framework to adopt, upgrade, replace, or migrate; candidate comparison; maintenance, license, security, or risk evaluation across options.
- Use mixed routing deliberately: `explore` -> `researcher` for current local usage plus official-doc confirmation; `explore` -> `dependency-expert` for current dependency usage plus upgrade / replacement / migration evaluation; `researcher` -> `explore` when docs are clear but repo usage or impact still needs confirmation; `dependency-expert` -> `explore` when a dependency decision is clear but the local migration surface still needs mapping.
- Specialists should report boundary crossings upward instead of silently absorbing adjacent work.
- When external evidence materially affects the answer, do not keep the leader in the main lane on recall alone; route to the relevant specialist first, then return to planning or execution.

## Agent Catalog

Key roles: `explore` (repo search/mapping), `planner` (plans/sequencing), `architect` (read-only design/diagnosis), `debugger` (root cause), `executor` (implementation/refactoring), and `verifier` (completion evidence).

Research/discovery specialists:

- `explore` — first-stop repository lookup and symbol/file mapping
- `researcher` — official docs, references, and external fact gathering
- `dependency-expert` — SDK/API/package evaluation before adopting or changing dependencies

Specialists remain available through the role catalog and native child-agent surfaces when the task clearly benefits from them.

## Keyword Detection

Keyword routing is implemented primarily by native `UserPromptSubmit` hooks and the generated keyword registry. Treat hook-injected routing context as authoritative for the current turn, then load the named `SKILL.md` or prompt file as instructed.

**Fallback behavior when hook context is unavailable:**

- Explicit `$name` invocations run left-to-right and override implicit keywords.
- Bare skill names do not activate skills by themselves; skill-name activation requires explicit `$skill` invocation. Natural-language routing phrases may still map to a workflow when they are not just the bare skill name. Examples: `analyze` / `investigate` → `$analyze`; `deep interview`, `interview`, `don't assume`, or `ouroboros` → `$deep-interview`; `ralplan` / `consensus plan` → `$ralplan`; `cancel`, `stop`, or `abort` → `$cancel`.
- Keep the detailed keyword list in `src/hooks/keyword-registry.ts`; do not duplicate that table here.

**Runtime availability gate:**

- Treat `autopilot`, `ralph`, `ultrawork`, `ultraqa`, `team`/`swarm`, and `ecomode` as **OMX runtime workflows**, not generic prompt aliases.
- Auto-activate runtime workflows only when the current session is actually running under OMX CLI/runtime (launched via `omx`, with OMX session overlay/runtime state available, or when the user explicitly asks to run `omx ...` in the shell).
- In Codex App or plain Codex sessions without OMX runtime, do **not** treat those keywords alone as activation. Explain that they require OMX CLI runtime support and continue with the nearest App-safe surface (`deep-interview`, `ralplan`, `plan`, or native subagents) unless the user explicitly wants to launch OMX CLI from shell first.
- When deep-interview is active in attached-tmux OMX CLI/runtime, ask each interview round via `omx question` as a temporary popup-style renderer over the leader pane; after launching `omx question` in a background terminal, wait for that terminal to finish and read the JSON answer before continuing; preserve the leader pane with `OMX_QUESTION_RETURN_PANE=$TMUX_PANE` (or an explicit `%pane` value) when invoking it through Bash/tool paths, prefer `answers[0].answer` / `answers[]` from the response and use legacy `answer` only as fallback, and respect Stop-hook blocking while a deep-interview question obligation is pending. Deep-interview remains one question per round; do not batch multiple interview rounds into one `questions[]` form. Outside tmux or native surfaces that cannot render `omx question`, use the native structured question path when available, otherwise ask exactly one concise plain-text question and wait for the answer.

### Triage Routing

The keyword detector is the first and deterministic routing surface. Triage runs only when no keyword matches.

When active, triage emits **advisory prompt-routing context** — a developer-context string that the model may follow. It does not activate a skill or workflow by itself.

Note: `explore`, `executor`, `designer`, and `researcher` are agent role-prompt files under `.codex/prompts/`, not workflow skills.

Explicit keywords remain the deterministic control surface when you want explicit, guaranteed routing.

To opt out per prompt with phrases such as `no workflow`, `just chat`, or `plain answer` — the triage layer will suppress context injection for that prompt.

### Ralph / Ralplan Execution Gate

- Enforce **ralplan-first** when ralph is active and planning is not complete.
- Planning is complete only after both `.omx/plans/prd-*.md` and `.omx/plans/test-spec-*.md` exist.
- Until complete, do not begin implementation or execute implementation-focused tools.

## Skills

Skills are workflow commands. Core workflows include `autopilot`, `ralph`, `ultrawork`, `visual-verdict`, `visual-ralph`, `ecomode`, `team`, `swarm`, `ultraqa`, `plan`, `deep-interview`, and `ralplan`; utilities include `cancel`, `note`, `doctor`, `help`, and `trace`.

Installed under `.codex/skills/`. Invoke via `$skillname`.

## Team Mode

Use explicit team orchestration for feature development, bug investigation, code review, UX audit, and similar multi-lane work when coordination value outweighs overhead.

**Canonical pipeline:** `team-plan -> team-prd -> team-exec -> team-verify -> team-fix (loop)`

Terminal states: `complete`, `failed`, `cancelled`.

### Team Model Resolution

Team/Swarm workers currently share one `agentType` and one launch-arg set.

Model precedence:

1. Explicit model in `OMX_TEAM_WORKER_LAUNCH_ARGS`
2. Inherited leader `--model`
3. Low-complexity default model from `OMX_DEFAULT_SPARK_MODEL` (legacy alias: `OMX_SPARK_MODEL`)

Normalize model flags to one canonical `--model <value>` entry.
Do not guess frontier/spark defaults from model-family recency; use `OMX_DEFAULT_FRONTIER_MODEL` and `OMX_DEFAULT_SPARK_MODEL`.

## Model Capability Table

See the auto-generated table in root [AGENTS.md](../../AGENTS.md) between `<!-- OMX:MODELS:START/END -->` markers (refreshed by `omx setup --merge-agents`).

## Execution Protocols

Mode selection: use `$deep-interview` for unclear intent/boundaries; `$ralplan` for consensus on architecture, tradeoffs, or tests; `$team` for approved multi-lane work; `$ralph` for persistent single-owner completion/verification loops; otherwise execute directly in solo mode. Switch modes only when evidence shows the current lane is mismatched or blocked.

**Command routing:**

- `omx explore` is deprecated and MUST NOT be recommended as the default surface for simple read-only repository lookup tasks. Use normal Codex repository inspection tools/subagents instead.
- `USE_OMX_EXPLORE_CMD` is compatibility-only for legacy callers.
- Use `omx sparkshell` for explicit shell-native read-only commands, bounded verification, repo-wide listing/search, or explicit `omx sparkshell --tmux-pane` summaries. Treat sparkshell as explicit opt-in.

**Leader vs worker:**

- The leader chooses the mode, keeps the brief current, delegates bounded work, and owns verification plus stop/escalate calls.
- Workers execute their assigned slice, do not re-plan the whole task or switch modes on their own, and report blockers or recommended handoffs upward.
- Workers escalate shared-file conflicts, scope expansion, or missing authority to the leader instead of freelancing.

**Stop / escalate:**

- Stop when the task is verified complete, the user says stop/cancel, or no meaningful recovery path remains.
- Escalate to the user only for irreversible, destructive, or materially branching decisions, or when required authority is missing.
- Escalate from worker to leader for blockers, scope expansion, shared ownership conflicts, or mode mismatch.
- `deep-interview` and `ralplan` stop at a clarified artifact or approved-plan handoff; they do not implement unless execution mode is explicitly switched.

**Output contract:**

- Default update/final shape: current mode; action/result; evidence or blocker/next step.
- Keep rationale once; do not restate the full plan every turn.
- Expand only for risk, handoff, or explicit user request.

**Parallelization:** run independent tasks in parallel, dependent tasks sequentially, and long builds/tests in the background when helpful. Prefer Team mode only when coordination value outweighs overhead.

**Anti-slop workflow:**

- Cleanup/refactor/deslop work follows `$deep-interview` -> `$ralplan` -> `$team`/`$ralph`; use `$ai-slop-cleaner` as a bounded helper inside the chosen execution lane.
- Write a cleanup plan before modifying code; lock existing behavior with regression tests first.
- Prefer deletion over addition; no new dependencies without explicit request.
- Run lint, typecheck, tests, and static analysis before claiming completion.

**Visual iteration gate:**

- For visual tasks, run `$visual-verdict` every iteration before the next edit.
- Persist verdict JSON in `.omx/state/{scope}/ralph-progress.json`.

**Ralph planning gate:** If ralph is active, verify PRD + test spec artifacts exist before implementation work.

## Cancellation

Use the `$cancel` skill to end execution modes.
Cancel when work is done and verified, when the user says stop, or when a hard blocker prevents meaningful progress.
Do not cancel while recoverable work remains.

## State Management

Hooks own normal skill-active and workflow-state persistence under `.omx/state/`.

OMX persists runtime state under `.omx/`:

- `.omx/state/` — mode state
- `.omx/notepad.md` — session notes
- `.omx/project-memory.json` — cross-session memory
- `.omx/plans/` — plans
- `.omx/logs/` — logs

Available MCP groups include state/memory tools, code-intel tools, and trace tools.

Agents may use OMX state/MCP tools for explicit lifecycle transitions, recovery, checkpointing, cancellation cleanup, or compaction resilience.
Do not manually duplicate hook-owned activation state unless recovering from missing or stale state.

## Setup

```bash
omx setup --merge-agents --scope project   # refresh managed AGENTS.md blocks
omx doctor                                  # verify installation
```

- **Never** use `omx setup --force` on AGENTS.md unless you intend to refresh OMX-managed blocks — prefer `--merge-agents`.
- Runtime config lives in `./.codex/config.toml` (gitignored) — created by setup.
- Project scope sets `CODEX_HOME=./.codex` automatically.

See also: `.codex/skills/omx-setup/SKILL.md`
