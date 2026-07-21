import { google } from "@ai-sdk/google";
import { embed } from "ai";

// Model embeddingów. UWAGA: text-embedding-004 z W0/W2 nie jest już dostępny w tym
// API (404 dla embedContent), więc używamy aktualnego gemini-embedding-001 i wymuszamy
// 768 wymiarów (outputDimensionality) — zgodnie z kolumną vector(768) z W1.
export const EMBEDDING_MODEL = "gemini-embedding-001";
export const EMBEDDING_DIMENSIONS = 768;

export type EmbeddingTaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

/**
 * Generuje wektor znaczeniowy (768 liczb) dla tekstu.
 * taskType: RETRIEVAL_DOCUMENT dla zapisywanych fragmentów, RETRIEVAL_QUERY dla zapytań.
 */
export async function embedText(
  text: string,
  taskType: EmbeddingTaskType = "RETRIEVAL_DOCUMENT",
): Promise<number[]> {
  const { embedding } = await embed({
    model: google.textEmbedding(EMBEDDING_MODEL),
    value: text,
    providerOptions: {
      google: { outputDimensionality: EMBEDDING_DIMENSIONS, taskType },
    },
  });
  return embedding;
}
