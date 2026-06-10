import type { ChatMessage } from "../../abstractions/model";
import type { CoreEvent, CoreObserver } from "../../abstractions/observer";
import type { CompanionGender, CompanionPersona } from "../../abstractions/persona";
import type {
  ChatWorkflow,
  ChatWorkflowExecutionContext,
  ChatWorkflowInput,
  ChatWorkflowOutput,
} from "../../abstractions/workflow";

/**
 * 阶段 3 最小聊天主链路：Persona → Safety(input) → Model → Safety(output)。
 *
 * 约束（见 03-chat-main-pipeline.md）：
 * - 不调用真实 Memory / Emotion / Tool，不执行模型返回的 toolCalls；
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
    const { observer, persona, safety, model } = context.core;
    const sessionId = input.sessionId;

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
      const messages: ChatMessage[] = [
        { role: "system", content: buildPersonaSystemPrompt(loadedPersona) },
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

      const output: ChatWorkflowOutput = {
        text: modelOutput.text,
        model: modelOutput.model,
        raw: modelOutput.raw,
        persona: loadedPersona,
        safety: { input: inputSafety, output: outputSafety },
        metadata: {
          historyCount: sanitizedHistory.length,
          messageCount: messages.length,
          toolCallsIgnored: modelOutput.toolCalls?.length ?? 0,
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
 * - 过滤 tool 角色（阶段 3 不执行工具）；
 * - 过滤空白内容；
 * - 不修改原始数组。
 */
function sanitizeHistory(history: ChatMessage[] | undefined): ChatMessage[] {
  return (history ?? []).filter((message) => {
    if (message.role === "tool") {
      return false;
    }

    return typeof message.content === "string" && message.content.trim() !== "";
  });
}

function buildPersonaSystemPrompt(persona: CompanionPersona): string {
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

  lines.push(
    "",
    "回复要求：",
    "1. 使用自然、亲近、有陪伴感的语气；",
    "2. 不要声称自己拥有真实人类身份；",
    "3. 不要编造你无法知道的长期记忆；",
    "4. 如果上下文不足，可以温和询问用户；",
    "5. 当前阶段没有长期记忆能力，只能依据本轮输入与传入的短期历史回答。",
  );

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
