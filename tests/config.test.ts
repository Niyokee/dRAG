import { describe, it, expect } from "vitest";
import { config } from "../src/config.js";

describe("config", () => {
  it("should have ollama configuration", () => {
    expect(config.ollama).toBeDefined();
    expect(config.ollama.host).toBe("http://localhost:11434");
    expect(config.ollama.embeddingModel).toBe("nomic-embed-text");
    expect(config.ollama.batchSize).toBeGreaterThan(0);
  });

  it("should have chroma configuration", () => {
    expect(config.chroma).toBeDefined();
    expect(config.chroma.host).toBe("http://localhost:8000");
    expect(config.chroma.collectionName).toBe("drag_documents");
    expect(config.chroma.batchSize).toBeGreaterThan(0);
  });

  it("should have crawler configuration", () => {
    expect(config.crawler).toBeDefined();
    expect(config.crawler.maxDepthLimit).toBe(5);
    expect(config.crawler.defaultMaxPages).toBe(100);
    expect(config.crawler.requestTimeoutMs).toBeGreaterThan(0);
    expect(config.crawler.requestDelayMs).toBeGreaterThan(0);
    expect(config.crawler.userAgent).toContain("dRAG");
  });

  it("should have chunker configuration", () => {
    expect(config.chunker).toBeDefined();
    expect(config.chunker.defaultChunkSize).toBe(500);
    expect(config.chunker.defaultChunkOverlap).toBe(100);
    expect(config.chunker.minChunkSize).toBe(50);
  });

  it("should have search configuration", () => {
    expect(config.search).toBeDefined();
    expect(config.search.defaultTopK).toBe(5);
    expect(config.search.rrfK).toBe(60);
  });
});
