# AI Companion Core V1 - 阶段 2：Core 抽象层补丁说明

> 文件名：`02-core-abstractions-patch.md`  
> 关联主文档：`02-core-abstractions.md`  
> 补丁主题：收紧 Core Context 可变暴露与 Workflow 执行上下文

## 一、补丁背景

阶段 2 已经完成 Core 抽象层：

1. `CompanionCoreContext` 汇总当前挂载的 Provider；
2. `CompanionCore` 持有 Context 并提供 `inspect()`；
3. `createCompanionCore({ model })` 可自动补齐默认 Provider；
4. `ChatWorkflowExecutionContext` 为后续 Workflow 提供 Core 能力访问入口。

代码审查 follow-up 发现两个阶段 3 前应提前硬化的问题：

1. `CompanionCore.context` 与 `getProviders()` 暴露同一个可变 Context 对象引用；
2. `executeWorkflow()` 将完整 `CompanionCoreContext` 传给 Workflow，其中包含 `workflow` 自身，存在不必要的自引用与重入面。

阶段 2 默认 Workflow 只抛出 disabled 错误，因此这两个问题在当前阶段不构成运行时缺陷。但阶段 3 将实现 `SimpleChatWorkflow`，届时 Workflow 会真正消费 Core Context。为了避免阶段 3 开始后再调整基础契约，本补丁提前收紧 Context 暴露面。

---

## 二、补丁目标

本补丁需要实现以下能力：

1. `CompanionCore` 对外暴露只读 Provider 视图；
2. `CompanionCore` 构造时冻结顶层 Context 引用，避免运行时替换 Provider 字段；
3. `ChatWorkflowExecutionContext.core` 不再包含 `workflow` 自身；
4. `executeWorkflow()` 继续作为统一 Workflow 入口；
5. 不改变阶段 2 的默认 Provider 行为；
6. 不提前实现真实聊天链路；
7. 不破坏阶段 1 Model Runtime 与 demo。

---

## 三、补丁内容

### 3.1 新增只读 Context 类型

在：

```txt
packages/ai-core/src/abstractions/core-context.ts
```

新增：

```ts
export type CompanionCoreProviderView = Readonly<CompanionCoreContext>;

export type ChatWorkflowCoreContext = Readonly<Omit<CompanionCoreContext, "workflow">>;
```

说明：

1. `CompanionCoreProviderView` 用于 `CompanionCore.context` 与 `getProviders()` 的公开返回类型；
2. `ChatWorkflowCoreContext` 用于 Workflow 执行时可访问的 Core 能力集合；
3. `ChatWorkflowCoreContext` 明确排除 `workflow`，避免 Workflow 持有自身入口。

### 3.2 收紧 Workflow 执行上下文

在：

```txt
packages/ai-core/src/abstractions/workflow.ts
```

将：

```ts
export interface ChatWorkflowExecutionContext {
  core: CompanionCoreContext;
}
```

调整为：

```ts
export interface ChatWorkflowExecutionContext {
  core: ChatWorkflowCoreContext;
}
```

说明：

1. Workflow 仍可访问 `model`、`persona`、`memory`、`emotion`、`tools`、`safety`、`observer`；
2. Workflow 不再通过 `context.core.workflow` 调用自身；
3. 若后续确实需要编排多个 Workflow，应由阶段 7 流程编排设计单独定义，不在阶段 2 暴露自引用入口。

### 3.3 冻结 `CompanionCore` 顶层 Context

在：

```txt
packages/ai-core/src/core/companion-core.ts
```

将 `CompanionCore` 调整为：

```ts
export class CompanionCore {
  public readonly context: CompanionCoreProviderView;

  public constructor(context: CompanionCoreContext) {
    this.context = Object.freeze({ ...context });
  }

  public getProviders(): CompanionCoreProviderView {
    return this.context;
  }
}
```

说明：

1. `Object.freeze({ ...context })` 是浅冻结；
2. 目标是防止运行时替换顶层 Provider 字段，例如 `core.context.tools = ...`；
3. 本补丁不深冻结 Provider 实例本身，因为后续某些 Provider 可能合法持有内部状态；
4. Provider 内部状态管理由对应 Provider 实现自行负责。

### 3.4 `executeWorkflow()` 排除 `workflow`

`executeWorkflow()` 调整为：

```ts
public async executeWorkflow(input: ChatWorkflowInput): Promise<ChatWorkflowOutput> {
  const { workflow, ...core } = this.context;

  return workflow.execute(input, {
    core: core satisfies ChatWorkflowCoreContext,
  });
}
```

说明：

1. 外部调用方式不变，仍然是 `core.executeWorkflow(input)`；
2. 内部传给 Workflow 的 `core` 不包含 `workflow`；
3. `satisfies ChatWorkflowCoreContext` 用于让 TypeScript 验证结构收窄结果。

---

## 四、职责边界

### 本补丁负责

1. 收紧 Context 对外可变面；
2. 移除 Workflow 执行上下文中的自引用 `workflow`；
3. 保持 `inspect()`、`getProviders()`、`executeWorkflow()` 的阶段 2 入口语义；
4. 为阶段 3 `SimpleChatWorkflow` 提前稳定更安全的上下文契约。

### 本补丁不负责

1. 不实现 `SimpleChatWorkflow`；
2. 不实现真实聊天；
3. 不实现真实记忆；
4. 不实现真实工具调用；
5. 不实现深冻结 Provider 实例；
6. 不拆分 demo 的 `/api/core-inspect`；
7. 不新增 LangChain / LangGraph；
8. 不引入数据库、用户系统或鉴权。

---

## 五、补丁后的完成标准

补丁完成后需要满足：

- `CompanionCore.context` 类型为只读 Provider 视图；
- `getProviders()` 返回只读 Provider 视图；
- `CompanionCore` 构造后顶层 Context 被浅冻结；
- `ChatWorkflowExecutionContext.core` 不包含 `workflow`；
- `executeWorkflow()` 仍可调用当前挂载的 Workflow；
- `core.inspect()` 输出不变；
- `createCompanionCore({ model })` 行为不变；
- 默认 `DisabledChatWorkflow` 行为不变；
- `@ying-companion/ai-core` typecheck / build / lint 通过；
- demo typecheck / lint 通过。

---

## 六、验证方式

静态验证：

```bash
pnpm --filter @ying-companion/ai-core typecheck
pnpm --filter @ying-companion/ai-core build
pnpm --filter @ying-companion/ai-core lint
pnpm --filter @ying-companion/model-runtime-demo typecheck
pnpm --filter @ying-companion/model-runtime-demo lint
```

格式验证：

```bash
pnpm exec prettier --check packages/ai-core/src .code-reviews/2-47a9d1b/codex-followup.md
```

运行时 smoke 验证：

```txt
确认 core.context 已冻结
确认 core.getProviders() 返回对象已冻结
确认 Workflow execute 收到的 context.core 不包含 workflow 字段
```

---

## 七、后续阶段衔接

阶段 3 实现 `SimpleChatWorkflow` 时应遵守本补丁后的约束：

1. Workflow 只通过 `ChatWorkflowExecutionContext.core` 访问必要能力；
2. Workflow 不应依赖 `context.core.workflow`；
3. 宿主不应在 Core 创建后替换 Provider；
4. 如果阶段 7 需要多 Workflow 编排，应设计独立的 Workflow registry / orchestrator，而不是恢复 Context 自引用。
