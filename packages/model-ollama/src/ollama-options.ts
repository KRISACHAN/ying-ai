import type { ModelCapabilities, ModelProfileOverride } from "@ying-companion/ai-core";

import { OllamaAdapterError } from "./errors";

export const DEFAULT_OLLAMA_HOST = "http://127.0.0.1:11434";
export const DEFAULT_OLLAMA_MAX_RETRIES = 0;
export const DEFAULT_OLLAMA_RETRY_DELAY_MS = 300;

export const DEFAULT_OLLAMA_CAPABILITIES: ModelCapabilities = {
  streaming: true,
  toolCalling: false,
  usage: false,
};

export interface OllamaFallbackModelOptions {
  model: string;
  profileOverride?: ModelProfileOverride;
}

export interface OllamaChatModelOptions {
  model: string;
  host?: string;
  keepAlive?: string | number;
  maxRetries?: number;
  retryDelayMs?: number;
  fallback?: OllamaFallbackModelOptions;
  primaryProfileOverride?: ModelProfileOverride;
}

export interface NormalizedOllamaChatModelOptions {
  model: string;
  host: string;
  keepAlive?: string | number;
  maxRetries: number;
  retryDelayMs: number;
  fallback?: OllamaFallbackModelOptions;
  primaryProfileOverride?: ModelProfileOverride;
}

export function normalizeOllamaOptions(
  options: OllamaChatModelOptions,
): NormalizedOllamaChatModelOptions {
  const model = normalizeModelName(options.model, "model");
  const host = normalizeHost(options.host);
  const maxRetries = normalizeNonNegativeInteger(options.maxRetries, DEFAULT_OLLAMA_MAX_RETRIES);
  const retryDelayMs = normalizeNonNegativeInteger(
    options.retryDelayMs,
    DEFAULT_OLLAMA_RETRY_DELAY_MS,
  );

  const normalized: NormalizedOllamaChatModelOptions = {
    model,
    host,
    maxRetries,
    retryDelayMs,
  };

  if (options.keepAlive !== undefined) {
    normalized.keepAlive = options.keepAlive;
  }

  if (options.fallback !== undefined) {
    normalized.fallback = {
      ...options.fallback,
      model: normalizeModelName(options.fallback.model, "fallback.model"),
    };
  }

  if (options.primaryProfileOverride !== undefined) {
    normalized.primaryProfileOverride = options.primaryProfileOverride;
  }

  return normalized;
}

function normalizeModelName(value: string, field: string): string {
  const normalized = value.trim();

  if (normalized === "") {
    throw new OllamaAdapterError("configuration_error", `Ollama ${field} must not be empty.`);
  }

  return normalized;
}

function normalizeHost(value: string | undefined): string {
  if (value === undefined) {
    return DEFAULT_OLLAMA_HOST;
  }

  const normalized = value.trim();
  return normalized === "" ? DEFAULT_OLLAMA_HOST : normalized;
}

function normalizeNonNegativeInteger(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, Math.floor(value));
}
