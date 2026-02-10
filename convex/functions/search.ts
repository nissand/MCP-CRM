import { query } from "../_generated/server";
import { v } from "convex/values";
import { getAuthContext } from "../lib/utils";
import { validationError } from "../lib/errors";
import { searchSchema } from "../lib/validators";

// Unified search across all CRM entities
export const search = query({
  args: {
    query: v.string(),
    entityTypes: v.optional(
      v.array(
        v.union(
          v.literal("account"),
          v.literal("contact"),
          v.literal("opportunity"),
          v.literal("task"),
          v.literal("reminder")
        )
      )
    ),
    limit: v.optional(v.number()),
    _token: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx, args._token);

    const parsed = searchSchema.safeParse(args);
    if (!parsed.success) {
      validationError("Invalid search parameters", parsed.error.flatten());
    }

    const searchQuery = args.query.trim();
    if (searchQuery.length < 1) {
      validationError("Search query must be at least 1 character");
    }

    const limit = args.limit ?? 10;
    const entityTypes = args.entityTypes ?? [
      "account",
      "contact",
      "opportunity",
      "task",
      "reminder",
    ];

    const results: Array<{
      entityType: string;
      entity: unknown;
      score: number;
    }> = [];

    // Search accounts
    if (entityTypes.includes("account")) {
      const accounts = await ctx.db
        .query("accounts")
        .withSearchIndex("search_accounts", (q) =>
          q.search("name", searchQuery).eq("tenantId", auth.tenantId)
        )
        .filter((q) => q.eq(q.field("deletedAt"), undefined))
        .take(limit);

      for (const account of accounts) {
        results.push({
          entityType: "account",
          entity: account,
          score: calculateScore(account.name, searchQuery),
        });
      }
    }

    // Search contacts
    if (entityTypes.includes("contact")) {
      const contacts = await ctx.db
        .query("contacts")
        .withSearchIndex("search_contacts", (q) =>
          q.search("firstName", searchQuery).eq("tenantId", auth.tenantId)
        )
        .filter((q) => q.eq(q.field("deletedAt"), undefined))
        .take(limit);

      for (const contact of contacts) {
        const fullName = `${contact.firstName} ${contact.lastName}`;
        results.push({
          entityType: "contact",
          entity: contact,
          score: calculateScore(fullName, searchQuery),
        });
      }
    }

    // Search opportunities
    if (entityTypes.includes("opportunity")) {
      const opportunities = await ctx.db
        .query("opportunities")
        .withSearchIndex("search_opportunities", (q) =>
          q.search("name", searchQuery).eq("tenantId", auth.tenantId)
        )
        .filter((q) => q.eq(q.field("deletedAt"), undefined))
        .take(limit);

      for (const opp of opportunities) {
        results.push({
          entityType: "opportunity",
          entity: opp,
          score: calculateScore(opp.name, searchQuery),
        });
      }
    }

    // Search tasks
    if (entityTypes.includes("task")) {
      const tasks = await ctx.db
        .query("tasks")
        .withSearchIndex("search_tasks", (q) =>
          q.search("title", searchQuery).eq("tenantId", auth.tenantId)
        )
        .filter((q) => q.eq(q.field("deletedAt"), undefined))
        .take(limit);

      for (const task of tasks) {
        results.push({
          entityType: "task",
          entity: task,
          score: calculateScore(task.title, searchQuery),
        });
      }
    }

    // Search reminders
    if (entityTypes.includes("reminder")) {
      const reminders = await ctx.db
        .query("reminders")
        .withSearchIndex("search_reminders", (q) =>
          q.search("title", searchQuery).eq("tenantId", auth.tenantId)
        )
        .filter((q) => q.eq(q.field("deletedAt"), undefined))
        .take(limit);

      for (const reminder of reminders) {
        results.push({
          entityType: "reminder",
          entity: reminder,
          score: calculateScore(reminder.title, searchQuery),
        });
      }
    }

    // Sort by score and limit
    results.sort((a, b) => b.score - a.score);

    return {
      results: results.slice(0, limit),
      query: searchQuery,
      entityTypes,
    };
  },
});

// Calculate a simple relevance score
function calculateScore(text: string, query: string): number {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();

  // Exact match
  if (lowerText === lowerQuery) return 100;

  // Starts with query
  if (lowerText.startsWith(lowerQuery)) return 80;

  // Contains query as word
  if (lowerText.includes(` ${lowerQuery}`) || lowerText.includes(`${lowerQuery} `)) {
    return 60;
  }

  // Contains query
  if (lowerText.includes(lowerQuery)) return 40;

  // Partial match (any word starts with query)
  const words = lowerText.split(/\s+/);
  for (const word of words) {
    if (word.startsWith(lowerQuery)) return 30;
  }

  return 10;
}

// Get overdue items (tasks and reminders)
export const getOverdueItems = query({
  args: {
    limit: v.optional(v.number()),
    _token: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx, args._token);
    const currentTime = Date.now();
    const limit = args.limit ?? 20;

    // Get overdue tasks
    const overdueTasks = await ctx.db
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

    // Get overdue reminders
    const overdueReminders = await ctx.db
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

    // Combine and sort by due date
    const combined = [
      ...overdueTasks.map((t) => ({
        entityType: "task" as const,
        entity: t,
        dueAt: t.dueDate!,
      })),
      ...overdueReminders.map((r) => ({
        entityType: "reminder" as const,
        entity: r,
        dueAt: r.remindAt,
      })),
    ];

    combined.sort((a, b) => a.dueAt - b.dueAt);

    return {
      items: combined.slice(0, limit),
      counts: {
        tasks: overdueTasks.length,
        reminders: overdueReminders.length,
        total: overdueTasks.length + overdueReminders.length,
      },
    };
  },
});

// Get upcoming items
export const getUpcomingItems = query({
  args: {
    days: v.optional(v.number()),
    limit: v.optional(v.number()),
    _token: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx, args._token);
    const currentTime = Date.now();
    const days = args.days ?? 7;
    const endTime = currentTime + days * 24 * 60 * 60 * 1000;
    const limit = args.limit ?? 20;

    // Get upcoming tasks
    const upcomingTasks = await ctx.db
      .query("tasks")
      .withIndex("by_tenant", (q) => q.eq("tenantId", auth.tenantId))
      .filter((q) =>
        q.and(
          q.eq(q.field("deletedAt"), undefined),
          q.neq(q.field("status"), "completed"),
          q.neq(q.field("status"), "cancelled"),
          q.gte(q.field("dueDate"), currentTime),
          q.lte(q.field("dueDate"), endTime)
        )
      )
      .collect();

    // Get upcoming reminders
    const upcomingReminders = await ctx.db
      .query("reminders")
      .withIndex("by_tenant", (q) => q.eq("tenantId", auth.tenantId))
      .filter((q) =>
        q.and(
          q.eq(q.field("deletedAt"), undefined),
          q.eq(q.field("isCompleted"), false),
          q.gte(q.field("remindAt"), currentTime),
          q.lte(q.field("remindAt"), endTime)
        )
      )
      .collect();

    // Combine and sort by due date
    const combined = [
      ...upcomingTasks.map((t) => ({
        entityType: "task" as const,
        entity: t,
        dueAt: t.dueDate!,
      })),
      ...upcomingReminders.map((r) => ({
        entityType: "reminder" as const,
        entity: r,
        dueAt: r.remindAt,
      })),
    ];

    combined.sort((a, b) => a.dueAt - b.dueAt);

    return {
      items: combined.slice(0, limit),
      counts: {
        tasks: upcomingTasks.length,
        reminders: upcomingReminders.length,
        total: upcomingTasks.length + upcomingReminders.length,
      },
      period: {
        days,
        start: currentTime,
        end: endTime,
      },
    };
  },
});
