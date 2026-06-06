# 代码审查 — 暂存区（ai-core Model Runtime）

**日期：** 2026-06-06
**审查范围：** 已暂存
**引用：** `git diff --cached --no-color`（9 文件，+538 行）
**结论：** 需修改

## 依据规范

- [AGENTS.md](../../AGENTS.md)
- [docs/ai/core/principles.md](../ai/core/principles.md)
- [docs/ai/core/working-agreements.md](../ai/core/working-agreements.md)
- [docs/ai/core/verification.md](../ai/core/verification.md)
- [docs/ai/core/project-context.md](../ai/core/project-context.md)
- [.cursor/rules/00-ai-guide.mdc](../../.cursor/rules/00-ai-guide.mdc)
- [eslint.config.mjs](../../eslint.config.mjs)
- [prettier.config.mjs](../../prettier.config.mjs)
- [docs/requirements/stages/stage-01/01-model-runtime.md](../requirements/stages/stage-01/01-model-runtime.md)（同批暂存需求文档）

## 摘要

暂存区引入了 `@ying-companion/ai-core` 包及阶段 1 需求文档，整体架构方向正确：抽象接口、Factory 显式注入配置、实现层封装 Vercel AI SDK、Core 不读取 `process.env`。本地验证 `typecheck`、`lint`、`build` 均通过。

主要问题集中在**公开 API 过宽**（导出实现类）、**tools 类型不安全转换**、**流式 usage 未落地**、**未使用依赖**，以及**阶段完成标准中的 demo 应用与 lockfile 未纳入本次暂存**。code-reviewer 建议 REQUEST CHANGES；架构评审为 WATCH（无阻塞，但有需记录的边界顾虑）。

## 审查统计

- 审查文件数：9
- 问题总数：10（严重 0 / 高 2 / 中 5 / 低 3）
- code-reviewer 建议：REQUEST CHANGES
- 架构状态：WATCH

## 问题清单

### 严重

无。

### 高

- [packages/ai-core/src/index.ts:13] [规范: docs/requirements/stages/stage-01/01-model-runtime.md] 公开导出 `OpenAICompatibleModel` 实现类，与需求「业务层只调用 Core 抽象、不直接接触 Provider 实现」相悖；消费者可绕过 `createModel` 直接 `new OpenAICompatibleModel(...)`。 — 从 `index.ts` 移除实现类导出，仅保留 `createModel` 与抽象类型；实现类保持 `implementations/` 内部可见。
- [packages/ai-core/src/implementations/model/openai.ts:119-120] `toAiSdkTools` 将 `Record<string, unknown>` 直接断言为 `ToolSet`，绕过类型检查，错误 tools 结构将在运行时由 AI SDK 抛出不透明错误；与需求「不在 Core 内使用 any / 保持类型约束」精神不符。 — 为 `tools` 定义 Core 层工具描述类型，或在传入 AI SDK 前做显式校验/映射，避免裸 `as` 断言。

### 中

- [packages/ai-core/src/implementations/model/openai.ts:52-61,70] 配置 `includeUsage: true`，但 `stream()` 仅 yield 文本片段，`GenerateStreamChunk` 不含 `usage`，与非流式 `generate()` 能力不对称，也未满足需求文档第六节对流式 usage 映射的描述。 — 在流结束后读取 `result.usage` 并 yield 最终 chunk，或扩展 `GenerateStreamChunk` 支持 `usage`/`finishReason` 可选字段。
- [packages/ai-core/package.json:22] 声明 `zod` 依赖但暂存源码中无任何引用，属于未使用依赖。 — 移除 `zod`，待工具 schema 阶段再引入；符合 [规范: working-agreements.md]「仅在需要时添加依赖」。
- [packages/ai-core/src/factories/model.factory.ts:5-11] `CreateModelOptions.provider` 字段已定义但 Factory 未分支处理，形成死 API。 — 暂移除 `provider` 字段，或实现最小分支并在无效值时抛错。
- [packages/ai-core/src/index.ts:11] 导出 `OpenAICompatibleConfig` 使业务层绑定 OpenAI 兼容配置形态（工作区 demo 已直接 import 该类型）。 — 考虑改为通用 `CreateModelOptions` 对外导出，将 provider 特有配置收敛到 Factory 参数或后续 provider 注册表。
- [工作区] `pnpm-lock.yaml` 已修改但未暂存；新包依赖 `ai`、`@ai-sdk/openai-compatible` 的锁定版本未与 `package.json` 一并提交，影响可复现安装。 — 将 lockfile 与 `packages/ai-core` 同批暂存/提交。

### 低

- [packages/ai-core/src/implementations/model/openai.ts:74-76] 每次 `generate`/`stream` 调用都通过 `createTextOptions` 重新 `createProvider()`，产生多余对象分配。 — 在构造函数或惰性字段中缓存 provider 实例。
- [packages/ai-core/src/implementations/model/openai.ts:112-115] `ChatMessage.name` 在抽象层已定义，但映射到 AI SDK `ModelMessage` 时被丢弃。 — 若短期不支持则文档注明；否则在映射中传递 `name`。
- [packages/ai-core/package.json:5] `"type": "commonjs"` 与 monorepo 其他包（如 `@ying-companion/api` 的 `"type": "module"`）不一致。 — 评估统一为 ESM 或明确文档说明 CJS 选择理由。

## 架构关注项

- [packages/ai-core/src/index.ts:12-13] **公开边界过宽** — 实现类与 OpenAI 专用配置类型对外暴露，削弱「可替换 Provider」的长期边界；建议仅暴露 `ChatModel`、`createModel` 及输入/输出 DTO。
- [packages/ai-core/src/abstractions/model.ts:11] **tools 抽象过于宽松** — `Record<string, unknown>` 无法表达 schema/可执行语义，后续 Tool System 阶段可能需破坏性变更；建议尽早引入最小工具描述接口。
- [packages/ai-core/src/factories/model.factory.ts:10-11] **多 Provider 扩展点未落地** — `provider?` 占位未实现，易让调用方误以为已支持多后端；属非阻塞 WATCH，但应在合并前决定「删除占位」或「实现最小路由」。
- [docs/requirements/stages/stage-01/01-model-runtime.md:31] **阶段交付不完整（相对需求）** — 完成标准含 `apps/model-runtime-demo`，但该应用仅存在于工作区未暂存文件；本次暂存无法单独验证端到端流式演示。 — 建议将 demo 与 lockfile 纳入同一 PR/提交批次。

## 合成说明

- code-reviewer：REQUEST CHANGES（公开 API 泄露、tools 不安全断言、流式 usage 缺口、未使用依赖）
- 架构状态：WATCH（边界与扩展点需收紧，但核心分层合理）
- 最终结论：**需修改**（依据 OMX 规则：code-reviewer = REQUEST CHANGES → 需修改）

## 检查项

### 安全

- [x] 无硬编码密钥；`ai-core` 不读取环境变量
- [x] 输入由业务方传入，Core 层无注入面
- [ ] tools 结构无运行时校验（中风险）

### 代码质量

- [x] 结构清晰，文件规模合理
- [ ] `toAiSdkTools` 裸断言、未使用 `provider` 字段、未使用 `zod` 依赖
- [x] 命名与目录符合需求文档

### 性能

- [ ] 每次请求重建 provider（低影响，可后续优化）
- [x] 无 N+1 或明显算法问题

### 项目规范

- [x] `consistent-type-imports`、无 `any`
- [x] typecheck / lint / build 通过（已本地执行）
- [ ] 缺少针对映射函数的最小单元测试 [规范: verification.md]
- [ ] 模块格式与 monorepo 其他包不完全一致

### 架构

- [x] Core / 实现 / Factory 分层明确
- [ ] 公开 API 应更窄；tools 与多 Provider 扩展点待收敛
- [x] 架构状态：WATCH

### 验证

- [x] `pnpm --filter @ying-companion/ai-core typecheck` — 通过
- [x] `pnpm --filter @ying-companion/ai-core lint` — 通过
- [x] `pnpm --filter @ying-companion/ai-core build` — 通过
- [ ] 无单元/集成测试；demo 应用未在暂存区，无法审查 E2E 流式验证

## 备注

- **审查范围**：仅 `git diff --cached` 所列 9 个文件；`apps/model-runtime-demo/`、`pnpm-lock.yaml`、`docs/requirements/stages/stage-01/01-model-runtime-patch.md` 等工作区变更未纳入本次暂存审查。
- **独立 lane**：在本环境中由单一审查会话完成 code-reviewer 与 architect 双车道分析（无 OMX 子代理委派）；结论已按 OMX 合成规则合并。
- **建议验证命令**（合并 demo 后）：
  ```bash
  pnpm install
  pnpm --filter @ying-companion/ai-core build
  pnpm --filter @ying-companion/model-runtime-demo dev
  ```
