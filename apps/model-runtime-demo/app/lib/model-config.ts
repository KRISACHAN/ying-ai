import type { ModelCapabilities, ModelProfileOverride } from "@ying-companion/ai-core";

import type { DemoModelProviderConfig, OpenAICompatibleModelConfig } from "./model-factory";

export type DebugModelProvider = "openai-compatible" | "ollama";

export type DebugModelConfig =
  | {
      provider: "openai-compatible";
      model: string;
      baseUrl?: string;
      retry?: {
        maxAttempts?: number;
      };
      fallback?: {
        model: string;
        capabilities?: Partial<ModelCapabilities>;
      };
      capabilities?: Partial<ModelCapabilities>;
    }
  | {
      provider: "ollama";
      model: string;
      host?: string;
      keepAlive?: string;
      capabilities?: Partial<ModelCapabilities>;
    };

export interface DebugModelRequestSecrets {
  apiKeyOverride?: string;
}

export interface ResolvedDebugModelConfig {
  debugConfig: DebugModelConfig;
  providerConfig: DemoModelProviderConfig;
}

type OpenAIDebugRetry = Extract<DebugModelConfig, { provider: "openai-compatible" }>["retry"];

/**
 * 仅供 demo 宿主使用：从环境变量读取模型运行时配置。
 *
 * 注意：`@ying-companion/ai-core` 不读取环境变量，配置必须由宿主读取后以参数传入。
 */
export function loadModelConfig(env: NodeJS.ProcessEnv): OpenAICompatibleModelConfig {
  const options: OpenAICompatibleModelConfig = {
    provider: "openai-compatible",
    apiKey: readRequiredEnv(env, "OPENAI_API_KEY"),
    model: readRequiredEnv(env, "OPENAI_MODEL"),
    retry: {
      primaryMaxRetries: readRetryEnv(env, "OPENAI_PRIMARY_MAX_RETRIES"),
      fallbackMaxRetries: readRetryEnv(env, "OPENAI_FALLBACK_MAX_RETRIES"),
    },
  };
  const baseUrl = readOptionalEnv(env, "OPENAI_BASE_URL");
  const fallbackModel = readOptionalEnv(env, "OPENAI_FALLBACK_MODEL");
  const primaryProfileOverride = readProfileOverride(env, "OPENAI_MODEL");
  const fallbackProfileOverride = readProfileOverride(env, "OPENAI_FALLBACK_MODEL");

  if (baseUrl !== undefined) {
    options.baseUrl = baseUrl;
  }

  if (fallbackModel !== undefined) {
    options.fallbackModel = fallbackModel;
  }

  if (primaryProfileOverride !== undefined) {
    options.primaryProfileOverride = primaryProfileOverride;
  }

  if (fallbackProfileOverride !== undefined) {
    options.fallbackProfileOverride = fallbackProfileOverride;
  }

  return options;
}

export function loadDefaultDebugModelConfig(env: NodeJS.ProcessEnv): DebugModelConfig {
  const provider = readOptionalEnv(env, "MODEL_PROVIDER");

  if (provider === "ollama") {
    const host = readOptionalEnv(env, "OLLAMA_HOST");
    const keepAlive = readOptionalEnv(env, "OLLAMA_KEEP_ALIVE");

    return {
      provider: "ollama",
      model: readOptionalEnv(env, "OLLAMA_MODEL") ?? "dzgg/gemma-4-abliterated:e2b-v2",
      ...(host !== undefined ? { host } : {}),
      ...(keepAlive !== undefined ? { keepAlive } : {}),
      ...profileOverrideToDebugCapabilities(readProfileOverride(env, "OLLAMA_MODEL")),
    };
  }

  const fallbackModel = readOptionalEnv(env, "OPENAI_FALLBACK_MODEL");
  const baseUrl = readOptionalEnv(env, "OPENAI_BASE_URL");

  return {
    provider: "openai-compatible",
    model: readOptionalEnv(env, "OPENAI_MODEL") ?? "",
    ...(baseUrl !== undefined ? { baseUrl } : {}),
    retry: {
      maxAttempts: readRetryEnv(env, "OPENAI_PRIMARY_MAX_RETRIES"),
    },
    ...(fallbackModel !== undefined
      ? {
          fallback: {
            model: fallbackModel,
            ...profileOverrideToDebugCapabilities(
              readProfileOverride(env, "OPENAI_FALLBACK_MODEL"),
            ),
          },
        }
      : {}),
    ...profileOverrideToDebugCapabilities(readProfileOverride(env, "OPENAI_MODEL")),
  };
}

export function resolveDebugModelConfig(
  input: unknown,
  env: NodeJS.ProcessEnv,
  secrets: DebugModelRequestSecrets = {},
): ResolvedDebugModelConfig {
  const debugConfig = validateDebugModelConfig(input ?? loadDefaultDebugModelConfig(env));

  if (debugConfig.provider === "ollama") {
    const providerConfig: DemoModelProviderConfig = {
      provider: "ollama",
      model: debugConfig.model,
      ...(debugConfig.host !== undefined ? { host: debugConfig.host } : {}),
      ...(debugConfig.keepAlive !== undefined ? { keepAlive: debugConfig.keepAlive } : {}),
      ...(debugConfig.capabilities !== undefined
        ? { primaryProfileOverride: { capabilities: debugConfig.capabilities } }
        : {}),
    };

    return { debugConfig, providerConfig };
  }

  const apiKey = secrets.apiKeyOverride?.trim() || readRequiredEnv(env, "OPENAI_API_KEY");
  const fallbackModel = debugConfig.fallback?.model.trim();
  const providerConfig: DemoModelProviderConfig = {
    provider: "openai-compatible",
    apiKey,
    model: debugConfig.model,
    ...(debugConfig.baseUrl !== undefined ? { baseUrl: debugConfig.baseUrl } : {}),
    ...(debugConfig.capabilities !== undefined
      ? { primaryProfileOverride: { capabilities: debugConfig.capabilities } }
      : {}),
    ...(fallbackModel !== undefined && fallbackModel !== ""
      ? {
          fallbackModel,
          ...(debugConfig.fallback?.capabilities !== undefined
            ? { fallbackProfileOverride: { capabilities: debugConfig.fallback.capabilities } }
            : {}),
        }
      : {}),
    retry: {
      primaryMaxRetries:
        debugConfig.retry?.maxAttempts ?? readRetryEnv(env, "OPENAI_PRIMARY_MAX_RETRIES"),
      fallbackMaxRetries: readRetryEnv(env, "OPENAI_FALLBACK_MAX_RETRIES"),
    },
  };

  return { debugConfig, providerConfig };
}

export function validateDebugModelConfig(value: unknown): DebugModelConfig {
  if (!isRecord(value)) {
    throw new Error("modelConfig must be an object.");
  }

  const provider = value.provider;

  if (provider === "ollama") {
    const model = readRequiredString(value.model, "modelConfig.model");
    const host = readOptionalStringValue(value.host, "modelConfig.host");
    const keepAlive = readOptionalStringValue(value.keepAlive, "modelConfig.keepAlive");
    const capabilities = readOptionalCapabilities(value.capabilities, "modelConfig.capabilities");

    return {
      provider,
      model,
      ...(host !== undefined ? { host } : {}),
      ...(keepAlive !== undefined ? { keepAlive } : {}),
      ...(capabilities !== undefined ? { capabilities } : {}),
    };
  }

  if (provider === "openai-compatible") {
    const model = readRequiredString(value.model, "modelConfig.model");
    const baseUrl = readOptionalStringValue(value.baseUrl, "modelConfig.baseUrl");
    const retry = readOptionalRetry(value.retry);
    const capabilities = readOptionalCapabilities(value.capabilities, "modelConfig.capabilities");
    const fallback = readOptionalFallback(value.fallback);

    return {
      provider,
      model,
      ...(baseUrl !== undefined ? { baseUrl } : {}),
      ...(retry !== undefined ? { retry } : {}),
      ...(fallback !== undefined ? { fallback } : {}),
      ...(capabilities !== undefined ? { capabilities } : {}),
    };
  }

  throw new Error("modelConfig.provider must be openai-compatible or ollama.");
}

export function readOptionalEnv(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const value = env[key]?.trim();
  return value === "" ? undefined : value;
}

export function readRequiredEnv(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
}

export function readRetryEnv(env: NodeJS.ProcessEnv, key: string): number {
  const value = parseInt(env[key] ?? "0", 10);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function maskSecret(value: string): string {
  if (value.length <= 8) {
    return "********";
  }

  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function readProfileOverride(
  env: NodeJS.ProcessEnv,
  prefix: "OPENAI_MODEL" | "OPENAI_FALLBACK_MODEL" | "OLLAMA_MODEL",
): ModelProfileOverride | undefined {
  const capabilities: Partial<ModelCapabilities> = {};
  const streaming = readBooleanEnv(env, `${prefix}_SUPPORTS_STREAMING`);
  const toolCalling = readBooleanEnv(env, `${prefix}_SUPPORTS_TOOL_CALLING`);
  const usage = readBooleanEnv(env, `${prefix}_SUPPORTS_USAGE`);

  if (streaming !== undefined) {
    capabilities.streaming = streaming;
  }

  if (toolCalling !== undefined) {
    capabilities.toolCalling = toolCalling;
  }

  if (usage !== undefined) {
    capabilities.usage = usage;
  }

  return Object.keys(capabilities).length > 0 ? { capabilities } : undefined;
}

function profileOverrideToDebugCapabilities(override: ModelProfileOverride | undefined): {
  capabilities?: Partial<ModelCapabilities>;
} {
  return override?.capabilities !== undefined ? { capabilities: override.capabilities } : {};
}

function readOptionalRetry(value: unknown): OpenAIDebugRetry {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw new Error("modelConfig.retry must be an object.");
  }
  const maxAttempts = readOptionalNumberValue(value.maxAttempts, "modelConfig.retry.maxAttempts");

  return {
    ...(maxAttempts !== undefined ? { maxAttempts } : {}),
  };
}

function readOptionalFallback(
  value: unknown,
): { model: string; capabilities?: Partial<ModelCapabilities> } | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw new Error("modelConfig.fallback must be an object.");
  }
  const model = readRequiredString(value.model, "modelConfig.fallback.model");
  const capabilities = readOptionalCapabilities(
    value.capabilities,
    "modelConfig.fallback.capabilities",
  );

  return {
    model,
    ...(capabilities !== undefined ? { capabilities } : {}),
  };
}

function readOptionalCapabilities(
  value: unknown,
  field: string,
): Partial<ModelCapabilities> | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw new Error(`${field} must be an object.`);
  }
  const capabilities: Partial<ModelCapabilities> = {};

  for (const key of ["streaming", "toolCalling", "usage"] as const) {
    const capability = value[key];

    if (capability !== undefined) {
      if (typeof capability !== "boolean") {
        throw new Error(`${field}.${key} must be boolean.`);
      }

      capabilities[key] = capability;
    }
  }

  return Object.keys(capabilities).length > 0 ? capabilities : undefined;
}

function readRequiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${field} must be a non-empty string.`);
  }

  return value.trim();
}

function readOptionalStringValue(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string.`);
  }

  const normalized = value.trim();
  return normalized === "" ? undefined : normalized;
}

function readOptionalNumberValue(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${field} must be a finite number.`);
  }

  return Math.max(0, Math.floor(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readBooleanEnv(env: NodeJS.ProcessEnv, key: string): boolean | undefined {
  const value = readOptionalEnv(env, key)?.toLowerCase();

  if (value === undefined) {
    return undefined;
  }

  if (["1", "true", "yes", "on"].includes(value)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(value)) {
    return false;
  }

  throw new Error(`${key} must be a boolean-like value.`);
}
