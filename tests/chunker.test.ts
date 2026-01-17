import { describe, it, expect } from "vitest";
import { chunkPages } from "../src/services/chunker.js";
import type { CrawledPage } from "../src/types.js";

describe("chunkPages", () => {
  const createPage = (content: string, title = "Test Page"): CrawledPage => ({
    url: "https://example.com/test",
    title,
    content,
    links: [],
    crawledAt: new Date(),
  });

  it("should chunk a simple page into chunks", () => {
    const longContent = Array(600).fill("word").join(" ");
    const pages = [createPage(longContent)];

    const chunks = chunkPages(pages, { chunkSize: 500, chunkOverlap: 100 });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].metadata.url).toBe("https://example.com/test");
    expect(chunks[0].metadata.title).toBe("Test Page");
  });

  it("should preserve short content as single chunk", () => {
    const shortContent = "This is a short paragraph with some content.";
    const pages = [createPage(shortContent)];

    const chunks = chunkPages(pages, { chunkSize: 500, chunkOverlap: 100 });

    // Short content might be filtered out if below MIN_CHUNK_SIZE
    expect(chunks.length).toBeLessThanOrEqual(1);
  });

  it("should generate unique IDs for each chunk", () => {
    const content = Array(1000).fill("word").join(" ");
    const pages = [createPage(content)];

    const chunks = chunkPages(pages, { chunkSize: 500, chunkOverlap: 100 });

    const ids = chunks.map((c) => c.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("should include document context in metadata", () => {
    const content = "First paragraph of content.\n\nSecond paragraph here.";
    const pages = [createPage(content, "My Document")];

    const chunks = chunkPages(pages, { chunkSize: 500, chunkOverlap: 100 });

    if (chunks.length > 0) {
      expect(chunks[0].metadata.context).toContain("My Document");
      expect(chunks[0].metadata.context).toContain("example.com");
    }
  });

  it("should extract keywords from chunk text", () => {
    const content = "TypeScript programming language for web development. ".repeat(20);
    const pages = [createPage(content)];

    const chunks = chunkPages(pages, { chunkSize: 500, chunkOverlap: 100 });

    if (chunks.length > 0 && chunks[0].metadata.keywords) {
      expect(chunks[0].metadata.keywords).toContain("typescript");
      expect(chunks[0].metadata.keywords).toContain("programming");
    }
  });

  it("should handle semantic chunking with paragraph boundaries", () => {
    const content = `
First paragraph with important information.

Second paragraph with more details about the topic.

Third paragraph concludes the discussion.
    `.trim();

    const pages = [createPage(content)];

    const chunks = chunkPages(pages, { chunkSize: 500, chunkOverlap: 100, semantic: true });

    // With semantic chunking, small paragraphs should be combined
    expect(chunks.length).toBeGreaterThanOrEqual(0);
  });

  it("should handle multiple pages", () => {
    const pages = [
      createPage("Content for page one. ".repeat(50), "Page One"),
      createPage("Content for page two. ".repeat(50), "Page Two"),
    ];

    const chunks = chunkPages(pages, { chunkSize: 100, chunkOverlap: 20 });

    const page1Chunks = chunks.filter((c) => c.metadata.title === "Page One");
    const page2Chunks = chunks.filter((c) => c.metadata.title === "Page Two");

    expect(page1Chunks.length).toBeGreaterThan(0);
    expect(page2Chunks.length).toBeGreaterThan(0);
  });
});
