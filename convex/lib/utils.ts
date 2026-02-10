import { QueryCtx, MutationCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { unauthorized, forbidden, notFound } from "./errors";
import { getAuthContextFromToken } from "./tokenAuth";

// Auth context returned from authentication
export interface AuthContext {
  userId: Id<"users">;
  tenantId: Id<"tenants">;
  userRole: "admin" | "member";
  user: Doc<"users">;
}

// Get authenticated user context
// Supports both Convex Auth (ctx.auth) and token-based auth (for MCP HTTP)
export async function getAuthContext(
  ctx: QueryCtx | MutationCtx,
  token?: string | null
): Promise<AuthContext> {
  // If token provided, use token-based auth (for MCP HTTP requests)
  if (token) {
    return getAuthContextFromToken(ctx, token);
  }

  // Otherwise use Convex Auth
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    unauthorized();
  }

  // Get user by their identity
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

// Require admin role
export function requireAdmin(auth: AuthContext): void {
  if (auth.userRole !== "admin") {
    forbidden("Admin role required");
  }
}

// Verify entity belongs to tenant
export async function verifyTenantAccess<T extends { tenantId: Id<"tenants"> }>(
  entity: T | null,
  auth: AuthContext,
  entityName: string
): Promise<T> {
  if (!entity) {
    notFound(entityName);
  }

  if (entity.tenantId !== auth.tenantId) {
    notFound(entityName);
  }

  return entity;
}

// Audit log action types
export type AuditAction = "create" | "update" | "delete" | "restore";

// Entity types for audit logging
export type AuditEntityType =
  | "account"
  | "contact"
  | "opportunity"
  | "task"
  | "reminder"
  | "user"
  | "tenant";

// Log an audit event
export async function logAudit(
  ctx: MutationCtx,
  auth: AuthContext,
  action: AuditAction,
  entityType: AuditEntityType,
  entityId: string,
  changes?: unknown
): Promise<void> {
  await ctx.db.insert("auditLogs", {
    tenantId: auth.tenantId,
    userId: auth.userId,
    action,
    entityType,
    entityId,
    changes,
    timestamp: Date.now(),
  });
}

// Wrapper for mutations with audit logging
export async function withAudit<T>(
  ctx: MutationCtx,
  auth: AuthContext,
  action: AuditAction,
  entityType: AuditEntityType,
  entityId: string,
  fn: () => Promise<T>,
  changes?: unknown
): Promise<T> {
  const result = await fn();
  await logAudit(ctx, auth, action, entityType, entityId, changes);
  return result;
}

// Pagination helper
export interface PaginationResult<T> {
  items: T[];
  nextCursor?: string;
  hasMore: boolean;
}

export function paginateResults<T>(
  items: T[],
  limit: number,
  getCursor: (item: T) => string
): PaginationResult<T> {
  const hasMore = items.length > limit;
  const paginatedItems = hasMore ? items.slice(0, limit) : items;

  return {
    items: paginatedItems,
    nextCursor: hasMore ? getCursor(paginatedItems[paginatedItems.length - 1]) : undefined,
    hasMore,
  };
}

// Soft delete helper - check if entity is deleted
export function isDeleted(entity: { deletedAt?: number }): boolean {
  return entity.deletedAt !== undefined;
}

// Format response for MCP
export interface MCPResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  pagination?: {
    nextCursor?: string;
    hasMore: boolean;
  };
}

export function successResponse<T>(
  data: T,
  pagination?: { nextCursor?: string; hasMore: boolean }
): MCPResponse<T> {
  return {
    success: true,
    data,
    pagination,
  };
}

export function errorResponse(
  code: string,
  message: string,
  details?: unknown
): MCPResponse {
  return {
    success: false,
    error: { code, message, details },
  };
}

// Timestamp helpers
export function now(): number {
  return Date.now();
}

// ID validation helper
export function isValidId(id: string): boolean {
  return typeof id === "string" && id.length > 0;
}
