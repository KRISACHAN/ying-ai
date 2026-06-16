import type { ChatWorkflowCoreContext } from "./core-context";
import type { EmotionState } from "./emotion";
import type {
  ExtractedMemory,
  MemoryImportance,
  MemoryRecord,
  MemoryScope,
  RecalledMemory,
} from "./memory";
import type { ChatMessage, GenerateOutput } from "./model";
import type { CompanionPersona } from "./persona";
import type { CoreProvider } from "./provider";
import type { SafetyCheckResult } from "./safety";
import type { ConversationSummary, SummaryOptions, SummaryScope } from "./summary";
import type { ToolResult } from "./tool";

export interface ChatWorkflowInput {
  sessionId?: string;
  message: string;
  history?: ChatMessage[];
  emotion?: EmotionState;
  metadata?: Record<string, unknown>;
  scope?: MemoryScope;
  summaryScope?: SummaryScope;
  conversationId?: string;
  messageIds?: string[];
  memoryOptions?: {
    limit?: number;
    minImportance?: MemoryImportance;
  };
  summaryOptions?: SummaryOptions;
}

/**
 * 仅供宿主调试展示的上下文快照（patch-0 §5.4）。
 * 让 Demo 的 Prompt / Context Debug Panel 能 100% 还原本轮实际发给模型的内容，
 * 不属于业务 API 契约。
 */
export interface ChatWorkflowDebugContext {
  scope: MemoryScope;
  /** formatMemoriesForPrompt 结果；无召回时为 undefined。 */
  memoryContext?: string;
  /** formatSummaryForPrompt 结果；无摘要时为 undefined。 */
  summaryContext?: string;
  /** 最终注入 Prompt 的 history 显式快照。 */
  recentHistory?: ChatMessage[];
  /** 本轮送去 summary update 的旧消息；未触发时为空数组。 */
  summarizedMessages?: ChatMessage[];
  /** buildPersonaSystemPrompt 完整结果。 */
  systemPrompt: string;
  /** 最终传入 model.generate 的 messages。 */
  messages: ChatMessage[];
  /** 本轮 recall 或 save 中最后一次 embedding 的 vector.length。 */
  embeddingVectorLength?: number;
}

export interface ChatWorkflowOutput {
  text: string;
  model?: string;
  raw?: unknown;
  persona?: CompanionPersona;
  memories?: RecalledMemory[];
  emotion?: EmotionState;
  toolResults?: ToolResult[];
  safety?: {
    input?: SafetyCheckResult;
    output?: SafetyCheckResult;
  };
  metadata?: Record<string, unknown> & {
    extractedMemories?: ExtractedMemory[];
    savedMemories?: MemoryRecord[];
    skippedMemories?: ExtractedMemory[];
    debugContext?: ChatWorkflowDebugContext;
    summary?: ConversationSummary | null;
    updatedSummary?: ConversationSummary | null;
    summarySkipped?: boolean;
    summarySkipReason?: string;
  };
  modelOutput?: GenerateOutput;
}

export interface ChatWorkflowExecutionContext {
  core: ChatWorkflowCoreContext;
}

export interface ChatWorkflow extends CoreProvider {
  execute(
    input: ChatWorkflowInput,
    context: ChatWorkflowExecutionContext,
  ): Promise<ChatWorkflowOutput>;
}
