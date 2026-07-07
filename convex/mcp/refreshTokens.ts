import { internalMutation } from "../_generated/server";
import { v } from "convex/values";

// Opaque token generator — 32 random bytes as base64url. Long enough to be
// unguessable, short enough to fit in a header/URL comfortably.
function generateOpaqueToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Rotate an incoming refresh token: verify it exists and hasn't expired,
 * delete the old row (single-use), and insert a fresh one for the same sub.
 * Returns { sub, newRefreshToken, expiresAt } on success, or { error } on failure.
 */
export const rotate = internalMutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("oauthRefreshTokens")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();

    if (!existing) {
      return { error: "invalid_grant" as const };
    }

    // Single-use: delete unconditionally so a leaked-but-unused token can only
    // ever be redeemed once.
    await ctx.db.delete(existing._id);

    if (existing.expiresAt < Date.now()) {
      return { error: "invalid_grant" as const };
    }

    const now = Date.now();
    const expiresAt = now + 30 * 24 * 60 * 60 * 1000;
    const newRefreshToken = generateOpaqueToken();
    await ctx.db.insert("oauthRefreshTokens", {
      token: newRefreshToken,
      sub: existing.sub,
      createdAt: now,
      expiresAt,
    });

    return { sub: existing.sub, newRefreshToken, expiresAt };
  },
});

// Purge expired refresh tokens. Not scheduled here — run manually or via
// Convex's cron scheduler if it becomes a concern.
export const cleanup = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const expired = await ctx.db
      .query("oauthRefreshTokens")
      .withIndex("by_expires_at")
      .filter((q) => q.lt(q.field("expiresAt"), now))
      .collect();
    for (const row of expired) await ctx.db.delete(row._id);
    return expired.length;
  },
});
