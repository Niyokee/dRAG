import { searchSimilar } from "../services/vectorstore.js";
import { config } from "../config.js";
import type { SearchDocsResult } from "../types.js";

const { maxTopK: MAX_TOP_K, maxQueryLength: MAX_QUERY_LENGTH } = config.search;

export type SearchDocsInput = {
  query: string;
  top_k?: number;
  hybrid?: boolean; // Enable hybrid search (semantic + keyword)
  expand_query?: boolean; // Enable query expansion
};

export async function searchDocs(input: SearchDocsInput): Promise<SearchDocsResult> {
  const { query, top_k = 5, hybrid = true, expand_query = false } = input;

  const trimmedQuery = query?.trim?.() ?? "";

  // Validate query length to prevent DoS
  if (trimmedQuery.length > MAX_QUERY_LENGTH) {
    return {
      results: [],
      query: trimmedQuery.slice(0, 100) + "...",
      totalResults: 0,
      error: `Query exceeds maximum length of ${MAX_QUERY_LENGTH} characters`,
    };
  }

  if (!trimmedQuery) {
    return {
      results: [],
      query: "",
      totalResults: 0,
    };
  }

  // Validate and cap top_k to prevent excessive results
  const validatedTopK = Math.min(Math.max(1, top_k ?? 5), MAX_TOP_K);

  const results = await searchSimilar(trimmedQuery, {
    topK: validatedTopK,
    hybrid,
    expandQuery: expand_query,
  });

  return {
    results,
    query: trimmedQuery,
    totalResults: results.length,
  };
}
