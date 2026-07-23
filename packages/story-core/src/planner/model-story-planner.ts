import type { ChatModel } from "@ying-companion/ai-core";
import type { StoryPlanner, StoryPlannerInput, StoryTurnPlan } from "../abstractions/story-planner";
import { storyTurnPlanSchema } from "./story-turn-plan-schema";

const STORY_PLANNER_SYSTEM_PROMPT = [
  "你是互动文字故事的规划器，只输出符合 StoryTurnPlan schema 的结构化数据，不写给玩家看的长篇正文。",
  "准确理解 userInput：它可能是玩家动作、对白、心理、环境描写或对其他角色行为的叙述。不要擅自改写成追问线索。",
  "状态变化必须由本轮输入和已有上下文直接支持；纯对话、观察或气氛描写可以没有 stateChanges。",
  "只能使用 Story Definition 中声明的 scene、character、item、clue、event、lore 和 attribute 标识。",
  "不要重复添加当前 state 已拥有的 item、clue、event 或 revealed lore，也不要写入只读属性。",
  "set_attr 必须遵守 scope、scopeRef、type、min、max 和 enumValues；没有合理变化时不要为了推进数值而修改属性。",
  "activeCharacterIds 只能包含当前场景允许且仍存活的角色；未在场角色不能参与行动或发言。",
  "triggeredEventIds 必须与本轮 add_event 变化一致；revealedLoreIds 只能包含本轮叙事确实要揭示的可用 lore。",
  "若玩家行动与世界规则冲突，使用 rejection，并令 interpretedAction.kind=rejected、stateChanges=[]。",
  "interpretedAction.raw 必须保留原始 userInput。",
  "必须返回且只返回这个 JSON 结构：",
  '{"interpretedAction":{"raw":"原文","summary":"动作概括","kind":"dialogue|investigate|travel|use_item|other|rejected"},"activeCharacterIds":["character-id"],"narrativeBeat":{"summary":"本轮节拍","tension":"low|medium|high"},"stateChanges":[],"triggeredEventIds":[],"revealedLoreIds":[],"responseGuidance":{"narratorFocus":"叙事焦点","emotionalTone":"情绪","mustInclude":[],"mustNotReveal":[]}}',
  "rejection 仅在拒绝行动时增加，结构为 {reason:string,inWorldGuidance:string}；非拒绝时不要输出 rejection。",
  "stateChanges 每项只能是以下一种：set_scene(sceneId)、set_character_alive(characterId,alive)、set_character_present(characterId,present)、add_inventory_item(itemId)、remove_inventory_item(itemId)、add_clue(clueId)、add_event(eventId)、add_revealed_lore(loreId)、set_relationship(characterId,value)、set_attr(key,scopeRef?,value)。每项还必须包含 type 字段。",
].join("\n");

export class ModelStoryPlanner implements StoryPlanner {
  constructor(private readonly model: ChatModel) {}

  async plan(input: StoryPlannerInput): Promise<StoryTurnPlan> {
    const result = await this.model.generate({
      messages: [
        { role: "system", content: STORY_PLANNER_SYSTEM_PROMPT },
        {
          role: "user",
          content: JSON.stringify({
            userInput: input.userInput,
            story: input.definition,
            currentState: input.state,
            narrativeSummary: input.summary?.text ?? null,
            recentMessages: (input.recentMessages ?? []).map((message) => ({
              role: message.role,
              content: message.content,
            })),
            recalledLore: input.recalledLore,
          }),
        },
      ],
      temperature: 0.2,
      maxTokens: 1800,
      structuredOutput: {
        type: "object",
        schema: storyTurnPlanSchema,
        name: "StoryTurnPlan",
        description: "受 Story Definition 和当前状态约束的单回合结构化剧情计划",
      },
    });

    const parsed = storyTurnPlanSchema.safeParse(result.structuredOutput);
    if (!parsed.success) {
      throw new Error(
        `ModelStoryPlanner failed to parse structured output: ${parsed.error.message}`,
      );
    }
    if (parsed.data.rejection && parsed.data.interpretedAction.kind !== "rejected") {
      throw new Error("ModelStoryPlanner rejection requires interpretedAction.kind=rejected");
    }
    if (parsed.data.rejection && parsed.data.stateChanges.length > 0) {
      throw new Error("ModelStoryPlanner rejection must not include stateChanges");
    }

    const currentScene = input.definition.scenes.find(
      (scene) => scene.id === input.state.currentSceneId,
    );
    const activeCharacterIds = [...new Set(parsed.data.activeCharacterIds)].filter(
      (characterId) =>
        currentScene?.availableCharacterIds.includes(characterId) === true &&
        input.state.characters[characterId]?.alive === true &&
        input.state.characters[characterId]?.present === true,
    );

    return {
      ...parsed.data,
      activeCharacterIds,
      interpretedAction: {
        ...parsed.data.interpretedAction,
        raw: input.userInput,
      },
    } as StoryTurnPlan;
  }
}
