# Lore Commit Protocol

Every commit message must follow the Lore protocol: a concise decision record using git-native trailers.

## Format

```
<intent line: why the change was made, not what changed>

<optional concise body: constraints and approach rationale>

Constraint: <external constraint that shaped the decision>
Rejected: <alternative considered> | <reason for rejection>
Confidence: <low|medium|high>
Scope-risk: <narrow|moderate|broad>
Directive: <forward-looking warning for future modifiers>
Tested: <what was verified>
Not-tested: <known gaps in verification>
```

## Rules

- Intent line first; describe why, not what.
- Use trailers only when they add decision context.
- Use `Rejected:` for alternatives future agents should not re-explore.
- Use `Directive:` for warnings, `Constraint:` for external forces, and `Not-tested:` for known verification gaps.
- Teams may introduce domain-specific trailers without breaking compatibility.

## Agent Commit Policy

- Only create commits when requested by the user.
- Never skip hooks, force-push to main, or amend pushed commits unless explicitly requested.
- Do not commit files that likely contain secrets (`.env`, credentials).
