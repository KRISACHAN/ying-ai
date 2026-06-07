# AI Core — 阶段 1 Model Runtime

> 来源：`63288da`（Model Runtime 初版）、`ca46e25`（重试与降级）
> 需求文档：`docs/requirements/stages/stage-01/01-model-runtime.md`（已合并 patch-1 / patch-2）
> 补丁来源：`01-model-runtime-patch.md`、`01-model-runtime-patch-2.md`
> 审查归档：`docs/code-reviews/0-63288da/`、`docs/code-reviews/1-ca46e25/`

## Decisions

- 新增 `@ying-companion/ai-core` 包，作为 AI Companion Core 的阶段 1 模型运行时层。
- 业务层通过 `ChatModel` 抽象调用模型，入口为 `createModel(options: CreateModelOptions)`；对外只导出 `createModel`、抽象 DTO、`CreateModelOptions`、`ModelRuntimeError`，不导出 `OpenAICompatibleModel` 等实现类。
- 当前默认实现为 OpenAI 兼容 Provider，经由 Vercel AI SDK（`ai`、`@ai-sdk/openai-compatible`）适配；不引入 OpenAI 官方 SDK，也不在项目内手写 HTTP/SSE/usage 解析。
- `zod` 作为直接依赖保留，用于满足 AI SDK 相关包的 peer dependency，不等同于业务代码直接使用。
- 模型配置由宿主应用显式传入；`CreateModelOptions` 当前等同于 OpenAI 兼容配置形态：

  ```ts
  {
    apiKey: string;
    baseUrl?: string;          // 默认 https://api.openai.com/v1
    model: string;             // 主模型
    fallbackModel?: string;    // 不传则不启用降级
    retry?: {
      primaryMaxRetries?: number;   // 默认 0
      fallbackMaxRetries?: number;  // 默认 0
    };
  }
  ```

- 重试与降级属于 Model Runtime 能力，封装在 `OpenAICompatibleModel` 内部；demo 只传配置并展示结果，不负责重试逻辑。
- 默认不启用重试（`primaryMaxRetries = 0`、`fallbackMaxRetries = 0`），避免无感增加模型调用成本；降级模型必须显式配置。
- 总尝试次数 = `1 + maxRetries`；执行顺序：主模型尝试 → 主模型重试 →（若配置）降级模型尝试 → 降级模型重试 → 全部失败后抛 `ModelRuntimeError`。
- AI SDK 内部 `maxRetries` 固定为 `0`，避免与 Core Runtime 重试计数叠加。
- Provider factory 在模型实例构造时创建并复用，不在每次 retry / fallback attempt 中重复构造。
- `generate()` 在返回前校验输出：空文本且无 `toolCalls` 视为异常并触发重试；有 `toolCalls` 时即使 `text` 为空也不视为异常。
- `stream()` 仅在首个内容 chunk 输出前允许重试或降级；一旦已开始输出，不再静默切换模型，失败时抛 `ModelRuntimeError`。
- 流式终止 chunk（带 `usage` 的 finish chunk）携带 `runtime?: ModelRuntimeInfo`；普通内容 chunk 不含 `runtime`。
- `GenerateOutput.model` 与 `runtime.usedModel` 冗余是有意为之：前者面向业务，后者面向调试/观测。
- 错误摘要通过 `ModelRuntimeErrorItem[]` 暴露，截断至 240 字符；不透传 API Key、完整响应体或底层错误对象。
- `ModelRuntimeError` 定义在 `packages/ai-core/src/errors/model-runtime-error.ts`，不放在 `abstractions/`。
- `GenerateInput.model` 仅覆盖本次调用的 primary plan，不覆盖配置中的 `fallbackModel`。
- `ai-core` 支持 `generate()`（非流式）与 `stream()`（流式）；流式结束后输出带 `usage` 与 `runtime` 的最终 chunk（`text` 为空）。
- 阶段 1 为 `tools` 入参保留契约占位，但不传给 Provider、不执行工具；`toolCalls` 输出结构在非流式路径已预留映射。
- `tool` 角色消息在阶段 1 显式抛错，待 Tool System 阶段再支持。
- 调试与可观测输出放在 `apps/model-runtime-demo`，不放入 `packages/ai-core`；demo 自行读取 `.env` 后再调用 Core。
- demo 环境变量：`OPENAI_API_KEY`、`OPENAI_MODEL`（必填）；`OPENAI_BASE_URL`、`OPENAI_FALLBACK_MODEL`、`OPENAI_PRIMARY_MAX_RETRIES`、`OPENAI_FALLBACK_MAX_RETRIES`（可选）。
- `ai-core` 当前以 CommonJS 构建（`type: commonjs`），源码无后缀 import，避免 post-build 重写。
- 根目录 ESLint 忽略 `**/next-env.d.ts`（Next.js 自动生成，pre-commit 不应 lint）。

## Prohibitions

- `ai-core` 不得读取 `.env` 或 `process.env`。
- 业务层不得直接调用 Vercel AI SDK、OpenAI-compatible Provider 或 OpenAI HTTP 细节。
- 不得将 demo、调试 UI、人工验证脚本长期放入 `packages/ai-core`。
- Core 内不得使用 `any`；不得将未校验的 `tools` 裸断言后传给 AI SDK。
- 不得在包入口导出 Provider 实现类。
- 不得在后续模块重复实例化模型；应通过 Factory 统一创建。
- 不得向业务方暴露 Vercel AI SDK 或 Provider 类型。
- 流式输出一旦开始，不得静默切换模型。
- 不得在无显式配置时默认启用重试或降级。

## Workflows

- 创建模型：

  ```ts
  const model = createModel({
    apiKey,
    baseUrl,
    model,
    fallbackModel,
    retry: { primaryMaxRetries: 1, fallbackMaxRetries: 1 },
  });
  ```

- 非流式调用：

  ```ts
  const result = await model.generate({ messages, temperature?, maxTokens?, model? });
  // result.text, result.model, result.runtime?.fallbackUsed, result.runtime?.primaryAttempts
  ```

- 流式调用：

  ```ts
  for await (const chunk of model.stream({ messages })) {
    // chunk.text — 内容
    // chunk.runtime — 仅在终止 chunk 出现
  }
  ```

- 本地调试 demo：

  ```bash
  cp apps/model-runtime-demo/.env.example apps/model-runtime-demo/.env
  pnpm --filter @ying-companion/model-runtime-demo dev
  ```

- 包目录约定：`abstractions/`、`config/`、`errors/`、`factories/`、`implementations/model/`

## Open Questions

- 下一阶段将进入 Core 抽象层与依赖注入设计（见需求文档）。
- 多 Provider 路由尚未实现；扩展时应在 Factory 内增加明确分支，不提前暴露占位字段。
- `normalizeMaxRetries`、`createRuntimeState` 等 runtime helper 当前为 OpenAI-compatible 实现内部私有函数；Stage 2 引入多 Provider 时再抽到共享 runtime 模块。
- `ai-core` 的 CJS 与 monorepo 其他包的 ESM 统一尚未处理。
- `ChatMessage.name` 尚未映射到 AI SDK 消息；`tools` 的 Core 级描述与校验待 Tool System 阶段定义。
- Observer 事件系统、指数退避、熔断器、限流等待后续 Core / Workflow 阶段处理。
