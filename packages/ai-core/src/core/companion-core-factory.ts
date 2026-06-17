/**
 * createCompanionCore 工厂：组装各 Provider 并返回 CompanionCore 实例。
 *
 * 仅 model 为必填；其余插槽未传入时使用默认实现。
 * 注入 memory 时自动选用 ModelMemoryExtractor；注入 summary 时自动选用 ModelSummaryUpdater。
 */
import type { CompanionCoreContext } from "../abstractions/core-context";
import type { EmotionEngine } from "../abstractions/emotion";
import type { ChatModel } from "../abstractions/model";
import type { MemoryExtractor, MemoryProvider } from "../abstractions/memory";
import type { CoreObserver } from "../abstractions/observer";
import type { PersonaProvider } from "../abstractions/persona";
import type { SafetyProvider } from "../abstractions/safety";
import type { SummaryProvider, SummaryUpdater } from "../abstractions/summary";
import type { ToolRegistry } from "../abstractions/tool";
import type { ChatWorkflow } from "../abstractions/workflow";
import { DisabledEmotionEngine } from "../implementations/emotion/disabled-emotion-engine";
import { ModelMemoryExtractor } from "../implementations/memory/model-memory-extractor";
import { NoopMemoryExtractor } from "../implementations/memory/noop-memory-extractor";
import { NoopMemoryProvider } from "../implementations/memory/noop-memory-provider";
import { NoopCoreObserver } from "../implementations/observer/noop-core-observer";
import { DefaultPersonaProvider } from "../implementations/persona/default-persona-provider";
import { PassthroughSafetyProvider } from "../implementations/safety/passthrough-safety-provider";
import { ModelSummaryUpdater } from "../implementations/summary/model-summary-updater";
import { NoopSummaryProvider } from "../implementations/summary/noop-summary-provider";
import { NoopSummaryUpdater } from "../implementations/summary/noop-summary-updater";
import { EmptyToolRegistry } from "../implementations/tool/empty-tool-registry";
import { SimpleChatWorkflow } from "../implementations/workflow/simple-chat-workflow";
import { CompanionCore } from "./companion-core";

/** createCompanionCore 的可选注入项；仅 model 必填。 */
export interface CreateCompanionCoreOptions {
  model: ChatModel;
  persona?: PersonaProvider;
  memory?: MemoryProvider;
  memoryExtractor?: MemoryExtractor;
  summary?: SummaryProvider;
  summaryUpdater?: SummaryUpdater;
  emotion?: EmotionEngine;
  tools?: ToolRegistry;
  safety?: SafetyProvider;
  workflow?: ChatWorkflow;
  observer?: CoreObserver;
}

/** 装配各 Provider 并返回可执行的 CompanionCore 实例。 */
export function createCompanionCore(options: CreateCompanionCoreOptions): CompanionCore {
  const context: CompanionCoreContext = {
    model: options.model,
    persona: options.persona ?? new DefaultPersonaProvider(),
    memory: options.memory ?? new NoopMemoryProvider(),
    memoryExtractor:
      options.memoryExtractor ??
      (options.memory !== undefined
        ? new ModelMemoryExtractor({ model: options.model })
        : new NoopMemoryExtractor()),
    summary: options.summary ?? new NoopSummaryProvider(),
    summaryUpdater:
      options.summaryUpdater ??
      (options.summary !== undefined
        ? new ModelSummaryUpdater({ model: options.model })
        : new NoopSummaryUpdater()),
    emotion: options.emotion ?? new DisabledEmotionEngine(),
    tools: options.tools ?? new EmptyToolRegistry(),
    safety: options.safety ?? new PassthroughSafetyProvider(),
    workflow: options.workflow ?? new SimpleChatWorkflow(),
    observer: options.observer ?? new NoopCoreObserver(),
  };

  safeEmitCoreInit(context);

  return new CompanionCore(context);
}

/** 初始化完成后发射 core:init；Observer 异常不得阻断 Core 创建。 */
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
            memoryExtractor: context.memoryExtractor.meta,
            summary: context.summary.meta,
            summaryUpdater: context.summaryUpdater.meta,
            emotion: context.emotion.meta,
            tools: context.tools.meta,
            safety: context.safety.meta,
            workflow: context.workflow.meta,
            observer: context.observer.meta,
          },
        },
      }),
    ).catch(() => {
      // Observer 异常不得阻断 Core 初始化
    });
  } catch {
    // Observer 异常不得阻断 Core 初始化
  }
}
