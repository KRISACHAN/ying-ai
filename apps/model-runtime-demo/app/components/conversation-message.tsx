import type { WorkflowRunListItem } from "../lib/debug-types";
import type { DemoChatErrorMetadata } from "../lib/chat-turn-state";
import type { DemoUIMessage, DemoWebSearchStatusPart } from "../lib/demo-ui-message";
import type { DemoWorkflowWebSearchMetadata } from "../lib/web-search-result-metadata";
import { ChatTurnStatus } from "./chat-turn-status";
import { WebSearchSources } from "./web-search-sources";
import { WebSearchToolStatus } from "./web-search-tool-status";

export function ConversationMessage({
  message,
  linkedRun,
  onSelectRun,
}: {
  message: DemoUIMessage;
  linkedRun?: WorkflowRunListItem;
  onSelectRun(runId: string): void;
}) {
  const roleLabel = message.role === "user" ? "User" : "Assistant";

  return (
    <button
      className={`message-bubble message-${message.role}`}
      type="button"
      disabled={linkedRun === undefined}
      onClick={() => {
        if (linkedRun !== undefined) {
          onSelectRun(linkedRun.id);
        }
      }}
    >
      <span>{roleLabel}</span>
      {message.parts.map((part, index) => {
        switch (part.type) {
          case "text":
            return <p key={index}>{part.text}</p>;
          case "data-web-search-status": {
            const status = part.data as DemoWebSearchStatusPart;
            return <WebSearchToolStatus key={index} status={status} />;
          }
          case "data-web-search-sources": {
            const metadata = part.data as DemoWorkflowWebSearchMetadata;
            return <WebSearchSources key={index} metadata={metadata} />;
          }
          case "data-workflow-error": {
            const error = part.data as DemoChatErrorMetadata;
            return (
              <p className="message-error" key={index}>
                {error.message}
              </p>
            );
          }
          case "data-workflow-status":
          case "step-start":
          case "reasoning":
          case "source-url":
          case "source-document":
          case "file":
            return null;
          default:
            return null;
        }
      })}
      {message.metadata?.turnStatus !== undefined ? (
        <ChatTurnStatus
          status={message.metadata.turnStatus}
          {...(message.metadata.workflowId !== undefined
            ? { workflowId: message.metadata.workflowId }
            : {})}
        />
      ) : null}
      {message.metadata?.error !== undefined ? (
        <small>{message.metadata.error.message}</small>
      ) : null}
    </button>
  );
}
