import type { StoryDefinition, StoryAttributeDefinition } from "../abstractions/story-definition";
import type {
  StateTransitionValidationResult,
  StateTransitionValidator,
  StoryStateValidationError,
} from "../abstractions/state-transition-validator";
import type { StoryState } from "../abstractions/story-state";
import type { StoryStateChange } from "../abstractions/story-state-change";
import { validateAttributeValue } from "../definition/validate-story-definition";
import { applyStoryStateChanges } from "./apply-story-state-changes";
import { evaluateStoryConditions } from "./evaluate-story-condition";
import { resolveAttributeDefinition } from "./resolve-story-attribute-definition";
import { createStoryAttributeStorageKey } from "./story-attribute-key";

export class DefaultStoryTransitionValidator implements StateTransitionValidator {
  async validate(input: {
    definition: StoryDefinition;
    currentState: StoryState;
    changes: StoryStateChange[];
  }): Promise<StateTransitionValidationResult> {
    const errors = validateStoryStateChanges(input);
    if (errors.length > 0) {
      return { valid: false, errors };
    }

    return { valid: true, changes: input.changes };
  }
}

export function validateStoryStateChanges(input: {
  definition: StoryDefinition;
  currentState: StoryState;
  changes: StoryStateChange[];
}): StoryStateValidationError[] {
  const { definition, currentState, changes } = input;
  const errors: StoryStateValidationError[] = [];
  const add = (code: string, message: string, path?: string) => {
    errors.push(path === undefined ? { code, message } : { code, message, path });
  };

  if (
    currentState.storyId !== definition.id ||
    currentState.definitionVersion !== definition.version
  ) {
    add("state.definition.mismatch", "StoryState must match definition id and version");
  }

  detectConflicts(definition, changes, add);

  const sceneIds = new Set(definition.scenes.map((scene) => scene.id));
  const characterIds = new Set(definition.characters.map((character) => character.id));
  const itemIds = new Set(definition.items.map((item) => item.id));
  const clueIds = new Set(definition.clues.map((clue) => clue.id));
  const eventIds = new Set(definition.events.map((event) => event.id));

  for (const [index, change] of changes.entries()) {
    const path = `changes.${index}`;
    switch (change.type) {
      case "set_scene":
        validateSetScene(definition, currentState, change.sceneId, sceneIds, add, path);
        break;
      case "set_character_alive":
        if (!characterIds.has(change.characterId)) {
          add("change.character.invalid", `Unknown character ${change.characterId}`, path);
        }
        break;
      case "set_character_present":
        validateSetCharacterPresent(definition, currentState, change, characterIds, add, path);
        break;
      case "add_inventory_item":
        validateAddId(itemIds, currentState.inventory, change.itemId, "item", add, path);
        break;
      case "remove_inventory_item":
        if (!itemIds.has(change.itemId)) {
          add("change.item.invalid", `Unknown item ${change.itemId}`, path);
        } else if (!currentState.inventory.includes(change.itemId)) {
          add("change.item.missing", `Cannot remove unheld item ${change.itemId}`, path);
        }
        break;
      case "add_clue":
        validateAddId(clueIds, currentState.clues, change.clueId, "clue", add, path);
        break;
      case "add_event":
        validateAddId(eventIds, currentState.events, change.eventId, "event", add, path);
        break;
      case "set_relationship":
        validateRelationship(definition, change.characterId, change.value, characterIds, add, path);
        break;
      case "set_attr":
        validateSetAttribute(definition, change, add, path);
        break;
    }
  }

  if (errors.length > 0) {
    return errors;
  }

  const nextState = applyStoryStateChanges({ definition, currentState, changes });
  validateFinalScenePresence(definition, nextState, add);
  return errors;
}

function validateSetScene(
  definition: StoryDefinition,
  state: StoryState,
  sceneId: string,
  sceneIds: Set<string>,
  add: (code: string, message: string, path?: string) => void,
  path: string,
): void {
  if (!sceneIds.has(sceneId)) {
    add("change.scene.invalid", `Unknown scene ${sceneId}`, path);
    return;
  }

  const currentScene = definition.scenes.find((scene) => scene.id === state.currentSceneId);
  const targetScene = definition.scenes.find((scene) => scene.id === sceneId);
  if (!currentScene || !targetScene) {
    add("change.scene.invalid", "Current or target scene does not exist", path);
    return;
  }
  if (!evaluateStoryConditions({ definition, state, conditions: currentScene.exitConditions })) {
    add("change.scene.exit", `Exit conditions failed for ${currentScene.id}`, path);
  }
  if (!evaluateStoryConditions({ definition, state, conditions: targetScene.entryConditions })) {
    add("change.scene.entry", `Entry conditions failed for ${targetScene.id}`, path);
  }
}

function validateSetCharacterPresent(
  definition: StoryDefinition,
  state: StoryState,
  change: Extract<StoryStateChange, { type: "set_character_present" }>,
  characterIds: Set<string>,
  add: (code: string, message: string, path?: string) => void,
  path: string,
): void {
  if (!characterIds.has(change.characterId)) {
    add("change.character.invalid", `Unknown character ${change.characterId}`, path);
    return;
  }
  const characterState = state.characters[change.characterId];
  if (change.present && characterState?.alive !== true) {
    add(
      "change.character.dead_present",
      `Dead character ${change.characterId} cannot be present`,
      path,
    );
  }
  const currentScene = definition.scenes.find((scene) => scene.id === state.currentSceneId);
  if (change.present && !currentScene?.availableCharacterIds.includes(change.characterId)) {
    add(
      "change.character.unavailable",
      `Character ${change.characterId} is not available in current scene`,
      path,
    );
  }
}

function validateAddId(
  validIds: Set<string>,
  currentIds: string[],
  id: string,
  label: string,
  add: (code: string, message: string, path?: string) => void,
  path: string,
): void {
  if (!validIds.has(id)) {
    add(`change.${label}.invalid`, `Unknown ${label} ${id}`, path);
  } else if (currentIds.includes(id)) {
    add(`change.${label}.duplicate`, `${label} ${id} already exists in state`, path);
  }
}

function validateRelationship(
  definition: StoryDefinition,
  characterId: string,
  value: number,
  characterIds: Set<string>,
  add: (code: string, message: string, path?: string) => void,
  path: string,
): void {
  if (!definition.relationshipsEnabled) {
    add("change.relationship.disabled", "Relationships are not enabled for this story", path);
  }
  if (!characterIds.has(characterId)) {
    add("change.relationship.character.invalid", `Unknown character ${characterId}`, path);
  }
  const bounds = definition.relationshipBounds;
  if (bounds && (value < bounds.min || value > bounds.max)) {
    add(
      "change.relationship.bounds",
      `Relationship value must be between ${bounds.min} and ${bounds.max}`,
      path,
    );
  }
}

function validateSetAttribute(
  definition: StoryDefinition,
  change: Extract<StoryStateChange, { type: "set_attr" }>,
  add: (code: string, message: string, path?: string) => void,
  path: string,
): void {
  const attribute = resolveAttributeDefinition(definition, change.key, change.scopeRef);
  if (!attribute) {
    add(
      "change.attribute.undeclared",
      `Attribute ${change.key} is not declared for this scope`,
      path,
    );
    return;
  }
  if (attribute.writable === false) {
    add("change.attribute.readonly", `Attribute ${change.key} is not writable`, path);
  }
  validateAttributeScopeRef(definition, attribute, change.scopeRef, add, path);
  validateAttributeValue(attribute, change.value, add, `${path}.value`);
}

function validateAttributeScopeRef(
  definition: StoryDefinition,
  attribute: StoryAttributeDefinition,
  scopeRef: string | undefined,
  add: (code: string, message: string, path?: string) => void,
  path: string,
): void {
  if (attribute.scope === "story" || attribute.scope === "player") {
    if (scopeRef !== undefined) {
      add(
        "change.attribute.scopeRef.unexpected",
        `Attribute ${attribute.key} does not accept scopeRef`,
        path,
      );
    }
    return;
  }

  if (!scopeRef) {
    add("change.attribute.scopeRef.missing", `Attribute ${attribute.key} requires scopeRef`, path);
    return;
  }

  if (attribute.scope === "character") {
    const exists = definition.characters.some((character) => character.id === scopeRef);
    if (!exists) {
      add("change.attribute.scopeRef.invalid", `Unknown character scopeRef ${scopeRef}`, path);
    }
    if (attribute.characterIds && !attribute.characterIds.includes(scopeRef)) {
      add(
        "change.attribute.character.restricted",
        `Attribute ${attribute.key} is not declared for ${scopeRef}`,
        path,
      );
    }
  }

  if (attribute.scope === "scene" && !definition.scenes.some((scene) => scene.id === scopeRef)) {
    add("change.attribute.scopeRef.invalid", `Unknown scene scopeRef ${scopeRef}`, path);
  }
}

function validateFinalScenePresence(
  definition: StoryDefinition,
  state: StoryState,
  add: (code: string, message: string, path?: string) => void,
): void {
  const scene = definition.scenes.find((candidate) => candidate.id === state.currentSceneId);
  if (!scene) {
    add("state.scene.invalid", `Unknown current scene ${state.currentSceneId}`);
    return;
  }

  for (const [characterId, characterState] of Object.entries(state.characters)) {
    if (characterState.present && !characterState.alive) {
      add("state.character.dead_present", `Dead character ${characterId} cannot be present`);
    }
    if (characterState.present && !scene.availableCharacterIds.includes(characterId)) {
      add(
        "state.character.scene_mismatch",
        `Present character ${characterId} is unavailable in ${scene.id}`,
      );
    }
  }
}

function detectConflicts(
  definition: StoryDefinition,
  changes: StoryStateChange[],
  add: (code: string, message: string, path?: string) => void,
): void {
  const seen = new Map<string, number>();
  const setSceneCount = changes.filter((change) => change.type === "set_scene").length;
  if (setSceneCount > 1) {
    add("change.conflict.set_scene", "Only one set_scene is allowed per batch");
  }

  for (const [index, change] of changes.entries()) {
    const key = conflictKey(definition, change);
    if (!key) {
      continue;
    }
    const previousIndex = seen.get(key);
    if (previousIndex !== undefined) {
      add(
        "change.conflict.duplicate",
        `Conflicting changes at ${previousIndex} and ${index}`,
        `changes.${index}`,
      );
    }
    seen.set(key, index);
  }
}

function conflictKey(definition: StoryDefinition, change: StoryStateChange): string | null {
  switch (change.type) {
    case "set_scene":
      return null;
    case "set_character_alive":
      return `character_alive:${change.characterId}`;
    case "set_character_present":
      return `character_present:${change.characterId}`;
    case "add_inventory_item":
    case "remove_inventory_item":
      return `inventory:${change.itemId}`;
    case "add_clue":
      return `clue:${change.clueId}`;
    case "add_event":
      return `event:${change.eventId}`;
    case "set_relationship":
      return `relationship:${change.characterId}`;
    case "set_attr": {
      const attribute = resolveAttributeDefinition(definition, change.key, change.scopeRef);
      if (!attribute) {
        return `attr:${change.key}:${change.scopeRef ?? ""}`;
      }
      if ((attribute.scope === "character" || attribute.scope === "scene") && !change.scopeRef) {
        return `attr:${attribute.scope}:${change.key}:missing-scope`;
      }
      return `attr:${createStoryAttributeStorageKey({ definition: attribute, scopeRef: change.scopeRef })}`;
    }
  }
}
