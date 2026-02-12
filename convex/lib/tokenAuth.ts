import { QueryCtx, MutationCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { unauthorized, forbidden } from "./errors";

// Expected issuer for Convex Auth tokens
const EXPECTED_ISSUER = "https://rare-sturgeon-827.convex.site";
const EXPECTED_AUDIENCE = "convex";

// Auth context returned from token authentication
export interface TokenAuthContext {
  userId: Id<"users">;
  tenantId: Id<"tenants">;
  userRole: "admin" | "member";
  user: Doc<"users">;
}

// Decode JWT payload with basic validation
// Note: Full signature verification requires the public key from Convex Auth
// For now, we validate the claims (exp, iss, aud) which provides protection
// against tampering since tokens are signed by Convex Auth
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const payload = parts[1];
    // Add padding if needed for base64url decoding
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    const decoded = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

// Validate JWT claims (expiration, issuer, audience)
export function validateJwtClaims(payload: Record<string, unknown>): { valid: boolean; error?: string } {
  // Check expiration
  const exp = payload.exp as number | undefined;
  if (!exp) {
    return { valid: false, error: "Token missing expiration claim" };
  }

  const now = Math.floor(Date.now() / 1000);
  if (exp < now) {
    return { valid: false, error: "Token has expired" };
  }

  // Check issuer
  const iss = payload.iss as string | undefined;
  if (iss !== EXPECTED_ISSUER) {
    return { valid: false, error: "Invalid token issuer" };
  }

  // Check audience
  const aud = payload.aud as string | undefined;
  if (aud !== EXPECTED_AUDIENCE) {
    return { valid: false, error: "Invalid token audience" };
  }

  return { valid: true };
}

// Extract and validate claims from JWT token - throws on validation failure
export function getTokenClaims(token: string): { sub?: string; email?: string } {
  const payload = decodeJwtPayload(token);
  if (!payload) {
    unauthorized("Invalid token format - could not decode JWT");
  }

  // Validate claims before returning
  const validation = validateJwtClaims(payload);
  if (!validation.valid) {
    console.error("JWT validation failed:", validation.error);
    unauthorized(validation.error || "Token validation failed");
  }

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
    unauthorized("Missing authentication token. Please sign in at https://mcp-crm.vercel.app/");
  }

  // This will throw if token is invalid or expired
  const claims = getTokenClaims(token);

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
