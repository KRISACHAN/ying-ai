import type { ModelProfileOverride } from "../abstractions/model";

/**
 * 模型运行时配置类型。
 *
 * 由宿主读取环境变量后组装，传入 createModel()；ai-core 不直接读 env。
 */

/** 主模型与降级模型的重试策略。 */
export interface ModelRetryOptions {
  /** 主模型最大重试次数：0 = 只调一次，1 = 失败后再试一次。 */
  primaryMaxRetries?: number;
  /** 降级模型最大重试次数；仅配置了 fallbackModel 时生效。 */
  fallbackMaxRetries?: number;
}

/** OpenAI-compatible 模型的完整构造配置。 */
export interface OpenAICompatibleConfig {
  apiKey: string;
  baseUrl?: string;
  model: string;
  primaryProfileOverride?: ModelProfileOverride;
  fallbackModel?: string;
  fallbackProfileOverride?: ModelProfileOverride;
  retry?: ModelRetryOptions;
}
