import type { CoreProvider } from "./provider";

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

export interface CoreEvent<TPayload = unknown> {
  type: CoreEventType;
  timestamp: Date;
  payload?: TPayload;
}

export interface CoreObserver extends CoreProvider {
  emit(event: CoreEvent): void | Promise<void>;
}
