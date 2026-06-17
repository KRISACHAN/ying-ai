/**
 * CompanionCore 的依赖注入上下文类型。
 *
 * CompanionCoreContext：工厂装配后的完整 Provider 集合。
 * ChatWorkflowCoreContext：Workflow 执行时可用的 Provider 子集（不含 workflow 自身，避免递归）。
 */
import type { EmotionEngine } from "./emotion";
import type { MemoryExtractor, MemoryProvider } from "./memory";
import type { ChatModel } from "./model";
import type { CoreObserver } from "./observer";
import type { PersonaProvider } from "./persona";
import type { SafetyProvider } from "./safety";
import type { SummaryProvider, SummaryUpdater } from "./summary";
import type { ToolRegistry } from "./tool";
import type { ChatWorkflow } from "./workflow";

/** createCompanionCore 装配后的完整 Provider 容器。 */
export interface CompanionCoreContext {
  model: ChatModel;
  persona: PersonaProvider;
  memory: MemoryProvider;
  memoryExtractor: MemoryExtractor;
  summary: SummaryProvider;
  summaryUpdater: SummaryUpdater;
  emotion: EmotionEngine;
  tools: ToolRegistry;
  safety: SafetyProvider;
  workflow: ChatWorkflow;
  observer: CoreObserver;
}

/** 只读 Provider 视图，CompanionCore.context 的类型。 */
export type CompanionCoreProviderView = Readonly<CompanionCoreContext>;

/** Workflow.execute 可用的 Provider 子集（不含 workflow，避免 execute 递归调用自身）。 */
export type ChatWorkflowCoreContext = Readonly<Omit<CompanionCoreContext, "workflow">>;
