import { QueryCtx, MutationCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { unauthorized, forbidden } from "./errors";

// Auth context returned from token authentication
export interface TokenAuthContext {
  userId: Id<"users">;
  tenantId: Id<"tenants">;
  userRole: "admin" | "member";
  user: Doc<"users">;
}

// Decode JWT payload (without verification - Convex Auth already signed it)
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const payload = parts[1];
    const decoded = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

// Extract claims from JWT token
export function getTokenClaims(token: string): { sub?: string; email?: string } | null {
  const payload = decodeJwtPayload(token);
  if (!payload) return null;

  return {
    sub: payload.sub as string | undefined,
    email: payload.email as string | undefined,
  };
}

// Get auth context from token - for use in queries/mutations
export async function getAuthContextFromToken(
  ctx: QueryCtx | MutationCtx,
  token: string | null | undefined
): Promise<TokenAuthContext> {
  if (!token) {
    unauthorized("Missing authentication token");
  }

  const claims = getTokenClaims(token);
  if (!claims) {
    unauthorized("Invalid token format");
  }

  let user: Doc<"users"> | null = null;

  // Try to look up by user ID first (sub claim from Convex Auth)
  // Convex Auth sub format: "userId|sessionId" - we need just the userId
  if (claims.sub) {
    try {
      const userId = claims.sub.split("|")[0]; // Extract user ID before the pipe
      user = await ctx.db.get(userId as Id<"users">);
    } catch {
      // Invalid ID format, try email lookup
    }
  }

  // Fall back to email lookup
  if (!user && claims.email) {
    user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", claims.email!))
      .first();
  }

  if (!user) {
    unauthorized("User not found. Please sign in at the auth app first.");
  }

  if (!user.isActive) {
    forbidden("User account is deactivated");
  }

  return {
    userId: user._id,
    tenantId: user.tenantId,
    userRole: user.role,
    user,
  };
}
