import { createWebSearchTool, type WebSearchProvider } from "@ying-ai/tool-web-search";
import { TavilyWebSearchProvider } from "@ying-ai/tool-web-search-tavily";
import type { ModelCapabilities } from "@ying-ai/ai-core";

import { readOptionalEnv } from "./model-config";
import type { WebSearchAvailability } from "./web-search-availability";
export {
  deriveWebSearchMetadataFromToolResult,
  type DemoWorkflowWebSearchMetadata,
} from "./web-search-result-metadata";

export type { WebSearchAvailability } from "./web-search-availability";

/** Aligns with demo `get_current_time` and companion-runtime persona context. */
const DEMO_USAGE_INSTRUCTIONS_TIME_ZONE = "Asia/Shanghai";

export function resolveWebSearchAvailability(
  env: NodeJS.ProcessEnv,
  modelCapabilities: ModelCapabilities,
): WebSearchAvailability {
  if (readOptionalEnv(env, "WEB_SEARCH_ENABLED") !== "true") {
    return { available: false, reason: "disabled" };
  }
  if (modelCapabilities.toolCalling !== true) {
    return { available: false, reason: "tool_calling_unsupported" };
  }

  const backend = readOptionalEnv(env, "WEB_SEARCH_BACKEND") ?? "tavily";

  if (backend !== "tavily") {
    return { available: false, reason: "unsupported_backend" };
  }

  if (readOptionalEnv(env, "TAVILY_API_KEY") === undefined) {
    return { available: false, reason: "missing_api_key" };
  }

  return { available: true };
}

export function createWebSearchProviderFromEnv(
  env: NodeJS.ProcessEnv,
  options?: { fetch?: typeof fetch },
): WebSearchProvider | null {
  const backend = readOptionalEnv(env, "WEB_SEARCH_BACKEND") ?? "tavily";

  switch (backend) {
    case "tavily": {
      const apiKey = readOptionalEnv(env, "TAVILY_API_KEY");

      if (apiKey === undefined) {
        return null;
      }

      try {
        return new TavilyWebSearchProvider({
          apiKey,
          ...(options?.fetch !== undefined ? { fetch: options.fetch } : {}),
        });
      } catch {
        return null;
      }
    }
    default:
      return null;
  }
}

export function createWebSearchToolIfAvailable(input: {
  env: NodeJS.ProcessEnv;
  modelCapabilities: ModelCapabilities;
  fetch?: typeof fetch;
}): { availability: WebSearchAvailability; tool?: ReturnType<typeof createWebSearchTool> } {
  const availability = resolveWebSearchAvailability(input.env, input.modelCapabilities);

  if (!availability.available) {
    return { availability };
  }

  const provider = createWebSearchProviderFromEnv(input.env, {
    ...(input.fetch !== undefined ? { fetch: input.fetch } : {}),
  });

  if (provider === null) {
    return { availability: { available: false, reason: "provider_initialization_failed" } };
  }

  return {
    availability,
    tool: createWebSearchTool({
      provider,
      usageInstructionsTimeZone: DEMO_USAGE_INSTRUCTIONS_TIME_ZONE,
    }),
  };
}
