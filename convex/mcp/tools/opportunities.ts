import { ToolDefinition } from "../server";

export const opportunityTools: ToolDefinition[] = [
  {
    name: "create_opportunity",
    description:
      "Create a new sales opportunity (deal) linked to an account. Opportunities track potential sales through the pipeline. The stage must be one of the valid stages configured for the tenant.",
    inputSchema: {
      type: "object",
      properties: {
        accountId: {
          type: "string",
          description: "ID of the account this opportunity is for (required)",
        },
        contactId: {
          type: "string",
          description: "ID of the primary contact for this deal",
        },
        name: {
          type: "string",
          description: "Opportunity name/title (required)",
        },
        stage: {
          type: "string",
          description:
            "Pipeline stage (required). Default stages: lead, qualified, proposal, negotiation, closed_won, closed_lost",
        },
        amount: {
          type: "number",
          description: "Deal value/amount",
        },
        currency: {
          type: "string",
          description: "Currency code (default: tenant's default currency, usually USD)",
        },
        probability: {
          type: "number",
          description: "Win probability percentage (0-100)",
        },
        expectedCloseDate: {
          type: "number",
          description: "Expected close date as Unix timestamp (milliseconds)",
        },
        notes: {
          type: "string",
          description: "Additional notes about the opportunity",
        },
        ownerId: {
          type: "string",
          description: "User ID of the opportunity owner/sales rep",
        },
      },
      required: ["accountId", "name", "stage"],
    },
  },
  {
    name: "get_opportunity",
    description: "Retrieve a single opportunity by its unique ID. Returns full opportunity details.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The unique identifier of the opportunity",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "list_opportunities",
    description:
      "List opportunities with optional filtering by account, stage, or owner. Use to view pipeline or find specific deals. Results are paginated.",
    inputSchema: {
      type: "object",
      properties: {
        accountId: {
          type: "string",
          description: "Filter by account ID - shows all deals with that company",
        },
        stage: {
          type: "string",
          description: "Filter by pipeline stage",
        },
        ownerId: {
          type: "string",
          description: "Filter by owner user ID",
        },
        includeDeleted: {
          type: "boolean",
          description: "Include soft-deleted opportunities (default: false)",
        },
        cursor: {
          type: "string",
          description: "Pagination cursor from previous response",
        },
        limit: {
          type: "number",
          description: "Maximum results to return (default: 20, max: 100)",
        },
      },
    },
  },
  {
    name: "update_opportunity",
    description:
      "Update an existing opportunity. Use this to move deals through stages, update amounts, or modify other details. Only include fields to change.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The unique identifier of the opportunity to update (required)",
        },
        contactId: { type: "string", description: "Updated contact ID" },
        name: { type: "string", description: "Updated opportunity name" },
        stage: {
          type: "string",
          description: "Updated stage - moving to closed_won or closed_lost will set closedAt",
        },
        amount: { type: "number", description: "Updated deal amount" },
        currency: { type: "string", description: "Updated currency code" },
        probability: { type: "number", description: "Updated win probability (0-100)" },
        expectedCloseDate: { type: "number", description: "Updated expected close date" },
        notes: { type: "string", description: "Updated notes" },
        ownerId: { type: "string", description: "Updated owner user ID" },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_opportunity",
    description: "Soft delete an opportunity. The opportunity can be restored later.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The unique identifier of the opportunity to delete",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "restore_opportunity",
    description:
      "Restore a previously soft-deleted opportunity. Will fail if the parent account is deleted.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The unique identifier of the deleted opportunity to restore",
        },
      },
      required: ["id"],
    },
  },
];
