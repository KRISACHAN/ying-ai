import type { UIMessageChunk } from "ai";

import type { ChatWorkflowStreamWireEvent, SerializableToolResult } from "./chat-stream-wire";
import type { DemoMessageMetadata } from "./demo-ui-message";
import {
  hasDegradedTrace,
  toDemoChatErrorMetadata,
  type DemoTurnStatus,
} from "./chat-turn-state.ts";
import {
  deriveWebSearchMetadataFromToolResult,
  type DemoWorkflowWebSearchMetadata,
} from "./web-search-result-metadata.ts";

export class ChatStreamUIAdapter {
  private readonly textPartId = "assistant-text";
  private readonly chunks: UIMessageChunk[] = [];
  private textStarted = false;
  private textEnded = false;
  private aggregatedText = "";
  private workflowId: string | undefined;
  private model: string | undefined;
  private turnStatus: DemoTurnStatus = "submitted";
  private latestWebSearch: DemoWorkflowWebSearchMetadata | undefined;
  private webSearchQuery: string | undefined;

  public consume(event: ChatWorkflowStreamWireEvent): UIMessageChunk[] {
    this.chunks.length = 0;

    switch (event.type) {
      case "workflow:start":
        this.workflowId = event.workflowId;
        this.updateTurnStatus("submitted", "工作流已开始");
        break;
      case "step:start":
        if (event.step === "tool:plan") {
          this.updateTurnStatus("planning_tool", "正在判断是否需要工具");
        }
        break;
      case "step:end":
        if (event.status === "degraded") {
          this.updateTurnStatus("degraded", "工作流步骤降级");
        }
        break;
      case "tool:call":
        this.handleToolCall(event);
        break;
      case "tool:result":
        this.handleToolResult(event.result);
        break;
      case "text:delta":
        this.handleTextDelta(event);
        break;
      case "workflow:finish":
        this.handleWorkflowFinish(event);
        break;
      case "workflow:error":
        this.handleWorkflowError(event);
        break;
    }

    return [...this.chunks];
  }

  private handleTextDelta(event: Extract<ChatWorkflowStreamWireEvent, { type: "text:delta" }>) {
    if (!this.textStarted) {
      this.push({ type: "text-start", id: this.textPartId });
      this.textStarted = true;
    }

    this.aggregatedText += event.text;
    this.model = event.model ?? this.model;
    this.updateTurnStatus("streaming");
    this.push({
      type: "text-delta",
      id: this.textPartId,
      delta: event.text,
    });
  }

  private handleToolCall(event: Extract<ChatWorkflowStreamWireEvent, { type: "tool:call" }>) {
    if (event.call.name !== "web_search") {
      return;
    }

    this.webSearchQuery = readQuery(event.call.arguments);
    this.updateTurnStatus("searching");
    this.push({
      type: "data-web-search-status",
      data: {
        status: "searching",
        ...(this.webSearchQuery !== undefined ? { query: this.webSearchQuery } : {}),
        message: "正在搜索 Web...",
      },
    });
  }

  private handleToolResult(result: SerializableToolResult) {
    if (result.name !== "web_search") {
      return;
    }

    const metadata = deriveWebSearchMetadataFromToolResult(result);

    if (metadata !== null) {
      this.latestWebSearch = metadata;
      const status = metadata.sources.length > 0 ? "completed" : "empty";

      this.push({
        type: "data-web-search-status",
        data: {
          status,
          query: metadata.query,
          message:
            status === "completed"
              ? `已搜索 Web · ${metadata.sources.length} 个来源`
              : "搜索完成，但未找到可靠来源",
        },
      });

      if (metadata.sources.length > 0) {
        this.push({ type: "data-web-search-sources", data: metadata });
      }
      return;
    }

    if (result.ok === false) {
      this.updateTurnStatus("tool_failed");
      this.push({
        type: "data-web-search-status",
        data: {
          status: "failed",
          ...(this.webSearchQuery !== undefined ? { query: this.webSearchQuery } : {}),
          message: "Web Search 失败，本轮未提供联网来源",
        },
      });
    }
  }

  private handleWorkflowFinish(
    event: Extract<ChatWorkflowStreamWireEvent, { type: "workflow:finish" }>,
  ) {
    if (this.aggregatedText !== event.output.text) {
      throw new Error("protocol_error: delta aggregated text does not match workflow output.");
    }

    if (this.textStarted && !this.textEnded) {
      this.push({ type: "text-end", id: this.textPartId });
      this.textEnded = true;
    }

    const webSearch = this.latestWebSearch ?? deriveWebSearchFromOutput(event.output.toolResults);
    const turnStatus = hasDegradedTrace(event.output.trace) ? "degraded" : "success";
    this.turnStatus = turnStatus;

    if (
      webSearch !== undefined &&
      this.latestWebSearch === undefined &&
      webSearch.sources.length > 0
    ) {
      this.push({ type: "data-web-search-sources", data: webSearch });
    }

    this.push({
      type: "finish",
      finishReason: "stop",
      messageMetadata: this.createMetadata({
        turnStatus,
        ...(webSearch !== undefined ? { webSearch } : {}),
      }),
    });
  }

  private handleWorkflowError(
    event: Extract<ChatWorkflowStreamWireEvent, { type: "workflow:error" }>,
  ) {
    if (this.textStarted && !this.textEnded) {
      this.push({ type: "text-end", id: this.textPartId });
      this.textEnded = true;
    }

    const error = toDemoChatErrorMetadata(event, this.aggregatedText);
    this.turnStatus = error.status;
    this.push({ type: "data-workflow-error", data: error });
    this.push({
      type: "finish",
      finishReason: "error",
      messageMetadata: this.createMetadata({
        turnStatus: error.status,
        error,
      }),
    });
  }

  private updateTurnStatus(status: DemoTurnStatus, message?: string) {
    this.turnStatus = status;
    this.push({
      type: "data-workflow-status",
      data: {
        status,
        ...(this.workflowId !== undefined ? { workflowId: this.workflowId } : {}),
        ...(message !== undefined ? { message } : {}),
      },
    });
    this.push({
      type: "message-metadata",
      messageMetadata: this.createMetadata({ turnStatus: status }),
    });
  }

  private createMetadata(extra: Partial<DemoMessageMetadata> = {}): DemoMessageMetadata {
    return {
      ...(this.workflowId !== undefined ? { workflowId: this.workflowId } : {}),
      ...(this.model !== undefined ? { model: this.model } : {}),
      turnStatus: this.turnStatus,
      ...extra,
    };
  }

  private push(chunk: UIMessageChunk) {
    this.chunks.push(chunk);
  }
}

function deriveWebSearchFromOutput(
  toolResults: SerializableToolResult[] | undefined,
): DemoWorkflowWebSearchMetadata | undefined {
  if (toolResults === undefined) {
    return undefined;
  }

  for (const result of toolResults) {
    const metadata = deriveWebSearchMetadataFromToolResult(result);

    if (metadata !== null) {
      return metadata;
    }
  }

  return undefined;
}

function readQuery(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const query = (value as { query?: unknown }).query;
  return typeof query === "string" && query.trim() !== "" ? query.trim() : undefined;
}

export function collectUIChunksFromWireEvents(
  events: ChatWorkflowStreamWireEvent[],
): UIMessageChunk[] {
  const adapter = new ChatStreamUIAdapter();
  return events.flatMap((event) => adapter.consume(event));
}
