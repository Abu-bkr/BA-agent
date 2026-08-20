import OpenAI from "openai";

export type EmbeddingProvider = (text: string) => Promise<number[]>;

export interface EmbeddingOptions {
  provider?: string;
  model?: string;
  client?: OpenAI;
}

export function createEmbeddingProvider(
  options: EmbeddingOptions = {},
): EmbeddingProvider {
  const provider = options.provider ?? process.env.MODEL_PROVIDER ?? "openai";

  if (provider !== "openai") {
    throw new Error(
      `Unsupported embedding provider "${provider}". Provide a custom provider function or configure MODEL_PROVIDER=openai.`,
    );
  }

  const client =
    options.client ??
    new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  const model = options.model ?? "text-embedding-3-small";

  return async (text: string) => {
    const response = await client.embeddings.create({
      model,
      input: text,
    });

    const embedding = response.data[0]?.embedding;
    if (!embedding) {
      throw new Error("The embedding provider returned no embedding.");
    }

    return embedding;
  };
}