import type { CoreProvider } from "./provider";

export type CompanionGender = "female" | "male" | "non_binary" | "unknown";

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

export interface PersonaProvider extends CoreProvider {
  load(input?: PersonaLoadInput): Promise<CompanionPersona>;
}
