import type { UIMessageChunk } from "ai";

import type { StoryWorkflowStreamWireEvent } from "./story-stream-wire";

export type StoryTurnStatus =
  | "submitted"
  | "streaming"
  | "committed"
  | "validation_failed"
  | "failed"
  | "success";

export interface StoryTurnMetadata {
  workflowId?: string;
  turnStatus: StoryTurnStatus;
  stateRevision?: number;
  turnId?: string;
  idempotentReplay?: boolean;
  error?: {
    code: string;
    message: string;
  };
}

export class StoryStreamUIAdapter {
  private readonly textPartId = "story-assistant-text";
  private readonly chunks: UIMessageChunk[] = [];
  private textStarted = false;
  private textEnded = false;
  private aggregatedText = "";
  private workflowId: string | undefined;
  private turnStatus: StoryTurnStatus = "submitted";
  private stateRevision: number | undefined;
  private turnId: string | undefined;
  private idempotentReplay = false;

  public consume(event: StoryWorkflowStreamWireEvent): UIMessageChunk[] {
    this.chunks.length = 0;

    switch (event.type) {
      case "story:start":
        this.workflowId = event.workflowId;
        this.updateTurnStatus("submitted");
        break;
      case "story:text-delta":
        this.handleTextDelta(event.text);
        break;
      case "story:committed":
        this.turnId = readString(event.payload.turnId);
        this.stateRevision = readNumber(event.payload.stateRevision);
        this.idempotentReplay = event.payload.idempotentReplay === true;
        if (this.idempotentReplay) {
          const assistantText = readString(event.payload.assistantText);
          if (assistantText !== undefined && this.aggregatedText === "") {
            this.handleTextDelta(assistantText);
          }
        }
        this.updateTurnStatus("committed");
        break;
      case "story:validation-failed":
        this.updateTurnStatus("validation_failed");
        this.push({
          type: "data-story-workflow-error",
          data: {
            status: "validation_failed",
            errors: event.payload.errors,
          },
        });
        break;
      case "story:finish":
        this.handleFinish(event);
        break;
      case "story:error":
        this.handleError(event);
        break;
    }

    return [...this.chunks];
  }

  public getTurnStatus(): StoryTurnStatus {
    return this.turnStatus;
  }

  private handleTextDelta(text: string): void {
    if (!this.textStarted) {
      this.push({ type: "text-start", id: this.textPartId });
      this.textStarted = true;
    }

    this.aggregatedText += text;
    this.updateTurnStatus("streaming");
    this.push({ type: "text-delta", id: this.textPartId, delta: text });
  }

  private handleFinish(event: Extract<StoryWorkflowStreamWireEvent, { type: "story:finish" }>) {
    if (this.aggregatedText !== event.output.text) {
      throw new Error("protocol_error: story delta text does not match finish output.");
    }

    if (this.textStarted && !this.textEnded) {
      this.push({ type: "text-end", id: this.textPartId });
      this.textEnded = true;
    }

    this.stateRevision = event.output.stateRevision ?? this.stateRevision;
    this.turnId = event.output.turnId ?? this.turnId;
    this.idempotentReplay = event.output.idempotentReplay ?? this.idempotentReplay;
    this.turnStatus = "success";
    this.push({
      type: "finish",
      finishReason: "stop",
      messageMetadata: this.createMetadata({ turnStatus: "success" }),
    });
  }

  private handleError(event: Extract<StoryWorkflowStreamWireEvent, { type: "story:error" }>) {
    if (this.textStarted && !this.textEnded) {
      this.push({ type: "text-end", id: this.textPartId });
      this.textEnded = true;
    }

    this.turnStatus =
      event.error.code === "STORY_STATE_CHANGE_REJECTED" ? "validation_failed" : "failed";
    const metadata = this.createMetadata({
      turnStatus: this.turnStatus,
      error: {
        code: event.error.code,
        message: event.error.message,
      },
    });
    this.push({
      type: "data-story-workflow-error",
      data: {
        status: this.turnStatus,
        error: event.error,
      },
    });
    this.push({ type: "finish", finishReason: "error", messageMetadata: metadata });
  }

  private updateTurnStatus(status: StoryTurnStatus): void {
    this.turnStatus = status;
    this.push({
      type: "data-story-workflow-status",
      data: {
        status,
        ...(this.workflowId ? { workflowId: this.workflowId } : {}),
        ...(this.stateRevision !== undefined ? { stateRevision: this.stateRevision } : {}),
      },
    });
    this.push({
      type: "message-metadata",
      messageMetadata: this.createMetadata({ turnStatus: status }),
    });
  }

  private createMetadata(extra: Partial<StoryTurnMetadata> = {}): StoryTurnMetadata {
    return {
      ...(this.workflowId ? { workflowId: this.workflowId } : {}),
      ...(this.stateRevision !== undefined ? { stateRevision: this.stateRevision } : {}),
      ...(this.turnId ? { turnId: this.turnId } : {}),
      ...(this.idempotentReplay ? { idempotentReplay: true } : {}),
      turnStatus: this.turnStatus,
      ...extra,
    };
  }

  private push(chunk: UIMessageChunk): void {
    this.chunks.push(chunk);
  }
}

export function collectStoryUIChunksFromWireEvents(
  events: StoryWorkflowStreamWireEvent[],
): UIMessageChunk[] {
  const adapter = new StoryStreamUIAdapter();
  return events.flatMap((event) => adapter.consume(event));
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
