import assert from "node:assert/strict";

import {
  collectStoryUIChunksFromWireEvents,
  StoryStreamUIAdapter,
} from "../app/lib/story-stream-ui-adapter.ts";
import type { StoryWorkflowStreamWireEvent } from "../app/lib/story-stream-wire.ts";

const base = {
  workflowId: "story_ui_contract",
  sessionId: "story_session_contract",
  clientTurnId: "client_turn_contract",
  occurredAt: "2026-07-20T00:00:00.000Z",
};

const successEvents: StoryWorkflowStreamWireEvent[] = [
  { type: "story:start", ...base, sequence: 1 },
  { type: "story:text-delta", ...base, sequence: 2, text: "白鲸" },
  { type: "story:text-delta", ...base, sequence: 3, text: "酒馆" },
  {
    type: "story:committed",
    ...base,
    sequence: 4,
    payload: {
      turnId: "turn_1",
      turnNumber: 1,
      stateRevision: 1,
      idempotentReplay: false,
    },
  },
  {
    type: "story:finish",
    ...base,
    sequence: 5,
    output: {
      sessionId: base.sessionId,
      clientTurnId: base.clientTurnId,
      text: "白鲸酒馆",
      turnId: "turn_1",
      stateRevision: 1,
    },
  },
];

const successChunks = collectStoryUIChunksFromWireEvents(successEvents);
assert.deepEqual(
  successChunks.filter((chunk) => chunk.type === "text-delta").map((chunk) => chunk.delta),
  ["白鲸", "酒馆"],
);
assert.equal(
  successChunks.some(
    (chunk) =>
      chunk.type === "finish" &&
      (chunk.messageMetadata as { turnStatus?: unknown } | undefined)?.turnStatus === "success",
  ),
  true,
);

const replayChunks = collectStoryUIChunksFromWireEvents([
  { type: "story:start", ...base, sequence: 1 },
  {
    type: "story:committed",
    ...base,
    sequence: 2,
    payload: {
      turnId: "turn_1",
      turnNumber: 1,
      stateRevision: 1,
      idempotentReplay: true,
      assistantText: "白鲸酒馆",
    },
  },
  {
    type: "story:finish",
    ...base,
    sequence: 3,
    output: {
      sessionId: base.sessionId,
      clientTurnId: base.clientTurnId,
      text: "白鲸酒馆",
      turnId: "turn_1",
      stateRevision: 1,
      idempotentReplay: true,
    },
  },
]);
assert.equal(
  replayChunks.some(
    (chunk) =>
      chunk.type === "finish" &&
      (chunk.messageMetadata as { idempotentReplay?: unknown } | undefined)?.idempotentReplay ===
        true,
  ),
  true,
  "idempotent replay should be observable in final metadata",
);
assert.deepEqual(
  replayChunks.filter((chunk) => chunk.type === "text-delta").map((chunk) => chunk.delta),
  ["白鲸酒馆"],
  "idempotent replay should restore the canonical assistant text",
);

const validationChunks = collectStoryUIChunksFromWireEvents([
  { type: "story:start", ...base, sequence: 1 },
  {
    type: "story:validation-failed",
    ...base,
    sequence: 2,
    payload: { errors: [{ code: "change.attribute.undeclared", message: "bad attr" }] },
  },
  {
    type: "story:error",
    ...base,
    sequence: 3,
    error: { code: "STORY_STATE_CHANGE_REJECTED", message: "bad attr" },
  },
]);

assert.equal(
  validationChunks.some(
    (chunk) =>
      chunk.type === "data-story-workflow-error" &&
      (chunk.data as { status?: unknown }).status === "validation_failed",
  ),
  true,
);

const validationAdapter = new StoryStreamUIAdapter();
for (const event of [
  { type: "story:start", ...base, sequence: 1 },
  {
    type: "story:validation-failed",
    ...base,
    sequence: 2,
    payload: { errors: [{ code: "change.attribute.undeclared", message: "bad attr" }] },
  },
  {
    type: "story:error",
    ...base,
    sequence: 3,
    error: { code: "STORY_STATE_CHANGE_REJECTED", message: "bad attr" },
  },
] satisfies StoryWorkflowStreamWireEvent[]) {
  validationAdapter.consume(event);
}
assert.equal(
  validationAdapter.getTurnStatus(),
  "validation_failed",
  "refresh callers must be able to preserve a validation failure terminal state",
);

const failedChunks = collectStoryUIChunksFromWireEvents([
  { type: "story:start", ...base, sequence: 1 },
  {
    type: "story:error",
    ...base,
    sequence: 2,
    error: { code: "STORY_RENDER_FAILED", message: "renderer failed" },
  },
]);

assert.equal(
  failedChunks.some(
    (chunk) =>
      chunk.type === "finish" &&
      (chunk.messageMetadata as { turnStatus?: unknown } | undefined)?.turnStatus === "failed",
  ),
  true,
);

assert.throws(() =>
  collectStoryUIChunksFromWireEvents([
    { type: "story:start", ...base, sequence: 1 },
    { type: "story:text-delta", ...base, sequence: 2, text: "partial" },
    {
      type: "story:finish",
      ...base,
      sequence: 3,
      output: { sessionId: base.sessionId, clientTurnId: base.clientTurnId, text: "different" },
    },
  ]),
);

console.log("verify:story-ui-adapter ok");
