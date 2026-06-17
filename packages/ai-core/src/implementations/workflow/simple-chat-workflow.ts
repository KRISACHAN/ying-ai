/**
 * 当前 V1 聊天主链路实现（阶段 3～5）。
 *
 * 编排顺序：Persona → Safety(input) → Summary(load) → Memory(recall)
 * → Emotion(analyze/transition) → Model → Safety(output)
 * → Summary(update/save) → Memory(extract/save)。
 * 详见类注释中的约束说明。
 */
import type { EmotionState } from "../../abstractions/emotion";
import type { ChatMessage } from "../../abstractions/model";
import {
  resolveMemoryScope,
  type ExtractedMemory,
  type MemoryRecord,
  type MemoryScope,
  type RecalledMemory,
} from "../../abstractions/memory";
import type { CoreEvent, CoreObserver } from "../../abstractions/observer";
import type { CompanionGender, CompanionPersona } from "../../abstractions/persona";
import {
  resolveSummaryScope,
  type ConversationSummary,
  type SummaryScope,
} from "../../abstractions/summary";
import type {
  ChatWorkflow,
  ChatWorkflowDebugContext,
  ChatWorkflowExecutionContext,
  ChatWorkflowInput,
  ChatWorkflowOutput,
} from "../../abstractions/workflow";
import { formatEmotionForPrompt } from "../emotion/prompt-formatter";
import { createNeutralEmotion } from "../emotion/transition";
import { formatMemoriesForPrompt } from "../memory/prompt-formatter";
import { splitForSummary, trimRecentHistory } from "../summary/history-utils";
import { formatSummaryForPrompt } from "../summary/prompt-formatter";

/** 未传 summaryOptions.recentMessageLimit 时的默认值。 */
const DEFAULT_RECENT_MESSAGE_LIMIT = 12;
/** 未传 summaryOptions.summarizeTriggerMessageCount 时的默认值。 */
const DEFAULT_SUMMARIZE_TRIGGER_MESSAGE_COUNT = 16;

/**
 * 阶段 5 聊天主链路：Persona → Safety(input) → Summary(load) → Memory(recall)
 * → Emotion(analyze/transition) → Model → Safety(output)
 * → Summary(update/save) → Memory(extract/save)。
 *
 * 约束：
 * - Memory 失败不得打断主聊天链路；
 * - Emotion 失败不得打断主聊天链路；
 * - 不执行模型返回的 toolCalls；
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

  /** 执行单轮聊天主链路，详见类级注释中的编排顺序与约束。 */
  public async execute(
    input: ChatWorkflowInput,
    context: ChatWorkflowExecutionContext,
  ): Promise<ChatWorkflowOutput> {
    const {
      observer,
      persona,
      safety,
      model,
      memory,
      memoryExtractor,
      summary,
      summaryUpdater,
      emotion,
    } = context.core;
    const sessionId = input.sessionId;
    const scope = resolveMemoryScope(input);

    await safeEmit(observer, {
      type: "workflow:start",
      timestamp: new Date(),
      payload: { sessionId },
    });

    try {
      if (typeof input.message !== "string" || input.message.trim() === "") {
        throw new Error("ChatWorkflowInput.message is required");
      }

      await safeEmit(observer, {
        type: "persona:load:start",
        timestamp: new Date(),
        payload: { sessionId },
      });
      const loadedPersona = await persona.load(sessionId !== undefined ? { sessionId } : undefined);
      await safeEmit(observer, {
        type: "persona:load:end",
        timestamp: new Date(),
        payload: { sessionId, personaId: loadedPersona.id },
      });

      await safeEmit(observer, {
        type: "safety:input:start",
        timestamp: new Date(),
        payload: { sessionId },
      });
      const inputSafety = await safety.guardInput({
        text: input.message,
        ...(sessionId !== undefined && { sessionId }),
      });
      await safeEmit(observer, {
        type: "safety:input:end",
        timestamp: new Date(),
        payload: { sessionId, allowed: inputSafety.allowed },
      });
      if (!inputSafety.allowed) {
        throw new Error("Input rejected by SafetyProvider");
      }

      const sanitizedHistory = sanitizeHistory(input.history);
      const summaryScope = resolveSummaryScope(input);
      const summaryEnabled = input.summaryOptions?.enabled === true && summaryScope !== undefined;
      const recentMessageLimit =
        input.summaryOptions?.recentMessageLimit ?? DEFAULT_RECENT_MESSAGE_LIMIT;
      const summarizeTriggerMessageCount =
        input.summaryOptions?.summarizeTriggerMessageCount ??
        DEFAULT_SUMMARIZE_TRIGGER_MESSAGE_COUNT;
      const summaryLoad = await loadSummary({
        observer,
        summary,
        enabled: summaryEnabled,
        ...(summaryScope !== undefined ? { scope: summaryScope } : {}),
        ...(sessionId !== undefined ? { sessionId } : {}),
      });
      const loadedSummary = summaryLoad.summary;
      const allMessagesBeforeGenerate: ChatMessage[] = [
        ...sanitizedHistory,
        { role: "user", content: input.message },
      ];
      const recentHistory =
        summaryEnabled && allMessagesBeforeGenerate.length > summarizeTriggerMessageCount
          ? trimRecentHistory(sanitizedHistory, { recentMessageLimit })
          : sanitizedHistory;
      const recall = await recallMemories({
        observer,
        memory,
        scope,
        query: input.message,
        limit: input.memoryOptions?.limit ?? 5,
        minImportance: input.memoryOptions?.minImportance ?? 3,
        ...(sessionId !== undefined ? { sessionId } : {}),
      });
      const recalledMemories = recall.memories;
      const emotionResult = await analyzeAndTransitionEmotion({
        observer,
        emotion,
        message: input.message,
        history: recentHistory,
        persona: loadedPersona,
        recalledMemories,
        ...(sessionId !== undefined ? { sessionId } : {}),
        ...(input.emotion !== undefined ? { previous: input.emotion } : {}),
      });
      const summaryContext = formatSummaryForPrompt(loadedSummary);
      const memoryContext = formatMemoriesForPrompt(recalledMemories);
      const emotionContext = formatEmotionForPrompt(emotionResult.next);
      const systemPrompt = buildPersonaSystemPrompt(loadedPersona, {
        ...(summaryContext !== undefined ? { summaryContext } : {}),
        ...(memoryContext !== undefined ? { memoryContext } : {}),
        ...(emotionContext !== undefined ? { emotionContext } : {}),
      });
      const messages: ChatMessage[] = [
        { role: "system", content: systemPrompt },
        ...recentHistory,
        { role: "user", content: input.message },
      ];

      await safeEmit(observer, {
        type: "workflow:step",
        timestamp: new Date(),
        payload: { step: "model:generate:start", sessionId, messageCount: messages.length },
      });
      const modelOutput = await model.generate({ messages });
      await safeEmit(observer, {
        type: "workflow:step",
        timestamp: new Date(),
        payload: {
          step: "model:generate:end",
          sessionId,
          model: modelOutput.model,
          runtime: modelOutput.runtime,
        },
      });

      await safeEmit(observer, {
        type: "safety:output:start",
        timestamp: new Date(),
        payload: { sessionId },
      });
      const outputSafety = await safety.guardOutput({
        text: modelOutput.text,
        ...(sessionId !== undefined && { sessionId }),
      });
      await safeEmit(observer, {
        type: "safety:output:end",
        timestamp: new Date(),
        payload: { sessionId, allowed: outputSafety.allowed },
      });
      if (!outputSafety.allowed) {
        throw new Error("Output rejected by SafetyProvider");
      }

      const summaryResult = await updateAndSaveSummary({
        observer,
        summary,
        summaryUpdater,
        enabled: summaryEnabled,
        ...(summaryScope !== undefined ? { scope: summaryScope } : {}),
        currentSummary: loadedSummary,
        history: sanitizedHistory,
        userMessage: input.message,
        assistantMessage: modelOutput.text,
        recentMessageLimit,
        summarizeTriggerMessageCount,
        ...(sessionId !== undefined ? { sessionId } : {}),
      });

      const memoryResult = await extractAndSaveMemories({
        observer,
        memory,
        memoryExtractor,
        scope,
        ...(sessionId !== undefined ? { sessionId } : {}),
        userMessage: input.message,
        assistantMessage: modelOutput.text,
        history: sanitizedHistory,
        ...(input.conversationId !== undefined ? { conversationId: input.conversationId } : {}),
        ...(input.messageIds !== undefined ? { messageIds: input.messageIds } : {}),
      });

      const embeddingVectorLength =
        recall.embeddingVectorLength ?? memoryResult.embeddingVectorLength;
      const debugContext: ChatWorkflowDebugContext = {
        scope,
        ...(memoryContext !== undefined ? { memoryContext } : {}),
        ...(summaryContext !== undefined ? { summaryContext } : {}),
        ...(emotionContext !== undefined ? { emotionContext } : {}),
        previousEmotion: emotionResult.previous,
        ...(emotionResult.detected !== undefined
          ? { detectedEmotion: emotionResult.detected }
          : {}),
        nextEmotion: emotionResult.next,
        recentHistory,
        summarizedMessages: summaryResult.summarizedMessages,
        systemPrompt,
        messages,
        ...(embeddingVectorLength !== undefined ? { embeddingVectorLength } : {}),
      };

      const output: ChatWorkflowOutput = {
        text: modelOutput.text,
        model: modelOutput.model,
        raw: modelOutput.raw,
        persona: loadedPersona,
        memories: recalledMemories,
        emotion: emotionResult.next,
        safety: { input: inputSafety, output: outputSafety },
        metadata: {
          historyCount: sanitizedHistory.length,
          messageCount: messages.length,
          toolCallsIgnored: modelOutput.toolCalls?.length ?? 0,
          extractedMemories: memoryResult.extracted,
          savedMemories: memoryResult.saved,
          skippedMemories: memoryResult.skipped,
          debugContext,
          summary: loadedSummary,
          updatedSummary: summaryResult.updatedSummary,
          summarySkipped: summaryResult.skipped,
          summarySkipReason: summaryResult.reason,
        },
        modelOutput,
      };

      await safeEmit(observer, {
        type: "workflow:end",
        timestamp: new Date(),
        payload: { sessionId, model: modelOutput.model, textLength: output.text.length },
      });

      return output;
    } catch (error) {
      await safeEmit(observer, {
        type: "workflow:error",
        timestamp: new Date(),
        payload: { sessionId, message: toSafeMessage(error) },
      });
      throw error;
    }
  }
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

    return { previous, detected, next };
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

    return { previous, next: previous };
  }
}

/** 将 Persona、摘要、长期记忆与情绪上下文拼成最终 system prompt。 */
function buildPersonaSystemPrompt(
  persona: CompanionPersona,
  context: { summaryContext?: string; memoryContext?: string; emotionContext?: string },
): string {
  const { summaryContext, memoryContext, emotionContext } = context;
  const lines: string[] = [
    "你是一个 AI 伴侣角色，请始终以该角色身份与用户对话。",
    "",
    `角色名称：${persona.name}`,
    `性别：${formatGender(persona.gender)}`,
  ];

  if (persona.relationship) {
    lines.push(`关系：${persona.relationship}`);
  }
  if (persona.personality) {
    lines.push(`性格：${persona.personality}`);
  }
  if (persona.speakingStyle) {
    lines.push(`说话风格：${persona.speakingStyle}`);
  }
  if (persona.background) {
    lines.push(`背景：${persona.background}`);
  }

  if (persona.systemPrompt) {
    lines.push("", "额外角色指令：", persona.systemPrompt);
  }

  if (summaryContext !== undefined) {
    lines.push("", summaryContext);
  }

  if (memoryContext !== undefined) {
    lines.push("", memoryContext);
  }

  if (emotionContext !== undefined) {
    lines.push("", emotionContext);
  }

  lines.push(
    "",
    "回复要求：",
    "1. 使用自然、亲近、有陪伴感的语气；",
    "2. 不要声称自己拥有真实人类身份；",
    "3. 不要编造你无法知道的长期记忆；",
    "4. 如果上下文不足，可以温和询问用户；",
    "5. 情绪只影响语气和关注点，不要直接暴露情绪标签；",
  );

  if (summaryContext !== undefined && memoryContext !== undefined) {
    lines.push("6. 可以自然参考会话摘要与长期上下文，但不要暴露内部系统。");
  } else if (summaryContext !== undefined) {
    lines.push("6. 可以自然参考会话摘要，但不要暴露内部系统。");
  } else if (memoryContext !== undefined) {
    lines.push("6. 可以自然参考长期上下文，但不要暴露长期记忆系统。");
  } else {
    lines.push("6. 只能依据本轮输入与传入的短期历史回答。");
  }

  return lines.join("\n");
}

/** 将 CompanionGender 枚举转为中文展示文案，用于 system prompt。 */
function formatGender(gender: CompanionGender): string {
  switch (gender) {
    case "female":
      return "女性";
    case "male":
      return "男性";
    case "non_binary":
      return "非二元";
    default:
      return "未指定";
  }
}

/**
 * 只暴露安全的错误摘要，不透传底层错误对象。
 */
function toSafeMessage(error: unknown): string {
  return error instanceof Error ? error.message : "SimpleChatWorkflow execution failed";
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

    return { memories: [] };
  }
}

interface ExtractAndSaveOptions {
  observer: CoreObserver;
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
}

/** 抽取本轮记忆并保存（importance < 3 在 Workflow 层过滤）；失败不阻断主链路。 */
async function extractAndSaveMemories(
  options: ExtractAndSaveOptions,
): Promise<ExtractAndSaveResult> {
  await safeEmit(options.observer, {
    type: "memory:extract:start",
    timestamp: new Date(),
    payload: { sessionId: options.sessionId, scope: options.scope },
  });

  let extracted: ExtractedMemory[] = [];

  try {
    const result = await options.memoryExtractor.extract({
      scope: options.scope,
      userMessage: options.userMessage,
      assistantMessage: options.assistantMessage,
      history: options.history.slice(-6),
    });
    extracted = result.memories;

    await safeEmit(options.observer, {
      type: "memory:extract:end",
      timestamp: new Date(),
      payload: { ok: true, count: extracted.length, memories: extracted },
    });
  } catch (error) {
    await safeEmit(options.observer, {
      type: "memory:extract:end",
      timestamp: new Date(),
      payload: { ok: false, message: toSafeMessage(error) },
    });

    return { extracted: [], saved: [], skipped: [] };
  }

  const memoriesToSave = extracted.filter((memory) => memory.importance >= 3);
  const preSaveSkipped = extracted.filter((memory) => memory.importance < 3);

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
        ...(options.conversationId !== undefined ? { conversationId: options.conversationId } : {}),
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

    return { extracted, saved: [], skipped: preSaveSkipped };
  }
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
