/**
 * @ying-companion/ai-core 公共导出入口。
 *
 * 导出内容分为四类：
 * 1. abstractions/ — 接口与类型契约（宿主可依赖的稳定 API）
 * 2. core/ — CompanionCore 门面与 createCompanionCore 工厂
 * 3. factories/、errors/ — 模型创建与运行时错误
 * 4. implementations/ — 内置默认实现，供宿主直接使用或作为自定义实现的参考
 */
export * from "./abstractions/provider";
export * from "./abstractions/core-context";
export * from "./abstractions/observer";
export * from "./abstractions/persona";
export * from "./abstractions/memory";
export * from "./abstractions/summary";
export * from "./abstractions/emotion";
export * from "./abstractions/tool";
export * from "./abstractions/safety";
export * from "./abstractions/workflow";
export * from "./abstractions/model";
export * from "./core/companion-core";
export * from "./core/companion-core-factory";
export { ModelRuntimeError } from "./errors/model-runtime-error";
export { createModel, type CreateModelOptions } from "./factories/model.factory";
export * from "./implementations/persona/default-persona-provider";
export * from "./implementations/memory/disabled-memory-provider";
export * from "./implementations/memory/noop-memory-provider";
export * from "./implementations/memory/in-memory-memory-provider";
export * from "./implementations/memory/noop-memory-extractor";
export * from "./implementations/memory/model-memory-extractor";
export * from "./implementations/memory/prompt-formatter";
export * from "./implementations/summary/noop-summary-provider";
export * from "./implementations/summary/in-memory-summary-provider";
export * from "./implementations/summary/noop-summary-updater";
export * from "./implementations/summary/model-summary-updater";
export * from "./implementations/summary/prompt-formatter";
export * from "./implementations/summary/history-utils";
export * from "./implementations/emotion/disabled-emotion-engine";
export * from "./implementations/emotion/model-emotion-engine";
export * from "./implementations/emotion/prompt-formatter";
export * from "./implementations/emotion/transition";
export * from "./implementations/tool/empty-tool-registry";
export * from "./implementations/tool/local-tool-registry";
export * from "./implementations/tool/tool-adapter";
export * from "./implementations/tool/format-tool-results";
export * from "./implementations/safety/passthrough-safety-provider";
export * from "./implementations/workflow/disabled-chat-workflow";
export * from "./implementations/workflow/simple-chat-workflow";
export * from "./implementations/observer/noop-core-observer";
