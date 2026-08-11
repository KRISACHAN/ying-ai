import type {
  ChatWorkflowDebugContext,
  CompanionGender,
  ConversationSummary,
  CoreProviderMeta,
  EmotionState,
  WorkflowTrace,
} from "@ying-ai/ai-core";

export type MessageRole = "user" | "assistant";
export type MessageStatus = "pending" | "completed" | "failed";
export type WorkflowRunStatus = "running" | "success" | "degraded" | "failed";

export interface DebugCompanion {
  id: string;
  name: string;
  gender: CompanionGender;
  relationship: string;
  userDisplayName: string;
  userAddress: string;
  profile: {
    hobbies?: string[];
  };
  appearance: {
    heightCm?: number;
    weightKg?: number;
    hair?: string;
    bodyType?: string;
    additionalTraits?: Record<string, string>;
  };
  personality: string;
  speakingStyle: string;
  background: string;
  customInstructions: string;
  createdAt: string;
  updatedAt: string;
}

export interface DebugConversation {
  id: string;
  companionId: string;
  title: string;
  lastMessagePreview: string | null;
  emotion: EmotionState | null;
  createdAt: string;
  updatedAt: string;
}

export interface DebugConversationListItem extends DebugConversation {
  companionName: string;
}

export interface DebugMessage {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  errorSummary: string | null;
  model: string | null;
  createdAt: string;
}

export interface SerializedCoreEvent {
  type: string;
  timestamp: string;
  payload?: unknown;
}

export interface WorkflowRunDetail {
  id: string;
  conversationId: string;
  userMessageId: string;
  assistantMessageId: string | null;
  workflowId: string | null;
  status: WorkflowRunStatus;
  model: string | null;
  trace: WorkflowTrace | null;
  observerEvents: SerializedCoreEvent[];
  debugContext: ChatWorkflowDebugContext | null;
  memorySnapshot: unknown;
  emotionSnapshot: unknown;
  toolSnapshot: unknown;
  errorSummary: string | null;
  createdAt: string;
}

export interface WorkflowRunListItem {
  id: string;
  userMessageId: string;
  assistantMessageId: string | null;
  status: WorkflowRunStatus;
  workflowId: string | null;
  model: string | null;
  errorSummary: string | null;
  createdAt: string;
}

export interface ConversationDetail {
  conversation: DebugConversation;
  companion: DebugCompanion;
  messages: DebugMessage[];
  summary: ConversationSummary | null;
}

export interface MemoryHealthView {
  status?: string | undefined;
  reason?: string | undefined;
  provider?: CoreProviderMeta | undefined;
  embeddingModel?: string | undefined;
  tableName?: string | undefined;
  health?: unknown;
}
