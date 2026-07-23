import type {
  CommittedStoryTurn,
  StoryCatalogEntry,
  StoryDefinition,
  StoryMessage,
  StoryNarrativeSummary,
  StorySession,
  StoryState,
} from "@ying-companion/story-core";

import {
  getStoryModelRuntimeInfo,
  getStoryRuntimeHost,
  type StoryModelRuntimeInfo,
} from "./story-runtime-factory";
import {
  createPersistedStoryDebugSnapshot,
  createStorySessionListItem,
  registerRuntimeStoryDefinition,
  type StoryPersistedDebugSnapshot,
  type StorySessionListItem,
} from "./story-workbench-data";

export type { StoryPersistedDebugSnapshot, StorySessionListItem } from "./story-workbench-data";

export interface StorySessionDetail {
  session: StorySession;
  definition: StoryDefinition;
  state: StoryState;
  messages: StoryMessage[];
  turns: CommittedStoryTurn[];
  summary: StoryNarrativeSummary | null;
  modelRuntime: StoryModelRuntimeInfo;
  debugSnapshot: StoryPersistedDebugSnapshot;
}

interface StorySessionRow {
  id: string;
  story_id: string;
  definition_version: string;
  created_at: Date;
  updated_at: Date;
  state_json: {
    revision?: number;
    currentSceneId?: string;
  };
  definition_snapshot: StoryDefinition;
}

export class StoryDebugRepository {
  async listStories(): Promise<StoryCatalogEntry[]> {
    const host = await getStoryRuntimeHost();
    return host.listDefinitions();
  }

  async getStory(storyId: string): Promise<StoryDefinition | null> {
    const host = await getStoryRuntimeHost();
    return host.storyProvider.getDefinition(storyId);
  }

  async createSession(storyId: string): Promise<StorySession> {
    const host = await getStoryRuntimeHost();
    return host.sessionProvider.createSession({ storyId });
  }

  async registerStoryDefinition(definition: StoryDefinition): Promise<"registered" | "unchanged"> {
    const host = await getStoryRuntimeHost();
    return registerRuntimeStoryDefinition(host.storyProvider, definition);
  }

  async listSessions(storyId: string): Promise<StorySessionListItem[]> {
    const host = await getStoryRuntimeHost();
    const result = await host.pool.query<StorySessionRow>(
      `SELECT s.id, s.story_id, s.definition_version, s.definition_snapshot,
              s.created_at, s.updated_at, st.state_json
       FROM story_sessions s
       JOIN story_states st ON st.session_id = s.id
       WHERE s.story_id = $1
       ORDER BY s.updated_at DESC`,
      [storyId],
    );

    return result.rows.map((row) =>
      createStorySessionListItem({
        id: row.id,
        storyId: row.story_id,
        definitionVersion: row.definition_version,
        definition: row.definition_snapshot,
        stateRevision: Number(row.state_json.revision ?? 0),
        currentSceneId: row.state_json.currentSceneId ?? "",
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      }),
    );
  }

  async getSessionDetail(sessionId: string): Promise<StorySessionDetail | null> {
    const host = await getStoryRuntimeHost();
    const session = await host.sessionProvider.getSession(sessionId);
    if (!session) {
      return null;
    }

    const [state, messages, turns, summary] = await Promise.all([
      host.stateProvider.getState(sessionId),
      host.messageProvider.getRecentMessages(sessionId, { limit: 40 }),
      host.turnRepository.getCommittedTurns(sessionId, { limit: 40 }),
      host.summaryProvider.getSummary(sessionId),
    ]);

    if (!state) {
      return null;
    }

    return {
      session,
      definition: session.definitionSnapshot,
      state,
      messages,
      turns,
      summary,
      modelRuntime: getStoryModelRuntimeInfo(),
      debugSnapshot: createPersistedStoryDebugSnapshot({
        definition: session.definitionSnapshot,
        state,
        messages,
        turns,
        summary,
      }),
    };
  }
}

export function createStoryDefinitionPreview(definition: StoryDefinition) {
  return {
    id: definition.id,
    version: definition.version,
    title: definition.title,
    description: definition.description,
    premise: definition.premise,
    genre: definition.genre,
    tone: definition.tone,
    characters: definition.characters.map((character) => ({
      id: character.id,
      name: character.name,
      narrativeRole: character.narrativeRole,
      description: character.description,
    })),
    scenes: definition.scenes.map((scene) => ({
      id: scene.id,
      title: scene.title,
      location: scene.location,
      availableCharacterIds: scene.availableCharacterIds,
    })),
    attributes: definition.attributes,
    narrativeRules: definition.narrativeRules,
  };
}
