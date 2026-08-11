# .code-reviews

Root **index** for per-app code review archives in this `ying-ai` monorepo. `ying-ai` hosts multiple independent AI apps ([README.md → Adding a new AI app](../README.md#adding-a-new-ai-app)); each app that accumulates reviews gets its own `.code-reviews/<app-name>/` folder here. All AI tools write initial reviews and follow-up reports into the relevant app folder so later sessions can quickly answer: what was reviewed, what was concluded, and whether follow-up happened.

> **AI read order:** Pick the app archive first (e.g. `.code-reviews/companion/`), read that app's `README.md` for its naming conventions, then pick the release folder (for Companion SDK V1.0, `companion/v1.0/`), match `{n}-{7-char-sha}/` to a commit, open the matching folder, and read `{tool}-review.md` plus `{model}-followup.md`. Full workflows: `.codex/skills/code-review/SKILL.md` and `.codex/skills/code-review-followup/SKILL.md`.

---

## Directory Layout

```txt
.code-reviews/
  README.md              # This file — index across app archives
  companion/              # Companion SDK app archive
    README.md              # Companion-specific naming rules and conventions
    v1.0/ v1.1/ v1.2/ v1.3/ # Release-specific review folders
      {n}-{slug}/           # One review scope → one subfolder
        {tool}-review.md     # Initial review
        {model}-followup.md  # Follow-up (optional)
  <app-name>/             # Future app archives follow the same shape
    README.md
    {version}/
      {n}-{slug}/
```

Each app archive is **self-contained**: its own `README.md` documents that app's release/scope conventions. This root README only indexes _which_ archives exist and routes to them.

---

## App Archives

| App               | Path                       | Entry                                        |
| ----------------- | -------------------------- | -------------------------------------------- |
| **Companion SDK** | [`companion/`](companion/) | [`companion/README.md`](companion/README.md) |

Migration note: `companion/` was moved here from the original standalone `ying-companion` repository (now renamed `ying-ai` on GitHub) — see [`companion/README.md`](companion/README.md) for its full history and conventions. Internal cross-references inside its historical review reports are **not** rewritten (frozen record); only this index and top-level docs (`README.md`, `AGENTS.md`, package/app READMEs) were updated to the new `companion/` path.

---

## Adding Reviews for a New App

1. **Create `.code-reviews/<app-name>/`** the first time you review that app — copy [`companion/README.md`](companion/README.md) as a starting template for naming rules (`{n}-{slug}/` subfolders, `{tool}-review.md` / `{model}-followup.md` files).
2. **Determine `{n}`** by scanning `.code-reviews/<app-name>/` (or its versioned subfolder, if that app also uses release folders like Companion SDK's `v1.0/`, `v1.1/`, …) for folders matching `^\d+-`, then take max + 1.
3. **Keep each app's reviews scoped to that app's folder.** Cross-app conventions belong in [`docs/ai/core/`](../docs/ai/core/) or the root [`AGENTS.md`](../AGENTS.md).
4. **Update the table above** so the new archive is discoverable.
5. Full skill workflow: [`.codex/skills/code-review/SKILL.md`](../.codex/skills/code-review/SKILL.md) (initial review) and [`.codex/skills/code-review-followup/SKILL.md`](../.codex/skills/code-review-followup/SKILL.md) (follow-up).

---

## Related Paths

| Path                                           | Purpose                                                           |
| ---------------------------------------------- | ----------------------------------------------------------------- |
| [`AGENTS.md`](../AGENTS.md)                    | Root AI entry — read path, project snapshot, non-negotiables      |
| [`README.md`](../README.md)                    | Human overview — repo purpose, apps/packages, adding a new app    |
| [`.requirements/`](../.requirements/README.md) | Per-app requirement/planning archives (same shape as this folder) |
| [`docs/ai/core/`](../docs/ai/core/)            | Universal agent operating rules (all apps)                        |
