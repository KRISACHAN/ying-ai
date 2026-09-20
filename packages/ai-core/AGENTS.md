# `@ying-ai/ai-core` Engineering Guardrails

This file adds package-local rules to the repository-wide instructions in [`../../AGENTS.md`](../../AGENTS.md). Read [`README.md`](./README.md) (or [`README.zh-CN.md`](./README.zh-CN.md)) before changing this package, then read the stage requirement and past review that govern the affected contract.

## Ownership and boundaries

`ai-core` owns the host-injected Companion SDK contracts, the Core facade and composition defaults, model/tool adapters shipped with Core, and the reference chat workflow. It does not own host configuration, authentication, durable storage, HTTP/NDJSON transport, UI state, or Wire Event serialization.

- Hosts own environment-variable reads, session/history persistence, credentials, transport, and presentation.
- Core events may contain runtime-rich values such as `Date`, `Error`, or provider `raw` data. Convert them to JSON-safe Wire Events outside this package.
- Do not import sibling workspace packages or application code. External capabilities implement contracts from `abstractions/` and are injected by the host.
- Do not add direct database, filesystem, HTTP server/client, Next.js, React, or Ollama dependencies to `src/`.

## Dependency direction

```text
abstractions  <-  implementations
      ^                 ^
      |                 |
      +------ core / factories (composition)
```

- `abstractions/` is the stable contract layer. It may only depend on other abstractions.
- `implementations/` may depend on abstractions and implementation-local helpers, but never on `core/` or `factories/`.
- `core/` and `factories/` are composition boundaries; select defaults there instead of hiding composition in contracts.
- Consumers import from the package root. Treat every addition to `src/index.ts` as a deliberate public-API decision; do not expose an internal helper merely to make a local import convenient.
- `ChatModel` is the workflow-facing model boundary. AI SDK/OpenAI-compatible details belong in model/tool adapter implementations, not workflow contracts.

The executable form of these rules lives in [`scripts/verify-boundaries.mjs`](./scripts/verify-boundaries.mjs) and runs as part of package lint.

## Contract invariants

- Preserve `executeWorkflow()` and `streamWorkflow()` public compatibility unless an approved requirement explicitly changes it.
- Input/output Safety rejection terminates the workflow; never fabricate a reply or release model text that has not passed output Safety.
- Preserve the documented critical-versus-degraded failure semantics for Persona, Memory, Summary, Emotion, Tool, Observer, and write-back steps.
- The host owns chat history; Core consumes the supplied history and must not silently create host persistence.
- Provider identity uses stable `meta.id`, not constructor names.
- Keep `execute()` and `stream()` behavior aligned through shared step helpers where the contract is the same; do not implement one public path by consuming the other.

## Design and comments

- Add a Provider/Adapter only for a real replaceable external capability. Use Strategy only for genuine algorithm variation, and use the existing Tool Registry as the plugin boundary for independently registered tools.
- Prefer the current explicit workflow steps and small behavior-preserving changes over new managers, registries, or generic factories.
- Follow the package's existing Chinese code-comment convention. Comments should preserve purpose, boundary, invariant, ordering, failure semantics, or compatibility rationale; do not narrate syntax or add comment quotas.
- When a public contract, workflow lifecycle, or non-obvious failure rule changes, update its comment and both READMEs in the same change.

## Documentation roles

- `README.md` and `README.zh-CN.md`: current package architecture, public usage, defaults, and call flow; keep the two versions synchronized.
- `.requirements/companion/`: approved product and stage contracts. Do not rewrite historical requirements merely to match current code.
- `.code-reviews/companion/`: review evidence and follow-up history, not the current architecture source of truth.
- This file: durable modification rules and verification routing; do not duplicate the full README here.

## Verification matrix

| Change scope                                            | Required fresh checks                                                                                                       |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Guardrail/docs only                                     | `pnpm --filter @ying-ai/ai-core lint` and focused Prettier check for changed files                                          |
| Contracts, exports, composition, or internal TypeScript | `pnpm --filter @ying-ai/ai-core typecheck`, `lint`, and `build`                                                             |
| Memory extraction                                       | The checks above plus `pnpm --filter @ying-ai/ai-core verify:memory-extractor`                                              |
| Workflow/runtime behavior                               | The package checks above plus the focused verification/manual acceptance named by the governing stage spec or consuming app |

This package currently has no general unit-test script. Typecheck, lint, build, and the memory-extractor verification do not by themselves prove end-to-end chat behavior; report that boundary explicitly.
