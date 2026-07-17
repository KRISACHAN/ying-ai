import type { StoryDefinition } from "./story-definition";
import type { StoryState } from "./story-state";
import type { StoryStateChange } from "./story-state-change";

export interface StoryStateValidationError {
  code: string;
  message: string;
  path?: string;
}

export type StateTransitionValidationResult =
  | { valid: true; changes: StoryStateChange[] }
  | { valid: false; errors: StoryStateValidationError[] };

export interface StateTransitionValidator {
  validate(input: {
    definition: StoryDefinition;
    currentState: StoryState;
    changes: StoryStateChange[];
  }): Promise<StateTransitionValidationResult>;
}
