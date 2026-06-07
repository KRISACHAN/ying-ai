# 代码审查 — 暂存区：Model Runtime 重试与降级

**日期：** 2026-06-07
**审查范围：** 已暂存变更
**引用：** `git diff --cached --no-color`
**结论：** 需修改

---

## 依据规范

- `AGENTS.md` — 项目入口与平台适配
- `docs/ai/core/principles.md` — 操作原则
- `docs/ai/core/working-agreements.md` — diff 规模、模式、验证
- `docs/ai/core/project-context.md` — monorepo 布局与命令
- `eslint.config.mjs` — `consistent-type-imports`、`no-explicit-any`
- `prettier.config.mjs` — printWidth 100、trailingComma all、singleQuote false

---

## 摘要

本次暂存区共 10 个文件，实现了 `@ying-companion/ai-core` 的模型重试与降级能力，以及 `apps/model-runtime-demo` 的配置读取与运行时信息展示。整体设计边界清晰，符合 `01-model-runtime-patch-2.md` 的规范要求：`ai-core` 不读取环境变量，重试/降级逻辑封装在实现类内部，demo 只传配置并展示结果。TypeCheck 与 Lint 全部通过（4 个包，0 报错）。

code-reviewer 发现 1 个高级别问题（每次重试均重新创建 Provider）、2 个中级别问题、3 个低级别问题，建议修改后再合并。architect 存在 3 个 WATCH 项，无阻塞性设计问题。

---

## 审查统计

- 审查文件数：10
- 问题总数：6（严重 0 / 高 1 / 中 2 / 低 3）
- TypeCheck：✅ 全通过
- Lint：✅ 全通过
- code-reviewer 建议：REQUEST CHANGES
- 架构状态：WATCH

---

## 问题清单

### 严重

无

---

### 高

- [`packages/ai-core/src/implementations/model/openai.ts:createProvider`] `createProvider()` 在每次重试中被重复调用，导致每次 `generateText` / `streamText` 都会重新构造 `openai-compatible` Provider 工厂实例。

  **复现路径：**
  `generate()` → 每次循环 → `generateOnce()` → `createTextOptions()` → `createProvider()`
  `stream()` → 每次循环 → `createTextOptions()` → `createProvider()`

  在 `primaryMaxRetries = 2` 的场景下，主模型失败后降级，总共会调用 4 次 `createProvider()`（2 次主模型 + 2 次降级模型），每次均创建新实例。配置是不可变的，这完全是无意义的重复构造。

  **修复建议：** 在构造函数中初始化 `private readonly provider`，`createTextOptions` 直接使用已有实例：

  ```ts
  export class OpenAICompatibleModel implements ChatModel {
    private readonly config: OpenAICompatibleConfig;
    private readonly provider: ReturnType<typeof createOpenAICompatible>;

    public constructor(config: OpenAICompatibleConfig) {
      this.config = config;
      this.provider = createOpenAICompatible({
        name: "openai-compatible",
        apiKey: config.apiKey,
        baseURL: config.baseUrl ?? DEFAULT_OPENAI_BASE_URL,
        includeUsage: true,
      });
    }

    // createTextOptions 改为直接使用 this.provider(model) 而非 this.createProvider()(model)
  }
  ```

---

### 中

- [`packages/ai-core/src/abstractions/model.ts:ModelRuntimeError`] `ModelRuntimeError` 是一个有运行时行为的类（`extends Error`），但被定义在 `abstractions/model.ts` 中，该文件的其余内容全部是纯接口/类型定义。这模糊了「抽象层定义」与「运行时实现」之间的职责边界。

  **当前影响：** 低（Stage 1 文件规模小，尚可接受）。但随着 Stage 2 开始增加更多抽象，`abstractions/` 目录若混入类实现，维护成本将上升。

  **建议：** 提取到 `packages/ai-core/src/abstractions/errors.ts` 或 `packages/ai-core/src/errors.ts`，并从 `index.ts` 统一导出。

- [`packages/ai-core/src/implementations/model/openai.ts:createAttemptPlans`] `input.model` 字段可覆盖主模型（`primary` plan），但对降级模型（`fallback` plan）无效，始终使用 `this.config.fallbackModel`。这一不对称行为在代码和文档中均未说明，调用方可能会误以为 `input.model` 影响的是「整次调用的模型」。

  **建议：** 在 `createAttemptPlans` 中添加注释说明此行为：

  ```ts
  // input.model overrides only the primary plan; fallback always uses config.fallbackModel.
  ```

  或在 `GenerateInput.model` 的 JSDoc 中说明该字段仅影响主模型。

---

### 低

- [`apps/model-runtime-demo/app/api/model-runtime/route.ts:loadModelConfig`] `loadModelConfig(process.env)` 在 `POST` 函数体顶部同步调用（位于 `ReadableStream` 构造外部）。如果 `OPENAI_API_KEY` 或 `OPENAI_MODEL` 环境变量缺失，`readRequiredEnv` 会同步抛出，Next.js 将返回原始 500，而非以流式方式传递友好的错误提示。

  **当前影响：** 低（demo 应用，非生产）。原有逻辑已如此，本次变更未引入新的必填字段，不作为阻塞项。可后续统一处理。

- [`apps/model-runtime-demo/app/api/model-runtime/route.ts:formatRuntimeErrors`] 函数签名使用索引类型访问器：`errors: ModelRuntimeInfo["errors"]`。等效于 `ModelRuntimeErrorItem[]`，但可读性更差，依赖 `ModelRuntimeInfo` 的内部结构。

  **建议：** 改为 `errors: ModelRuntimeErrorItem[]`，需同时添加对应的 `import type { ModelRuntimeErrorItem }`。

- [`packages/ai-core/src/implementations/model/openai.ts:toSafeErrorMessage`] 错误信息截断长度 `240` 是魔术数字，未附注释说明来源或依据。

  **建议：** 提取为常量并加注释：

  ```ts
  /** Maximum number of characters for error message summaries to prevent accidental leakage of large response bodies. */
  const MAX_ERROR_MESSAGE_LENGTH = 240;
  ```

---

## 架构关注项

- [`packages/ai-core/src/implementations/model/openai.ts:createProvider`] **WATCH** — 同「高」问题第一条。Provider 重复构造是 Stage 1 的代码质量问题，在 Stage 2 多实现类引入后需确保每个实现类都在构造时初始化 Provider，而非延迟或重复创建。

- [`packages/ai-core/src/implementations/model/openai.ts:createAttemptPlans`] **WATCH** — `input.model` 对降级模型的不对称行为。Stage 2 Core 抽象层引入 `ChatService` 或 Workflow 时，若需要在 `GenerateInput` 中动态指定模型，此不对称可能引起混乱。建议在此之前统一语义或通过文档明确边界。

- [`packages/ai-core/src/implementations/model/openai.ts` 模块级工具函数] **WATCH** — `normalizeMaxRetries`、`getMaxAttempts`、`createRuntimeState`、`recordAttempt` 等工具函数当前为 `openai.ts` 专用的模块级私有函数。Stage 2 引入 Claude / Gemini 等新实现时，这些函数需要共享。建议届时提取为 `packages/ai-core/src/runtime/utils.ts`，避免跨实现类的重复。

---

## 合成说明

- code-reviewer：REQUEST CHANGES（高：`createProvider()` 每次重试重新构造；中：类放在 abstractions、`input.model` 不对称未文档化）
- 架构状态：WATCH（三项 WATCH，无阻塞性架构问题）
- 最终结论：**需修改**（依据 OMX 合成规则：code-reviewer = REQUEST CHANGES → 需修改）

---

## 检查项

### 安全

- [x] 无硬编码密钥；`maskSecret` 掩盖 API Key 头尾
- [x] `toSafeErrorMessage` 截断至 240 字符，不透传完整错误对象
- [x] 无注入/XSS/CSRF 风险（API Route 不接受用户输入）
- [x] `ModelRuntimeError.errors` 只包含安全摘要

### 代码质量

- [ ] `createProvider()` 在每次重试中重复构造（高级别问题）
- [x] 命名清晰：`generateOnce`、`createAttemptPlans`、`recordAttempt` 语义明确
- [x] 无 `any` 使用
- [x] `normalizeMaxRetries` 正确处理 NaN、负数、浮点数
- [x] `validateGenerateOutput` 正确处理 toolCalls-only 输出

### 性能

- [ ] `createProvider()` 每次重试创建新实例（同上）
- [x] `GenerateStreamChunk.runtime` 仅在终止 chunk 中存在，不影响流式主路径

### 项目规范

- [x] `ai-core` 不读取环境变量 [规范: docs/requirements/stages/stage-01/01-model-runtime.md]
- [x] 业务层只调用 Core 抽象 [规范: docs/ai/core/principles.md]
- [x] TypeScript consistent-type-imports 合规（值/类型分开导入）[规范: eslint.config.mjs]
- [x] 无 `no-explicit-any` 违规 [规范: eslint.config.mjs]
- [x] Prettier 格式合规（printWidth 100、trailingComma all）[规范: prettier.config.mjs]

### 架构

- [ ] `ModelRuntimeError` 类混入 `abstractions/model.ts`（中级别问题）
- [x] `ChatModel` 接口未变更，向后兼容
- [x] `ai-core` 不依赖 OpenAI 官方 SDK，仅通过 Vercel AI SDK 适配
- [x] 重试/降级逻辑在 Core 内部，demo 只传配置
- 架构状态：**WATCH**

### 验证

- [x] TypeCheck：4 个包全部通过（0 报错）
- [x] Lint：4 个包全部通过（0 报错）
- [ ] 端到端 demo 验证未在 CI 中自动化（demo 为人工调试应用，符合 Stage 1 约定）

---

## 备注

- `apps/model-runtime-demo/next-env.d.ts` 新增 `/// <reference path="./.next/types/routes.d.ts" />` 为 Next.js 自动生成，注释已说明不应手动编辑，无需关注。
- `docs/requirements/stages/stage-01/01-model-runtime-patch-2.md` 为需求文档，不计入代码审查范围，但其内容与实现高度一致，设计意图清晰。
- 建议修复顺序：高（`createProvider()` 构造优化）→ 中（`input.model` 注释 → `ModelRuntimeError` 迁移可延迟到 Stage 2）→ 低。
