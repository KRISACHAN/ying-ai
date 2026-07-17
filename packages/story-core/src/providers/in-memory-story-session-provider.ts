import type { StoryProvider } from "../abstractions/story-provider";
import type { StorySession, StorySessionProvider } from "../abstractions/story-session";
import type { StoryStateProvider } from "../abstractions/story-state-provider";
import { validateStoryDefinition } from "../definition/validate-story-definition";
import { initializeStoryState } from "../state/initialize-story-state";
import { cloneDefinition } from "./in-memory-story-provider";

export interface InMemoryStorySessionProviderOptions {
  storyProvider: StoryProvider;
  stateProvider: StoryStateProvider;
  idFactory?: () => string;
  now?: () => Date;
}

export class InMemoryStorySessionProvider implements StorySessionProvider {
  private readonly storyProvider: StoryProvider;
  private readonly stateProvider: StoryStateProvider;
  private readonly idFactory: () => string;
  private readonly now: () => Date;
  private readonly sessions = new Map<string, StorySession>();

  constructor(options: InMemoryStorySessionProviderOptions) {
    this.storyProvider = options.storyProvider;
    this.stateProvider = options.stateProvider;
    this.idFactory = options.idFactory ?? (() => `story-session-${crypto.randomUUID()}`);
    this.now = options.now ?? (() => new Date());
  }

  async createSession(input: { storyId: string }): Promise<StorySession> {
    const definition = await this.storyProvider.getDefinition(input.storyId);
    if (!definition) {
      throw new Error(`Story definition ${input.storyId} does not exist`);
    }

    const validation = validateStoryDefinition(definition);
    if (!validation.valid) {
      throw new Error(
        `Story definition is invalid: ${validation.errors.map((error) => error.message).join("; ")}`,
      );
    }

    const now = this.now().toISOString();
    const session: StorySession = {
      id: this.idFactory(),
      storyId: definition.id,
      definitionSnapshot: cloneDefinition(definition),
      definitionVersion: definition.version,
      createdAt: now,
      updatedAt: now,
    };

    this.sessions.set(session.id, cloneSession(session));
    await this.stateProvider.saveState(
      session.id,
      initializeStoryState(session.definitionSnapshot, this.now()),
    );
    return cloneSession(session);
  }

  async getSession(sessionId: string): Promise<StorySession | null> {
    const session = this.sessions.get(sessionId);
    return session ? cloneSession(session) : null;
  }
}

function cloneSession(session: StorySession): StorySession {
  return JSON.parse(JSON.stringify(session)) as StorySession;
}
