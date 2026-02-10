import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import {
  getAuthContext,
  verifyTenantAccess,
  withAudit,
  paginateResults,
  now,
} from "../lib/utils";
import {
  createReminderSchema,
  updateReminderSchema,
  listRemindersFilterSchema,
} from "../lib/validators";
import { notFound, validationError } from "../lib/errors";

// Create a new reminder
export const create = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    remindAt: v.number(),
    linkedEntityType: v.optional(
      v.union(
        v.literal("account"),
        v.literal("contact"),
        v.literal("opportunity"),
        v.literal("task")
      )
    ),
    linkedEntityId: v.optional(v.string()),
    assigneeId: v.optional(v.string()),
    _token: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx, args._token);

    // Validate input
    const parsed = createReminderSchema.safeParse(args);
    if (!parsed.success) {
      validationError("Invalid reminder data", parsed.error.flatten());
    }

    // Verify linked entity if provided
    if (args.linkedEntityType && args.linkedEntityId) {
      await verifyLinkedEntity(ctx, auth, args.linkedEntityType, args.linkedEntityId);
    }

    const timestamp = now();
    const reminderData = {
      tenantId: auth.tenantId,
      title: args.title,
      description: args.description,
      remindAt: args.remindAt,
      isCompleted: false,
      linkedEntityType: args.linkedEntityType,
      linkedEntityId: args.linkedEntityId,
      assigneeId: args.assigneeId ? (args.assigneeId as Id<"users">) : undefined,
      createdBy: auth.userId,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    const reminderId = await withAudit(
      ctx,
      auth,
      "create",
      "reminder",
      "pending",
      async () => {
        return await ctx.db.insert("reminders", reminderData);
      }
    );

    // Update audit log with actual ID
    const auditLog = await ctx.db
      .query("auditLogs")
      .withIndex("by_entity", (q) =>
        q.eq("entityType", "reminder").eq("entityId", "pending")
      )
      .order("desc")
      .first();

    if (auditLog) {
      await ctx.db.patch(auditLog._id, { entityId: reminderId });
    }

    return await ctx.db.get(reminderId);
  },
});

// Helper to verify linked entity exists
async function verifyLinkedEntity(
  ctx: any,
  auth: any,
  entityType: string,
  entityId: string
) {
  let entity;
  switch (entityType) {
    case "account":
      entity = await ctx.db.get(entityId as Id<"accounts">);
      break;
    case "contact":
      entity = await ctx.db.get(entityId as Id<"contacts">);
      break;
    case "opportunity":
      entity = await ctx.db.get(entityId as Id<"opportunities">);
      break;
    case "task":
      entity = await ctx.db.get(entityId as Id<"tasks">);
      break;
    default:
      validationError(`Invalid entity type: ${entityType}`);
  }

  if (!entity || entity.tenantId !== auth.tenantId) {
    notFound(entityType.charAt(0).toUpperCase() + entityType.slice(1));
  }

  if (entity.deletedAt !== undefined) {
    notFound(entityType.charAt(0).toUpperCase() + entityType.slice(1));
  }
}

// Get a single reminder by ID
export const get = query({
  args: { id: v.string(), _token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx, args._token);
    const reminder = await ctx.db.get(args.id as Id<"reminders">);
    return await verifyTenantAccess(reminder, auth, "Reminder");
  },
});

// List reminders with filters and pagination
export const list = query({
  args: {
    assigneeId: v.optional(v.string()),
    linkedEntityType: v.optional(
      v.union(
        v.literal("account"),
        v.literal("contact"),
        v.literal("opportunity"),
        v.literal("task")
      )
    ),
    linkedEntityId: v.optional(v.string()),
    upcoming: v.optional(v.boolean()),
    overdue: v.optional(v.boolean()),
    includeDeleted: v.optional(v.boolean()),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
    _token: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx, args._token);

    const parsed = listRemindersFilterSchema.safeParse(args);
    if (!parsed.success) {
      validationError("Invalid filter parameters", parsed.error.flatten());
    }

    const limit = args.limit ?? 20;
    const includeDeleted = args.includeDeleted ?? false;
    const currentTime = now();

    let reminders;
    if (args.assigneeId) {
      reminders = await ctx.db
        .query("reminders")
        .withIndex("by_assignee", (q) =>
          q.eq("assigneeId", args.assigneeId as Id<"users">)
        )
        .filter((q) => q.eq(q.field("tenantId"), auth.tenantId))
        .collect();
    } else if (args.linkedEntityType && args.linkedEntityId) {
      reminders = await ctx.db
        .query("reminders")
        .withIndex("by_linked_entity", (q) =>
          q
            .eq("linkedEntityType", args.linkedEntityType)
            .eq("linkedEntityId", args.linkedEntityId)
        )
        .filter((q) => q.eq(q.field("tenantId"), auth.tenantId))
        .collect();
    } else {
      reminders = await ctx.db
        .query("reminders")
        .withIndex("by_tenant", (q) => q.eq("tenantId", auth.tenantId))
        .collect();
    }

    // Apply filters
    let filtered = reminders.filter((r) => {
      if (!includeDeleted && r.deletedAt !== undefined) return false;
      if (args.upcoming) {
        if (r.isCompleted) return false;
        if (r.remindAt <= currentTime) return false;
      }
      if (args.overdue) {
        if (r.isCompleted) return false;
        if (r.remindAt > currentTime) return false;
      }
      return true;
    });

    // Sort by remind time
    filtered.sort((a, b) => a.remindAt - b.remindAt);

    // Apply cursor-based pagination
    if (args.cursor) {
      const cursorIndex = filtered.findIndex((r) => r._id === args.cursor);
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

// Update a reminder
export const update = mutation({
  args: {
    id: v.string(),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    remindAt: v.optional(v.number()),
    isCompleted: v.optional(v.boolean()),
    linkedEntityType: v.optional(
      v.union(
        v.literal("account"),
        v.literal("contact"),
        v.literal("opportunity"),
        v.literal("task")
      )
    ),
    linkedEntityId: v.optional(v.string()),
    assigneeId: v.optional(v.string()),
    _token: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx, args._token);
    const reminder = await ctx.db.get(args.id as Id<"reminders">);
    await verifyTenantAccess(reminder, auth, "Reminder");

    if (reminder!.deletedAt !== undefined) {
      notFound("Reminder");
    }

    const { id, _token, ...updates } = args;
    const parsed = updateReminderSchema.safeParse(updates);
    if (!parsed.success) {
      validationError("Invalid reminder data", parsed.error.flatten());
    }

    // Verify linked entity if being updated
    if (updates.linkedEntityType && updates.linkedEntityId) {
      await verifyLinkedEntity(ctx, auth, updates.linkedEntityType, updates.linkedEntityId);
    }

    const timestamp = now();
    const updateData: Record<string, unknown> = { updatedAt: timestamp };

    if (updates.title !== undefined) updateData.title = updates.title;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.remindAt !== undefined) updateData.remindAt = updates.remindAt;
    if (updates.isCompleted !== undefined) {
      updateData.isCompleted = updates.isCompleted;
      if (updates.isCompleted) {
        updateData.completedAt = timestamp;
      }
    }
    if (updates.linkedEntityType !== undefined)
      updateData.linkedEntityType = updates.linkedEntityType;
    if (updates.linkedEntityId !== undefined)
      updateData.linkedEntityId = updates.linkedEntityId;
    if (updates.assigneeId !== undefined)
      updateData.assigneeId = updates.assigneeId as Id<"users">;

    await withAudit(ctx, auth, "update", "reminder", args.id, async () => {
      await ctx.db.patch(args.id as Id<"reminders">, updateData);
    }, updates);

    return await ctx.db.get(args.id as Id<"reminders">);
  },
});

// Soft delete a reminder
export const remove = mutation({
  args: { id: v.string(), _token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx, args._token);
    const reminder = await ctx.db.get(args.id as Id<"reminders">);
    await verifyTenantAccess(reminder, auth, "Reminder");

    if (reminder!.deletedAt !== undefined) {
      notFound("Reminder");
    }

    await withAudit(ctx, auth, "delete", "reminder", args.id, async () => {
      await ctx.db.patch(args.id as Id<"reminders">, {
        deletedAt: now(),
        updatedAt: now(),
      });
    });

    return { success: true };
  },
});

// Restore a soft-deleted reminder
export const restore = mutation({
  args: { id: v.string(), _token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx, args._token);
    const reminder = await ctx.db.get(args.id as Id<"reminders">);

    if (!reminder || reminder.tenantId !== auth.tenantId) {
      notFound("Reminder");
    }

    if (reminder.deletedAt === undefined) {
      validationError("Reminder is not deleted");
    }

    await withAudit(ctx, auth, "restore", "reminder", args.id, async () => {
      await ctx.db.patch(args.id as Id<"reminders">, {
        deletedAt: undefined,
        updatedAt: now(),
      });
    });

    return await ctx.db.get(args.id as Id<"reminders">);
  },
});

// Get overdue reminders
export const getOverdue = query({
  args: {
    limit: v.optional(v.number()),
    _token: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx, args._token);
    const currentTime = now();
    const limit = args.limit ?? 20;

    const reminders = await ctx.db
      .query("reminders")
      .withIndex("by_tenant", (q) => q.eq("tenantId", auth.tenantId))
      .filter((q) =>
        q.and(
          q.eq(q.field("deletedAt"), undefined),
          q.eq(q.field("isCompleted"), false),
          q.lt(q.field("remindAt"), currentTime)
        )
      )
      .collect();

    // Sort by remind time (most overdue first)
    reminders.sort((a, b) => a.remindAt - b.remindAt);

    return reminders.slice(0, limit);
  },
});
