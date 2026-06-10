# AI Companion Core V1 - 阶段 3：聊天主链路补丁说明

> 文件名：`03-chat-main-pipeline-patch.md`
> 关联主文档：`03-chat-main-pipeline.md`
> 补丁主题：收紧 history 清洗白名单与 demo 聊天路由健壮性

## 一、补丁背景

阶段 3 已经完成聊天主链路最小闭环：

1. `SimpleChatWorkflow` 实现 Persona → Safety(input) → Model → Safety(output)；
2. `createCompanionCore({ model })` 默认挂载 `SimpleChatWorkflow`；
3. `apps/model-runtime-demo` 新增 `/api/chat` 服务端路由与聊天调试面板；
4. Observer 事件在服务端收集后随响应体回传。

代码审查 follow-up（`.code-reviews/3-f1a0b59/`）发现若干非阻塞但应在进入阶段 4 前收敛的健壮性问题：

1. `sanitizeHistory` 仅过滤 `tool` 角色，未按主文档 §6.11 做角色白名单；
2. demo `/api/chat` 请求体未校验，直接类型断言，非法 `history` 会在下游抛出 `TypeError`；
3. demo `/api/chat` 无消息长度与 history 条数上限，存在不可控 token 成本；
4. demo `/api/chat` 在请求校验前就创建 model / core，无效请求浪费资源；
5. demo `/api/chat` 显式注入 `workflow: new SimpleChatWorkflow()`，与工厂默认重复，易漂移；
6. demo 聊天面板请求失败时未清除上一轮成功结果，展示易误导。

阶段 3 主链路语义不变，本补丁只做安全/健壮性收敛与一处客户端展示修正，不扩大范围。

---

## 二、补丁目标

本补丁需要实现以下能力：

1. `sanitizeHistory` 改为显式角色白名单；
2. demo `/api/chat` 校验请求体并对非法请求返回结构化错误；
3. demo `/api/chat` 增加消息长度与 history 条数上限；
4. demo `/api/chat` 先校验后创建 model / core；
5. demo `/api/chat` 移除与工厂默认重复的 workflow 注入；
6. demo 聊天面板失败时清除旧结果；
7. 不改变阶段 3 主链路顺序与返回结构；
8. 不破坏阶段 1 Model Runtime 与阶段 2 Core 抽象。

---

## 三、补丁内容

### 3.1 history 清洗改为显式白名单

在：

```txt
packages/ai-core/src/implementations/workflow/simple-chat-workflow.ts
```

将原本仅排除 `tool` 角色的实现：

```ts
function sanitizeHistory(history: ChatMessage[] | undefined): ChatMessage[] {
  return (history ?? []).filter((message) => {
    if (message.role === "tool") {
      return false;
    }

    return typeof message.content === "string" && message.content.trim() !== "";
  });
}
```

调整为显式白名单：

```ts
const ALLOWED_HISTORY_ROLES: ReadonlySet<ChatMessage["role"]> = new Set([
  "system",
  "user",
  "assistant",
]);

function sanitizeHistory(history: ChatMessage[] | undefined): ChatMessage[] {
  return (history ?? []).filter((message) => {
    if (!ALLOWED_HISTORY_ROLES.has(message.role)) {
      return false;
    }

    return typeof message.content === "string" && message.content.trim() !== "";
  });
}
```

说明：

1. 与主文档 §6.11「只允许 `user` / `assistant` / `system`」字面一致；
2. `history` 来自宿主运行时数据，可能含越界或未来新增角色，白名单比黑名单更稳健；
3. 仍过滤空白 `content`，仍不修改原始数组。

### 3.2 demo 聊天路由请求体校验

在：

```txt
apps/model-runtime-demo/app/api/chat/route.ts
```

新增请求体校验函数，对非法输入返回错误文案：

```ts
function validateRequestBody(raw: unknown): string | null {
  if (typeof raw !== "object" || raw === null) {
    return "请求体必须是 JSON 对象";
  }

  const body = raw as Record<string, unknown>;

  if (typeof body.message !== "string" || body.message.trim() === "") {
    return "message 不能为空，且必须是字符串";
  }
  if (body.message.length > MAX_MESSAGE_LENGTH) {
    return `message 长度不能超过 ${MAX_MESSAGE_LENGTH} 字符`;
  }
  if (body.history !== undefined) {
    if (!Array.isArray(body.history)) {
      return "history 必须是数组";
    }
    if (body.history.length > MAX_HISTORY_LENGTH) {
      return `history 长度不能超过 ${MAX_HISTORY_LENGTH} 条`;
    }
  }
  if (body.sessionId !== undefined && typeof body.sessionId !== "string") {
    return "sessionId 必须是字符串";
  }

  return null;
}
```

说明：

1. 解析为 `unknown` 后再校验，替代原先直接 `as ChatRequestBody` 断言；
2. 杜绝非数组 `history` 在 `sanitizeHistory` 处抛出 `TypeError`；
3. 校验失败返回结构化 `400`（见 §3.5）。

### 3.3 demo 聊天路由长度上限

在同一文件顶部新增 demo 级常量：

```ts
// demo 级防护：限制单条消息长度与历史条数，避免不可控 token 成本。
const MAX_MESSAGE_LENGTH = 8000;
const MAX_HISTORY_LENGTH = 50;
```

说明：

1. 限制客户端单次请求的消息长度与 history 条数；
2. 数值仅为 demo 默认，宿主可按需调整；
3. 与 §3.2 校验共用，超限返回 `400`。

### 3.4 demo 聊天路由先校验后建模

在：

```txt
apps/model-runtime-demo/app/api/chat/route.ts
```

`POST` 内部顺序调整为：

```ts
const raw: unknown = await request.json();
const validationError = validateRequestBody(raw);

if (validationError !== null) {
  return jsonResponse({ ok: false, error: { message: validationError }, observerEvents: [] }, 400);
}

const body = raw as ChatRequestBody;

const config = loadModelConfig(process.env);
const model = createModel(config);
// workflow 不显式注入：createCompanionCore 默认即 SimpleChatWorkflow（主文档 §7.3）。
const core = createCompanionCore({
  model,
  observer,
  persona: new DefaultPersonaProvider({
    /* demo 默认值 */
  }),
});
```

说明：

1. 校验通过后才创建 model / core，无效请求不再浪费资源；
2. 移除原先显式的 `workflow: new SimpleChatWorkflow()`，依赖工厂默认，消除重复与漂移；
3. 因此该路由不再 import `SimpleChatWorkflow`。

### 3.5 demo 聊天路由错误状态码

`jsonResponse` 增加可选 `status` 参数：

```ts
function jsonResponse(body: ChatResponseBody, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
```

说明：

1. 请求体非法（客户端错误）返回 `400`；
2. 运行时错误（如模型失败）仍返回 `200` + `ok: false`，便于客户端始终解析 JSON 并展示 observer 事件；
3. 两类错误区分明确。

### 3.6 demo 聊天面板失败清除旧结果

在：

```txt
apps/model-runtime-demo/app/chat-panel.tsx
```

在 `!body.ok` 分支与 `catch` 中补 `setResult(null)`：

```ts
if (!body.ok || body.output === undefined) {
  setResult(null);
  setError(body.error?.message ?? "聊天调用失败");
  return;
}
// ...
} catch (caught) {
  setResult(null);
  setError(caught instanceof Error ? caught.message : "聊天调用失败");
} finally {
  setIsLoading(false);
}
```

说明：

1. 失败时清除上一轮成功结果，避免旧结果与错误并存误导；
2. 纯客户端展示修正，不影响 Core 行为。

---

## 四、职责边界

### 本补丁负责

1. 收紧 history 清洗为显式白名单；
2. 加固 demo 聊天路由的请求校验、长度上限、执行顺序与错误状态码；
3. 移除 demo 与工厂默认重复的 workflow 注入；
4. 修正 demo 聊天面板失败展示。

### 本补丁不负责

1. 不改变阶段 3 主链路顺序与 `ChatWorkflowOutput` 返回结构；
2. 不为 `SimpleChatWorkflow` 新增自动化测试（项目当前不要求单元 / e2e 测试）；
3. 不为 demo `/api/chat` 增加鉴权 / 限流（本地调试范围，对外暴露时另行加固）；
4. 不抽取客户端与服务端共享的响应类型模块；
5. 不实现真实 Memory / Emotion / Tool；
6. 不引入 LangChain / LangGraph / 数据库 / 用户系统 / 鉴权。

---

## 五、补丁后的完成标准

补丁完成后需要满足：

- `sanitizeHistory` 使用 `{ system, user, assistant }` 白名单，过滤 `tool` 及未知角色与空白内容；
- demo `/api/chat` 对非法请求体返回结构化 `400`；
- demo `/api/chat` 对超长 message 与超量 history 返回 `400`；
- demo `/api/chat` 在校验通过后才创建 model / core；
- demo `/api/chat` 不再显式注入 workflow，依赖工厂默认 `SimpleChatWorkflow`；
- demo 聊天面板请求失败时清除旧结果；
- 阶段 3 主链路顺序、返回结构、Observer 事件不变；
- `@ying-companion/ai-core` typecheck / build / lint 通过；
- `@ying-companion/model-runtime-demo` typecheck / lint / build 通过；
- prettier 格式检查通过。

---

## 六、验证方式

静态验证：

```bash
pnpm --filter @ying-companion/ai-core typecheck
pnpm --filter @ying-companion/ai-core build
pnpm --filter @ying-companion/ai-core lint
pnpm --filter @ying-companion/model-runtime-demo typecheck
pnpm --filter @ying-companion/model-runtime-demo lint
pnpm --filter @ying-companion/model-runtime-demo build
```

格式验证：

```bash
pnpm exec prettier --check packages/ai-core/src apps/model-runtime-demo/app
```

运行时 smoke 验证（需有效 `OPENAI_API_KEY`）：

```txt
确认空 message / 非数组 history / 超长输入返回 400
确认合法请求可正常返回回复与 observer 事件
确认连续两轮聊天第二轮携带第一轮 history
确认请求失败时页面不再残留上一轮成功结果
```

---

## 七、后续阶段衔接

1. demo `/api/chat` 的鉴权 / 限流 / 配额仍为保留关注，对外暴露或产品化时由 `apps/api` 另行实现；
2. 客户端可信 history 仅适用于 demo，产品 API 应由服务端按 `sessionId` 持有 canonical history；
3. 响应体中的完整 `raw` / `modelOutput` 仅供调试，产品 API 需裁剪敏感字段；
4. 阶段 4 接入 Memory 时，history 清洗与 prompt 组装位置可能调整，但白名单约束应保留。
