# dRAG MCP Server - Development Guide

## Project Overview
MCP server for crawling websites and enabling semantic search via Claude Code.

**Stack:** TypeScript, Docker Compose, Ollama (nomic-embed-text), ChromaDB

## Conventions

### TypeScript
- Use strict mode
- Prefer `type` over `interface` for simple types
- Use explicit return types for public functions
- Async functions should handle errors with try-catch
- Use descriptive variable names (no single letters except loops)

### File Organization
- `src/services/` - Business logic (crawler, embedder, vectorstore)
- `src/tools/` - MCP tool implementations
- `src/types.ts` - Shared type definitions
- `src/index.ts` - MCP server entry point

### Error Handling
- Throw typed errors with meaningful messages
- Log errors before re-throwing
- Return structured error responses from MCP tools

### Docker
- Use multi-stage builds for smaller images
- Pin dependency versions
- Use health checks for services

### Linting & Formatting
- ESLint with TypeScript strict rules
- Prettier for consistent formatting (100 char line width)
- Run before commit: `npm run lint && npm run format:check`
- Auto-fix: `npm run lint:fix && npm run format`

**Key ESLint Rules:**
- `@typescript-eslint/no-floating-promises`: Must await or handle promises
- `@typescript-eslint/no-unused-vars`: Prefix unused with `_`
- `eqeqeq`: Always use `===` and `!==`
- `prefer-const`: Use const when variable is not reassigned

**Prettier Settings:**
- Double quotes for strings
- Semicolons required
- Trailing commas in ES5 contexts
- 2-space indentation

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Embedding Model | nomic-embed-text | Lightweight, good quality, runs on 16GB RAM |
| Vector DB | ChromaDB | Simple API, Docker support, no config needed |
| Crawler | cheerio + fetch | Lightweight, no browser dependency |
| Chunk Size | 500 tokens, 100 overlap | Balance between context and precision |

## Learnings

### 2026-01-17: Initial Implementation Review

**Security - SSRF Protection (Critical)**
- Any service accepting URLs must validate against internal networks
- Block: localhost, 127.0.0.1, 10.x.x.x, 172.16-31.x.x, 192.168.x.x
- Block cloud metadata endpoints: 169.254.169.254, metadata.google.internal
- Block non-standard ports unless explicitly required
- Implementation: `isBlockedUrl()` function in crawler.ts

**Performance - Rate Limiting**
- Always add delays between external requests to avoid being blocked
- 500ms delay is reasonable for documentation crawling
- Use `await sleep(ms)` pattern between requests

**Performance - Memory Management**
- Never load unbounded data into memory (e.g., `col.get()` without limit)
- Use pagination with BATCH_SIZE constant (1000 is reasonable)
- For delete operations: don't advance offset if items were deleted (indexes shift)

**Input Validation**
- Always enforce reasonable bounds on user inputs
- max_depth should be capped (5 is reasonable for documentation)
- Validate URLs before processing

**Error Messages**
- Avoid leaking implementation details in user-facing errors
- Sanitize error messages from external services

## Anti-patterns

### Discovered in 2026-01-17 Review

1. **Unbounded Queries**
   - BAD: `await col.get({ include: ["metadatas"] })`
   - GOOD: `await col.get({ include: ["metadatas"], limit: BATCH_SIZE, offset })`

2. **Missing SSRF Protection**
   - BAD: `fetch(userProvidedUrl)` without validation
   - GOOD: `if (isBlockedUrl(url)) throw new Error(...)`

3. **No Rate Limiting**
   - BAD: `while (queue.length > 0) { await fetch(url); }`
   - GOOD: `await fetch(url); await sleep(500);`

4. **Unbounded Input Parameters**
   - BAD: `maxDepth = options.maxDepth`
   - GOOD: `maxDepth = Math.min(options.maxDepth, MAX_DEPTH_LIMIT)`

### 2026-01-17: RAG Precision & Refactoring

**RAG Improvement Techniques Applied (rag-implementation skill)**

1. **Contextual Retrieval (Anthropic's Approach)**
   - Prepend document context to chunks before embedding
   - Reduces retrieval failures by ~49%
   - Implementation: `generateDocumentContext()` in chunker.ts

2. **Hybrid Search (Semantic + BM25)**
   - Combine vector similarity with keyword matching
   - Use Reciprocal Rank Fusion (RRF) to merge results
   - RRF formula: `score = 1 / (k + rank + 1)` where k=60
   - Implementation: `reciprocalRankFusion()` in vectorstore.ts

3. **Semantic Chunking**
   - Split on paragraph boundaries instead of fixed word count
   - Preserves semantic units better
   - Falls back to sliding window for large paragraphs

4. **Query Expansion**
   - Generate query variations: "what is X", "how to X", "X example"
   - Improves recall for diverse query styles
   - Optional flag: `expand_query=true`

5. **Keyword Extraction**
   - Extract top-20 keywords per chunk for BM25 matching
   - Remove stopwords, count frequency
   - Stored in metadata for fast keyword search

**Refactoring Patterns Applied (code-refactor skill)**

1. **Centralized Configuration**
   - All environment variables in `config.ts`
   - Magic numbers as named constants
   - Type-safe config access

2. **Structured Logging**
   - Dedicated `logger.ts` module
   - Uses stderr (stdout reserved for MCP protocol)
   - Includes timestamp, level, message, metadata

3. **Test-First Verification**
   - Added vitest with 17 tests
   - Tests for chunker, config, logger
   - Run with `npm test`

## Architecture Decisions (Updated)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Search Strategy | Hybrid (Semantic + BM25) | 49% fewer retrieval failures |
| Chunking | Semantic (paragraph-based) | Preserves meaning boundaries |
| Fusion Algorithm | Reciprocal Rank Fusion | Proven in IR research, simple to implement |
| Config Management | Centralized config.ts | Single source of truth, type-safe |
| Logging | Custom logger to stderr | MCP requires stdout for protocol |

## Testing

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run typecheck     # Type checking
```

## Skills Used in Development

| Skill | Purpose | Applied |
|-------|---------|---------|
| code-auditor | Security/quality review | Initial implementation review |
| review-implementing | Feedback implementation | Applied audit findings |
| rag-implementation | RAG precision improvement | Hybrid search, contextual retrieval |
| code-refactor | Systematic refactoring | Config centralization, logging |
| test-fixing | Test organization | Test suite setup |
| ensemble-solving | Compare approaches | (Available for future use)
