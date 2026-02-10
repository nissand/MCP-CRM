import { QueryCtx, MutationCtx, ActionCtx } from "../_generated/server";
import { Id, Doc } from "../_generated/dataModel";
import { unauthorized, forbidden } from "../lib/errors";

// Auth context returned from MCP authentication
export interface MCPAuthContext {
  userId: Id<"users">;
  tenantId: Id<"tenants">;
  userRole: "admin" | "member";
  user: Doc<"users">;
}

// Authenticate MCP request from Bearer token
export async function authenticateMCP(
  ctx: QueryCtx | MutationCtx,
  authHeader: string | null
): Promise<MCPAuthContext> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    unauthorized("Missing or invalid Authorization header");
  }

  // The token is handled by Convex Auth
  // ctx.auth.getUserIdentity() will validate the token
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    unauthorized("Invalid or expired token");
  }

  // Get user by email from identity
  const user = await ctx.db
    .query("users")
    .withIndex("by_email", (q) => q.eq("email", identity.email!))
    .first();

  if (!user) {
    unauthorized("User not found");
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

// Require admin role for MCP operations
export function requireMCPAdmin(auth: MCPAuthContext): void {
  if (auth.userRole !== "admin") {
    forbidden("Admin role required for this operation");
  }
}
