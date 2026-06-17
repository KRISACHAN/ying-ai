/**
 * 基于 LLM + Zod 的滚动摘要更新器。
 *
 * 将「当前摘要 + 待压缩消息片段」发给模型，输出新摘要 JSON 并校验 schema。
 */
import { z } from "zod";

import type { ChatMessage, ChatModel } from "../../abstractions/model";
import type {
  ConversationSummary,
  SummaryUpdateInput,
  SummaryUpdateResult,
  SummaryUpdater,
} from "../../abstractions/summary";

const SummaryUpdateSchema = z.object({
  content: z.string().min(1),
  reason: z.string().optional(),
});

/** ModelSummaryUpdater 构造参数。 */
export interface ModelSummaryUpdaterOptions {
  model: ChatModel;
  retryCount?: number;
  timeoutMs?: number;
}

export class ModelSummaryUpdater implements SummaryUpdater {
  public readonly meta = {
    id: "summary-updater.model",
    kind: "summary-updater",
    name: "Model Summary Updater",
    description: "Updates rolling conversation summaries with a chat model",
    version: "1.0.0",
  } as const;

  private readonly model: ChatModel;
  private readonly retryCount: number;
  private readonly timeoutMs: number;

  public constructor(options: ModelSummaryUpdaterOptions) {
    this.model = options.model;
    this.retryCount = options.retryCount ?? 1;
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  /** 合并当前摘要与待压缩消息，调用 LLM 生成新摘要 JSON。 */
  public async update(input: SummaryUpdateInput): Promise<SummaryUpdateResult> {
    if (input.messagesToSummarize.length === 0) {
      const summary: ConversationSummary = input.currentSummary ?? {
        scope: input.scope,
        content: "",
        messageCount: 0,
        updatedAt: new Date(),
      };

      return {
        summary,
        summarizedMessageCount: 0,
        skipped: true,
        reason: "no_messages_to_summarize",
      };
    }

    let lastError: unknown;

    for (let attempt = 0; attempt <= this.retryCount; attempt += 1) {
      try {
        const output = await withTimeout(
          this.model.generate({
            messages: buildSummaryMessages(input, attempt > 0),
            temperature: 0,
          }),
          this.timeoutMs,
        );
        const json = parseJsonObject(output.text);
        const parsed = SummaryUpdateSchema.parse(json);
        const content = parsed.content.trim();

        const summary: ConversationSummary = {
          ...(input.currentSummary?.id !== undefined ? { id: input.currentSummary.id } : {}),
          scope: input.scope,
          content,
          messageCount:
            (input.currentSummary?.messageCount ?? 0) + input.messagesToSummarize.length,
          ...(input.currentSummary?.messageRange !== undefined
            ? { messageRange: input.currentSummary.messageRange }
            : {}),
          updatedAt: new Date(),
          metadata: {
            ...(input.currentSummary?.metadata ?? {}),
            model: output.model,
            ...(parsed.reason !== undefined ? { reason: parsed.reason } : {}),
          },
        };

        return {
          summary,
          summarizedMessageCount: input.messagesToSummarize.length,
          skipped: false,
          ...(parsed.reason !== undefined ? { reason: parsed.reason } : {}),
        };
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError instanceof Error ? lastError : new Error("Summary update failed");
  }
}

/** 为摘要更新模型调用包裹超时。 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  if (timeoutMs <= 0) {
    return promise;
  }

  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Summary update timed out after ${timeoutMs}ms`));
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

/** 构造摘要更新的 system/user 消息。 */
function buildSummaryMessages(input: SummaryUpdateInput, isRetry: boolean): ChatMessage[] {
  const currentSummary = input.currentSummary?.content.trim() ?? "";
  const messages = input.messagesToSummarize
    .map((message) => `${message.role}: ${message.content}`)
    .join("\n");
  const retryInstruction = isRetry
    ? "\n上一次输出不是合法 JSON 或不符合 schema。请只输出合法 JSON，不要添加解释。"
    : "";

  return [
    {
      role: "system",
      content: [
        "你是 AI Companion 的会话摘要更新器。",
        "",
        "你的任务是维护一段简洁、准确、持续更新的会话摘要，用于帮助 AI 在长对话中理解之前发生过什么。",
        "请根据【当前摘要】和【新增对话片段】生成新的摘要。",
        "",
        "要求：",
        "1. 保留对后续对话有帮助的信息。",
        "2. 保留用户正在做的事情、阶段进度、重要决定、情绪状态、关系变化。",
        "3. 不要记录无意义寒暄。",
        "4. 不要加入对话中没有出现的信息。",
        "5. 不要写成列表过长的流水账。",
        "6. 摘要应该自然、简洁，适合直接放进 Prompt。",
        "7. 如果新增片段没有长期上下文价值，可以保持原摘要不变。",
        "",
        '请只输出 JSON，格式为：{"content":"更新后的会话摘要","reason":"为什么这样更新"}',
        retryInstruction,
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `当前摘要：${currentSummary !== "" ? currentSummary : "（暂无）"}`,
        "",
        `新增对话片段：\n${messages}`,
      ].join("\n"),
    },
  ];
}

/** 解析摘要更新模型输出的 JSON。 */
function parseJsonObject(text: string): unknown {
  const trimmed = text.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");

    if (start < 0 || end <= start) {
      throw new Error("Summary update output is not JSON");
    }

    return JSON.parse(trimmed.slice(start, end + 1));
  }
}
