# AI Companion Core V1 - 阶段 1：Model Runtime 实施文档

## 文档合并说明

本文档已经吸收以下补丁文档的内容，并以当前实施结果作为阶段 1 的主线说明：

- [`01-model-runtime-patch.md`](./01-model-runtime-patch.md)：并入独立 Next.js demo 调试应用、`stream()` 流式接口、demo 与 Core SDK 职责分离、废弃 `packages/ai-core` 内人工 smoke 调试脚本与 console-only 验证方式。
- [`01-model-runtime-patch-2.md`](./01-model-runtime-patch-2.md)：并入模型重试、降级模型、运行时信息、运行时错误摘要、流式启动阶段降级、demo 中展示重试与降级结果。

两个补丁文件仍保留为变更来源记录；后续实施与验收以本文档为准。

---

## 一、阶段目标

建立 AI Companion Core 的运行时模型层（Model Runtime），完成以下能力：

1. 定义模型抽象接口
2. 实现 OpenAI 兼容模型调用
3. 建立 Model Factory
4. 支持普通生成与流式生成
5. 预留工具调用输入与输出结构
6. 支持模型重试与降级
7. 通过独立 demo 应用提供可观测输出

本阶段完成后，Core 将具备最基础的 AI 能力，并且不会把模型配置、环境变量读取、调试 UI 混入 SDK 内部。

---

## 二、阶段完成标准

完成后需要满足：

- `@ying-companion/ai-core` 可独立构建
- `@ying-companion/ai-core` 不直接依赖 OpenAI 官方 SDK
- `@ying-companion/ai-core` 通过 Vercel AI SDK 适配 OpenAI-compatible Provider
- 业务层不直接调用 OpenAI 兼容接口，只调用 Core 抽象
- `ai-core` 不读取环境变量
- `ai-core` 不承载 demo 页面、人工 smoke 脚本或 console-only 调试入口
- 模型配置由业务方以参数形式传入 `createModel`
- 支持非流式 `generate`
- 支持流式 `stream`
- 支持主模型重试
- 支持显式配置降级模型
- 支持降级模型重试
- 返回模型运行时信息
- 支持 `tools` 输入与 `toolCalls` 输出结构
- `apps/model-runtime-demo` 可读取环境变量、调用 Core，并在页面展示流式结果、重试与降级结果

---

## 三、目录结构

`packages/ai-core` 负责纯 SDK 能力：

```txt
packages/ai-core/
  src/
    abstractions/
      model.ts
    config/
      model-config.ts
    factories/
      model.factory.ts
    implementations/
      model/
        openai.ts
    index.ts
```

`apps/model-runtime-demo` 负责阶段 1 的人工调试输出：

```txt
apps/model-runtime-demo/
  app/
    api/
      model-runtime/
        route.ts
    model-runtime-panel.tsx
    page.tsx
```

设计调整来源：

- 来自 `01-model-runtime-patch.md`：demo 输出从 `packages/ai-core` 移到 `apps/model-runtime-demo`，Core SDK 目录不再承载人工调试脚本。
- 来自 `01-model-runtime-patch-2.md`：demo 继续作为人工调试入口，但需要额外展示重试、降级、最终使用模型与错误摘要。

---

## 四、配置规范

`ai-core` 不读取 `.env` 或 `process.env`。

模型配置由业务方读取后传入：

```ts
const model = createModel({
  apiKey: "...",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4o",
  fallbackModel: "gpt-4o-mini",
  retry: {
    primaryMaxRetries: 1,
    fallbackMaxRetries: 1,
  },
});
```

在当前 demo 应用中，环境变量放在：

```txt
apps/model-runtime-demo/.env
```

需要的变量：

```txt
OPENAI_API_KEY=your_api_key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o
OPENAI_FALLBACK_MODEL=gpt-4o-mini
OPENAI_PRIMARY_MAX_RETRIES=1
OPENAI_FALLBACK_MAX_RETRIES=1
```

注意：

- `BASE_URL` 必须支持 OpenAI 兼容 Chat Completions 接口
- 不配置 `OPENAI_FALLBACK_MODEL` 时不启用模型降级
- 重试次数默认值为 `0`，避免无感增加模型调用成本
- `.env` 只属于具体宿主应用，不属于 `ai-core`
- 未来 API 服务、Worker、后台任务都应各自读取自己的运行时配置，再传给 Core

Factory 参数结构：

```ts
export interface ModelRetryOptions {
  primaryMaxRetries?: number;
  fallbackMaxRetries?: number;
}

export interface CreateModelOptions {
  apiKey: string;
  baseUrl?: string;
  model: string;
  fallbackModel?: string;
  retry?: ModelRetryOptions;
}
```

---

## 五、抽象定义

### `abstractions/model.ts`

核心接口：

```ts
export interface ChatModel {
  generate(input: GenerateInput): Promise<GenerateOutput>;
  stream(input: GenerateInput): AsyncIterable<GenerateStreamChunk>;
}
```

输入：

```ts
export interface GenerateInput {
  messages: ChatMessage[];
  /**
   * TODO(stage-tool-system): Define and validate Core-level tool descriptors before adapting to AI SDK ToolSet.
   * Stage 1 keeps this field as a forward-compatible contract placeholder and does not execute tools.
   */
  tools?: Record<string, unknown>;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}
```

输出：

```ts
export interface GenerateOutput {
  text: string;
  model: string;
  raw: unknown;
  toolCalls?: ModelToolCall[];
  usage?: GenerateUsage;
  runtime?: ModelRuntimeInfo;
}
```

流式输出：

```ts
export interface GenerateStreamChunk {
  text: string;
  model?: string;
  raw: unknown;
  usage?: GenerateUsage;
  runtime?: ModelRuntimeInfo;
}
```

运行时信息：

```ts
export interface ModelRuntimeInfo {
  usedModel: string;
  fallbackUsed: boolean;
  primaryAttempts: number;
  fallbackAttempts: number;
  errors: ModelRuntimeErrorItem[];
}
```

设计原则：

- 不向业务方暴露 Vercel AI SDK 或 OpenAI-compatible Provider 类型
- 不在 Core 内使用 `any`
- 保持 Provider 可替换
- 未来可扩展 Claude / Gemini / DeepSeek
- tool call 结构先作为抽象层数据保留，后续阶段再实现工具执行系统
- 阶段 1 保留 `tools` 入参占位，但不传给 Provider，不执行工具

---

## 六、OpenAI 兼容实现

### `implementations/model/openai.ts`

当前实现使用 Vercel AI SDK：

- `ai`
- `@ai-sdk/openai-compatible`
- `zod`（AI SDK peer dependency）

它不引入 OpenAI 官方 SDK，也不在项目内手写 HTTP、SSE 分包、底层 token usage 解析。

能力：

- 通过 AI SDK 调用 OpenAI-compatible provider
- 支持普通非流式生成
- 支持流式输出
- 支持主模型重试与降级模型重试
- 支持主模型失败后切换到显式配置的降级模型
- 支持空文本输出触发重试
- 流式输出只在首个内容 chunk 之前重试或降级；一旦开始输出，不再静默切换模型
- AI SDK 内部 `maxRetries` 固定为 `0`，避免与 Core Runtime 重试计数叠加
- 支持自定义 `baseUrl`
- 通过 `includeUsage` 请求流式 usage 信息
- 将 AI SDK 的 `usage` 映射为 Core 自己的 `GenerateUsage`
- 将 AI SDK 的 `toolCalls` 映射为 Core 自己的 `ModelToolCall`
- 将 AI SDK 类型限制在实现层内部，不暴露给业务方

实现类不从包入口导出；配置通过 Factory 参数传入：

```ts
createModel({
  apiKey,
  baseUrl,
  model,
  fallbackModel,
  retry: {
    primaryMaxRetries: 1,
    fallbackMaxRetries: 1,
  },
});
```

---

## 七、Model Factory

### `factories/model.factory.ts`

Factory 只根据显式配置创建模型实例，对外公开 `CreateModelOptions`：

```ts
export function createModel(options: CreateModelOptions): ChatModel {
  return new OpenAICompatibleModel(options);
}
```

当前默认 Provider 为 OpenAI-compatible。

设计约束：

- Factory 不读取环境变量
- Factory 不依赖宿主应用
- 业务方负责读取与校验配置
- 默认不启用重试；宿主应用需要显式传入重试次数
- 降级模型必须显式配置
- 后续如需多 Provider，再在 Factory 内增加明确路由，不提前暴露占位字段

---

## 八、Demo 调试应用

### `apps/model-runtime-demo`

该应用是阶段 1 的可观测调试入口，替代旧的 SDK 内 runtime 脚本。

该调整来自 `01-model-runtime-patch.md`：原始 console-only 验证方式废弃，模型运行结果应通过 `apps/` 下独立 demo 应用观察；`packages/ai-core` 只保留 SDK 能力。

它负责：

1. 从自己的 `.env` 读取模型配置
2. 从自己的 `.env` 读取降级模型与重试次数
3. 调用 `createModel(config)`
4. 通过 `model.stream(input)` 请求模型
5. 在页面中逐段展示流式输出
6. 展示最终使用模型、是否降级、主模型尝试次数、降级模型尝试次数与错误摘要

运行方式：

```bash
cp apps/model-runtime-demo/.env.example apps/model-runtime-demo/.env
pnpm --filter @ying-companion/model-runtime-demo dev
```

打开 Next.js 输出的本地地址，点击「调用模型」。

如果页面逐段展示模型回复，则阶段 1 验证通过。

补丁来源：

- `01-model-runtime-patch.md`：要求 demo 页面以流式输出方式展示模型响应。
- `01-model-runtime-patch-2.md`：要求 demo 页面展示当前配置、最终使用模型、是否发生降级、主模型尝试次数、降级模型尝试次数与错误摘要。

---

## 九、本阶段设计原则

1. 模型必须通过抽象接口调用
2. 业务层不允许直接调用 Vercel AI SDK、OpenAI-compatible Provider 或 OpenAI HTTP 细节
3. `ai-core` 不读取环境变量
4. 运行时配置由业务方显式传入
5. 未来更换模型只需新增实现类或扩展 Factory
6. 不允许在后续模块重复实例化模型
7. Demo 与 Core SDK 职责分离
8. 重试与降级属于 Model Runtime 能力，不属于 demo 应用能力
9. 错误信息只暴露安全摘要，不透传底层完整错误对象

---

## 十、阶段成果总结

完成本阶段后，你将拥有：

- 可替换的模型抽象层
- OpenAI 兼容实现
- 显式参数驱动的模型配置
- 普通生成能力
- 流式生成能力
- 主模型重试能力
- 降级模型与降级模型重试能力
- 模型运行时信息与安全错误摘要
- tool call 结构预留
- 独立 demo 调试入口
- demo 中可观测流式输出、重试与降级结果
- AI 能力正式接入 Core

下一阶段将进入 Core 抽象层与依赖注入设计。
