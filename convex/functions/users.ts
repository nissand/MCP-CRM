import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import {
  getAuthContext,
  requireAdmin,
  withAudit,
  paginateResults,
  now,
} from "../lib/utils";
import { inviteUserSchema } from "../lib/validators";
import {
  notFound,
  validationError,
  duplicateInvite,
  forbidden,
} from "../lib/errors";
import { ErrorCodes } from "../lib/errors";

// Invite a new user (admin only)
export const invite = mutation({
  args: {
    email: v.string(),
    name: v.string(),
    role: v.optional(v.union(v.literal("admin"), v.literal("member"))),
    _token: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx, args._token);
    requireAdmin(auth);

    const parsed = inviteUserSchema.safeParse(args);
    if (!parsed.success) {
      validationError("Invalid user data", parsed.error.flatten());
    }

    // Check if user already exists in this tenant
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_tenant_email", (q) =>
        q.eq("tenantId", auth.tenantId).eq("email", args.email)
      )
      .first();

    if (existingUser) {
      duplicateInvite(args.email);
    }

    // Check if email exists in another tenant (they can still be invited)
    const existingGlobalUser = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();

    if (existingGlobalUser) {
      // For now, we don't support users in multiple tenants
      validationError(
        "This email is already registered with another organization"
      );
    }

    const timestamp = now();
    const userData = {
      tenantId: auth.tenantId,
      email: args.email,
      name: args.name,
      role: args.role ?? "member",
      isActive: false, // Will be activated on first login
      invitedBy: auth.userId,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    const userId = await withAudit(
      ctx,
      auth,
      "create",
      "user",
      "pending",
      async () => {
        return await ctx.db.insert("users", userData);
      }
    );

    // Update audit log with actual ID
    const auditLog = await ctx.db
      .query("auditLogs")
      .withIndex("by_entity", (q) =>
        q.eq("entityType", "user").eq("entityId", "pending")
      )
      .order("desc")
      .first();

    if (auditLog) {
      await ctx.db.patch(auditLog._id, { entityId: userId });
    }

    return await ctx.db.get(userId);
  },
});

// List users in tenant
export const list = query({
  args: {
    includeInactive: v.optional(v.boolean()),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
    _token: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx, args._token);

    const limit = args.limit ?? 20;
    const includeInactive = args.includeInactive ?? false;

    const users = await ctx.db
      .query("users")
      .withIndex("by_tenant", (q) => q.eq("tenantId", auth.tenantId))
      .collect();

    let filtered = users.filter((u) => {
      if (!includeInactive && !u.isActive) return false;
      return true;
    });

    // Apply cursor-based pagination
    if (args.cursor) {
      const cursorIndex = filtered.findIndex((u) => u._id === args.cursor);
      if (cursorIndex !== -1) {
        filtered = filtered.slice(cursorIndex + 1);
      }
    }

    return paginateResults(
      filtered.slice(0, limit + 1),
      limit,
      (item) => item._id
    );
  },
});

// Get a single user
export const get = query({
  args: { id: v.string(), _token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx, args._token);
    const user = await ctx.db.get(args.id as Id<"users">);

    if (!user || user.tenantId !== auth.tenantId) {
      notFound("User");
    }

    return user;
  },
});

// Deactivate a user (admin only)
export const deactivate = mutation({
  args: { id: v.string(), _token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx, args._token);
    requireAdmin(auth);

    const user = await ctx.db.get(args.id as Id<"users">);
    if (!user || user.tenantId !== auth.tenantId) {
      notFound("User");
    }

    // Cannot deactivate self
    if (user._id === auth.userId) {
      throw new Error("Cannot deactivate your own account");
    }

    // Check if this is the last admin
    if (user.role === "admin") {
      const adminCount = await ctx.db
        .query("users")
        .withIndex("by_tenant", (q) => q.eq("tenantId", auth.tenantId))
        .filter((q) =>
          q.and(q.eq(q.field("role"), "admin"), q.eq(q.field("isActive"), true))
        )
        .collect();

      if (adminCount.length <= 1) {
        throw new Error("Cannot deactivate the last admin");
      }
    }

    await withAudit(ctx, auth, "update", "user", args.id, async () => {
      await ctx.db.patch(args.id as Id<"users">, {
        isActive: false,
        updatedAt: now(),
      });
    }, { isActive: false });

    return await ctx.db.get(args.id as Id<"users">);
  },
});

// Reactivate a user (admin only)
export const reactivate = mutation({
  args: { id: v.string(), _token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx, args._token);
    requireAdmin(auth);

    const user = await ctx.db.get(args.id as Id<"users">);
    if (!user || user.tenantId !== auth.tenantId) {
      notFound("User");
    }

    if (user.isActive) {
      validationError("User is already active");
    }

    await withAudit(ctx, auth, "update", "user", args.id, async () => {
      await ctx.db.patch(args.id as Id<"users">, {
        isActive: true,
        updatedAt: now(),
      });
    }, { isActive: true });

    return await ctx.db.get(args.id as Id<"users">);
  },
});

// Update user role (admin only)
export const updateRole = mutation({
  args: {
    id: v.string(),
    role: v.union(v.literal("admin"), v.literal("member")),
    _token: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx, args._token);
    requireAdmin(auth);

    const user = await ctx.db.get(args.id as Id<"users">);
    if (!user || user.tenantId !== auth.tenantId) {
      notFound("User");
    }

    // Cannot change own role
    if (user._id === auth.userId) {
      forbidden("Cannot change your own role");
    }

    // Check if demoting the last admin
    if (user.role === "admin" && args.role === "member") {
      const adminCount = await ctx.db
        .query("users")
        .withIndex("by_tenant", (q) => q.eq("tenantId", auth.tenantId))
        .filter((q) =>
          q.and(q.eq(q.field("role"), "admin"), q.eq(q.field("isActive"), true))
        )
        .collect();

      if (adminCount.length <= 1) {
        throw new Error("Cannot demote the last admin");
      }
    }

    await withAudit(ctx, auth, "update", "user", args.id, async () => {
      await ctx.db.patch(args.id as Id<"users">, {
        role: args.role,
        updatedAt: now(),
      });
    }, { role: args.role });

    return await ctx.db.get(args.id as Id<"users">);
  },
});

// Get current user
export const me = query({
  args: { _token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx, args._token);
    return auth.user;
  },
});
