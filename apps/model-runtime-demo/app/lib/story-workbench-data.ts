import type {
  CommittedStoryTurn,
  InMemoryStoryProvider,
  StoryDefinition,
  StoryMessage,
  StoryNarrativeSummary,
  StoryState,
} from "@ying-companion/story-core";

export interface StorySessionListItem {
  id: string;
  storyId: string;
  definitionVersion: string;
  stateRevision: number;
  currentSceneId: string;
  storyTitle: string;
  currentSceneTitle: string;
  updatedAt: string;
  createdAt: string;
}

export interface StoryPersistedDebugSnapshot {
  source: "persisted";
  effectiveContext: {
    contextScope: "current_session_context";
    summaryPresent: boolean;
    recentMessages: StoryMessage[];
    recalledLoreIds: string[];
    definitionVersion: string;
    stateRevision: number;
    currentSceneId: string;
  };
  latestTurn: CommittedStoryTurn | null;
  acceptedChanges: CommittedStoryTurn["plan"]["stateChanges"];
  rejectedChanges: Array<{ code: string; message: string; path?: string }>;
  timeline: Array<{
    type: "story:committed";
    occurredAt: string;
    turnId: string;
    clientTurnId: string;
    turnNumber: number;
    stateRevision: number;
  }>;
}

export class StoryDefinitionConflictError extends Error {
  public constructor(storyId: string) {
    super(`Story definition ${storyId} conflicts with an existing runtime definition.`);
    this.name = "StoryDefinitionConflictError";
  }
}

export async function registerRuntimeStoryDefinition(
  storyProvider: InMemoryStoryProvider,
  definition: StoryDefinition,
): Promise<"registered" | "unchanged"> {
  const existing = await storyProvider.getDefinition(definition.id);
  if (existing !== null) {
    if (stableJson(existing) === stableJson(definition)) {
      return "unchanged";
    }
    throw new StoryDefinitionConflictError(definition.id);
  }

  storyProvider.registerDefinition(definition);
  return "registered";
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJsonKeys(value));
}

function sortJsonKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonKeys);
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, sortJsonKeys(entry)]),
  );
}

export function createPersistedStoryDebugSnapshot(input: {
  definition: StoryDefinition;
  state: StoryState;
  messages: StoryMessage[];
  turns: CommittedStoryTurn[];
  summary: StoryNarrativeSummary | null;
}): StoryPersistedDebugSnapshot {
  const latestTurn = input.turns.at(-1) ?? null;
  return {
    source: "persisted",
    effectiveContext: {
      contextScope: "current_session_context",
      summaryPresent: input.summary !== null,
      recentMessages: input.messages,
      recalledLoreIds: latestTurn?.recalledLore.map((entry) => entry.entry.id) ?? [],
      definitionVersion: input.definition.version,
      stateRevision: input.state.revision,
      currentSceneId: input.state.currentSceneId,
    },
    latestTurn,
    acceptedChanges: latestTurn?.plan.stateChanges ?? [],
    rejectedChanges: [],
    timeline: latestTurn
      ? [
          {
            type: "story:committed",
            occurredAt: latestTurn.committedAt,
            turnId: latestTurn.id,
            clientTurnId: latestTurn.clientTurnId,
            turnNumber: latestTurn.turnNumber,
            stateRevision: latestTurn.nextStateRevision,
          },
        ]
      : [],
  };
}

export function createStorySessionListItem(input: {
  id: string;
  storyId: string;
  definitionVersion: string;
  definition: StoryDefinition;
  stateRevision: number;
  currentSceneId: string;
  createdAt: string;
  updatedAt: string;
}): StorySessionListItem {
  return {
    id: input.id,
    storyId: input.storyId,
    definitionVersion: input.definitionVersion,
    storyTitle: input.definition.title,
    currentSceneId: input.currentSceneId,
    currentSceneTitle:
      input.definition.scenes.find((scene) => scene.id === input.currentSceneId)?.title ??
      input.currentSceneId,
    stateRevision: input.stateRevision,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  };
}
