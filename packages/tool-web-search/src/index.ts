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
  TavilyWebSearchClient,
  type TavilyWebSearchClientOptions,
} from "./implementations/tavily-web-search-client";
export {
  createWebSearchTool,
  WEB_SEARCH_METADATA_DOMAIN,
  WEB_SEARCH_TOOL_NAME,
  WEB_SEARCH_USAGE_INSTRUCTIONS,
  type CreatedWebSearchTool,
  type CreateWebSearchToolOptions,
  type WebSearchToolData,
} from "./tool/create-web-search-tool";
