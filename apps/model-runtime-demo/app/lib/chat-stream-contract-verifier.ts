import type {
  ChatModel,
  ChatWorkflow,
  ChatWorkflowExecutionContext,
  ChatWorkflowInput,
  ChatWorkflowOutput,
  ChatWorkflowStreamEvent,
  GenerateInput,
  GenerateOutput,
  GenerateStreamChunk,
  WorkflowErrorStreamEvent,
  WorkflowFinishStreamEvent,
  WorkflowStepName,
  WorkflowStepStatus,
  WorkflowTextDeltaStreamEvent,
} from "@ying-ai/ai-core";
import { createCompanionCore } from "@ying-ai/ai-core";

import {
  toChatWorkflowStreamWireEvent,
  type ChatWorkflowStreamWireEvent,
} from "./chat-stream-wire";
import {
  ChatStreamProtocolError,
  encodeNdjson,
  parseNdjsonWireEvents,
} from "./chat-stream-transport";

export interface ContractVerificationReport {
  scenario: string;
  eventSequence: string[];
  ok: boolean;
  details: string;
}

export async function buildV11StreamContractVerificationReport(): Promise<
  ContractVerificationReport[]
> {
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

  return reports;
}

export async function logV11StreamContractVerificationReport(): Promise<void> {
  const reports = await buildV11StreamContractVerificationReport();

  console.table(
    reports.map((report) => ({
      scenario: report.scenario,
      ok: report.ok,
      details: report.details,
      events: report.eventSequence.join(" -> "),
    })),
  );
}

function verifyNormalWhitespaceDelta(): ContractVerificationReport {
  const workflowId = "wf_contract_normal";
  const output: ChatWorkflowOutput = { text: "hello world", model: "contract-model" };
  const events: ChatWorkflowStreamEvent[] = [
    start(workflowId),
    stepStart(workflowId, "model:generate"),
    stepEnd(workflowId, "model:generate", "success"),
    delta(workflowId, "hello", "contract-model"),
    delta(workflowId, " ", "contract-model"),
    delta(workflowId, "world", "contract-model"),
    finish(workflowId, output),
  ];
  const serialized = serializeWireEvents(events);
  const textMatches = aggregateDeltaText(events) === output.text;
  const hasWhitespaceDelta = events.some(
    (event) => event.type === "text:delta" && event.text === " ",
  );

  return {
    scenario: "normal whitespace delta",
    eventSequence: sequence(events),
    ok: textMatches && hasWhitespaceDelta && serialized.ok,
    details: `aggregate=${aggregateDeltaText(events)} serialized=${serialized.ok}`,
  };
}

async function verifyStreamUnsupported(): Promise<ContractVerificationReport> {
  const core = createCompanionCore({
    model: new ContractVerifierModel(),
    workflow: new ExecuteOnlyContractWorkflow(),
  });
  const events = await collectStreamEvents(
    core.streamWorkflow({
      message: "hello",
    }),
  );
  const serialized = serializeWireEvents(events);
  const terminalEvent = terminal(events);
  const workflowIds = new Set(events.map((event) => event.workflowId));

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

async function verifyMissingTerminalFallback(): Promise<ContractVerificationReport> {
  const core = createCompanionCore({
    model: new ContractVerifierModel(),
    workflow: new UnterminatedStreamContractWorkflow(),
  });
  const events = await collectStreamEvents(
    core.streamWorkflow({
      message: "hello",
    }),
  );
  const serialized = serializeWireEvents(events);
  const terminalEvent = terminal(events);

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

function verifyStartedStepFailure(): ContractVerificationReport {
  const workflowId = "wf_contract_failed_step";
  const events: ChatWorkflowStreamEvent[] = [
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

function verifyOutputSafetyRejected(): ContractVerificationReport {
  const workflowId = "wf_contract_output_safety";
  const events: ChatWorkflowStreamEvent[] = [
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

function verifyRecoverableMemorySaveDegraded(): ContractVerificationReport {
  const workflowId = "wf_contract_degraded_memory";
  const output: ChatWorkflowOutput = {
    text: "saved reply",
    metadata: {
      trace: {
        workflowId,
        startedAt: new Date("2026-06-22T12:00:00.000Z").toISOString(),
        status: "degraded",
        steps: [],
      },
    },
  };
  const events: ChatWorkflowStreamEvent[] = [
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

function verifyWireSerializationBoundary(): ContractVerificationReport {
  const workflowId = "wf_contract_wire_boundary";
  const cyclic: Record<string, unknown> = { label: "cycle" };
  cyclic.self = cyclic;
  const output: ChatWorkflowOutput = {
    text: "json safe",
    persona: {
      id: "persona",
      name: "映映",
      gender: "female",
      metadata: {
        now: new Date("2026-06-22T12:00:00.000Z"),
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
        createdAt: new Date("2026-06-22T12:00:00.000Z"),
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
      now: new Date("2026-06-22T12:00:00.000Z"),
      error: new Error("safe message"),
      fn: () => "ignored",
      map: new Map<string, unknown>([["k", "v"]]),
      cyclic,
    },
  };
  const events: ChatWorkflowStreamEvent[] = [finish(workflowId, output)];
  const wire = toChatWorkflowStreamWireEvent(events[0] as WorkflowFinishStreamEvent);
  const json = JSON.stringify(wire);
  const parsed = JSON.parse(json) as ChatWorkflowStreamWireEvent;
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

async function verifyNdjsonParserScenarios(): Promise<ContractVerificationReport> {
  const workflowId = "wf_contract_ndjson";
  const events = [
    toChatWorkflowStreamWireEvent(start(workflowId)),
    toChatWorkflowStreamWireEvent(delta(workflowId, "hel")),
    toChatWorkflowStreamWireEvent(delta(workflowId, "lo")),
    toChatWorkflowStreamWireEvent(finish(workflowId, { text: "hello" })),
  ];
  const payload = events.map((event) => new TextDecoder().decode(encodeNdjson(event))).join("");
  const chunks = [
    payload.slice(0, 8),
    payload.slice(8, 28),
    payload.slice(28, payload.length - 3),
    payload.slice(payload.length - 3),
  ];
  const parsed = await collectWireEventsFromChunks(chunks);
  const extraAfterFinish = await catchesProtocolError([
    payload,
    new TextDecoder().decode(encodeNdjson(toChatWorkflowStreamWireEvent(delta(workflowId, "!")))),
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

function start(workflowId: string): ChatWorkflowStreamEvent {
  return {
    type: "workflow:start",
    workflowId,
    timestamp: new Date("2026-06-22T12:00:00.000Z"),
  };
}

function stepStart(workflowId: string, step: WorkflowStepName): ChatWorkflowStreamEvent {
  return {
    type: "step:start",
    workflowId,
    step,
    timestamp: new Date("2026-06-22T12:00:01.000Z"),
  };
}

function stepEnd(
  workflowId: string,
  step: WorkflowStepName,
  status: WorkflowStepStatus,
  summary?: Record<string, unknown>,
): ChatWorkflowStreamEvent {
  return {
    type: "step:end",
    workflowId,
    step,
    status,
    timestamp: new Date("2026-06-22T12:00:02.000Z"),
    ...(summary !== undefined ? { summary } : {}),
  };
}

function delta(workflowId: string, text: string, model?: string): WorkflowTextDeltaStreamEvent {
  return {
    type: "text:delta",
    workflowId,
    text,
    ...(model !== undefined ? { model } : {}),
  };
}

function finish(workflowId: string, output: ChatWorkflowOutput): WorkflowFinishStreamEvent {
  return {
    type: "workflow:finish",
    workflowId,
    output,
  };
}

function error(
  workflowId: string,
  code: WorkflowErrorStreamEvent["error"]["code"],
  message: string,
  step?: WorkflowErrorStreamEvent["error"]["step"],
): WorkflowErrorStreamEvent {
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

function aggregateDeltaText(events: ChatWorkflowStreamEvent[]): string {
  return events
    .filter((event): event is WorkflowTextDeltaStreamEvent => event.type === "text:delta")
    .map((event) => event.text)
    .join("");
}

function serializeWireEvents(events: ChatWorkflowStreamEvent[]): { ok: boolean; error?: string } {
  try {
    for (const event of events) {
      JSON.parse(JSON.stringify(toChatWorkflowStreamWireEvent(event)));
    }

    return { ok: true };
  } catch (error_) {
    return {
      ok: false,
      error: error_ instanceof Error ? error_.message : "unknown serialization error",
    };
  }
}

function sequence(events: ChatWorkflowStreamEvent[]): string[] {
  return events.map((event) => event.type);
}

function terminal(
  events: ChatWorkflowStreamEvent[],
): WorkflowFinishStreamEvent | WorkflowErrorStreamEvent | undefined {
  return events.find(
    (event): event is WorkflowFinishStreamEvent | WorkflowErrorStreamEvent =>
      event.type === "workflow:finish" || event.type === "workflow:error",
  );
}

function hasMatchingStepEnd(
  events: ChatWorkflowStreamEvent[],
  step: WorkflowStepName,
  status: WorkflowStepStatus,
): boolean {
  return events.some((event) => {
    return event.type === "step:end" && event.step === step && event.status === status;
  });
}

function isFinish(event: ChatWorkflowStreamEvent): event is WorkflowFinishStreamEvent {
  return event.type === "workflow:finish";
}

async function collectStreamEvents(
  events: AsyncIterable<ChatWorkflowStreamEvent>,
): Promise<ChatWorkflowStreamEvent[]> {
  const collected: ChatWorkflowStreamEvent[] = [];

  for await (const event of events) {
    collected.push(event);
  }

  return collected;
}

async function collectWireEventsFromChunks(
  chunks: string[],
): Promise<ChatWorkflowStreamWireEvent[]> {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();

      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }

      controller.close();
    },
  });
  const events: ChatWorkflowStreamWireEvent[] = [];

  for await (const event of parseNdjsonWireEvents(stream)) {
    events.push(event);
  }

  return events;
}

async function catchesProtocolError(chunks: string[]): Promise<boolean> {
  try {
    await collectWireEventsFromChunks(chunks);
    return false;
  } catch (error) {
    return error instanceof ChatStreamProtocolError;
  }
}

class ExecuteOnlyContractWorkflow implements ChatWorkflow {
  public readonly meta = {
    id: "workflow.contract-execute-only",
    kind: "workflow",
    name: "Contract Execute Only Workflow",
  } as const;

  public async execute(
    input: ChatWorkflowInput,
    context: ChatWorkflowExecutionContext,
  ): Promise<ChatWorkflowOutput> {
    void input;
    void context;

    return { text: "execute only" };
  }
}

class UnterminatedStreamContractWorkflow implements ChatWorkflow {
  public readonly meta = {
    id: "workflow.contract-unterminated-stream",
    kind: "workflow",
    name: "Contract Unterminated Stream Workflow",
  } as const;

  public async execute(
    input: ChatWorkflowInput,
    context: ChatWorkflowExecutionContext,
  ): Promise<ChatWorkflowOutput> {
    void input;
    void context;

    return { text: "unterminated execute" };
  }

  public async *stream(
    input: ChatWorkflowInput,
    context: ChatWorkflowExecutionContext,
  ): AsyncIterable<ChatWorkflowStreamEvent> {
    void input;
    void context;

    yield start("wf_contract_unterminated");
  }
}

class ContractVerifierModel implements ChatModel {
  public readonly meta = {
    id: "model.contract-verifier",
    kind: "model",
    name: "Contract Verifier Model",
  } as const;

  public readonly primaryProfile = {
    provider: "contract-verifier",
    model: "contract-verifier",
    capabilities: {
      streaming: true,
      toolCalling: false,
      usage: false,
    },
  } as const;

  public async generate(input: GenerateInput): Promise<GenerateOutput> {
    void input;

    return {
      text: "contract",
      model: "contract-verifier",
      raw: null,
    };
  }

  public async *stream(input: GenerateInput): AsyncIterable<GenerateStreamChunk> {
    void input;

    yield {
      text: "contract",
      model: "contract-verifier",
      raw: null,
    };
  }
}
