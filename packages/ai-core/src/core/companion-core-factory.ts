import type { CompanionCoreContext } from "../abstractions/core-context";
import type { EmotionEngine } from "../abstractions/emotion";
import type { ChatModel } from "../abstractions/model";
import type { MemoryProvider } from "../abstractions/memory";
import type { CoreObserver } from "../abstractions/observer";
import type { PersonaProvider } from "../abstractions/persona";
import type { SafetyProvider } from "../abstractions/safety";
import type { ToolRegistry } from "../abstractions/tool";
import type { ChatWorkflow } from "../abstractions/workflow";
import { DisabledEmotionEngine } from "../implementations/emotion/disabled-emotion-engine";
import { DisabledMemoryProvider } from "../implementations/memory/disabled-memory-provider";
import { NoopCoreObserver } from "../implementations/observer/noop-core-observer";
import { DefaultPersonaProvider } from "../implementations/persona/default-persona-provider";
import { PassthroughSafetyProvider } from "../implementations/safety/passthrough-safety-provider";
import { EmptyToolRegistry } from "../implementations/tool/empty-tool-registry";
import { DisabledChatWorkflow } from "../implementations/workflow/disabled-chat-workflow";
import { CompanionCore } from "./companion-core";

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
