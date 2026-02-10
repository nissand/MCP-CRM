import { ToolDefinition } from "../server";

export const adminTools: ToolDefinition[] = [
  {
    name: "get_tenant",
    description:
      "Get current tenant/organization configuration including name, opportunity stages, default currency, and timezone settings.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "update_tenant",
    description:
      "Update tenant configuration. Admin only. Can customize opportunity pipeline stages, default currency, and timezone. Only include settings you want to change.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Updated tenant/organization name",
        },
        settings: {
          type: "object",
          description: "Tenant settings to update",
          properties: {
            opportunityStages: {
              type: "array",
              items: { type: "string" },
              description:
                "Custom opportunity pipeline stages (e.g., ['lead', 'demo', 'proposal', 'won', 'lost'])",
            },
            defaultCurrency: {
              type: "string",
              description: "Default currency code (e.g., 'USD', 'EUR', 'GBP')",
            },
            timezone: {
              type: "string",
              description: "Timezone identifier (e.g., 'America/New_York', 'Europe/London')",
            },
          },
        },
      },
    },
  },
  {
    name: "invite_user",
    description:
      "Invite a new user to the tenant. Admin only. The user will be created in pending state and activated on first login. Can assign admin or member role.",
    inputSchema: {
      type: "object",
      properties: {
        email: {
          type: "string",
          description: "Email address for the new user (required)",
        },
        name: {
          type: "string",
          description: "Full name of the new user (required)",
        },
        role: {
          type: "string",
          enum: ["admin", "member"],
          description: "User role - admin has full access, member has standard access (default: member)",
        },
      },
      required: ["email", "name"],
    },
  },
  {
    name: "list_users",
    description:
      "List all users in the current tenant. Shows active users by default. Use includeInactive to see deactivated users as well.",
    inputSchema: {
      type: "object",
      properties: {
        includeInactive: {
          type: "boolean",
          description: "Include deactivated users (default: false)",
        },
        cursor: {
          type: "string",
          description: "Pagination cursor",
        },
        limit: {
          type: "number",
          description: "Maximum results (default: 20)",
        },
      },
    },
  },
  {
    name: "deactivate_user",
    description:
      "Deactivate a user account. Admin only. The user will no longer be able to access the CRM. Cannot deactivate yourself or the last admin.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "User ID to deactivate",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "reactivate_user",
    description:
      "Reactivate a previously deactivated user account. Admin only. The user will regain access to the CRM.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "User ID to reactivate",
        },
      },
      required: ["id"],
    },
  },
];
