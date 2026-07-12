import assert from "node:assert/strict";

import { collectUIChunksFromWireEvents } from "../app/lib/chat-stream-ui-adapter.ts";

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

console.log("verify:chat-ui-adapter passed");
