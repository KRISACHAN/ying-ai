import type { StoryCondition } from "../abstractions/story-condition";
import type { StoryDefinition, StoryAttributeDefinition } from "../abstractions/story-definition";
import type { StoryState } from "../abstractions/story-state";
import { createStoryAttributeStorageKey } from "./story-attribute-key";

export function evaluateStoryConditions(input: {
  definition: StoryDefinition;
  state: StoryState;
  conditions?: StoryCondition[] | undefined;
}): boolean {
  return (input.conditions ?? [{ type: "always" }]).every((condition) =>
    evaluateStoryCondition({ ...input, condition }),
  );
}

export function evaluateStoryCondition(input: {
  definition: StoryDefinition;
  state: StoryState;
  condition: StoryCondition;
}): boolean {
  const { definition, state, condition } = input;

  switch (condition.type) {
    case "always":
      return true;
    case "has_clue":
      return state.clues.includes(condition.clueId);
    case "has_event":
      return state.events.includes(condition.eventId);
    case "has_item":
      return state.inventory.includes(condition.itemId);
    case "in_scene":
      return state.currentSceneId === condition.sceneId;
    case "attr_gte": {
      const attr = findAttribute(definition, condition.key, condition.scopeRef);
      if (!attr || attr.type !== "number") {
        return false;
      }
      const value =
        state.attrs[
          createStoryAttributeStorageKey({ definition: attr, scopeRef: condition.scopeRef })
        ];
      return typeof value === "number" && value >= condition.value;
    }
    case "attr_eq": {
      const attr = findAttribute(definition, condition.key, condition.scopeRef);
      if (!attr) {
        return false;
      }
      const value =
        state.attrs[
          createStoryAttributeStorageKey({ definition: attr, scopeRef: condition.scopeRef })
        ];
      return value === condition.value;
    }
  }
}

function findAttribute(
  definition: StoryDefinition,
  key: string,
  scopeRef: string | undefined,
): StoryAttributeDefinition | null {
  const candidates = definition.attributes.filter((attribute) => attribute.key === key);
  if (candidates.length === 1) {
    return candidates[0] ?? null;
  }

  if (!scopeRef) {
    return (
      candidates.find((attribute) => attribute.scope === "story" || attribute.scope === "player") ??
      null
    );
  }

  return (
    candidates.find(
      (attribute) =>
        (attribute.scope === "character" &&
          definition.characters.some((character) => character.id === scopeRef)) ||
        (attribute.scope === "scene" && definition.scenes.some((scene) => scene.id === scopeRef)),
    ) ?? null
  );
}
