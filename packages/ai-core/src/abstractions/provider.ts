export type CoreProviderKind =
  | "model"
  | "persona"
  | "memory"
  | "memory-extractor"
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
