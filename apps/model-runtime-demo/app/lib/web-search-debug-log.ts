import type { WebSearchRetrievalMetadata } from "@ying-companion/tool-web-search";

import type { ChatWorkflowStreamWireEvent } from "./chat-stream-wire";

export interface WebSearchDebugLog {
  plannerQuery?: string;
  plannerArguments?: Record<string, unknown>;
  retrieval?: WebSearchRetrievalMetadata;
  sourceCount?: number;
}

export function extractWebSearchDebugLog(input: {
  streamEvents?: ChatWorkflowStreamWireEvent[];
  toolSnapshot?: unknown;
}): WebSearchDebugLog | null {
  const fromStream = extractWebSearchDebugLogFromStreamEvents(input.streamEvents ?? []);
  const fromSnapshot = extractWebSearchDebugLogFromToolSnapshot(input.toolSnapshot);

  if (fromStream === null) {
    return fromSnapshot;
  }

  if (fromSnapshot === null) {
    return fromStream;
  }

  const merged: WebSearchDebugLog = {
    ...(fromSnapshot.plannerQuery !== undefined ? { plannerQuery: fromSnapshot.plannerQuery } : {}),
    ...(fromStream.plannerQuery !== undefined ? { plannerQuery: fromStream.plannerQuery } : {}),
    ...(fromSnapshot.plannerArguments !== undefined
      ? { plannerArguments: fromSnapshot.plannerArguments }
      : {}),
    ...(fromStream.plannerArguments !== undefined
      ? { plannerArguments: fromStream.plannerArguments }
      : {}),
    ...(fromStream.sourceCount !== undefined
      ? { sourceCount: fromStream.sourceCount }
      : fromSnapshot.sourceCount !== undefined
        ? { sourceCount: fromSnapshot.sourceCount }
        : {}),
  };

  const retrieval = fromStream.retrieval ?? fromSnapshot.retrieval;
  if (retrieval !== undefined) {
    merged.retrieval = retrieval;
  }

  return merged;
}

function extractWebSearchDebugLogFromStreamEvents(
  events: ChatWorkflowStreamWireEvent[],
): WebSearchDebugLog | null {
  const toolCall = [...events].reverse().find(isWebSearchToolCallEvent);
  const toolResult = [...events].reverse().find(isWebSearchToolResultEvent);

  if (toolCall === undefined && toolResult === undefined) {
    return null;
  }

  const log: WebSearchDebugLog = {};

  if (toolCall !== undefined && isRecord(toolCall.call.arguments)) {
    log.plannerArguments = toolCall.call.arguments;
    if (typeof toolCall.call.arguments.query === "string") {
      log.plannerQuery = toolCall.call.arguments.query;
    }
  }

  const search = readSearchPayload(toolResult?.result.result);
  if (search !== null) {
    if (isRetrieval(search.retrieval)) {
      log.retrieval = search.retrieval;
    }
    if (Array.isArray(search.sources)) {
      log.sourceCount = search.sources.length;
    }
  }

  return log;
}

function extractWebSearchDebugLogFromToolSnapshot(toolSnapshot: unknown): WebSearchDebugLog | null {
  if (!isRecord(toolSnapshot) || !Array.isArray(toolSnapshot.webSearch)) {
    return null;
  }

  const latest = toolSnapshot.webSearch.at(-1);
  if (!isRecord(latest)) {
    return null;
  }

  return {
    ...(typeof latest.query === "string" ? { plannerQuery: latest.query } : {}),
    ...(isRetrieval(latest.retrieval) ? { retrieval: latest.retrieval } : {}),
    ...(Array.isArray(latest.sources) ? { sourceCount: latest.sources.length } : {}),
  };
}

function readSearchPayload(value: unknown): {
  sources?: unknown;
  retrieval?: unknown;
} | null {
  if (!isRecord(value) || !isRecord(value.search)) {
    return null;
  }

  return value.search;
}

function isRetrieval(value: unknown): value is WebSearchRetrievalMetadata {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.attempts === "number" &&
    typeof value.primaryReason === "string" &&
    typeof value.fallbackUsed === "boolean" &&
    (value.requests === undefined ||
      (Array.isArray(value.requests) &&
        value.requests.every(
          (request) =>
            isRecord(request) &&
            typeof request.attempt === "number" &&
            typeof request.reason === "string" &&
            typeof request.provider === "string" &&
            isRecord(request.params),
        )))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isWebSearchToolCallEvent(
  event: ChatWorkflowStreamWireEvent,
): event is Extract<ChatWorkflowStreamWireEvent, { type: "tool:call" }> {
  return event.type === "tool:call" && event.call.name === "web_search";
}

function isWebSearchToolResultEvent(
  event: ChatWorkflowStreamWireEvent,
): event is Extract<ChatWorkflowStreamWireEvent, { type: "tool:result" }> {
  return event.type === "tool:result" && event.result.name === "web_search";
}
