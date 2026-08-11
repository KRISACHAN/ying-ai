import {
  createModel,
  modelProfileSatisfiesCapabilities,
  type ChatModel,
  type CreateModelOptions,
  type ModelProfile,
  type ModelProfileOverride,
  type RequiredModelCapabilities,
} from "@ying-ai/ai-core";
import { createOllamaChatModel, type OllamaChatModelOptions } from "@ying-ai/model-ollama";

export interface ModelProviderConfig {
  provider: string;
  model: string;
}

export interface OpenAICompatibleModelConfig extends ModelProviderConfig, CreateModelOptions {
  provider: "openai-compatible";
  primaryProfileOverride?: ModelProfileOverride;
  fallbackProfileOverride?: ModelProfileOverride;
}

export interface OllamaModelConfig extends ModelProviderConfig, OllamaChatModelOptions {
  provider: "ollama";
  primaryProfileOverride?: ModelProfileOverride;
}

export type DemoModelProviderConfig = OpenAICompatibleModelConfig | OllamaModelConfig;

export interface ModelFactoryOptions {
  strictCapabilityCompatibility?: boolean;
  requiredCapabilities?: RequiredModelCapabilities;
}

export interface ModelAdapterStrategy<TConfig extends ModelProviderConfig = ModelProviderConfig> {
  readonly provider: TConfig["provider"];
  create(config: TConfig, options?: ModelFactoryOptions): ChatModel;
}

export class ModelAdapterRegistry {
  private readonly strategies = new Map<string, ModelAdapterStrategy>();

  public register<TConfig extends ModelProviderConfig>(
    strategy: ModelAdapterStrategy<TConfig>,
  ): void {
    this.strategies.set(strategy.provider, strategy as ModelAdapterStrategy);
  }

  public create(config: ModelProviderConfig, options: ModelFactoryOptions = {}): ChatModel {
    const strategy = this.strategies.get(config.provider);

    if (strategy === undefined) {
      throw new Error(`未注册模型 Provider: ${config.provider}`);
    }

    return strategy.create(config, options);
  }
}

export function createDefaultModelAdapterRegistry(): ModelAdapterRegistry {
  const registry = new ModelAdapterRegistry();
  registry.register(createOpenAICompatibleModelStrategy());
  registry.register(createOllamaModelStrategy());
  return registry;
}

const defaultModelAdapterRegistry = createDefaultModelAdapterRegistry();

export function createConfiguredModel(
  config: DemoModelProviderConfig,
  options?: ModelFactoryOptions,
): ChatModel {
  return defaultModelAdapterRegistry.create(config, options);
}

export function createOpenAICompatibleModelStrategy(): ModelAdapterStrategy<OpenAICompatibleModelConfig> {
  return {
    provider: "openai-compatible",
    create(config, options = {}) {
      const model = createModel(config);
      assertStrictCapabilityCompatibility(model, options);
      return model;
    },
  };
}

export function createOllamaModelStrategy(): ModelAdapterStrategy<OllamaModelConfig> {
  return {
    provider: "ollama",
    create(config, options = {}) {
      const model = createOllamaChatModel(config);
      assertStrictCapabilityCompatibility(model, options);
      return model;
    },
  };
}

export function describeModelFactoryResult(model: ChatModel): {
  provider: string;
  strategy: string;
  primaryProfile: ModelProfile;
  fallbackProfile?: ModelProfile;
} {
  return {
    provider: model.primaryProfile.provider,
    strategy: `${model.primaryProfile.provider}:strategy`,
    primaryProfile: model.primaryProfile,
    ...(model.fallbackProfile !== undefined ? { fallbackProfile: model.fallbackProfile } : {}),
  };
}

function assertStrictCapabilityCompatibility(model: ChatModel, options: ModelFactoryOptions): void {
  if (options.strictCapabilityCompatibility !== true) {
    return;
  }

  if (options.requiredCapabilities === undefined) {
    throw new Error("strictCapabilityCompatibility requires explicit requiredCapabilities.");
  }

  const profiles = [model.primaryProfile, model.fallbackProfile].filter(
    (profile): profile is ModelProfile => profile !== undefined,
  );
  const incompatible = profiles.find(
    (profile) => !modelProfileSatisfiesCapabilities(profile, options.requiredCapabilities!),
  );

  if (incompatible !== undefined) {
    throw new Error(
      `模型 ${incompatible.provider}/${incompatible.model} 不满足 strict capabilities 配置。`,
    );
  }
}
