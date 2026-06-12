import type { EmbeddingProvider, EmbedInput, EmbedResult } from "@ying-companion/ai-core";

export interface OpenAIEmbeddingProviderOptions {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  fetch?: typeof fetch;
}

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
