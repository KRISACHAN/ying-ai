import type { StoryAttributeDefinition } from "../abstractions/story-definition";

export function createStoryAttributeStorageKey(input: {
  definition: StoryAttributeDefinition;
  scopeRef?: string | undefined;
}): string {
  const { definition, scopeRef } = input;

  if (definition.scope === "story") {
    return definition.key;
  }

  if (definition.scope === "player") {
    return `player:${definition.key}`;
  }

  if (!scopeRef) {
    throw new Error(`Attribute ${definition.key} requires scopeRef for ${definition.scope} scope`);
  }

  return `${definition.scope}:${scopeRef}:${definition.key}`;
}
