import type { ChatModel, GenerateInput } from "@ying-ai/ai-core";
import type {
  StoryRenderInput,
  StoryRenderResult,
  StoryRenderer,
} from "../abstractions/story-renderer";

const STORY_RENDERER_SYSTEM_PROMPT = [
  "你是互动文字故事的叙事者。根据玩家本轮输入、上下文和已通过校验的 StoryTurnPlan 续写故事正文。",
  "回应玩家实际做了什么，不要把任意输入改写成预设调查行动，也不要复述调试信息。",
  "延续 recentMessages 的动作、对白、人物态度和叙事视角；没有状态变化也应给出自然、有推进感的角色反应或环境反馈。",
  "只能叙述 validated plan 和 nextState 支持的确定性变化，不得发明物品、线索、事件、死亡、角色在场或场景切换。",
  "不得泄露 mustNotReveal、planner_only lore、角色私密背景或未揭示秘密。",
  "尊重玩家行动权，不替玩家决定额外对白、思想或重大行动。",
  "遵循 Story Definition 的文风、视角、篇幅和角色说话方式。输出故事正文，不输出标题、JSON、状态列表或解释。",
].join("\n");

export class ModelStoryRenderer implements StoryRenderer {
  constructor(private readonly model: ChatModel) {}

  async render(input: StoryRenderInput): Promise<StoryRenderResult> {
    const result = await this.model.generate(createRenderRequest(input));
    const text = requireNarrativeText(result.text);
    return { text };
  }

  async *stream(input: StoryRenderInput): AsyncIterable<string> {
    const supportsStreaming = [this.model.primaryProfile, this.model.fallbackProfile]
      .filter((profile) => profile !== undefined)
      .some((profile) => profile.capabilities.streaming);

    if (!supportsStreaming) {
      yield (await this.render(input)).text;
      return;
    }

    let text = "";
    for await (const chunk of this.model.stream(createRenderRequest(input))) {
      if (chunk.text === "") {
        continue;
      }
      text += chunk.text;
      yield chunk.text;
    }
    requireNarrativeText(text);
  }
}

function createRenderRequest(input: StoryRenderInput): GenerateInput {
  const currentScene = input.definition.scenes.find(
    (scene) => scene.id === input.nextState.currentSceneId,
  );
  const visibleCharacters = input.definition.characters
    .filter((character) => input.plan.activeCharacterIds.includes(character.id))
    .map((character) => ({
      id: character.id,
      name: character.name,
      description: character.description,
      personality: character.personality,
      speakingStyle: character.speakingStyle,
      publicBackground: character.publicBackground,
      narrativeRole: character.narrativeRole,
    }));

  return {
    messages: [
      { role: "system", content: STORY_RENDERER_SYSTEM_PROMPT },
      {
        role: "user",
        content: JSON.stringify({
          userInput: input.userInput,
          story: {
            title: input.definition.title,
            premise: input.definition.premise,
            genre: input.definition.genre,
            tone: input.definition.tone,
            writingStyle: input.definition.writingStyle,
            playerRole: input.definition.playerRole,
            narrativeRules: input.definition.narrativeRules,
          },
          currentScene,
          visibleCharacters,
          narrativeSummary: input.summary?.text ?? null,
          recentMessages: (input.recentMessages ?? []).map((message) => ({
            role: message.role,
            content: message.content,
          })),
          currentState: input.currentState,
          nextState: input.nextState,
          validatedPlan: input.plan,
          visibleLore: input.recalledLore.map((entry) => ({
            id: entry.entry.id,
            title: entry.entry.title,
            content: entry.entry.content,
          })),
        }),
      },
    ],
    temperature: 0.8,
    maxTokens: 1400,
  };
}

function requireNarrativeText(value: string): string {
  if (value.trim() === "") {
    throw new Error("ModelStoryRenderer returned empty narrative text");
  }
  return value;
}
