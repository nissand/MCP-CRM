import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { handleMCPRequest } from "./mcp/server";
import { api } from "./_generated/api";

const http = httpRouter();

// Base URL for this Convex deployment
const BASE_URL = "https://rare-sturgeon-827.convex.site";
const AUTH_APP_URL = "https://mcp-crm.vercel.app";

// MCP Protocol Version (Streamable HTTP Transport)
const MCP_PROTOCOL_VERSION = "2025-03-26";

// CORS headers for MCP
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID",
  "Access-Control-Expose-Headers": "Mcp-Session-Id, Mcp-Protocol-Version",
  "Access-Control-Max-Age": "86400",
};

// Generate a unique session ID
function generateSessionId(): string {
  return `mcp_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}

// ============================================
// OAuth 2.1 Discovery Endpoints (for Claude)
// ============================================

// OAuth Protected Resource Metadata (RFC 9728)
http.route({
  path: "/.well-known/oauth-protected-resource",
  method: "GET",
  handler: httpAction(async () => {
    return new Response(
      JSON.stringify({
        resource: `${BASE_URL}/mcp`,
        authorization_servers: [BASE_URL],
        scopes_supported: ["mcp:tools"],
        bearer_methods_supported: ["header"],
        resource_documentation: "MCP-CRM API",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }),
});

http.route({
  path: "/.well-known/oauth-protected-resource",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, { status: 204, headers: corsHeaders });
  }),
});

http.route({
  path: "/.well-known/oauth-authorization-server",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, { status: 204, headers: corsHeaders });
  }),
});

// OAuth Authorization Server Metadata (RFC 8414)
http.route({
  path: "/.well-known/oauth-authorization-server",
  method: "GET",
  handler: httpAction(async () => {
    return new Response(
      JSON.stringify({
        issuer: BASE_URL,
        authorization_endpoint: `${BASE_URL}/oauth/authorize`,
        token_endpoint: `${BASE_URL}/oauth/token`,
        registration_endpoint: `${BASE_URL}/oauth/register`,
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: ["none"],
        scopes_supported: ["mcp:tools"],
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }),
});

// Shared handler for client registration
const handleRegister = httpAction(async (ctx, request) => {
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const clientId = `client_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  return new Response(
    JSON.stringify({
      client_id: clientId,
      client_secret: "",
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_secret_expires_at: 0,
      redirect_uris: body.redirect_uris || [],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }),
    {
      status: 201,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    }
  );
});

// Shared handler for authorization
const handleAuthorize = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const redirectUri = url.searchParams.get("redirect_uri") || "";
  const state = url.searchParams.get("state") || "";
  const codeChallenge = url.searchParams.get("code_challenge") || "";
  const codeChallengeMethod = url.searchParams.get("code_challenge_method") || "S256";

  // Store PKCE challenge if provided
  if (state && codeChallenge) {
    await ctx.runMutation(api.mcp.pkce.store, {
      state,
      codeChallenge,
      codeChallengeMethod,
      redirectUri,
    });
  }

  const authAppUrl = new URL(AUTH_APP_URL);
  authAppUrl.searchParams.set("oauth_redirect_uri", redirectUri);
  authAppUrl.searchParams.set("oauth_state", state);
  if (codeChallenge) authAppUrl.searchParams.set("oauth_code_challenge", codeChallenge);
  if (codeChallengeMethod) authAppUrl.searchParams.set("oauth_code_challenge_method", codeChallengeMethod);

  return new Response(null, {
    status: 302,
    headers: { Location: authAppUrl.toString(), ...corsHeaders },
  });
});

// Shared handler for token exchange
const handleToken = httpAction(async (ctx, request) => {
  const contentType = request.headers.get("content-type") || "";
  let body: Record<string, string> = {};

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const text = await request.text();
    const params = new URLSearchParams(text);
    params.forEach((value, key) => { body[key] = value; });
  } else {
    try {
      body = await request.json();
    } catch {
      body = {};
    }
  }

  // Log the token request for debugging
  console.log("Token request received:", {
    grant_type: body.grant_type,
    code: body.code?.substring(0, 10) + "...",
    code_verifier: body.code_verifier ? "present" : "missing",
    redirect_uri: body.redirect_uri,
    client_id: body.client_id,
  });

  // Handle authorization_code grant (initial token request)
  if (body.grant_type === "authorization_code" && body.code) {
    try {
      // Exchange the short auth code for the JWT token
      const result = await ctx.runMutation(api.mcp.authCodes.exchange, {
        code: body.code,
        codeVerifier: body.code_verifier,
      });

      if ("error" in result) {
        console.error("Token exchange error:", result);
        return new Response(
          JSON.stringify(result),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      console.log("Token exchange success, token length:", result.access_token?.length);
      return new Response(
        JSON.stringify(result),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    } catch (err) {
      console.error("Token exchange exception:", err);
      return new Response(
        JSON.stringify({ error: "server_error", error_description: "Internal error during token exchange" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
  }

  // Handle refresh_token grant
  if (body.grant_type === "refresh_token" && body.refresh_token) {
    return new Response(
      JSON.stringify({
        access_token: body.refresh_token,
        token_type: "Bearer",
        expires_in: 3600,
        refresh_token: body.refresh_token,
        scope: "mcp:tools",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }

  return new Response(
    JSON.stringify({ error: "unsupported_grant_type" }),
    { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
  );
});

const handleOptionsToken = httpAction(async () => {
  return new Response(null, { status: 204, headers: corsHeaders });
});

// CORS preflight for all OAuth endpoints
const handleOptionsCors = httpAction(async () => {
  return new Response(null, { status: 204, headers: corsHeaders });
});

// Register OAuth endpoints at /oauth/* paths
http.route({ path: "/oauth/register", method: "POST", handler: handleRegister });
http.route({ path: "/oauth/register", method: "OPTIONS", handler: handleOptionsCors });
http.route({ path: "/oauth/authorize", method: "GET", handler: handleAuthorize });
http.route({ path: "/oauth/authorize", method: "OPTIONS", handler: handleOptionsCors });
http.route({ path: "/oauth/token", method: "POST", handler: handleToken });
http.route({ path: "/oauth/token", method: "OPTIONS", handler: handleOptionsCors });

// Also register at /mcp/* paths (Claude may look here)
http.route({ path: "/mcp/register", method: "POST", handler: handleRegister });
http.route({ path: "/mcp/register", method: "OPTIONS", handler: handleOptionsCors });
http.route({ path: "/mcp/authorize", method: "GET", handler: handleAuthorize });
http.route({ path: "/mcp/authorize", method: "OPTIONS", handler: handleOptionsCors });
http.route({ path: "/mcp/token", method: "POST", handler: handleToken });
http.route({ path: "/mcp/token", method: "OPTIONS", handler: handleOptionsCors });

// Helper to get token from request
function getToken(request: Request): string | null {
  const url = new URL(request.url);
  const tokenFromQuery = url.searchParams.get("token");
  const authHeader = request.headers.get("Authorization");
  const tokenFromHeader = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;
  return tokenFromQuery || tokenFromHeader;
}

// CORS preflight handler
http.route({
  path: "/mcp",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        ...corsHeaders,
        "Mcp-Protocol-Version": MCP_PROTOCOL_VERSION,
      },
    });
  }),
});

// Alias for /v1/mcp (fresh URL to avoid Claude caching issues)
http.route({
  path: "/v1/mcp",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }),
});

// MCP endpoint - GET (for SSE streams or server info)
http.route({
  path: "/mcp",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const token = getToken(request);

    // Check if this is a browser request (Accept header contains text/html)
    const acceptHeader = request.headers.get("Accept") || "";
    const isBrowser = acceptHeader.includes("text/html");

    // If no token and browser request, redirect to auth app (not Claude's callback!)
    if (!token && isBrowser) {
      return new Response(null, {
        status: 302,
        headers: {
          Location: AUTH_APP_URL,
          ...corsHeaders,
        },
      });
    }

    // If no token and API request, return 401 with OAuth hint
    if (!token) {
      return new Response(
        JSON.stringify({
          error: "unauthorized",
          message: "Authentication required. Please complete OAuth flow.",
        }),
        {
          status: 401,
          headers: {
            "Content-Type": "application/json",
            "WWW-Authenticate": `Bearer resource_metadata="${BASE_URL}/.well-known/oauth-protected-resource"`,
            ...corsHeaders,
          },
        }
      );
    }

    // Get or create session ID
    const clientSessionId = request.headers.get("Mcp-Session-Id");
    const sessionId = clientSessionId || generateSessionId();

    // Return server info for authenticated GET requests
    return new Response(
      JSON.stringify({
        name: "mcp-crm",
        version: "1.0.0",
        protocolVersion: MCP_PROTOCOL_VERSION,
        transport: "streamable-http",
        capabilities: {
          tools: {},
        },
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Mcp-Session-Id": sessionId,
          "Mcp-Protocol-Version": MCP_PROTOCOL_VERSION,
          ...corsHeaders,
        },
      }
    );
  }),
});

// MCP endpoint - POST (Streamable HTTP transport)
http.route({
  path: "/mcp",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const token = getToken(request);

      // Get or generate session ID
      const clientSessionId = request.headers.get("Mcp-Session-Id");
      const sessionId = clientSessionId || generateSessionId();

      // MCP response headers
      const mcpHeaders = {
        "Content-Type": "application/json",
        "Mcp-Session-Id": sessionId,
        "Mcp-Protocol-Version": MCP_PROTOCOL_VERSION,
        ...corsHeaders,
      };

      // Parse request body
      const body = await request.json();

      // Methods that don't require auth
      const publicMethods = ["initialize", "tools/list", "ping"];
      const isPublicMethod = publicMethods.includes(body.method);

      // If no token and not a public method, return 401 to trigger OAuth
      if (!token && !isPublicMethod) {
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: body.id ?? null,
            error: {
              code: -32001,
              message: "Authentication required",
            },
          }),
          {
            status: 401,
            headers: {
              ...mcpHeaders,
              "WWW-Authenticate": `Bearer resource_metadata="${BASE_URL}/.well-known/oauth-protected-resource"`,
            },
          }
        );
      }

      // Handle JSON-RPC request (pass token for auth)
      const response = await handleMCPRequest(ctx, body, token);

      // Check if this is a notification (no id in request)
      // For notifications, return 202 Accepted
      if (!body.id && (body.method?.startsWith("notifications/") || !body.method)) {
        return new Response(null, {
          status: 202,
          headers: mcpHeaders,
        });
      }

      return new Response(JSON.stringify(response), {
        status: 200,
        headers: mcpHeaders,
      });
    } catch (error) {
      // Handle parse errors or unexpected errors
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: null,
          error: {
            code: -32700,
            message: "Parse error",
            data: errorMessage,
          },
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Mcp-Protocol-Version": MCP_PROTOCOL_VERSION,
            ...corsHeaders,
          },
        }
      );
    }
  }),
});

// MCP endpoint - DELETE (session termination)
http.route({
  path: "/mcp",
  method: "DELETE",
  handler: httpAction(async () => {
    // Session terminated - return 204 No Content (success, no body)
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }),
});

// Base64URL encode/decode helpers (Buffer not available in Convex)
function base64UrlEncode(str: string): string {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(str: string): string {
  // Add back padding
  const padded = str + "=".repeat((4 - (str.length % 4)) % 4);
  return atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
}

// SSE endpoint for MCP (HTTP+SSE transport for backwards compatibility)
// This follows the format that works with Claude (matching Brightdata's pattern)
http.route({
  path: "/sse",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const token = url.searchParams.get("token") || "";

    // Create a session in the database and get a short session ID
    const sessionId = await ctx.runMutation(api.mcp.sessions.create, { token });

    // Return relative path like Brightdata does
    const body = [
      `event: endpoint`,
      `data: /messages?sessionId=${sessionId}`,
      ``,
      `event: message`,
      `data: ${JSON.stringify({
        jsonrpc: "2.0",
        method: "sse/connection",
        params: { message: "SSE Connection established" },
      })}`,
      ``,
      ``
    ].join("\n");

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        ...corsHeaders,
      },
    });
  }),
});

http.route({
  path: "/sse",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, { status: 204, headers: corsHeaders });
  }),
});

// Messages endpoint for HTTP+SSE transport (receives POSTed JSON-RPC messages)
// Uses /messages path to match Brightdata's pattern
http.route({
  path: "/messages",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const sessionId = url.searchParams.get("sessionId");

      // Look up token from session ID in database
      let token: string | null = null;
      if (sessionId) {
        token = await ctx.runQuery(api.mcp.sessions.lookup, { sessionId });
      }

      // Also check Authorization header as fallback
      if (!token) {
        token = getToken(request);
      }

      const body = await request.json();

      // Methods that don't require auth
      const publicMethods = ["initialize", "tools/list", "ping"];
      const isPublicMethod = publicMethods.includes(body.method);

      if (!token && !isPublicMethod) {
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: body.id ?? null,
            error: { code: -32001, message: "Authentication required" },
          }),
          { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      const response = await handleMCPRequest(ctx, body, token);
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    } catch (error) {
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: null,
          error: { code: -32700, message: "Parse error" },
        }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
  }),
});

http.route({
  path: "/messages",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, { status: 204, headers: corsHeaders });
  }),
});

// Create authorization code endpoint (called by auth app)
http.route({
  path: "/oauth/code",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { token, state } = body as { token: string; state: string };

      if (!token) {
        return new Response(
          JSON.stringify({ error: "Token required" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      const code = await ctx.runMutation(api.mcp.authCodes.create, {
        token,
        state: state || "",
      });

      return new Response(
        JSON.stringify({ code }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    } catch (error) {
      return new Response(
        JSON.stringify({ error: "Failed to create code" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
  }),
});

http.route({
  path: "/oauth/code",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, { status: 204, headers: corsHeaders });
  }),
});

// Health check endpoint
http.route({
  path: "/health",
  method: "GET",
  handler: httpAction(async () => {
    return new Response(
      JSON.stringify({
        status: "ok",
        service: "mcp-crm",
        version: "1.0.0",
        timestamp: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      }
    );
  }),
});

// Auth routes for Convex Auth
import { auth } from "./auth";
auth.addHttpRoutes(http);

// Root redirect - after OAuth callback, redirect to auth app
http.route({
  path: "/",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    // Preserve any query params (like code) and redirect to auth app
    const authAppUrl = new URL(AUTH_APP_URL);
    url.searchParams.forEach((value, key) => {
      authAppUrl.searchParams.set(key, value);
    });

    return new Response(null, {
      status: 302,
      headers: {
        Location: authAppUrl.toString(),
        ...corsHeaders,
      },
    });
  }),
});

export default http;
