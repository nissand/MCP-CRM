import { z } from "zod";

// Address schema
export const addressSchema = z.object({
  street: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
});

// Account schemas
export const createAccountSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  industry: z.string().max(100).optional(),
  website: z.string().url().optional().or(z.literal("")),
  phone: z.string().max(50).optional(),
  address: addressSchema.optional(),
  notes: z.string().max(10000).optional(),
  ownerId: z.string().optional(),
});

export const updateAccountSchema = createAccountSchema.partial();

// Contact schemas
export const createContactSchema = z.object({
  accountId: z.string().min(1, "Account ID is required"),
  firstName: z.string().min(1, "First name is required").max(100),
  lastName: z.string().min(1, "Last name is required").max(100),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(50).optional(),
  title: z.string().max(100).optional(),
  isPrimary: z.boolean().default(false),
  notes: z.string().max(10000).optional(),
});

export const updateContactSchema = createContactSchema.partial().omit({ accountId: true });

// Opportunity schemas
export const createOpportunitySchema = z.object({
  accountId: z.string().min(1, "Account ID is required"),
  contactId: z.string().optional(),
  name: z.string().min(1, "Name is required").max(255),
  stage: z.string().min(1, "Stage is required"),
  amount: z.number().nonnegative().optional(),
  currency: z.string().length(3).default("USD"),
  probability: z.number().min(0).max(100).optional(),
  expectedCloseDate: z.number().optional(),
  notes: z.string().max(10000).optional(),
  ownerId: z.string().optional(),
});

export const updateOpportunitySchema = createOpportunitySchema.partial().omit({ accountId: true });

// Task schemas
export const taskStatusSchema = z.enum(["pending", "in_progress", "completed", "cancelled"]);
export const taskPrioritySchema = z.enum(["low", "medium", "high"]);
export const linkedEntityTypeSchema = z.enum(["account", "contact", "opportunity"]);

export const createTaskSchema = z.object({
  title: z.string().min(1, "Title is required").max(255),
  description: z.string().max(10000).optional(),
  status: taskStatusSchema.default("pending"),
  priority: taskPrioritySchema.default("medium"),
  dueDate: z.number().optional(),
  linkedEntityType: linkedEntityTypeSchema.optional(),
  linkedEntityId: z.string().optional(),
  assigneeId: z.string().optional(),
});

export const updateTaskSchema = createTaskSchema.partial();

// Reminder schemas
export const reminderLinkedEntityTypeSchema = z.enum([
  "account",
  "contact",
  "opportunity",
  "task",
]);

export const createReminderSchema = z.object({
  title: z.string().min(1, "Title is required").max(255),
  description: z.string().max(10000).optional(),
  remindAt: z.number().min(1, "Remind at timestamp is required"),
  linkedEntityType: reminderLinkedEntityTypeSchema.optional(),
  linkedEntityId: z.string().optional(),
  assigneeId: z.string().optional(),
});

export const updateReminderSchema = createReminderSchema.partial();

// Tenant schemas
export const updateTenantSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  settings: z
    .object({
      opportunityStages: z.array(z.string().min(1)).min(1).optional(),
      defaultCurrency: z.string().length(3).optional(),
      timezone: z.string().max(50).optional(),
    })
    .optional(),
});

// User schemas
export const inviteUserSchema = z.object({
  email: z.string().email("Valid email is required"),
  name: z.string().min(1).max(255),
  role: z.enum(["admin", "member"]).default("member"),
});

// Pagination schemas
export const paginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.number().min(1).max(100).default(20),
});

// Search schema
export const searchSchema = z.object({
  query: z.string().min(1, "Search query is required").max(255),
  entityTypes: z
    .array(z.enum(["account", "contact", "opportunity", "task", "reminder"]))
    .optional(),
  limit: z.number().min(1).max(50).default(10),
});

// List filters
export const listAccountsFilterSchema = z.object({
  industry: z.string().optional(),
  ownerId: z.string().optional(),
  includeDeleted: z.boolean().default(false),
  ...paginationSchema.shape,
});

export const listContactsFilterSchema = z.object({
  accountId: z.string().optional(),
  includeDeleted: z.boolean().default(false),
  ...paginationSchema.shape,
});

export const listOpportunitiesFilterSchema = z.object({
  accountId: z.string().optional(),
  stage: z.string().optional(),
  ownerId: z.string().optional(),
  includeDeleted: z.boolean().default(false),
  ...paginationSchema.shape,
});

export const listTasksFilterSchema = z.object({
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  assigneeId: z.string().optional(),
  linkedEntityType: linkedEntityTypeSchema.optional(),
  linkedEntityId: z.string().optional(),
  overdue: z.boolean().optional(),
  includeDeleted: z.boolean().default(false),
  ...paginationSchema.shape,
});

export const listRemindersFilterSchema = z.object({
  assigneeId: z.string().optional(),
  linkedEntityType: reminderLinkedEntityTypeSchema.optional(),
  linkedEntityId: z.string().optional(),
  upcoming: z.boolean().optional(),
  overdue: z.boolean().optional(),
  includeDeleted: z.boolean().default(false),
  ...paginationSchema.shape,
});

// Type exports
export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
export type CreateContactInput = z.infer<typeof createContactSchema>;
export type UpdateContactInput = z.infer<typeof updateContactSchema>;
export type CreateOpportunityInput = z.infer<typeof createOpportunitySchema>;
export type UpdateOpportunityInput = z.infer<typeof updateOpportunitySchema>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type CreateReminderInput = z.infer<typeof createReminderSchema>;
export type UpdateReminderInput = z.infer<typeof updateReminderSchema>;
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;
export type InviteUserInput = z.infer<typeof inviteUserSchema>;
export type SearchInput = z.infer<typeof searchSchema>;
