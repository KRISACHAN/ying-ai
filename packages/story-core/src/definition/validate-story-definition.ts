import type { StoryCondition } from "../abstractions/story-condition";
import type { StoryAttributeDefinition, StoryDefinition } from "../abstractions/story-definition";
import type { StoryStateValidationError } from "../abstractions/state-transition-validator";

export interface StoryDefinitionValidationResult {
  valid: boolean;
  errors: StoryStateValidationError[];
}

export function validateStoryDefinition(
  definition: StoryDefinition,
): StoryDefinitionValidationResult {
  const errors: StoryStateValidationError[] = [];
  const add = (code: string, message: string, path?: string) => {
    errors.push(path === undefined ? { code, message } : { code, message, path });
  };

  if (!definition.id.trim()) {
    add("definition.id.empty", "Story id must be non-empty", "id");
  }
  if (!definition.version.trim()) {
    add("definition.version.empty", "Story version must be non-empty", "version");
  }

  if (hasUnsupportedObjectiveIds(definition)) {
    add("definition.objectives.unsupported", "Stage 01 does not support objectiveIds");
  }

  const characterIds = uniqueIds(definition.characters, "characters", add);
  const sceneIds = uniqueIds(definition.scenes, "scenes", add);
  const loreIds = uniqueIds(definition.lore, "lore", add);
  const itemIds = uniqueIds(definition.items, "items", add);
  const clueIds = uniqueIds(definition.clues, "clues", add);
  const eventIds = uniqueIds(definition.events, "events", add);

  if (!sceneIds.has(definition.openingSceneId)) {
    add(
      "definition.openingScene.invalid",
      "openingSceneId must reference a scene",
      "openingSceneId",
    );
  }

  for (const [index, scene] of definition.scenes.entries()) {
    for (const characterId of scene.availableCharacterIds) {
      if (!characterIds.has(characterId)) {
        add(
          "definition.scene.character.invalid",
          `Scene references unknown character ${characterId}`,
          `scenes.${index}`,
        );
      }
    }
    for (const eventId of scene.eventIds ?? []) {
      if (!eventIds.has(eventId)) {
        add(
          "definition.scene.event.invalid",
          `Scene references unknown event ${eventId}`,
          `scenes.${index}`,
        );
      }
    }
    validateConditions(
      scene.entryConditions,
      { sceneIds, itemIds, clueIds, eventIds },
      add,
      `scenes.${index}.entryConditions`,
      definition,
    );
    validateConditions(
      scene.exitConditions,
      { sceneIds, itemIds, clueIds, eventIds },
      add,
      `scenes.${index}.exitConditions`,
      definition,
    );
  }

  for (const [index, lore] of definition.lore.entries()) {
    for (const sceneId of lore.sceneIds ?? []) {
      if (!sceneIds.has(sceneId)) {
        add(
          "definition.lore.scene.invalid",
          `Lore references unknown scene ${sceneId}`,
          `lore.${index}`,
        );
      }
    }
    for (const characterId of lore.characterIds ?? []) {
      if (!characterIds.has(characterId)) {
        add(
          "definition.lore.character.invalid",
          `Lore references unknown character ${characterId}`,
          `lore.${index}`,
        );
      }
    }
  }

  for (const [index, character] of definition.characters.entries()) {
    for (const secret of character.secrets ?? []) {
      if (secret.loreId && !loreIds.has(secret.loreId)) {
        add(
          "definition.character.secret.lore.invalid",
          `Character secret references unknown lore ${secret.loreId}`,
          `characters.${index}.secrets`,
        );
      }
    }
  }

  const attributeKeys = new Set<string>();
  for (const [index, attribute] of definition.attributes.entries()) {
    const duplicateKey = `${attribute.scope}:${attribute.key}`;
    if (attributeKeys.has(duplicateKey)) {
      add(
        "definition.attribute.duplicate",
        `Duplicate attribute ${duplicateKey}`,
        `attributes.${index}`,
      );
    }
    attributeKeys.add(duplicateKey);
    validateAttributeDefinition(attribute, characterIds, add, `attributes.${index}`);
  }

  if (
    definition.relationshipBounds &&
    definition.relationshipBounds.min > definition.relationshipBounds.max
  ) {
    add(
      "definition.relationship.bounds",
      "relationshipBounds.min must be <= max",
      "relationshipBounds",
    );
  }

  return { valid: errors.length === 0, errors };
}

function uniqueIds<T extends { id: string }>(
  values: T[],
  path: string,
  add: (code: string, message: string, path?: string) => void,
): Set<string> {
  const ids = new Set<string>();
  for (const [index, value] of values.entries()) {
    if (!value.id.trim()) {
      add("definition.id.empty", `${path} id must be non-empty`, `${path}.${index}.id`);
      continue;
    }
    if (ids.has(value.id)) {
      add("definition.id.duplicate", `Duplicate id ${value.id} in ${path}`, `${path}.${index}.id`);
    }
    ids.add(value.id);
  }
  return ids;
}

function validateAttributeDefinition(
  attribute: StoryAttributeDefinition,
  characterIds: Set<string>,
  add: (code: string, message: string, path?: string) => void,
  path: string,
): void {
  if (!attribute.key.trim()) {
    add("definition.attribute.key.empty", "Attribute key must be non-empty", `${path}.key`);
  }
  if (attribute.required && attribute.default === undefined) {
    add(
      "definition.attribute.default.required",
      "Required attribute must declare default",
      `${path}.default`,
    );
  }
  if (attribute.scope === "character") {
    for (const characterId of attribute.characterIds ?? []) {
      if (!characterIds.has(characterId)) {
        add(
          "definition.attribute.character.invalid",
          `Attribute references unknown character ${characterId}`,
          path,
        );
      }
    }
  }
  validateAttributeValue(attribute, attribute.default, add, `${path}.default`, true);
}

export function validateAttributeValue(
  attribute: StoryAttributeDefinition,
  value: unknown,
  add: (code: string, message: string, path?: string) => void,
  path: string,
  allowUndefined = false,
): void {
  if (value === undefined) {
    if (!allowUndefined) {
      add("attribute.value.missing", `Attribute ${attribute.key} value is required`, path);
    }
    return;
  }
  if (attribute.type === "boolean" && typeof value !== "boolean") {
    add("attribute.value.type", `Attribute ${attribute.key} must be boolean`, path);
  }
  if (attribute.type === "number") {
    if (typeof value !== "number") {
      add("attribute.value.type", `Attribute ${attribute.key} must be number`, path);
      return;
    }
    if (attribute.min !== undefined && value < attribute.min) {
      add("attribute.value.min", `Attribute ${attribute.key} is below min`, path);
    }
    if (attribute.max !== undefined && value > attribute.max) {
      add("attribute.value.max", `Attribute ${attribute.key} is above max`, path);
    }
  }
  if (attribute.type === "string") {
    if (!Number.isInteger(attribute.maxLength) || (attribute.maxLength ?? 0) <= 0) {
      add(
        "definition.attribute.string.maxLength",
        `String attribute ${attribute.key} must declare maxLength`,
        path,
      );
    }
    if (typeof value !== "string") {
      add("attribute.value.type", `Attribute ${attribute.key} must be string`, path);
      return;
    }
    if (attribute.maxLength !== undefined && value.length > attribute.maxLength) {
      add("attribute.value.maxLength", `Attribute ${attribute.key} exceeds maxLength`, path);
    }
  }
  if (attribute.type === "enum") {
    if (!attribute.enumValues || attribute.enumValues.length === 0) {
      add(
        "definition.attribute.enum.values",
        `Enum attribute ${attribute.key} must declare enumValues`,
        path,
      );
    }
    if (typeof value !== "string") {
      add("attribute.value.type", `Enum attribute ${attribute.key} must be string`, path);
      return;
    }
    if (attribute.enumValues && !attribute.enumValues.includes(value)) {
      add("attribute.value.enum", `Enum attribute ${attribute.key} has unsupported value`, path);
    }
  }
}

function validateConditions(
  conditions: StoryCondition[] | undefined,
  ids: { sceneIds: Set<string>; itemIds: Set<string>; clueIds: Set<string>; eventIds: Set<string> },
  add: (code: string, message: string, path?: string) => void,
  path: string,
  definition: StoryDefinition,
): void {
  for (const [index, condition] of (conditions ?? []).entries()) {
    if (condition.type === "has_clue" && !ids.clueIds.has(condition.clueId)) {
      add(
        "definition.condition.clue.invalid",
        `Condition references unknown clue ${condition.clueId}`,
        `${path}.${index}`,
      );
    }
    if (condition.type === "has_event" && !ids.eventIds.has(condition.eventId)) {
      add(
        "definition.condition.event.invalid",
        `Condition references unknown event ${condition.eventId}`,
        `${path}.${index}`,
      );
    }
    if (condition.type === "has_item" && !ids.itemIds.has(condition.itemId)) {
      add(
        "definition.condition.item.invalid",
        `Condition references unknown item ${condition.itemId}`,
        `${path}.${index}`,
      );
    }
    if (condition.type === "in_scene" && !ids.sceneIds.has(condition.sceneId)) {
      add(
        "definition.condition.scene.invalid",
        `Condition references unknown scene ${condition.sceneId}`,
        `${path}.${index}`,
      );
    }
    if (
      (condition.type === "attr_eq" || condition.type === "attr_gte") &&
      !definition.attributes.some((attribute) => attribute.key === condition.key)
    ) {
      add(
        "definition.condition.attr.invalid",
        `Condition references unknown attribute ${condition.key}`,
        `${path}.${index}`,
      );
    }
    if (condition.type === "attr_eq" || condition.type === "attr_gte") {
      const attribute = resolveConditionAttribute(definition, condition.key, condition.scopeRef);
      if (!attribute) {
        add(
          "definition.condition.attr.scope.invalid",
          `Condition references invalid attribute scope ${condition.key}`,
          `${path}.${index}`,
        );
      } else {
        if (
          (attribute.scope === "character" || attribute.scope === "scene") &&
          !condition.scopeRef
        ) {
          add(
            "definition.condition.attr.scopeRef.missing",
            `Condition attribute ${condition.key} requires scopeRef`,
            `${path}.${index}`,
          );
        }
        if ((attribute.scope === "story" || attribute.scope === "player") && condition.scopeRef) {
          add(
            "definition.condition.attr.scopeRef.unexpected",
            `Condition attribute ${condition.key} does not accept scopeRef`,
            `${path}.${index}`,
          );
        }
        if (condition.type === "attr_gte" && attribute.type !== "number") {
          add(
            "definition.condition.attr.type",
            `attr_gte requires number attribute ${condition.key}`,
            `${path}.${index}`,
          );
        }
      }
    }
  }
}

function hasUnsupportedObjectiveIds(definition: StoryDefinition): boolean {
  return definition.scenes.some((scene) =>
    Object.hasOwn(scene as unknown as Record<string, unknown>, "objectiveIds"),
  );
}

function resolveConditionAttribute(
  definition: StoryDefinition,
  key: string,
  scopeRef: string | undefined,
): StoryAttributeDefinition | null {
  const candidates = definition.attributes.filter((attribute) => attribute.key === key);
  if (candidates.length === 0) {
    return null;
  }
  if (!scopeRef) {
    return (
      candidates.find((attribute) => attribute.scope === "story" || attribute.scope === "player") ??
      candidates[0] ??
      null
    );
  }
  return (
    candidates.find(
      (attribute) =>
        (attribute.scope === "character" &&
          definition.characters.some((character) => character.id === scopeRef)) ||
        (attribute.scope === "scene" && definition.scenes.some((scene) => scene.id === scopeRef)),
    ) ??
    candidates[0] ??
    null
  );
}
