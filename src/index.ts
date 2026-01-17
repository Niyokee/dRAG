import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { crawlAndIndex, type CrawlAndIndexInput } from "./tools/crawl.js";
import { searchDocs, type SearchDocsInput } from "./tools/search.js";
import { listIndexedSources } from "./tools/list.js";
import { deleteSource, type DeleteSourceInput } from "./tools/delete.js";
import { logger } from "./logger.js";

const server = new Server(
  {
    name: "doc-chat-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, () => {
  return {
    tools: [
      {
        name: "crawl_and_index",
        description:
          "Crawl a website starting from the given URL and index all pages into the vector database for semantic search. Use this to add new documentation sources.",
        inputSchema: {
          type: "object" as const,
          properties: {
            url: {
              type: "string",
              description: "The starting URL to crawl (must be http or https)",
            },
            max_depth: {
              type: "number",
              description:
                "Maximum crawl depth (default: 2). Higher values crawl more pages but take longer.",
            },
          },
          required: ["url"],
        },
      },
      {
        name: "search_docs",
        description:
          "Search indexed documents using hybrid search (semantic + keyword). Uses Reciprocal Rank Fusion for optimal results. Returns relevant text chunks with source URLs.",
        inputSchema: {
          type: "object" as const,
          properties: {
            query: {
              type: "string",
              description: "The search query",
            },
            top_k: {
              type: "number",
              description: "Number of results to return (default: 5)",
            },
            hybrid: {
              type: "boolean",
              description:
                "Enable hybrid search combining semantic and keyword matching (default: true)",
            },
            expand_query: {
              type: "boolean",
              description: "Enable query expansion for better recall (default: false)",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "list_sources",
        description: "List all indexed documentation sources with their page counts and metadata.",
        inputSchema: {
          type: "object" as const,
          properties: {},
        },
      },
      {
        name: "delete_source",
        description: "Delete all indexed documents from a specific URL/domain.",
        inputSchema: {
          type: "object" as const,
          properties: {
            url: {
              type: "string",
              description: "The URL or domain to delete. All pages under this URL will be removed.",
            },
          },
          required: ["url"],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "crawl_and_index": {
        const input = args as CrawlAndIndexInput;
        const result = await crawlAndIndex(input);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "search_docs": {
        const input = args as SearchDocsInput;
        const result = await searchDocs(input);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "list_sources": {
        const result = await listIndexedSources();
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "delete_source": {
        const input = args as DeleteSourceInput;
        const result = await deleteSource(input);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      default:
        return {
          content: [
            {
              type: "text" as const,
              text: `Unknown tool: ${name}`,
            },
          ],
          isError: true,
        };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      content: [
        {
          type: "text" as const,
          text: `Error: ${message}`,
        },
      ],
      isError: true,
    };
  }
});

// Start the server
async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("Doc Chat MCP server running on stdio");
}

main().catch((error) => {
  logger.error("Fatal error", error);
  process.exit(1);
});
