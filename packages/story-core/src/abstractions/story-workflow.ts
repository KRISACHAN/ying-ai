import type { StoryWorkflowEvent } from "./story-event";
import type { RecalledLoreEntry } from "./lore-provider";
import type { StoryState } from "./story-state";
import type { StoryStateChange } from "./story-state-change";
import type { StoryTurnPlan } from "./story-planner";

export interface StoryWorkflowInput {
  sessionId: string;
  clientTurnId: string;
  userInput: string;
  now?: Date;
  signal?: AbortSignal;
}

export interface StoryWorkflowResult {
  sessionId: string;
  turnId: string;
  clientTurnId: string;
  assistantText: string;
  previousState: StoryState;
  nextState: StoryState;
  recalledLore: RecalledLoreEntry[];
  committed: true;
  summaryStatus: "updated" | "unchanged" | "failed";
  stateChanged: boolean;
  idempotentReplay: boolean;
  stateSnapshotStatus: "turn_snapshot" | "current_latest";
  events: StoryWorkflowEvent[];
  /** @deprecated Stage 01 compatibility. Use assistantText. */
  text: string;
  /** @deprecated Stage 01 compatibility. Use nextState. */
  state: StoryState;
  plan: StoryTurnPlan;
  recalledLoreIds: string[];
  appliedChanges: StoryStateChange[];
}

export interface StoryWorkflow {
  execute(input: StoryWorkflowInput): Promise<StoryWorkflowResult>;
  stream(input: StoryWorkflowInput): AsyncIterable<StoryWorkflowEvent>;
}
