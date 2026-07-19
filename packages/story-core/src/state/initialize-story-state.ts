import type { StoryDefinition } from "../abstractions/story-definition";
import type { StoryState, StoryAttrValue } from "../abstractions/story-state";
import { createStoryAttributeStorageKey } from "./story-attribute-key";

export function initializeStoryState(definition: StoryDefinition, now = new Date()): StoryState {
  const openingScene = definition.scenes.find((scene) => scene.id === definition.openingSceneId);
  if (!openingScene) {
    throw new Error(`Opening scene ${definition.openingSceneId} does not exist`);
  }

  const attrs: Record<string, StoryAttrValue> = {};
  for (const attribute of definition.attributes) {
    if (attribute.default === undefined) {
      continue;
    }

    if (attribute.scope === "character") {
      const characterIds =
        attribute.characterIds ?? definition.characters.map((character) => character.id);
      for (const characterId of characterIds) {
        attrs[createStoryAttributeStorageKey({ definition: attribute, scopeRef: characterId })] =
          attribute.default;
      }
      continue;
    }

    if (attribute.scope === "scene") {
      for (const scene of definition.scenes) {
        attrs[createStoryAttributeStorageKey({ definition: attribute, scopeRef: scene.id })] =
          attribute.default;
      }
      continue;
    }

    attrs[createStoryAttributeStorageKey({ definition: attribute })] = attribute.default;
  }

  const relationships = definition.relationshipsEnabled
    ? Object.fromEntries(definition.characters.map((character) => [character.id, 0]))
    : undefined;

  const base: StoryState = {
    schemaVersion: 1,
    storyId: definition.id,
    definitionVersion: definition.version,
    revision: 0,
    currentSceneId: definition.openingSceneId,
    characters: Object.fromEntries(
      definition.characters.map((character) => [
        character.id,
        {
          alive: true,
          present: openingScene.availableCharacterIds.includes(character.id),
        },
      ]),
    ),
    inventory: [],
    clues: [],
    events: [],
    revealedLoreIds: [],
    attrs,
    updatedAt: now.toISOString(),
  };

  if (relationships) {
    return { ...base, relationships };
  }

  return base;
}
