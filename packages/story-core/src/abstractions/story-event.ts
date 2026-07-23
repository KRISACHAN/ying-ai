import type { RecalledLoreEntry } from "./lore-provider";
import type { StoryTurnPlan } from "./story-planner";
import type { StoryStateChange } from "./story-state-change";

export type StoryWorkflowEvent =
  | StoryStartEvent
  | StorySessionLoadedEvent
  | StoryStateLoadedEvent
  | StorySummaryLoadedEvent
  | StoryLoreRecalledEvent
  | StoryContextReadyEvent
  | StoryPlanStartedEvent
  | StoryPlanCompletedEvent
  | StoryValidationFailedEvent
  | StoryStatePreparedEvent
  | StoryRenderStartedEvent
  | StoryTextDeltaEvent
  | StoryRenderCompletedEvent
  | StoryCommittedEvent
  | StorySummaryUpdatedEvent
  | StoryFinishEvent
  | StoryErrorEvent;

export interface StoryEventBase {
  type: string;
  runId: string;
  sessionId: string;
  clientTurnId: string;
  sequence: number;
  occurredAt: Date;
}

export interface StoryStartEvent extends StoryEventBase {
  type: "story:start";
}

export interface StorySessionLoadedEvent extends StoryEventBase {
  type: "story:session-loaded";
  storyId: string;
  definitionVersion: string;
}

export interface StoryStateLoadedEvent extends StoryEventBase {
  type: "story:state-loaded";
  revision: number;
}

export interface StorySummaryLoadedEvent extends StoryEventBase {
  type: "story:summary-loaded";
  summaryPresent: boolean;
}

export interface StoryLoreRecalledEvent extends StoryEventBase {
  type: "story:lore-recalled";
  recalledLore: RecalledLoreEntry[];
}

export interface StoryContextReadyEvent extends StoryEventBase {
  type: "story:context-ready";
  summaryPresent: boolean;
  recentMessageCount: number;
  recalledLoreIds: string[];
}

export interface StoryPlanStartedEvent extends StoryEventBase {
  type: "story:plan-started";
}

export interface StoryPlanCompletedEvent extends StoryEventBase {
  type: "story:plan-completed";
  plan: StoryTurnPlan;
}

export interface StoryValidationFailedEvent extends StoryEventBase {
  type: "story:validation-failed";
  errors: Array<{ code: string; message: string; path?: string }>;
}

export interface StoryStatePreparedEvent extends StoryEventBase {
  type: "story:state-prepared";
  previousRevision: number;
  nextRevision: number;
  stateChanged: boolean;
  appliedChanges: StoryStateChange[];
}

export interface StoryRenderStartedEvent extends StoryEventBase {
  type: "story:render-started";
}

export interface StoryTextDeltaEvent extends StoryEventBase {
  type: "story:text-delta";
  delta: string;
}

export interface StoryRenderCompletedEvent extends StoryEventBase {
  type: "story:render-completed";
  assistantText: string;
}

export interface StoryCommittedEvent extends StoryEventBase {
  type: "story:committed";
  turnId: string;
  turnNumber: number;
  stateRevision: number;
  idempotentReplay: boolean;
  assistantText?: string;
}

export interface StorySummaryUpdatedEvent extends StoryEventBase {
  type: "story:summary-updated";
  status: "updated" | "unchanged" | "failed";
}

export interface StoryFinishEvent extends StoryEventBase {
  type: "story:finish";
}

export interface StoryErrorEvent extends StoryEventBase {
  type: "story:error";
  code: string;
  error: unknown;
}

export interface StoryObserver {
  onStoryEvent(event: StoryWorkflowEvent): void | Promise<void>;
}
