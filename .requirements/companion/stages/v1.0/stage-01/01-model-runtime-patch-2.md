# AI Companion Core V1 - 阶段 1：Model Runtime 补丁说明 2

> 文件名：`01-model-runtime-patch-2.md`
> 关联主文档：`01-model-runtime.md`
> 关联补丁：`01-model-runtime-patch.md`
> 补丁主题：补充模型重试机制与模型降级机制

## 一、补丁背景

当前阶段 1 已经完成 Model Runtime 基础能力：

1. `@ying-companion/ai-core` 提供模型抽象；
2. 通过 Vercel AI SDK 适配 OpenAI-compatible Provider；
3. 支持普通生成 `generate`；
4. 支持流式生成 `stream`；
5. `ai-core` 不读取环境变量；
6. `apps/model-runtime-demo` 负责读取环境变量并提供人工调试入口。

但当前方案还缺少两个生产级 AI Runtime 必备能力：

1. **模型重试机制**
   当模型请求失败，或模型输出不满足基本要求时，应支持自动重试。

2. **模型降级机制**
   当主模型不可用、连续失败、超时、或输出持续不合格时，应支持切换到降级模型继续生成。

因此本补丁在不破坏已有阶段 1 设计边界的前提下，补充 Model Runtime 的 Retry / Fallback 能力。

---

## 二、补丁目标

本补丁需要实现以下能力：

1. 支持配置主模型；
2. 支持配置降级模型；
3. 支持配置主模型重试次数；
4. 支持配置降级模型重试次数；
5. 支持模型调用失败后自动重试；
6. 支持主模型失败后切换到降级模型；
7. 支持模型输出异常时触发重试；
8. 支持普通生成 `generate` 的重试与降级；
9. 支持流式生成 `stream` 的启动阶段降级；
10. 在 `apps/model-runtime-demo` 中展示当前使用模型、重试次数与是否发生降级。

---

## 三、设计边界

### `packages/ai-core` 负责

`ai-core` 只负责抽象与执行逻辑：

1. 定义 Retry / Fallback 配置类型；
2. 定义模型调用策略；
3. 实现主模型与降级模型的切换；
4. 实现重试控制；
5. 返回本次调用实际使用的模型信息；
6. 不读取 `.env`；
7. 不关心环境变量名称；
8. 不关心 demo UI。

### `apps/model-runtime-demo` 负责

`model-runtime-demo` 只负责宿主应用配置：

1. 读取主模型配置；
2. 读取降级模型配置；
3. 读取重试次数配置；
4. 将配置传入 `createModel`；
5. 展示模型运行过程与结果。

---

## 四、环境变量补充

当前已有环境变量：

```txt
OPENAI_API_KEY=
OPENAI_BASE_URL=
OPENAI_MODEL=
```

本补丁建议在 `apps/model-runtime-demo/.env` 中补充：

```txt
OPENAI_FALLBACK_MODEL=
OPENAI_PRIMARY_MAX_RETRIES=1
OPENAI_FALLBACK_MAX_RETRIES=1
```

说明：

1. `OPENAI_MODEL` 表示主模型；
2. `OPENAI_FALLBACK_MODEL` 表示降级模型；
3. `OPENAI_PRIMARY_MAX_RETRIES` 表示主模型最大重试次数；
4. `OPENAI_FALLBACK_MAX_RETRIES` 表示降级模型最大重试次数。

示例：

```txt
OPENAI_MODEL=gpt-4o
OPENAI_FALLBACK_MODEL=gpt-4o-mini
OPENAI_PRIMARY_MAX_RETRIES=1
OPENAI_FALLBACK_MAX_RETRIES=1
```

含义：

```txt
先调用 gpt-4o

失败后重试 1 次

仍然失败则切换到 gpt-4o-mini

gpt-4o-mini 失败后重试 1 次
```

---

## 五、配置结构调整

### `config/model-config.ts`

在已有模型配置基础上补充：

```ts
export interface ModelRetryOptions {
  /**
   * 主模型最大重试次数。
   *
   * 注意：
   * - 0 表示不重试，只调用一次；
   * - 1 表示失败后再重试一次；
   * - 总尝试次数 = 1 + maxRetries。
   */
  primaryMaxRetries?: number;

  /**
   * 降级模型最大重试次数。
   *
   * 规则同 primaryMaxRetries。
   */
  fallbackMaxRetries?: number;
}

export interface CreateModelOptions {
  apiKey: string;
  baseUrl?: string;

  /**
   * 主模型。
   */
  model: string;

  /**
   * 降级模型。
   *
   * 不传则不启用模型降级。
   */
  fallbackModel?: string;

  /**
   * 重试配置。
   */
  retry?: ModelRetryOptions;
}
```

设计原则：

1. `fallbackModel` 是可选的；
2. 不传 `fallbackModel` 时，只执行主模型重试；
3. 不配置 `retry` 时使用默认值；
4. 默认值应在 Factory 或 Runtime 内部补齐；
5. `ai-core` 不知道环境变量存在。

---

## 六、默认配置

建议默认值：

```ts
const DEFAULT_PRIMARY_MAX_RETRIES = 0;
const DEFAULT_FALLBACK_MAX_RETRIES = 0;
```

原因：

1. 默认行为应尽量接近当前已完成阶段 1 的行为；
2. 不应该在用户无感知的情况下增加额外模型调用成本；
3. demo 可以显式配置重试次数验证能力。

如果宿主应用希望启用重试，应显式传入：

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

## 七、抽象输出结构补充

当前 `GenerateOutput` 已经包含：

```ts
export interface GenerateOutput {
  text: string;
  model: string;
  raw: unknown;
  toolCalls?: ModelToolCall[];
  usage?: GenerateUsage;
}
```

本补丁建议补充运行时元信息：

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

新增：

```ts
export interface ModelRuntimeInfo {
  /**
   * 本次最终使用的模型。
   */
  usedModel: string;

  /**
   * 是否使用了降级模型。
   */
  fallbackUsed: boolean;

  /**
   * 主模型尝试次数。
   */
  primaryAttempts: number;

  /**
   * 降级模型尝试次数。
   */
  fallbackAttempts: number;

  /**
   * 失败原因摘要。
   *
   * 只放可安全展示的信息，不暴露完整底层错误对象。
   * 类型与 ModelRuntimeError 错误类中的 errors 字段保持一致。
   */
  errors: ModelRuntimeErrorItem[];
}

/**
 * 单条模型调用失败摘要。
 *
 * 注意：此类型与十一节中 ModelRuntimeError 错误类的 errors 字段类型相同，
 * 统一命名为 ModelRuntimeErrorItem，避免与错误类 ModelRuntimeError 产生命名冲突。
 */
export interface ModelRuntimeErrorItem {
  model: string;
  attempt: number;
  phase: "primary" | "fallback";
  message: string;
}
```

设计原则：

1. `model` 字段继续保留，代表最终实际使用的模型，维持向后兼容；
2. `runtime.usedModel` 与 `model` 保持一致；两者冗余是有意为之，`model` 是面向业务的简洁字段，`runtime.usedModel` 是面向调试的结构化字段，实现时需注释说明；
3. `runtime` 用于调试与观测；
4. 不把底层完整错误对象透传给业务层；
5. 后续可接入 Core Observer，但阶段 1 不强依赖 Observer。

---

## 八、模型输出异常判定

重试不应该只处理网络错误，也应该处理明显不可用的模型输出。

本阶段先定义最小输出校验规则。

### 普通生成 `generate`

以下情况视为输出异常：

1. 模型返回空文本；
2. 模型返回纯空白字符串；
3. Vercel AI SDK 抛出异常；
4. 输出解析 tool call 时发生不可恢复错误。

建议实现一个内部函数：

```ts
function validateGenerateOutput(output: GenerateOutput): void {
  if (!output.text.trim() && !output.toolCalls?.length) {
    throw new Error("Model output is empty");
  }
}
```

说明：

1. 如果有 `toolCalls`，即使 `text` 为空，也不视为异常；
2. 因为阶段 1 已预留 tool call 结构，后续工具阶段可能出现纯 tool call 输出；
3. 当前阶段不执行工具，只保留结构。

### 流式生成 `stream`

流式输出存在特殊性。

一旦已经向外 yield 了部分内容，再发生错误，就不能无缝切换模型，否则用户会看到前后模型混杂输出。

因此阶段 1 对 `stream` 的降级策略限定为：

1. 如果流开始前失败，可以重试或降级；
2. 如果流已经输出过内容后失败，不做模型降级；
3. 已输出后失败，应抛出流式错误，由宿主应用展示错误状态。

#### 流式输出的 runtime 信息暴露方案

当前 `ChatModel` 接口定义为：

```ts
stream(input: GenerateInput): AsyncIterable<GenerateStreamChunk>;
```

`GenerateStreamChunk` 本身不携带 runtime 元信息，无法直接让调用方知道是否发生了降级。

本补丁采用**方案 A**：在最后一个 chunk（即携带 `usage` 的终止 chunk）中附加可选的 `runtime` 字段。

`GenerateStreamChunk` 扩展为：

```ts
export interface GenerateStreamChunk {
  text: string;
  model?: string;
  raw: unknown;
  usage?: GenerateUsage;

  /**
   * 仅在最后一个 chunk（usage chunk）中出现。
   *
   * 普通内容 chunk 中此字段为 undefined，
   * 调用方可通过判断 chunk.runtime !== undefined 来识别终止 chunk。
   */
  runtime?: ModelRuntimeInfo;
}
```

说明：

1. 普通内容 chunk 不携带 `runtime`，性能无影响；
2. 终止 chunk 携带完整 `runtime`，调用方可在循环结束时读取；
3. 这是最小破坏性改动，不更改 `ChatModel` 接口签名；
4. 如果流在未输出任何 chunk 前就发生不可恢复的错误，直接抛出 `ModelRuntimeError`，不产生 runtime chunk；
5. 后续阶段如需更结构化的流控制，可考虑方案 B（返回结构体），但阶段 1 优先保持简单。

---

## 九、重试与降级执行规则

### 非流式 `generate`

执行顺序：

```txt
主模型第 1 次
↓
主模型重试 N 次
↓
如果仍失败，并且配置了 fallbackModel
↓
降级模型第 1 次
↓
降级模型重试 M 次
↓
如果仍失败
↓
抛出最终错误
```

其中：

```txt
主模型最大尝试次数 = 1 + primaryMaxRetries
降级模型最大尝试次数 = 1 + fallbackMaxRetries
```

### 流式 `stream`

执行顺序：

```txt
尝试启动主模型 stream
↓
如果 stream 尚未输出内容前失败
↓
主模型重试 N 次
↓
如果仍失败，并且配置了 fallbackModel
↓
尝试启动降级模型 stream
↓
降级模型重试 M 次
↓
一旦任意模型已经输出内容
↓
不再降级
```

---

## 十、内部实现建议

### Runtime 调用计划

建议在实现层内部构造调用计划：

```ts
interface ModelAttemptPlan {
  phase: "primary" | "fallback";
  model: string;
  maxRetries: number;
}
```

根据配置生成：

```ts
const plans: ModelAttemptPlan[] = [
  {
    phase: "primary",
    model: options.model,
    maxRetries: options.retry?.primaryMaxRetries ?? 0,
  },
];

if (options.fallbackModel) {
  plans.push({
    phase: "fallback",
    model: options.fallbackModel,
    maxRetries: options.retry?.fallbackMaxRetries ?? 0,
  });
}
```

### 尝试次数循环

伪代码：

```ts
for (const plan of plans) {
  const maxAttempts = 1 + plan.maxRetries;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const output = await generateOnce(input, plan.model);

      validateGenerateOutput(output);

      return withRuntimeInfo(output, {
        usedModel: plan.model,
        fallbackUsed: plan.phase === "fallback",
        primaryAttempts,
        fallbackAttempts,
        errors,
      });
    } catch (error) {
      errors.push(toRuntimeError(error, plan, attempt));
    }
  }
}

throw createModelRuntimeError(errors);
```

### 注意事项

1. 重试逻辑应放在 `OpenAICompatibleModel` 内部，或者抽成独立 Runtime 包装器；
2. 不要把重试逻辑写到 demo 应用中；
3. demo 只传配置，不负责业务逻辑；
4. `generateOnce` 只负责单次模型调用；
5. `generate` 负责调用计划、重试、降级与输出封装。

---

## 十一、错误类型补充

建议新增模型运行时错误：

```ts
export class ModelRuntimeError extends Error {
  constructor(
    message: string,
    public readonly errors: ModelRuntimeErrorItem[],
  ) {
    super(message);
    this.name = "ModelRuntimeError";
  }
}

export interface ModelRuntimeErrorItem {
  model: string;
  attempt: number;
  phase: "primary" | "fallback";
  message: string;
}
```

说明：

1. 所有模型都失败后，抛出 `ModelRuntimeError`；
2. `errors` 中只包含安全摘要；
3. 不暴露 API Key、请求 Header、完整响应体；
4. demo 可以读取 `errors` 并展示失败摘要。

---

## 十二、Demo 应用调整

### `.env.example` 补充

`apps/model-runtime-demo/.env.example` 补充：

```txt
OPENAI_FALLBACK_MODEL=
OPENAI_PRIMARY_MAX_RETRIES=1
OPENAI_FALLBACK_MAX_RETRIES=1
```

### 配置读取

在 demo 应用读取环境变量后传入：

```ts
const model = createModel({
  apiKey: process.env.OPENAI_API_KEY!,
  baseUrl: process.env.OPENAI_BASE_URL,
  model: process.env.OPENAI_MODEL!,
  fallbackModel: process.env.OPENAI_FALLBACK_MODEL || undefined,
  retry: {
    // 使用 parseInt 而非 Number，避免非数字字符串（如 "abc"）返回 NaN 导致重试次数异常
    primaryMaxRetries: parseInt(process.env.OPENAI_PRIMARY_MAX_RETRIES ?? "0", 10) || 0,
    fallbackMaxRetries: parseInt(process.env.OPENAI_FALLBACK_MAX_RETRIES ?? "0", 10) || 0,
  },
});
```

### 页面展示

页面应展示：

```txt
主模型
降级模型
主模型重试次数
降级模型重试次数
最终使用模型
是否发生降级
主模型尝试次数
降级模型尝试次数
错误摘要
```

如果是流式输出，至少展示：

```txt
当前配置
当前输出文本
是否流式启动成功
错误摘要
```

---

## 十三、可观测输出要求

### generate 可观测结果

当调用 `generate` 时，demo 或 console 应能看到：

```txt
[Model Runtime]
primary model: gpt-4o
fallback model: gpt-4o-mini
primary max retries: 1
fallback max retries: 1

[Model Attempt]
phase: primary
model: gpt-4o
attempt: 1

[Model Attempt Failed]
phase: primary
model: gpt-4o
attempt: 1
message: ...

[Model Attempt]
phase: fallback
model: gpt-4o-mini
attempt: 1

[Model Runtime Result]
used model: gpt-4o-mini
fallback used: true
primary attempts: 2
fallback attempts: 1
```

### stream 可观测结果

当调用 `stream` 时，demo 应能看到：

```txt
[Stream Runtime]
primary model: gpt-4o
fallback model: gpt-4o-mini

[Stream Attempt]
phase: primary
model: gpt-4o
attempt: 1

[Stream Started]
model: gpt-4o

[Stream Chunk]
text: ...

[Stream Finished]
model: gpt-4o
```

如果流启动前失败并降级：

```txt
[Stream Attempt Failed Before First Chunk]
phase: primary
model: gpt-4o
attempt: 1

[Stream Attempt]
phase: fallback
model: gpt-4o-mini
attempt: 1

[Stream Started]
model: gpt-4o-mini
```

---

## 十四、完成标准

本补丁完成后，需要满足：

1. `CreateModelOptions` 支持 `fallbackModel`；
2. `CreateModelOptions` 支持 `retry.primaryMaxRetries`；
3. `CreateModelOptions` 支持 `retry.fallbackMaxRetries`；
4. `generate` 支持主模型重试；
5. `generate` 支持主模型失败后降级；
6. `generate` 支持降级模型重试；
7. `generate` 返回实际使用模型；
8. `generate` 返回是否发生降级；
9. `generate` 返回主模型与降级模型尝试次数；
10. `stream` 支持启动阶段的重试与降级；
11. `stream` 已经输出内容后不再自动降级；
12. demo 应用可配置降级模型与重试次数；
13. demo 页面可展示模型降级与重试结果；
14. `ai-core` 仍然不读取环境变量；
15. `ai-core` 仍然不直接依赖 OpenAI 官方 SDK；
16. 业务层仍然只调用 Core 抽象。

---

## 十五、非目标

本补丁不处理以下内容：

1. 多 Provider 路由；
2. Claude / Gemini / DeepSeek 独立 Provider；
3. 基于错误类型的精细化降级策略；
4. 指数退避；
5. 熔断器；
6. 请求队列；
7. 限流；
8. 成本统计；
9. 用户级模型策略；
10. 多租户模型配置；
11. Observer 事件系统；
12. LangChain；
13. LangGraph。

这些内容放到后续 Core 抽象层、Workflow 或运维策略阶段再处理。

---

## 十六、设计原则补充

本补丁延续阶段 1 的设计原则，并补充：

1. 重试与降级属于 Model Runtime 能力，不属于 demo 应用能力；
2. demo 只负责传入配置与展示结果；
3. 默认不启用重试，避免隐式增加调用成本；
4. 降级模型必须显式配置；
5. 输出异常也应纳入重试判断；
6. 流式输出一旦开始，就不再静默切换模型；
7. 错误信息必须做安全摘要；
8. 运行时信息必须可观测；
9. 不能破坏已有 `ChatModel` 抽象；
10. 不能让业务层感知 Vercel AI SDK 内部类型。

---

## 十七、补丁后的阶段 1 完成标准更新

阶段 1 完成标准更新为：

1. `@ying-companion/ai-core` 可被独立构建；
2. `@ying-companion/ai-core` 不直接依赖 OpenAI 官方 SDK；
3. `@ying-companion/ai-core` 使用 Vercel AI SDK 承接模型协议细节；
4. `@ying-companion/ai-core` 支持普通生成；
5. `@ying-companion/ai-core` 支持流式生成；
6. `@ying-companion/ai-core` 支持主模型重试；
7. `@ying-companion/ai-core` 支持降级模型；
8. `@ying-companion/ai-core` 支持降级模型重试；
9. `@ying-companion/ai-core` 不读取环境变量；
10. 模型配置、降级模型、重试次数全部由业务方参数传入；
11. `apps/model-runtime-demo` 可读取模型环境变量；
12. `apps/model-runtime-demo` 可调用模型并流式展示回复；
13. `apps/model-runtime-demo` 可展示重试与降级结果；
14. demo 输出与 Core SDK 构建职责分离。

---

## 十八、下一步衔接

完成本补丁后，阶段 2「Core 抽象层」可以直接复用 Model Runtime 的以下能力：

1. 可注入模型实例；
2. 可读取模型运行时信息；
3. 可观测模型失败、重试与降级；
4. 可在后续 Observer 系统中统一收敛模型运行事件；
5. 可在后续 Workflow 中把模型调用作为标准节点处理。

本补丁只增强 Model Runtime，不提前实现 Core Observer、Workflow、Memory、Emotion 或 Tool 执行。
