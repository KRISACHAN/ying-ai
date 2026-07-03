export type {
  WebSearchClient,
  WebSearchRequest,
  WebSearchResponse,
  WebSearchSource,
  WebSearchTimeRange,
  WebSearchTopic,
} from "./abstractions/web-search";
export { WebSearchError, type WebSearchErrorCode } from "./errors/web-search-error";
export {
  OpenAIResponsesWebSearchClient,
  type OpenAIResponsesWebSearchClientOptions,
} from "./implementations/openai-responses-web-search-client";
export {
  TavilyWebSearchClient,
  type TavilyWebSearchClientOptions,
} from "./implementations/tavily-web-search-client";
export {
  createWebSearchClient,
  type ResolvedWebSearchBackend,
  type WebSearchBackend,
  type WebSearchClientFactoryInput,
} from "./implementations/web-search-client-factory";
export {
  createWebSearchTool,
  WEB_SEARCH_FAILURE_USAGE_INSTRUCTIONS,
  WEB_SEARCH_METADATA_DOMAIN,
  WEB_SEARCH_TOOL_NAME,
  WEB_SEARCH_USAGE_INSTRUCTIONS,
  type CreatedWebSearchTool,
  type CreateWebSearchToolOptions,
  type WebSearchToolFailureData,
  type WebSearchToolData,
} from "./tool/create-web-search-tool";
