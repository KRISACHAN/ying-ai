/* global console, process, ReadableStream, TextDecoder, TextEncoder */

import aiCore from "@ying-ai/ai-core";

const { createCompanionCore } = aiCore;

const fixedDate = new Date("2026-06-22T12:00:00.000Z");

function verifyNormalWhitespaceDelta() {
  const workflowId = "wf_contract_normal";
  const output = { text: "hello world", model: "contract-model" };
  const events = [
    start(workflowId),
    stepStart(workflowId, "model:generate"),
    stepEnd(workflowId, "model:generate", "success"),
    delta(workflowId, "hello", "contract-model"),
    delta(workflowId, " ", "contract-model"),
    delta(workflowId, "world", "contract-model"),
    finish(workflowId, output),
  ];
  const textMatches = aggregateDeltaText(events) === output.text;
  const hasWhitespaceDelta = events.some(
    (event) => event.type === "text:delta" && event.text === " ",
  );
  const serialized = serializeWireEvents(events);

  return {
    scenario: "normal whitespace delta",
    eventSequence: sequence(events),
    ok: textMatches && hasWhitespaceDelta && serialized.ok,
    details: `aggregate=${aggregateDeltaText(events)} serialized=${serialized.ok}`,
  };
}

async function verifyStreamUnsupported() {
  const core = createCompanionCore({
    model: new ContractVerifierModel(),
    workflow: new ExecuteOnlyContractWorkflow(),
  });
  const events = await collectStreamEvents(core.streamWorkflow({ message: "hello" }));
  const terminalEvent = terminal(events);
  const workflowIds = new Set(events.map((event) => event.workflowId));
  const serialized = serializeWireEvents(events);

  return {
    scenario: "stream unsupported",
    eventSequence: sequence(events),
    ok:
      events.length === 2 &&
      workflowIds.size === 1 &&
      terminalEvent?.type === "workflow:error" &&
      terminalEvent.error.code === "workflow_stream_not_supported" &&
      !events.some(isFinish) &&
      !events.some((event) => event.type === "text:delta") &&
      serialized.ok,
    details: `terminal=${terminalEvent?.type ?? "none"} serialized=${serialized.ok}`,
  };
}

async function verifyMissingTerminalFallback() {
  const core = createCompanionCore({
    model: new ContractVerifierModel(),
    workflow: new UnterminatedStreamContractWorkflow(),
  });
  const events = await collectStreamEvents(core.streamWorkflow({ message: "hello" }));
  const terminalEvent = terminal(events);
  const serialized = serializeWireEvents(events);

  return {
    scenario: "missing terminal fallback",
    eventSequence: sequence(events),
    ok:
      events.length === 2 &&
      terminalEvent?.type === "workflow:error" &&
      terminalEvent.error.code === "workflow_failed" &&
      events.every((event) => event.workflowId === "wf_contract_unterminated") &&
      !events.some(isFinish) &&
      serialized.ok,
    details: `terminal=${terminalEvent?.type ?? "none"} serialized=${serialized.ok}`,
  };
}

function verifyStartedStepFailure() {
  const workflowId = "wf_contract_failed_step";
  const events = [
    start(workflowId),
    stepStart(workflowId, "memory:save"),
    stepEnd(workflowId, "memory:save", "failed", { reason: "provider failure" }),
    error(workflowId, "post_process_failed", "memory save failed"),
  ];
  const serialized = serializeWireEvents(events);
  const closed = hasMatchingStepEnd(events, "memory:save", "failed");

  return {
    scenario: "started step failure",
    eventSequence: sequence(events),
    ok: closed && terminal(events)?.type === "workflow:error" && serialized.ok,
    details: `closed=${closed} serialized=${serialized.ok}`,
  };
}

function verifyOutputSafetyRejected() {
  const workflowId = "wf_contract_output_safety";
  const events = [
    start(workflowId),
    delta(workflowId, "partial text"),
    error(workflowId, "output_safety_rejected", "output rejected", "safety:output"),
  ];
  const serialized = serializeWireEvents(events);

  return {
    scenario: "output safety rejected",
    eventSequence: sequence(events),
    ok: terminal(events)?.type === "workflow:error" && !events.some(isFinish) && serialized.ok,
    details: `partial=${aggregateDeltaText(events)} serialized=${serialized.ok}`,
  };
}

function verifyRecoverableMemorySaveDegraded() {
  const workflowId = "wf_contract_degraded_memory";
  const output = {
    text: "saved reply",
    metadata: {
      trace: {
        workflowId,
        startedAt: fixedDate.toISOString(),
        status: "degraded",
        steps: [],
      },
    },
  };
  const events = [
    start(workflowId),
    delta(workflowId, output.text),
    stepStart(workflowId, "memory:save"),
    stepEnd(workflowId, "memory:save", "degraded", { reason: "write skipped" }),
    finish(workflowId, output),
  ];
  const serialized = serializeWireEvents(events);
  const textMatches = aggregateDeltaText(events) === output.text;

  return {
    scenario: "recoverable memory save degraded",
    eventSequence: sequence(events),
    ok:
      textMatches &&
      hasMatchingStepEnd(events, "memory:save", "degraded") &&
      terminal(events)?.type === "workflow:finish" &&
      serialized.ok,
    details: `aggregate=${aggregateDeltaText(events)} serialized=${serialized.ok}`,
  };
}

function verifyWireSerializationBoundary() {
  const workflowId = "wf_contract_wire_boundary";
  const cyclic = { label: "cycle" };
  cyclic.self = cyclic;
  const output = {
    text: "json safe",
    persona: {
      id: "persona",
      name: "映映",
      gender: "female",
      metadata: {
        now: fixedDate,
        fn: () => "ignored",
      },
    },
    memories: [
      {
        id: "memory",
        scope: { ownerType: "session", ownerId: "owner" },
        type: "preference",
        content: "likes tea",
        importance: 3,
        createdAt: fixedDate,
        metadata: {
          error: new Error("memory metadata"),
          raw: { provider: "memory private" },
        },
      },
    ],
    safety: {
      input: {
        allowed: true,
        metadata: {
          raw: { provider: "safety private" },
        },
      },
    },
    raw: {
      should: "not pass",
    },
    modelOutput: {
      text: "json safe",
      model: "contract-model",
      raw: { provider: "private" },
    },
    metadata: {
      now: fixedDate,
      error: new Error("safe message"),
      fn: () => "ignored",
      map: new Map([["k", "v"]]),
      cyclic,
    },
  };
  const events = [finish(workflowId, output)];
  const wire = toWireEvent(events[0]);
  const json = JSON.stringify(wire);
  const parsed = JSON.parse(json);
  const serialized = serializeWireEvents(events);

  return {
    scenario: "wire serialization boundary",
    eventSequence: sequence(events),
    ok:
      serialized.ok &&
      !json.includes("should") &&
      !json.includes("provider") &&
      parsed.type === "workflow:finish",
    details: `rawStripped=${!json.includes("should")} serialized=${serialized.ok}`,
  };
}

async function verifyNdjsonParserScenarios() {
  const workflowId = "wf_contract_ndjson";
  const events = [
    toWireEvent(start(workflowId)),
    toWireEvent(delta(workflowId, "hel")),
    toWireEvent(delta(workflowId, "lo")),
    toWireEvent(finish(workflowId, { text: "hello" })),
  ];
  const payload = events.map(encodeNdjson).join("");
  const parsed = await collectWireEventsFromChunks([
    payload.slice(0, 8),
    payload.slice(8, 28),
    payload.slice(28, payload.length - 3),
    payload.slice(payload.length - 3),
  ]);
  const extraAfterFinish = await catchesProtocolError([
    payload,
    encodeNdjson(toWireEvent(delta(workflowId, "!"))),
  ]);

  return {
    scenario: "ndjson parser chunking",
    eventSequence: parsed.map((event) => event.type),
    ok:
      parsed.length === events.length &&
      parsed[1]?.type === "text:delta" &&
      parsed[2]?.type === "text:delta" &&
      extraAfterFinish,
    details: `parsed=${parsed.length} extraAfterFinish=${extraAfterFinish}`,
  };
}

function start(workflowId) {
  return {
    type: "workflow:start",
    workflowId,
    timestamp: fixedDate,
  };
}

function stepStart(workflowId, step) {
  return {
    type: "step:start",
    workflowId,
    step,
    timestamp: fixedDate,
  };
}

function stepEnd(workflowId, step, status, summary) {
  return {
    type: "step:end",
    workflowId,
    step,
    status,
    timestamp: fixedDate,
    ...(summary !== undefined ? { summary } : {}),
  };
}

function delta(workflowId, text, model) {
  return {
    type: "text:delta",
    workflowId,
    text,
    ...(model !== undefined ? { model } : {}),
  };
}

function finish(workflowId, output) {
  return {
    type: "workflow:finish",
    workflowId,
    output,
  };
}

function error(workflowId, code, message, step) {
  return {
    type: "workflow:error",
    workflowId,
    error: {
      code,
      message,
      ...(step !== undefined ? { step } : {}),
    },
  };
}

function toWireEvent(event) {
  switch (event.type) {
    case "workflow:start":
    case "step:start":
      return { ...event, timestamp: event.timestamp.toISOString() };
    case "step:end":
      return {
        ...event,
        timestamp: event.timestamp.toISOString(),
        ...(event.summary !== undefined ? { summary: toJsonRecord(event.summary) } : {}),
      };
    case "tool:call":
      return {
        type: event.type,
        workflowId: event.workflowId,
        call: {
          ...event.call,
          arguments: toJsonValue(event.call.arguments),
        },
      };
    case "tool:result":
      return {
        type: event.type,
        workflowId: event.workflowId,
        result: toJsonValue(event.result),
      };
    case "workflow:finish":
      return {
        type: event.type,
        workflowId: event.workflowId,
        output: {
          text: event.output.text,
          ...(event.output.model !== undefined ? { model: event.output.model } : {}),
          ...(event.output.persona !== undefined
            ? { persona: toJsonValue(event.output.persona) }
            : {}),
          ...(event.output.memories !== undefined
            ? { memories: toJsonValue(event.output.memories) }
            : {}),
          ...(event.output.emotion !== undefined
            ? { emotion: toJsonValue(event.output.emotion) }
            : {}),
          ...(event.output.toolResults !== undefined
            ? { toolResults: toJsonValue(event.output.toolResults) }
            : {}),
          ...(event.output.safety !== undefined
            ? { safety: toJsonValue(event.output.safety) }
            : {}),
          ...(event.output.metadata !== undefined
            ? { metadata: toJsonValue(event.output.metadata) }
            : {}),
          ...(event.output.metadata?.trace !== undefined
            ? { trace: toJsonValue(event.output.metadata.trace) }
            : {}),
          ...(event.output.modelOutput !== undefined
            ? {
                modelOutput: toJsonValue({
                  text: event.output.modelOutput.text,
                  model: event.output.modelOutput.model,
                  toolCalls: event.output.modelOutput.toolCalls,
                  usage: event.output.modelOutput.usage,
                  runtime: event.output.modelOutput.runtime,
                }),
              }
            : {}),
        },
      };
    default:
      return event;
  }
}

function toJsonRecord(value) {
  const output = {};

  for (const [key, item] of Object.entries(value)) {
    const mapped = toJsonValueOrUndefined(item, new WeakSet());

    if (mapped !== undefined) {
      output[key] = mapped;
    }
  }

  return output;
}

function toJsonValue(value) {
  return toJsonValueOrUndefined(value, new WeakSet()) ?? null;
}

function toJsonValueOrUndefined(value, seen) {
  if (value === undefined || typeof value === "function" || typeof value === "symbol") {
    return undefined;
  }
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
    };
  }
  if (typeof value !== "object") {
    return null;
  }
  if (seen.has(value)) {
    return "[Circular]";
  }

  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => toJsonValueOrUndefined(item, seen) ?? null);
  }
  if (value instanceof Map) {
    return Array.from(value.entries()).map(([key, item]) => ({
      key: toJsonValueOrUndefined(key, seen) ?? null,
      value: toJsonValueOrUndefined(item, seen) ?? null,
    }));
  }
  if (value instanceof Set) {
    return Array.from(value.values()).map((item) => toJsonValueOrUndefined(item, seen) ?? null);
  }

  const output = {};

  for (const [key, item] of Object.entries(value)) {
    if (key === "raw" || key === "stack" || key === "cause") {
      continue;
    }

    const mapped = toJsonValueOrUndefined(item, seen);

    if (mapped !== undefined) {
      output[key] = mapped;
    }
  }

  return output;
}

function aggregateDeltaText(events) {
  return events
    .filter((event) => event.type === "text:delta")
    .map((event) => event.text)
    .join("");
}

function serializeWireEvents(events) {
  try {
    for (const event of events) {
      JSON.parse(JSON.stringify(toWireEvent(event)));
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "unknown serialization error",
    };
  }
}

function sequence(events) {
  return events.map((event) => event.type);
}

function terminal(events) {
  return events.find(
    (event) => event.type === "workflow:finish" || event.type === "workflow:error",
  );
}

function hasMatchingStepEnd(events, step, status) {
  return events.some(
    (event) => event.type === "step:end" && event.step === step && event.status === status,
  );
}

function isFinish(event) {
  return event.type === "workflow:finish";
}

async function collectStreamEvents(events) {
  const collected = [];

  for await (const event of events) {
    collected.push(event);
  }

  return collected;
}

function encodeNdjson(event) {
  return `${JSON.stringify(event)}\n`;
}

async function collectWireEventsFromChunks(chunks) {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }

      controller.close();
    },
  });
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const events = [];
  let pendingBuffer = "";
  let terminalReceived = false;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        pendingBuffer += decoder.decode();
        break;
      }

      pendingBuffer += decoder.decode(value, { stream: true });
      const lines = pendingBuffer.split("\n");
      pendingBuffer = lines.pop() ?? "";

      for (const line of lines) {
        if (line.trim() === "") {
          continue;
        }
        if (terminalReceived) {
          throw new Error("protocol_error: event after terminal");
        }

        const event = JSON.parse(line);
        validateWireEvent(event);
        events.push(event);

        if (event.type === "workflow:finish" || event.type === "workflow:error") {
          terminalReceived = true;
        }
      }
    }

    if (pendingBuffer.trim() !== "") {
      throw new Error("protocol_error: incomplete JSON line");
    }

    return events;
  } finally {
    reader.releaseLock();
  }
}

async function catchesProtocolError(chunks) {
  try {
    await collectWireEventsFromChunks(chunks);
    return false;
  } catch (error) {
    return error instanceof Error && error.message.startsWith("protocol_error:");
  }
}

function validateWireEvent(event) {
  if (typeof event !== "object" || event === null || typeof event.type !== "string") {
    throw new Error("protocol_error: invalid event");
  }
  if (typeof event.workflowId !== "string" || event.workflowId.length === 0) {
    throw new Error("protocol_error: missing workflowId");
  }
  if (event.type === "text:delta" && typeof event.text !== "string") {
    throw new Error("protocol_error: invalid delta");
  }
  if (event.type === "workflow:finish" && typeof event.output?.text !== "string") {
    throw new Error("protocol_error: invalid finish");
  }
  if (event.type === "workflow:error") {
    if (typeof event.error?.code !== "string" || typeof event.error?.message !== "string") {
      throw new Error("protocol_error: invalid error");
    }
    if (
      event.error.details !== undefined &&
      (typeof event.error.details !== "object" || event.error.details === null)
    ) {
      throw new Error("protocol_error: invalid error details");
    }
  }
}

class ExecuteOnlyContractWorkflow {
  meta = {
    id: "workflow.contract-execute-only",
    kind: "workflow",
    name: "Contract Execute Only Workflow",
  };

  async execute() {
    return { text: "execute only" };
  }
}

class UnterminatedStreamContractWorkflow {
  meta = {
    id: "workflow.contract-unterminated-stream",
    kind: "workflow",
    name: "Contract Unterminated Stream Workflow",
  };

  async execute() {
    return { text: "unterminated execute" };
  }

  async *stream() {
    yield start("wf_contract_unterminated");
  }
}

class ContractVerifierModel {
  meta = {
    id: "model.contract-verifier",
    kind: "model",
    name: "Contract Verifier Model",
  };

  async generate() {
    return {
      text: "contract",
      model: "contract-verifier",
      raw: null,
    };
  }

  async *stream() {
    yield {
      text: "contract",
      model: "contract-verifier",
      raw: null,
    };
  }
}

const reports = [
  verifyNormalWhitespaceDelta(),
  await verifyStreamUnsupported(),
  await verifyMissingTerminalFallback(),
  verifyStartedStepFailure(),
  verifyOutputSafetyRejected(),
  verifyRecoverableMemorySaveDegraded(),
  verifyWireSerializationBoundary(),
  await verifyNdjsonParserScenarios(),
];

console.table(
  reports.map((report) => ({
    scenario: report.scenario,
    ok: report.ok,
    details: report.details,
    events: report.eventSequence.join(" -> "),
  })),
);

if (reports.some((report) => !report.ok)) {
  process.exitCode = 1;
}
