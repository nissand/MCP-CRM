import { ToolDefinition } from "../server";

export const searchTools: ToolDefinition[] = [
  {
    name: "search_crm",
    description:
      "Full-text search across all CRM entities. Searches account names, contact names, opportunity names, task titles, and reminder titles. Returns ranked results with entity type indicated.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query - matches against names, titles, and other text fields (required)",
        },
        entityTypes: {
          type: "array",
          items: {
            type: "string",
            enum: ["account", "contact", "opportunity", "task", "reminder"],
          },
          description: "Entity types to search. If not specified, searches all types.",
        },
        limit: {
          type: "number",
          description: "Maximum results to return (default: 10, max: 50)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_pipeline_summary",
    description:
      "Get sales pipeline summary with opportunity counts and total amounts by stage. Shows the current state of the sales funnel with weighted pipeline value based on probability.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_activity_feed",
    description:
      "Get recent audit log entries showing CRM activity. Can filter by entity type, specific entity, user, or action type. Useful for tracking changes and user activity.",
    inputSchema: {
      type: "object",
      properties: {
        entityType: {
          type: "string",
          enum: ["account", "contact", "opportunity", "task", "reminder", "user", "tenant"],
          description: "Filter by entity type",
        },
        entityId: {
          type: "string",
          description: "Filter by specific entity ID",
        },
        userId: {
          type: "string",
          description: "Filter by user who performed the action",
        },
        action: {
          type: "string",
          enum: ["create", "update", "delete", "restore"],
          description: "Filter by action type",
        },
        startDate: {
          type: "number",
          description: "Start of date range (Unix timestamp)",
        },
        endDate: {
          type: "number",
          description: "End of date range (Unix timestamp)",
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
    name: "get_overdue_items",
    description:
      "Get all overdue tasks and reminders. Returns items past their due date that are not completed/cancelled, sorted by how overdue they are. Useful for daily review and prioritization.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Maximum results to return (default: 20)",
        },
      },
    },
  },
];
