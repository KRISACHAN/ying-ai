import type {
  StoryRenderInput,
  StoryRenderResult,
  StoryRenderer,
} from "../abstractions/story-renderer";

export type FakeStoryRendererHandler = (
  input: StoryRenderInput,
) => StoryRenderResult | Promise<StoryRenderResult>;

export class FakeStoryRenderer implements StoryRenderer {
  private readonly text: string | undefined;
  private readonly handler: FakeStoryRendererHandler | undefined;
  private readonly shouldThrow: boolean;

  constructor(
    input: { text?: string; handler?: FakeStoryRendererHandler; shouldThrow?: boolean } = {},
  ) {
    this.text = input.text;
    this.handler = input.handler;
    this.shouldThrow = input.shouldThrow ?? false;
  }

  async render(input: StoryRenderInput): Promise<StoryRenderResult> {
    if (this.shouldThrow) {
      throw new Error("FakeStoryRenderer configured failure");
    }
    if (this.handler) {
      return this.handler(input);
    }
    return {
      text:
        this.text ??
        `${input.definition.title}: ${input.plan.narrativeBeat.summary} (${input.nextState.currentSceneId})`,
    };
  }
}
