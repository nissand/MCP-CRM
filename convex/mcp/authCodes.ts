import { internalMutation } from "../_generated/server";
import { v } from "convex/values";

// Generate a short random code
function generateCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let code = "";
  for (let i = 0; i < 32; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// Create an authorization code
export const create = internalMutation({
  args: {
    token: v.string(),
    sub: v.string(),
    state: v.string(),
  },
  handler: async (ctx, args) => {
    const code = generateCode();
    const now = Date.now();
    // Code expires in 5 minutes
    const expiresAt = now + 5 * 60 * 1000;

    await ctx.db.insert("oauthCodes", {
      code,
      token: args.token,
      sub: args.sub,
      state: args.state,
      createdAt: now,
      expiresAt,
    });

    return code;
  },
});

// Exchange an authorization code for a token
export const exchange = internalMutation({
  args: {
    code: v.string(),
    codeVerifier: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Find the code
    const codeRecord = await ctx.db
      .query("oauthCodes")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .first();

    if (!codeRecord) {
      return { error: "invalid_grant", error_description: "Invalid authorization code" };
    }

    // Delete the code (one-time use)
    await ctx.db.delete(codeRecord._id);

    // Check if expired
    if (codeRecord.expiresAt < Date.now()) {
      return { error: "invalid_grant", error_description: "Authorization code expired" };
    }

    // Look up and verify PKCE challenge (RFC 7636).
    const pkceChallenge = await ctx.db
      .query("oauthPkce")
      .withIndex("by_state", (q) => q.eq("state", codeRecord.state))
      .first();

    if (pkceChallenge) {
      // Consume the challenge (one-time use) regardless of outcome.
      await ctx.db.delete(pkceChallenge._id);

      if (pkceChallenge.expiresAt < Date.now()) {
        return { error: "invalid_grant", error_description: "PKCE challenge expired" };
      }

      if (!args.codeVerifier) {
        return { error: "invalid_grant", error_description: "code_verifier required" };
      }

      let expected: string;
      if (pkceChallenge.codeChallengeMethod === "S256") {
        const hashBuffer = await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(args.codeVerifier),
        );
        expected = btoa(String.fromCharCode(...new Uint8Array(hashBuffer)))
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/, "");
      } else {
        expected = args.codeVerifier;
      }

      if (expected !== pkceChallenge.codeChallenge) {
        return { error: "invalid_grant", error_description: "Invalid code_verifier" };
      }
    }
    // If no challenge is stored, the client did not opt into PKCE at authorize
    // time. OAuth 2.1 makes PKCE mandatory for public clients, but some legacy
    // MCP clients still omit it — allow that path but rely on the one-time
    // code + short lifetime for protection.

    // Refresh token is separate from access token so it can outlive it and
    // be rotated on use. See mcp/refreshTokens.ts for the mint/rotate flow.
    const refreshTokenValue = generateOpaqueToken();
    const now = Date.now();
    await ctx.db.insert("oauthRefreshTokens", {
      token: refreshTokenValue,
      sub: codeRecord.sub,
      createdAt: now,
      expiresAt: now + 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    return {
      access_token: codeRecord.token,
      token_type: "Bearer",
      expires_in: 3600,
      refresh_token: refreshTokenValue,
      scope: "mcp:tools",
    };
  },
});

function generateOpaqueToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// Clean up expired codes
export const cleanup = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const expired = await ctx.db
      .query("oauthCodes")
      .withIndex("by_expires_at")
      .filter((q) => q.lt(q.field("expiresAt"), now))
      .collect();

    for (const code of expired) {
      await ctx.db.delete(code._id);
    }

    return expired.length;
  },
});
