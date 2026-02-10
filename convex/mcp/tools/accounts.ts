import { ToolDefinition } from "../server";

export const accountTools: ToolDefinition[] = [
  {
    name: "create_account",
    description:
      "Create a new company/organization account in the CRM. Returns the created account with its ID. Use this when a user wants to add a new company or organization to track.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Company name - the primary identifier for the account (required)",
        },
        industry: {
          type: "string",
          description: "Industry sector (e.g., 'Technology', 'Healthcare', 'Finance')",
        },
        website: {
          type: "string",
          description: "Company website URL (e.g., 'https://example.com')",
        },
        phone: {
          type: "string",
          description: "Main company phone number",
        },
        address: {
          type: "object",
          description: "Company physical address",
          properties: {
            street: { type: "string", description: "Street address" },
            city: { type: "string", description: "City" },
            state: { type: "string", description: "State/Province" },
            postalCode: { type: "string", description: "Postal/ZIP code" },
            country: { type: "string", description: "Country" },
          },
        },
        notes: {
          type: "string",
          description: "Additional notes or context about the account",
        },
        ownerId: {
          type: "string",
          description: "User ID of the account owner (for sales assignment)",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "get_account",
    description:
      "Retrieve a single account by its unique ID. Returns full account details including all fields.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The unique identifier (Convex ID) of the account",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "list_accounts",
    description:
      "List all accounts with optional filtering and pagination. Use this to browse accounts or find specific ones by criteria. Results are paginated - use the returned cursor for more results.",
    inputSchema: {
      type: "object",
      properties: {
        industry: {
          type: "string",
          description: "Filter accounts by industry sector",
        },
        ownerId: {
          type: "string",
          description: "Filter accounts by owner user ID",
        },
        includeDeleted: {
          type: "boolean",
          description: "Set to true to include soft-deleted accounts (default: false)",
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
    name: "update_account",
    description:
      "Update an existing account. Only include fields you want to change - unspecified fields remain unchanged.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The unique identifier of the account to update (required)",
        },
        name: { type: "string", description: "Updated company name" },
        industry: { type: "string", description: "Updated industry sector" },
        website: { type: "string", description: "Updated website URL" },
        phone: { type: "string", description: "Updated phone number" },
        address: {
          type: "object",
          description: "Updated address (replaces entire address)",
          properties: {
            street: { type: "string" },
            city: { type: "string" },
            state: { type: "string" },
            postalCode: { type: "string" },
            country: { type: "string" },
          },
        },
        notes: { type: "string", description: "Updated notes" },
        ownerId: { type: "string", description: "Updated owner user ID" },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_account",
    description:
      "Soft delete an account. The account can be restored later. If the account has related contacts or opportunities, you must use force=true to cascade delete them.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The unique identifier of the account to delete",
        },
        force: {
          type: "boolean",
          description:
            "Set to true to force deletion and cascade to related contacts/opportunities",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "restore_account",
    description:
      "Restore a previously soft-deleted account. The account will become active again.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The unique identifier of the deleted account to restore",
        },
      },
      required: ["id"],
    },
  },
];
