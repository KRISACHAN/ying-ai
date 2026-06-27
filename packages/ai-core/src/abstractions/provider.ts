/**
 * Provider 体系的基础契约。
 *
 * 所有可插拔能力（Model、Memory、Workflow 等）都实现 CoreProvider，
 * 并通过稳定的 meta.id 标识实现类（不用 constructor.name，避免打包后类名被压缩）。
 */
/** Provider 在 Core 中的能力分类，用于 meta.kind 与 inspect() 展示。 */
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
  | "tool-planning"
  | "safety"
  | "workflow"
  | "observer";

/** 稳定标识一个 Provider 实现；id 在打包后仍可读，不依赖类名。 */
export interface CoreProviderMeta {
  /** 全局唯一实现 ID，如 `workflow.simple-chat`。 */
  id: string;
  kind: CoreProviderKind;
  name: string;
  description?: string;
  version?: string;
}

/** 所有可插拔能力的公共父接口。 */
export interface CoreProvider {
  readonly meta: CoreProviderMeta;
}
