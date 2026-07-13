import assert from "node:assert/strict";

import { collectUIChunksFromWireEvents } from "../app/lib/chat-stream-ui-adapter.ts";
import { DemoChatTransport } from "../app/lib/demo-chat-transport.ts";
import type { DemoUIMessage } from "../app/lib/demo-ui-message.ts";

const workflowId = "wf-ui-adapter";

const successChunks = collectUIChunksFromWireEvents([
  { type: "workflow:start", workflowId, timestamp: "2026-07-12T00:00:00.000Z" },
  { type: "step:start", workflowId, step: "tool:plan", timestamp: "2026-07-12T00:00:00.000Z" },
  {
    type: "tool:call",
    workflowId,
    call: { name: "web_search", arguments: { query: "OpenAI latest news" } },
  },
  {
    type: "tool:result",
    workflowId,
    result: {
      name: "web_search",
      ok: true,
      result: {
        search: {
          provider: "tavily",
          query: "OpenAI latest news",
          sources: [
            {
              id: "source-1",
              title: "OpenAI News",
              url: "https://example.com/openai",
              snippet: "A short sourced summary.",
            },
          ],
        },
      },
    },
  },
  { type: "text:delta", workflowId, text: "Hello", model: "demo-model" },
  { type: "text:delta", workflowId, text: " world", model: "demo-model" },
  {
    type: "workflow:finish",
    workflowId,
    output: {
      text: "Hello world",
      model: "demo-model",
      toolResults: [
        {
          name: "web_search",
          ok: true,
          result: {
            search: {
              provider: "tavily",
              query: "OpenAI latest news",
              sources: [
                {
                  id: "source-1",
                  title: "OpenAI News",
                  url: "https://example.com/openai",
                  snippet: "A short sourced summary.",
                },
              ],
            },
          },
        },
      ],
      trace: { status: "success", steps: [] },
    },
  },
]);

assert.equal(
  successChunks.some((chunk) => chunk.type === "text-start"),
  true,
);
assert.deepEqual(
  successChunks.filter((chunk) => chunk.type === "text-delta").map((chunk) => chunk.delta),
  ["Hello", " world"],
);
assert.equal(
  successChunks.some(
    (chunk) =>
      chunk.type === "data-web-search-sources" &&
      (chunk.data as { sources?: unknown[] }).sources?.length === 1,
  ),
  true,
);
assert.equal(
  successChunks.some(
    (chunk) =>
      chunk.type === "finish" &&
      (chunk.messageMetadata as { turnStatus?: unknown } | undefined)?.turnStatus === "success",
  ),
  true,
);

const emptySourcesChunks = collectUIChunksFromWireEvents([
  { type: "workflow:start", workflowId, timestamp: "2026-07-12T00:00:00.000Z" },
  {
    type: "tool:call",
    workflowId,
    call: { name: "web_search", arguments: { query: "empty query" } },
  },
  {
    type: "tool:result",
    workflowId,
    result: {
      name: "web_search",
      ok: true,
      result: {
        search: {
          provider: "tavily",
          query: "empty query",
          sources: [],
        },
      },
    },
  },
  {
    type: "workflow:finish",
    workflowId,
    output: {
      text: "",
      model: "demo-model",
      toolResults: [],
      trace: { status: "success", steps: [] },
    },
  },
]);

assert.equal(
  emptySourcesChunks.some(
    (chunk) =>
      chunk.type === "data-web-search-status" &&
      (chunk.data as { status?: unknown }).status === "empty",
  ),
  true,
);
assert.equal(
  emptySourcesChunks.some((chunk) => chunk.type === "data-web-search-sources"),
  false,
);

const toolFailedChunks = collectUIChunksFromWireEvents([
  { type: "workflow:start", workflowId, timestamp: "2026-07-12T00:00:00.000Z" },
  {
    type: "tool:call",
    workflowId,
    call: { name: "web_search", arguments: { query: "fail query" } },
  },
  {
    type: "tool:result",
    workflowId,
    result: {
      name: "web_search",
      ok: false,
      result: null,
      error: { code: "provider_failed", message: "provider failed" },
    },
  },
]);

assert.equal(
  toolFailedChunks.some(
    (chunk) =>
      chunk.type === "data-web-search-status" &&
      (chunk.data as { status?: unknown }).status === "failed",
  ),
  true,
);
assert.equal(
  toolFailedChunks.some(
    (chunk) =>
      chunk.type === "message-metadata" &&
      (chunk.messageMetadata as { turnStatus?: unknown } | undefined)?.turnStatus === "tool_failed",
  ),
  true,
);
assert.equal(
  toolFailedChunks.some((chunk) => chunk.type === "data-web-search-sources"),
  false,
);

const failedChunks = collectUIChunksFromWireEvents([
  { type: "workflow:start", workflowId, timestamp: "2026-07-12T00:00:00.000Z" },
  { type: "text:delta", workflowId, text: "Partial", model: "demo-model" },
  {
    type: "workflow:error",
    workflowId,
    error: { code: "workflow_failed", message: "boom" },
  },
]);

assert.equal(
  failedChunks.some(
    (chunk) =>
      chunk.type === "data-workflow-error" &&
      (chunk.data as { status?: unknown }).status === "partial_failed",
  ),
  true,
);

const outputSafetyChunks = collectUIChunksFromWireEvents([
  { type: "workflow:start", workflowId, timestamp: "2026-07-12T00:00:00.000Z" },
  {
    type: "workflow:error",
    workflowId,
    error: { code: "output_safety_rejected", message: "blocked" },
  },
]);

assert.equal(
  outputSafetyChunks.some(
    (chunk) =>
      chunk.type === "data-workflow-error" &&
      (chunk.data as { status?: unknown }).status === "output_safety_rejected",
  ),
  true,
);

const persistenceFailedChunks = collectUIChunksFromWireEvents([
  { type: "workflow:start", workflowId, timestamp: "2026-07-12T00:00:00.000Z" },
  { type: "text:delta", workflowId, text: "Saved?", model: "demo-model" },
  {
    type: "workflow:error",
    workflowId,
    error: {
      code: "workflow_failed",
      message: "persistence failed",
      details: { reason: "persistence_failed" },
    },
  },
]);

assert.equal(
  persistenceFailedChunks.some(
    (chunk) =>
      chunk.type === "data-workflow-error" &&
      (chunk.data as { status?: unknown }).status === "persistence_failed",
  ),
  true,
);

const unknownToolChunks = collectUIChunksFromWireEvents([
  { type: "workflow:start", workflowId, timestamp: "2026-07-12T00:00:00.000Z" },
  {
    type: "tool:call",
    workflowId,
    call: { name: "unknown_tool", arguments: { query: "ignored" } },
  },
  {
    type: "tool:result",
    workflowId,
    result: { name: "unknown_tool", ok: true, result: { value: "ignored" } },
  },
  {
    type: "workflow:finish",
    workflowId,
    output: { text: "", trace: { status: "success", steps: [] } },
  },
]);

assert.equal(
  unknownToolChunks.some((chunk) => chunk.type === "data-web-search-status"),
  false,
);

assert.throws(
  () =>
    collectUIChunksFromWireEvents([
      { type: "text:delta", workflowId, text: "A", model: "demo-model" },
      {
        type: "workflow:finish",
        workflowId,
        output: { text: "B", trace: { status: "success", steps: [] } },
      },
    ]),
  /protocol_error/,
);

const originalFetch = globalThis.fetch;

try {
  const terminalEvents = [
    { type: "workflow:start", workflowId, timestamp: "2026-07-12T00:00:00.000Z" },
    { type: "text:delta", workflowId, text: "Transport", model: "demo-model" },
    {
      type: "workflow:finish",
      workflowId,
      output: {
        text: "Transport",
        model: "demo-model",
        trace: { status: "success", steps: [] },
      },
    },
  ] as const;
  const capturedWireEvents: unknown[] = [];
  const capturedTerminalErrors: unknown[] = [];
  let capturedRequest: { input: RequestInfo | URL; init: RequestInit | undefined } | undefined;

  globalThis.fetch = async (input, init) => {
    capturedRequest = { input, init };
    return new Response(createNdjsonStream(terminalEvents), {
      status: 200,
      headers: { "Content-Type": "application/x-ndjson" },
    });
  };

  const transport = new DemoChatTransport({
    conversationId: "conversation-1",
    getModelConfig: () => ({
      provider: "openai-compatible",
      model: "demo-model",
      capabilities: { streaming: true, toolCalling: true },
    }),
    getApiKeyOverride: () => "",
    getWebSearchEnabled: () => true,
    onWireEvent: (event) => capturedWireEvents.push(event),
    onWorkflowTerminal: () => {
      throw new Error("refresh failed");
    },
    onWorkflowTerminalError: (error) => capturedTerminalErrors.push(error),
  });

  const stream = await transport.sendMessages(
    createChatTransportRequest([
      createTextMessage("old-user", "user", "older text"),
      createTextMessage("latest-user", "user", "latest text"),
    ]),
  );
  const transportChunks = await readStream(stream);
  const requestBody = JSON.parse(String(capturedRequest?.init?.body)) as {
    message?: unknown;
    apiKeyOverride?: unknown;
    webSearchEnabled?: unknown;
  };

  assert.equal(capturedRequest?.input, "/api/conversations/conversation-1/messages");
  assert.equal(capturedRequest?.init?.method, "POST");
  assert.equal(
    (capturedRequest?.init?.headers as Record<string, string>)?.Accept,
    "application/x-ndjson",
  );
  assert.equal(requestBody.message, "latest text");
  assert.equal(requestBody.webSearchEnabled, true);
  assert.equal("apiKeyOverride" in requestBody, false);
  assert.equal(capturedWireEvents.length, terminalEvents.length);
  assert.equal(capturedTerminalErrors.length, 1);
  assert.equal(
    transportChunks.some((chunk) => chunk.type === "text-delta" && chunk.delta === "Transport"),
    true,
  );
  assert.equal(
    transportChunks.some((chunk) => chunk.type === "finish"),
    true,
  );

  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: { message: "bad request" } }), { status: 400 });

  await assert.rejects(
    () =>
      transport.sendMessages(
        createChatTransportRequest([createTextMessage("latest-user", "user", "latest text")]),
      ),
    /bad request/,
  );
} finally {
  globalThis.fetch = originalFetch;
}

console.log("verify:chat-ui-adapter passed");

function createTextMessage(id: string, role: "user" | "assistant", text: string): DemoUIMessage {
  return {
    id,
    role,
    parts: [{ type: "text", text, state: "done" }],
  };
}

function createChatTransportRequest(
  messages: DemoUIMessage[],
): Parameters<DemoChatTransport["sendMessages"]>[0] {
  return {
    trigger: "submit-message",
    chatId: "chat-1",
    messageId: messages.at(-1)?.id,
    messages,
    abortSignal: undefined,
  };
}

function createNdjsonStream(events: readonly unknown[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      }

      controller.close();
    },
  });
}

async function readStream<T>(stream: ReadableStream<T>): Promise<T[]> {
  const reader = stream.getReader();
  const chunks: T[] = [];

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      return chunks;
    }

    chunks.push(value);
  }
}
