import type { EmbeddingResult } from "../types.js";
import { config } from "../config.js";
import { logger } from "../logger.js";

const {
  host: OLLAMA_HOST,
  embeddingModel: EMBEDDING_MODEL,
  batchSize: BATCH_SIZE,
  batchDelayMs: BATCH_DELAY_MS,
} = config.ollama;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function generateEmbedding(text: string): Promise<EmbeddingResult> {
  const response = await fetch(`${OLLAMA_HOST}/api/embed`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text,
    }),
  });

  if (!response.ok) {
    // Log detailed error internally but return sanitized message
    const errorText = await response.text();
    logger.error("Ollama embedding failed", undefined, {
      status: response.status,
      details: errorText,
    });
    throw new Error("Failed to generate embedding. Please try again later.");
  }

  const data = (await response.json()) as { embeddings: number[][] };

  if (!data.embeddings || !data.embeddings[0]) {
    logger.error("Invalid embedding response from Ollama", undefined, { response: data });
    throw new Error("Invalid response from embedding service.");
  }

  return {
    embedding: data.embeddings[0],
    model: EMBEDDING_MODEL,
  };
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const embeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(batch.map((text) => generateEmbedding(text)));
    embeddings.push(...batchResults.map((r) => r.embedding));

    // Throttle between batches to avoid overwhelming the embedding service
    if (i + BATCH_SIZE < texts.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  return embeddings;
}

export async function ensureModelAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${OLLAMA_HOST}/api/tags`);
    if (!response.ok) {
      return false;
    }

    const data = (await response.json()) as { models: Array<{ name: string }> };
    const hasModel = data.models?.some(
      (m) => m.name === EMBEDDING_MODEL || m.name.startsWith(`${EMBEDDING_MODEL}:`)
    );

    if (!hasModel) {
      logger.info(`Pulling ${EMBEDDING_MODEL} model...`);
      await pullModel();
    }

    return true;
  } catch (error) {
    logger.error("Failed to check Ollama models", error);
    return false;
  }
}

async function pullModel(): Promise<void> {
  const response = await fetch(`${OLLAMA_HOST}/api/pull`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: EMBEDDING_MODEL,
    }),
  });

  if (!response.ok) {
    logger.error("Failed to pull embedding model", undefined, {
      status: response.status,
      model: EMBEDDING_MODEL,
    });
    throw new Error("Failed to initialize embedding model.");
  }

  // Stream the response to wait for completion
  const reader = response.body?.getReader();
  if (reader) {
    let done = false;
    while (!done) {
      const result = await reader.read();
      done = result.done;
    }
  }
}
