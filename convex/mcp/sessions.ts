import { mutation, query } from "../_generated/server";
import { v } from "convex/values";

// Generate a short UUID-like session ID
function generateShortId(): string {
  const chars = "0123456789abcdef";
  const segments = [8, 4, 4, 4, 12];
  return segments
    .map((len) =>
      Array.from({ length: len }, () =>
        chars[Math.floor(Math.random() * chars.length)]
      ).join("")
    )
    .join("-");
}

// Create a new MCP session
export const create = mutation({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const sessionId = generateShortId();
    const now = Date.now();
    // Session expires in 1 hour (matching JWT expiry)
    const expiresAt = now + 60 * 60 * 1000;

    await ctx.db.insert("mcpSessions", {
      sessionId,
      token: args.token,
      createdAt: now,
      expiresAt,
    });

    return sessionId;
  },
});

// Look up a session by ID
export const lookup = query({
  args: {
    sessionId: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("mcpSessions")
      .withIndex("by_session_id", (q) => q.eq("sessionId", args.sessionId))
      .first();

    if (!session) {
      return null;
    }

    // Check if expired
    if (session.expiresAt < Date.now()) {
      return null;
    }

    return session.token;
  },
});

// Clean up expired sessions (can be called periodically)
export const cleanup = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const expired = await ctx.db
      .query("mcpSessions")
      .withIndex("by_expires_at")
      .filter((q) => q.lt(q.field("expiresAt"), now))
      .collect();

    for (const session of expired) {
      await ctx.db.delete(session._id);
    }

    return expired.length;
  },
});
