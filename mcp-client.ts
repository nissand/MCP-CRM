#!/usr/bin/env npx ts-node

/**
 * MCP stdio wrapper for the CRM HTTP endpoint.
 * This script bridges Claude Desktop (stdio) to the Convex HTTP MCP server.
 *
 * Usage:
 *   1. Set AUTH_TOKEN environment variable with your Convex auth token
 *   2. Run: npx ts-node mcp-client.ts
 */

import * as readline from "readline";

const MCP_URL = process.env.MCP_URL || "https://rare-sturgeon-827.convex.site/mcp";
const AUTH_TOKEN = process.env.AUTH_TOKEN;

if (!AUTH_TOKEN) {
  console.error(JSON.stringify({
    jsonrpc: "2.0",
    id: null,
    error: {
      code: -32600,
      message: "AUTH_TOKEN environment variable is required"
    }
  }));
  process.exit(1);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

rl.on("line", async (line) => {
  try {
    const request = JSON.parse(line);

    const response = await fetch(MCP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${AUTH_TOKEN}`,
      },
      body: JSON.stringify(request),
    });

    const result = await response.json();
    console.log(JSON.stringify(result));
  } catch (error) {
    console.log(JSON.stringify({
      jsonrpc: "2.0",
      id: null,
      error: {
        code: -32700,
        message: error instanceof Error ? error.message : "Parse error",
      },
    }));
  }
});

rl.on("close", () => {
  process.exit(0);
});
