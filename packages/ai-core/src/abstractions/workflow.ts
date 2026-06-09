import type { ChatWorkflowCoreContext } from "./core-context";
import type { EmotionState } from "./emotion";
import type { Memory } from "./memory";
import type { ChatMessage, GenerateOutput } from "./model";
import type { CompanionPersona } from "./persona";
import type { CoreProvider } from "./provider";
import type { SafetyCheckResult } from "./safety";
import type { ToolResult } from "./tool";

export interface ChatWorkflowInput {
  sessionId?: string;
  message: string;
  history?: ChatMessage[];
  emotion?: EmotionState;
  metadata?: Record<string, unknown>;
}

export interface ChatWorkflowOutput {
  text: string;
  model?: string;
  raw?: unknown;
  persona?: CompanionPersona;
  memories?: Memory[];
  emotion?: EmotionState;
  toolResults?: ToolResult[];
  safety?: {
    input?: SafetyCheckResult;
    output?: SafetyCheckResult;
  };
  metadata?: Record<string, unknown>;
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
