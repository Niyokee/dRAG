import { listSources } from "../services/vectorstore.js";
import type { ListSourcesResult } from "../types.js";

export async function listIndexedSources(): Promise<ListSourcesResult> {
  const sources = await listSources();

  return {
    sources,
    totalSources: sources.length,
  };
}
