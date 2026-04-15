#!/usr/bin/env node

/**
 * @nobug/mcp-server — MCP server for AI coding agents to interact with NoBug bug tracking.
 *
 * This is a thin client that translates MCP tool calls into HTTP API calls
 * to the NoBug backend. All business logic lives on the backend, not here.
 *
 * Configuration:
 *   NOBUG_API_KEY  — API key with nb_key_ prefix (required)
 *   NOBUG_API_URL  — Base URL of the NoBug web app (default: http://localhost:3000)
 *
 * Usage:
 *   npx @nobug/mcp-server
 *
 * Claude Desktop config (~/.claude/claude_desktop_config.json):
 *   {
 *     "mcpServers": {
 *       "nobug": {
 *         "command": "npx",
 *         "args": ["@nobug/mcp-server"],
 *         "env": {
 *           "NOBUG_API_KEY": "nb_key_your_key_here",
 *           "NOBUG_API_URL": "https://your-nobug-instance.com"
 *         }
 *       }
 *     }
 *   }
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ApiClient } from "./api-client.js";
import { registerTools } from "./tools.js";

/**
 * Creates and configures the MCP server with all bug tracking tools.
 * Call `startServer()` to start listening on stdio.
 */
export function createServer(): McpServer {
  const api = ApiClient.fromEnv();

  const server = new McpServer(
    {
      name: "@nobug/mcp-server",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
      instructions:
        "NoBug MCP Server — interact with the NoBug bug tracking platform. " +
        "Use these tools to list, search, create, update bugs, and add comments. " +
        "All operations require a valid API key configured via NOBUG_API_KEY.",
    }
  );

  registerTools(server, api);

  return server;
}

/**
 * Starts the MCP server on stdio transport.
 * This is the main entry point when running as a CLI tool.
 */
export async function startServer(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// When run directly as a CLI tool, start the server
const isDirectExecution =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("mcp-server/dist/index.js") ||
    process.argv[1].endsWith("mcp-server\\dist\\index.js") ||
    process.argv[1].includes("@nobug/mcp-server"));

if (isDirectExecution) {
  startServer().catch((error) => {
    console.error("Failed to start NoBug MCP server:", error);
    process.exit(1);
  });
}
