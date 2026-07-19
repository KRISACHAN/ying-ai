import type { StoryState } from "../abstractions/story-state";
import type { StoryStateChange } from "../abstractions/story-state-change";
import type { StoryDefinition } from "../abstractions/story-definition";
import { createStoryAttributeStorageKey } from "./story-attribute-key";
import { resolveAttributeDefinition } from "./resolve-story-attribute-definition";

export function applyStoryStateChanges(input: {
  definition: StoryDefinition;
  currentState: StoryState;
  changes: StoryStateChange[];
  now?: Date;
}): StoryState {
  const nextState = cloneState(input.currentState);

  for (const change of input.changes) {
    switch (change.type) {
      case "set_scene":
        nextState.currentSceneId = change.sceneId;
        break;
      case "set_character_alive":
        nextState.characters[change.characterId] = {
          ...requireCharacter(nextState, change.characterId),
          alive: change.alive,
        };
        break;
      case "set_character_present":
        nextState.characters[change.characterId] = {
          ...requireCharacter(nextState, change.characterId),
          present: change.present,
        };
        break;
      case "add_inventory_item":
        nextState.inventory = [...nextState.inventory, change.itemId];
        break;
      case "remove_inventory_item":
        nextState.inventory = nextState.inventory.filter((itemId) => itemId !== change.itemId);
        break;
      case "add_clue":
        nextState.clues = [...nextState.clues, change.clueId];
        break;
      case "add_event":
        nextState.events = [...nextState.events, change.eventId];
        break;
      case "add_revealed_lore":
        nextState.revealedLoreIds = [...(nextState.revealedLoreIds ?? []), change.loreId];
        break;
      case "set_relationship":
        nextState.relationships = {
          ...(nextState.relationships ?? {}),
          [change.characterId]: change.value,
        };
        break;
      case "set_attr": {
        const definition = resolveAttributeDefinition(
          input.definition,
          change.key,
          change.scopeRef,
        );
        if (!definition) {
          throw new Error(`Attribute ${change.key} does not exist`);
        }
        const storageKey = createStoryAttributeStorageKey({
          definition,
          scopeRef: change.scopeRef,
        });
        nextState.attrs = { ...nextState.attrs, [storageKey]: change.value };
        break;
      }
    }
  }

  nextState.updatedAt = (input.now ?? new Date()).toISOString();
  return nextState;
}

function cloneState(state: StoryState): StoryState {
  const next: StoryState = {
    ...state,
    characters: Object.fromEntries(
      Object.entries(state.characters).map(([characterId, character]) => [
        characterId,
        { ...character },
      ]),
    ),
    inventory: [...state.inventory],
    clues: [...state.clues],
    events: [...state.events],
    revealedLoreIds: [...(state.revealedLoreIds ?? [])],
    attrs: { ...state.attrs },
  };

  if (state.relationships) {
    next.relationships = { ...state.relationships };
  }

  return next;
}

function requireCharacter(state: StoryState, characterId: string) {
  const character = state.characters[characterId];
  if (!character) {
    throw new Error(`Character ${characterId} does not exist in state`);
  }
  return character;
}
