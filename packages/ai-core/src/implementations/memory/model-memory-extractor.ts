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

export interface ModelMemoryExtractorOptions {
  model: ChatModel;
  retryCount?: number;
  maxHistoryMessages?: number;
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

  public constructor(options: ModelMemoryExtractorOptions) {
    this.model = options.model;
    this.retryCount = options.retryCount ?? 1;
    this.maxHistoryMessages = options.maxHistoryMessages ?? 6;
  }

  public async extract(input: MemoryExtractionInput): Promise<MemoryExtractionResult> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.retryCount; attempt += 1) {
      try {
        const output = await this.model.generate({
          messages: buildExtractionMessages(input, attempt > 0, this.maxHistoryMessages),
          temperature: 0,
        });
        const json = parseJsonObject(output.text);
        const parsed = MemoryExtractionResultSchema.parse(json);

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
    ? "\n上一次输出不是合法 JSON 或不符合 schema。请只输出合法 JSON，不要添加解释。"
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

function parseJsonObject(text: string): unknown {
  const trimmed = text.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");

    if (start < 0 || end <= start) {
      throw new Error("Memory extraction output is not JSON");
    }

    return JSON.parse(trimmed.slice(start, end + 1));
  }
}

export type { ExtractedMemory };
