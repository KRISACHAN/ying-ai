import type { ChatModel } from "@ying-companion/ai-core";
import type { StoryPlanner, StoryPlannerInput, StoryTurnPlan } from "../abstractions/story-planner";
import { storyTurnPlanSchema } from "./story-turn-plan-schema";

export class ModelStoryPlanner implements StoryPlanner {
  constructor(private readonly model: ChatModel) {}

  async plan(input: StoryPlannerInput): Promise<StoryTurnPlan> {
    const result = await this.model.generate({
      messages: [
        {
          role: "system",
          content:
            "You are a story planner. Return only structured StoryTurnPlan data. Do not write narrative prose.",
        },
        {
          role: "user",
          content: JSON.stringify({
            userInput: input.userInput,
            story: {
              id: input.definition.id,
              title: input.definition.title,
              scenes: input.definition.scenes,
              characters: input.definition.characters,
              items: input.definition.items,
              clues: input.definition.clues,
              events: input.definition.events,
              attributes: input.definition.attributes,
            },
            state: input.state,
            lore: input.recalledLore,
          }),
        },
      ],
      structuredOutput: {
        type: "object",
        schema: storyTurnPlanSchema,
        name: "StoryTurnPlan",
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

    return parsed.data as StoryTurnPlan;
  }
}
