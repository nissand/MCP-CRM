import { ToolDefinition } from "../server";

export const taskTools: ToolDefinition[] = [
  {
    name: "create_task",
    description:
      "Create a new task/action item. Tasks can be standalone or linked to accounts, contacts, or opportunities. Use for follow-ups, to-dos, and action items.",
    inputSchema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Task title/subject (required)",
        },
        description: {
          type: "string",
          description: "Detailed task description",
        },
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
        dueDate: {
          type: "number",
          description: "Due date as Unix timestamp (milliseconds)",
        },
        linkedEntityType: {
          type: "string",
          enum: ["account", "contact", "opportunity"],
          description: "Type of entity to link this task to",
        },
        linkedEntityId: {
          type: "string",
          description: "ID of the linked entity",
        },
        assigneeId: {
          type: "string",
          description: "User ID to assign this task to",
        },
      },
      required: ["title"],
    },
  },
  {
    name: "get_task",
    description: "Retrieve a single task by its unique ID. Returns full task details.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The unique identifier of the task",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "list_tasks",
    description:
      "List tasks with optional filtering by status, priority, assignee, or linked entity. Can find overdue tasks. Results are sorted by due date and priority.",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["pending", "in_progress", "completed", "cancelled"],
          description: "Filter by status",
        },
        priority: {
          type: "string",
          enum: ["low", "medium", "high"],
          description: "Filter by priority",
        },
        assigneeId: {
          type: "string",
          description: "Filter by assigned user ID",
        },
        linkedEntityType: {
          type: "string",
          enum: ["account", "contact", "opportunity"],
          description: "Filter by linked entity type",
        },
        linkedEntityId: {
          type: "string",
          description: "Filter by linked entity ID (requires linkedEntityType)",
        },
        overdue: {
          type: "boolean",
          description: "Set to true to only show overdue tasks",
        },
        includeDeleted: {
          type: "boolean",
          description: "Include soft-deleted tasks (default: false)",
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
    name: "update_task",
    description:
      "Update an existing task. Use to change status, reassign, update due date, etc. Setting status to 'completed' will record completedAt timestamp.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The unique identifier of the task to update (required)",
        },
        title: { type: "string", description: "Updated title" },
        description: { type: "string", description: "Updated description" },
        status: {
          type: "string",
          enum: ["pending", "in_progress", "completed", "cancelled"],
          description: "Updated status",
        },
        priority: {
          type: "string",
          enum: ["low", "medium", "high"],
          description: "Updated priority",
        },
        dueDate: { type: "number", description: "Updated due date" },
        linkedEntityType: {
          type: "string",
          enum: ["account", "contact", "opportunity"],
          description: "Updated linked entity type",
        },
        linkedEntityId: { type: "string", description: "Updated linked entity ID" },
        assigneeId: { type: "string", description: "Updated assignee user ID" },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_task",
    description: "Soft delete a task. The task can be restored later.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The unique identifier of the task to delete",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "restore_task",
    description: "Restore a previously soft-deleted task.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The unique identifier of the deleted task to restore",
        },
      },
      required: ["id"],
    },
  },
];
