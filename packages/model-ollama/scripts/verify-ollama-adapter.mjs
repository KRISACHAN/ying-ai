/* global console, process */

import {
  ModelCapabilityUnavailableError,
  ModelRuntimeError,
  createCompanionCore,
  EmptyToolRegistry,
} from "@ying-companion/ai-core";
import { createOllamaChatModel, OllamaChatModel } from "../dist/index.js";
import { toOllamaMessages } from "../dist/ollama-message-mapper.js";
import { toModelToolCalls, toOllamaTools } from "../dist/ollama-tool-mapper.js";

const safeSummary = {};

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function record(key, value) {
  safeSummary[key] = value;
}

const defaultModel = createOllamaChatModel({ model: "local-a" });
record("meta", defaultModel.meta);
record("primaryProfile", defaultModel.primaryProfile);

assert(defaultModel.meta.id === "model.ollama", "meta.id mismatch");
assert(defaultModel.primaryProfile.provider === "ollama", "provider mismatch");
assert(defaultModel.primaryProfile.capabilities.streaming === true, "streaming default mismatch");
assert(
  defaultModel.primaryProfile.capabilities.toolCalling === false,
  "toolCalling default mismatch",
);
assert(defaultModel.primaryProfile.capabilities.usage === false, "usage default mismatch");

const mappedMessages = toOllamaMessages([
  { role: "system", content: "system" },
  { role: "user", content: "user" },
  {
    role: "assistant",
    content: "",
    toolCalls: [{ name: "get_time", arguments: { timezone: "Asia/Shanghai" } }],
  },
  { role: "tool", name: "get_time", toolCallId: "call-1", content: '{"time":"12:00"}' },
]);
record(
  "mappedRoles",
  mappedMessages.map((message) => message.role),
);

const mappedTools = toOllamaTools({
  get_time: {
    type: "dynamic",
    description: "Get current time.",
    inputSchema: {
      jsonSchema: {
        type: "object",
        properties: {
          timezone: { type: "string" },
        },
        required: ["timezone"],
      },
    },
  },
});
record("mappedToolCount", mappedTools?.length ?? 0);

const mappedToolCalls = toModelToolCalls([
  {
    function: {
      name: "get_time",
      arguments: { timezone: "Asia/Shanghai" },
    },
  },
]);
record("mappedToolCallCount", mappedToolCalls?.length ?? 0);

try {
  await defaultModel.generate({
    messages: [{ role: "user", content: "tool plan" }],
    requiredCapabilities: { toolCalling: true },
  });
  throw new Error("Expected tool capability rejection.");
} catch (error) {
  assert(
    error instanceof ModelCapabilityUnavailableError,
    "tool capability rejection should use ModelCapabilityUnavailableError",
  );
  record("toolCapabilitySkipCount", error.capabilitySkips.length);
}

const nonStreamingModel = createOllamaChatModel({
  model: "local-a",
  primaryProfileOverride: { capabilities: { streaming: false } },
  fallback: {
    model: "local-b",
    profileOverride: { capabilities: { streaming: false } },
  },
});

try {
  for await (const chunk of nonStreamingModel.stream({
    messages: [{ role: "user", content: "hello" }],
  })) {
    void chunk;
    throw new Error("Unexpected stream chunk.");
  }
  throw new Error("Expected streaming capability rejection.");
} catch (error) {
  assert(
    error instanceof ModelCapabilityUnavailableError,
    "streaming capability rejection should use ModelCapabilityUnavailableError",
  );
  record("streamCapabilitySkipCount", error.capabilitySkips.length);
}

const fallbackCalls = [];
const fallbackModel = new OllamaChatModel(
  {
    model: "missing-primary",
    fallback: { model: "working-fallback" },
  },
  {
    async chat(request) {
      fallbackCalls.push(request.model);

      if (request.model === "missing-primary") {
        throw new Error("model not found");
      }

      return createChatResponse(request.model, "fallback-ok");
    },
  },
);
const fallbackOutput = await fallbackModel.generate({
  messages: [{ role: "user", content: "hello" }],
});
assert(fallbackOutput.model === "working-fallback", "fallback model mismatch");
assert(fallbackOutput.runtime?.fallbackUsed === true, "fallback runtime mismatch");
assert(fallbackOutput.runtime?.primaryAttempts === 1, "primary attempt count mismatch");
assert(fallbackOutput.runtime?.fallbackAttempts === 1, "fallback attempt count mismatch");
assert(fallbackOutput.runtime?.errors.length === 1, "fallback should keep primary error");
record("fallbackGenerate", {
  calls: fallbackCalls,
  usedModel: fallbackOutput.model,
  fallbackUsed: fallbackOutput.runtime?.fallbackUsed,
});

const midStreamCalls = [];
const midStreamModel = new OllamaChatModel(
  {
    model: "stream-primary",
    fallback: { model: "stream-fallback" },
  },
  {
    async chat(request) {
      midStreamCalls.push(request.model);

      if (request.stream === true) {
        return createFailingStream(request.model);
      }

      return createChatResponse(request.model, "not-used");
    },
  },
);
let partialText = "";

try {
  for await (const chunk of midStreamModel.stream({
    messages: [{ role: "user", content: "hello" }],
  })) {
    partialText += chunk.text;
  }

  throw new Error("Expected mid-stream failure.");
} catch (error) {
  assert(error instanceof ModelRuntimeError, "mid-stream failure should use ModelRuntimeError");
  assert(partialText === "partial", "mid-stream should expose partial text once");
  assert(
    midStreamCalls.length === 1 && midStreamCalls[0] === "stream-primary",
    "mid-stream failure must not call fallback",
  );
  record("midStreamFailure", {
    calls: midStreamCalls,
    partialTextLength: partialText.length,
    errorCount: error.errors.length,
  });
}

const verifyModel = process.env.OLLAMA_VERIFY_MODEL;

if (verifyModel !== undefined && verifyModel.trim() !== "") {
  const liveModel = createOllamaChatModel({
    model: verifyModel,
    host: process.env.OLLAMA_VERIFY_HOST,
  });
  const core = createCompanionCore({
    model: liveModel,
    toolRegistry: new EmptyToolRegistry(),
  });

  const output = await core.executeWorkflow({
    sessionId: "ollama-verify",
    message: "用一句中文回复：你好",
    history: [],
  });
  record("liveGenerate", {
    model: liveModel.primaryProfile.model,
    textLength: output.text.length,
  });

  let deltaCount = 0;
  let finished = false;

  for await (const event of core.streamWorkflow({
    sessionId: "ollama-verify-stream",
    message: "用一句中文回复：流式你好",
    history: [],
  })) {
    if (event.type === "text:delta" && event.text.length > 0) {
      deltaCount += 1;
    }

    if (event.type === "workflow:finish") {
      finished = true;
    }
  }

  record("liveStream", { deltaCount, finished });
}

console.log(JSON.stringify(safeSummary, null, 2));

function createChatResponse(model, content) {
  return {
    model,
    created_at: new Date(),
    message: {
      role: "assistant",
      content,
    },
    done: true,
    done_reason: "stop",
    total_duration: 0,
    load_duration: 0,
    prompt_eval_count: 1,
    prompt_eval_duration: 0,
    eval_count: 1,
    eval_duration: 0,
  };
}

async function* createFailingStream(model) {
  yield createChatResponse(model, "partial");
  throw new Error("stream interrupted");
}
