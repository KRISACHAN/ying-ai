# AI Tooling Memory

## Preferences

- User wants durable development preferences, prohibitions, and reusable conversation context summarized into Markdown files under `.memory/` so all AI tools can read them.
- User wants the context-memory workflow to be dependency-free and system-agnostic: create or update plain Markdown files directly, without requiring Python, scripts, package installs, or a specific runtime.

## Decisions

- Use the `context-memory` Codex skill to capture current conversation context into a user-specified `.memory` file or folder, defaulting to `.memory/context.md` when no target is provided.
