import type { CreateModelOptions } from "@ying-companion/ai-core";

/**
 * 仅供 demo 宿主使用：从环境变量读取模型运行时配置。
 *
 * 注意：`@ying-companion/ai-core` 不读取环境变量，配置必须由宿主读取后以参数传入。
 */
export function loadModelConfig(env: NodeJS.ProcessEnv): CreateModelOptions {
  const options: CreateModelOptions = {
    apiKey: readRequiredEnv(env, "OPENAI_API_KEY"),
    model: readRequiredEnv(env, "OPENAI_MODEL"),
    retry: {
      primaryMaxRetries: readRetryEnv(env, "OPENAI_PRIMARY_MAX_RETRIES"),
      fallbackMaxRetries: readRetryEnv(env, "OPENAI_FALLBACK_MAX_RETRIES"),
    },
  };
  const baseUrl = readOptionalEnv(env, "OPENAI_BASE_URL");
  const fallbackModel = readOptionalEnv(env, "OPENAI_FALLBACK_MODEL");

  if (baseUrl !== undefined) {
    options.baseUrl = baseUrl;
  }

  if (fallbackModel !== undefined) {
    options.fallbackModel = fallbackModel;
  }

  return options;
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
