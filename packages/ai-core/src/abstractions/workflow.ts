/**
 * 聊天工作流抽象。
 *
 * ChatWorkflow 定义单轮对话的编排入口：宿主通过 core.executeWorkflow(input) 调用。
 * ChatWorkflowInput/Output 是宿主与 Core 之间的主要业务契约。
 */
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

/** 单轮聊天的输入；history 由宿主维护，Core 不持久化短期对话。 */
export interface ChatWorkflowInput {
  /** 会话 ID，用于 Persona/Safety 与默认 MemoryScope 推导。 */
  sessionId?: string;
  /** 当前用户消息，必填且非空。 */
  message: string;
  /** 短期对话历史，不含本轮 message。 */
  history?: ChatMessage[];
  /** 情绪状态（阶段 5 前由宿主传入但 Workflow 未消费）。 */
  emotion?: EmotionState;
  metadata?: Record<string, unknown>;
  /** 显式记忆作用域，优先于 sessionId 推导。 */
  scope?: MemoryScope;
  summaryScope?: SummaryScope;
  conversationId?: string;
  messageIds?: string[];
  memoryOptions?: {
    limit?: number;
    minImportance?: MemoryImportance;
  };
  /** 滚动摘要开关与阈值；enabled 默认 false。 */
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

/** 单轮聊天的输出；text 为最终回复，metadata 含记忆/摘要/debug 等扩展信息。 */
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

/** Workflow 执行时注入的 Core 上下文（由 CompanionCore 拆分 workflow 后传入）。 */
export interface ChatWorkflowExecutionContext {
  core: ChatWorkflowCoreContext;
}

/** 聊天编排契约；宿主通过 core.executeWorkflow 间接调用。 */
export interface ChatWorkflow extends CoreProvider {
  execute(
    input: ChatWorkflowInput,
    context: ChatWorkflowExecutionContext,
  ): Promise<ChatWorkflowOutput>;
}
