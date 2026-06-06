# AI Core — 阶段 1 Model Runtime

> 来源：`63288da`（`feat(ai-core): 新增 Model Runtime 核心包与阶段 1 需求文档`）
> 需求文档：`docs/requirements/stages/stage-01/01-model-runtime.md`

## Decisions

- 新增 `@ying-companion/ai-core` 包，作为 AI Companion Core 的阶段 1 模型运行时层。
- 业务层通过 `ChatModel` 抽象调用模型，入口为 `createModel(options: CreateModelOptions)`；对外只导出 `createModel`、抽象 DTO 与 `CreateModelOptions`，不导出 `OpenAICompatibleModel` 等实现类。
- 当前默认实现为 OpenAI 兼容 Provider，经由 Vercel AI SDK（`ai`、`@ai-sdk/openai-compatible`）适配；不引入 OpenAI 官方 SDK，也不在项目内手写 HTTP/SSE/usage 解析。
- `zod` 作为直接依赖保留，用于满足 AI SDK 相关包的 peer dependency，不等同于业务代码直接使用。
- 模型配置由宿主应用显式传入：`{ apiKey, baseUrl, model }`；`CreateModelOptions` 当前等同于 OpenAI 兼容配置形态。
- `ai-core` 支持 `generate()`（非流式）与 `stream()`（流式）；流式结束后可输出带 `usage` 的最终 chunk（`text` 为空）。
- 阶段 1 为 `tools` 入参保留契约占位，但不传给 Provider、不执行工具；`toolCalls` 输出结构在非流式路径已预留映射。
- `tool` 角色消息在阶段 1 显式抛错，待 Tool System 阶段再支持。
- 调试与可观测输出放在 `apps/model-runtime-demo`，不放入 `packages/ai-core`；demo 自行读取 `.env` 后再调用 Core。
- `ai-core` 当前以 CommonJS 构建（`type: commonjs`），源码无后缀 import，避免 post-build 重写。

## Prohibitions

- `ai-core` 不得读取 `.env` 或 `process.env`。
- 业务层不得直接调用 Vercel AI SDK、OpenAI-compatible Provider 或 OpenAI HTTP 细节。
- 不得将 demo、调试 UI、人工验证脚本长期放入 `packages/ai-core`。
- Core 内不得使用 `any`；不得将未校验的 `tools` 裸断言后传给 AI SDK。
- 不得在包入口导出 Provider 实现类。
- 不得在后续模块重复实例化模型；应通过 Factory 统一创建。
- 不得向业务方暴露 Vercel AI SDK 或 Provider 类型。

## Workflows

- 创建模型：`const model = createModel({ apiKey, baseUrl, model })`
- 非流式调用：`await model.generate({ messages, temperature?, maxTokens?, model? })`
- 流式调用：`for await (const chunk of model.stream({ messages })) { /* chunk.text, chunk.usage? */ }`
- 本地调试 demo：`pnpm --filter @ying-companion/model-runtime-demo dev`（环境变量见 `apps/model-runtime-demo/.env.example`）
- 包目录约定：`abstractions/`、`config/`、`factories/`、`implementations/model/`

## Open Questions

- 下一阶段将进入 Core 抽象层与依赖注入设计（见需求文档第十节）。
- 多 Provider 路由尚未实现；扩展时应在 Factory 内增加明确分支，不提前暴露占位字段。
- `ai-core` 的 CJS 与 monorepo 其他包的 ESM 统一尚未处理。
- `ChatMessage.name` 尚未映射到 AI SDK 消息；`tools` 的 Core 级描述与校验待 Tool System 阶段定义。
