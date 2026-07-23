import assert from "node:assert/strict";

import {
  encodeStoryNdjson,
  parseStoryNdjsonWireEvents,
  StoryStreamProtocolError,
  validateStoryWorkflowStreamWireEvent,
} from "../app/lib/story-stream-transport.ts";
import type { StoryWorkflowStreamWireEvent } from "../app/lib/story-stream-wire.ts";

const base = {
  workflowId: "story_wf_contract",
  sessionId: "story_session_contract",
  clientTurnId: "client_turn_contract",
  occurredAt: "2026-07-20T00:00:00.000Z",
};

const events: StoryWorkflowStreamWireEvent[] = [
  { type: "story:start", ...base, sequence: 1 },
  {
    type: "story:context-ready",
    ...base,
    sequence: 2,
    payload: {
      summaryPresent: false,
      recentMessageCount: 0,
      recalledLoreIds: ["fog-harbor-overview"],
    },
  },
  { type: "story:text-delta", ...base, sequence: 3, text: "雾气" },
  { type: "story:text-delta", ...base, sequence: 4, text: "涌入。" },
  {
    type: "story:committed",
    ...base,
    sequence: 5,
    payload: { turnId: "turn_1", turnNumber: 1, stateRevision: 1 },
  },
  {
    type: "story:finish",
    ...base,
    sequence: 6,
    output: {
      sessionId: base.sessionId,
      clientTurnId: base.clientTurnId,
      text: "雾气涌入。",
      turnId: "turn_1",
      stateRevision: 1,
    },
  },
];

for (const event of events) {
  const parsed = JSON.parse(new TextDecoder().decode(encodeStoryNdjson(event)));
  assert.deepEqual(validateStoryWorkflowStreamWireEvent(parsed), event);
}

const parsedEvents = await collect(
  parseStoryNdjsonWireEvents(
    streamFromChunks([
      encodeStoryNdjson(events[0]!),
      new TextEncoder().encode(`${JSON.stringify(events[1])}\n${JSON.stringify(events[2])}\n`),
      encodeStoryNdjson(events[3]!),
      encodeStoryNdjson(events[4]!),
      encodeStoryNdjson(events[5]!),
    ]),
  ),
);

assert.deepEqual(
  parsedEvents.map((event) => event.type),
  events.map((event) => event.type),
);
assert.equal(
  parsedEvents
    .filter(
      (event): event is Extract<StoryWorkflowStreamWireEvent, { type: "story:text-delta" }> =>
        event.type === "story:text-delta",
    )
    .map((event) => event.text)
    .join(""),
  "雾气涌入。",
);

await assert.rejects(
  () =>
    collect(
      parseStoryNdjsonWireEvents(
        streamFromChunks([
          encodeStoryNdjson(events[5]!),
          encodeStoryNdjson({ type: "story:start", ...base, sequence: 7 }),
        ]),
      ),
    ),
  StoryStreamProtocolError,
);

await assert.rejects(
  () => collect(parseStoryNdjsonWireEvents(streamFromChunks([new TextEncoder().encode("{")]))),
  StoryStreamProtocolError,
);

assert.throws(
  () =>
    validateStoryWorkflowStreamWireEvent({
      type: "story:lore-recalled",
      ...base,
      sequence: 8,
      payload: { occurredAt: new Date() },
    }),
  StoryStreamProtocolError,
);

console.log("verify:story-stream-contract ok");

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const output: T[] = [];
  for await (const item of iterable) {
    output.push(item);
  }
  return output;
}

function streamFromChunks(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}
