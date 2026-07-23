import type { StoryCatalog, StoryCatalogEntry } from "../abstractions/story-catalog";
import type { StoryDefinition } from "../abstractions/story-definition";
import type { StoryProvider } from "../abstractions/story-provider";

export class InMemoryStoryProvider implements StoryProvider, StoryCatalog {
  private readonly definitions = new Map<string, StoryDefinition>();

  constructor(definitions: StoryDefinition[] = []) {
    for (const definition of definitions) {
      this.definitions.set(definition.id, cloneDefinition(definition));
    }
  }

  async getDefinition(storyId: string): Promise<StoryDefinition | null> {
    const definition = this.definitions.get(storyId);
    return definition ? cloneDefinition(definition) : null;
  }

  async listDefinitions(): Promise<StoryCatalogEntry[]> {
    return [...this.definitions.values()].map((definition) => ({
      id: definition.id,
      version: definition.version,
      title: definition.title,
      description: definition.description,
    }));
  }

  registerDefinition(definition: StoryDefinition): void {
    this.definitions.set(definition.id, cloneDefinition(definition));
  }
}

export function cloneDefinition(definition: StoryDefinition): StoryDefinition {
  return JSON.parse(JSON.stringify(definition)) as StoryDefinition;
}
