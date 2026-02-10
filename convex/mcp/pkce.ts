import { mutation, query } from "../_generated/server";
import { v } from "convex/values";

// Store PKCE challenge during authorization
export const store = mutation({
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

// Lookup and verify PKCE challenge during token exchange
export const verify = mutation({
  args: {
    state: v.string(),
    codeVerifier: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const challenge = await ctx.db
      .query("oauthPkce")
      .withIndex("by_state", (q) => q.eq("state", args.state))
      .first();

    if (!challenge) {
      return { valid: true }; // No PKCE stored, allow
    }

    // Delete the challenge (one-time use)
    await ctx.db.delete(challenge._id);

    // Check if expired
    if (challenge.expiresAt < Date.now()) {
      return { valid: false, error: "Challenge expired" };
    }

    // If no code_verifier provided but challenge exists, fail
    if (!args.codeVerifier) {
      return { valid: false, error: "Code verifier required" };
    }

    // Verify the code_verifier against code_challenge
    if (challenge.codeChallengeMethod === "S256") {
      // SHA256 hash the verifier and base64url encode
      const encoder = new TextEncoder();
      const data = encoder.encode(args.codeVerifier);
      const hashBuffer = await crypto.subtle.digest("SHA-256", data);
      const hashArray = new Uint8Array(hashBuffer);
      const hashBase64 = btoa(String.fromCharCode(...hashArray))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

      if (hashBase64 !== challenge.codeChallenge) {
        return { valid: false, error: "Invalid code verifier" };
      }
    } else {
      // Plain method
      if (args.codeVerifier !== challenge.codeChallenge) {
        return { valid: false, error: "Invalid code verifier" };
      }
    }

    return { valid: true };
  },
});

// Clean up expired challenges
export const cleanup = mutation({
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
