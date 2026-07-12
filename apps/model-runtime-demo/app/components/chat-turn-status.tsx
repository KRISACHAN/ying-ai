import type { DemoTurnStatus } from "../lib/chat-turn-state";
import { formatTurnStatus } from "../lib/chat-turn-state";

export function ChatTurnStatus({
  status,
  workflowId,
}: {
  status: DemoTurnStatus;
  workflowId?: string;
}) {
  return (
    <p className="chat-turn-status">
      {formatTurnStatus(status)}
      {workflowId !== undefined ? ` · workflowId=${workflowId}` : ""}
    </p>
  );
}
