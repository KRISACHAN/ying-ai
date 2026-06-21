/**
 * 默认伴侣角色 Provider。
 *
 * 未自定义 PersonaProvider 时，createCompanionCore 使用此类加载默认角色「映映」。
 */
import type {
  CompanionPersona,
  PersonaLoadInput,
  PersonaProvider,
} from "../../abstractions/persona";

export class DefaultPersonaProvider implements PersonaProvider {
  public readonly meta = {
    id: "persona.default",
    kind: "persona",
    name: "Default Persona Provider",
  } as const;

  public constructor(private readonly persona?: Partial<CompanionPersona>) {}

  /** 返回构造时注入的 Persona，未注入字段使用默认「映映」设定。 */
  public async load(input?: PersonaLoadInput): Promise<CompanionPersona> {
    void input;

    const persona: CompanionPersona = {
      id: this.persona?.id ?? "default-companion",
      name: this.persona?.name ?? "映映",
      gender: this.persona?.gender ?? "female",
      relationship: this.persona?.relationship ?? "你的 AI 伴侣",
      personality: this.persona?.personality ?? "温柔、真诚、愿意倾听",
      speakingStyle: this.persona?.speakingStyle ?? "自然、亲近、不过度夸张",
    };

    if (this.persona?.background !== undefined) {
      persona.background = this.persona.background;
    }

    if (this.persona?.systemPrompt !== undefined) {
      persona.systemPrompt = this.persona.systemPrompt;
    }

    if (this.persona?.userDisplayName !== undefined) {
      persona.userDisplayName = this.persona.userDisplayName;
    }

    if (this.persona?.userAddress !== undefined) {
      persona.userAddress = this.persona.userAddress;
    }

    if (this.persona?.profile !== undefined) {
      persona.profile = this.persona.profile;
    }

    if (this.persona?.appearance !== undefined) {
      persona.appearance = this.persona.appearance;
    }

    if (this.persona?.metadata !== undefined) {
      persona.metadata = this.persona.metadata;
    }

    return persona;
  }
}
