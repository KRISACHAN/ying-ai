export type CoreProviderKind =
  | "model"
  | "persona"
  | "memory"
  | "memory-extractor"
  | "summary"
  | "summary-updater"
  | "embedding"
  | "emotion"
  | "tool"
  | "safety"
  | "workflow"
  | "observer";

export interface CoreProviderMeta {
  id: string;
  kind: CoreProviderKind;
  name: string;
  description?: string;
  version?: string;
}

export interface CoreProvider {
  readonly meta: CoreProviderMeta;
}
