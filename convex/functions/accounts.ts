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
  createAccountSchema,
  updateAccountSchema,
  listAccountsFilterSchema,
} from "../lib/validators";
import { hasDependencies, notFound, validationError } from "../lib/errors";

// Create a new account
export const create = mutation({
  args: {
    name: v.string(),
    industry: v.optional(v.string()),
    website: v.optional(v.string()),
    phone: v.optional(v.string()),
    address: v.optional(
      v.object({
        street: v.optional(v.string()),
        city: v.optional(v.string()),
        state: v.optional(v.string()),
        postalCode: v.optional(v.string()),
        country: v.optional(v.string()),
      })
    ),
    notes: v.optional(v.string()),
    ownerId: v.optional(v.string()),
    _token: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx, args._token);

    // Validate input
    const parsed = createAccountSchema.safeParse(args);
    if (!parsed.success) {
      validationError("Invalid account data", parsed.error.flatten());
    }

    const timestamp = now();
    const accountData = {
      tenantId: auth.tenantId,
      name: args.name,
      industry: args.industry,
      website: args.website,
      phone: args.phone,
      address: args.address,
      notes: args.notes,
      ownerId: args.ownerId ? (args.ownerId as Id<"users">) : undefined,
      createdBy: auth.userId,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    const accountId = await withAudit(
      ctx,
      auth,
      "create",
      "account",
      "pending",
      async () => {
        return await ctx.db.insert("accounts", accountData);
      }
    );

    // Update audit log with actual ID
    const auditLog = await ctx.db
      .query("auditLogs")
      .withIndex("by_entity", (q) =>
        q.eq("entityType", "account").eq("entityId", "pending")
      )
      .order("desc")
      .first();

    if (auditLog) {
      await ctx.db.patch(auditLog._id, { entityId: accountId });
    }

    return await ctx.db.get(accountId);
  },
});

// Get a single account by ID
export const get = query({
  args: { id: v.string(), _token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx, args._token);
    const account = await ctx.db.get(args.id as Id<"accounts">);
    return await verifyTenantAccess(account, auth, "Account");
  },
});

// List accounts with filters and pagination
export const list = query({
  args: {
    industry: v.optional(v.string()),
    ownerId: v.optional(v.string()),
    includeDeleted: v.optional(v.boolean()),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
    _token: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx, args._token);

    const parsed = listAccountsFilterSchema.safeParse(args);
    if (!parsed.success) {
      validationError("Invalid filter parameters", parsed.error.flatten());
    }

    const limit = args.limit ?? 20;
    const includeDeleted = args.includeDeleted ?? false;

    let query = ctx.db
      .query("accounts")
      .withIndex("by_tenant", (q) => q.eq("tenantId", auth.tenantId));

    const accounts = await query.collect();

    // Apply filters
    let filtered = accounts.filter((a) => {
      if (!includeDeleted && a.deletedAt !== undefined) return false;
      if (args.industry && a.industry !== args.industry) return false;
      if (args.ownerId && a.ownerId !== args.ownerId) return false;
      return true;
    });

    // Apply cursor-based pagination
    if (args.cursor) {
      const cursorIndex = filtered.findIndex((a) => a._id === args.cursor);
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

// Update an account
export const update = mutation({
  args: {
    id: v.string(),
    name: v.optional(v.string()),
    industry: v.optional(v.string()),
    website: v.optional(v.string()),
    phone: v.optional(v.string()),
    address: v.optional(
      v.object({
        street: v.optional(v.string()),
        city: v.optional(v.string()),
        state: v.optional(v.string()),
        postalCode: v.optional(v.string()),
        country: v.optional(v.string()),
      })
    ),
    notes: v.optional(v.string()),
    ownerId: v.optional(v.string()),
    _token: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx, args._token);
    const account = await ctx.db.get(args.id as Id<"accounts">);
    await verifyTenantAccess(account, auth, "Account");

    if (account!.deletedAt !== undefined) {
      notFound("Account");
    }

    const { id, ...updates } = args;
    const parsed = updateAccountSchema.safeParse(updates);
    if (!parsed.success) {
      validationError("Invalid account data", parsed.error.flatten());
    }

    const updateData: Record<string, unknown> = { updatedAt: now() };
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.industry !== undefined) updateData.industry = updates.industry;
    if (updates.website !== undefined) updateData.website = updates.website;
    if (updates.phone !== undefined) updateData.phone = updates.phone;
    if (updates.address !== undefined) updateData.address = updates.address;
    if (updates.notes !== undefined) updateData.notes = updates.notes;
    if (updates.ownerId !== undefined)
      updateData.ownerId = updates.ownerId as Id<"users">;

    await withAudit(ctx, auth, "update", "account", args.id, async () => {
      await ctx.db.patch(args.id as Id<"accounts">, updateData);
    }, updates);

    return await ctx.db.get(args.id as Id<"accounts">);
  },
});

// Soft delete an account
export const remove = mutation({
  args: {
    id: v.string(),
    force: v.optional(v.boolean()),
    _token: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx, args._token);
    const account = await ctx.db.get(args.id as Id<"accounts">);
    await verifyTenantAccess(account, auth, "Account");

    if (account!.deletedAt !== undefined) {
      notFound("Account");
    }

    // Check for dependencies
    const contacts = await ctx.db
      .query("contacts")
      .withIndex("by_account", (q) => q.eq("accountId", args.id as Id<"accounts">))
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();

    const opportunities = await ctx.db
      .query("opportunities")
      .withIndex("by_account", (q) => q.eq("accountId", args.id as Id<"accounts">))
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();

    const totalDeps = contacts.length + opportunities.length;

    if (totalDeps > 0 && !args.force) {
      hasDependencies("Account", "related records", totalDeps);
    }

    // Cascade delete if force is true
    if (args.force) {
      const timestamp = now();
      for (const contact of contacts) {
        await ctx.db.patch(contact._id, { deletedAt: timestamp, updatedAt: timestamp });
      }
      for (const opp of opportunities) {
        await ctx.db.patch(opp._id, { deletedAt: timestamp, updatedAt: timestamp });
      }
    }

    await withAudit(ctx, auth, "delete", "account", args.id, async () => {
      await ctx.db.patch(args.id as Id<"accounts">, {
        deletedAt: now(),
        updatedAt: now(),
      });
    });

    return { success: true };
  },
});

// Restore a soft-deleted account
export const restore = mutation({
  args: { id: v.string(), _token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx, args._token);
    const account = await ctx.db.get(args.id as Id<"accounts">);

    if (!account || account.tenantId !== auth.tenantId) {
      notFound("Account");
    }

    if (account.deletedAt === undefined) {
      validationError("Account is not deleted");
    }

    await withAudit(ctx, auth, "restore", "account", args.id, async () => {
      await ctx.db.patch(args.id as Id<"accounts">, {
        deletedAt: undefined,
        updatedAt: now(),
      });
    });

    return await ctx.db.get(args.id as Id<"accounts">);
  },
});
