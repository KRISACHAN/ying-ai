import type { ModelProfile } from "@ying-companion/ai-core";
import type { StoryCatalogEntry, StoryDefinition } from "@ying-companion/story-core";
import {
  DefaultStoryTransitionValidator,
  DefaultStoryWorkflow,
  fogHarborMystery,
  InMemoryStoryProvider,
  KeywordLoreProvider,
  minimalWuxiaContract,
  ModelStoryPlanner,
  ModelStoryRenderer,
} from "@ying-companion/story-core";
import {
  PostgresStoryMessageProvider,
  PostgresStorySessionProvider,
  PostgresStoryStateProvider,
  PostgresStorySummaryProvider,
  PostgresStoryTurnCommitter,
  PostgresStoryTurnRepository,
  runStoryPostgresMigrations,
} from "@ying-companion/story-postgres";
import type { Pool } from "pg";

import { getDebugPool } from "./debug-db";
import { loadDefaultDebugModelConfig, resolveDebugModelConfig } from "./model-config";
import { createConfiguredModel, describeModelFactoryResult } from "./model-factory";
const seedDefinitions = [fogHarborMystery, minimalWuxiaContract] as const;

let storyRuntimePromise: Promise<StoryRuntimeHost> | undefined;
let storyWorkflowRuntimePromise: Promise<StoryWorkflowRuntime> | undefined;

export interface StoryRuntimeHost {
  pool: Pool;
  storyProvider: InMemoryStoryProvider;
  sessionProvider: PostgresStorySessionProvider;
  stateProvider: PostgresStoryStateProvider;
  messageProvider: PostgresStoryMessageProvider;
  summaryProvider: PostgresStorySummaryProvider;
  turnRepository: PostgresStoryTurnRepository;
  listDefinitions(): Promise<StoryCatalogEntry[]>;
}

export interface StoryModelRuntimeInfo {
  mode: "model";
  provider: string;
  model: string;
  primaryProfile?: ModelProfile;
  fallbackProfile?: ModelProfile;
}

export interface StoryWorkflowRuntime {
  workflow: DefaultStoryWorkflow;
  modelRuntime: StoryModelRuntimeInfo;
}

export function getSeedStoryDefinitions(): StoryDefinition[] {
  return seedDefinitions.map((definition) => JSON.parse(JSON.stringify(definition)));
}

export function getStoryModelRuntimeInfo(
  env: NodeJS.ProcessEnv = process.env,
): StoryModelRuntimeInfo {
  const config = loadDefaultDebugModelConfig(resolveStoryModelEnv(env));
  return {
    mode: "model",
    provider: config.provider,
    model: config.model,
  };
}

export async function getStoryRuntimeHost(): Promise<StoryRuntimeHost> {
  if (storyRuntimePromise === undefined) {
    storyRuntimePromise = createStoryRuntimeHost().catch((error: unknown) => {
      storyRuntimePromise = undefined;
      throw error;
    });
  }
  return storyRuntimePromise;
}

export async function getStoryWorkflowRuntime(): Promise<StoryWorkflowRuntime> {
  if (storyWorkflowRuntimePromise === undefined) {
    storyWorkflowRuntimePromise = createStoryWorkflowRuntime().catch((error: unknown) => {
      storyWorkflowRuntimePromise = undefined;
      throw error;
    });
  }
  return storyWorkflowRuntimePromise;
}

async function createStoryRuntimeHost(): Promise<StoryRuntimeHost> {
  const pool = getDebugPool();
  await runStoryPostgresMigrations(pool);

  const storyProvider = new InMemoryStoryProvider(getSeedStoryDefinitions());
  const sessionProvider = new PostgresStorySessionProvider({ client: pool, storyProvider });
  const stateProvider = new PostgresStoryStateProvider(pool);
  const messageProvider = new PostgresStoryMessageProvider(pool);
  const summaryProvider = new PostgresStorySummaryProvider(pool);
  const turnRepository = new PostgresStoryTurnRepository(pool);

  return {
    pool,
    storyProvider,
    sessionProvider,
    stateProvider,
    messageProvider,
    summaryProvider,
    turnRepository,
    listDefinitions: () => storyProvider.listDefinitions(),
  };
}

async function createStoryWorkflowRuntime(): Promise<StoryWorkflowRuntime> {
  const host = await getStoryRuntimeHost();
  const resolvedConfig = resolveDebugModelConfig(undefined, resolveStoryModelEnv(process.env));
  const model = createConfiguredModel(resolvedConfig.providerConfig);
  const modelDescription = describeModelFactoryResult(model);

  return {
    workflow: new DefaultStoryWorkflow({
      sessionProvider: host.sessionProvider,
      stateProvider: host.stateProvider,
      loreProvider: new KeywordLoreProvider(),
      planner: new ModelStoryPlanner(model),
      validator: new DefaultStoryTransitionValidator(),
      renderer: new ModelStoryRenderer(model),
      turnRepository: host.turnRepository,
      messageProvider: host.messageProvider,
      committer: new PostgresStoryTurnCommitter({ client: host.pool }),
      summaryProvider: host.summaryProvider,
    }),
    modelRuntime: {
      mode: "model",
      provider: modelDescription.provider,
      model: modelDescription.primaryProfile.model,
      primaryProfile: modelDescription.primaryProfile,
      ...(modelDescription.fallbackProfile !== undefined
        ? { fallbackProfile: modelDescription.fallbackProfile }
        : {}),
    },
  };
}

function resolveStoryModelEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const provider = env.STORY_MODEL_PROVIDER?.trim();
  if (provider === undefined || provider === "") {
    return env;
  }
  if (provider !== "openai-compatible" && provider !== "ollama") {
    throw new Error("STORY_MODEL_PROVIDER must be openai-compatible or ollama.");
  }
  return { ...env, MODEL_PROVIDER: provider };
}
