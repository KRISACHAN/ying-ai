---
name: context-memory
description: Capture, distill, and persist useful context from the current conversation into a user-specified Markdown file or folder, defaulting to .memory in the current repository. Use when the user asks to summarize context, save preferences, record prohibitions, preserve decisions, create AI-readable memory, update .memory, or maintain cross-agent project memory for future AI tools.
---

# Context Memory

## Goal

Turn conversation context into durable, AI-readable Markdown under `.memory/` or another user-specified location. Preserve only reusable information: preferences, prohibitions, decisions, conventions, constraints, glossary, recurring workflows, and open questions.

## Workflow

1. Identify the target path:
   - Use the user-specified file or folder when provided.
   - If only a folder is specified, choose a clear filename such as `preferences.md`, `project-context.md`, `decisions.md`, or `workflow.md`.
   - If no target is specified, default to `.memory/context.md`.
2. Inspect existing target content before editing when the file exists.
3. Extract durable facts from the available conversation:
   - Include stable user preferences and explicit prohibitions.
   - Include project decisions, accepted conventions, and recurring workflow rules.
   - Include unresolved questions only when they affect future work.
   - Exclude transient chatter, tool logs, timestamps unless meaningful, and one-off implementation details.
4. Merge with existing memory:
   - Deduplicate equivalent entries.
   - Prefer newer explicit user instructions over older conflicting entries.
   - Keep contradictions visible when the conflict is unresolved.
   - Preserve hand-written nuance instead of flattening it into vague rules.
5. Write concise Markdown that other AI tools can read without special tooling.
6. Create the target folder/file directly with the file-editing capability available in the current AI tool. Do not require Python, shell scripts, package installs, or tool-specific runtimes.
7. Report the changed file path and the categories captured.

## Output Shape

Use this structure unless the existing file has a better established format:

```markdown
# <Topic>

## Preferences

- ...

## Prohibitions

- ...

## Decisions

- ...

## Workflows

- ...

## Open Questions

- ...
```

Omit empty sections. Keep bullets concrete and source-grounded. Prefer "User prefers..." and "Do not..." statements over abstract summaries.

## Safety Rules

- Do not invent preferences from weak signals.
- Do not store secrets, tokens, private credentials, or sensitive personal data.
- Do not rewrite unrelated `.memory` files.
- Ask one concise question only when the target path cannot be inferred and writing to the default `.memory/context.md` would be materially wrong.
- Treat `.memory` as shared cross-agent source material, so optimize for clarity over Codex-specific behavior.
- Keep the skill self-contained and dependency-free; the memory format is plain Markdown only.
