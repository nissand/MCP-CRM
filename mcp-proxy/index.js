#!/usr/bin/env node

/**
 * MCP Stdio-to-HTTP Proxy
 *
 * This script acts as a bridge between Claude Desktop (which uses stdio)
 * and the remote MCP-CRM HTTP server.
 *
 * Usage:
 *   MCP_CRM_TOKEN="your-token" node index.js
 */

const MCP_SERVER_URL = "https://rare-sturgeon-827.convex.site/mcp";

// Read token from environment
const TOKEN = process.env.MCP_CRM_TOKEN;

if (!TOKEN) {
  // Can't send error without a request - just exit
  process.stderr.write("MCP_CRM_TOKEN environment variable is required. Get your token from https://mcp-crm.vercel.app/\n");
  process.exit(1);
}

// Buffer for reading stdin
let buffer = "";
let pendingRequests = 0;
let stdinEnded = false;

process.stdin.setEncoding("utf8");

process.stdin.on("data", (chunk) => {
  buffer += chunk;

  // Try to parse complete JSON-RPC messages (newline-delimited)
  const lines = buffer.split("\n");
  buffer = lines.pop() || ""; // Keep incomplete line in buffer

  for (const line of lines) {
    if (line.trim()) {
      try {
        const request = JSON.parse(line);

        // Check if this is a notification (no id field)
        // Notifications don't expect responses
        if (request.id === undefined) {
          // This is a notification - don't send to server or respond
          // Just acknowledge it silently
          continue;
        }

        pendingRequests++;
        handleRequest(request).finally(() => {
          pendingRequests--;
          checkExit();
        });
      } catch (err) {
        // Parse error - but we don't know the id, so we can't respond properly
        // Just log to stderr
        process.stderr.write("Parse error: " + err.message + "\n");
      }
    }
  }
});

process.stdin.on("end", () => {
  stdinEnded = true;
  // Process any remaining content in buffer
  if (buffer.trim()) {
    try {
      const request = JSON.parse(buffer);

      // Check if this is a notification
      if (request.id === undefined) {
        // Notification - ignore
      } else {
        pendingRequests++;
        handleRequest(request).finally(() => {
          pendingRequests--;
          checkExit();
        });
      }
    } catch (err) {
      process.stderr.write("Parse error: " + err.message + "\n");
    }
    buffer = "";
  }
  checkExit();
});

function checkExit() {
  if (stdinEnded && pendingRequests === 0) {
    process.exit(0);
  }
}

async function handleRequest(request) {
  try {
    const response = await fetch(MCP_SERVER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${TOKEN}`,
        "Accept": "application/json"
      },
      body: JSON.stringify(request)
    });

    if (!response.ok) {
      const errorText = await response.text();
      process.stdout.write(JSON.stringify({
        jsonrpc: "2.0",
        id: request.id,
        error: {
          code: -32000,
          message: `HTTP error ${response.status}`,
          data: errorText
        }
      }) + "\n");
      return;
    }

    const result = await response.json();
    process.stdout.write(JSON.stringify(result) + "\n");
  } catch (err) {
    process.stdout.write(JSON.stringify({
      jsonrpc: "2.0",
      id: request.id,
      error: {
        code: -32000,
        message: "Request failed",
        data: err.message
      }
    }) + "\n");
  }
}

// Handle errors
process.on("uncaughtException", (err) => {
  process.stderr.write("Uncaught exception: " + err.message + "\n");
  process.exit(1);
});

process.on("unhandledRejection", (err) => {
  process.stderr.write("Unhandled rejection: " + err + "\n");
});
