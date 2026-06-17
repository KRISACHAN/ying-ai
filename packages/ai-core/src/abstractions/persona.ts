/**
 * 伴侣角色（Persona）抽象。
 *
 * PersonaProvider 负责加载角色设定（名称、性别、性格、说话风格等），
 * 由 Workflow 拼入 system prompt，驱动 AI 以「伴侣」身份回复。
 */
import type { CoreProvider } from "./provider";

export type CompanionGender = "female" | "male" | "non_binary" | "unknown";

/** 伴侣角色完整设定，由 PersonaProvider.load 返回。 */
export interface CompanionPersona {
  id: string;
  name: string;
  gender: CompanionGender;
  relationship?: string;
  personality?: string;
  speakingStyle?: string;
  background?: string;
  systemPrompt?: string;
  metadata?: Record<string, unknown>;
}

export interface PersonaLoadInput {
  sessionId?: string;
  personaId?: string;
  metadata?: Record<string, unknown>;
}

/** 加载伴侣角色设定。 */
export interface PersonaProvider extends CoreProvider {
  load(input?: PersonaLoadInput): Promise<CompanionPersona>;
}
