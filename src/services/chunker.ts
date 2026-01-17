import type { CrawledPage, Chunk, ChunkOptions, ChunkMetadata } from "../types.js";
import { config } from "../config.js";

const {
  defaultChunkSize: DEFAULT_CHUNK_SIZE,
  defaultChunkOverlap: DEFAULT_CHUNK_OVERLAP,
  minChunkSize: MIN_CHUNK_SIZE,
} = config.chunker;

export function chunkPages(pages: CrawledPage[], options?: Partial<ChunkOptions>): Chunk[] {
  const chunkSize = options?.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const chunkOverlap = options?.chunkOverlap ?? DEFAULT_CHUNK_OVERLAP;
  const useSemantic = options?.semantic ?? true; // Default to semantic chunking

  const allChunks: Chunk[] = [];

  for (const page of pages) {
    // Generate document context for contextual retrieval
    const documentContext = generateDocumentContext(page);

    // Choose chunking strategy
    const pageChunks = useSemantic
      ? semanticChunkText(page.content, chunkSize, chunkOverlap)
      : slidingWindowChunk(page.content, chunkSize, chunkOverlap);

    const totalChunks = pageChunks.length;

    for (let i = 0; i < pageChunks.length; i++) {
      const chunkText = pageChunks[i];
      const keywords = extractKeywords(chunkText);

      const metadata: ChunkMetadata = {
        url: page.url,
        title: page.title,
        chunkIndex: i,
        totalChunks,
        context: documentContext,
        keywords,
      };

      allChunks.push({
        id: generateChunkId(page.url, i),
        text: chunkText,
        metadata,
      });
    }
  }

  return allChunks;
}

/**
 * Generate document context for contextual retrieval (Anthropic's approach)
 * This context is prepended to chunks before embedding to improve retrieval
 */
function generateDocumentContext(page: CrawledPage): string {
  const firstParagraph = page.content.split(/\n\n/)[0]?.slice(0, 200) ?? "";
  return `Document: "${page.title}" from ${page.url}. ${firstParagraph}...`;
}

/**
 * Semantic chunking: Split on paragraph/section boundaries
 * Preserves semantic units better than fixed-size chunking
 */
function semanticChunkText(text: string, maxChunkSize: number, chunkOverlap: number): string[] {
  // Split on paragraph boundaries (double newlines or headers)
  const paragraphs = text.split(/\n\n+|\n(?=#{1,3}\s)/);
  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let currentSize = 0;

  for (const paragraph of paragraphs) {
    const paragraphWords = paragraph.split(/\s+/).length;

    // If single paragraph exceeds max size, split it with sliding window
    if (paragraphWords > maxChunkSize) {
      // First, save current chunk if any
      if (currentChunk.length > 0) {
        chunks.push(currentChunk.join("\n\n"));
        currentChunk = [];
        currentSize = 0;
      }
      // Split large paragraph with sliding window
      const subChunks = slidingWindowChunk(paragraph, maxChunkSize, chunkOverlap);
      chunks.push(...subChunks);
      continue;
    }

    // If adding paragraph exceeds max size, start new chunk
    if (currentSize + paragraphWords > maxChunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.join("\n\n"));

      // Keep overlap: last paragraph(s) up to overlap size
      const overlapParagraphs: string[] = [];
      let overlapSize = 0;
      for (let i = currentChunk.length - 1; i >= 0 && overlapSize < chunkOverlap; i--) {
        overlapParagraphs.unshift(currentChunk[i]);
        overlapSize += currentChunk[i].split(/\s+/).length;
      }

      currentChunk = overlapParagraphs;
      currentSize = overlapSize;
    }

    currentChunk.push(paragraph);
    currentSize += paragraphWords;
  }

  // Don't forget the last chunk
  if (currentChunk.length > 0 && currentSize >= MIN_CHUNK_SIZE) {
    chunks.push(currentChunk.join("\n\n"));
  }

  return chunks.filter((c) => c.split(/\s+/).length >= MIN_CHUNK_SIZE);
}

/**
 * Sliding window chunking: Fixed size with overlap
 * Good for maximum context preservation
 */
function slidingWindowChunk(text: string, chunkSize: number, chunkOverlap: number): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];

  if (words.length <= chunkSize) {
    return [text];
  }

  let start = 0;
  while (start < words.length) {
    const end = Math.min(start + chunkSize, words.length);
    const chunk = words.slice(start, end).join(" ");

    if (chunk.trim() && chunk.split(/\s+/).length >= MIN_CHUNK_SIZE) {
      chunks.push(chunk);
    }

    start += chunkSize - chunkOverlap;

    if (start >= words.length - chunkOverlap && chunks.length > 0) {
      break;
    }
  }

  return chunks;
}

/**
 * Extract keywords for BM25 hybrid search
 * Simple approach: extract significant words
 */
function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    "the",
    "a",
    "an",
    "and",
    "or",
    "but",
    "in",
    "on",
    "at",
    "to",
    "for",
    "of",
    "with",
    "by",
    "from",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "being",
    "have",
    "has",
    "had",
    "do",
    "does",
    "did",
    "will",
    "would",
    "could",
    "should",
    "may",
    "might",
    "must",
    "shall",
    "can",
    "this",
    "that",
    "these",
    "those",
    "it",
    "its",
    "as",
    "if",
    "then",
    "else",
  ]);

  const words = text.toLowerCase().match(/\b[a-z]{3,}\b/g) ?? [];

  // Count word frequency
  const wordCount = new Map<string, number>();
  for (const word of words) {
    if (!stopWords.has(word)) {
      wordCount.set(word, (wordCount.get(word) ?? 0) + 1);
    }
  }

  // Return top keywords by frequency
  return [...wordCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([word]) => word);
}

function generateChunkId(url: string, index: number): string {
  const urlHash = simpleHash(url);
  return `${urlHash}-${index}`;
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}
