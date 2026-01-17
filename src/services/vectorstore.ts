import { ChromaClient, Collection, IncludeEnum } from "chromadb";
import type { Chunk, SearchResult, SourceInfo, SearchOptions } from "../types.js";
import { generateEmbedding, generateEmbeddings } from "./embedder.js";
import { config } from "../config.js";

const { host: CHROMA_HOST, collectionName: COLLECTION_NAME, batchSize: BATCH_SIZE } = config.chroma;
const { rrfK: RRF_K } = config.search;

let client: ChromaClient | null = null;
let collection: Collection | null = null;

async function getCollection(): Promise<Collection> {
  if (collection) {
    return collection;
  }

  client = new ChromaClient({ path: CHROMA_HOST });
  collection = await client.getOrCreateCollection({
    name: COLLECTION_NAME,
    metadata: { "hnsw:space": "cosine" },
  });

  return collection;
}

/**
 * Add chunks with contextual embedding (Anthropic's approach)
 * Prepends document context to each chunk before embedding
 */
export async function addChunks(chunks: Chunk[]): Promise<number> {
  const col = await getCollection();

  const ids = chunks.map((c) => c.id);

  // Contextual embedding: prepend context to text
  const documents = chunks.map((c) => {
    const context = c.metadata.context ?? "";
    return context ? `${context}\n\n${c.text}` : c.text;
  });

  const metadatas = chunks.map((c) => ({
    url: c.metadata.url,
    title: c.metadata.title,
    chunkIndex: c.metadata.chunkIndex,
    totalChunks: c.metadata.totalChunks,
    keywords: c.metadata.keywords?.join(",") ?? "",
    indexedAt: new Date().toISOString(),
  }));

  // Generate embeddings with contextual text
  const embeddings = await generateEmbeddings(documents);

  // Store original text (not contextual) for retrieval display
  const originalTexts = chunks.map((c) => c.text);

  await col.add({
    ids,
    documents: originalTexts, // Store original for display
    metadatas,
    embeddings,
  });

  return chunks.length;
}

/**
 * Hybrid search: combines semantic (vector) and keyword (BM25-like) search
 * Uses Reciprocal Rank Fusion (RRF) to merge results
 */
export async function searchSimilar(
  query: string,
  options: SearchOptions = {}
): Promise<SearchResult[]> {
  const topK = options.topK ?? 5;
  const useHybrid = options.hybrid ?? true;
  const useQueryExpansion = options.expandQuery ?? false;

  const col = await getCollection();

  // Optionally expand query for better recall
  const queries = useQueryExpansion ? expandQuery(query) : [query];

  // Semantic search with all query variations
  const semanticResults = await semanticSearch(col, queries, topK * 2);

  if (!useHybrid) {
    return semanticResults.slice(0, topK);
  }

  // Keyword search using stored keywords
  const keywordResults = await keywordSearch(col, query, topK * 2);

  // Merge with Reciprocal Rank Fusion
  const fusedResults = reciprocalRankFusion(semanticResults, keywordResults, topK);

  return fusedResults;
}

/**
 * Semantic search using vector embeddings
 */
async function semanticSearch(
  col: Collection,
  queries: string[],
  topK: number
): Promise<SearchResult[]> {
  const allResults: SearchResult[] = [];

  for (const query of queries) {
    const { embedding } = await generateEmbedding(query);

    const results = await col.query({
      queryEmbeddings: [embedding],
      nResults: topK,
    });

    if (results.documents?.[0]) {
      for (let i = 0; i < results.documents[0].length; i++) {
        const doc = results.documents[0][i];
        const meta = results.metadatas?.[0]?.[i];
        const distance = results.distances?.[0]?.[i];

        if (doc && meta) {
          allResults.push({
            text: doc,
            url: meta.url as string,
            title: meta.title as string,
            score: distance !== null ? 1 - distance : 0,
          });
        }
      }
    }
  }

  // Deduplicate by URL+text and keep highest score
  const seen = new Map<string, SearchResult>();
  for (const result of allResults) {
    const key = `${result.url}:${result.text.slice(0, 100)}`;
    const existing = seen.get(key);
    if (!existing || existing.score < result.score) {
      seen.set(key, result);
    }
  }

  return [...seen.values()].sort((a, b) => b.score - a.score);
}

/**
 * Simple keyword search using stored keywords (BM25-like)
 * Uses pagination to handle large collections without memory exhaustion
 */
async function keywordSearch(
  col: Collection,
  query: string,
  topK: number
): Promise<SearchResult[]> {
  const queryWords = query.toLowerCase().match(/\b[a-z]{3,}\b/g) ?? [];
  if (queryWords.length === 0) {
    return [];
  }

  // Collect scored results with full data for later retrieval
  const allScored: Array<{ doc: string; url: string; title: string; score: number }> = [];
  let offset = 0;
  let hasMore = true;

  // Paginate through all documents
  while (hasMore) {
    const batch = await col.get({
      include: [IncludeEnum.documents, IncludeEnum.metadatas],
      limit: BATCH_SIZE,
      offset,
    });

    if (!batch.documents || !batch.metadatas || batch.documents.length === 0) {
      hasMore = false;
      break;
    }

    // Score documents in this batch
    for (let i = 0; i < batch.metadatas.length; i++) {
      const meta = batch.metadatas[i];
      if (!meta) continue;

      const keywords = (meta.keywords as string)?.split(",") ?? [];
      const doc = batch.documents[i] ?? "";

      // Count matching keywords
      let matchCount = 0;
      for (const qWord of queryWords) {
        if (keywords.includes(qWord) || doc.toLowerCase().includes(qWord)) {
          matchCount++;
        }
      }

      if (matchCount > 0) {
        // Simple BM25-like score: match ratio
        const score = matchCount / queryWords.length;
        const url = typeof meta.url === "string" ? meta.url : "";
        const title = typeof meta.title === "string" ? meta.title : "";
        allScored.push({
          doc,
          url,
          title,
          score,
        });
      }
    }

    offset += batch.documents.length;
    hasMore = batch.documents.length === BATCH_SIZE;
  }

  // Sort by score and return top results
  allScored.sort((a, b) => b.score - a.score);

  return allScored.slice(0, topK).map(({ doc, url, title, score }) => ({
    text: doc,
    url,
    title,
    score,
  }));
}

/**
 * Reciprocal Rank Fusion: merge two ranked lists
 * Higher k = more emphasis on lower-ranked items
 */
function reciprocalRankFusion(
  results1: SearchResult[],
  results2: SearchResult[],
  topK: number,
  k: number = RRF_K
): SearchResult[] {
  const scores = new Map<string, { result: SearchResult; score: number }>();

  // Score from first list
  results1.forEach((result, i) => {
    const key = `${result.url}:${result.text.slice(0, 100)}`;
    const rrfScore = 1 / (k + i + 1);
    const existing = scores.get(key);
    if (existing) {
      existing.score += rrfScore;
    } else {
      scores.set(key, { result, score: rrfScore });
    }
  });

  // Add scores from second list
  results2.forEach((result, i) => {
    const key = `${result.url}:${result.text.slice(0, 100)}`;
    const rrfScore = 1 / (k + i + 1);
    const existing = scores.get(key);
    if (existing) {
      existing.score += rrfScore;
    } else {
      scores.set(key, { result, score: rrfScore });
    }
  });

  // Sort by fused score and return top results
  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(({ result, score }) => ({ ...result, score }));
}

/**
 * Query expansion: generate variations for better recall
 */
function expandQuery(query: string): string[] {
  return [query, `what is ${query}`, `how to ${query}`, `${query} example`];
}

export async function listSources(): Promise<SourceInfo[]> {
  const col = await getCollection();

  const sourceMap = new Map<
    string,
    { title: string; pageUrls: Set<string>; chunkCount: number; indexedAt: string }
  >();

  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const batch = await col.get({
      include: [IncludeEnum.metadatas],
      limit: BATCH_SIZE,
      offset,
    });

    if (!batch.metadatas || batch.metadatas.length === 0) {
      hasMore = false;
      break;
    }

    for (const meta of batch.metadatas) {
      if (!meta) continue;

      const url = meta.url as string;
      const baseUrl = getBaseUrl(url);

      if (!sourceMap.has(baseUrl)) {
        sourceMap.set(baseUrl, {
          title: meta.title as string,
          pageUrls: new Set(),
          chunkCount: 0,
          indexedAt: meta.indexedAt as string,
        });
      }

      const source = sourceMap.get(baseUrl)!;
      source.pageUrls.add(url);
      source.chunkCount++;
    }

    offset += batch.metadatas.length;
    hasMore = batch.metadatas.length === BATCH_SIZE;
  }

  return Array.from(sourceMap.entries()).map(([url, data]) => ({
    url,
    title: data.title,
    pageCount: data.pageUrls.size,
    chunkCount: data.chunkCount,
    indexedAt: new Date(data.indexedAt),
  }));
}

export async function deleteByUrl(url: string): Promise<number> {
  const col = await getCollection();
  const baseUrl = getBaseUrl(url);

  let totalDeleted = 0;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const batch = await col.get({
      include: [IncludeEnum.metadatas],
      limit: BATCH_SIZE,
      offset,
    });

    if (!batch.ids || !batch.metadatas || batch.ids.length === 0) {
      hasMore = false;
      break;
    }

    const idsToDelete: string[] = [];

    for (let i = 0; i < batch.ids.length; i++) {
      const meta = batch.metadatas[i];
      if (meta && (meta.url as string).startsWith(baseUrl)) {
        idsToDelete.push(batch.ids[i]);
      }
    }

    if (idsToDelete.length > 0) {
      await col.delete({ ids: idsToDelete });
      totalDeleted += idsToDelete.length;
    }

    if (idsToDelete.length === 0) {
      offset += batch.ids.length;
    }

    hasMore = batch.ids.length === BATCH_SIZE;
  }

  return totalDeleted;
}

function getBaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.hostname}`;
  } catch {
    return url;
  }
}
