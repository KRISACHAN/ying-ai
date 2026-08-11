# .requirements

Root **index** for per-app requirement and planning archives in this `ying-ai` monorepo. `ying-ai` hosts multiple independent AI apps ([README.md → Adding a new AI app](../README.md#adding-a-new-ai-app)); any app that benefits from staged, trackable specs gets its own `.requirements/<app-name>/` folder here.

> **AI entry:** [AGENTS.md](../AGENTS.md) — start there, then use this README to find the right app archive → that app's own `README.md` for layout/conventions → its `prompts/` for planning context → its `stages/{version}/stage-{NN}/` for the task doc to implement against. Requirement **content is Chinese**; index READMEs are English for agent readability.

---

## Directory Layout

```txt
.requirements/
  README.md            # This file — index across app archives
  companion/           # Companion SDK app (chat + Persona + memory + tools + Story Mode)
    README.md           # Companion-specific layout, conventions, read order
    prompts/             # Planning prompt chain
    stages/              # Versioned executable stage specs (v1.0 – v1.3)
  <app-name>/           # Future app archives follow the same shape
    README.md
    prompts/
    stages/
```

Each app archive is **self-contained**: its own `README.md` documents that app's `prompts/` → `stages/{version}/` conventions, versioning scheme, and read order. This root README only indexes _which_ archives exist and routes to them — it does not duplicate any app's internal conventions.

---

## App Archives

| App               | Path                       | Status                              | Entry                                        |
| ----------------- | -------------------------- | ----------------------------------- | -------------------------------------------- |
| **Companion SDK** | [`companion/`](companion/) | V1.0–V1.3 complete (frozen history) | [`companion/README.md`](companion/README.md) |

Migration note: `companion/` was moved here from the original standalone `ying-companion` repository (now renamed `ying-ai` on GitHub) — see [`companion/README.md`](companion/README.md) for its full history and conventions. Internal cross-references inside its historical `prompts/`/`stages/` documents are **not** rewritten (frozen record); only this index and top-level docs (`README.md`, `AGENTS.md`, `docs/ai/core/project-context.md`, package READMEs) were updated to the new `companion/` path.

---

## Adding Requirements for a New App

1. **Decide if you need this at all.** Small or single-shot apps can skip `.requirements/` entirely — a good `apps/<app-name>/README.md` is enough. Use a staged archive only when the app has multi-stage rollout, acceptance criteria worth tracking, or a history worth preserving (like the Companion SDK).
2. **Create `.requirements/<app-name>/`** with its own `README.md`, `prompts/`, and `stages/` — reuse the [`companion/`](companion/) layout as a template (numbered prompts for planning, `stages/{version}/stage-{NN}/{NN}-{topic}.md` for executable specs, `-patch.md` for amendments).
3. **Keep it scoped to that app.** Cross-app conventions belong in [`docs/ai/core/`](../docs/ai/core/) (universal agent rules) or the root [`AGENTS.md`](../AGENTS.md) — not duplicated into each app archive.
4. **Update the table above** and the relevant sections in [`AGENTS.md`](../AGENTS.md) and root [`README.md`](../README.md) so the new archive is discoverable.
5. **Requirement content stays Chinese**, structured markdown, per each app's own conventions.

---

## Related Paths

| Path                                           | Purpose                                                        |
| ---------------------------------------------- | -------------------------------------------------------------- |
| [`AGENTS.md`](../AGENTS.md)                    | Root AI entry — read path, project snapshot, non-negotiables   |
| [`README.md`](../README.md)                    | Human overview — repo purpose, apps/packages, adding a new app |
| [`docs/ai/core/`](../docs/ai/core/)            | Universal agent operating rules (all apps)                     |
| [`.code-reviews/`](../.code-reviews/README.md) | Code review archive tied to commits/stages                     |
