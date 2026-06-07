export interface ModelRetryOptions {
  /**
   * 主模型最大重试次数。0 表示只调用一次，1 表示失败后再重试一次。
   */
  primaryMaxRetries?: number;

  /**
   * 降级模型最大重试次数。仅在配置 fallbackModel 后生效。
   */
  fallbackMaxRetries?: number;
}

export interface OpenAICompatibleConfig {
  apiKey: string;
  baseUrl?: string;
  model: string;
  fallbackModel?: string;
  retry?: ModelRetryOptions;
}
