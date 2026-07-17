import type { StoryPlanner, StoryPlannerInput, StoryTurnPlan } from "../abstractions/story-planner";

export type FakeStoryPlannerHandler = (
  input: StoryPlannerInput,
) => StoryTurnPlan | Promise<StoryTurnPlan>;

export class FakeStoryPlanner implements StoryPlanner {
  private readonly plans: StoryTurnPlan[];
  private readonly handler: FakeStoryPlannerHandler | undefined;
  private index = 0;

  constructor(input: { plans?: StoryTurnPlan[]; handler?: FakeStoryPlannerHandler } = {}) {
    this.plans = input.plans ?? [];
    this.handler = input.handler;
  }

  async plan(input: StoryPlannerInput): Promise<StoryTurnPlan> {
    if (this.handler) {
      return this.handler(input);
    }

    const plan = this.plans[this.index];
    if (!plan) {
      return createNoopTurnPlan(input.userInput);
    }
    this.index += 1;
    return plan;
  }
}

export function createNoopTurnPlan(userInput: string): StoryTurnPlan {
  return {
    interpretedAction: {
      raw: userInput,
      summary: userInput,
      kind: "other",
    },
    activeCharacterIds: [],
    narrativeBeat: {
      summary: "The story acknowledges the action without changing state.",
      tension: "low",
    },
    stateChanges: [],
    triggeredEventIds: [],
    revealedLoreIds: [],
    responseGuidance: {
      narratorFocus: "Keep the scene grounded in the current state.",
      emotionalTone: "restrained",
      mustInclude: [],
      mustNotReveal: [],
    },
  };
}
