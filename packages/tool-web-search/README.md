# @ying-companion/tool-web-search

V1.2 Web Search Tool Adapter。这个包定义供应商无关的 `WebSearchClient` 契约、Tavily / OpenAI Responses 实现，以及可注册到 `@ying-companion/ai-core` `ToolRegistry` 的 `web_search` 工具。

## 边界

- 不读取环境变量，宿主通过构造函数传入 key、timeout、maxResults。
- 不依赖 demo 数据库、Next.js、React、UIMessage 或宿主环境变量。
- 不把 Tavily 原始响应、网页全文、HTML 或异常堆栈放进 ToolResult。
- OpenAI Responses backend 只从结构化 `url_citation` / `web_search_call.action.sources` 提取来源，不从正文正则猜 URL。
- Memory 隔离信号写在成功 ToolResult 的 `metadata.externalContext` 与 `metadata.memoryPolicy`。
- `WEB_SEARCH_DISABLED` 由宿主门控承担；关闭时不注册 Tool，因此不会产生 disabled Tool 调用。

## 验证

```bash
pnpm --filter @ying-companion/tool-web-search verify:web-search-contract
```
