# AI Companion Core V1 - 阶段 2：Core 抽象层实施文档

## 文档说明

本文档用于指导实现：

```txt
.requirements/stages/stage-02/02-core-abstractions.md
```

当前项目已经完成：

```txt
阶段 1：Model Runtime
```

阶段 1 已经建立了：

1. `ChatModel` 模型抽象；
2. OpenAI-compatible 模型实现；
3. `generate` 普通生成；
4. `stream` 流式生成；
5. 主模型重试；
6. 降级模型；
7. 降级模型重试；
8. 模型运行时信息；
9. tool call 结构预留；
10. 独立 `apps/model-runtime-demo` 调试应用。

阶段 2 的目标不是实现聊天业务，而是建立 Core 的抽象层、依赖注入容器、Provider 插槽、Persona 抽象、Observer 抽象与默认实现。

本阶段完成后，后续 Memory、Emotion、Tool、Safety、Workflow、Persona 都可以作为插件式能力接入 Core，而不会散落在业务代码里。

---

## 一、阶段目标

阶段 2 要完成的是：

```txt
Core 的能力边界成型
```

具体包括：

1. 定义统一 Provider 元信息；
2. 定义 Core Context；
3. 定义 CompanionCore 实例；
4. 定义 createCompanionCore 工厂；
5. 定义 CoreObserver；
6. 定义 PersonaProvider；
7. 定义 MemoryProvider；
8. 定义 EmotionEngine；
9. 定义 ToolProvider / ToolRegistry；
10. 定义 SafetyProvider；
11. 定义 ChatWorkflow；
12. 提供所有非 Model 模块的默认实现；
13. 在 demo 中展示 Core 初始化结果；
14. 保证阶段 1 的 Model Runtime 能力不被破坏。

---

## 二、阶段边界

### 本阶段要做

本阶段只做抽象层与默认实现。

需要支持：

```ts
const core = createCompanionCore({
  model,
});
```

也需要支持完整注入：

```ts
const core = createCompanionCore({
  model,
  persona,
  memory,
  emotion,
  tools,
  safety,
  workflow,
  observer,
});
```

其中只有 `model` 是必传。

其它能力未传入时，Core 使用默认实现补齐。

### 本阶段不做

本阶段不做以下内容：

1. 不实现真实聊天主链路；
2. 不实现真实长期记忆；
3. 不实现 RAG；
4. 不实现真实情绪识别；
5. 不实现真实情绪状态转移；
6. 不实现真实工具调用；
7. 不实现敏感词过滤；
8. 不实现 LangChain；
9. 不实现 LangGraph；
10. 不实现数据库；
11. 不实现用户系统；
12. 不实现鉴权；
13. 不实现正式业务 UI。

这些能力放到后续阶段。

---

## 三、承接阶段 1 的约束

阶段 2 必须继续遵守阶段 1 已确定的设计边界：

1. `ai-core` 是纯 SDK；
2. `ai-core` 不读取 `.env`；
3. `ai-core` 不读取 `process.env`；
4. 模型配置由宿主应用显式传入；
5. 模型调用必须通过 `ChatModel` 抽象；
6. 业务层不直接调用 Vercel AI SDK；
7. 业务层不直接调用 OpenAI-compatible Provider；
8. 不允许在后续模块重复实例化模型；
9. demo 与 Core SDK 职责分离；
10. 错误信息只暴露安全摘要；
11. tool call 当前只保留结构，不执行工具；
12. 阶段 2 不允许破坏阶段 1 的 `model-runtime-demo`。

---

## 四、核心原则

### 4.1 抽象先行，实现延后

阶段 2 的重点不是让 AI Companion 变聪明，而是让 Core 的能力插槽稳定。

本阶段的成功标准是：

```txt
Core 能清楚知道自己挂载了哪些能力
```

不是：

```txt
Core 已经能完整聊天
```

### 4.2 Core 保持无状态

阶段 2 的 Core 不保存用户状态，不保存会话状态，不保存短期历史，不保存长期记忆。

所有运行时数据都由调用方传入。

例如：

```ts
workflow.execute({
  sessionId,
  message,
  history,
});
```

这意味着：

```txt
宿主应用负责保存 history
Core 负责消费 history
```

### 4.3 sessionId 不是用户系统

阶段 2 中出现的 `sessionId` 只表示一次伴侣关系或会话隔离标识。

它不是：

1. 用户 ID；
2. 鉴权 ID；
3. 租户 ID；
4. 数据库主键。

未来接用户系统时，可以由业务层把：

```txt
userId + companionId
```

映射成：

```txt
sessionId
```

Core 不关心用户系统。

### 4.3.1 Core 实例生命周期（推荐模型）

阶段 2 不实现用户系统，但需要提前约定宿主如何使用 Core，避免后续记忆键、伴侣隔离设计摇摆。

推荐模型：

```txt
一个逻辑伴侣实例 = 一个 CompanionCore 实例
```

具体约定：

1. 每个用户下的每个伴侣，由业务层创建独立的 `createCompanionCore({ model, persona, ... })`；
2. `sessionId` 不由 Core 持久化，而是在每次 `executeWorkflow` / 后续聊天调用时由宿主传入；
3. 短期 `history` 由宿主维护，按 `sessionId` 隔离后传入 `ChatWorkflowInput.history`；
4. 不建议多个用户 / 多个伴侣共享同一个 `CompanionCore` 实例，除非宿主能保证所有 Provider 调用都带正确 `sessionId` 且 Provider 实现完全无实例级可变状态。

未来接用户系统时：

```txt
业务层：userId + companionId → sessionId + 独立 Core 实例（或等价隔离策略）
Core：只消费 sessionId，不感知 userId
```

### 4.4 Provider 必须有稳定 meta

不要使用：

```ts
constructor.name;
```

来判断 Provider 名称。

原因：

1. 打包后类名可能被压缩；
2. 生产环境不稳定；
3. 不利于调试；
4. 不利于后续插件系统。

每个 Provider 都必须暴露：

```ts
readonly meta: CoreProviderMeta;
```

### 4.5 abstraction 层不能依赖 core 实现层

`abstractions/` 里的类型不能 import `core/` 或 `implementations/` 里的具体实现。

避免出现：

```txt
abstractions -> core
core -> abstractions
```

实现层倒置循环依赖。

如果 workflow 需要 Core Context 类型，Context 类型也应该放在 `abstractions/`（如 `core-context.ts`），而不是 `core/`。

#### abstractions 内部的类型互引

`core-context.ts` 与 `workflow.ts` 会互相引用类型（Context 含 `ChatWorkflow`，Workflow 含 `CompanionCoreContext`）。这属于 abstraction 层内部的类型环，**不等于** `abstractions -> core` 实现层倒置。

实现约定：

1. 互引文件一律使用 `import type`，不要引入运行时代码或副作用；
2. 若 TypeScript 或构建工具对类型环敏感，可将 `CompanionCoreContext` 与 `ChatWorkflow` 抽到同一文件再拆分 re-export，但阶段 2 默认优先用 `import type` 解决；
3. 除类型互引外，`abstractions/` 下其它文件也不要 import `core/` 或 `implementations/`。

---

## 五、目录结构

阶段 2 建议目录结构如下：

```txt
packages/ai-core/
  src/
    abstractions/
      core-context.ts
      provider.ts
      observer.ts
      persona.ts
      memory.ts
      emotion.ts
      tool.ts
      safety.ts
      workflow.ts
      model.ts

    core/
      companion-core.ts
      companion-core-factory.ts

    implementations/
      persona/
        default-persona-provider.ts
      memory/
        disabled-memory-provider.ts
      emotion/
        disabled-emotion-engine.ts
      tool/
        empty-tool-registry.ts
      safety/
        passthrough-safety-provider.ts
      workflow/
        disabled-chat-workflow.ts
      observer/
        noop-core-observer.ts
      model/
        openai.ts

    config/
      model-config.ts

    factories/
      model.factory.ts

    index.ts
```

说明：

1. `abstractions/` 只放接口、类型、契约；
2. `core/` 只放 Core 实例和工厂；
3. `implementations/` 放所有默认实现与阶段 1 模型实现（`model/openai.ts`），**只有一个 `implementations/` 目录**；
4. 阶段 1 已完成的 Model Runtime 文件继续保留；
5. 不要把 `CompanionCoreContext` 放到 `core/` 后再被 `workflow.ts` 反向引用；
6. 不要重复创建第二套 model 抽象。

---

## 六、Provider 元信息

### 文件位置

```txt
packages/ai-core/src/abstractions/provider.ts
```

### 目标

为所有 Provider 提供稳定、可展示、可调试的元信息。

### 类型定义

```ts
export type CoreProviderKind =
  | "model"
  | "persona"
  | "memory"
  | "emotion"
  | "tool"
  | "safety"
  | "workflow"
  | "observer";

export interface CoreProviderMeta {
  id: string;
  kind: CoreProviderKind;
  name: string;
  description?: string;
  version?: string;
}

export interface CoreProvider {
  readonly meta: CoreProviderMeta;
}
```

### 设计说明

所有 Provider 都应该实现或兼容 `CoreProvider`。

例如：

```ts
export class DisabledMemoryProvider implements MemoryProvider {
  readonly meta = {
    id: "memory.disabled",
    kind: "memory",
    name: "Disabled Memory Provider",
  } as const;
}
```

### 命名建议

默认 Provider 的 id 使用以下格式：

```txt
persona.default
memory.disabled
emotion.disabled
tool.empty-registry
safety.passthrough
workflow.disabled
observer.noop
```

---

## 七、Core Observer 抽象

### 文件位置

```txt
packages/ai-core/src/abstractions/observer.ts
```

### 目标

为 Core 提供统一可观测事件通道。

从阶段 2 开始，不建议在 `ai-core` 中直接写死 `console.log`。

Core 只负责发事件。

宿主应用可以选择：

1. 忽略事件；
2. 打印事件；
3. 在 demo UI 展示事件；
4. 后续接日志系统。

### 类型定义

```ts
import type { CoreProvider } from "./provider";

export type CoreEventType =
  | "core:init"
  | "persona:load:start"
  | "persona:load:end"
  | "memory:recall:start"
  | "memory:recall:end"
  | "memory:save:start"
  | "memory:save:end"
  | "emotion:analyze:start"
  | "emotion:analyze:end"
  | "tool:list"
  | "tool:register"
  | "tool:execute:start"
  | "tool:execute:end"
  | "safety:input:start"
  | "safety:input:end"
  | "safety:output:start"
  | "safety:output:end"
  | "workflow:start"
  | "workflow:step"
  | "workflow:end"
  | "workflow:error";

export interface CoreEvent<TPayload = unknown> {
  type: CoreEventType;
  timestamp: Date;
  payload?: TPayload;
}

export interface CoreObserver extends CoreProvider {
  emit(event: CoreEvent): void | Promise<void>;
}
```

### emit 策略

阶段 2 约定：

1. `observer.emit` 不应该阻断 Core 主流程；
2. `NoopCoreObserver` 永远不抛错；
3. `createCompanionCore` 内部触发 `core:init`；
4. 如果自定义 observer **同步**抛错，Core Factory 应该捕获并忽略；
5. 如果 `emit` 返回 `Promise`，Factory 必须用 `.catch(() => {})` 吞掉 rejection，避免 unhandled rejection；
6. 后续阶段再决定是否提供严格 observer 模式。

### 默认实现

文件：

```txt
packages/ai-core/src/implementations/observer/noop-core-observer.ts
```

实现：

```ts
import type { CoreEvent, CoreObserver } from "../../abstractions/observer";

export class NoopCoreObserver implements CoreObserver {
  readonly meta = {
    id: "observer.noop",
    kind: "observer",
    name: "Noop Core Observer",
  } as const;

  emit(_event: CoreEvent): void {
    // noop
  }
}
```

---

## 八、PersonaProvider 抽象

### 文件位置

```txt
packages/ai-core/src/abstractions/persona.ts
```

### 目标

Persona 是 AI Companion 的核心能力之一。

阶段 2 必须预留 Persona 插槽，避免阶段 3 做聊天时把角色设定硬编码进 workflow 或 demo。

Persona 需要支持：

1. 伴侣角色名称；
2. 性别；
3. 关系设定；
4. 性格描述；
5. 说话风格；
6. 背景设定；
7. 可扩展 metadata。

### 类型定义

```ts
import type { CoreProvider } from "./provider";

export type CompanionGender = "female" | "male" | "non_binary" | "unknown";

export interface CompanionPersona {
  id: string;
  name: string;
  gender: CompanionGender;
  relationship?: string;
  personality?: string;
  speakingStyle?: string;
  background?: string;
  systemPrompt?: string;
  metadata?: Record<string, unknown>;
}

export interface PersonaLoadInput {
  sessionId?: string;
  personaId?: string;
  metadata?: Record<string, unknown>;
}

export interface PersonaProvider extends CoreProvider {
  load(input?: PersonaLoadInput): Promise<CompanionPersona>;
}
```

### 默认实现

文件：

```txt
packages/ai-core/src/implementations/persona/default-persona-provider.ts
```

实现：

```ts
import type {
  CompanionPersona,
  PersonaLoadInput,
  PersonaProvider,
} from "../../abstractions/persona";

export class DefaultPersonaProvider implements PersonaProvider {
  readonly meta = {
    id: "persona.default",
    kind: "persona",
    name: "Default Persona Provider",
  } as const;

  constructor(private readonly persona?: Partial<CompanionPersona>) {}

  async load(_input?: PersonaLoadInput): Promise<CompanionPersona> {
    return {
      id: this.persona?.id ?? "default-companion",
      name: this.persona?.name ?? "映映",
      gender: this.persona?.gender ?? "female",
      relationship: this.persona?.relationship ?? "你的 AI 伴侣",
      personality: this.persona?.personality ?? "温柔、真诚、愿意倾听",
      speakingStyle: this.persona?.speakingStyle ?? "自然、亲近、不过度夸张",
      background: this.persona?.background,
      systemPrompt: this.persona?.systemPrompt,
      metadata: this.persona?.metadata,
    };
  }
}
```

### 设计说明

1. `DefaultPersonaProvider` 内置的「映映 / female」等默认值 **仅供 demo 与本地调试**，不代表产品固定角色；
2. 产品侧 Persona 应由宿主通过 `new DefaultPersonaProvider({ gender: "male", ... })` 注入，或后续替换为数据库 / 配置驱动的 PersonaProvider；
3. 阶段 3 可直接消费 `PersonaProvider.load()` 结果，**不得在 Workflow 或 demo 里另写一套硬编码角色设定**；
4. 后续可替换为数据库 PersonaProvider；
5. 不要在阶段 2 接数据库；
6. 不要在阶段 2 接用户系统；
7. 性别必须是可配置字段；`CompanionGender` 已包含 `male` / `female` / `non_binary` / `unknown`，默认实现不得在产品路径上写死单一性别。

---

## 九、MemoryProvider 抽象

### 文件位置

```txt
packages/ai-core/src/abstractions/memory.ts
```

### 目标

为后续长期记忆、RAG、记忆写回预留边界。

本阶段不做真实记忆。

### 类型定义

```ts
import type { CoreProvider } from "./provider";

export type MemoryType = "fact" | "preference" | "event" | "relationship";

export interface Memory {
  id: string;
  type: MemoryType;
  content: string;
  importance?: number;
  metadata?: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface MemoryRecallInput {
  sessionId?: string;
  message: string;
  topK?: number;
  metadata?: Record<string, unknown>;
}

export interface MemorySaveInput {
  sessionId?: string;
  memories: Memory[];
  metadata?: Record<string, unknown>;
}

export interface MemoryProvider extends CoreProvider {
  recall(input: MemoryRecallInput): Promise<Memory[]>;
  save(input: MemorySaveInput): Promise<void>;
}
```

### 默认实现

文件：

```txt
packages/ai-core/src/implementations/memory/disabled-memory-provider.ts
```

实现：

```ts
import type {
  Memory,
  MemoryProvider,
  MemoryRecallInput,
  MemorySaveInput,
} from "../../abstractions/memory";

export class DisabledMemoryProvider implements MemoryProvider {
  readonly meta = {
    id: "memory.disabled",
    kind: "memory",
    name: "Disabled Memory Provider",
  } as const;

  async recall(_input: MemoryRecallInput): Promise<Memory[]> {
    return [];
  }

  async save(_input: MemorySaveInput): Promise<void> {
    // noop
  }
}
```

### 设计说明

1. 当前只定义长期记忆接口；
2. 短期历史不放到 MemoryProvider；
3. 短期历史由宿主通过 `ChatWorkflowInput.history` 传入；
4. 阶段 4 再实现具体记忆系统；
5. 当前不设计数据库表；
6. 当前不引入 pgvector。

---

## 十、EmotionEngine 抽象

### 文件位置

```txt
packages/ai-core/src/abstractions/emotion.ts
```

### 目标

为后续情绪状态机预留边界。

本阶段不做真实情绪识别。

### 类型定义

```ts
import type { CoreProvider } from "./provider";

export type EmotionType = "neutral" | "happy" | "sad" | "angry" | "anxious" | "affectionate";

export interface EmotionState {
  current: EmotionType;
  intensity: number;
  updatedAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface EmotionAnalyzeInput {
  sessionId?: string;
  message: string;
  previous?: EmotionState;
  metadata?: Record<string, unknown>;
}

export interface EmotionTransitionInput {
  previous: EmotionState;
  detected: EmotionState;
  metadata?: Record<string, unknown>;
}

export interface EmotionEngine extends CoreProvider {
  analyze(input: EmotionAnalyzeInput): Promise<EmotionState>;
  transition(input: EmotionTransitionInput): Promise<EmotionState>;
}
```

### 默认实现

文件：

```txt
packages/ai-core/src/implementations/emotion/disabled-emotion-engine.ts
```

实现：

```ts
import type {
  EmotionAnalyzeInput,
  EmotionEngine,
  EmotionState,
  EmotionTransitionInput,
} from "../../abstractions/emotion";

export class DisabledEmotionEngine implements EmotionEngine {
  readonly meta = {
    id: "emotion.disabled",
    kind: "emotion",
    name: "Disabled Emotion Engine",
  } as const;

  async analyze(_input: EmotionAnalyzeInput): Promise<EmotionState> {
    return {
      current: "neutral",
      intensity: 0,
    };
  }

  async transition(input: EmotionTransitionInput): Promise<EmotionState> {
    return input.detected;
  }
}
```

### 设计说明

1. `intensity` 建议范围是 `0` 到 `1`；
2. 阶段 2 不做强校验；
3. 阶段 5 再做真实情绪状态机；
4. 当前不存储情绪状态；
5. 情绪状态由宿主或后续状态系统传入。

---

## 十一、ToolProvider / ToolRegistry 抽象

### 文件位置

```txt
packages/ai-core/src/abstractions/tool.ts
```

### 目标

为后续工具调用系统预留边界。

阶段 1 已经预留：

```txt
GenerateInput.tools
GenerateOutput.toolCalls
ModelToolCall
```

阶段 2 需要定义 Core 工具层抽象。

### 模型层 tool call 与 Core 工具层的关系

阶段 1 的：

```txt
ModelToolCall
```

表示：

```txt
模型输出的 tool call 结构
```

阶段 2 的：

```txt
ToolCall
```

表示：

```txt
Core 准备执行的 tool call 结构
```

二者不要混成一个类型。

阶段 6 会负责：

```txt
ModelToolCall -> ToolCall -> ToolProvider.execute()
```

本阶段只定义边界，不做适配器。

### 类型定义

```ts
import type { CoreProvider } from "./provider";

export interface ToolDefinition {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface ToolCall {
  id?: string;
  name: string;
  arguments: unknown;
}

export interface ToolResult {
  toolCallId?: string;
  name: string;
  result: unknown;
  metadata?: Record<string, unknown>;
}

export interface ToolExecuteInput {
  call: ToolCall;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

export interface ToolProvider extends CoreProvider {
  list(): Promise<ToolDefinition[]>;
  execute(input: ToolExecuteInput): Promise<ToolResult>;
}

export type ToolHandler = (input: ToolExecuteInput) => Promise<ToolResult>;

export interface ToolRegistry extends ToolProvider {
  register(definition: ToolDefinition, handler: ToolHandler): void;
}
```

### 默认实现

文件：

```txt
packages/ai-core/src/implementations/tool/empty-tool-registry.ts
```

实现：

```ts
import type {
  ToolDefinition,
  ToolExecuteInput,
  ToolHandler,
  ToolRegistry,
  ToolResult,
} from "../../abstractions/tool";

export class EmptyToolRegistry implements ToolRegistry {
  readonly meta = {
    id: "tool.empty-registry",
    kind: "tool",
    name: "Empty Tool Registry",
  } as const;

  async list(): Promise<ToolDefinition[]> {
    return [];
  }

  async execute(input: ToolExecuteInput): Promise<ToolResult> {
    throw new Error(`Tool is not registered: ${input.call.name}`);
  }

  register(_definition: ToolDefinition, _handler: ToolHandler): void {
    throw new Error("Tool registry is disabled");
  }
}
```

### 设计说明

1. 本阶段保留 ToolRegistry 抽象；
2. 默认实现不允许注册工具；
3. 因为阶段 2 不是工具系统阶段；
4. 阶段 6 会实现真正的 LocalToolRegistry；
5. 不要在阶段 2 适配 AI SDK ToolSet；
6. 不要在阶段 2 执行模型返回的 tool call。

---

## 十二、SafetyProvider 抽象

### 文件位置

```txt
packages/ai-core/src/abstractions/safety.ts
```

### 目标

为后续敏感词、输入输出安全检查预留边界。

当前阶段只提供默认放行实现。

### 类型定义

```ts
import type { CoreProvider } from "./provider";

export interface SafetyCheckInput {
  text: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

export interface SafetyCheckResult {
  allowed: boolean;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface SafetyProvider extends CoreProvider {
  guardInput(input: SafetyCheckInput): Promise<SafetyCheckResult>;
  guardOutput(input: SafetyCheckInput): Promise<SafetyCheckResult>;
}
```

### 默认实现

文件：

```txt
packages/ai-core/src/implementations/safety/passthrough-safety-provider.ts
```

实现：

```ts
import type {
  SafetyCheckInput,
  SafetyCheckResult,
  SafetyProvider,
} from "../../abstractions/safety";

export class PassthroughSafetyProvider implements SafetyProvider {
  readonly meta = {
    id: "safety.passthrough",
    kind: "safety",
    name: "Passthrough Safety Provider",
  } as const;

  async guardInput(_input: SafetyCheckInput): Promise<SafetyCheckResult> {
    return {
      allowed: true,
    };
  }

  async guardOutput(_input: SafetyCheckInput): Promise<SafetyCheckResult> {
    return {
      allowed: true,
    };
  }
}
```

### 设计说明

1. 默认全部放行；
2. 不要在阶段 2 做敏感词；
3. 返回结构不要用 `void`；
4. 后续 Workflow 可以根据 `allowed` 决定是否中断。

---

## 十三、Core Context 抽象

### 文件位置

```txt
packages/ai-core/src/abstractions/core-context.ts
```

### 目标

定义 Core 能力上下文。

该文件放在 `abstractions/` 下，是为了避免 workflow 抽象依赖 core 实现层。

### 类型定义

```ts
import type { ChatModel } from "./model";
import type { PersonaProvider } from "./persona";
import type { MemoryProvider } from "./memory";
import type { EmotionEngine } from "./emotion";
import type { ToolRegistry } from "./tool";
import type { SafetyProvider } from "./safety";
import type { ChatWorkflow } from "./workflow";
import type { CoreObserver } from "./observer";

export interface CompanionCoreContext {
  model: ChatModel;
  persona: PersonaProvider;
  memory: MemoryProvider;
  emotion: EmotionEngine;
  tools: ToolRegistry;
  safety: SafetyProvider;
  workflow: ChatWorkflow;
  observer: CoreObserver;
}
```

### 设计说明

1. Context 中所有字段都必须存在；
2. 除 `model` 外，其它字段由默认实现补齐；
3. Context 不保存会话数据；
4. Context 不保存用户数据；
5. Context 不保存聊天历史；
6. Context 不读取环境变量；
7. Context 只描述 Core 当前挂载了哪些能力；
8. `core-context.ts` 引用 `workflow.ts` 时同样必须使用 `import type`（见 §4.5）。

---

## 十四、ChatWorkflow 抽象

### 文件位置

```txt
packages/ai-core/src/abstractions/workflow.ts
```

### 目标

为阶段 3 聊天主链路和阶段 7 流程编排预留边界。

阶段 2 不实现真实 Workflow。

### 类型定义

```ts
import type { CompanionCoreContext } from "./core-context";
import type { ChatMessage, GenerateOutput } from "./model";
import type { CompanionPersona } from "./persona";
import type { Memory } from "./memory";
import type { EmotionState } from "./emotion";
import type { ToolResult } from "./tool";
import type { SafetyCheckResult } from "./safety";
import type { CoreProvider } from "./provider";

export interface ChatWorkflowInput {
  sessionId?: string;
  message: string;

  /**
   * 短期上下文历史。
   *
   * 由宿主应用维护和传入。
   * Core V1 阶段不负责保存 history。
   */
  history?: ChatMessage[];

  /**
   * 上一轮情绪状态。
   *
   * 阶段 2 不消费，阶段 5 再真正使用。
   */
  emotion?: EmotionState;

  metadata?: Record<string, unknown>;
}

export interface ChatWorkflowOutput {
  text: string;
  model?: string;
  raw?: unknown;

  persona?: CompanionPersona;
  memories?: Memory[];
  emotion?: EmotionState;
  toolResults?: ToolResult[];
  safety?: {
    input?: SafetyCheckResult;
    output?: SafetyCheckResult;
  };

  metadata?: Record<string, unknown>;
  modelOutput?: GenerateOutput;
}

export interface ChatWorkflowExecutionContext {
  core: CompanionCoreContext;
}

export interface ChatWorkflow extends CoreProvider {
  execute(
    input: ChatWorkflowInput,
    context: ChatWorkflowExecutionContext,
  ): Promise<ChatWorkflowOutput>;
}
```

### 默认实现

文件：

```txt
packages/ai-core/src/implementations/workflow/disabled-chat-workflow.ts
```

实现：

```ts
import type {
  ChatWorkflow,
  ChatWorkflowExecutionContext,
  ChatWorkflowInput,
  ChatWorkflowOutput,
} from "../../abstractions/workflow";

export class DisabledChatWorkflow implements ChatWorkflow {
  readonly meta = {
    id: "workflow.disabled",
    kind: "workflow",
    name: "Disabled Chat Workflow",
  } as const;

  async execute(
    _input: ChatWorkflowInput,
    _context: ChatWorkflowExecutionContext,
  ): Promise<ChatWorkflowOutput> {
    throw new Error("ChatWorkflow is disabled");
  }
}
```

### 设计说明

1. Workflow 抽象依赖 `CompanionCoreContext`；
2. `CompanionCoreContext` 在 `abstractions/` 下；
3. `workflow.ts` 引用 `core-context.ts` 时必须使用 `import type`（见 §4.5）；
4. 避免 workflow 抽象引用 `core/` 实现；
5. `history` 是短期上下文；
6. `memory` 是长期记忆；
7. 不要把二者混在一起；
8. 阶段 3 再实现 `SimpleChatWorkflow`（Minimal，见 §二十三）；
9. 阶段 7 再考虑 `LangGraphChatWorkflow`。

---

## 十五、CompanionCore 实例

### 文件位置

```txt
packages/ai-core/src/core/companion-core.ts
```

### 目标

`CompanionCore` 是 Core SDK 的运行时实例。

阶段 2 只负责：

1. 持有 Context；
2. 暴露 Provider；
3. 提供 inspect；
4. 提供基础的 workflow 入口占位。

### 类型定义

```ts
import type { CompanionCoreContext } from "../abstractions/core-context";
import type { CoreProviderMeta } from "../abstractions/provider";
import type { ChatWorkflowInput, ChatWorkflowOutput } from "../abstractions/workflow";

export interface CompanionCoreInspection {
  providers: {
    model: CoreProviderMeta;
    persona: CoreProviderMeta;
    memory: CoreProviderMeta;
    emotion: CoreProviderMeta;
    tools: CoreProviderMeta;
    safety: CoreProviderMeta;
    workflow: CoreProviderMeta;
    observer: CoreProviderMeta;
  };
}

export class CompanionCore {
  constructor(public readonly context: CompanionCoreContext) {}

  getProviders(): CompanionCoreContext {
    return this.context;
  }

  inspect(): CompanionCoreInspection {
    return {
      providers: {
        model: this.context.model.meta,
        persona: this.context.persona.meta,
        memory: this.context.memory.meta,
        emotion: this.context.emotion.meta,
        tools: this.context.tools.meta,
        safety: this.context.safety.meta,
        workflow: this.context.workflow.meta,
        observer: this.context.observer.meta,
      },
    };
  }

  async executeWorkflow(input: ChatWorkflowInput): Promise<ChatWorkflowOutput> {
    return this.context.workflow.execute(input, {
      core: this.context,
    });
  }
}
```

### 注意

阶段 1 的 `ChatModel` 如果目前还没有实现 `meta`，阶段 2 需要补充。

也就是说 `ChatModel` 应该扩展 `CoreProvider`：

```ts
import type { CoreProvider } from "./provider";

export interface ChatModel extends CoreProvider {
  generate(input: GenerateInput): Promise<GenerateOutput>;
  stream(input: GenerateInput): AsyncIterable<GenerateStreamChunk>;
}
```

并在 OpenAI-compatible model 实现中增加：

```ts
readonly meta = {
  id: "model.openai-compatible",
  kind: "model",
  name: "OpenAI Compatible Model",
} as const;
```

### 设计说明

1. `inspect()` 必须读取 `meta`；
2. 不允许使用 `constructor.name`；
3. `executeWorkflow()` 只是统一入口；
4. 当前默认 Workflow 会抛出 `ChatWorkflow is disabled`；
5. 真正聊天入口阶段 3 再完善；
6. 不建议阶段 2 暴露 `core.chat()`，避免语义过早固定。

---

## 十六、createCompanionCore 工厂

### 文件位置

```txt
packages/ai-core/src/core/companion-core-factory.ts
```

### 目标

`createCompanionCore` 是宿主应用创建 Core 实例的入口。

### 类型定义

```ts
import type { ChatModel } from "../abstractions/model";
import type { PersonaProvider } from "../abstractions/persona";
import type { MemoryProvider } from "../abstractions/memory";
import type { EmotionEngine } from "../abstractions/emotion";
import type { ToolRegistry } from "../abstractions/tool";
import type { SafetyProvider } from "../abstractions/safety";
import type { ChatWorkflow } from "../abstractions/workflow";
import type { CoreObserver } from "../abstractions/observer";

export interface CreateCompanionCoreOptions {
  model: ChatModel;
  persona?: PersonaProvider;
  memory?: MemoryProvider;
  emotion?: EmotionEngine;
  tools?: ToolRegistry;
  safety?: SafetyProvider;
  workflow?: ChatWorkflow;
  observer?: CoreObserver;
}
```

### 工厂实现

```ts
import { CompanionCore } from "./companion-core";
import type { CompanionCoreContext } from "../abstractions/core-context";
import type { CreateCompanionCoreOptions } from "./companion-core-factory";
import { DefaultPersonaProvider } from "../implementations/persona/default-persona-provider";
import { DisabledMemoryProvider } from "../implementations/memory/disabled-memory-provider";
import { DisabledEmotionEngine } from "../implementations/emotion/disabled-emotion-engine";
import { EmptyToolRegistry } from "../implementations/tool/empty-tool-registry";
import { PassthroughSafetyProvider } from "../implementations/safety/passthrough-safety-provider";
import { DisabledChatWorkflow } from "../implementations/workflow/disabled-chat-workflow";
import { NoopCoreObserver } from "../implementations/observer/noop-core-observer";

export function createCompanionCore(options: CreateCompanionCoreOptions): CompanionCore {
  const context: CompanionCoreContext = {
    model: options.model,
    persona: options.persona ?? new DefaultPersonaProvider(),
    memory: options.memory ?? new DisabledMemoryProvider(),
    emotion: options.emotion ?? new DisabledEmotionEngine(),
    tools: options.tools ?? new EmptyToolRegistry(),
    safety: options.safety ?? new PassthroughSafetyProvider(),
    workflow: options.workflow ?? new DisabledChatWorkflow(),
    observer: options.observer ?? new NoopCoreObserver(),
  };

  safeEmitCoreInit(context);

  return new CompanionCore(context);
}

function safeEmitCoreInit(context: CompanionCoreContext): void {
  try {
    void Promise.resolve(
      context.observer.emit({
        type: "core:init",
        timestamp: new Date(),
        payload: {
          providers: {
            model: context.model.meta,
            persona: context.persona.meta,
            memory: context.memory.meta,
            emotion: context.emotion.meta,
            tools: context.tools.meta,
            safety: context.safety.meta,
            workflow: context.workflow.meta,
            observer: context.observer.meta,
          },
        },
      }),
    ).catch(() => {
      // observer must not break core initialization
    });
  } catch {
    // observer must not break core initialization
  }
}
```

### 设计说明

1. `model` 必传；
2. 其它能力可选；
3. 未传入能力使用默认实现；
4. `core:init` 通过 observer 发出；
5. observer 同步错误与异步 rejection 均不应阻断 Core 创建（`safeEmitCoreInit` 使用 `Promise.resolve(...).catch(...)`）；
6. 不要在 Factory 读取 env；
7. 不要在 Factory 创建 model；
8. model 仍然由阶段 1 的 `createModel()` 创建后传入。

---

## 十七、阶段 1 ChatModel 调整

### 文件位置

```txt
packages/ai-core/src/abstractions/model.ts
```

### 目标

让 Model 也成为统一 Provider 体系的一部分。

### 修改要求

原本：

```ts
export interface ChatModel {
  generate(input: GenerateInput): Promise<GenerateOutput>;
  stream(input: GenerateInput): AsyncIterable<GenerateStreamChunk>;
}
```

调整为：

```ts
import type { CoreProvider } from "./provider";

export interface ChatModel extends CoreProvider {
  generate(input: GenerateInput): Promise<GenerateOutput>;
  stream(input: GenerateInput): AsyncIterable<GenerateStreamChunk>;
}
```

### OpenAI-compatible 实现调整

在具体实现类中补充：

```ts
readonly meta = {
  id: "model.openai-compatible",
  kind: "model",
  name: "OpenAI Compatible Model",
} as const;
```

### 注意

不要改变阶段 1 已完成的能力：

1. `generate` 仍然可用；
2. `stream` 仍然可用；
3. 重试仍然可用；
4. 降级仍然可用；
5. runtime info 仍然返回；
6. demo 仍然可运行。

---

## 十八、导出规范

### 文件位置

```txt
packages/ai-core/src/index.ts
```

### 必须导出

```ts
export * from "./abstractions/provider";
export * from "./abstractions/core-context";
export * from "./abstractions/observer";
export * from "./abstractions/persona";
export * from "./abstractions/memory";
export * from "./abstractions/emotion";
export * from "./abstractions/tool";
export * from "./abstractions/safety";
export * from "./abstractions/workflow";
export * from "./abstractions/model";

export * from "./core/companion-core";
export * from "./core/companion-core-factory";

export * from "./factories/model.factory";
```

### 建议导出默认实现

```ts
export * from "./implementations/persona/default-persona-provider";
export * from "./implementations/memory/disabled-memory-provider";
export * from "./implementations/emotion/disabled-emotion-engine";
export * from "./implementations/tool/empty-tool-registry";
export * from "./implementations/safety/passthrough-safety-provider";
export * from "./implementations/workflow/disabled-chat-workflow";
export * from "./implementations/observer/noop-core-observer";
```

### 不建议导出

不要导出具体模型实现类：

```txt
implementations/model/openai.ts
```

原因：

1. 阶段 1 已确定模型实现类不从包入口导出；
2. 宿主应用应该通过 `createModel()` 创建模型；
3. 避免业务层依赖 OpenAI-compatible 实现细节。

---

## 十九、Demo 应用调整

### 目标

在 `apps/model-runtime-demo` 中增加 Core 初始化调试区域。

这个 demo 仍然不是正式业务 UI。

它只用于人工验证：

```txt
Model Runtime + Core Abstractions
```

可以一起正常工作。

### 示例流程

在 demo 中：

```ts
import { createCompanionCore, createModel } from "@ying-companion/ai-core";

const model = createModel({
  apiKey,
  baseUrl,
  model: primaryModel,
  fallbackModel,
  retry: {
    primaryMaxRetries,
    fallbackMaxRetries,
  },
});

const core = createCompanionCore({
  model,
});

const inspection = core.inspect();
```

### 页面需要展示

至少展示：

```txt
Core Initialized: true

Providers:
- model: model.openai-compatible
- persona: persona.default
- memory: memory.disabled
- emotion: emotion.disabled
- tools: tool.empty-registry
- safety: safety.passthrough
- workflow: workflow.disabled
- observer: observer.noop
```

### 注意

1. 不要把 demo 做成正式 UI；
2. 不要让 demo 维护真实聊天历史；
3. 不要在 demo 中实现真实聊天主链路；
4. 不要因为阶段 2 改坏阶段 1 的模型流式输出；
5. demo 只需要展示 `core.inspect()` 的结果。

---

## 二十、可观测结果要求

阶段 2 完成后，需要在 demo 页面看到：

```txt
Core Initialized: true
```

以及：

```txt
model: model.openai-compatible
persona: persona.default
memory: memory.disabled
emotion: emotion.disabled
tools: tool.empty-registry
safety: safety.passthrough
workflow: workflow.disabled
observer: observer.noop
```

同时阶段 1 的模型调试能力仍然正常：

```txt
generate / stream 正常
重试 / 降级展示正常
runtime info 正常
```

---

## 二十一、验收方式

### 1. ai-core 构建与类型检查

执行：

```bash
pnpm --filter @ying-companion/ai-core typecheck
pnpm --filter @ying-companion/ai-core build
```

预期：

```txt
typecheck 通过
构建成功
无 TypeScript 类型错误
```

### 2. demo 启动验证

执行：

```bash
pnpm --filter @ying-companion/model-runtime-demo dev
```

打开本地页面。

预期：

```txt
模型调用正常
流式输出正常
重试 / 降级信息正常
Core 初始化信息正常
```

### 3. 手动代码验证

在 demo 中调用：

```ts
const core = createCompanionCore({
  model,
});

console.log(core.inspect());
```

预期输出结构：

```ts
{
  providers: {
    model: {
      id: "model.openai-compatible",
      kind: "model",
      name: "OpenAI Compatible Model"
    },
    persona: {
      id: "persona.default",
      kind: "persona",
      name: "Default Persona Provider"
    },
    memory: {
      id: "memory.disabled",
      kind: "memory",
      name: "Disabled Memory Provider"
    },
    emotion: {
      id: "emotion.disabled",
      kind: "emotion",
      name: "Disabled Emotion Engine"
    },
    tools: {
      id: "tool.empty-registry",
      kind: "tool",
      name: "Empty Tool Registry"
    },
    safety: {
      id: "safety.passthrough",
      kind: "safety",
      name: "Passthrough Safety Provider"
    },
    workflow: {
      id: "workflow.disabled",
      kind: "workflow",
      name: "Disabled Chat Workflow"
    },
    observer: {
      id: "observer.noop",
      kind: "observer",
      name: "Noop Core Observer"
    }
  }
}
```

---

## 二十二、完成标准

本阶段完成后，需要满足：

1. 新增 `CoreProviderMeta`；
2. 新增 `CoreProvider`；
3. `ChatModel` 扩展 `CoreProvider`；
4. OpenAI-compatible model 具备 `meta`；
5. 新增 `CoreObserver`；
6. 新增 `NoopCoreObserver`；
7. 新增 `PersonaProvider`；
8. 新增 `DefaultPersonaProvider`；
9. 新增 `MemoryProvider`；
10. 新增 `DisabledMemoryProvider`；
11. 新增 `EmotionEngine`；
12. 新增 `DisabledEmotionEngine`；
13. 新增 `ToolProvider`；
14. 新增 `ToolRegistry`；
15. 新增 `EmptyToolRegistry`；
16. 新增 `SafetyProvider`；
17. 新增 `PassthroughSafetyProvider`；
18. 新增 `CompanionCoreContext`；
19. 新增 `ChatWorkflow`；
20. 新增 `DisabledChatWorkflow`；
21. 新增 `CompanionCore`；
22. 新增 `createCompanionCore`；
23. `createCompanionCore({ model })` 可以成功创建 Core；
24. 未传入的 Provider 自动使用默认实现；
25. `core.inspect()` 使用 Provider `meta`，返回 `CompanionCoreInspection`（字段类型为 `CoreProviderMeta`），不使用 `constructor.name`；
26. `ChatWorkflowInput` 支持 `history`；
27. `history` 类型复用阶段 1 的 `ChatMessage`；
28. Workflow 抽象不依赖 `core/` 实现层；
29. Tool 类型明确区分模型层 tool call 与 Core 工具执行层 tool call；
30. demo 可展示 Core 初始化结果；
31. `ai-core` 仍然不读取环境变量；
32. `ai-core` 不直接暴露 Vercel AI SDK 类型；
33. 阶段 1 的模型调用 demo 不被破坏；
34. `@ying-companion/ai-core` 可以正常 `typecheck` 与 `build`；
35. `abstractions/` 互引文件使用 `import type`，且 abstraction 不 import `core/` / `implementations/`；
36. `safeEmitCoreInit` 同步错误与异步 rejection 均不阻断 Core 创建；
37. `CompanionCoreInspection` 的 `providers` 字段类型为 `CoreProviderMeta`；
38. 目录结构只有一个 `implementations/`（含 `model/openai.ts`）；
39. 文档已约定 Core 实例生命周期推荐模型（§4.3.1）；
40. 不引入 LangChain；
41. 不引入 LangGraph；
42. 不引入数据库；
43. 不引入用户系统；
44. 不引入鉴权。

---

## 二十三、后续阶段衔接

### 阶段 3：聊天主链路（Minimal）

阶段 3 可以新增：

```txt
SimpleChatWorkflow
```

与 `03-plan.md` 阶段 3 对齐：**本阶段目标是「User → Model → Return」最小闭环**，不含真实 Memory / Tool / Emotion 业务。

阶段 3 **必须消费**：

1. `PersonaProvider`；
2. `SafetyProvider`；
3. `ChatModel`；
4. `ChatWorkflowInput.history`（宿主传入的短期上下文）。

阶段 3 **可以调用但不得依赖真实结果**（阶段 2 默认实现仍为空 / disabled）：

1. `MemoryProvider.recall()` → 返回 `[]`；
2. `EmotionEngine.analyze()` → 返回 neutral；
3. `ToolRegistry.list()` → 返回 `[]`；
4. 不执行模型返回的 tool call。

阶段 3 Minimal 主链路：

```txt
用户消息
↓
Persona.load
↓
Safety.guardInput
↓
History（宿主传入）
↓
Model.generate
↓
Safety.guardOutput
↓
Output
```

说明：

1. 上图中 **不包含** Memory 召回与 Tool 执行；这些在阶段 4 / 阶段 6 分别接入；
2. `SimpleChatWorkflow` 实现时可以把 Memory / Emotion 调用点留空或走默认 Provider，但 **验收不以记忆召回或工具成功为准**；
3. 阶段 3 调用入口仍为 `core.executeWorkflow(input)`；是否增加 `core.chat()` 别名由阶段 3 spec 决定，阶段 2 不提前固定；
4. 阶段 3 详细 spec（`03-chat-main-pipeline.md`）应引用本节，避免与 `03-plan` 范围冲突。

### 阶段 4：记忆系统

阶段 4 替换：

```txt
DisabledMemoryProvider
```

为：

```txt
PostgresMemoryProvider / VectorMemoryProvider
```

但不需要修改 Core Context。

### 阶段 5：情绪状态机

阶段 5 替换：

```txt
DisabledEmotionEngine
```

为：

```txt
SimpleEmotionEngine
```

但不需要修改 Workflow 抽象。

### 阶段 6：工具调用系统

阶段 6 替换：

```txt
EmptyToolRegistry
```

为：

```txt
LocalToolRegistry
```

并实现：

```txt
ModelToolCall -> ToolCall -> ToolResult
```

### 阶段 7：流程编排

阶段 7 可以把：

```txt
SimpleChatWorkflow
```

替换成：

```txt
LangGraphChatWorkflow
```

外部 Core 调用方式不应该发生破坏性变化。

---

## 二十四、给 Codex 的实现提醒

实现时注意：

1. 不要直接复用旧版阶段 2 文档；
2. 必须加入 PersonaProvider；
3. 必须让 ChatModel 扩展 CoreProvider；
4. 必须使用 Provider meta；
5. 不允许使用 `constructor.name` 做 inspect；
6. 不要让 `abstractions/workflow.ts` import `core/companion-core.ts`；
7. `CompanionCoreContext` 必须放在 `abstractions/core-context.ts`；
8. `ChatWorkflowInput` 必须包含 `history?: ChatMessage[]`；
9. Tool 类型要区分模型输出层与 Core 执行层；
10. 不要提前实现真实聊天；
11. 不要提前实现真实记忆；
12. 不要提前实现真实工具执行；
13. 不要提前实现真实情绪识别；
14. 不要在 `ai-core` 中写死 console；
15. 不要在 `ai-core` 中读取 env；
16. 不要导出具体 OpenAI-compatible 实现类；
17. 不要引入 LangChain；
18. 不要引入 LangGraph；
19. 不要引入数据库；
20. 不要破坏阶段 1 的 model-runtime-demo；
21. `core-context.ts` 与 `workflow.ts` 互引时只用 `import type`；
22. `safeEmitCoreInit` 必须吞掉 observer 的同步错误与 Promise rejection；
23. `CompanionCoreInspection` 使用 `CoreProviderMeta`，不要用 `unknown`；
24. 验收时同时跑 `typecheck` 与 `build`；
25. 只有一个 `implementations/` 目录（含 `model/openai.ts`）；
26. 默认 Persona 仅供调试，产品 Persona 由宿主注入或后续 Provider 提供；
27. 文档与后续阶段 3 spec 保持一致：阶段 3 是 Minimal 闭环，不依赖真实 Memory / Tool。

本阶段的成功标准不是“能聊天”，而是：

```txt
Core 的能力插槽已经稳定成型
```
