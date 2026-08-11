# @ying-ai/story-core

**English** | [简体中文](./README.zh-CN.md)

`@ying-ai/story-core` is the standalone story-domain SDK for V1.3 Story Mode. It reuses `@ying-ai/ai-core`’s shared model and Safety abstractions, but does not modify the Companion Chat main path and does not depend on a database, environment variables, or Demo UI.

## Boundaries

- The Core package does not read `process.env`.
- Story State is never written into Companion Memory.
- Planner only outputs a structured `StoryTurnPlan`; Renderer only renders text.
- State may only be committed atomically via `StoryStateChange` values that pass `StateTransitionValidator`.
- Dynamic fields must be declared in `StoryDefinition.attributes` before they can be written to `StoryState.attrs`.

## Workflow

`DefaultStoryWorkflow.execute()` and `stream()` share the same steps:

```txt
guardInput
→ load StorySession.definitionSnapshot
→ load StoryState
→ check clientTurnId committed idempotency
→ load Summary + recent messages
→ recall Lore
→ inject automatic add_revealed_lore candidates
→ story:context-ready
→ Planner.plan
→ validate candidate changes
→ apply changes in memory
→ Renderer.render / Renderer.stream
→ guardOutput
→ StoryTurnCommitter.commitSuccessfulTurn
→ update Summary
```

The success path no longer calls `StoryStateProvider.saveState()`; State, Turn, and Messages can only be committed once via `StoryTurnCommitter`. Every successful committed turn advances `StoryState.revision + 1`, including in-scene refusals with no `stateChanges`. Whether world business state actually changed is distinguished by `stateChanged`, not inferred from revision.

`DefaultStoryWorkflow` auto-creates in-memory Turn / Message / Committer only for `InMemoryStoryStateProvider`. When the Host injects a persisted state provider, it must also inject `turnRepository`, `messageProvider`, and `committer`, so State and Turn/Message do not land in different stores.

A repeated `clientTurnId` that hits an already committed turn does not advance revision again and does not call Lore / Planner / Validator / Renderer, Summary, or Committer again. `StoryWorkflowResult` and `story:committed` explicitly return `idempotentReplay`; replay events also carry canonical assistant text so the host can stably restore the original reply. V1.3 does not persist turn-level state snapshots, so replay results’ `previousState` / `nextState` are the current latest state and are marked `stateSnapshotStatus: "current_latest"`; normal new commits use `stateSnapshotStatus: "turn_snapshot"`.

### Model Planner / Renderer

`ModelStoryPlanner` uses model structured output to produce a `StoryTurnPlan`. Inputs include raw player input, the Session’s frozen Definition public projection, current State, Narrative Summary, recent messages, and recalled Lore. The public projection never includes full `lore`, character `privateBackground`, or `secrets`; Lore can only enter Planner through `recalledLore` activation, budget, and visibility results. Before returning, the plan is validated again with `storyTurnPlanSchema`, and `interpretedAction.raw` is forced back to the real player input.

`ModelStoryRenderer` only consumes a validated Plan, currentState / nextState, and visible context. When the model declares streaming support it uses `ChatModel.stream()`; otherwise it falls back to `generate()` and emits a single text chunk. The Host creates and injects the model; Core does not read env vars. `FakeStoryPlanner` / `FakeStoryRenderer` are for offline contract verification and are not the default narrative implementation for an interactive host.

## Events

Story Core Events belong to this package and are not stuffed into Companion stream events:

```txt
story:start
story:session-loaded
story:state-loaded
story:summary-loaded
story:lore-recalled
story:context-ready
story:plan-started
story:plan-completed
story:validation-failed
story:state-prepared
story:render-started
story:text-delta
story:render-completed
story:committed
story:summary-updated
story:finish
story:error
```

Events keep Core semantics: `Date`, rich objects, and error objects are allowed. Stage 03’s Demo Wire layer performs the network-safe mapping. `appliedChanges` on `story:state-prepared` are in-memory candidate changes accepted by the validator; the world only advances after `story:committed`.

## Seeds

Shared seed definitions are exported from the package root:

```ts
import { fogHarborMystery, minimalWuxiaContract } from "@ying-ai/story-core";
```

Demo Story Workbench and contract verification share these definitions, proving one Runtime / Attribute Renderer can consume two different `StoryDefinition.attributes` sets — 「雾港疑云」 and the minimal wuxia contract.

## Lore

`KeywordLoreProvider` supports:

- `always`
- `keyword`
- `state`
- `keyword_and_state`
- scene / character filtering
- priority sorting
- simple budget truncation
- secret lore visibility

Recall results use `RecalledLoreEntry`, distinguishing `planner_only` and `planner_and_renderer`. Renderer only receives `planner_and_renderer`. `StoryState.revealedLoreIds` is a fixed Core State field and must be persisted only after an `add_revealed_lore` change passes validation; it must not be faked via `attrs`.

## Summary

Narrative Summary is compressed early-plot memory; it does not replace `StoryState` or `StoryDefinition`. Summary updates happen after a Turn commits successfully; Summary failure does not roll back the committed Turn — the next turn continues with the old Summary and recent messages.

## Verification

```bash
pnpm --filter @ying-ai/story-core typecheck
pnpm --filter @ying-ai/story-core build
pnpm --filter @ying-ai/story-core lint
pnpm --filter @ying-ai/story-core verify:story-contract
pnpm --filter @ying-ai/story-core verify:story-workflow
```

`verify:story-workflow` is fully offline and covers event order, text delta, clientTurnId canonical replay with zero model calls, failure without state pollution, Summary failure without rollback, secret lore visibility, and revision semantics.
