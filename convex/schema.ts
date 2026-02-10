import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

// Default opportunity stages
export const DEFAULT_STAGES = [
  "lead",
  "qualified",
  "proposal",
  "negotiation",
  "closed_won",
  "closed_lost",
] as const;

export default defineSchema({
  ...authTables,

  // Multi-tenant configuration
  tenants: defineTable({
    name: v.string(),
    settings: v.object({
      opportunityStages: v.array(v.string()),
      defaultCurrency: v.string(),
      timezone: v.string(),
    }),
    createdAt: v.number(),
    updatedAt: v.number(),
  }),

  // User accounts with role
  users: defineTable({
    tenantId: v.id("tenants"),
    email: v.string(),
    name: v.string(),
    role: v.union(v.literal("admin"), v.literal("member")),
    isActive: v.boolean(),
    invitedBy: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_email", ["email"])
    .index("by_tenant_email", ["tenantId", "email"]),

  // Company/organization records
  accounts: defineTable({
    tenantId: v.id("tenants"),
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
    ownerId: v.optional(v.id("users")),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
    deletedAt: v.optional(v.number()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_tenant_name", ["tenantId", "name"])
    .index("by_owner", ["ownerId"])
    .index("by_tenant_deleted", ["tenantId", "deletedAt"])
    .searchIndex("search_accounts", {
      searchField: "name",
      filterFields: ["tenantId", "deletedAt"],
    }),

  // People linked to accounts
  contacts: defineTable({
    tenantId: v.id("tenants"),
    accountId: v.id("accounts"),
    firstName: v.string(),
    lastName: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    title: v.optional(v.string()),
    isPrimary: v.boolean(),
    notes: v.optional(v.string()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
    deletedAt: v.optional(v.number()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_account", ["accountId"])
    .index("by_tenant_email", ["tenantId", "email"])
    .index("by_tenant_deleted", ["tenantId", "deletedAt"])
    .searchIndex("search_contacts", {
      searchField: "firstName",
      filterFields: ["tenantId", "deletedAt"],
    }),

  // Sales pipeline deals
  opportunities: defineTable({
    tenantId: v.id("tenants"),
    accountId: v.id("accounts"),
    contactId: v.optional(v.id("contacts")),
    name: v.string(),
    stage: v.string(),
    amount: v.optional(v.number()),
    currency: v.string(),
    probability: v.optional(v.number()),
    expectedCloseDate: v.optional(v.number()),
    notes: v.optional(v.string()),
    ownerId: v.optional(v.id("users")),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
    closedAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_account", ["accountId"])
    .index("by_contact", ["contactId"])
    .index("by_stage", ["tenantId", "stage"])
    .index("by_owner", ["ownerId"])
    .index("by_tenant_deleted", ["tenantId", "deletedAt"])
    .searchIndex("search_opportunities", {
      searchField: "name",
      filterFields: ["tenantId", "deletedAt", "stage"],
    }),

  // Action items with polymorphic linking
  tasks: defineTable({
    tenantId: v.id("tenants"),
    title: v.string(),
    description: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("in_progress"),
      v.literal("completed"),
      v.literal("cancelled")
    ),
    priority: v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
    dueDate: v.optional(v.number()),
    // Polymorphic linking
    linkedEntityType: v.optional(
      v.union(
        v.literal("account"),
        v.literal("contact"),
        v.literal("opportunity")
      )
    ),
    linkedEntityId: v.optional(v.string()),
    assigneeId: v.optional(v.id("users")),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_assignee", ["assigneeId"])
    .index("by_status", ["tenantId", "status"])
    .index("by_due_date", ["tenantId", "dueDate"])
    .index("by_linked_entity", ["linkedEntityType", "linkedEntityId"])
    .index("by_tenant_deleted", ["tenantId", "deletedAt"])
    .searchIndex("search_tasks", {
      searchField: "title",
      filterFields: ["tenantId", "deletedAt", "status"],
    }),

  // Time-triggered alerts with polymorphic linking
  reminders: defineTable({
    tenantId: v.id("tenants"),
    title: v.string(),
    description: v.optional(v.string()),
    remindAt: v.number(),
    isCompleted: v.boolean(),
    // Polymorphic linking
    linkedEntityType: v.optional(
      v.union(
        v.literal("account"),
        v.literal("contact"),
        v.literal("opportunity"),
        v.literal("task")
      )
    ),
    linkedEntityId: v.optional(v.string()),
    assigneeId: v.optional(v.id("users")),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_assignee", ["assigneeId"])
    .index("by_remind_at", ["tenantId", "remindAt"])
    .index("by_linked_entity", ["linkedEntityType", "linkedEntityId"])
    .index("by_tenant_deleted", ["tenantId", "deletedAt"])
    .searchIndex("search_reminders", {
      searchField: "title",
      filterFields: ["tenantId", "deletedAt"],
    }),

  // MCP sessions for HTTP+SSE transport
  mcpSessions: defineTable({
    sessionId: v.string(), // Short UUID-like ID
    token: v.string(), // JWT token
    createdAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_session_id", ["sessionId"])
    .index("by_expires_at", ["expiresAt"]),

  // OAuth PKCE challenges for code verification
  oauthPkce: defineTable({
    state: v.string(), // OAuth state parameter
    codeChallenge: v.string(), // PKCE code_challenge
    codeChallengeMethod: v.string(), // S256 or plain
    redirectUri: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_state", ["state"])
    .index("by_expires_at", ["expiresAt"]),

  // OAuth authorization codes (maps short code to JWT + state)
  oauthCodes: defineTable({
    code: v.string(), // Short authorization code
    token: v.string(), // JWT token
    state: v.string(), // OAuth state for PKCE lookup
    createdAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_code", ["code"])
    .index("by_expires_at", ["expiresAt"]),

  // Audit log for CUD operations
  auditLogs: defineTable({
    tenantId: v.id("tenants"),
    userId: v.id("users"),
    action: v.union(
      v.literal("create"),
      v.literal("update"),
      v.literal("delete"),
      v.literal("restore")
    ),
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
    changes: v.optional(v.any()),
    timestamp: v.number(),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_entity", ["entityType", "entityId"])
    .index("by_user", ["userId"])
    .index("by_tenant_timestamp", ["tenantId", "timestamp"]),
});
