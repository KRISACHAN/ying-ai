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
import type { CompanionPersona } from "../../abstractions/persona";
import {
  resolveSummaryScope,
  type ConversationSummary,
  type SummaryScope,
} from "../../abstractions/summary";
import type { ToolDefinition, ToolResult } from "../../abstractions/tool";
import type { ToolPlan, ToolPlanningDegradationReason } from "../../abstractions/tool-planning";
import type { ChatWorkflowExecutionContext, ChatWorkflowInput } from "../../abstractions/workflow";
import { trimRecentHistory } from "../summary/history-utils";
import { WorkflowTraceRecorder } from "./workflow-trace-recorder";

/** 未传 summaryOptions.recentMessageLimit 时的默认值。 */
const DEFAULT_RECENT_MESSAGE_LIMIT = 12;
/** 未传 summaryOptions.summarizeTriggerMessageCount 时的默认值。 */
const DEFAULT_SUMMARIZE_TRIGGER_MESSAGE_COUNT = 16;

export type PlannerUnavailableSource = "not_configured" | "execution_failed";

export interface WorkflowPromptState {
  persona: CompanionPersona;
  personaPrompt: string;
  systemPrompt: string;
  summaryContext?: string;
  memoryContext?: string;
  emotionContext?: string;
  messages: ChatMessage[];
}

export interface WorkflowToolPlanningState {
  plan: ToolPlan;
  reason?: ToolPlanningDegradationReason;
  plannerUnavailableSource?: PlannerUnavailableSource;
  runtime?: ModelRuntimeInfo;
}

export interface WorkflowGenerationState {
  finalOutput: GenerateOutput;
  toolCalls: ModelToolCall[];
  toolResults: ToolResult[];
  droppedToolCalls: ModelToolCall[];
  toolCallsDropped: boolean;
  rounds: number;
  followUpGenerated: boolean;
  followUpMessages?: ChatMessage[];
}

export interface AnalyzeEmotionResult {
  previous: EmotionState;
  detected?: EmotionState;
  next: EmotionState;
  degraded?: boolean;
  reason?: string;
}

export interface LoadSummaryResult {
  summary: ConversationSummary | null;
  skipped: boolean;
  reason?: string;
}

export interface UpdateAndSaveSummaryResult {
  updatedSummary: ConversationSummary | null;
  summarizedMessages: ChatMessage[];
  skipped: boolean;
  reason: string;
}

export interface RecallMemoriesResult {
  memories: RecalledMemory[];
  degraded?: boolean;
  reason?: string;
  embeddingVectorLength?: number;
}

export interface ExtractAndSaveResult {
  extracted: ExtractedMemory[];
  saved: MemoryRecord[];
  skipped: ExtractedMemory[];
  embeddingVectorLength?: number;
  degraded?: boolean;
  reason?: string;
}

export interface WorkflowExecutionState {
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

export function createWorkflowExecutionState(input: ChatWorkflowInput): WorkflowExecutionState {
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

export function requireStateValue<T>(value: T | undefined, name: string): T {
  if (value === undefined) {
    throw new Error(`Workflow state is missing ${name}`);
  }

  return value;
}
