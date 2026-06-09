import type { EmotionEngine } from "./emotion";
import type { MemoryProvider } from "./memory";
import type { ChatModel } from "./model";
import type { CoreObserver } from "./observer";
import type { PersonaProvider } from "./persona";
import type { SafetyProvider } from "./safety";
import type { ToolRegistry } from "./tool";
import type { ChatWorkflow } from "./workflow";

export interface CompanionCoreContext {
  model: ChatModel;
  persona: PersonaProvider;
  memory: MemoryProvider;
  emotion: EmotionEngine;
  tools: ToolRegistry;
  safety: SafetyProvider;
  workflow: ChatWorkflow;
  observer: CoreObserver;
}

export type CompanionCoreProviderView = Readonly<CompanionCoreContext>;

export type ChatWorkflowCoreContext = Readonly<Omit<CompanionCoreContext, "workflow">>;
