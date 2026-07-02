import type { EmotionState } from "../../abstractions/emotion";
import type { ChatMessage, GenerateOutput } from "../../abstractions/model";
import type { MemoryRecord, MemoryScope, RecalledMemory } from "../../abstractions/memory";
import type { CoreObserver } from "../../abstractions/observer";
import type { CompanionPersona } from "../../abstractions/persona";
import type { ConversationSummary, SummaryScope } from "../../abstractions/summary";
import type { ToolDefinition, ToolResult } from "../../abstractions/tool";
import type { ToolPlan } from "../../abstractions/tool-planning";
import type { ChatWorkflowExecutionContext } from "../../abstractions/workflow";
import { createNeutralEmotion } from "../emotion/transition";
import { splitForSummary } from "../summary/history-utils";
import {
  type AnalyzeEmotionResult,
  type ExtractAndSaveResult,
  type LoadSummaryResult,
  type PlannerUnavailableSource,
  type RecallMemoriesResult,
  type UpdateAndSaveSummaryResult,
  type WorkflowToolPlanningState,
} from "./workflow-execution-state";
import { toSafeMessage } from "./workflow-safe-error";
import type { WorkflowStreamEmitter } from "./workflow-stream-emitter";
import { runWorkflowStep, safeEmit } from "./workflow-step-runner";
import type { WorkflowTraceRecorder } from "./workflow-trace-recorder";

export function normalizeToolPlan(plan: ToolPlan): ToolPlan | null {
  if (plan.type === "no_tool") {
    return plan;
  }

  if (plan.calls.length === 0) {
    return {
      type: "no_tool",
      reason: "invalid_plan",
      ...(plan.runtime ? { runtime: plan.runtime } : {}),
    };
  }

  for (const call of plan.calls) {
    if (call.name.trim() === "") {
      return null;
    }
  }

  return plan;
}

export function toToolPlanningState(
  plan: ToolPlan,
  plannerUnavailableSource?: PlannerUnavailableSource,
): WorkflowToolPlanningState {
  if (plan.type === "tool_calls") {
    return {
      plan,
      ...(plan.runtime !== undefined ? { runtime: plan.runtime } : {}),
    };
  }

  return {
    plan,
    ...(plan.reason !== undefined ? { reason: plan.reason } : {}),
    ...(plan.reason === "planner_unavailable" && plannerUnavailableSource !== undefined
      ? { plannerUnavailableSource }
      : {}),
    ...(plan.runtime !== undefined ? { runtime: plan.runtime } : {}),
  };
}

export function createPlaceholderGenerateOutput(): GenerateOutput {
  return {
    text: "",
    model: "",
    raw: null,
  };
}

interface ListToolsOptions {
  observer: CoreObserver;
  recorder: WorkflowTraceRecorder;
  streamEmitter?: WorkflowStreamEmitter | undefined;
  tools: ChatWorkflowExecutionContext["core"]["tools"];
  sessionId?: string;
}

export async function listTools(options: ListToolsOptions): Promise<ToolDefinition[]> {
  return runWorkflowStep({
    observer: options.observer,
    recorder: options.recorder,
    streamEmitter: options.streamEmitter,
    workflowStep: "tool:list",
    legacyStep: "tool:list",
    ...(options.sessionId !== undefined ? { sessionId: options.sessionId } : {}),
    run: async () => {
      const definitions = await options.tools.list();

      await safeEmit(options.observer, {
        type: "tool:list",
        timestamp: new Date(),
        payload: {
          sessionId: options.sessionId,
          count: definitions.length,
          tools: definitions.map((definition) => ({
            name: definition.name,
            description: definition.description,
          })),
        },
      });

      return definitions;
    },
    summarize: (definitions) => ({ count: definitions.length }),
  });
}

interface AnalyzeEmotionOptions {
  observer: CoreObserver;
  emotion: ChatWorkflowExecutionContext["core"]["emotion"];
  message: string;
  history: ChatMessage[];
  persona: CompanionPersona;
  recalledMemories: RecalledMemory[];
  sessionId?: string;
  previous?: EmotionState;
}

/** 分析伴侣意向情绪并计算最终情绪；失败时回退 previous/neutral，不阻断主链路。 */
export async function analyzeAndTransitionEmotion(
  options: AnalyzeEmotionOptions,
): Promise<AnalyzeEmotionResult> {
  const previous = options.previous ?? createNeutralEmotion();

  await safeEmit(options.observer, {
    type: "emotion:analyze:start",
    timestamp: new Date(),
    payload: { sessionId: options.sessionId, previous },
  });

  try {
    const detected = await options.emotion.analyze({
      message: options.message,
      history: options.history,
      persona: options.persona,
      recalledMemories: options.recalledMemories,
      previous,
      ...(options.sessionId !== undefined ? { sessionId: options.sessionId } : {}),
    });
    const failed = detected.metadata?.failed === true;
    const next = failed
      ? detected
      : options.emotion.transition({
          previous,
          detected,
          now: new Date(),
        });

    await safeEmit(options.observer, {
      type: "emotion:analyze:end",
      timestamp: new Date(),
      payload: {
        ok: !failed,
        sessionId: options.sessionId,
        previous,
        detected,
        next,
        ...(failed ? { failed: true, error: detected.metadata?.failureReason } : {}),
      },
    });

    return {
      previous,
      detected,
      next,
      ...(failed ? { degraded: true, reason: "analyze_failed" } : {}),
    };
  } catch (error) {
    await safeEmit(options.observer, {
      type: "emotion:analyze:end",
      timestamp: new Date(),
      payload: {
        ok: false,
        failed: true,
        sessionId: options.sessionId,
        previous,
        next: previous,
        error: toSafeMessage(error),
      },
    });

    return { previous, next: previous, degraded: true, reason: "analyze_failed" };
  }
}

interface LoadSummaryOptions {
  observer: CoreObserver;
  summary: ChatWorkflowExecutionContext["core"]["summary"];
  enabled: boolean;
  scope?: SummaryScope;
  sessionId?: string;
}

/** 加载当前会话摘要；失败时返回 null 且不阻断主链路。 */
export async function loadSummary(options: LoadSummaryOptions): Promise<LoadSummaryResult> {
  if (!options.enabled || options.scope === undefined) {
    return {
      summary: null,
      skipped: true,
      reason: options.scope === undefined ? "no_scope" : "disabled",
    };
  }

  await safeEmit(options.observer, {
    type: "summary:load:start",
    timestamp: new Date(),
    payload: { sessionId: options.sessionId, scope: options.scope },
  });

  try {
    const result = await options.summary.load({ scope: options.scope });
    const loadedSummary = result.summary ?? null;

    await safeEmit(options.observer, {
      type: "summary:load:end",
      timestamp: new Date(),
      payload: {
        ok: true,
        scope: options.scope,
        hasSummary: loadedSummary !== null,
        ...(loadedSummary !== null ? { summaryLength: loadedSummary.content.length } : {}),
      },
    });

    return { summary: loadedSummary, skipped: false };
  } catch (error) {
    await safeEmit(options.observer, {
      type: "summary:load:end",
      timestamp: new Date(),
      payload: { ok: false, scope: options.scope, error: toSafeMessage(error) },
    });

    return { summary: null, skipped: true, reason: "load_failed" };
  }
}

interface UpdateAndSaveSummaryOptions {
  observer: CoreObserver;
  summary: ChatWorkflowExecutionContext["core"]["summary"];
  summaryUpdater: ChatWorkflowExecutionContext["core"]["summaryUpdater"];
  enabled: boolean;
  scope?: SummaryScope;
  currentSummary: ConversationSummary | null;
  history: ChatMessage[];
  userMessage: string;
  assistantMessage: string;
  recentMessageLimit: number;
  summarizeTriggerMessageCount: number;
  sessionId?: string;
}

/** 超阈值时压缩旧消息为摘要并持久化；失败不阻断主链路。 */
export async function updateAndSaveSummary(
  options: UpdateAndSaveSummaryOptions,
): Promise<UpdateAndSaveSummaryResult> {
  if (!options.enabled || options.scope === undefined) {
    return {
      updatedSummary: null,
      summarizedMessages: [],
      skipped: true,
      reason: options.scope === undefined ? "no_scope" : "disabled",
    };
  }

  const allMessagesForSummary: ChatMessage[] = [
    ...options.history,
    { role: "user", content: options.userMessage },
    { role: "assistant", content: options.assistantMessage },
  ];
  const split = splitForSummary(allMessagesForSummary, {
    recentMessageLimit: options.recentMessageLimit,
    summarizeTriggerMessageCount: options.summarizeTriggerMessageCount,
  });

  if (!split.triggered) {
    return {
      updatedSummary: null,
      summarizedMessages: [],
      skipped: true,
      reason: "below_threshold",
    };
  }

  if (split.messagesToSummarize.length === 0) {
    return {
      updatedSummary: null,
      summarizedMessages: [],
      skipped: true,
      reason: "no_messages_to_summarize",
    };
  }

  await safeEmit(options.observer, {
    type: "summary:update:start",
    timestamp: new Date(),
    payload: {
      sessionId: options.sessionId,
      scope: options.scope,
      previousSummaryLength: options.currentSummary?.content.length ?? 0,
      messagesToSummarizeCount: split.messagesToSummarize.length,
    },
  });

  let updatedSummary: ConversationSummary;

  try {
    const updateResult = await options.summaryUpdater.update({
      scope: options.scope,
      currentSummary: options.currentSummary,
      messagesToSummarize: split.messagesToSummarize,
    });

    if (updateResult.skipped) {
      const reason = updateResult.reason ?? "provider_noop";

      await safeEmit(options.observer, {
        type: "summary:update:end",
        timestamp: new Date(),
        payload: {
          ok: true,
          scope: options.scope,
          skipped: true,
          reason,
          messagesToSummarizeCount: split.messagesToSummarize.length,
        },
      });

      return {
        updatedSummary: null,
        summarizedMessages: split.messagesToSummarize,
        skipped: true,
        reason,
      };
    }

    updatedSummary = updateResult.summary;

    await safeEmit(options.observer, {
      type: "summary:update:end",
      timestamp: new Date(),
      payload: {
        ok: true,
        scope: options.scope,
        skipped: false,
        reason: updateResult.reason,
        previousSummaryLength: options.currentSummary?.content.length ?? 0,
        nextSummaryLength: updatedSummary.content.length,
        messagesToSummarizeCount: split.messagesToSummarize.length,
      },
    });
  } catch (error) {
    await safeEmit(options.observer, {
      type: "summary:update:end",
      timestamp: new Date(),
      payload: {
        ok: false,
        scope: options.scope,
        messagesToSummarizeCount: split.messagesToSummarize.length,
        error: toSafeMessage(error),
      },
    });

    return {
      updatedSummary: null,
      summarizedMessages: split.messagesToSummarize,
      skipped: true,
      reason: "update_failed",
    };
  }

  await safeEmit(options.observer, {
    type: "summary:save:start",
    timestamp: new Date(),
    payload: { sessionId: options.sessionId, scope: options.scope },
  });

  try {
    const saveResult = await options.summary.save({
      scope: options.scope,
      summary: updatedSummary,
    });

    await safeEmit(options.observer, {
      type: "summary:save:end",
      timestamp: new Date(),
      payload: {
        ok: true,
        scope: options.scope,
        summaryLength: saveResult.summary.content.length,
      },
    });

    return {
      updatedSummary: saveResult.summary,
      summarizedMessages: split.messagesToSummarize,
      skipped: false,
      reason: "updated",
    };
  } catch (error) {
    await safeEmit(options.observer, {
      type: "summary:save:end",
      timestamp: new Date(),
      payload: { ok: false, scope: options.scope, error: toSafeMessage(error) },
    });

    return {
      updatedSummary: null,
      summarizedMessages: split.messagesToSummarize,
      skipped: true,
      reason: "save_failed",
    };
  }
}

interface RecallMemoriesOptions {
  observer: CoreObserver;
  memory: ChatWorkflowExecutionContext["core"]["memory"];
  scope: MemoryScope;
  query: string;
  limit: number;
  minImportance: 1 | 2 | 3 | 4 | 5;
  sessionId?: string;
}

/** 按 query 召回长期记忆；失败时返回空数组且不阻断主链路。 */
export async function recallMemories(
  options: RecallMemoriesOptions,
): Promise<RecallMemoriesResult> {
  await safeEmit(options.observer, {
    type: "memory:recall:start",
    timestamp: new Date(),
    payload: {
      sessionId: options.sessionId,
      scope: options.scope,
      query: options.query,
      limit: options.limit,
      minImportance: options.minImportance,
    },
  });

  try {
    const result = await options.memory.recall({
      scope: options.scope,
      query: options.query,
      limit: options.limit,
      minImportance: options.minImportance,
    });

    await safeEmit(options.observer, {
      type: "memory:recall:end",
      timestamp: new Date(),
      payload: {
        ok: true,
        query: options.query,
        count: result.memories.length,
        memories: result.memories.map(toMemoryDebugPayload),
        ...(result.embeddingVectorLength !== undefined
          ? { embeddingVectorLength: result.embeddingVectorLength }
          : {}),
      },
    });

    return {
      memories: result.memories,
      ...(result.embeddingVectorLength !== undefined
        ? { embeddingVectorLength: result.embeddingVectorLength }
        : {}),
    };
  } catch (error) {
    await safeEmit(options.observer, {
      type: "memory:recall:end",
      timestamp: new Date(),
      payload: { ok: false, message: toSafeMessage(error) },
    });

    return { memories: [], degraded: true, reason: "recall_failed" };
  }
}

interface ExtractAndSaveOptions {
  observer: CoreObserver;
  recorder: WorkflowTraceRecorder;
  streamEmitter?: WorkflowStreamEmitter | undefined;
  memory: ChatWorkflowExecutionContext["core"]["memory"];
  memoryExtractor: ChatWorkflowExecutionContext["core"]["memoryExtractor"];
  scope: MemoryScope;
  sessionId?: string;
  userMessage: string;
  assistantMessage: string;
  history: ChatMessage[];
  conversationId?: string;
  messageIds?: string[];
  toolResults?: ToolResult[];
}

/** 抽取本轮记忆并保存（importance < 3 在 Workflow 层过滤）；失败不阻断主链路。 */
export async function extractAndSaveMemories(
  options: ExtractAndSaveOptions,
): Promise<ExtractAndSaveResult> {
  const extractResult = await runWorkflowStep({
    observer: options.observer,
    recorder: options.recorder,
    streamEmitter: options.streamEmitter,
    workflowStep: "memory:extract",
    legacyStep: "memory:extract",
    ...(options.sessionId !== undefined ? { sessionId: options.sessionId } : {}),
    run: async () => {
      await safeEmit(options.observer, {
        type: "memory:extract:start",
        timestamp: new Date(),
        payload: { sessionId: options.sessionId, scope: options.scope },
      });

      try {
        const result = await options.memoryExtractor.extract({
          scope: options.scope,
          userMessage: options.userMessage,
          assistantMessage: options.assistantMessage,
          history: options.history.slice(-6),
          ...deriveMemoryExternalContext(options.toolResults ?? []),
        });
        const extracted = result.memories;

        await safeEmit(options.observer, {
          type: "memory:extract:end",
          timestamp: new Date(),
          payload: { ok: true, count: extracted.length, memories: extracted },
        });

        return { extracted };
      } catch (error) {
        await safeEmit(options.observer, {
          type: "memory:extract:end",
          timestamp: new Date(),
          payload: { ok: false, message: toSafeMessage(error) },
        });

        return { extracted: [], degraded: true, reason: "extract_failed" };
      }
    },
    status: (result) => (result.degraded ? "degraded" : "success"),
    summarize: (result) => ({
      extractedCount: result.extracted.length,
      ...(result.degraded ? { degraded: true, reason: result.reason } : {}),
    }),
  });

  const extracted = extractResult.extracted;

  if (extractResult.degraded) {
    return { extracted: [], saved: [], skipped: [], degraded: true, reason: "extract_failed" };
  }

  const memoriesToSave = extracted.filter((memory) => memory.importance >= 3);
  const preSaveSkipped = extracted.filter((memory) => memory.importance < 3);

  return runWorkflowStep<ExtractAndSaveResult>({
    observer: options.observer,
    recorder: options.recorder,
    streamEmitter: options.streamEmitter,
    workflowStep: "memory:save",
    legacyStep: "memory:save",
    ...(options.sessionId !== undefined ? { sessionId: options.sessionId } : {}),
    run: async () => {
      await safeEmit(options.observer, {
        type: "memory:save:start",
        timestamp: new Date(),
        payload: {
          sessionId: options.sessionId,
          scope: options.scope,
          count: memoriesToSave.length,
        },
      });

      try {
        const saveResult = await options.memory.save({
          scope: options.scope,
          memories: memoriesToSave,
          source: {
            ...(options.conversationId !== undefined
              ? { conversationId: options.conversationId }
              : {}),
            ...(options.messageIds !== undefined ? { messageIds: options.messageIds } : {}),
          },
        });
        const skipped = [...preSaveSkipped, ...(saveResult.skipped ?? [])];

        await safeEmit(options.observer, {
          type: "memory:save:end",
          timestamp: new Date(),
          payload: {
            ok: true,
            savedCount: saveResult.saved.length,
            skippedCount: skipped.length,
            saved: saveResult.saved.map(toMemoryDebugPayload),
            ...(saveResult.embeddingVectorLength !== undefined
              ? { embeddingVectorLength: saveResult.embeddingVectorLength }
              : {}),
          },
        });

        return {
          extracted,
          saved: saveResult.saved,
          skipped,
          ...(saveResult.embeddingVectorLength !== undefined
            ? { embeddingVectorLength: saveResult.embeddingVectorLength }
            : {}),
        };
      } catch (error) {
        await safeEmit(options.observer, {
          type: "memory:save:end",
          timestamp: new Date(),
          payload: { ok: false, message: toSafeMessage(error) },
        });

        return {
          extracted,
          saved: [],
          skipped: preSaveSkipped,
          degraded: true,
          reason: "save_failed",
        };
      }
    },
    status: (result) => (result.degraded ? "degraded" : "success"),
    summarize: (result) => ({
      extractedCount: result.extracted.length,
      savedCount: result.saved.length,
      skippedCount: result.skipped.length,
      ...(result.embeddingVectorLength !== undefined
        ? { embeddingVectorLength: result.embeddingVectorLength }
        : {}),
      ...(result.degraded ? { degraded: true, reason: result.reason } : {}),
    }),
  });
}

function deriveMemoryExternalContext(toolResults: ToolResult[]): {
  externalContextUsed?: boolean;
  excludedToolNames?: string[];
} {
  const successfulResults = toolResults.filter((result) => result.ok !== false);
  const externalContextUsed = successfulResults.some(
    (result) => result.metadata?.externalContext === true,
  );
  const excludedToolNames = successfulResults
    .filter((result) => result.metadata?.memoryPolicy === "exclude-external-facts")
    .map((result) => result.name);

  return {
    ...(externalContextUsed ? { externalContextUsed: true } : {}),
    ...(excludedToolNames.length > 0
      ? { excludedToolNames: Array.from(new Set(excludedToolNames)) }
      : {}),
  };
}

/** 将记忆对象裁剪为 Observer payload 可安全展示的字段。 */
function toMemoryDebugPayload(memory: RecalledMemory | MemoryRecord): Record<string, unknown> {
  return {
    id: memory.id,
    type: memory.type,
    content: memory.content,
    importance: memory.importance,
    ...("score" in memory && memory.score !== undefined ? { score: memory.score } : {}),
  };
}
