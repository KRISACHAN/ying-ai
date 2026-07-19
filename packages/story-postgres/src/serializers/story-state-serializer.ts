import type { StoryDefinition, StoryState } from "@ying-companion/story-core";
import { DefaultStoryTransitionValidator } from "@ying-companion/story-core";

const validator = new DefaultStoryTransitionValidator();

export function serializeStoryState(state: StoryState): unknown {
  assertStoryStateShape(state);
  return JSON.parse(JSON.stringify(state)) as unknown;
}

export async function deserializeStoryState(
  value: unknown,
  definition: StoryDefinition,
): Promise<StoryState> {
  const state = JSON.parse(JSON.stringify(value)) as StoryState;
  assertStoryStateShape(state);
  if (!Array.isArray(state.revealedLoreIds)) {
    state.revealedLoreIds = [];
  }
  const validation = await validator.validate({
    definition,
    currentState: state,
    changes: [],
  });
  if (!validation.valid) {
    throw new Error(
      `Persisted story state is invalid: ${validation.errors
        .map((error) => error.message)
        .join("; ")}`,
    );
  }
  return state;
}

function assertStoryStateShape(state: StoryState): void {
  if (state.schemaVersion !== 1) {
    throw new Error(`Unsupported StoryState schemaVersion ${String(state.schemaVersion)}`);
  }
  if (!Number.isInteger(state.revision) || state.revision < 0) {
    throw new Error("StoryState revision must be a non-negative integer");
  }
}
