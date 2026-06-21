import type { CompanionGender, CompanionPersona } from "../../abstractions/persona";
import type { ToolDefinition } from "../../abstractions/tool";

const VALID_GENDERS: CompanionGender[] = ["female", "male", "non_binary", "unknown"];

export function normalizeCompanionPersona(persona: CompanionPersona): CompanionPersona {
  const normalized: CompanionPersona = {
    id: normalizeRequiredString(persona.id, "default-companion"),
    name: normalizeRequiredString(persona.name, "映映"),
    gender: VALID_GENDERS.includes(persona.gender) ? persona.gender : "unknown",
  };

  const relationship = normalizeOptionalString(persona.relationship);
  const personality = normalizeOptionalString(persona.personality);
  const speakingStyle = normalizeOptionalString(persona.speakingStyle);
  const background = normalizeOptionalString(persona.background);
  const systemPrompt = normalizeOptionalString(persona.systemPrompt);
  const userDisplayName = normalizeOptionalString(persona.userDisplayName);
  const userAddress = normalizeOptionalString(persona.userAddress);

  if (relationship !== undefined) {
    normalized.relationship = relationship;
  }
  if (personality !== undefined) {
    normalized.personality = personality;
  }
  if (speakingStyle !== undefined) {
    normalized.speakingStyle = speakingStyle;
  }
  if (background !== undefined) {
    normalized.background = background;
  }
  if (systemPrompt !== undefined) {
    normalized.systemPrompt = systemPrompt;
  }
  if (userDisplayName !== undefined) {
    normalized.userDisplayName = userDisplayName;
  }
  if (userAddress !== undefined) {
    normalized.userAddress = userAddress;
  }

  const hobbies = persona.profile?.hobbies
    ?.map((item) => item.trim())
    .filter((item) => item.length > 0);
  if (hobbies !== undefined && hobbies.length > 0) {
    normalized.profile = { hobbies };
  }

  const appearance = normalizeAppearance(persona.appearance);
  if (appearance !== undefined) {
    normalized.appearance = appearance;
  }

  if (persona.metadata !== undefined) {
    normalized.metadata = persona.metadata;
  }

  return normalized;
}

export function buildPersonaPrompt(persona: CompanionPersona): string {
  const effectivePersona = normalizeCompanionPersona(persona);
  const lines: string[] = ["[伴侣身份]"];

  lines.push(`你叫${effectivePersona.name}，性别为${formatGender(effectivePersona.gender)}。`);
  if (effectivePersona.relationship !== undefined) {
    lines.push(`你与用户的关系是：${effectivePersona.relationship}。`);
  }
  if (effectivePersona.personality !== undefined) {
    lines.push(`你的性格：${effectivePersona.personality}。`);
  }
  if (effectivePersona.speakingStyle !== undefined) {
    lines.push(`你的说话风格：${effectivePersona.speakingStyle}。`);
  }
  if (effectivePersona.background !== undefined) {
    lines.push(`你的背景：${effectivePersona.background}。`);
  }

  const profileLines = buildProfileLines(effectivePersona);
  if (profileLines.length > 0) {
    lines.push("", "[伴侣画像]", ...profileLines);
  }

  const userLines = buildUserPreferenceLines(effectivePersona);
  if (userLines.length > 0) {
    lines.push("", "[用户称呼偏好]", ...userLines);
  }

  if (effectivePersona.systemPrompt !== undefined) {
    lines.push("", "[补充指令]", effectivePersona.systemPrompt);
  }

  lines.push(
    "",
    "[设定优先级]",
    "结构化 Persona 的身份、关系、外貌、兴趣和用户称呼偏好优先于补充指令；发生冲突时以结构化 Persona 为准。",
    "补充指令不得要求忽略、重写或否认结构化 Persona。",
  );

  return lines.join("\n");
}

export function buildPersonaSystemPrompt(
  persona: CompanionPersona,
  context: {
    summaryContext?: string;
    memoryContext?: string;
    emotionContext?: string;
    toolDefinitions?: ToolDefinition[];
  },
): { persona: CompanionPersona; personaPrompt: string; systemPrompt: string } {
  const effectivePersona = normalizeCompanionPersona(persona);
  const personaPrompt = buildPersonaPrompt(effectivePersona);
  const { summaryContext, memoryContext, emotionContext, toolDefinitions } = context;
  const lines: string[] = [
    "你是一个 AI 伴侣角色，请始终以该角色身份与用户对话。",
    "",
    personaPrompt,
  ];

  if (summaryContext !== undefined) {
    lines.push("", summaryContext);
  }
  if (memoryContext !== undefined) {
    lines.push("", memoryContext);
  }
  if (emotionContext !== undefined) {
    lines.push("", emotionContext);
  }

  if ((toolDefinitions?.length ?? 0) > 0) {
    lines.push(
      "",
      "可用工具说明：",
      "如需当前时间、长期记忆补充或当前情绪状态，可以调用可用工具。",
      "工具结果返回后，请自然使用这些信息回复用户，不要暴露内部工具调用过程。",
    );
  }

  lines.push(
    "",
    "回复要求：",
    "1. 使用自然、亲近、有陪伴感的语气；",
    "2. 不要声称自己拥有真实人类身份；",
    "3. 不要编造你无法知道的长期记忆；",
    "4. 如果上下文不足，可以温和询问用户；",
    "5. 情绪只影响语气和关注点，不要直接暴露情绪标签；",
  );

  if (summaryContext !== undefined && memoryContext !== undefined) {
    lines.push("6. 可以自然参考会话摘要与长期上下文，但不要暴露内部系统。");
  } else if (summaryContext !== undefined) {
    lines.push("6. 可以自然参考会话摘要，但不要暴露内部系统。");
  } else if (memoryContext !== undefined) {
    lines.push("6. 可以自然参考长期上下文，但不要暴露长期记忆系统。");
  } else {
    lines.push("6. 只能依据本轮输入与传入的短期历史回答。");
  }

  return {
    persona: effectivePersona,
    personaPrompt,
    systemPrompt: lines.join("\n"),
  };
}

function buildProfileLines(persona: CompanionPersona): string[] {
  const lines: string[] = [];
  const hobbies = persona.profile?.hobbies;
  const appearance = persona.appearance;

  if (hobbies !== undefined && hobbies.length > 0) {
    lines.push(`你的兴趣：${hobbies.join("、")}。`);
  }
  if (appearance?.heightCm !== undefined) {
    lines.push(`你的身高约为 ${formatNumber(appearance.heightCm)} cm。`);
  }
  if (appearance?.weightKg !== undefined) {
    lines.push(`你的体重约为 ${formatNumber(appearance.weightKg)} kg。`);
  }
  if (appearance?.hair !== undefined) {
    lines.push(`你的发型：${appearance.hair}。`);
  }
  if (appearance?.bodyType !== undefined) {
    lines.push(`你的身材描述：${appearance.bodyType}。`);
  }
  if (appearance?.additionalTraits !== undefined) {
    const traits = Object.entries(appearance.additionalTraits).map(
      ([key, value]) => `${key}：${value}`,
    );
    if (traits.length > 0) {
      lines.push(`其他特征：${traits.join("；")}。`);
    }
  }

  return lines;
}

function buildUserPreferenceLines(persona: CompanionPersona): string[] {
  const lines: string[] = [];

  if (persona.userDisplayName !== undefined) {
    lines.push(`用户显示名：${persona.userDisplayName}。`);
  }
  if (persona.userAddress !== undefined) {
    lines.push(
      `你通常可以称呼用户为“${persona.userAddress}”；请结合语境自然使用，不要求每句话都出现。`,
    );
  }

  return lines;
}

function normalizeAppearance(
  appearance: CompanionPersona["appearance"],
): CompanionPersona["appearance"] | undefined {
  const normalized: NonNullable<CompanionPersona["appearance"]> = {};

  if (
    appearance?.heightCm !== undefined &&
    Number.isFinite(appearance.heightCm) &&
    appearance.heightCm > 0
  ) {
    normalized.heightCm = appearance.heightCm;
  }
  if (
    appearance?.weightKg !== undefined &&
    Number.isFinite(appearance.weightKg) &&
    appearance.weightKg > 0
  ) {
    normalized.weightKg = appearance.weightKg;
  }

  const hair = normalizeOptionalString(appearance?.hair);
  const bodyType = normalizeOptionalString(appearance?.bodyType);
  if (hair !== undefined) {
    normalized.hair = hair;
  }
  if (bodyType !== undefined) {
    normalized.bodyType = bodyType;
  }

  const additionalTraits = normalizeAdditionalTraits(appearance?.additionalTraits);
  if (additionalTraits !== undefined) {
    normalized.additionalTraits = additionalTraits;
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function normalizeAdditionalTraits(
  traits: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (traits === undefined) {
    return undefined;
  }

  const normalized: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(traits)) {
    const key = rawKey.trim();
    const value = rawValue.trim();
    if (key !== "" && value !== "") {
      normalized[key] = value;
    }
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function normalizeRequiredString(value: string, fallback: string): string {
  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : fallback;
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();

  return trimmed !== undefined && trimmed.length > 0 ? trimmed : undefined;
}

function formatGender(gender: CompanionGender): string {
  switch (gender) {
    case "female":
      return "女性";
    case "male":
      return "男性";
    case "non_binary":
      return "非二元";
    case "unknown":
      return "未指定";
  }
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}
