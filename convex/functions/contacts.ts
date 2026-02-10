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
  createContactSchema,
  updateContactSchema,
  listContactsFilterSchema,
} from "../lib/validators";
import { notFound, validationError } from "../lib/errors";

// Create a new contact
export const create = mutation({
  args: {
    accountId: v.string(),
    firstName: v.string(),
    lastName: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    title: v.optional(v.string()),
    isPrimary: v.optional(v.boolean()),
    notes: v.optional(v.string()),
    _token: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx, args._token);

    // Validate input
    const parsed = createContactSchema.safeParse(args);
    if (!parsed.success) {
      validationError("Invalid contact data", parsed.error.flatten());
    }

    // Verify account exists and belongs to tenant
    const account = await ctx.db.get(args.accountId as Id<"accounts">);
    await verifyTenantAccess(account, auth, "Account");

    if (account!.deletedAt !== undefined) {
      notFound("Account");
    }

    const timestamp = now();
    const contactData = {
      tenantId: auth.tenantId,
      accountId: args.accountId as Id<"accounts">,
      firstName: args.firstName,
      lastName: args.lastName,
      email: args.email,
      phone: args.phone,
      title: args.title,
      isPrimary: args.isPrimary ?? false,
      notes: args.notes,
      createdBy: auth.userId,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    const contactId = await withAudit(
      ctx,
      auth,
      "create",
      "contact",
      "pending",
      async () => {
        return await ctx.db.insert("contacts", contactData);
      }
    );

    // Update audit log with actual ID
    const auditLog = await ctx.db
      .query("auditLogs")
      .withIndex("by_entity", (q) =>
        q.eq("entityType", "contact").eq("entityId", "pending")
      )
      .order("desc")
      .first();

    if (auditLog) {
      await ctx.db.patch(auditLog._id, { entityId: contactId });
    }

    return await ctx.db.get(contactId);
  },
});

// Get a single contact by ID
export const get = query({
  args: { id: v.string(), _token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx, args._token);
    const contact = await ctx.db.get(args.id as Id<"contacts">);
    return await verifyTenantAccess(contact, auth, "Contact");
  },
});

// List contacts with filters and pagination
export const list = query({
  args: {
    accountId: v.optional(v.string()),
    includeDeleted: v.optional(v.boolean()),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
    _token: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx, args._token);

    const parsed = listContactsFilterSchema.safeParse(args);
    if (!parsed.success) {
      validationError("Invalid filter parameters", parsed.error.flatten());
    }

    const limit = args.limit ?? 20;
    const includeDeleted = args.includeDeleted ?? false;

    let contacts;
    if (args.accountId) {
      // Verify account access
      const account = await ctx.db.get(args.accountId as Id<"accounts">);
      await verifyTenantAccess(account, auth, "Account");

      contacts = await ctx.db
        .query("contacts")
        .withIndex("by_account", (q) => q.eq("accountId", args.accountId as Id<"accounts">))
        .collect();
    } else {
      contacts = await ctx.db
        .query("contacts")
        .withIndex("by_tenant", (q) => q.eq("tenantId", auth.tenantId))
        .collect();
    }

    // Apply filters
    let filtered = contacts.filter((c) => {
      if (!includeDeleted && c.deletedAt !== undefined) return false;
      return true;
    });

    // Apply cursor-based pagination
    if (args.cursor) {
      const cursorIndex = filtered.findIndex((c) => c._id === args.cursor);
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

// Update a contact
export const update = mutation({
  args: {
    id: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    title: v.optional(v.string()),
    isPrimary: v.optional(v.boolean()),
    notes: v.optional(v.string()),
    _token: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx, args._token);
    const contact = await ctx.db.get(args.id as Id<"contacts">);
    await verifyTenantAccess(contact, auth, "Contact");

    if (contact!.deletedAt !== undefined) {
      notFound("Contact");
    }

    const { id, _token, ...updates } = args;
    const parsed = updateContactSchema.safeParse(updates);
    if (!parsed.success) {
      validationError("Invalid contact data", parsed.error.flatten());
    }

    const updateData: Record<string, unknown> = { updatedAt: now() };
    if (updates.firstName !== undefined) updateData.firstName = updates.firstName;
    if (updates.lastName !== undefined) updateData.lastName = updates.lastName;
    if (updates.email !== undefined) updateData.email = updates.email;
    if (updates.phone !== undefined) updateData.phone = updates.phone;
    if (updates.title !== undefined) updateData.title = updates.title;
    if (updates.isPrimary !== undefined) updateData.isPrimary = updates.isPrimary;
    if (updates.notes !== undefined) updateData.notes = updates.notes;

    await withAudit(ctx, auth, "update", "contact", args.id, async () => {
      await ctx.db.patch(args.id as Id<"contacts">, updateData);
    }, updates);

    return await ctx.db.get(args.id as Id<"contacts">);
  },
});

// Soft delete a contact
export const remove = mutation({
  args: { id: v.string(), _token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx, args._token);
    const contact = await ctx.db.get(args.id as Id<"contacts">);
    await verifyTenantAccess(contact, auth, "Contact");

    if (contact!.deletedAt !== undefined) {
      notFound("Contact");
    }

    await withAudit(ctx, auth, "delete", "contact", args.id, async () => {
      await ctx.db.patch(args.id as Id<"contacts">, {
        deletedAt: now(),
        updatedAt: now(),
      });
    });

    return { success: true };
  },
});

// Restore a soft-deleted contact
export const restore = mutation({
  args: { id: v.string(), _token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx, args._token);
    const contact = await ctx.db.get(args.id as Id<"contacts">);

    if (!contact || contact.tenantId !== auth.tenantId) {
      notFound("Contact");
    }

    if (contact.deletedAt === undefined) {
      validationError("Contact is not deleted");
    }

    // Verify parent account is not deleted
    const account = await ctx.db.get(contact.accountId);
    if (!account || account.deletedAt !== undefined) {
      validationError("Cannot restore contact: parent account is deleted");
    }

    await withAudit(ctx, auth, "restore", "contact", args.id, async () => {
      await ctx.db.patch(args.id as Id<"contacts">, {
        deletedAt: undefined,
        updatedAt: now(),
      });
    });

    return await ctx.db.get(args.id as Id<"contacts">);
  },
});
