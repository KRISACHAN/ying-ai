import type { WebSearchClient } from "../abstractions/web-search";
import {
  OpenAIResponsesWebSearchClient,
  type OpenAIResponsesWebSearchClientOptions,
} from "./openai-responses-web-search-client";
import {
  TavilyWebSearchClient,
  type TavilyWebSearchClientOptions,
} from "./tavily-web-search-client";

export type WebSearchBackend = "tavily" | "openai-responses";

export interface ResolvedWebSearchBackend {
  backend: WebSearchBackend;
  client: WebSearchClient;
}

export type WebSearchClientFactoryInput =
  | ({ backend: "tavily" } & TavilyWebSearchClientOptions)
  | ({ backend: "openai-responses" } & OpenAIResponsesWebSearchClientOptions);

export function createWebSearchClient(
  input: WebSearchClientFactoryInput,
): ResolvedWebSearchBackend {
  if (input.backend === "openai-responses") {
    const { backend, ...options } = input;
    void backend;
    return {
      backend: "openai-responses",
      client: new OpenAIResponsesWebSearchClient(options),
    };
  }

  const { backend, ...options } = input;
  void backend;
  return {
    backend: "tavily",
    client: new TavilyWebSearchClient(options),
  };
}
