import { query } from "../_generated/server";
import { v } from "convex/values";
import { getAuthContext, paginateResults } from "../lib/utils";
import { validationError } from "../lib/errors";

// Get audit log entries (activity feed)
export const list = query({
  args: {
    entityType: v.optional(
      v.union(
        v.literal("account"),
        v.literal("contact"),
        v.literal("opportunity"),
        v.literal("task"),
        v.literal("reminder"),
        v.literal("user"),
        v.literal("tenant")
      )
    ),
    entityId: v.optional(v.string()),
    userId: v.optional(v.string()),
    action: v.optional(
      v.union(
        v.literal("create"),
        v.literal("update"),
        v.literal("delete"),
        v.literal("restore")
      )
    ),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
    _token: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx, args._token);
    const limit = args.limit ?? 20;

    // Query by tenant
    let logs = await ctx.db
      .query("auditLogs")
      .withIndex("by_tenant_timestamp", (q) => q.eq("tenantId", auth.tenantId))
      .order("desc")
      .collect();

    // Apply filters
    let filtered = logs.filter((log) => {
      if (args.entityType && log.entityType !== args.entityType) return false;
      if (args.entityId && log.entityId !== args.entityId) return false;
      if (args.userId && log.userId !== args.userId) return false;
      if (args.action && log.action !== args.action) return false;
      if (args.startDate && log.timestamp < args.startDate) return false;
      if (args.endDate && log.timestamp > args.endDate) return false;
      return true;
    });

    // Apply cursor-based pagination
    if (args.cursor) {
      const cursorIndex = filtered.findIndex((l) => l._id === args.cursor);
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

// Get activity feed for an entity
export const getEntityHistory = query({
  args: {
    entityType: v.union(
      v.literal("account"),
      v.literal("contact"),
      v.literal("opportunity"),
      v.literal("task"),
      v.literal("reminder"),
      v.literal("user"),
      v.literal("tenant")
    ),
    entityId: v.string(),
    limit: v.optional(v.number()),
    _token: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx, args._token);
    const limit = args.limit ?? 50;

    const logs = await ctx.db
      .query("auditLogs")
      .withIndex("by_entity", (q) =>
        q.eq("entityType", args.entityType).eq("entityId", args.entityId)
      )
      .filter((q) => q.eq(q.field("tenantId"), auth.tenantId))
      .order("desc")
      .take(limit);

    return logs;
  },
});

// Get recent activity for current user
export const getMyActivity = query({
  args: {
    limit: v.optional(v.number()),
    _token: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx, args._token);
    const limit = args.limit ?? 20;

    const logs = await ctx.db
      .query("auditLogs")
      .withIndex("by_user", (q) => q.eq("userId", auth.userId))
      .order("desc")
      .take(limit);

    return logs;
  },
});

// Get activity summary (for dashboard)
export const getActivitySummary = query({
  args: {
    days: v.optional(v.number()),
    _token: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx, args._token);
    const days = args.days ?? 7;
    const startTime = Date.now() - days * 24 * 60 * 60 * 1000;

    const logs = await ctx.db
      .query("auditLogs")
      .withIndex("by_tenant_timestamp", (q) => q.eq("tenantId", auth.tenantId))
      .filter((q) => q.gte(q.field("timestamp"), startTime))
      .collect();

    // Group by action
    const byAction = logs.reduce(
      (acc, log) => {
        acc[log.action] = (acc[log.action] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    // Group by entity type
    const byEntityType = logs.reduce(
      (acc, log) => {
        acc[log.entityType] = (acc[log.entityType] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    // Group by day
    const byDay = logs.reduce(
      (acc, log) => {
        const day = new Date(log.timestamp).toISOString().split("T")[0];
        acc[day] = (acc[day] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    return {
      total: logs.length,
      byAction,
      byEntityType,
      byDay,
      period: {
        days,
        start: startTime,
        end: Date.now(),
      },
    };
  },
});
