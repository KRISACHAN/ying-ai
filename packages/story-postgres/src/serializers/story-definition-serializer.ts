import type { StoryDefinition } from "@ying-ai/story-core";
import { validateStoryDefinition } from "@ying-ai/story-core";

export function serializeStoryDefinition(definition: StoryDefinition): unknown {
  const validation = validateStoryDefinition(definition);
  if (!validation.valid) {
    throw new Error(
      `Story definition is invalid: ${validation.errors.map((error) => error.message).join("; ")}`,
    );
  }
  return JSON.parse(JSON.stringify(definition)) as unknown;
}

export function deserializeStoryDefinition(value: unknown): StoryDefinition {
  const definition = JSON.parse(JSON.stringify(value)) as StoryDefinition;
  const validation = validateStoryDefinition(definition);
  if (!validation.valid) {
    throw new Error(
      `Persisted story definition is invalid: ${validation.errors
        .map((error) => error.message)
        .join("; ")}`,
    );
  }
  return definition;
}
