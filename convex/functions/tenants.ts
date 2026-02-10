import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import {
  getAuthContext,
  requireAdmin,
  withAudit,
  now,
} from "../lib/utils";
import { updateTenantSchema } from "../lib/validators";
import { notFound, validationError } from "../lib/errors";

// Get current tenant
export const get = query({
  args: { _token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx, args._token);
    const tenant = await ctx.db.get(auth.tenantId);

    if (!tenant) {
      notFound("Tenant");
    }

    return tenant;
  },
});

// Update tenant settings (admin only)
export const update = mutation({
  args: {
    name: v.optional(v.string()),
    settings: v.optional(
      v.object({
        opportunityStages: v.optional(v.array(v.string())),
        defaultCurrency: v.optional(v.string()),
        timezone: v.optional(v.string()),
      })
    ),
    _token: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx, args._token);
    requireAdmin(auth);

    const parsed = updateTenantSchema.safeParse(args);
    if (!parsed.success) {
      validationError("Invalid tenant data", parsed.error.flatten());
    }

    const tenant = await ctx.db.get(auth.tenantId);
    if (!tenant) {
      notFound("Tenant");
    }

    const updateData: Record<string, unknown> = { updatedAt: now() };

    if (args.name !== undefined) {
      updateData.name = args.name;
    }

    if (args.settings !== undefined) {
      // Merge settings
      const newSettings = {
        ...tenant.settings,
        ...(args.settings.opportunityStages !== undefined && {
          opportunityStages: args.settings.opportunityStages,
        }),
        ...(args.settings.defaultCurrency !== undefined && {
          defaultCurrency: args.settings.defaultCurrency,
        }),
        ...(args.settings.timezone !== undefined && {
          timezone: args.settings.timezone,
        }),
      };
      updateData.settings = newSettings;
    }

    await withAudit(ctx, auth, "update", "tenant", auth.tenantId, async () => {
      await ctx.db.patch(auth.tenantId, updateData);
    }, args);

    return await ctx.db.get(auth.tenantId);
  },
});

// Get opportunity stages for current tenant
export const getOpportunityStages = query({
  args: { _token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx, args._token);
    const tenant = await ctx.db.get(auth.tenantId);

    if (!tenant) {
      notFound("Tenant");
    }

    return tenant.settings.opportunityStages;
  },
});
