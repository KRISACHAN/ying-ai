/**
 * Core 可观测性抽象。
 *
 * Workflow 与各 Provider 通过 emit 发射结构化事件；宿主订阅后展示调试面板。
 * ai-core 内不写 console，所有可观测输出都经此通道交给宿主。
 */
import type { CoreProvider } from "./provider";

/**
 * 可观测事件类型。
 * 命名约定：`模块:动作:start|end`，workflow 用 `workflow:step` 记录中间步骤。
 */
export type CoreEventType =
  | "core:init"
  | "persona:load:start"
  | "persona:load:end"
  | "memory:recall:start"
  | "memory:recall:end"
  | "memory:extract:start"
  | "memory:extract:end"
  | "memory:save:start"
  | "memory:save:end"
  | "summary:load:start"
  | "summary:load:end"
  | "summary:update:start"
  | "summary:update:end"
  | "summary:save:start"
  | "summary:save:end"
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

/** 单次可观测事件；payload 结构由 type 决定，宿主按 type 解析展示。 */
export interface CoreEvent<TPayload = unknown> {
  type: CoreEventType;
  timestamp: Date;
  payload?: TPayload;
}

export interface CoreObserver extends CoreProvider {
  emit(event: CoreEvent): void | Promise<void>;
}
