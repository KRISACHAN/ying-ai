import type { UIMessage } from "ai";

import type { DemoWorkflowWebSearchMetadata } from "./web-search-result-metadata";
import type { ConversationDetail } from "./debug-types";
import type { DemoChatErrorMetadata, DemoTurnStatus } from "./chat-turn-state";

export interface DemoMessageMetadata {
  workflowId?: string;
  model?: string;
  persistedMessageId?: string;
  runId?: string;
  turnStatus?: DemoTurnStatus;
  webSearch?: DemoWorkflowWebSearchMetadata;
  error?: DemoChatErrorMetadata;
}

export interface DemoWorkflowStatusPart {
  status: DemoTurnStatus;
  workflowId?: string;
  message?: string;
}

export interface DemoWebSearchStatusPart {
  status: "searching" | "completed" | "empty" | "failed";
  query?: string;
  message?: string;
}

export type DemoDataParts = {
  "workflow-status": DemoWorkflowStatusPart;
  "web-search-status": DemoWebSearchStatusPart;
  "web-search-sources": DemoWorkflowWebSearchMetadata;
  "workflow-error": DemoChatErrorMetadata;
} & Record<string, unknown>;

export type DemoUIMessage = UIMessage<DemoMessageMetadata, DemoDataParts>;

export function mapPersistedMessagesToUI(
  messages: ConversationDetail["messages"],
  runByAssistantMessage: Map<string, { id: string; workflowId: string | null }>,
): DemoUIMessage[] {
  return messages.map((message) => {
    const run = message.role === "assistant" ? runByAssistantMessage.get(message.id) : undefined;
    const turnStatus =
      message.status === "failed"
        ? "failed"
        : message.status === "completed"
          ? "success"
          : "submitted";

    return {
      id: message.id,
      role: message.role,
      metadata: {
        persistedMessageId: message.id,
        ...(message.model !== null ? { model: message.model } : {}),
        ...(run !== undefined ? { runId: run.id } : {}),
        ...(run?.workflowId !== null && run?.workflowId !== undefined
          ? { workflowId: run.workflowId }
          : {}),
        ...(message.role === "assistant" ? { turnStatus } : {}),
        ...(message.errorSummary !== null
          ? {
              error: {
                status: "failed",
                code: "persisted_message_failed",
                message: message.errorSummary,
              },
            }
          : {}),
      },
      parts: [{ type: "text", text: message.content, state: "done" }],
    };
  });
}
