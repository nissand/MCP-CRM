import { ToolDefinition } from "../server";

export const reminderTools: ToolDefinition[] = [
  {
    name: "create_reminder",
    description:
      "Create a time-triggered reminder. Reminders can be linked to accounts, contacts, opportunities, or tasks. Use for follow-up alerts and scheduled notifications.",
    inputSchema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Reminder title/subject (required)",
        },
        description: {
          type: "string",
          description: "Detailed reminder description",
        },
        remindAt: {
          type: "number",
          description: "When to trigger the reminder - Unix timestamp in milliseconds (required)",
        },
        linkedEntityType: {
          type: "string",
          enum: ["account", "contact", "opportunity", "task"],
          description: "Type of entity to link this reminder to",
        },
        linkedEntityId: {
          type: "string",
          description: "ID of the linked entity",
        },
        assigneeId: {
          type: "string",
          description: "User ID to assign this reminder to",
        },
      },
      required: ["title", "remindAt"],
    },
  },
  {
    name: "get_reminder",
    description: "Retrieve a single reminder by its unique ID. Returns full reminder details.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The unique identifier of the reminder",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "list_reminders",
    description:
      "List reminders with optional filtering. Can filter by assignee, linked entity, or get upcoming/overdue reminders. Results are sorted by remind time.",
    inputSchema: {
      type: "object",
      properties: {
        assigneeId: {
          type: "string",
          description: "Filter by assigned user ID",
        },
        linkedEntityType: {
          type: "string",
          enum: ["account", "contact", "opportunity", "task"],
          description: "Filter by linked entity type",
        },
        linkedEntityId: {
          type: "string",
          description: "Filter by linked entity ID (requires linkedEntityType)",
        },
        upcoming: {
          type: "boolean",
          description: "Set to true to only show future (not yet due) reminders",
        },
        overdue: {
          type: "boolean",
          description: "Set to true to only show past-due incomplete reminders",
        },
        includeDeleted: {
          type: "boolean",
          description: "Include soft-deleted reminders (default: false)",
        },
        cursor: {
          type: "string",
          description: "Pagination cursor",
        },
        limit: {
          type: "number",
          description: "Maximum results (default: 20, max: 100)",
        },
      },
    },
  },
  {
    name: "update_reminder",
    description:
      "Update an existing reminder. Use to reschedule, mark complete, or modify details. Setting isCompleted to true records completedAt timestamp.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The unique identifier of the reminder to update (required)",
        },
        title: { type: "string", description: "Updated title" },
        description: { type: "string", description: "Updated description" },
        remindAt: { type: "number", description: "Updated remind time (Unix timestamp)" },
        isCompleted: {
          type: "boolean",
          description: "Mark reminder as completed",
        },
        linkedEntityType: {
          type: "string",
          enum: ["account", "contact", "opportunity", "task"],
          description: "Updated linked entity type",
        },
        linkedEntityId: { type: "string", description: "Updated linked entity ID" },
        assigneeId: { type: "string", description: "Updated assignee user ID" },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_reminder",
    description: "Soft delete a reminder. The reminder can be restored later.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The unique identifier of the reminder to delete",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "restore_reminder",
    description: "Restore a previously soft-deleted reminder.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The unique identifier of the deleted reminder to restore",
        },
      },
      required: ["id"],
    },
  },
];
