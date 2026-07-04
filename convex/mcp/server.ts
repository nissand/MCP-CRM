import { ActionCtx } from "../_generated/server";
import { api } from "../_generated/api";
import { formatError, CRMError } from "../lib/errors";
import { allTools } from "./tools";

// Re-exported for backwards compatibility with existing imports
export type { ToolDefinition } from "./tools/types";

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

// All available tools (definitions live in ./tools, grouped by domain)
export const TOOLS = allTools;

// Maps each MCP tool name to the Convex function that implements it.
// The `kind` decides whether the call goes through ctx.runQuery or
// ctx.runMutation. Function references lose their arg types here because
// tool args arrive as untyped JSON; each Convex function validates its own
// args at the boundary.
type ToolHandler = {
  kind: "query" | "mutation";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fn: any;
};

const TOOL_HANDLERS: Record<string, ToolHandler> = {
  // Accounts
  create_account: { kind: "mutation", fn: api.functions.accounts.create },
  get_account: { kind: "query", fn: api.functions.accounts.get },
  list_accounts: { kind: "query", fn: api.functions.accounts.list },
  update_account: { kind: "mutation", fn: api.functions.accounts.update },
  delete_account: { kind: "mutation", fn: api.functions.accounts.remove },
  restore_account: { kind: "mutation", fn: api.functions.accounts.restore },

  // Contacts
  create_contact: { kind: "mutation", fn: api.functions.contacts.create },
  get_contact: { kind: "query", fn: api.functions.contacts.get },
  list_contacts: { kind: "query", fn: api.functions.contacts.list },
  update_contact: { kind: "mutation", fn: api.functions.contacts.update },
  delete_contact: { kind: "mutation", fn: api.functions.contacts.remove },
  restore_contact: { kind: "mutation", fn: api.functions.contacts.restore },

  // Opportunities
  create_opportunity: { kind: "mutation", fn: api.functions.opportunities.create },
  get_opportunity: { kind: "query", fn: api.functions.opportunities.get },
  list_opportunities: { kind: "query", fn: api.functions.opportunities.list },
  update_opportunity: { kind: "mutation", fn: api.functions.opportunities.update },
  delete_opportunity: { kind: "mutation", fn: api.functions.opportunities.remove },
  restore_opportunity: { kind: "mutation", fn: api.functions.opportunities.restore },

  // Tasks
  create_task: { kind: "mutation", fn: api.functions.tasks.create },
  get_task: { kind: "query", fn: api.functions.tasks.get },
  list_tasks: { kind: "query", fn: api.functions.tasks.list },
  update_task: { kind: "mutation", fn: api.functions.tasks.update },
  delete_task: { kind: "mutation", fn: api.functions.tasks.remove },
  restore_task: { kind: "mutation", fn: api.functions.tasks.restore },

  // Reminders
  create_reminder: { kind: "mutation", fn: api.functions.reminders.create },
  get_reminder: { kind: "query", fn: api.functions.reminders.get },
  list_reminders: { kind: "query", fn: api.functions.reminders.list },
  update_reminder: { kind: "mutation", fn: api.functions.reminders.update },
  delete_reminder: { kind: "mutation", fn: api.functions.reminders.remove },
  restore_reminder: { kind: "mutation", fn: api.functions.reminders.restore },

  // Search & analytics
  search_crm: { kind: "query", fn: api.functions.search.search },
  get_pipeline_summary: { kind: "query", fn: api.functions.opportunities.getPipelineSummary },
  get_activity_feed: { kind: "query", fn: api.functions.auditLog.list },
  get_overdue_items: { kind: "query", fn: api.functions.search.getOverdueItems },

  // Admin
  get_tenant: { kind: "query", fn: api.functions.tenants.get },
  update_tenant: { kind: "mutation", fn: api.functions.tenants.update },
  invite_user: { kind: "mutation", fn: api.functions.users.invite },
  list_users: { kind: "query", fn: api.functions.users.list },
  deactivate_user: { kind: "mutation", fn: api.functions.users.deactivate },
  reactivate_user: { kind: "mutation", fn: api.functions.users.reactivate },
};

// Handle JSON-RPC request
export async function handleMCPRequest(
  ctx: ActionCtx,
  request: JSONRPCRequest,
  token?: string | null
): Promise<JSONRPCResponse> {
  const id = request.id ?? null;

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

      case "tools/call": {
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
      }

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

// Execute a tool call by dispatching to the mapped Convex function
async function executeToolCall(
  ctx: ActionCtx,
  toolName: string,
  args: Record<string, unknown>,
  token?: string | null
): Promise<unknown> {
  const handler = TOOL_HANDLERS[toolName];
  if (!handler) {
    throw new CRMError("VALIDATION_ERROR", `Unknown tool: ${toolName}`);
  }

  // Inject token into args for authentication at the function level
  const argsWithToken = { ...args, _token: token ?? undefined };

  return handler.kind === "query"
    ? await ctx.runQuery(handler.fn, argsWithToken)
    : await ctx.runMutation(handler.fn, argsWithToken);
}
