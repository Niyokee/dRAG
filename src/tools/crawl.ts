import { crawlWebsite } from "../services/crawler.js";
import { chunkPages } from "../services/chunker.js";
import { addChunks } from "../services/vectorstore.js";
import { ensureModelAvailable } from "../services/embedder.js";
import { logger } from "../logger.js";
import type { CrawlAndIndexResult } from "../types.js";

export type CrawlAndIndexInput = {
  url: string;
  max_depth?: number;
};

export async function crawlAndIndex(input: CrawlAndIndexInput): Promise<CrawlAndIndexResult> {
  const { url, max_depth } = input;

  // Validate max_depth parameter type and bounds
  if (max_depth !== undefined && (!Number.isInteger(max_depth) || max_depth < 0)) {
    return {
      success: false,
      pagesIndexed: 0,
      chunksCreated: 0,
      url,
      error: "max_depth must be a non-negative integer",
    };
  }

  const effectiveMaxDepth = max_depth ?? 2;

  try {
    // Validate URL
    const parsedUrl = new URL(url);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return {
        success: false,
        pagesIndexed: 0,
        chunksCreated: 0,
        url,
        error: "Invalid URL: must use http or https protocol",
      };
    }

    // Ensure embedding model is available
    const modelReady = await ensureModelAvailable();
    if (!modelReady) {
      return {
        success: false,
        pagesIndexed: 0,
        chunksCreated: 0,
        url,
        error: "Embedding model not available. Is Ollama running?",
      };
    }

    // Crawl the website
    logger.info(`Crawling ${url}`, { maxDepth: effectiveMaxDepth });
    const pages = await crawlWebsite(url, { maxDepth: effectiveMaxDepth });

    if (pages.length === 0) {
      return {
        success: false,
        pagesIndexed: 0,
        chunksCreated: 0,
        url,
        error: "No pages found to index",
      };
    }

    // Chunk the content
    logger.info(`Chunking pages`, { count: pages.length });
    const chunks = chunkPages(pages);

    // Store in vector database
    logger.info(`Indexing chunks`, { count: chunks.length });
    const addedCount = await addChunks(chunks);

    logger.info(`Indexing complete`, { url, pages: pages.length, chunks: addedCount });

    return {
      success: true,
      pagesIndexed: pages.length,
      chunksCreated: addedCount,
      url,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Crawl and index failed", error, { url });
    return {
      success: false,
      pagesIndexed: 0,
      chunksCreated: 0,
      url,
      error: message,
    };
  }
}
