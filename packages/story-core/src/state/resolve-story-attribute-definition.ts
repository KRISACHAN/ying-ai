import type { StoryAttributeDefinition, StoryDefinition } from "../abstractions/story-definition";

export function resolveAttributeDefinition(
  definition: StoryDefinition,
  key: string,
  scopeRef?: string,
): StoryAttributeDefinition | null {
  const candidates = definition.attributes.filter((attribute) => attribute.key === key);
  if (candidates.length === 0) {
    return null;
  }

  if (scopeRef) {
    const characterMatch = candidates.find(
      (attribute) =>
        attribute.scope === "character" &&
        definition.characters.some((character) => character.id === scopeRef),
    );
    if (characterMatch) {
      return characterMatch;
    }
    const sceneMatch = candidates.find(
      (attribute) =>
        attribute.scope === "scene" && definition.scenes.some((scene) => scene.id === scopeRef),
    );
    return sceneMatch ?? candidates[0] ?? null;
  }

  return (
    candidates.find((attribute) => attribute.scope === "story" || attribute.scope === "player") ??
    candidates[0] ??
    null
  );
}
