# dRAG

**d**ocuments to **RAG** — Drag any docs into your AI workflow.

[Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server for crawling documentation websites and enabling semantic search via Claude Code.

Index any documentation site and search it using natural language — just drag it in.

## Features

- **Web Crawling**: Automatically crawl and index documentation sites with configurable depth
- **Hybrid Search**: Combines semantic search with BM25 keyword matching using Reciprocal Rank Fusion
- **Semantic Chunking**: Intelligent text splitting that preserves paragraph boundaries
- **Query Expansion**: Optional query variations for improved recall
- **Local Embeddings**: Uses Ollama with nomic-embed-text (runs locally, no API keys needed)
- **Persistent Storage**: ChromaDB for reliable vector storage
- **Security**: SSRF protection, rate limiting, and input validation built-in

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI
- 16GB RAM recommended (for embedding model)

## Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/your-username/drag-mcp.git
cd drag-mcp
```

### 2. Start dependencies

```bash
docker compose up -d ollama chroma
```

### 3. Pull the embedding model

```bash
docker compose exec ollama ollama pull nomic-embed-text
```

This downloads the nomic-embed-text model (~274MB). Only needed once.

### 4. Configure Claude Code

Add the following to your Claude Code settings (`~/.claude/settings.json`):

```json
{
  "mcpServers": {
    "drag": {
      "command": "docker",
      "args": [
        "compose", "-f", "/path/to/drag-mcp/docker-compose.yml",
        "run", "--rm", "-i", "mcp-server"
      ]
    }
  }
}
```

Replace `/path/to/drag-mcp` with the actual path to your cloned repository.

### 5. Restart Claude Code

The MCP server will now be available in Claude Code.

## Usage

Use natural language in Claude Code to interact with the server:

**Index a documentation site:**
> "Index https://docs.example.com with depth 3"

**Search indexed documents:**
> "Search for authentication in the docs"

**List indexed sources:**
> "Show me all indexed documentation sources"

**Delete a source:**
> "Remove the docs from example.com"

## MCP Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `crawl_and_index` | Crawl a URL and index content to vector DB | `url` (required), `max_depth` (optional, default: 2) |
| `search_docs` | Semantic search over indexed documents | `query` (required), `top_k` (optional), `hybrid` (optional), `expand_query` (optional) |
| `list_sources` | List all indexed documentation sources | - |
| `delete_source` | Remove all documents from a source URL | `url` (required) |

### Search Options

- **hybrid** (default: true): Enable hybrid search combining semantic similarity with keyword matching
- **expand_query** (default: false): Generate query variations for improved recall
- **top_k** (default: 5, max: 100): Number of results to return

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Claude Code   │────▶│   MCP Server    │────▶│     Ollama      │
│                 │     │   (TypeScript)  │     │ (nomic-embed)   │
└─────────────────┘     └────────┬────────┘     └─────────────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │    ChromaDB     │
                        │  (Vector Store) │
                        └─────────────────┘
```

| Component | Technology | Purpose |
|-----------|------------|---------|
| Crawler | cheerio + fetch | Lightweight HTML parsing, no browser needed |
| Embeddings | Ollama + nomic-embed-text | Local embeddings, 768 dimensions |
| Vector DB | ChromaDB | Persistent vector storage with metadata filtering |
| Chunking | Semantic chunking | Paragraph-based splitting with overlap |
| Search | Hybrid (Semantic + BM25) | Reciprocal Rank Fusion for result merging |

## Development

### Setup

```bash
npm install
npm run build
```

### Run locally

```bash
# Start dependencies
docker compose up -d ollama chroma

# Run in development mode
npm run dev
```

### Commands

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript |
| `npm run dev` | Run with hot reload |
| `npm test` | Run tests |
| `npm run lint` | Run ESLint |
| `npm run format` | Format code with Prettier |
| `npm run typecheck` | Type check without emitting |

### Project Structure

```
src/
├── index.ts           # MCP server entry point
├── config.ts          # Centralized configuration
├── logger.ts          # Structured logging
├── types.ts           # Shared type definitions
├── services/
│   ├── crawler.ts     # Web crawler with SSRF protection
│   ├── chunker.ts     # Semantic text chunking
│   ├── embedder.ts    # Ollama embedding client
│   └── vectorstore.ts # ChromaDB operations & hybrid search
└── tools/
    ├── crawl.ts       # crawl_and_index tool
    ├── search.ts      # search_docs tool
    ├── list.ts        # list_sources tool
    └── delete.ts      # delete_source tool
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OLLAMA_HOST` | `http://localhost:11434` | Ollama API endpoint |
| `CHROMA_HOST` | `http://localhost:8000` | ChromaDB API endpoint |

## Security

This server includes several security measures:

- **SSRF Protection**: Blocks requests to internal networks (localhost, private IPs, cloud metadata endpoints)
- **Rate Limiting**: 500ms delay between crawl requests to avoid overwhelming target servers
- **Input Validation**: URL validation, max depth limits, query length limits
- **Response Size Limits**: 10MB max per page to prevent memory exhaustion

## Troubleshooting

### "Embedding model not available"

Ensure Ollama is running and the model is pulled:

```bash
docker compose exec ollama ollama list
# Should show: nomic-embed-text
```

### "No pages found to index"

- Check if the URL is accessible
- Some sites may block crawlers; check the target site's robots.txt
- Try a simpler URL first (e.g., a single page instead of the root)

### Connection refused

Ensure Docker services are running:

```bash
docker compose ps
# All services should show "Up"
```

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

Please ensure your code passes linting and tests:

```bash
npm run lint
npm run format:check
npm test
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Model Context Protocol](https://modelcontextprotocol.io/) by Anthropic
- [Ollama](https://ollama.ai/) for local LLM inference
- [ChromaDB](https://www.trychroma.com/) for vector storage
- [nomic-embed-text](https://huggingface.co/nomic-ai/nomic-embed-text-v1) for embeddings
