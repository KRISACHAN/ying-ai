import type { ChatMessage } from "../../abstractions/model";
import {
  resolveMemoryScope,
  type ExtractedMemory,
  type MemoryRecord,
  type MemoryScope,
  type RecalledMemory,
} from "../../abstractions/memory";
import type { CoreEvent, CoreObserver } from "../../abstractions/observer";
import type { CompanionGender, CompanionPersona } from "../../abstractions/persona";
import type {
  ChatWorkflow,
  ChatWorkflowExecutionContext,
  ChatWorkflowInput,
  ChatWorkflowOutput,
} from "../../abstractions/workflow";
import { formatMemoriesForPrompt } from "../memory/prompt-formatter";

/**
 * 阶段 4 聊天主链路：Persona → Safety(input) → Memory(recall) → Model
 * → Safety(output) → Memory(extract/save)。
 *
 * 约束：
 * - Memory 失败不得打断主聊天链路；
 * - 不调用真实 Emotion / Tool，不执行模型返回的 toolCalls；
 * - 不保存 history，history 由宿主通过 ChatWorkflowInput.history 传入；
 * - 不读取环境变量、不写 console；
 * - Observer 事件失败不得打断主链路；
 * - Safety 拒绝统一抛错，不返回伪回复或未通过检查的模型文本。
 */
export class SimpleChatWorkflow implements ChatWorkflow {
  public readonly meta = {
    id: "workflow.simple-chat",
    kind: "workflow",
    name: "Simple Chat Workflow",
    description: "Minimal persona + safety + model chat workflow",
  } as const;

  public async execute(
    input: ChatWorkflowInput,
    context: ChatWorkflowExecutionContext,
  ): Promise<ChatWorkflowOutput> {
    const { observer, persona, safety, model, memory, memoryExtractor } = context.core;
    const sessionId = input.sessionId;
    const scope = resolveMemoryScope(input);

    await safeEmit(observer, {
      type: "workflow:start",
      timestamp: new Date(),
      payload: { sessionId },
    });

    try {
      if (typeof input.message !== "string" || input.message.trim() === "") {
        throw new Error("ChatWorkflowInput.message is required");
      }

      await safeEmit(observer, {
        type: "persona:load:start",
        timestamp: new Date(),
        payload: { sessionId },
      });
      const loadedPersona = await persona.load(sessionId !== undefined ? { sessionId } : undefined);
      await safeEmit(observer, {
        type: "persona:load:end",
        timestamp: new Date(),
        payload: { sessionId, personaId: loadedPersona.id },
      });

      await safeEmit(observer, {
        type: "safety:input:start",
        timestamp: new Date(),
        payload: { sessionId },
      });
      const inputSafety = await safety.guardInput({
        text: input.message,
        ...(sessionId !== undefined && { sessionId }),
      });
      await safeEmit(observer, {
        type: "safety:input:end",
        timestamp: new Date(),
        payload: { sessionId, allowed: inputSafety.allowed },
      });
      if (!inputSafety.allowed) {
        throw new Error("Input rejected by SafetyProvider");
      }

      const sanitizedHistory = sanitizeHistory(input.history);
      const recalledMemories = await recallMemories({
        observer,
        memory,
        scope,
        query: input.message,
        limit: input.memoryOptions?.limit ?? 5,
        minImportance: input.memoryOptions?.minImportance ?? 3,
        ...(sessionId !== undefined ? { sessionId } : {}),
      });
      const memoryContext = formatMemoriesForPrompt(recalledMemories);
      const messages: ChatMessage[] = [
        { role: "system", content: buildPersonaSystemPrompt(loadedPersona, memoryContext) },
        ...sanitizedHistory,
        { role: "user", content: input.message },
      ];

      await safeEmit(observer, {
        type: "workflow:step",
        timestamp: new Date(),
        payload: { step: "model:generate:start", sessionId, messageCount: messages.length },
      });
      const modelOutput = await model.generate({ messages });
      await safeEmit(observer, {
        type: "workflow:step",
        timestamp: new Date(),
        payload: {
          step: "model:generate:end",
          sessionId,
          model: modelOutput.model,
          runtime: modelOutput.runtime,
        },
      });

      await safeEmit(observer, {
        type: "safety:output:start",
        timestamp: new Date(),
        payload: { sessionId },
      });
      const outputSafety = await safety.guardOutput({
        text: modelOutput.text,
        ...(sessionId !== undefined && { sessionId }),
      });
      await safeEmit(observer, {
        type: "safety:output:end",
        timestamp: new Date(),
        payload: { sessionId, allowed: outputSafety.allowed },
      });
      if (!outputSafety.allowed) {
        throw new Error("Output rejected by SafetyProvider");
      }

      const memoryResult = await extractAndSaveMemories({
        observer,
        memory,
        memoryExtractor,
        scope,
        ...(sessionId !== undefined ? { sessionId } : {}),
        userMessage: input.message,
        assistantMessage: modelOutput.text,
        history: sanitizedHistory,
        ...(input.conversationId !== undefined ? { conversationId: input.conversationId } : {}),
        ...(input.messageIds !== undefined ? { messageIds: input.messageIds } : {}),
      });

      const output: ChatWorkflowOutput = {
        text: modelOutput.text,
        model: modelOutput.model,
        raw: modelOutput.raw,
        persona: loadedPersona,
        memories: recalledMemories,
        safety: { input: inputSafety, output: outputSafety },
        metadata: {
          historyCount: sanitizedHistory.length,
          messageCount: messages.length,
          toolCallsIgnored: modelOutput.toolCalls?.length ?? 0,
          extractedMemories: memoryResult.extracted,
          savedMemories: memoryResult.saved,
          skippedMemories: memoryResult.skipped,
        },
        modelOutput,
      };

      await safeEmit(observer, {
        type: "workflow:end",
        timestamp: new Date(),
        payload: { sessionId, model: modelOutput.model, textLength: output.text.length },
      });

      return output;
    } catch (error) {
      await safeEmit(observer, {
        type: "workflow:error",
        timestamp: new Date(),
        payload: { sessionId, message: toSafeMessage(error) },
      });
      throw error;
    }
  }
}

/**
 * Observer 不得打断主链路：同步异常与异步 rejection 都吞掉。
 */
async function safeEmit(observer: CoreObserver, event: CoreEvent): Promise<void> {
  try {
    await Promise.resolve(observer.emit(event));
  } catch {
    // observer must not break workflow
  }
}

/**
 * 轻量清洗宿主传入的短期历史：
 * - 只保留 system / user / assistant 角色（白名单，过滤 tool 及未知角色）；
 * - 过滤空白内容；
 * - 不修改原始数组。
 */
const ALLOWED_HISTORY_ROLES: ReadonlySet<ChatMessage["role"]> = new Set([
  "system",
  "user",
  "assistant",
]);

function sanitizeHistory(history: ChatMessage[] | undefined): ChatMessage[] {
  return (history ?? []).filter((message) => {
    if (!ALLOWED_HISTORY_ROLES.has(message.role)) {
      return false;
    }

    return typeof message.content === "string" && message.content.trim() !== "";
  });
}

function buildPersonaSystemPrompt(
  persona: CompanionPersona,
  memoryContext: string | undefined,
): string {
  const lines: string[] = [
    "你是一个 AI 伴侣角色，请始终以该角色身份与用户对话。",
    "",
    `角色名称：${persona.name}`,
    `性别：${formatGender(persona.gender)}`,
  ];

  if (persona.relationship) {
    lines.push(`关系：${persona.relationship}`);
  }
  if (persona.personality) {
    lines.push(`性格：${persona.personality}`);
  }
  if (persona.speakingStyle) {
    lines.push(`说话风格：${persona.speakingStyle}`);
  }
  if (persona.background) {
    lines.push(`背景：${persona.background}`);
  }

  if (persona.systemPrompt) {
    lines.push("", "额外角色指令：", persona.systemPrompt);
  }

  if (memoryContext !== undefined) {
    lines.push("", memoryContext);
  }

  lines.push(
    "",
    "回复要求：",
    "1. 使用自然、亲近、有陪伴感的语气；",
    "2. 不要声称自己拥有真实人类身份；",
    "3. 不要编造你无法知道的长期记忆；",
    "4. 如果上下文不足，可以温和询问用户；",
  );

  if (memoryContext === undefined) {
    lines.push("5. 只能依据本轮输入与传入的短期历史回答。");
  } else {
    lines.push("5. 可以自然参考长期上下文，但不要暴露长期记忆系统。");
  }

  return lines.join("\n");
}

function formatGender(gender: CompanionGender): string {
  switch (gender) {
    case "female":
      return "女性";
    case "male":
      return "男性";
    case "non_binary":
      return "非二元";
    default:
      return "未指定";
  }
}

/**
 * 只暴露安全的错误摘要，不透传底层错误对象。
 */
function toSafeMessage(error: unknown): string {
  return error instanceof Error ? error.message : "SimpleChatWorkflow execution failed";
}

interface RecallMemoriesOptions {
  observer: CoreObserver;
  memory: ChatWorkflowExecutionContext["core"]["memory"];
  scope: MemoryScope;
  query: string;
  limit: number;
  minImportance: 1 | 2 | 3 | 4 | 5;
  sessionId?: string;
}

async function recallMemories(options: RecallMemoriesOptions): Promise<RecalledMemory[]> {
  await safeEmit(options.observer, {
    type: "memory:recall:start",
    timestamp: new Date(),
    payload: {
      sessionId: options.sessionId,
      scope: options.scope,
      query: options.query,
      limit: options.limit,
      minImportance: options.minImportance,
    },
  });

  try {
    const result = await options.memory.recall({
      scope: options.scope,
      query: options.query,
      limit: options.limit,
      minImportance: options.minImportance,
    });

    await safeEmit(options.observer, {
      type: "memory:recall:end",
      timestamp: new Date(),
      payload: {
        ok: true,
        query: options.query,
        count: result.memories.length,
        memories: result.memories.map(toMemoryDebugPayload),
      },
    });

    return result.memories;
  } catch (error) {
    await safeEmit(options.observer, {
      type: "memory:recall:end",
      timestamp: new Date(),
      payload: { ok: false, message: toSafeMessage(error) },
    });

    return [];
  }
}

interface ExtractAndSaveOptions {
  observer: CoreObserver;
  memory: ChatWorkflowExecutionContext["core"]["memory"];
  memoryExtractor: ChatWorkflowExecutionContext["core"]["memoryExtractor"];
  scope: MemoryScope;
  sessionId?: string;
  userMessage: string;
  assistantMessage: string;
  history: ChatMessage[];
  conversationId?: string;
  messageIds?: string[];
}

interface ExtractAndSaveResult {
  extracted: ExtractedMemory[];
  saved: MemoryRecord[];
  skipped: ExtractedMemory[];
}

async function extractAndSaveMemories(
  options: ExtractAndSaveOptions,
): Promise<ExtractAndSaveResult> {
  await safeEmit(options.observer, {
    type: "memory:extract:start",
    timestamp: new Date(),
    payload: { sessionId: options.sessionId, scope: options.scope },
  });

  let extracted: ExtractedMemory[] = [];

  try {
    const result = await options.memoryExtractor.extract({
      scope: options.scope,
      userMessage: options.userMessage,
      assistantMessage: options.assistantMessage,
      history: options.history.slice(-6),
    });
    extracted = result.memories;

    await safeEmit(options.observer, {
      type: "memory:extract:end",
      timestamp: new Date(),
      payload: { ok: true, count: extracted.length, memories: extracted },
    });
  } catch (error) {
    await safeEmit(options.observer, {
      type: "memory:extract:end",
      timestamp: new Date(),
      payload: { ok: false, message: toSafeMessage(error) },
    });

    return { extracted: [], saved: [], skipped: [] };
  }

  const memoriesToSave = extracted.filter((memory) => memory.importance >= 3);
  const preSaveSkipped = extracted.filter((memory) => memory.importance < 3);

  await safeEmit(options.observer, {
    type: "memory:save:start",
    timestamp: new Date(),
    payload: {
      sessionId: options.sessionId,
      scope: options.scope,
      count: memoriesToSave.length,
    },
  });

  try {
    const saveResult = await options.memory.save({
      scope: options.scope,
      memories: memoriesToSave,
      source: {
        ...(options.conversationId !== undefined ? { conversationId: options.conversationId } : {}),
        ...(options.messageIds !== undefined ? { messageIds: options.messageIds } : {}),
      },
    });
    const skipped = [...preSaveSkipped, ...(saveResult.skipped ?? [])];

    await safeEmit(options.observer, {
      type: "memory:save:end",
      timestamp: new Date(),
      payload: {
        ok: true,
        savedCount: saveResult.saved.length,
        skippedCount: skipped.length,
        saved: saveResult.saved.map(toMemoryDebugPayload),
      },
    });

    return { extracted, saved: saveResult.saved, skipped };
  } catch (error) {
    await safeEmit(options.observer, {
      type: "memory:save:end",
      timestamp: new Date(),
      payload: { ok: false, message: toSafeMessage(error) },
    });

    return { extracted, saved: [], skipped: preSaveSkipped };
  }
}

function toMemoryDebugPayload(memory: RecalledMemory | MemoryRecord): Record<string, unknown> {
  return {
    id: memory.id,
    type: memory.type,
    content: memory.content,
    importance: memory.importance,
    ...("score" in memory && memory.score !== undefined ? { score: memory.score } : {}),
  };
}
