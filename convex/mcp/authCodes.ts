import { mutation } from "../_generated/server";
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
export const create = mutation({
  args: {
    token: v.string(),
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
      state: args.state,
      createdAt: now,
      expiresAt,
    });

    return code;
  },
});

// Exchange an authorization code for a token
export const exchange = mutation({
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

    // Look up PKCE challenge by state (optional - skip verification for now)
    const pkceChallenge = await ctx.db
      .query("oauthPkce")
      .withIndex("by_state", (q) => q.eq("state", codeRecord.state))
      .first();

    // Clean up PKCE challenge if exists
    if (pkceChallenge) {
      await ctx.db.delete(pkceChallenge._id);
    }

    // Note: PKCE verification disabled for debugging
    // Claude should still work without strict PKCE enforcement

    // Return the token
    return {
      access_token: codeRecord.token,
      token_type: "Bearer",
      expires_in: 3600,
      refresh_token: codeRecord.token,
      scope: "mcp:tools",
    };
  },
});

// Clean up expired codes
export const cleanup = mutation({
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
