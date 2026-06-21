# .code-reviews

Root archive for **ying-companion code reviews**. All AI tools write initial reviews and follow-up reports here so later sessions can quickly answer: what was reviewed, what was concluded, and whether follow-up happened.

> **AI read order:** Pick the relevant release folder first (for V1.0, `.code-reviews/v1.0/`), then match `{n}-{7-char-sha}/` to a commit, open the matching folder, and read `{tool}-review.md` plus `{model}-followup.md`. Full workflows: `.codex/skills/code-review/SKILL.md` and `.codex/skills/code-review-followup/SKILL.md`.

---

## Directory Layout

```txt
.code-reviews/
  README.md                 # This file: naming rules and conventions
  v1.0/                     # Release-specific review archive
    {n}-{slug}/             # One review scope → one subfolder
      {tool}-review.md      # Initial review (from code-review skill)
      {model}-followup.md   # Follow-up (from code-review-followup skill, optional)
```

- **One release → one archive folder.** V1.0 reviews live under `v1.0/`; future releases should get their own top-level version folder.
- **One scope → one subfolder inside that release.** Different AI tools under the same scope write separate files without overwriting.
- **`{n}`** is an incrementing sequence number for ordering and identity only — **not** a git-history ordinal beyond that.
- A subfolder may contain multiple `{tool}-review.md` files (e.g. Cursor and Codex each review once) and multiple `{model}-followup.md` files (follow-ups from different models/tools).

---

## Subfolder Naming: `{n}-{slug}`

| Part     | Rule                                                                                                                               |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `{n}`    | Scan the target release folder (for example `.code-reviews/v1.0/`) for folders matching `^\d+-`, take max+1; start at `0` if empty |
| `{slug}` | See table below                                                                                                                    |

| Scope type                                                    | `{slug}` rule                           | Example                      |
| ------------------------------------------------------------- | --------------------------------------- | ---------------------------- |
| User-specified commit, short SHA, or **HEAD / latest commit** | First **7 lowercase chars** of full SHA | `63288da` → `0-63288da`      |
| Staged / unstaged / path scope (no commit context)            | kebab-case scope hint (≤40 chars)       | `staged`, `packages-ai-core` |

**Commit scopes must use `{n}-{7-char-sha}` format inside the release folder.** Resolve slug with `git rev-parse <commit>` for the full SHA, then take the first 7 characters.

---

## File Naming

### Initial review: `{tool}-review.md`

| Part     | Rule                                         |
| -------- | -------------------------------------------- |
| `{tool}` | AI tool identifier, **lowercase kebab-case** |
| Suffix   | Fixed `-review.md`                           |

| Tool        | `{tool}`                    | Display name in report |
| ----------- | --------------------------- | ---------------------- |
| Cursor      | `cursor`                    | Cursor                 |
| Codex / OMX | `codex`                     | Codex                  |
| Claude Code | `claude`                    | Claude Code            |
| Antigravity | `antigravity`               | Antigravity            |
| Other       | Platform name in kebab-case | Readable display name  |

**Dual source attribution:** filename identifies the tool; report metadata must include **Review Tool** (and **Model** when known).

### Follow-up: `{model}-followup.md`

| Part      | Rule                                                                                           |
| --------- | ---------------------------------------------------------------------------------------------- |
| `{model}` | Identifier of the model/tool that **produced this follow-up** (not the original review author) |
| Suffix    | Fixed `-followup.md`                                                                           |

- Lowercase kebab-case: `codex`, `cursor`, `claude`, `gpt-5.5`, etc.
- Use tool name when only the tool is known; use model name when exact identification is required.
- Filename must match the follow-up source in the report body.
- Follow-up **must** live in the same versioned `{n}-{slug}/` directory as the referenced review.

---

## Report Metadata (Initial Review)

Each `{tool}-review.md` should start with:

```markdown
**Date:** {YYYY-MM-DD}
**Review Tool:** {Cursor | Codex | …}
**Model:** {current model name; omit if unknown}
**Review Scope:** {commit / staged / unstaged / paths}
**Reference:** {commit SHA, git commands}
**Verdict:** {Approve | Advisory | Changes Required}
```

## Report Metadata (Follow-Up)

Each `{model}-followup.md` should start with:

```markdown
**Date:** {YYYY-MM-DD}
**Review Tool:** {Codex | Cursor | …}
**Model:** {current model name; omit if unknown}
**Review Scope:** `{review-path}` and current implementation
**Reference:** `{review-path}`
**Verdict:** {Approve | Advisory | Changes Required}
```

Follow-up reports also use four **Follow-Up Conclusions** categories: Accepted and Fixed / Not Valid / Retained Concern / Unaddressed.

---

## Verdict Semantics

| Verdict              | Meaning                                                        |
| -------------------- | -------------------------------------------------------------- |
| **Changes Required** | Blocking items or unaddressed Critical/High findings           |
| **Advisory**         | Blockers resolved; non-blocking WATCH or deferred items remain |
| **Approve**          | All findings fixed or fully rebutted; verification passed      |

Initial reviews synthesize via OMX dual-lane (code-reviewer + architect). Follow-ups verify each finding against current code and do not defer blindly to the original review.

---

## Typical Workflow

```txt
1. code-review skill
   → determine release + scope → dual-lane review → write {version}/{n}-{slug}/{tool}-review.md

2. code-review-followup skill (optional, when requested)
   → read {tool}-review.md → verify/fix findings → write {model}-followup.md in the same versioned folder
```

Multiple rounds per scope are allowed — e.g. `cursor-review.md` → `codex-followup.md` → later `cursor-followup.md` for a second check.

---

## Related Skills

| Skill                  | Path                                                                                            | Responsibility                                         |
| ---------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `code-review`          | [`.codex/skills/code-review/SKILL.md`](../.codex/skills/code-review/SKILL.md)                   | Initial review; produces `{tool}-review.md`            |
| `code-review-followup` | [`.codex/skills/code-review-followup/SKILL.md`](../.codex/skills/code-review-followup/SKILL.md) | Follow-up verification; produces `{model}-followup.md` |

---

## AI Quick Lookup

**"Was this V1.0 commit reviewed?"** → Check `.code-reviews/v1.0/{n}-{7-char-sha}/`; read **Verdict** and **Findings** in `cursor-review.md` / `codex-review.md`.

**"Were review findings fixed?"** → Read `{model}-followup.md` in the same folder: **Follow-Up Conclusions** (Accepted and Fixed / Not Valid / Retained Concern / Unaddressed) and **Verification**.

**"What did a past review say?"** → List `.code-reviews/v1.0/*/` subfolders (highest `{n}` or matching `{7-char-sha}`), then read **Summary** and **Architecture Concerns** in `{tool}-review.md`.

**"Where does a new review go?"** → Create `{version}/{n}-{slug}/` per naming rules and write `{tool}-review.md`.
