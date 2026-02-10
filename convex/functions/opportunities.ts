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
  createOpportunitySchema,
  updateOpportunitySchema,
  listOpportunitiesFilterSchema,
} from "../lib/validators";
import { notFound, validationError, invalidStage } from "../lib/errors";

// Create a new opportunity
export const create = mutation({
  args: {
    accountId: v.string(),
    contactId: v.optional(v.string()),
    name: v.string(),
    stage: v.string(),
    amount: v.optional(v.number()),
    currency: v.optional(v.string()),
    probability: v.optional(v.number()),
    expectedCloseDate: v.optional(v.number()),
    notes: v.optional(v.string()),
    ownerId: v.optional(v.string()),
    _token: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx, args._token);

    // Validate input
    const parsed = createOpportunitySchema.safeParse(args);
    if (!parsed.success) {
      validationError("Invalid opportunity data", parsed.error.flatten());
    }

    // Verify account exists and belongs to tenant
    const account = await ctx.db.get(args.accountId as Id<"accounts">);
    await verifyTenantAccess(account, auth, "Account");

    if (account!.deletedAt !== undefined) {
      notFound("Account");
    }

    // Verify contact if provided
    if (args.contactId) {
      const contact = await ctx.db.get(args.contactId as Id<"contacts">);
      await verifyTenantAccess(contact, auth, "Contact");

      if (contact!.deletedAt !== undefined) {
        notFound("Contact");
      }
    }

    // Validate stage against tenant settings
    const tenant = await ctx.db.get(auth.tenantId);
    if (!tenant) {
      notFound("Tenant");
    }

    const validStages = tenant.settings.opportunityStages;
    if (!validStages.includes(args.stage)) {
      invalidStage(args.stage, validStages);
    }

    const timestamp = now();
    const currency = args.currency ?? tenant.settings.defaultCurrency;

    const opportunityData = {
      tenantId: auth.tenantId,
      accountId: args.accountId as Id<"accounts">,
      contactId: args.contactId ? (args.contactId as Id<"contacts">) : undefined,
      name: args.name,
      stage: args.stage,
      amount: args.amount,
      currency,
      probability: args.probability,
      expectedCloseDate: args.expectedCloseDate,
      notes: args.notes,
      ownerId: args.ownerId ? (args.ownerId as Id<"users">) : undefined,
      createdBy: auth.userId,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    const opportunityId = await withAudit(
      ctx,
      auth,
      "create",
      "opportunity",
      "pending",
      async () => {
        return await ctx.db.insert("opportunities", opportunityData);
      }
    );

    // Update audit log with actual ID
    const auditLog = await ctx.db
      .query("auditLogs")
      .withIndex("by_entity", (q) =>
        q.eq("entityType", "opportunity").eq("entityId", "pending")
      )
      .order("desc")
      .first();

    if (auditLog) {
      await ctx.db.patch(auditLog._id, { entityId: opportunityId });
    }

    return await ctx.db.get(opportunityId);
  },
});

// Get a single opportunity by ID
export const get = query({
  args: { id: v.string(), _token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx, args._token);
    const opportunity = await ctx.db.get(args.id as Id<"opportunities">);
    return await verifyTenantAccess(opportunity, auth, "Opportunity");
  },
});

// List opportunities with filters and pagination
export const list = query({
  args: {
    accountId: v.optional(v.string()),
    stage: v.optional(v.string()),
    ownerId: v.optional(v.string()),
    includeDeleted: v.optional(v.boolean()),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
    _token: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx, args._token);

    const parsed = listOpportunitiesFilterSchema.safeParse(args);
    if (!parsed.success) {
      validationError("Invalid filter parameters", parsed.error.flatten());
    }

    const limit = args.limit ?? 20;
    const includeDeleted = args.includeDeleted ?? false;

    let opportunities;
    if (args.accountId) {
      // Verify account access
      const account = await ctx.db.get(args.accountId as Id<"accounts">);
      await verifyTenantAccess(account, auth, "Account");

      opportunities = await ctx.db
        .query("opportunities")
        .withIndex("by_account", (q) => q.eq("accountId", args.accountId as Id<"accounts">))
        .collect();
    } else if (args.stage) {
      opportunities = await ctx.db
        .query("opportunities")
        .withIndex("by_stage", (q) => q.eq("tenantId", auth.tenantId).eq("stage", args.stage!))
        .collect();
    } else {
      opportunities = await ctx.db
        .query("opportunities")
        .withIndex("by_tenant", (q) => q.eq("tenantId", auth.tenantId))
        .collect();
    }

    // Apply filters
    let filtered = opportunities.filter((o) => {
      if (!includeDeleted && o.deletedAt !== undefined) return false;
      if (args.stage && o.stage !== args.stage) return false;
      if (args.ownerId && o.ownerId !== args.ownerId) return false;
      return true;
    });

    // Apply cursor-based pagination
    if (args.cursor) {
      const cursorIndex = filtered.findIndex((o) => o._id === args.cursor);
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

// Update an opportunity
export const update = mutation({
  args: {
    id: v.string(),
    contactId: v.optional(v.string()),
    name: v.optional(v.string()),
    stage: v.optional(v.string()),
    amount: v.optional(v.number()),
    currency: v.optional(v.string()),
    probability: v.optional(v.number()),
    expectedCloseDate: v.optional(v.number()),
    notes: v.optional(v.string()),
    ownerId: v.optional(v.string()),
    _token: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx, args._token);
    const opportunity = await ctx.db.get(args.id as Id<"opportunities">);
    await verifyTenantAccess(opportunity, auth, "Opportunity");

    if (opportunity!.deletedAt !== undefined) {
      notFound("Opportunity");
    }

    const { id, _token, ...updates } = args;
    const parsed = updateOpportunitySchema.safeParse(updates);
    if (!parsed.success) {
      validationError("Invalid opportunity data", parsed.error.flatten());
    }

    // Validate stage if being updated
    if (updates.stage) {
      const tenant = await ctx.db.get(auth.tenantId);
      if (!tenant) {
        notFound("Tenant");
      }

      const validStages = tenant.settings.opportunityStages;
      if (!validStages.includes(updates.stage)) {
        invalidStage(updates.stage, validStages);
      }
    }

    // Verify contact if being updated
    if (updates.contactId) {
      const contact = await ctx.db.get(updates.contactId as Id<"contacts">);
      await verifyTenantAccess(contact, auth, "Contact");

      if (contact!.deletedAt !== undefined) {
        notFound("Contact");
      }
    }

    const timestamp = now();
    const updateData: Record<string, unknown> = { updatedAt: timestamp };

    if (updates.contactId !== undefined)
      updateData.contactId = updates.contactId as Id<"contacts">;
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.stage !== undefined) {
      updateData.stage = updates.stage;
      // Set closedAt if moving to closed stage
      if (updates.stage.startsWith("closed_")) {
        updateData.closedAt = timestamp;
      }
    }
    if (updates.amount !== undefined) updateData.amount = updates.amount;
    if (updates.currency !== undefined) updateData.currency = updates.currency;
    if (updates.probability !== undefined) updateData.probability = updates.probability;
    if (updates.expectedCloseDate !== undefined)
      updateData.expectedCloseDate = updates.expectedCloseDate;
    if (updates.notes !== undefined) updateData.notes = updates.notes;
    if (updates.ownerId !== undefined)
      updateData.ownerId = updates.ownerId as Id<"users">;

    await withAudit(ctx, auth, "update", "opportunity", args.id, async () => {
      await ctx.db.patch(args.id as Id<"opportunities">, updateData);
    }, updates);

    return await ctx.db.get(args.id as Id<"opportunities">);
  },
});

// Soft delete an opportunity
export const remove = mutation({
  args: { id: v.string(), _token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx, args._token);
    const opportunity = await ctx.db.get(args.id as Id<"opportunities">);
    await verifyTenantAccess(opportunity, auth, "Opportunity");

    if (opportunity!.deletedAt !== undefined) {
      notFound("Opportunity");
    }

    await withAudit(ctx, auth, "delete", "opportunity", args.id, async () => {
      await ctx.db.patch(args.id as Id<"opportunities">, {
        deletedAt: now(),
        updatedAt: now(),
      });
    });

    return { success: true };
  },
});

// Restore a soft-deleted opportunity
export const restore = mutation({
  args: { id: v.string(), _token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx, args._token);
    const opportunity = await ctx.db.get(args.id as Id<"opportunities">);

    if (!opportunity || opportunity.tenantId !== auth.tenantId) {
      notFound("Opportunity");
    }

    if (opportunity.deletedAt === undefined) {
      validationError("Opportunity is not deleted");
    }

    // Verify parent account is not deleted
    const account = await ctx.db.get(opportunity.accountId);
    if (!account || account.deletedAt !== undefined) {
      validationError("Cannot restore opportunity: parent account is deleted");
    }

    await withAudit(ctx, auth, "restore", "opportunity", args.id, async () => {
      await ctx.db.patch(args.id as Id<"opportunities">, {
        deletedAt: undefined,
        updatedAt: now(),
      });
    });

    return await ctx.db.get(args.id as Id<"opportunities">);
  },
});

// Get pipeline summary (opportunities by stage)
export const getPipelineSummary = query({
  args: { _token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx, args._token);

    const tenant = await ctx.db.get(auth.tenantId);
    if (!tenant) {
      notFound("Tenant");
    }

    const opportunities = await ctx.db
      .query("opportunities")
      .withIndex("by_tenant", (q) => q.eq("tenantId", auth.tenantId))
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();

    const stages = tenant.settings.opportunityStages;
    const summary = stages.map((stage) => {
      const stageOpps = opportunities.filter((o) => o.stage === stage);
      const totalAmount = stageOpps.reduce((sum, o) => sum + (o.amount ?? 0), 0);
      const weightedAmount = stageOpps.reduce(
        (sum, o) => sum + (o.amount ?? 0) * ((o.probability ?? 0) / 100),
        0
      );

      return {
        stage,
        count: stageOpps.length,
        totalAmount,
        weightedAmount,
        currency: tenant.settings.defaultCurrency,
      };
    });

    return {
      stages: summary,
      totals: {
        count: opportunities.length,
        totalAmount: summary.reduce((sum, s) => sum + s.totalAmount, 0),
        weightedAmount: summary.reduce((sum, s) => sum + s.weightedAmount, 0),
        currency: tenant.settings.defaultCurrency,
      },
    };
  },
});
