/**
 * 当前 V1 聊天主链路实现（阶段 3～6）。
 *
 * 编排顺序：Persona → Safety(input) → Summary(load) → Memory(recall)
 * → Emotion(analyze/transition) → ToolRegistry.list → Prompt.build
 * → ToolPlanningProvider.plan → ToolRegistry.execute → final generate → Safety(output)
 * → Summary(update/save) → Memory(extract/save)。
 */
import type { EmotionState } from "../../abstractions/emotion";
import type {
  ChatMessage,
  GenerateOutput,
  ModelRuntimeInfo,
  ModelToolCall,
} from "../../abstractions/model";
import {
  resolveMemoryScope,
  type ExtractedMemory,
  type MemoryRecord,
  type MemoryScope,
  type RecalledMemory,
} from "../../abstractions/memory";
import type { CoreEvent, CoreObserver } from "../../abstractions/observer";
import type { CompanionPersona } from "../../abstractions/persona";
import {
  resolveSummaryScope,
  type ConversationSummary,
  type SummaryScope,
} from "../../abstractions/summary";
import type { ToolDefinition, ToolResult } from "../../abstractions/tool";
import type {
  ToolPlan,
  ToolPlanningDegradationReason,
  ToolPlanningProvider,
} from "../../abstractions/tool-planning";
import type {
  ChatWorkflow,
  ChatWorkflowDebugContext,
  ChatWorkflowExecutionContext,
  ChatWorkflowInput,
  ChatWorkflowOutput,
} from "../../abstractions/workflow";
import type {
  WorkflowErrorEventPayload,
  WorkflowStepEventPayload,
  WorkflowStepName,
  WorkflowStepStatus,
  WorkflowTraceError,
} from "../../abstractions/workflow-trace";
import { formatEmotionForPrompt } from "../emotion/prompt-formatter";
import { createNeutralEmotion } from "../emotion/transition";
import { formatMemoriesForPrompt } from "../memory/prompt-formatter";
import { buildPersonaSystemPrompt } from "../persona/persona-prompt-builder";
import { splitForSummary, trimRecentHistory } from "../summary/history-utils";
import { formatSummaryForPrompt } from "../summary/prompt-formatter";
import { DefaultToolPlanningProvider } from "../tool-planning/default-tool-planning-provider";
import { buildToolFollowUpMessages, toCoreToolCall, toModelTools } from "../tool/tool-adapter";
import { WorkflowTraceRecorder } from "./workflow-trace-recorder";

/** 未传 summaryOptions.recentMessageLimit 时的默认值。 */
const DEFAULT_RECENT_MESSAGE_LIMIT = 12;
/** 未传 summaryOptions.summarizeTriggerMessageCount 时的默认值。 */
const DEFAULT_SUMMARIZE_TRIGGER_MESSAGE_COUNT = 16;
const DEFAULT_MAX_TOOL_ROUNDS = 1;

export interface SimpleChatWorkflowOptions {
  /**
   * undefined 使用默认无状态规划器；null 显式关闭规划器，用于宿主自定义 Workflow 策略。
   */
  toolPlanningProvider?: ToolPlanningProvider | null;
}

type PlannerUnavailableSource = "not_configured" | "execution_failed";

interface WorkflowPromptState {
  persona: CompanionPersona;
  personaPrompt: string;
  systemPrompt: string;
  summaryContext?: string;
  memoryContext?: string;
  emotionContext?: string;
  messages: ChatMessage[];
}

interface WorkflowToolPlanningState {
  plan: ToolPlan;
  reason?: ToolPlanningDegradationReason;
  plannerUnavailableSource?: PlannerUnavailableSource;
  runtime?: ModelRuntimeInfo;
}

interface WorkflowGenerationState {
  finalOutput: GenerateOutput;
  toolCalls: ModelToolCall[];
  toolResults: ToolResult[];
  droppedToolCalls: ModelToolCall[];
  toolCallsDropped: boolean;
  rounds: number;
  followUpGenerated: boolean;
  followUpMessages?: ChatMessage[];
}

interface WorkflowExecutionState {
  input: ChatWorkflowInput;
  sessionId?: string;
  memoryScope: MemoryScope;
  summaryScope?: SummaryScope;
  recorder: WorkflowTraceRecorder;
  sanitizedHistory: ChatMessage[];
  recentHistory: ChatMessage[];
  summaryEnabled: boolean;
  recentMessageLimit: number;
  summarizeTriggerMessageCount: number;
  persona?: CompanionPersona;
  inputSafety?: Awaited<ReturnType<ChatWorkflowExecutionContext["core"]["safety"]["guardInput"]>>;
  summary?: ConversationSummary | null;
  recall?: RecallMemoriesResult;
  emotion?: AnalyzeEmotionResult;
  toolDefinitions: ToolDefinition[];
  prompt?: WorkflowPromptState;
  toolPlanning?: WorkflowToolPlanningState;
  generation?: WorkflowGenerationState;
  outputSafety?: Awaited<ReturnType<ChatWorkflowExecutionContext["core"]["safety"]["guardOutput"]>>;
  summaryResult?: UpdateAndSaveSummaryResult;
  memoryResult?: ExtractAndSaveResult;
}

/**
 * 阶段 4 聊天主链路：Persona → Safety(input) → Summary(load) → Memory(recall)
 * → Emotion(analyze/transition) → ToolRegistry.list → ToolPlanning → Safety(output)
 * → Summary(update/save) → Memory(extract/save)。
 *
 * 约束：
 * - Memory 失败不得打断主聊天链路；
 * - Emotion 失败不得打断主聊天链路；
 * - V1.1 Stage 4 只支持非流式 final generate，工具调用必须先经规划；
 * - 不保存 history，history 由宿主通过 ChatWorkflowInput.history 传入；
 * - 不读取环境变量、不写 console；
 * - Observer 事件失败不得打断主链路；
 * - Safety 拒绝统一抛错，不返回伪回复或未通过检查的模型文本。
 */
export class SimpleChatWorkflow implements ChatWorkflow {
  public readonly meta = {
    id: "workflow.simple-chat",
    kind: "workflow",
    name: "Simple Chat Workflow",
    description: "Minimal persona + safety + model chat workflow",
  } as const;

  private readonly toolPlanningProvider: ToolPlanningProvider | null | undefined;

  public constructor(options: SimpleChatWorkflowOptions = {}) {
    this.toolPlanningProvider = options.toolPlanningProvider;
  }

  /** 执行单轮聊天主链路，详见类级注释中的编排顺序与约束。 */
  public async execute(
    input: ChatWorkflowInput,
    context: ChatWorkflowExecutionContext,
  ): Promise<ChatWorkflowOutput> {
    const { observer } = context.core;
    const sessionId = input.sessionId;
    const state = createWorkflowExecutionState(input);

    await safeEmit(observer, {
      type: "workflow:start",
      timestamp: new Date(),
      payload: { sessionId, workflowId: state.recorder.workflowId },
    });

    try {
      if (typeof input.message !== "string" || input.message.trim() === "") {
        throw new Error("ChatWorkflowInput.message is required");
      }

      await runPersonaStep(state, context);
      await runInputSafetyStep(state, context);
      await runSummaryLoadStep(state, context);
      await runMemoryRecallStep(state, context);
      await runEmotionStep(state, context);
      await runToolListStep(state, context);
      await runPromptBuildStep(state, context);
      await runToolPlanningStep(state, context, this.resolveToolPlanningProvider());
      await runToolExecuteStep(state, context);
      await runFinalGenerateStep(state, context);
      await runOutputSafetyStep(state, context);
      await runSummarySaveStep(state, context);
      await runMemoryExtractSaveStep(state, context);

      const output = buildWorkflowOutput(state);
      const trace = state.recorder.snapshot();
      const modelOutput = requireStateValue(state.generation, "generation").finalOutput;

      await safeEmit(observer, {
        type: "workflow:end",
        timestamp: new Date(),
        payload: {
          sessionId,
          workflowId: state.recorder.workflowId,
          model: modelOutput.model,
          textLength: output.text.length,
          durationMs: trace.durationMs,
          budgetExceeded: trace.budgetExceeded,
          status: trace.status,
        },
      });

      return output;
    } catch (error) {
      await safeEmit(observer, {
        type: "workflow:error",
        timestamp: new Date(),
        payload: {
          workflowId: state.recorder.workflowId,
          ...(sessionId !== undefined ? { sessionId } : {}),
          message: toSafeMessage(error),
          trace: state.recorder.snapshot("failed"),
        } satisfies WorkflowErrorEventPayload,
      });
      throw error;
    }
  }

  private resolveToolPlanningProvider(): ToolPlanningProvider | null {
    if (this.toolPlanningProvider !== undefined) {
      return this.toolPlanningProvider;
    }

    return new DefaultToolPlanningProvider();
  }
}

function createWorkflowExecutionState(input: ChatWorkflowInput): WorkflowExecutionState {
  const sanitizedHistory = sanitizeHistory(input.history);
  const summaryScope = resolveSummaryScope(input);
  const summaryEnabled = input.summaryOptions?.enabled === true && summaryScope !== undefined;
  const recentMessageLimit =
    input.summaryOptions?.recentMessageLimit ?? DEFAULT_RECENT_MESSAGE_LIMIT;
  const summarizeTriggerMessageCount =
    input.summaryOptions?.summarizeTriggerMessageCount ?? DEFAULT_SUMMARIZE_TRIGGER_MESSAGE_COUNT;
  const allMessagesBeforeGenerate: ChatMessage[] = [
    ...sanitizedHistory,
    { role: "user", content: input.message },
  ];
  const recentHistory =
    summaryEnabled && allMessagesBeforeGenerate.length > summarizeTriggerMessageCount
      ? trimRecentHistory(sanitizedHistory, { recentMessageLimit })
      : sanitizedHistory;

  return {
    input,
    ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
    memoryScope: resolveMemoryScope(input),
    ...(summaryScope !== undefined ? { summaryScope } : {}),
    recorder: new WorkflowTraceRecorder(input.workflowOptions?.timeoutMs),
    sanitizedHistory,
    recentHistory,
    summaryEnabled,
    recentMessageLimit,
    summarizeTriggerMessageCount,
    toolDefinitions: [],
  };
}

async function runPersonaStep(
  state: WorkflowExecutionState,
  context: ChatWorkflowExecutionContext,
): Promise<void> {
  const { observer, persona } = context.core;
  const { sessionId } = state;

  state.persona = await runWorkflowStep({
    observer,
    recorder: state.recorder,
    workflowStep: "persona:load",
    legacyStep: "persona:load",
    ...(sessionId !== undefined ? { sessionId } : {}),
    run: async () => {
      await safeEmit(observer, {
        type: "persona:load:start",
        timestamp: new Date(),
        payload: { sessionId },
      });
      const result = await persona.load(sessionId !== undefined ? { sessionId } : undefined);
      await safeEmit(observer, {
        type: "persona:load:end",
        timestamp: new Date(),
        payload: { sessionId, personaId: result.id },
      });

      return result;
    },
    summarize: (result) => ({ personaId: result.id }),
  });
}

async function runInputSafetyStep(
  state: WorkflowExecutionState,
  context: ChatWorkflowExecutionContext,
): Promise<void> {
  const { observer, safety } = context.core;
  const { sessionId } = state;

  state.inputSafety = await runWorkflowStep({
    observer,
    recorder: state.recorder,
    workflowStep: "safety:input",
    legacyStep: "safety:input",
    ...(sessionId !== undefined ? { sessionId } : {}),
    run: async () => {
      await safeEmit(observer, {
        type: "safety:input:start",
        timestamp: new Date(),
        payload: { sessionId },
      });
      const result = await safety.guardInput({
        text: state.input.message,
        ...(sessionId !== undefined && { sessionId }),
      });
      await safeEmit(observer, {
        type: "safety:input:end",
        timestamp: new Date(),
        payload: { sessionId, allowed: result.allowed },
      });

      return result;
    },
    status: (result) => (result.allowed ? "success" : "failed"),
    summarize: (result) => ({ allowed: result.allowed }),
  });

  if (!state.inputSafety.allowed) {
    throw new Error("Input rejected by SafetyProvider");
  }
}

async function runSummaryLoadStep(
  state: WorkflowExecutionState,
  context: ChatWorkflowExecutionContext,
): Promise<void> {
  const { observer, summary } = context.core;

  const summaryLoad = await runWorkflowStep({
    observer,
    recorder: state.recorder,
    workflowStep: "summary:load",
    legacyStep: "summary:load",
    ...(state.sessionId !== undefined ? { sessionId: state.sessionId } : {}),
    run: () =>
      loadSummary({
        observer,
        summary,
        enabled: state.summaryEnabled,
        ...(state.summaryScope !== undefined ? { scope: state.summaryScope } : {}),
        ...(state.sessionId !== undefined ? { sessionId: state.sessionId } : {}),
      }),
    status: (result) =>
      result.skipped ? (result.reason === "load_failed" ? "degraded" : "skipped") : "success",
    summarize: (result) => ({
      enabled: state.summaryEnabled,
      hasSummary: result.summary !== null,
      skipped: result.skipped,
      reason: result.reason,
    }),
  });
  state.summary = summaryLoad.summary;
}

async function runMemoryRecallStep(
  state: WorkflowExecutionState,
  context: ChatWorkflowExecutionContext,
): Promise<void> {
  const { observer, memory } = context.core;

  state.recall = await runWorkflowStep({
    observer,
    recorder: state.recorder,
    workflowStep: "memory:recall",
    legacyStep: "memory:recall",
    ...(state.sessionId !== undefined ? { sessionId: state.sessionId } : {}),
    run: () =>
      recallMemories({
        observer,
        memory,
        scope: state.memoryScope,
        query: state.input.message,
        limit: state.input.memoryOptions?.limit ?? 5,
        minImportance: state.input.memoryOptions?.minImportance ?? 3,
        ...(state.sessionId !== undefined ? { sessionId: state.sessionId } : {}),
      }),
    status: (result) => (result.degraded ? "degraded" : "success"),
    summarize: (result) => ({
      count: result.memories.length,
      ...(result.embeddingVectorLength !== undefined
        ? { embeddingVectorLength: result.embeddingVectorLength }
        : {}),
      ...(result.degraded ? { degraded: true, reason: result.reason } : {}),
    }),
  });
}

async function runEmotionStep(
  state: WorkflowExecutionState,
  context: ChatWorkflowExecutionContext,
): Promise<void> {
  const { observer, emotion } = context.core;

  state.emotion = await runWorkflowStep({
    observer,
    recorder: state.recorder,
    workflowStep: "emotion:analyze",
    legacyStep: "emotion:analyze",
    ...(state.sessionId !== undefined ? { sessionId: state.sessionId } : {}),
    run: () =>
      analyzeAndTransitionEmotion({
        observer,
        emotion,
        message: state.input.message,
        history: state.recentHistory,
        persona: requireStateValue(state.persona, "persona"),
        recalledMemories: requireStateValue(state.recall, "recall").memories,
        ...(state.sessionId !== undefined ? { sessionId: state.sessionId } : {}),
        ...(state.input.emotion !== undefined ? { previous: state.input.emotion } : {}),
      }),
    status: (result) => (result.degraded ? "degraded" : "success"),
    summarize: (result) => ({
      previous: result.previous.current,
      next: result.next.current,
      ...(result.detected !== undefined ? { detected: result.detected.current } : {}),
      ...(result.degraded ? { degraded: true, reason: result.reason } : {}),
    }),
  });
}

async function runToolListStep(
  state: WorkflowExecutionState,
  context: ChatWorkflowExecutionContext,
): Promise<void> {
  state.toolDefinitions = await listTools({
    observer: context.core.observer,
    recorder: state.recorder,
    tools: context.core.tools,
    ...(state.sessionId !== undefined ? { sessionId: state.sessionId } : {}),
  });
}

async function runPromptBuildStep(
  state: WorkflowExecutionState,
  context: ChatWorkflowExecutionContext,
): Promise<void> {
  const summary = state.summary ?? null;
  const recall = requireStateValue(state.recall, "recall");
  const emotion = requireStateValue(state.emotion, "emotion");

  state.prompt = await runWorkflowStep({
    observer: context.core.observer,
    recorder: state.recorder,
    workflowStep: "prompt:build",
    legacyStep: "prompt:build",
    ...(state.sessionId !== undefined ? { sessionId: state.sessionId } : {}),
    run: async () => {
      const summaryContext = formatSummaryForPrompt(summary);
      const memoryContext = formatMemoriesForPrompt(recall.memories);
      const emotionContext = formatEmotionForPrompt(emotion.next);
      const built = buildPersonaSystemPrompt(requireStateValue(state.persona, "persona"), {
        ...(summaryContext !== undefined ? { summaryContext } : {}),
        ...(memoryContext !== undefined ? { memoryContext } : {}),
        ...(emotionContext !== undefined ? { emotionContext } : {}),
        toolDefinitions: state.toolDefinitions,
      });

      return {
        persona: built.persona,
        personaPrompt: built.personaPrompt,
        systemPrompt: built.systemPrompt,
        ...(summaryContext !== undefined ? { summaryContext } : {}),
        ...(memoryContext !== undefined ? { memoryContext } : {}),
        ...(emotionContext !== undefined ? { emotionContext } : {}),
        messages: [
          { role: "system", content: built.systemPrompt },
          ...state.recentHistory,
          { role: "user", content: state.input.message },
        ],
      };
    },
    summarize: (result) => ({
      hasSummaryContext: result.summaryContext !== undefined,
      hasMemoryContext: result.memoryContext !== undefined,
      hasEmotionContext: result.emotionContext !== undefined,
      toolDefinitionCount: state.toolDefinitions.length,
      messageCount: result.messages.length,
    }),
  });
}

async function runToolPlanningStep(
  state: WorkflowExecutionState,
  context: ChatWorkflowExecutionContext,
  planner: ToolPlanningProvider | null,
): Promise<void> {
  const { observer, model } = context.core;
  const modelTools = toModelTools(state.toolDefinitions);

  state.toolPlanning = await runWorkflowStep({
    observer,
    recorder: state.recorder,
    workflowStep: "tool:plan",
    legacyStep: "tool:plan",
    ...(state.sessionId !== undefined ? { sessionId: state.sessionId } : {}),
    startSummary: {
      toolDefinitionCount: state.toolDefinitions.length,
      plannerConfigured: planner !== null,
    },
    run: async () => {
      if (modelTools === undefined) {
        return {
          plan: { type: "no_tool", reason: "no_tools" },
          reason: "no_tools",
        };
      }

      if (planner === null) {
        return {
          plan: { type: "no_tool", reason: "planner_unavailable" },
          reason: "planner_unavailable",
          plannerUnavailableSource: "not_configured",
        };
      }

      try {
        const plan = await planner.plan({
          model,
          messages: requireStateValue(state.prompt, "prompt").messages,
          tools: modelTools,
        });
        const normalized = normalizeToolPlan(plan);

        if (normalized === null) {
          return {
            plan: { type: "no_tool", reason: "invalid_plan" },
            reason: "invalid_plan",
          };
        }

        return toToolPlanningState(normalized, "execution_failed");
      } catch {
        return {
          plan: { type: "no_tool", reason: "planner_unavailable" },
          reason: "planner_unavailable",
          plannerUnavailableSource: "execution_failed",
        };
      }
    },
    status: (result) => {
      if (result.reason === "no_tools") {
        return "skipped";
      }

      return result.reason === undefined ? "success" : "degraded";
    },
    summarize: (result) => ({
      planType: result.plan.type,
      ...(result.reason !== undefined ? { reason: result.reason } : {}),
      ...(result.plannerUnavailableSource !== undefined
        ? { plannerUnavailableSource: result.plannerUnavailableSource }
        : {}),
      toolCallCount: result.plan.type === "tool_calls" ? result.plan.calls.length : 0,
      ...(result.runtime !== undefined ? { runtime: result.runtime } : {}),
    }),
  });
}

async function runToolExecuteStep(
  state: WorkflowExecutionState,
  context: ChatWorkflowExecutionContext,
): Promise<void> {
  const plan = requireStateValue(state.toolPlanning, "toolPlanning").plan;

  if (plan.type !== "tool_calls") {
    await runWorkflowStep({
      observer: context.core.observer,
      recorder: state.recorder,
      workflowStep: "tool:execute",
      legacyStep: "tool:execute",
      ...(state.sessionId !== undefined ? { sessionId: state.sessionId } : {}),
      run: async () => [],
      status: () => "skipped",
      summarize: () => ({ requestedCount: 0, resultCount: 0, failedCount: 0 }),
    });
    state.generation = {
      finalOutput: createPlaceholderGenerateOutput(),
      toolCalls: [],
      toolResults: [],
      droppedToolCalls: [],
      toolCallsDropped: false,
      rounds: 0,
      followUpGenerated: false,
    };
    return;
  }

  if (DEFAULT_MAX_TOOL_ROUNDS < 1) {
    await runWorkflowStep({
      observer: context.core.observer,
      recorder: state.recorder,
      workflowStep: "tool:execute",
      legacyStep: "tool:execute",
      ...(state.sessionId !== undefined ? { sessionId: state.sessionId } : {}),
      run: async () => [],
      status: () => "skipped",
      summarize: () => ({
        requestedCount: plan.calls.length,
        resultCount: 0,
        failedCount: 0,
        reason: "max_tool_rounds_exceeded",
      }),
    });
    state.generation = {
      finalOutput: createPlaceholderGenerateOutput(),
      toolCalls: plan.calls,
      toolResults: [],
      droppedToolCalls: plan.calls,
      toolCallsDropped: plan.calls.length > 0,
      rounds: 0,
      followUpGenerated: false,
    };
    return;
  }

  const emotion = requireStateValue(state.emotion, "emotion");
  const toolResults = await executeToolCalls({
    observer: context.core.observer,
    recorder: state.recorder,
    tools: context.core.tools,
    toolCalls: plan.calls,
    ...(state.sessionId !== undefined ? { sessionId: state.sessionId } : {}),
    metadata: {
      ...(state.input.metadata ?? {}),
      currentEmotion: emotion.next,
    },
  });
  state.generation = {
    finalOutput: createPlaceholderGenerateOutput(),
    toolCalls: plan.calls,
    toolResults,
    droppedToolCalls: [],
    toolCallsDropped: false,
    rounds: 1,
    followUpGenerated: true,
    followUpMessages: buildToolFollowUpMessages(
      requireStateValue(state.prompt, "prompt").messages,
      "",
      plan.calls,
      toolResults,
    ),
  };
}

async function runFinalGenerateStep(
  state: WorkflowExecutionState,
  context: ChatWorkflowExecutionContext,
): Promise<void> {
  const prompt = requireStateValue(state.prompt, "prompt");
  const existingGeneration = state.generation;
  const finalMessages = existingGeneration?.followUpMessages ?? prompt.messages;

  const finalOutput = await runWorkflowStep({
    observer: context.core.observer,
    recorder: state.recorder,
    workflowStep: "model:generate",
    legacyStep: "model:generate",
    ...(state.sessionId !== undefined ? { sessionId: state.sessionId } : {}),
    startSummary: {
      messageCount: finalMessages.length,
      toolResultCount: existingGeneration?.toolResults.length ?? 0,
      toolsEnabled: false,
    },
    run: () =>
      context.core.model.generate({
        messages: finalMessages,
      }),
    summarize: (result) => ({
      messageCount: finalMessages.length,
      toolResultCount: existingGeneration?.toolResults.length ?? 0,
      model: result.model,
      toolCallCount: result.toolCalls?.length ?? 0,
      toolCallsDropped: (result.toolCalls?.length ?? 0) > 0,
      runtime: result.runtime,
    }),
  });
  const droppedToolCalls = finalOutput.toolCalls ?? [];

  state.generation = {
    finalOutput,
    toolCalls: existingGeneration?.toolCalls ?? [],
    toolResults: existingGeneration?.toolResults ?? [],
    droppedToolCalls,
    toolCallsDropped: droppedToolCalls.length > 0,
    rounds: existingGeneration?.rounds ?? 0,
    followUpGenerated: existingGeneration?.followUpGenerated ?? false,
    ...(existingGeneration?.followUpMessages !== undefined
      ? { followUpMessages: existingGeneration.followUpMessages }
      : {}),
  };
}

async function runOutputSafetyStep(
  state: WorkflowExecutionState,
  context: ChatWorkflowExecutionContext,
): Promise<void> {
  const { observer, safety } = context.core;
  const modelOutput = requireStateValue(state.generation, "generation").finalOutput;

  state.outputSafety = await runWorkflowStep({
    observer,
    recorder: state.recorder,
    workflowStep: "safety:output",
    legacyStep: "safety:output",
    ...(state.sessionId !== undefined ? { sessionId: state.sessionId } : {}),
    run: async () => {
      await safeEmit(observer, {
        type: "safety:output:start",
        timestamp: new Date(),
        payload: { sessionId: state.sessionId },
      });
      const result = await safety.guardOutput({
        text: modelOutput.text,
        ...(state.sessionId !== undefined && { sessionId: state.sessionId }),
      });
      await safeEmit(observer, {
        type: "safety:output:end",
        timestamp: new Date(),
        payload: { sessionId: state.sessionId, allowed: result.allowed },
      });

      return result;
    },
    status: (result) => (result.allowed ? "success" : "failed"),
    summarize: (result) => ({ allowed: result.allowed }),
  });

  if (!state.outputSafety.allowed) {
    throw new Error("Output rejected by SafetyProvider");
  }
}

async function runSummarySaveStep(
  state: WorkflowExecutionState,
  context: ChatWorkflowExecutionContext,
): Promise<void> {
  const { observer, summary, summaryUpdater } = context.core;
  const modelOutput = requireStateValue(state.generation, "generation").finalOutput;

  state.summaryResult = await runWorkflowStep({
    observer,
    recorder: state.recorder,
    workflowStep: "summary:save",
    legacyStep: "summary:save",
    ...(state.sessionId !== undefined ? { sessionId: state.sessionId } : {}),
    run: () =>
      updateAndSaveSummary({
        observer,
        summary,
        summaryUpdater,
        enabled: state.summaryEnabled,
        ...(state.summaryScope !== undefined ? { scope: state.summaryScope } : {}),
        currentSummary: state.summary ?? null,
        history: state.sanitizedHistory,
        userMessage: state.input.message,
        assistantMessage: modelOutput.text,
        recentMessageLimit: state.recentMessageLimit,
        summarizeTriggerMessageCount: state.summarizeTriggerMessageCount,
        ...(state.sessionId !== undefined ? { sessionId: state.sessionId } : {}),
      }),
    status: (result) =>
      result.skipped ? (result.reason.endsWith("_failed") ? "degraded" : "skipped") : "success",
    summarize: (result) => ({
      skipped: result.skipped,
      reason: result.reason,
      summarizedMessageCount: result.summarizedMessages.length,
      hasUpdatedSummary: result.updatedSummary !== null,
    }),
  });
}

async function runMemoryExtractSaveStep(
  state: WorkflowExecutionState,
  context: ChatWorkflowExecutionContext,
): Promise<void> {
  const modelOutput = requireStateValue(state.generation, "generation").finalOutput;

  state.memoryResult = await extractAndSaveMemories({
    observer: context.core.observer,
    recorder: state.recorder,
    memory: context.core.memory,
    memoryExtractor: context.core.memoryExtractor,
    scope: state.memoryScope,
    ...(state.sessionId !== undefined ? { sessionId: state.sessionId } : {}),
    userMessage: state.input.message,
    assistantMessage: modelOutput.text,
    history: state.sanitizedHistory,
    ...(state.input.conversationId !== undefined
      ? { conversationId: state.input.conversationId }
      : {}),
    ...(state.input.messageIds !== undefined ? { messageIds: state.input.messageIds } : {}),
  });
}

function buildWorkflowOutput(state: WorkflowExecutionState): ChatWorkflowOutput {
  const prompt = requireStateValue(state.prompt, "prompt");
  const generation = requireStateValue(state.generation, "generation");
  const emotion = requireStateValue(state.emotion, "emotion");
  const recall = requireStateValue(state.recall, "recall");
  const inputSafety = requireStateValue(state.inputSafety, "inputSafety");
  const outputSafety = requireStateValue(state.outputSafety, "outputSafety");
  const summaryResult = requireStateValue(state.summaryResult, "summaryResult");
  const memoryResult = requireStateValue(state.memoryResult, "memoryResult");
  const modelOutput = generation.finalOutput;
  const embeddingVectorLength = recall.embeddingVectorLength ?? memoryResult.embeddingVectorLength;
  const debugContext: ChatWorkflowDebugContext = {
    scope: state.memoryScope,
    ...(prompt.memoryContext !== undefined ? { memoryContext: prompt.memoryContext } : {}),
    ...(prompt.summaryContext !== undefined ? { summaryContext: prompt.summaryContext } : {}),
    ...(prompt.emotionContext !== undefined ? { emotionContext: prompt.emotionContext } : {}),
    previousEmotion: emotion.previous,
    ...(emotion.detected !== undefined ? { detectedEmotion: emotion.detected } : {}),
    nextEmotion: emotion.next,
    recentHistory: state.recentHistory,
    summarizedMessages: summaryResult.summarizedMessages,
    personaPrompt: prompt.personaPrompt,
    systemPrompt: prompt.systemPrompt,
    messages: prompt.messages,
    toolDefinitions: state.toolDefinitions,
    toolCalls: generation.toolCalls,
    toolResults: generation.toolResults,
    ...(generation.droppedToolCalls.length > 0
      ? { droppedToolCalls: generation.droppedToolCalls }
      : {}),
    ...(generation.followUpMessages !== undefined
      ? { toolFollowUpMessages: generation.followUpMessages }
      : {}),
    ...(embeddingVectorLength !== undefined ? { embeddingVectorLength } : {}),
  };
  const toolPlanning = state.toolPlanning;

  if (toolPlanning !== undefined) {
    debugContext.toolPlan = toolPlanning.plan;

    if (toolPlanning.reason !== undefined) {
      debugContext.toolPlanningReason = toolPlanning.reason;
    }

    if (toolPlanning.plannerUnavailableSource !== undefined) {
      debugContext.plannerUnavailableSource = toolPlanning.plannerUnavailableSource;
    }

    if (toolPlanning.runtime !== undefined) {
      debugContext.toolPlanningRuntime = toolPlanning.runtime;
    }
  }

  const trace = state.recorder.snapshot();

  return {
    text: modelOutput.text,
    model: modelOutput.model,
    raw: modelOutput.raw,
    persona: prompt.persona,
    memories: recall.memories,
    emotion: emotion.next,
    toolResults: generation.toolResults,
    safety: { input: inputSafety, output: outputSafety },
    metadata: {
      historyCount: state.sanitizedHistory.length,
      messageCount: prompt.messages.length,
      toolDefinitions: state.toolDefinitions,
      toolCalls: generation.toolCalls,
      droppedToolCalls: generation.droppedToolCalls,
      toolCallsDropped: generation.toolCallsDropped,
      toolRounds: generation.rounds,
      toolFollowUpGenerated: generation.followUpGenerated,
      ...(toolPlanning !== undefined
        ? {
            toolPlan: toolPlanning.plan,
            ...(toolPlanning.reason !== undefined
              ? { toolPlanningReason: toolPlanning.reason }
              : {}),
            ...(toolPlanning.plannerUnavailableSource !== undefined
              ? { plannerUnavailableSource: toolPlanning.plannerUnavailableSource }
              : {}),
            ...(toolPlanning.runtime !== undefined
              ? { toolPlanningRuntime: toolPlanning.runtime }
              : {}),
          }
        : {}),
      extractedMemories: memoryResult.extracted,
      savedMemories: memoryResult.saved,
      skippedMemories: memoryResult.skipped,
      debugContext,
      summary: state.summary ?? null,
      updatedSummary: summaryResult.updatedSummary,
      summarySkipped: summaryResult.skipped,
      summarySkipReason: summaryResult.reason,
      ...(state.input.workflowOptions?.includeTrace === true ? { trace } : {}),
    },
    modelOutput,
  };
}

function normalizeToolPlan(plan: ToolPlan): ToolPlan | null {
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

function toToolPlanningState(
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

function createPlaceholderGenerateOutput(): GenerateOutput {
  return {
    text: "",
    model: "",
    raw: null,
  };
}

function requireStateValue<T>(value: T | undefined, name: string): T {
  if (value === undefined) {
    throw new Error(`Workflow state is missing ${name}`);
  }

  return value;
}

/**
 * Observer 不得打断主链路：同步异常与异步 rejection 都吞掉。
 */
async function safeEmit(observer: CoreObserver, event: CoreEvent): Promise<void> {
  try {
    await Promise.resolve(observer.emit(event));
  } catch {
    // Observer 异常不得打断 Workflow
  }
}

interface RunWorkflowStepOptions<TResult> {
  observer: CoreObserver;
  recorder: WorkflowTraceRecorder;
  workflowStep: WorkflowStepName;
  legacyStep: string;
  sessionId?: string;
  startSummary?: Record<string, unknown>;
  run: () => Promise<TResult>;
  status?: (result: TResult) => WorkflowStepStatus;
  summarize?: (result: TResult) => Record<string, unknown>;
}

async function runWorkflowStep<TResult>(
  options: RunWorkflowStepOptions<TResult>,
): Promise<TResult> {
  const active = options.recorder.start(options.workflowStep);

  await emitWorkflowStep(options.observer, {
    workflowId: options.recorder.workflowId,
    step: `${options.legacyStep}:start`,
    workflowStep: options.workflowStep,
    phase: "start",
    ...(options.sessionId !== undefined ? { sessionId: options.sessionId } : {}),
    ...(options.startSummary !== undefined ? options.startSummary : {}),
    ...(options.startSummary !== undefined ? { summary: options.startSummary } : {}),
  });

  try {
    const result = await options.run();
    const status = options.status?.(result) ?? "success";
    const summary = options.summarize?.(result);
    const traceStep = options.recorder.end(active, status, {
      ...(summary !== undefined ? { summary } : {}),
    });

    await emitWorkflowStep(options.observer, {
      workflowId: options.recorder.workflowId,
      step: `${options.legacyStep}:end`,
      workflowStep: options.workflowStep,
      phase: status === "success" ? "end" : status,
      ...(options.sessionId !== undefined ? { sessionId: options.sessionId } : {}),
      ...(traceStep.durationMs !== undefined ? { durationMs: traceStep.durationMs } : {}),
      ...(summary !== undefined ? summary : {}),
      ...(summary !== undefined ? { summary } : {}),
    });

    return result;
  } catch (error) {
    const safeError = toTraceError(error);
    const traceStep = options.recorder.end(active, "failed", { error: safeError });

    await emitWorkflowStep(options.observer, {
      workflowId: options.recorder.workflowId,
      step: `${options.legacyStep}:failed`,
      workflowStep: options.workflowStep,
      phase: "failed",
      ...(options.sessionId !== undefined ? { sessionId: options.sessionId } : {}),
      ...(traceStep.durationMs !== undefined ? { durationMs: traceStep.durationMs } : {}),
      error: safeError,
    });

    throw error;
  }
}

async function emitWorkflowStep(
  observer: CoreObserver,
  payload: WorkflowStepEventPayload,
): Promise<void> {
  await safeEmit(observer, {
    type: "workflow:step",
    timestamp: new Date(),
    payload,
  });
}

interface ListToolsOptions {
  observer: CoreObserver;
  recorder: WorkflowTraceRecorder;
  tools: ChatWorkflowExecutionContext["core"]["tools"];
  sessionId?: string;
}

async function listTools(options: ListToolsOptions): Promise<ToolDefinition[]> {
  return runWorkflowStep({
    observer: options.observer,
    recorder: options.recorder,
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

interface ExecuteToolCallsOptions {
  observer: CoreObserver;
  recorder: WorkflowTraceRecorder;
  tools: ChatWorkflowExecutionContext["core"]["tools"];
  toolCalls: ModelToolCall[];
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

async function executeToolCalls(options: ExecuteToolCallsOptions): Promise<ToolResult[]> {
  return runWorkflowStep({
    observer: options.observer,
    recorder: options.recorder,
    workflowStep: "tool:execute",
    legacyStep: "tool:execute",
    ...(options.sessionId !== undefined ? { sessionId: options.sessionId } : {}),
    run: async () => {
      const results: ToolResult[] = [];

      for (const modelToolCall of options.toolCalls) {
        const coreCall = toCoreToolCall(modelToolCall);

        await safeEmit(options.observer, {
          type: "tool:execute:start",
          timestamp: new Date(),
          payload: {
            sessionId: options.sessionId,
            toolCallId: coreCall.id,
            name: coreCall.name,
            arguments: coreCall.arguments,
          },
        });

        const result = hasInvalidJsonArguments(modelToolCall, coreCall)
          ? createInvalidArgumentsResult(modelToolCall)
          : await options.tools.execute({
              call: coreCall,
              ...(options.sessionId !== undefined ? { sessionId: options.sessionId } : {}),
              ...(options.metadata !== undefined ? { metadata: options.metadata } : {}),
            });

        await safeEmit(options.observer, {
          type: "tool:execute:end",
          timestamp: new Date(),
          payload: {
            sessionId: options.sessionId,
            toolCallId: result.toolCallId,
            name: result.name,
            ok: result.ok ?? true,
            result: result.result,
            error: result.error,
            durationMs: result.metadata?.durationMs,
          },
        });

        results.push(result);
      }

      return results;
    },
    status: (results) => (results.some((result) => result.ok === false) ? "degraded" : "success"),
    summarize: (results) => ({
      requestedCount: options.toolCalls.length,
      resultCount: results.length,
      failedCount: results.filter((result) => result.ok === false).length,
    }),
  });
}

function hasInvalidJsonArguments(
  modelToolCall: ModelToolCall,
  coreCall: { arguments: unknown },
): boolean {
  return (
    typeof modelToolCall.arguments === "string" &&
    modelToolCall.arguments.trim() !== "" &&
    coreCall.arguments === modelToolCall.arguments
  );
}

function createInvalidArgumentsResult(modelToolCall: ModelToolCall): ToolResult {
  return {
    name: modelToolCall.name,
    ...(modelToolCall.id !== undefined ? { toolCallId: modelToolCall.id } : {}),
    ok: false,
    result: null,
    error: {
      code: "TOOL_INVALID_ARGUMENTS",
      message: `Tool arguments are not valid JSON: ${modelToolCall.name}`,
    },
    metadata: {
      rawArguments: modelToolCall.arguments,
    },
  };
}

/**
 * 轻量清洗宿主传入的短期历史：
 * - 只保留 system / user / assistant 角色（白名单，过滤 tool 及未知角色）；
 * - 过滤空白内容；
 * - 不修改原始数组。
 */
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

interface AnalyzeEmotionResult {
  previous: EmotionState;
  detected?: EmotionState;
  next: EmotionState;
  degraded?: boolean;
  reason?: string;
}

/** 分析伴侣意向情绪并计算最终情绪；失败时回退 previous/neutral，不阻断主链路。 */
async function analyzeAndTransitionEmotion(
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

/**
 * 只暴露安全的错误摘要，不透传底层错误对象。
 */
function toSafeMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "SimpleChatWorkflow execution failed";
  return redactSensitiveMessage(message);
}

function toTraceError(error: unknown): WorkflowTraceError {
  return { message: toSafeMessage(error) };
}

function redactSensitiveMessage(message: string): string {
  const redacted = message
    .replace(/\b(?:postgres(?:ql)?|mysql|mongodb):\/\/\S+/gi, "[redacted-connection-string]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(
      /\b(api[_-]?key|token|secret|password)=([^&\s]+)/gi,
      (_match, key: string) => `${key}=[redacted]`,
    );

  return redacted.length > 300 ? `${redacted.slice(0, 297)}...` : redacted;
}

interface LoadSummaryOptions {
  observer: CoreObserver;
  summary: ChatWorkflowExecutionContext["core"]["summary"];
  enabled: boolean;
  scope?: SummaryScope;
  sessionId?: string;
}

interface LoadSummaryResult {
  summary: ConversationSummary | null;
  skipped: boolean;
  reason?: string;
}

/** 加载当前会话摘要；失败时返回 null 且不阻断主链路。 */
async function loadSummary(options: LoadSummaryOptions): Promise<LoadSummaryResult> {
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

interface UpdateAndSaveSummaryResult {
  updatedSummary: ConversationSummary | null;
  summarizedMessages: ChatMessage[];
  skipped: boolean;
  reason: string;
}

/** 超阈值时压缩旧消息为摘要并持久化；失败不阻断主链路。 */
async function updateAndSaveSummary(
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

interface RecallMemoriesResult {
  memories: RecalledMemory[];
  embeddingVectorLength?: number;
  degraded?: boolean;
  reason?: string;
}

/** 按 query 召回长期记忆；失败时返回空数组且不阻断主链路。 */
async function recallMemories(options: RecallMemoriesOptions): Promise<RecallMemoriesResult> {
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
  memory: ChatWorkflowExecutionContext["core"]["memory"];
  memoryExtractor: ChatWorkflowExecutionContext["core"]["memoryExtractor"];
  scope: MemoryScope;
  sessionId?: string;
  userMessage: string;
  assistantMessage: string;
  history: ChatMessage[];
  conversationId?: string;
  messageIds?: string[];
}

interface ExtractAndSaveResult {
  extracted: ExtractedMemory[];
  saved: MemoryRecord[];
  skipped: ExtractedMemory[];
  embeddingVectorLength?: number;
  degraded?: boolean;
  reason?: string;
}

/** 抽取本轮记忆并保存（importance < 3 在 Workflow 层过滤）；失败不阻断主链路。 */
async function extractAndSaveMemories(
  options: ExtractAndSaveOptions,
): Promise<ExtractAndSaveResult> {
  const extractResult = await runWorkflowStep({
    observer: options.observer,
    recorder: options.recorder,
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
