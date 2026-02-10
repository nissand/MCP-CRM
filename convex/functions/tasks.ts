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
  createTaskSchema,
  updateTaskSchema,
  listTasksFilterSchema,
} from "../lib/validators";
import { notFound, validationError } from "../lib/errors";

// Create a new task
export const create = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("in_progress"),
        v.literal("completed"),
        v.literal("cancelled")
      )
    ),
    priority: v.optional(
      v.union(v.literal("low"), v.literal("medium"), v.literal("high"))
    ),
    dueDate: v.optional(v.number()),
    linkedEntityType: v.optional(
      v.union(
        v.literal("account"),
        v.literal("contact"),
        v.literal("opportunity")
      )
    ),
    linkedEntityId: v.optional(v.string()),
    assigneeId: v.optional(v.string()),
    _token: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx, args._token);

    // Validate input
    const parsed = createTaskSchema.safeParse(args);
    if (!parsed.success) {
      validationError("Invalid task data", parsed.error.flatten());
    }

    // Verify linked entity if provided
    if (args.linkedEntityType && args.linkedEntityId) {
      await verifyLinkedEntity(ctx, auth, args.linkedEntityType, args.linkedEntityId);
    }

    const timestamp = now();
    const taskData = {
      tenantId: auth.tenantId,
      title: args.title,
      description: args.description,
      status: args.status ?? "pending",
      priority: args.priority ?? "medium",
      dueDate: args.dueDate,
      linkedEntityType: args.linkedEntityType,
      linkedEntityId: args.linkedEntityId,
      assigneeId: args.assigneeId ? (args.assigneeId as Id<"users">) : undefined,
      createdBy: auth.userId,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    const taskId = await withAudit(
      ctx,
      auth,
      "create",
      "task",
      "pending",
      async () => {
        return await ctx.db.insert("tasks", taskData);
      }
    );

    // Update audit log with actual ID
    const auditLog = await ctx.db
      .query("auditLogs")
      .withIndex("by_entity", (q) =>
        q.eq("entityType", "task").eq("entityId", "pending")
      )
      .order("desc")
      .first();

    if (auditLog) {
      await ctx.db.patch(auditLog._id, { entityId: taskId });
    }

    return await ctx.db.get(taskId);
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

// Get a single task by ID
export const get = query({
  args: { id: v.string(), _token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx, args._token);
    const task = await ctx.db.get(args.id as Id<"tasks">);
    return await verifyTenantAccess(task, auth, "Task");
  },
});

// List tasks with filters and pagination
export const list = query({
  args: {
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("in_progress"),
        v.literal("completed"),
        v.literal("cancelled")
      )
    ),
    priority: v.optional(
      v.union(v.literal("low"), v.literal("medium"), v.literal("high"))
    ),
    assigneeId: v.optional(v.string()),
    linkedEntityType: v.optional(
      v.union(
        v.literal("account"),
        v.literal("contact"),
        v.literal("opportunity")
      )
    ),
    linkedEntityId: v.optional(v.string()),
    overdue: v.optional(v.boolean()),
    includeDeleted: v.optional(v.boolean()),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
    _token: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx, args._token);

    const parsed = listTasksFilterSchema.safeParse(args);
    if (!parsed.success) {
      validationError("Invalid filter parameters", parsed.error.flatten());
    }

    const limit = args.limit ?? 20;
    const includeDeleted = args.includeDeleted ?? false;
    const currentTime = now();

    let tasks;
    if (args.status) {
      tasks = await ctx.db
        .query("tasks")
        .withIndex("by_status", (q) =>
          q.eq("tenantId", auth.tenantId).eq("status", args.status!)
        )
        .collect();
    } else if (args.assigneeId) {
      tasks = await ctx.db
        .query("tasks")
        .withIndex("by_assignee", (q) =>
          q.eq("assigneeId", args.assigneeId as Id<"users">)
        )
        .filter((q) => q.eq(q.field("tenantId"), auth.tenantId))
        .collect();
    } else if (args.linkedEntityType && args.linkedEntityId) {
      tasks = await ctx.db
        .query("tasks")
        .withIndex("by_linked_entity", (q) =>
          q
            .eq("linkedEntityType", args.linkedEntityType)
            .eq("linkedEntityId", args.linkedEntityId)
        )
        .filter((q) => q.eq(q.field("tenantId"), auth.tenantId))
        .collect();
    } else {
      tasks = await ctx.db
        .query("tasks")
        .withIndex("by_tenant", (q) => q.eq("tenantId", auth.tenantId))
        .collect();
    }

    // Apply filters
    let filtered = tasks.filter((t) => {
      if (!includeDeleted && t.deletedAt !== undefined) return false;
      if (args.priority && t.priority !== args.priority) return false;
      if (args.overdue) {
        if (!t.dueDate || t.dueDate > currentTime) return false;
        if (t.status === "completed" || t.status === "cancelled") return false;
      }
      return true;
    });

    // Sort by due date (nulls last), then by priority
    filtered.sort((a, b) => {
      if (a.dueDate && b.dueDate) return a.dueDate - b.dueDate;
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    // Apply cursor-based pagination
    if (args.cursor) {
      const cursorIndex = filtered.findIndex((t) => t._id === args.cursor);
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

// Update a task
export const update = mutation({
  args: {
    id: v.string(),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("in_progress"),
        v.literal("completed"),
        v.literal("cancelled")
      )
    ),
    priority: v.optional(
      v.union(v.literal("low"), v.literal("medium"), v.literal("high"))
    ),
    dueDate: v.optional(v.number()),
    linkedEntityType: v.optional(
      v.union(
        v.literal("account"),
        v.literal("contact"),
        v.literal("opportunity")
      )
    ),
    linkedEntityId: v.optional(v.string()),
    assigneeId: v.optional(v.string()),
    _token: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx, args._token);
    const task = await ctx.db.get(args.id as Id<"tasks">);
    await verifyTenantAccess(task, auth, "Task");

    if (task!.deletedAt !== undefined) {
      notFound("Task");
    }

    const { id, _token, ...updates } = args;
    const parsed = updateTaskSchema.safeParse(updates);
    if (!parsed.success) {
      validationError("Invalid task data", parsed.error.flatten());
    }

    // Verify linked entity if being updated
    if (updates.linkedEntityType && updates.linkedEntityId) {
      await verifyLinkedEntity(ctx, auth, updates.linkedEntityType, updates.linkedEntityId);
    }

    const timestamp = now();
    const updateData: Record<string, unknown> = { updatedAt: timestamp };

    if (updates.title !== undefined) updateData.title = updates.title;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.status !== undefined) {
      updateData.status = updates.status;
      if (updates.status === "completed") {
        updateData.completedAt = timestamp;
      }
    }
    if (updates.priority !== undefined) updateData.priority = updates.priority;
    if (updates.dueDate !== undefined) updateData.dueDate = updates.dueDate;
    if (updates.linkedEntityType !== undefined)
      updateData.linkedEntityType = updates.linkedEntityType;
    if (updates.linkedEntityId !== undefined)
      updateData.linkedEntityId = updates.linkedEntityId;
    if (updates.assigneeId !== undefined)
      updateData.assigneeId = updates.assigneeId as Id<"users">;

    await withAudit(ctx, auth, "update", "task", args.id, async () => {
      await ctx.db.patch(args.id as Id<"tasks">, updateData);
    }, updates);

    return await ctx.db.get(args.id as Id<"tasks">);
  },
});

// Soft delete a task
export const remove = mutation({
  args: { id: v.string(), _token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx, args._token);
    const task = await ctx.db.get(args.id as Id<"tasks">);
    await verifyTenantAccess(task, auth, "Task");

    if (task!.deletedAt !== undefined) {
      notFound("Task");
    }

    await withAudit(ctx, auth, "delete", "task", args.id, async () => {
      await ctx.db.patch(args.id as Id<"tasks">, {
        deletedAt: now(),
        updatedAt: now(),
      });
    });

    return { success: true };
  },
});

// Restore a soft-deleted task
export const restore = mutation({
  args: { id: v.string(), _token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx, args._token);
    const task = await ctx.db.get(args.id as Id<"tasks">);

    if (!task || task.tenantId !== auth.tenantId) {
      notFound("Task");
    }

    if (task.deletedAt === undefined) {
      validationError("Task is not deleted");
    }

    await withAudit(ctx, auth, "restore", "task", args.id, async () => {
      await ctx.db.patch(args.id as Id<"tasks">, {
        deletedAt: undefined,
        updatedAt: now(),
      });
    });

    return await ctx.db.get(args.id as Id<"tasks">);
  },
});

// Get overdue tasks
export const getOverdue = query({
  args: {
    limit: v.optional(v.number()),
    _token: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx, args._token);
    const currentTime = now();
    const limit = args.limit ?? 20;

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_tenant", (q) => q.eq("tenantId", auth.tenantId))
      .filter((q) =>
        q.and(
          q.eq(q.field("deletedAt"), undefined),
          q.neq(q.field("status"), "completed"),
          q.neq(q.field("status"), "cancelled"),
          q.lt(q.field("dueDate"), currentTime)
        )
      )
      .collect();

    // Sort by due date (most overdue first)
    tasks.sort((a, b) => (a.dueDate ?? 0) - (b.dueDate ?? 0));

    return tasks.slice(0, limit);
  },
});
