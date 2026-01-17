/**
 * Centralized configuration for the Doc Chat MCP server
 * All environment variables and constants in one place
 */

import { logger } from "./logger.js";

/**
 * Validate service URL to prevent SSRF attacks via environment variables
 * Only allows localhost URLs for internal services (Ollama, ChromaDB)
 */
function validateServiceUrl(url: string, serviceName: string): string {
  try {
    const parsed = new URL(url);

    // Only allow http/https protocols
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error(`Invalid protocol for ${serviceName}: only http/https allowed`);
    }

    // For internal services, only allow localhost or explicit container names
    const allowedHosts = ["localhost", "127.0.0.1", "ollama", "chromadb", "chroma"];
    const hostname = parsed.hostname.toLowerCase();

    if (!allowedHosts.includes(hostname)) {
      // Log warning but allow for Docker/container setups
      logger.warn(`Non-standard host for ${serviceName}`, { host: hostname });
    }

    return url;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid URL";
    logger.error(`Invalid ${serviceName} URL configuration`, { url, error: message });
    throw new Error(`Invalid ${serviceName} URL: ${message}`);
  }
}

// Service endpoints
export const config = {
  // Ollama configuration
  ollama: {
    host: validateServiceUrl(
      process.env.OLLAMA_HOST ?? "http://localhost:11434",
      "OLLAMA_HOST"
    ),
    embeddingModel: "nomic-embed-text",
    batchSize: 10,
    batchDelayMs: 100, // Throttle between batches
  },

  // ChromaDB configuration
  chroma: {
    host: validateServiceUrl(
      process.env.CHROMA_HOST ?? "http://localhost:8000",
      "CHROMA_HOST"
    ),
    collectionName: "drag_documents",
    batchSize: 1000,
  },

  // Crawler configuration
  crawler: {
    maxDepthLimit: 5,
    defaultMaxPages: 100,
    requestTimeoutMs: 10000,
    requestDelayMs: 500,
    maxResponseSizeBytes: 10 * 1024 * 1024, // 10 MB limit per page
    userAgent: "dRAG/1.0 (Documentation Crawler)",
  },

  // Chunker configuration
  chunker: {
    defaultChunkSize: 500,
    defaultChunkOverlap: 100,
    minChunkSize: 50,
  },

  // Search configuration
  search: {
    defaultTopK: 5,
    maxTopK: 100, // Upper bound for top_k parameter
    maxQueryLength: 10000, // Max query string length in characters
    rrfK: 60, // Reciprocal Rank Fusion constant
  },
} as const;

// Type-safe config access
export type Config = typeof config;
