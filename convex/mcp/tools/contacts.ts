import { ToolDefinition } from "../server";

export const contactTools: ToolDefinition[] = [
  {
    name: "create_contact",
    description:
      "Create a new contact person linked to an account. Contacts represent individuals at a company. Returns the created contact with its ID.",
    inputSchema: {
      type: "object",
      properties: {
        accountId: {
          type: "string",
          description: "ID of the parent account this contact belongs to (required)",
        },
        firstName: {
          type: "string",
          description: "Contact's first name (required)",
        },
        lastName: {
          type: "string",
          description: "Contact's last name (required)",
        },
        email: {
          type: "string",
          description: "Contact's email address",
        },
        phone: {
          type: "string",
          description: "Contact's phone number",
        },
        title: {
          type: "string",
          description: "Job title (e.g., 'CEO', 'Sales Director')",
        },
        isPrimary: {
          type: "boolean",
          description: "Whether this is the primary contact for the account",
        },
        notes: {
          type: "string",
          description: "Additional notes about the contact",
        },
      },
      required: ["accountId", "firstName", "lastName"],
    },
  },
  {
    name: "get_contact",
    description: "Retrieve a single contact by its unique ID. Returns full contact details.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The unique identifier of the contact",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "list_contacts",
    description:
      "List contacts with optional filtering. Can filter by account to see all contacts at a company. Results are paginated.",
    inputSchema: {
      type: "object",
      properties: {
        accountId: {
          type: "string",
          description: "Filter contacts by account ID - shows all contacts at that company",
        },
        includeDeleted: {
          type: "boolean",
          description: "Include soft-deleted contacts (default: false)",
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
    name: "update_contact",
    description:
      "Update an existing contact. Only include fields you want to change. Note: accountId cannot be changed after creation.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The unique identifier of the contact to update (required)",
        },
        firstName: { type: "string", description: "Updated first name" },
        lastName: { type: "string", description: "Updated last name" },
        email: { type: "string", description: "Updated email address" },
        phone: { type: "string", description: "Updated phone number" },
        title: { type: "string", description: "Updated job title" },
        isPrimary: { type: "boolean", description: "Updated primary contact flag" },
        notes: { type: "string", description: "Updated notes" },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_contact",
    description: "Soft delete a contact. The contact can be restored later.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The unique identifier of the contact to delete",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "restore_contact",
    description:
      "Restore a previously soft-deleted contact. Will fail if the parent account is deleted.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The unique identifier of the deleted contact to restore",
        },
      },
      required: ["id"],
    },
  },
];
