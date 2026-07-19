export type StoryWorkflowErrorCode =
  | "STORY_SESSION_NOT_FOUND"
  | "STORY_DEFINITION_INVALID"
  | "STORY_STATE_INVALID"
  | "STORY_STATE_CONFLICT"
  | "STORY_INPUT_REJECTED"
  | "STORY_PLANNING_FAILED"
  | "STORY_PLAN_INVALID"
  | "STORY_STATE_CHANGE_REJECTED"
  | "STORY_RENDER_FAILED"
  | "STORY_OUTPUT_REJECTED"
  | "STORY_PERSIST_FAILED"
  | "STORY_SUMMARY_FAILED"
  | "STORY_ABORTED";

export class StoryWorkflowError extends Error {
  readonly code: StoryWorkflowErrorCode;
  readonly cause: unknown;

  constructor(code: StoryWorkflowErrorCode, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "StoryWorkflowError";
    this.code = code;
    this.cause = options?.cause;
  }
}
