/**
 * 基于 LLM + Zod 的结构化记忆抽取器。
 *
 * 用低 temperature 的 generate 请求结构化对象，经 schema 校验后返回 ExtractedMemory[]。
 * 支持超时与结构化输出失败重试。
 */
import { z } from "zod";

import type { ChatMessage, ChatModel } from "../../abstractions/model";
import type {
  ExtractedMemory,
  MemoryExtractionInput,
  MemoryExtractionResult,
  MemoryExtractor,
} from "../../abstractions/memory";

const ExtractedMemorySchema = z.object({
  type: z.enum(["fact", "preference", "relationship", "event"]),
  content: z.string().min(1),
  importance: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  reason: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const MemoryExtractionResultSchema = z.object({
  memories: z.array(ExtractedMemorySchema),
});

/** ModelMemoryExtractor 构造参数。 */
export interface ModelMemoryExtractorOptions {
  model: ChatModel;
  retryCount?: number;
  maxHistoryMessages?: number;
  timeoutMs?: number;
}

export class ModelMemoryExtractor implements MemoryExtractor {
  public readonly meta = {
    id: "memory-extractor.model",
    kind: "memory-extractor",
    name: "Model Memory Extractor",
    description: "Extracts structured long-term memories with a chat model",
    version: "1.0.0",
  } as const;

  private readonly model: ChatModel;
  private readonly retryCount: number;
  private readonly maxHistoryMessages: number;
  private readonly timeoutMs: number;

  public constructor(options: ModelMemoryExtractorOptions) {
    this.model = options.model;
    this.retryCount = options.retryCount ?? 1;
    this.maxHistoryMessages = options.maxHistoryMessages ?? 6;
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  /** 调用 LLM 抽取结构化记忆；结构化输出缺失或不符合 schema 时按 retryCount 重试。 */
  public async extract(input: MemoryExtractionInput): Promise<MemoryExtractionResult> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.retryCount; attempt += 1) {
      try {
        const output = await withTimeout(
          this.model.generate({
            messages: buildExtractionMessages(input, attempt > 0, this.maxHistoryMessages),
            temperature: 0,
            structuredOutput: {
              type: "object",
              schema: MemoryExtractionResultSchema,
              name: "memory_extraction_result",
              description: "Long-term memories extracted from the current conversation turn.",
            },
          }),
          this.timeoutMs,
        );
        if (output.structuredOutput === undefined) {
          throw new Error("Memory extraction requires GenerateOutput.structuredOutput");
        }

        const parsed = MemoryExtractionResultSchema.parse(output.structuredOutput);

        return {
          memories: parsed.memories.map((memory) => ({
            type: memory.type,
            content: memory.content.trim(),
            importance: memory.importance,
            ...(memory.reason !== undefined ? { reason: memory.reason } : {}),
            ...(memory.metadata !== undefined ? { metadata: memory.metadata } : {}),
          })),
        };
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError instanceof Error ? lastError : new Error("Memory extraction failed");
  }
}

/** 为模型调用包裹超时；timeoutMs <= 0 时不限制。 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  if (timeoutMs <= 0) {
    return promise;
  }

  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Memory extraction timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

/** 构造记忆抽取的 system/user 消息；isRetry 时追加结构化输出纠错指令。 */
function buildExtractionMessages(
  input: MemoryExtractionInput,
  isRetry: boolean,
  maxHistoryMessages: number,
): ChatMessage[] {
  const history = (input.history ?? [])
    .slice(-maxHistoryMessages)
    .map((message) => `${message.role}: ${message.content}`)
    .join("\n");
  const retryInstruction = isRetry
    ? "\n上一次结构化输出不符合 schema。请只返回符合 schema 的 JSON 对象，不要添加解释。"
    : "";
  const externalContextInstruction = input.externalContextUsed
    ? [
        "",
        "本轮对话使用了外部工具上下文。",
        "不得将外部工具来源中的公开事实、新闻、价格、日期、链接或搜索结论写入长期记忆。",
        "仍可抽取用户明确表达的稳定偏好、个人经历、身份信息、关系边界或长期项目。",
        input.excludedToolNames !== undefined && input.excludedToolNames.length > 0
          ? `需排除外部事实的工具：${input.excludedToolNames.join(", ")}。`
          : "",
      ].join("\n")
    : "";

  return [
    {
      role: "system",
      content: [
        "你是 AI Companion 的长期记忆抽取器。",
        "",
        "你的任务是从本轮对话中抽取对未来对话有长期价值的信息。",
        "只抽取用户明确表达，或可以高置信推断的信息。",
        "不要抽取助手编造的信息。",
        "不要抽取短期寒暄。",
        "不要抽取一次性任务细节，除非它反映了用户长期偏好、身份、关系、重要项目或重要事件。",
        "",
        "记忆类型只能是 fact、preference、relationship、event。",
        "重要度为 1 到 5。只有 importance >= 3 的记忆会被保存。",
        externalContextInstruction,
        "",
        '请只输出 JSON，格式为：{"memories":[{"type":"preference","content":"用户喜欢五月天","importance":4,"reason":"用户明确表达了长期音乐偏好"}]}',
        retryInstruction,
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        history !== "" ? `最近短期历史：\n${history}\n` : "",
        `本轮用户输入：${input.userMessage}`,
        `本轮助手回复：${input.assistantMessage}`,
      ].join("\n"),
    },
  ];
}

export type { ExtractedMemory };
