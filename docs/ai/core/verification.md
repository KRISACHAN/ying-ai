# Verification

Verify before claiming completion.

## Sizing Guidance

- **Small changes:** lightweight verification
- **Standard changes:** standard verification
- **Large or security/architectural changes:** thorough verification

## Verification Loop

1. Define the claim and success criteria.
2. Run the smallest validation that can prove it.
3. Read the output.
4. Report with evidence.

If validation fails, iterate. If validation cannot run, explain why and use the next-best check. Keep evidence summaries concise but sufficient.

## Rules

- Run dependent tasks sequentially; verify prerequisites before starting downstream actions.
- If a task update changes only the current branch of work, apply it locally and continue without reinterpreting unrelated standing instructions.
- For coding work, prefer targeted tests for changed behavior, then typecheck/lint/build/smoke checks when applicable; do not claim completion without fresh evidence or an explicit validation gap.
- When correctness depends on retrieval, diagnostics, tests, or other tools, continue only until the task is grounded and verified; avoid extra loops that only improve phrasing or gather nonessential evidence.

## Before Concluding

Confirm: no pending work, features working, tests passing, zero known errors, verification evidence collected. If not, continue.
