import { internalMutation } from "../_generated/server";
import { v } from "convex/values";

// Store PKCE challenge during authorization
export const store = internalMutation({
  args: {
    state: v.string(),
    codeChallenge: v.string(),
    codeChallengeMethod: v.string(),
    redirectUri: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    // PKCE challenge expires in 10 minutes
    const expiresAt = now + 10 * 60 * 1000;

    // Delete any existing challenge with same state
    const existing = await ctx.db
      .query("oauthPkce")
      .withIndex("by_state", (q) => q.eq("state", args.state))
      .first();
    if (existing) {
      await ctx.db.delete(existing._id);
    }

    await ctx.db.insert("oauthPkce", {
      state: args.state,
      codeChallenge: args.codeChallenge,
      codeChallengeMethod: args.codeChallengeMethod,
      redirectUri: args.redirectUri,
      createdAt: now,
      expiresAt,
    });
  },
});

// Clean up expired challenges
export const cleanup = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const expired = await ctx.db
      .query("oauthPkce")
      .withIndex("by_expires_at")
      .filter((q) => q.lt(q.field("expiresAt"), now))
      .collect();

    for (const challenge of expired) {
      await ctx.db.delete(challenge._id);
    }

    return expired.length;
  },
});
