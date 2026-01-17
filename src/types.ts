// Crawler types
export type CrawledPage = {
  url: string;
  title: string;
  content: string;
  links: string[];
  crawledAt: Date;
};

export type CrawlOptions = {
  maxDepth: number;
  maxPages?: number;
  allowedDomains?: string[];
};

// Chunker types
export type Chunk = {
  id: string;
  text: string;
  metadata: ChunkMetadata;
};

export type ChunkMetadata = {
  url: string;
  title: string;
  chunkIndex: number;
  totalChunks: number;
  context?: string; // Contextual retrieval: summary of document context
  keywords?: string[]; // BM25 keywords for hybrid search
};

export type ChunkOptions = {
  chunkSize: number;
  chunkOverlap: number;
  semantic?: boolean; // Use semantic chunking (paragraph boundaries)
};

export type SearchOptions = {
  topK?: number;
  hybrid?: boolean; // Enable hybrid search (semantic + BM25)
  expandQuery?: boolean; // Enable query expansion
};

// Embedder types
export type EmbeddingResult = {
  embedding: number[];
  model: string;
};

// Vector store types
export type DocumentRecord = {
  id: string;
  text: string;
  embedding: number[];
  metadata: ChunkMetadata;
};

export type SearchResult = {
  text: string;
  url: string;
  title: string;
  score: number;
};

export type SourceInfo = {
  url: string;
  title: string;
  pageCount: number;
  chunkCount: number;
  indexedAt: Date;
};

// MCP Tool Response types
export type CrawlAndIndexResult = {
  success: boolean;
  pagesIndexed: number;
  chunksCreated: number;
  url: string;
  error?: string;
};

export type SearchDocsResult = {
  results: SearchResult[];
  query: string;
  totalResults: number;
  error?: string;
};

export type ListSourcesResult = {
  sources: SourceInfo[];
  totalSources: number;
};

export type DeleteSourceResult = {
  success: boolean;
  deletedChunks: number;
  url: string;
  error?: string;
};
