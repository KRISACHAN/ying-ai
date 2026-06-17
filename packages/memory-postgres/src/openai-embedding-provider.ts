/**
 * OpenAI-compatible Embedding 实现。
 *
 * 调用 POST /v1/embeddings 将文本转为浮点向量，供 PostgresMemoryProvider 做 recall/save。
 * 配置由宿主传入，本类不读取环境变量；默认模型 text-embedding-3-small（1536 维）。
 */
import type { EmbeddingProvider, EmbedInput, EmbedResult } from "@ying-companion/ai-core";

/** OpenAIEmbeddingProvider 构造参数；fetch 可注入以便测试。 */
export interface OpenAIEmbeddingProviderOptions {
  apiKey: string;
  /** 默认 https://api.openai.com/v1 */
  baseUrl?: string;
  /** 默认 text-embedding-3-small（1536 维，须与表 vector(N) 一致） */
  model?: string;
  fetch?: typeof fetch;
}

/** OpenAI-compatible Embedding API 适配器；供 PostgresMemoryProvider 内部调用。 */
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  public readonly meta = {
    id: "embedding.openai-compatible",
    kind: "embedding",
    name: "OpenAI-Compatible Embedding Provider",
    description: "Embeds text through an OpenAI-compatible embeddings endpoint",
    version: "1.0.0",
  } as const;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;

  public constructor(options: OpenAIEmbeddingProviderOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? "https://api.openai.com/v1";
    this.model = options.model ?? "text-embedding-3-small";
    this.fetchImpl = options.fetch ?? fetch;
  }

  /** 将单段文本嵌入为向量；响应校验失败或 HTTP 非 2xx 时抛错。 */
  public async embed(input: EmbedInput): Promise<EmbedResult> {
    const response = await this.fetchImpl(`${this.baseUrl.replace(/\/$/, "")}/embeddings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        input: input.text,
      }),
    });

    if (!response.ok) {
      throw new Error(`Embedding request failed with status ${response.status}`);
    }

    const body = (await response.json()) as {
      data?: Array<{ embedding?: unknown }>;
      model?: string;
    };
    const vector = body.data?.[0]?.embedding;

    if (!Array.isArray(vector) || !vector.every((value) => typeof value === "number")) {
      throw new Error("Embedding response did not include a numeric vector");
    }

    return { vector, model: body.model ?? this.model };
  }
}
