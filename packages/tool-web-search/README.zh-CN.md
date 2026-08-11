# @ying-ai/tool-web-search

**[English](./README.md)** | 简体中文

V1.2 的提供商无关（provider-neutral）网页搜索工具包。

本包负责：

- `WebSearchProvider` DTO 与规范化的 `WebSearchResult`；
- `createWebSearchTool()`，通过既有 ai-core Tool 契约暴露 `web_search` 工具；
- `evaluateSearchQuality()` 以及共享的输入规范化辅助函数。

工具 schema **仅含 query**。具体搜索后端放在独立适配包中（例如 `@ying-ai/tool-web-search-tavily`）。

本包不读取环境变量。宿主需自行决定是否可用、构造 `WebSearchProvider`，并仅在模型支持 tool calling 时注册返回的工具。
