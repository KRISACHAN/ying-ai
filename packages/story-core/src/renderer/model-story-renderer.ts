import type { ChatModel } from "@ying-companion/ai-core";
import type {
  StoryRenderInput,
  StoryRenderResult,
  StoryRenderer,
} from "../abstractions/story-renderer";

export class ModelStoryRenderer implements StoryRenderer {
  constructor(private readonly model: ChatModel) {}

  async render(input: StoryRenderInput): Promise<StoryRenderResult> {
    const result = await this.model.generate({
      messages: [
        {
          role: "system",
          content: [
            "You are a story renderer.",
            "Render narrative text only from the validated StoryTurnPlan and nextState.",
            "Do not invent items, clues, events, deaths, scene changes, or state changes.",
            "Do not reveal mustNotReveal entries.",
          ].join("\n"),
        },
        {
          role: "user",
          content: JSON.stringify({
            userInput: input.userInput,
            story: {
              title: input.definition.title,
              premise: input.definition.premise,
              rules: input.definition.narrativeRules,
            },
            currentState: input.currentState,
            nextState: input.nextState,
            plan: input.plan,
            lore: input.recalledLore,
          }),
        },
      ],
    });

    return { text: result.text };
  }
}
