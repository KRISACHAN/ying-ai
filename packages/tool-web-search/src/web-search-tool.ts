import type { ToolDefinition, ToolHandler, ToolResult } from "@ying-companion/ai-core";

import { formatWebSearchForModel } from "./format-web-search-for-model";
import type { WebSearchInput, WebSearchProvider } from "./types";
import { readProviderErrorCode } from "./web-search-provider-error";

const WEB_SEARCH_TOOL_NAME = "web_search";
const MAX_QUERY_LENGTH = 256;

export interface WebSearchTool {
  definition: ToolDefinition;
  handler: ToolHandler;
}

export function createWebSearchTool(options: { provider: WebSearchProvider }): WebSearchTool {
  return {
    definition: {
      name: WEB_SEARCH_TOOL_NAME,
      description: [
        "Search the web for current, recent, external, or changing information.",
        "Use it for news, weather, markets, prices, product updates, current people or roles, and recent events.",
        "Do not use it for casual chat, stable common knowledge, or code concept explanations unless the user asks to search or verify.",
        "Rewrite the user intent into concise searchable keywords and remove filler.",
        "Do not include years in the query; recency and time range are handled by the system.",
        "Retrieval parameters such as topic, recency, and locale are handled by the system.",
        "This tool returns source material only; the assistant must synthesize the final answer.",
      ].join(" "),
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Concise search query, trimmed and no longer than 256 characters.",
          },
        },
        required: ["query"],
        additionalProperties: false,
      },
      metadata: {
        tags: ["web", "search", "external"],
        externalContext: true,
        memoryPolicy: "do_not_store",
      },
    },
    handler: async (input) => {
      const parsed = parseArguments(input.call.arguments);

      if (!parsed.ok) {
        return createInvalidResult(input.call.id, parsed.message);
      }

      try {
        const search = await options.provider.search(parsed.input);

        return {
          name: WEB_SEARCH_TOOL_NAME,
          ...(input.call.id !== undefined ? { toolCallId: input.call.id } : {}),
          ok: true,
          result: formatWebSearchForModel(search),
          metadata: {
            provider: options.provider.id,
            externalContext: true,
            memoryPolicy: "do_not_store",
          },
        };
      } catch (error) {
        return createFailureResult(input.call.id, options.provider.id, error);
      }
    },
  };
}

function parseArguments(
  value: unknown,
): { ok: true; input: WebSearchInput } | { ok: false; message: string } {
  if (typeof value !== "object" || value === null) {
    return { ok: false, message: "web_search arguments must be an object" };
  }

  const args = value as Record<string, unknown>;
  const query = typeof args.query === "string" ? args.query.trim() : "";

  if (query === "") {
    return { ok: false, message: "web_search.query is required" };
  }
  if (query.length > MAX_QUERY_LENGTH) {
    return { ok: false, message: `web_search.query length must be <= ${MAX_QUERY_LENGTH}` };
  }

  return {
    ok: true,
    input: {
      query,
      maxResults: 5,
    },
  };
}

function createInvalidResult(toolCallId: string | undefined, message: string): ToolResult {
  return {
    name: WEB_SEARCH_TOOL_NAME,
    ...(toolCallId !== undefined ? { toolCallId } : {}),
    ok: false,
    result: null,
    error: {
      code: "TOOL_INVALID_ARGUMENTS",
      message,
    },
    metadata: {
      domain: "web_search",
      code: "invalid_arguments",
      externalContext: true,
      memoryPolicy: "do_not_store",
    },
  };
}

function createFailureResult(
  toolCallId: string | undefined,
  provider: string,
  error: unknown,
): ToolResult {
  const message = error instanceof Error ? error.message : "Web search failed";
  const code = readProviderErrorCode(error);

  return {
    name: WEB_SEARCH_TOOL_NAME,
    ...(toolCallId !== undefined ? { toolCallId } : {}),
    ok: false,
    result: null,
    error: {
      code: "TOOL_EXECUTION_FAILED",
      message,
    },
    metadata: {
      domain: "web_search",
      code,
      provider,
      externalContext: true,
      memoryPolicy: "do_not_store",
    },
  };
}
