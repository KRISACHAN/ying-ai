import type { ChatTransport, UIMessageChunk } from "ai";

import { ChatStreamProtocolError, parseNdjsonWireEvents } from "./chat-stream-transport";
import type { ChatWorkflowStreamWireEvent } from "./chat-stream-wire";
import { ChatStreamUIAdapter } from "./chat-stream-ui-adapter";
import type { DemoUIMessage } from "./demo-ui-message";
import type { DebugModelConfig } from "./model-config";

export interface DemoChatTransportContext {
  conversationId: string;
  getModelConfig(): DebugModelConfig;
  getApiKeyOverride(): string;
  getWebSearchEnabled(): boolean;
  onWireEvent(event: ChatWorkflowStreamWireEvent): void;
  onWorkflowTerminal(
    event: Extract<ChatWorkflowStreamWireEvent, { type: "workflow:finish" | "workflow:error" }>,
  ): void | Promise<void>;
}

export class DemoChatTransport implements ChatTransport<DemoUIMessage> {
  public constructor(private readonly context: DemoChatTransportContext) {}

  public async sendMessages({
    messages,
    abortSignal,
  }: Parameters<ChatTransport<DemoUIMessage>["sendMessages"]>[0]): Promise<
    ReadableStream<UIMessageChunk>
  > {
    const message = readLatestUserText(messages);

    if (message === "") {
      throw new Error("message is required");
    }

    const body: Record<string, unknown> = {
      message,
      modelConfig: this.context.getModelConfig(),
      webSearchEnabled: this.context.getWebSearchEnabled(),
    };
    const apiKeyOverride = this.context.getApiKeyOverride().trim();

    if (apiKeyOverride !== "") {
      body.apiKeyOverride = apiKeyOverride;
    }

    const init: RequestInit = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/x-ndjson",
      },
      body: JSON.stringify(body),
      ...(abortSignal !== undefined ? { signal: abortSignal } : {}),
    };

    const response = await fetch(
      `/api/conversations/${this.context.conversationId}/messages`,
      init,
    );

    if (!response.ok || response.body === null) {
      const payload = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      throw new Error(payload?.error?.message ?? "发送失败");
    }

    return this.toUIMessageStream(response.body);
  }

  public async reconnectToStream(): Promise<ReadableStream<UIMessageChunk> | null> {
    return null;
  }

  private toUIMessageStream(body: ReadableStream<Uint8Array>): ReadableStream<UIMessageChunk> {
    const context = this.context;

    return new ReadableStream<UIMessageChunk>({
      async start(controller) {
        const adapter = new ChatStreamUIAdapter();

        try {
          for await (const event of parseNdjsonWireEvents(body)) {
            context.onWireEvent(event);

            for (const chunk of adapter.consume(event)) {
              controller.enqueue(chunk);
            }

            if (event.type === "workflow:finish" || event.type === "workflow:error") {
              await context.onWorkflowTerminal(event);
            }
          }
        } catch (error) {
          const message =
            error instanceof ChatStreamProtocolError
              ? `protocol_error: ${error.message}`
              : error instanceof Error
                ? error.message
                : "发送失败";

          controller.enqueue({ type: "error", errorText: message });
          controller.error(error);
          return;
        }

        controller.close();
      },
    });
  }
}

function readLatestUserText(messages: DemoUIMessage[]): string {
  const latestUser = [...messages].reverse().find((message) => message.role === "user");

  if (latestUser === undefined) {
    return "";
  }

  return latestUser.parts
    .filter(
      (part): part is Extract<(typeof latestUser.parts)[number], { type: "text" }> =>
        part.type === "text",
    )
    .map((part) => part.text)
    .join("\n")
    .trim();
}
