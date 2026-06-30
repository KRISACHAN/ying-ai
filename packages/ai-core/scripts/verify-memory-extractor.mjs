/* global console */

import { ModelMemoryExtractor } from "../dist/index.js";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function createModel(generate) {
  return {
    meta: {
      id: "model.fake",
      kind: "model",
      name: "Fake Model",
      version: "0.0.0",
    },
    primaryProfile: {
      provider: "fake",
      model: "fake-structured",
      capabilities: {
        streaming: false,
        toolCalling: false,
        usage: false,
      },
    },
    generate,
    async *stream() {
      yield {
        text: "",
        raw: {},
      };
    },
  };
}

const calls = [];
const happyExtractor = new ModelMemoryExtractor({
  retryCount: 0,
  timeoutMs: 0,
  model: createModel(async (input) => {
    calls.push(input);

    return {
      text: "",
      model: "fake-structured",
      raw: {},
      structuredOutput: {
        memories: [
          {
            type: "event",
            content: "用户曾在毕节赫章大韭菜坪与伴侣拥吻",
            importance: 5,
            reason: "用户明确要求记住该共同经历",
          },
        ],
      },
    };
  }),
});

const result = await happyExtractor.extract({
  userMessage: "请你记住我们曾在去年 7 月份去过的毕节赫章大韭菜坪，关键信息是我们曾在那拥吻",
  assistantMessage: "我会记住这段经历。",
});

assert(calls.length === 1, "extractor should call model once");
assert(calls[0]?.structuredOutput?.type === "object", "extractor should request structured output");
assert(result.memories.length === 1, "extractor should return one memory");
assert(result.memories[0]?.type === "event", "memory type mismatch");
assert(result.memories[0]?.content.includes("大韭菜坪"), "memory content mismatch");

const missingOutputExtractor = new ModelMemoryExtractor({
  retryCount: 0,
  timeoutMs: 0,
  model: createModel(async () => ({
    text: "{}",
    model: "fake-text-only",
    raw: {},
  })),
});

try {
  await missingOutputExtractor.extract({
    userMessage: "请记住这件事",
    assistantMessage: "好的",
  });

  throw new Error("Expected missing structured output failure");
} catch (error) {
  assert(
    error instanceof Error &&
      error.message === "Memory extraction requires GenerateOutput.structuredOutput",
    "missing structured output should fail with a clear error",
  );
}

console.log(
  JSON.stringify(
    {
      memoryExtractor: {
        structuredOutputRequested: calls[0]?.structuredOutput?.type,
        extracted: result.memories.length,
        missingStructuredOutput: "clear-error",
      },
    },
    null,
    2,
  ),
);
