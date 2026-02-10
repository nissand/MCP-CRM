import { ActionCtx } from "../_generated/server";
import { api } from "../_generated/api";
import { formatError, CRMError } from "../lib/errors";

// JSON-RPC 2.0 types
interface JSONRPCRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: unknown;
}

interface JSONRPCResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

// MCP Server Info (Streamable HTTP Transport)
const SERVER_INFO = {
  name: "mcp-crm",
  version: "1.0.0",
};

const PROTOCOL_VERSION = "2025-03-26";

// MCP Capabilities
const CAPABILITIES = {
  tools: {},
};

// Tool definitions
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

// All available tools
export const TOOLS: ToolDefinition[] = [
  // Account tools
  {
    name: "create_account",
    description:
      "Create a new company/organization account in the CRM. Returns the created account with its ID.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Company name (required)" },
        industry: { type: "string", description: "Industry sector" },
        website: { type: "string", description: "Company website URL" },
        phone: { type: "string", description: "Company phone number" },
        address: {
          type: "object",
          description: "Company address",
          properties: {
            street: { type: "string" },
            city: { type: "string" },
            state: { type: "string" },
            postalCode: { type: "string" },
            country: { type: "string" },
          },
        },
        notes: { type: "string", description: "Additional notes" },
        ownerId: { type: "string", description: "ID of the account owner" },
      },
      required: ["name"],
    },
  },
  {
    name: "get_account",
    description: "Get a single account by its ID. Returns the account details.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Account ID" },
      },
      required: ["id"],
    },
  },
  {
    name: "list_accounts",
    description:
      "List accounts with optional filters. Supports pagination via cursor.",
    inputSchema: {
      type: "object",
      properties: {
        industry: { type: "string", description: "Filter by industry" },
        ownerId: { type: "string", description: "Filter by owner ID" },
        includeDeleted: {
          type: "boolean",
          description: "Include soft-deleted accounts",
        },
        cursor: { type: "string", description: "Pagination cursor" },
        limit: {
          type: "number",
          description: "Max results to return (default 20, max 100)",
        },
      },
    },
  },
  {
    name: "update_account",
    description: "Update an existing account. Only provided fields are updated.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Account ID (required)" },
        name: { type: "string", description: "Company name" },
        industry: { type: "string", description: "Industry sector" },
        website: { type: "string", description: "Company website URL" },
        phone: { type: "string", description: "Company phone number" },
        address: {
          type: "object",
          description: "Company address",
          properties: {
            street: { type: "string" },
            city: { type: "string" },
            state: { type: "string" },
            postalCode: { type: "string" },
            country: { type: "string" },
          },
        },
        notes: { type: "string", description: "Additional notes" },
        ownerId: { type: "string", description: "ID of the account owner" },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_account",
    description:
      "Soft delete an account. Use force=true to cascade delete related contacts and opportunities.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Account ID" },
        force: {
          type: "boolean",
          description: "Force delete with cascading",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "restore_account",
    description: "Restore a soft-deleted account.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Account ID" },
      },
      required: ["id"],
    },
  },

  // Contact tools
  {
    name: "create_contact",
    description:
      "Create a new contact linked to an account. Returns the created contact.",
    inputSchema: {
      type: "object",
      properties: {
        accountId: {
          type: "string",
          description: "ID of the parent account (required)",
        },
        firstName: { type: "string", description: "First name (required)" },
        lastName: { type: "string", description: "Last name (required)" },
        email: { type: "string", description: "Email address" },
        phone: { type: "string", description: "Phone number" },
        title: { type: "string", description: "Job title" },
        isPrimary: {
          type: "boolean",
          description: "Whether this is the primary contact",
        },
        notes: { type: "string", description: "Additional notes" },
      },
      required: ["accountId", "firstName", "lastName"],
    },
  },
  {
    name: "get_contact",
    description: "Get a single contact by its ID.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Contact ID" },
      },
      required: ["id"],
    },
  },
  {
    name: "list_contacts",
    description: "List contacts with optional filters. Supports pagination.",
    inputSchema: {
      type: "object",
      properties: {
        accountId: { type: "string", description: "Filter by account ID" },
        includeDeleted: { type: "boolean", description: "Include deleted" },
        cursor: { type: "string", description: "Pagination cursor" },
        limit: { type: "number", description: "Max results (default 20)" },
      },
    },
  },
  {
    name: "update_contact",
    description: "Update an existing contact.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Contact ID (required)" },
        firstName: { type: "string", description: "First name" },
        lastName: { type: "string", description: "Last name" },
        email: { type: "string", description: "Email address" },
        phone: { type: "string", description: "Phone number" },
        title: { type: "string", description: "Job title" },
        isPrimary: { type: "boolean", description: "Primary contact flag" },
        notes: { type: "string", description: "Additional notes" },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_contact",
    description: "Soft delete a contact.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Contact ID" },
      },
      required: ["id"],
    },
  },
  {
    name: "restore_contact",
    description: "Restore a soft-deleted contact.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Contact ID" },
      },
      required: ["id"],
    },
  },

  // Opportunity tools
  {
    name: "create_opportunity",
    description:
      "Create a new sales opportunity linked to an account. Stage must be valid per tenant config.",
    inputSchema: {
      type: "object",
      properties: {
        accountId: { type: "string", description: "Parent account ID (required)" },
        contactId: { type: "string", description: "Associated contact ID" },
        name: { type: "string", description: "Opportunity name (required)" },
        stage: {
          type: "string",
          description: "Pipeline stage (required, must be valid)",
        },
        amount: { type: "number", description: "Deal amount" },
        currency: { type: "string", description: "Currency code (default: USD)" },
        probability: { type: "number", description: "Win probability 0-100" },
        expectedCloseDate: {
          type: "number",
          description: "Expected close date (Unix timestamp)",
        },
        notes: { type: "string", description: "Additional notes" },
        ownerId: { type: "string", description: "Opportunity owner ID" },
      },
      required: ["accountId", "name", "stage"],
    },
  },
  {
    name: "get_opportunity",
    description: "Get a single opportunity by its ID.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Opportunity ID" },
      },
      required: ["id"],
    },
  },
  {
    name: "list_opportunities",
    description: "List opportunities with optional filters.",
    inputSchema: {
      type: "object",
      properties: {
        accountId: { type: "string", description: "Filter by account" },
        stage: { type: "string", description: "Filter by stage" },
        ownerId: { type: "string", description: "Filter by owner" },
        includeDeleted: { type: "boolean", description: "Include deleted" },
        cursor: { type: "string", description: "Pagination cursor" },
        limit: { type: "number", description: "Max results" },
      },
    },
  },
  {
    name: "update_opportunity",
    description: "Update an existing opportunity.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Opportunity ID (required)" },
        contactId: { type: "string", description: "Associated contact ID" },
        name: { type: "string", description: "Opportunity name" },
        stage: { type: "string", description: "Pipeline stage" },
        amount: { type: "number", description: "Deal amount" },
        currency: { type: "string", description: "Currency code" },
        probability: { type: "number", description: "Win probability 0-100" },
        expectedCloseDate: { type: "number", description: "Expected close date" },
        notes: { type: "string", description: "Additional notes" },
        ownerId: { type: "string", description: "Opportunity owner ID" },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_opportunity",
    description: "Soft delete an opportunity.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Opportunity ID" },
      },
      required: ["id"],
    },
  },
  {
    name: "restore_opportunity",
    description: "Restore a soft-deleted opportunity.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Opportunity ID" },
      },
      required: ["id"],
    },
  },

  // Task tools
  {
    name: "create_task",
    description:
      "Create a new task. Can be linked to accounts, contacts, or opportunities.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Task title (required)" },
        description: { type: "string", description: "Task description" },
        status: {
          type: "string",
          enum: ["pending", "in_progress", "completed", "cancelled"],
          description: "Task status (default: pending)",
        },
        priority: {
          type: "string",
          enum: ["low", "medium", "high"],
          description: "Priority level (default: medium)",
        },
        dueDate: { type: "number", description: "Due date (Unix timestamp)" },
        linkedEntityType: {
          type: "string",
          enum: ["account", "contact", "opportunity"],
          description: "Type of linked entity",
        },
        linkedEntityId: { type: "string", description: "ID of linked entity" },
        assigneeId: { type: "string", description: "Assigned user ID" },
      },
      required: ["title"],
    },
  },
  {
    name: "get_task",
    description: "Get a single task by its ID.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Task ID" },
      },
      required: ["id"],
    },
  },
  {
    name: "list_tasks",
    description: "List tasks with optional filters.",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["pending", "in_progress", "completed", "cancelled"],
        },
        priority: { type: "string", enum: ["low", "medium", "high"] },
        assigneeId: { type: "string", description: "Filter by assignee" },
        linkedEntityType: { type: "string", description: "Filter by linked type" },
        linkedEntityId: { type: "string", description: "Filter by linked ID" },
        overdue: { type: "boolean", description: "Only show overdue tasks" },
        includeDeleted: { type: "boolean" },
        cursor: { type: "string" },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "update_task",
    description: "Update an existing task.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Task ID (required)" },
        title: { type: "string" },
        description: { type: "string" },
        status: { type: "string", enum: ["pending", "in_progress", "completed", "cancelled"] },
        priority: { type: "string", enum: ["low", "medium", "high"] },
        dueDate: { type: "number" },
        linkedEntityType: { type: "string", enum: ["account", "contact", "opportunity"] },
        linkedEntityId: { type: "string" },
        assigneeId: { type: "string" },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_task",
    description: "Soft delete a task.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Task ID" },
      },
      required: ["id"],
    },
  },
  {
    name: "restore_task",
    description: "Restore a soft-deleted task.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Task ID" },
      },
      required: ["id"],
    },
  },

  // Reminder tools
  {
    name: "create_reminder",
    description: "Create a new reminder. Can be linked to various entities.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Reminder title (required)" },
        description: { type: "string", description: "Reminder description" },
        remindAt: {
          type: "number",
          description: "When to remind (Unix timestamp, required)",
        },
        linkedEntityType: {
          type: "string",
          enum: ["account", "contact", "opportunity", "task"],
        },
        linkedEntityId: { type: "string" },
        assigneeId: { type: "string" },
      },
      required: ["title", "remindAt"],
    },
  },
  {
    name: "get_reminder",
    description: "Get a single reminder by its ID.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Reminder ID" },
      },
      required: ["id"],
    },
  },
  {
    name: "list_reminders",
    description: "List reminders with optional filters.",
    inputSchema: {
      type: "object",
      properties: {
        assigneeId: { type: "string" },
        linkedEntityType: { type: "string" },
        linkedEntityId: { type: "string" },
        upcoming: { type: "boolean", description: "Only future reminders" },
        overdue: { type: "boolean", description: "Only past-due reminders" },
        includeDeleted: { type: "boolean" },
        cursor: { type: "string" },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "update_reminder",
    description: "Update an existing reminder.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Reminder ID (required)" },
        title: { type: "string" },
        description: { type: "string" },
        remindAt: { type: "number" },
        isCompleted: { type: "boolean" },
        linkedEntityType: { type: "string" },
        linkedEntityId: { type: "string" },
        assigneeId: { type: "string" },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_reminder",
    description: "Soft delete a reminder.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Reminder ID" },
      },
      required: ["id"],
    },
  },
  {
    name: "restore_reminder",
    description: "Restore a soft-deleted reminder.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Reminder ID" },
      },
      required: ["id"],
    },
  },

  // Search & Analytics tools
  {
    name: "search_crm",
    description: "Full-text search across all CRM entities.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query (required)" },
        entityTypes: {
          type: "array",
          items: {
            type: "string",
            enum: ["account", "contact", "opportunity", "task", "reminder"],
          },
          description: "Entity types to search (default: all)",
        },
        limit: { type: "number", description: "Max results (default: 10)" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_pipeline_summary",
    description:
      "Get sales pipeline summary with opportunity counts and amounts by stage.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_activity_feed",
    description: "Get recent audit log entries (activity feed).",
    inputSchema: {
      type: "object",
      properties: {
        entityType: { type: "string", description: "Filter by entity type" },
        entityId: { type: "string", description: "Filter by entity ID" },
        userId: { type: "string", description: "Filter by user ID" },
        action: {
          type: "string",
          enum: ["create", "update", "delete", "restore"],
        },
        startDate: { type: "number", description: "Start timestamp" },
        endDate: { type: "number", description: "End timestamp" },
        cursor: { type: "string" },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "get_overdue_items",
    description: "Get overdue tasks and reminders.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max results (default: 20)" },
      },
    },
  },

  // Admin tools
  {
    name: "get_tenant",
    description: "Get current tenant configuration.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "update_tenant",
    description: "Update tenant configuration (admin only).",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Tenant name" },
        settings: {
          type: "object",
          properties: {
            opportunityStages: {
              type: "array",
              items: { type: "string" },
              description: "Custom opportunity stages",
            },
            defaultCurrency: { type: "string", description: "Default currency" },
            timezone: { type: "string", description: "Timezone" },
          },
        },
      },
    },
  },
  {
    name: "invite_user",
    description: "Invite a new user to the tenant (admin only).",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", description: "Email address (required)" },
        name: { type: "string", description: "User name (required)" },
        role: {
          type: "string",
          enum: ["admin", "member"],
          description: "User role (default: member)",
        },
      },
      required: ["email", "name"],
    },
  },
  {
    name: "list_users",
    description: "List users in the current tenant.",
    inputSchema: {
      type: "object",
      properties: {
        includeInactive: { type: "boolean", description: "Include inactive users" },
        cursor: { type: "string" },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "deactivate_user",
    description: "Deactivate a user (admin only).",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "User ID" },
      },
      required: ["id"],
    },
  },
  {
    name: "reactivate_user",
    description: "Reactivate a deactivated user (admin only).",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "User ID" },
      },
      required: ["id"],
    },
  },
];

// Handle JSON-RPC request
export async function handleMCPRequest(
  ctx: ActionCtx,
  request: JSONRPCRequest,
  token?: string | null
): Promise<JSONRPCResponse> {
  const id = request.id ?? null;

  // TODO: Validate token and set auth context
  // For now, token is passed but auth happens at the function level

  try {
    switch (request.method) {
      case "initialize":
        return {
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: PROTOCOL_VERSION,
            serverInfo: SERVER_INFO,
            capabilities: CAPABILITIES,
          },
        };

      case "tools/list":
        return {
          jsonrpc: "2.0",
          id,
          result: {
            tools: TOOLS,
          },
        };

      case "tools/call":
        const params = request.params as {
          name: string;
          arguments?: Record<string, unknown>;
        };

        if (!params?.name) {
          return {
            jsonrpc: "2.0",
            id,
            error: {
              code: -32602,
              message: "Missing tool name",
            },
          };
        }

        const result = await executeToolCall(ctx, params.name, params.arguments ?? {}, token);
        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          },
        };

      default:
        return {
          jsonrpc: "2.0",
          id,
          error: {
            code: -32601,
            message: `Unknown method: ${request.method}`,
          },
        };
    }
  } catch (error) {
    const formatted = formatError(error);
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code: -32000,
        message: formatted.message,
        data: formatted,
      },
    };
  }
}

// Execute a tool call
async function executeToolCall(
  ctx: ActionCtx,
  toolName: string,
  args: Record<string, unknown>,
  token?: string | null
): Promise<unknown> {
  // Inject token into args for authentication
  const argsWithToken = { ...args, _token: token ?? undefined };

  // Map tool names to Convex functions
  switch (toolName) {
    // Account tools
    case "create_account":
      return await ctx.runMutation(api.functions.accounts.create, argsWithToken as any);
    case "get_account":
      return await ctx.runQuery(api.functions.accounts.get, argsWithToken as any);
    case "list_accounts":
      return await ctx.runQuery(api.functions.accounts.list, argsWithToken as any);
    case "update_account":
      return await ctx.runMutation(api.functions.accounts.update, argsWithToken as any);
    case "delete_account":
      return await ctx.runMutation(api.functions.accounts.remove, argsWithToken as any);
    case "restore_account":
      return await ctx.runMutation(api.functions.accounts.restore, argsWithToken as any);

    // Contact tools
    case "create_contact":
      return await ctx.runMutation(api.functions.contacts.create, argsWithToken as any);
    case "get_contact":
      return await ctx.runQuery(api.functions.contacts.get, argsWithToken as any);
    case "list_contacts":
      return await ctx.runQuery(api.functions.contacts.list, argsWithToken as any);
    case "update_contact":
      return await ctx.runMutation(api.functions.contacts.update, argsWithToken as any);
    case "delete_contact":
      return await ctx.runMutation(api.functions.contacts.remove, argsWithToken as any);
    case "restore_contact":
      return await ctx.runMutation(api.functions.contacts.restore, argsWithToken as any);

    // Opportunity tools
    case "create_opportunity":
      return await ctx.runMutation(api.functions.opportunities.create, argsWithToken as any);
    case "get_opportunity":
      return await ctx.runQuery(api.functions.opportunities.get, argsWithToken as any);
    case "list_opportunities":
      return await ctx.runQuery(api.functions.opportunities.list, argsWithToken as any);
    case "update_opportunity":
      return await ctx.runMutation(api.functions.opportunities.update, argsWithToken as any);
    case "delete_opportunity":
      return await ctx.runMutation(api.functions.opportunities.remove, argsWithToken as any);
    case "restore_opportunity":
      return await ctx.runMutation(api.functions.opportunities.restore, argsWithToken as any);

    // Task tools
    case "create_task":
      return await ctx.runMutation(api.functions.tasks.create, argsWithToken as any);
    case "get_task":
      return await ctx.runQuery(api.functions.tasks.get, argsWithToken as any);
    case "list_tasks":
      return await ctx.runQuery(api.functions.tasks.list, argsWithToken as any);
    case "update_task":
      return await ctx.runMutation(api.functions.tasks.update, argsWithToken as any);
    case "delete_task":
      return await ctx.runMutation(api.functions.tasks.remove, argsWithToken as any);
    case "restore_task":
      return await ctx.runMutation(api.functions.tasks.restore, argsWithToken as any);

    // Reminder tools
    case "create_reminder":
      return await ctx.runMutation(api.functions.reminders.create, argsWithToken as any);
    case "get_reminder":
      return await ctx.runQuery(api.functions.reminders.get, argsWithToken as any);
    case "list_reminders":
      return await ctx.runQuery(api.functions.reminders.list, argsWithToken as any);
    case "update_reminder":
      return await ctx.runMutation(api.functions.reminders.update, argsWithToken as any);
    case "delete_reminder":
      return await ctx.runMutation(api.functions.reminders.remove, argsWithToken as any);
    case "restore_reminder":
      return await ctx.runMutation(api.functions.reminders.restore, argsWithToken as any);

    // Search & Analytics tools
    case "search_crm":
      return await ctx.runQuery(api.functions.search.search, argsWithToken as any);
    case "get_pipeline_summary":
      return await ctx.runQuery(api.functions.opportunities.getPipelineSummary, { _token: token ?? undefined });
    case "get_activity_feed":
      return await ctx.runQuery(api.functions.auditLog.list, argsWithToken as any);
    case "get_overdue_items":
      return await ctx.runQuery(api.functions.search.getOverdueItems, argsWithToken as any);

    // Admin tools
    case "get_tenant":
      return await ctx.runQuery(api.functions.tenants.get, { _token: token ?? undefined });
    case "update_tenant":
      return await ctx.runMutation(api.functions.tenants.update, argsWithToken as any);
    case "invite_user":
      return await ctx.runMutation(api.functions.users.invite, argsWithToken as any);
    case "list_users":
      return await ctx.runQuery(api.functions.users.list, argsWithToken as any);
    case "deactivate_user":
      return await ctx.runMutation(api.functions.users.deactivate, argsWithToken as any);
    case "reactivate_user":
      return await ctx.runMutation(api.functions.users.reactivate, argsWithToken as any);

    default:
      throw new CRMError("VALIDATION_ERROR", `Unknown tool: ${toolName}`);
  }
}
