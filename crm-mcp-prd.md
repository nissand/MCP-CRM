# Product Requirements Document: Stateless MCP CRM

## 1. Overview

### 1.1 Product Vision
A stateless, headless CRM system with **zero user interface** — designed exclusively for consumption by AI agents and AI-powered clients (Claude, ChatGPT, Claude Co-worker, custom MCP clients). The CRM exposes all functionality through an MCP (Model Context Protocol) server, enabling AI agents to manage accounts, contacts, opportunities, tasks, and reminders on behalf of users.

### 1.2 Tech Stack
- **Language:** TypeScript (strict mode)
- **Backend/Database:** Convex (real-time backend platform)
- **Architecture:** Convex-native — single deployment using Convex HTTP actions for the MCP server endpoint. No separate server.
- **Auth:** Google OAuth via Convex Auth
- **Protocol:** MCP (Model Context Protocol) over stdio or SSE transport

### 1.3 Target Users
- **Initial:** Small businesses with 1–100 employees
- **Future:** Mid-market and enterprise companies
- **User persona:** Business users interacting with the CRM through AI assistants (Claude Desktop, ChatGPT, Claude Co-worker, custom AI agents)

### 1.4 Key Design Principles
1. **No UI, ever** — All interactions happen through MCP tools. No web dashboard, no mobile app.
2. **AI-agent-first** — Tool names, descriptions, input schemas, and response formats are optimized for LLM comprehension.
3. **Stateless interactions** — Each MCP tool call is self-contained. No session state between calls.
4. **Multi-tenant by default** — Tenant isolation at the data layer from day one.
5. **Audit everything** — Every Create, Update, and Delete operation is logged.

---

## 2. Authentication & Multi-Tenancy

### 2.1 Authentication Flow
- Users authenticate via **Google OAuth** using Convex Auth.
- Upon first login, a new **tenant** is automatically created and the user becomes the **admin**.
- Subsequent logins resolve the user to their existing tenant.
- The MCP server validates the user's auth token on every request.

### 2.2 Tenant Model
```
Tenant {
  _id: Id<"tenants">
  name: string                    // Company/team name set by admin
  currency: string                // Default currency code (e.g., "USD", "EUR", "GBP") — default: "USD"
  opportunityStages: string[]     // Configurable pipeline stages
  createdAt: number               // Unix timestamp
  updatedAt: number
}
```

**Default opportunity stages:** `["Lead", "Qualified", "Proposal", "Negotiation", "Closed Won", "Closed Lost"]`

### 2.3 User Model
```
User {
  _id: Id<"users">
  tenantId: Id<"tenants">
  email: string
  name: string
  avatarUrl?: string
  role: "admin" | "member"
  status: "active" | "invited" | "deactivated"
  invitedBy?: Id<"users">
  createdAt: number
  updatedAt: number
}
```

### 2.4 Invitation Flow
- Only **admin** users can invite new members.
- Admin provides an email address via the `invite_user` MCP tool.
- An invitation record is created. When the invited user logs in with that Google email, they are automatically linked to the tenant.
- Admin can also deactivate users (soft disable, not delete).

### 2.5 Tenant Configuration
- Admin can update tenant name, default currency, and opportunity pipeline stages via MCP tools.
- Changes to pipeline stages do not retroactively modify existing opportunities.

---

## 3. Data Model

### 3.1 Accounts
```
Account {
  _id: Id<"accounts">
  tenantId: Id<"tenants">
  name: string                    // Company name (required)
  industry?: string
  website?: string
  phone?: string
  address?: {
    street?: string
    city?: string
    state?: string
    postalCode?: string
    country?: string
  }
  annualRevenue?: number
  employeeCount?: number
  status: "active" | "inactive" | "churned"  // default: "active"
  ownerId?: Id<"users">           // Account owner/rep
  notes?: string
  tags?: string[]
  createdBy: Id<"users">
  createdAt: number
  updatedAt: number
  deletedAt?: number              // Soft delete timestamp; null = not deleted
}
```

**Indexes:**
- `by_tenant` — `[tenantId]`
- `by_tenant_status` — `[tenantId, status]`
- `by_tenant_industry` — `[tenantId, industry]`
- `by_tenant_owner` — `[tenantId, ownerId]`
- Search index on `name`, `industry`, `notes`, `tags`

### 3.2 Contacts
Every contact **must** belong to exactly one Account.
```
Contact {
  _id: Id<"contacts">
  tenantId: Id<"tenants">
  accountId: Id<"accounts">       // Required — always linked to an account
  firstName: string               // Required
  lastName: string                // Required
  email?: string
  phone?: string
  title?: string                  // Job title
  department?: string
  isPrimary: boolean              // Primary contact for the account (default: false)
  notes?: string
  tags?: string[]
  createdBy: Id<"users">
  createdAt: number
  updatedAt: number
  deletedAt?: number
}
```

**Indexes:**
- `by_tenant` — `[tenantId]`
- `by_account` — `[tenantId, accountId]`
- `by_tenant_email` — `[tenantId, email]`
- Search index on `firstName`, `lastName`, `email`, `title`, `notes`

### 3.3 Opportunities
Linked to an Account (required) and optionally a primary Contact.
```
Opportunity {
  _id: Id<"opportunities">
  tenantId: Id<"tenants">
  accountId: Id<"accounts">       // Required
  primaryContactId?: Id<"contacts">
  name: string                    // Opportunity/deal name (required)
  stage: string                   // Must be one of tenant's configured stages
  amount?: number                 // Monetary value in tenant's currency
  currency: string                // Inherited from tenant default at creation time
  probability?: number            // 0-100 win probability percentage
  expectedCloseDate?: number      // Unix timestamp
  actualCloseDate?: number        // Set when moved to Closed Won/Lost
  ownerId?: Id<"users">
  notes?: string
  tags?: string[]
  lostReason?: string             // Populated when stage = "Closed Lost"
  createdBy: Id<"users">
  createdAt: number
  updatedAt: number
  deletedAt?: number
}
```

**Indexes:**
- `by_tenant` — `[tenantId]`
- `by_account` — `[tenantId, accountId]`
- `by_tenant_stage` — `[tenantId, stage]`
- `by_tenant_owner` — `[tenantId, ownerId]`
- `by_tenant_close_date` — `[tenantId, expectedCloseDate]`
- Search index on `name`, `stage`, `notes`

### 3.4 Tasks
Action items that can be linked to any entity.
```
Task {
  _id: Id<"tasks">
  tenantId: Id<"tenants">
  title: string                   // Required
  description?: string
  status: "open" | "in_progress" | "completed" | "cancelled"  // default: "open"
  priority: "low" | "medium" | "high" | "urgent"              // default: "medium"
  dueDate?: number                // Unix timestamp
  completedAt?: number
  assigneeId?: Id<"users">
  // Polymorphic linking — exactly one should be set (or none for standalone)
  accountId?: Id<"accounts">
  contactId?: Id<"contacts">
  opportunityId?: Id<"opportunities">
  createdBy: Id<"users">
  createdAt: number
  updatedAt: number
  deletedAt?: number
}
```

**Indexes:**
- `by_tenant` — `[tenantId]`
- `by_tenant_status` — `[tenantId, status]`
- `by_tenant_assignee` — `[tenantId, assigneeId]`
- `by_tenant_due_date` — `[tenantId, dueDate]`
- `by_account` — `[tenantId, accountId]`
- `by_contact` — `[tenantId, contactId]`
- `by_opportunity` — `[tenantId, opportunityId]`
- Search index on `title`, `description`

### 3.5 Reminders
Time-triggered alerts distinct from Tasks.
```
Reminder {
  _id: Id<"reminders">
  tenantId: Id<"tenants">
  title: string                   // Required
  description?: string
  remindAt: number                // Unix timestamp — when to remind (required)
  status: "pending" | "triggered" | "dismissed"  // default: "pending"
  assigneeId?: Id<"users">       // Who should be reminded
  // Polymorphic linking
  accountId?: Id<"accounts">
  contactId?: Id<"contacts">
  opportunityId?: Id<"opportunities">
  createdBy: Id<"users">
  createdAt: number
  updatedAt: number
  deletedAt?: number
}
```

**Indexes:**
- `by_tenant` — `[tenantId]`
- `by_tenant_status` — `[tenantId, status]`
- `by_tenant_assignee` — `[tenantId, assigneeId]`
- `by_tenant_remind_at` — `[tenantId, remindAt]`
- `by_account` — `[tenantId, accountId]`
- `by_contact` — `[tenantId, contactId]`
- `by_opportunity` — `[tenantId, opportunityId]`
- Search index on `title`, `description`

### 3.6 Audit Log
```
AuditLog {
  _id: Id<"auditLogs">
  tenantId: Id<"tenants">
  userId: Id<"users">
  action: "create" | "update" | "delete" | "restore"
  entityType: "account" | "contact" | "opportunity" | "task" | "reminder" | "tenant" | "user"
  entityId: string                // The _id of the affected record
  metadata?: {                    // Reserved for future field-level diffs
    changes?: Record<string, { old: any; new: any }>
  }
  timestamp: number
}
```

**Indexes:**
- `by_tenant` — `[tenantId]`
- `by_tenant_entity` — `[tenantId, entityType, entityId]`
- `by_tenant_user` — `[tenantId, userId]`
- `by_tenant_timestamp` — `[tenantId, timestamp]`

---

## 4. MCP Server Design

### 4.1 Transport & Deployment
- The MCP server is implemented as a **Convex HTTP action** endpoint.
- Supports **Streamable HTTP** transport (the current MCP standard, replacing the deprecated SSE transport).
- Single endpoint: `POST /mcp` handles all MCP protocol messages.
- Authentication token passed via the `Authorization` header on every request.

### 4.2 Authentication in MCP Context
- Every MCP request must include a valid auth token in the `Authorization: Bearer <token>` header.
- The server validates the token, resolves the user and tenant, and injects `{ userId, tenantId }` into the tool execution context.
- Unauthenticated requests receive a standardized MCP error response.

### 4.3 MCP Tools — Complete List

#### 4.3.1 Account Tools
| Tool Name | Description | Key Parameters |
|-----------|-------------|----------------|
| `create_account` | Create a new account | `name` (required), `industry`, `website`, `phone`, `address`, `annualRevenue`, `employeeCount`, `status`, `ownerId`, `notes`, `tags` |
| `get_account` | Get a single account by ID | `accountId` (required) |
| `list_accounts` | List accounts with optional filters | `status`, `industry`, `ownerId`, `tags`, `limit` (default 50, max 200), `cursor` |
| `update_account` | Update account fields | `accountId` (required), plus any updatable field |
| `delete_account` | Soft-delete an account (cascade) | `accountId` (required), `confirm` (required if has related records — see §4.4) |
| `restore_account` | Restore a soft-deleted account | `accountId` (required) |

#### 4.3.2 Contact Tools
| Tool Name | Description | Key Parameters |
|-----------|-------------|----------------|
| `create_contact` | Create a new contact | `accountId` (required), `firstName` (required), `lastName` (required), `email`, `phone`, `title`, `department`, `isPrimary`, `notes`, `tags` |
| `get_contact` | Get a single contact by ID | `contactId` (required) |
| `list_contacts` | List contacts with filters | `accountId`, `tags`, `limit`, `cursor` |
| `update_contact` | Update contact fields | `contactId` (required), plus any updatable field |
| `delete_contact` | Soft-delete a contact | `contactId` (required) |
| `restore_contact` | Restore a soft-deleted contact | `contactId` (required) |

#### 4.3.3 Opportunity Tools
| Tool Name | Description | Key Parameters |
|-----------|-------------|----------------|
| `create_opportunity` | Create a new opportunity | `accountId` (required), `name` (required), `stage` (required), `primaryContactId`, `amount`, `probability`, `expectedCloseDate`, `ownerId`, `notes`, `tags` |
| `get_opportunity` | Get a single opportunity by ID | `opportunityId` (required) |
| `list_opportunities` | List opportunities with filters | `accountId`, `stage`, `ownerId`, `minAmount`, `maxAmount`, `expectedCloseBefore`, `expectedCloseAfter`, `tags`, `limit`, `cursor` |
| `update_opportunity` | Update opportunity fields | `opportunityId` (required), plus any updatable field |
| `delete_opportunity` | Soft-delete an opportunity | `opportunityId` (required) |
| `restore_opportunity` | Restore a soft-deleted opportunity | `opportunityId` (required) |

#### 4.3.4 Task Tools
| Tool Name | Description | Key Parameters |
|-----------|-------------|----------------|
| `create_task` | Create a new task | `title` (required), `description`, `status`, `priority`, `dueDate`, `assigneeId`, `accountId`, `contactId`, `opportunityId` |
| `get_task` | Get a single task by ID | `taskId` (required) |
| `list_tasks` | List tasks with filters | `status`, `priority`, `assigneeId`, `accountId`, `contactId`, `opportunityId`, `overdue` (boolean), `limit`, `cursor` |
| `update_task` | Update task fields | `taskId` (required), plus any updatable field |
| `delete_task` | Soft-delete a task | `taskId` (required) |
| `restore_task` | Restore a soft-deleted task | `taskId` (required) |

#### 4.3.5 Reminder Tools
| Tool Name | Description | Key Parameters |
|-----------|-------------|----------------|
| `create_reminder` | Create a new reminder | `title` (required), `remindAt` (required), `description`, `assigneeId`, `accountId`, `contactId`, `opportunityId` |
| `get_reminder` | Get a single reminder by ID | `reminderId` (required) |
| `list_reminders` | List reminders with filters | `status`, `assigneeId`, `accountId`, `contactId`, `opportunityId`, `upcoming` (boolean — due in next 24h), `overdue` (boolean), `limit`, `cursor` |
| `update_reminder` | Update reminder fields | `reminderId` (required), plus any updatable field |
| `delete_reminder` | Soft-delete a reminder | `reminderId` (required) |
| `restore_reminder` | Restore a soft-deleted reminder | `reminderId` (required) |

#### 4.3.6 Search & Analytics Tools
| Tool Name | Description | Key Parameters |
|-----------|-------------|----------------|
| `search_crm` | Full-text search across all entities | `query` (required), `entityTypes` (optional filter: array of entity type names), `limit` |
| `get_pipeline_summary` | Aggregated opportunity pipeline | `ownerId` (optional filter) — Returns: count and total amount per stage |
| `get_activity_feed` | Recent CUD activity across the CRM | `entityType` (optional filter), `userId` (optional filter), `limit` (default 25) |
| `get_overdue_items` | All overdue tasks and reminders | `assigneeId` (optional filter) |

#### 4.3.7 Admin & Tenant Tools
| Tool Name | Description | Key Parameters |
|-----------|-------------|----------------|
| `get_tenant` | Get current tenant details | *(none — uses auth context)* |
| `update_tenant` | Update tenant settings | `name`, `currency`, `opportunityStages` |
| `invite_user` | Invite a user to the tenant | `email` (required) |
| `list_users` | List all users in the tenant | `status` (optional filter) |
| `deactivate_user` | Deactivate a user | `userId` (required) |
| `reactivate_user` | Reactivate a deactivated user | `userId` (required) |

### 4.4 Cascade Delete Behavior
When `delete_account` is called on an account that has related records:

1. **Without `confirm: true`:** The tool returns an error with a summary:
   ```json
   {
     "error": "DELETION_HAS_DEPENDENCIES",
     "message": "This account has related records. Pass confirm: true to cascade soft-delete.",
     "affected": {
       "contacts": 5,
       "opportunities": 3,
       "tasks": 8,
       "reminders": 2
     }
   }
   ```

2. **With `confirm: true`:** The account and all related contacts, opportunities, tasks, and reminders are soft-deleted. Each deletion is individually logged in the audit trail.

3. **Restoring a cascade-deleted account** also restores all records that were deleted in the same cascade operation.

### 4.5 Tool Response Format
All tools return structured JSON responses optimized for AI consumption:

```typescript
// Success response
{
  success: true,
  data: { ... }  // Entity or array of entities
  pagination?: {
    cursor: string | null  // null = no more results
    hasMore: boolean
    totalCount?: number
  }
}

// Error response
{
  success: false,
  error: {
    code: string           // Machine-readable error code
    message: string        // Human/AI-readable description
    details?: Record<string, any>
  }
}
```

### 4.6 Pagination
- All list operations use **cursor-based pagination**.
- Default page size: 50 records.
- Maximum page size: 200 records.
- The cursor is an opaque string returned in the response; pass it as `cursor` on the next call.

---

## 5. Convex Schema & Architecture

### 5.1 Directory Structure
```
/
├── convex/
│   ├── schema.ts                 # Convex schema definition (all tables)
│   ├── auth.config.ts            # Convex Auth configuration (Google OAuth)
│   ├── http.ts                   # HTTP action router (MCP endpoint)
│   ├── mcp/
│   │   ├── server.ts             # MCP protocol handler (message routing)
│   │   ├── auth.ts               # Auth middleware for MCP requests
│   │   └── tools/
│   │       ├── accounts.ts       # Account CRUD tools
│   │       ├── contacts.ts       # Contact CRUD tools
│   │       ├── opportunities.ts  # Opportunity CRUD tools
│   │       ├── tasks.ts          # Task CRUD tools
│   │       ├── reminders.ts      # Reminder CRUD tools
│   │       ├── search.ts         # Search & analytics tools
│   │       └── admin.ts          # Tenant & user management tools
│   ├── functions/
│   │   ├── accounts.ts           # Account mutations & queries
│   │   ├── contacts.ts           # Contact mutations & queries
│   │   ├── opportunities.ts      # Opportunity mutations & queries
│   │   ├── tasks.ts              # Task mutations & queries
│   │   ├── reminders.ts          # Reminder mutations & queries
│   │   ├── search.ts             # Search queries
│   │   ├── auditLog.ts           # Audit log mutations & queries
│   │   ├── tenants.ts            # Tenant mutations & queries
│   │   └── users.ts              # User mutations & queries
│   └── lib/
│       ├── utils.ts              # Shared utilities
│       ├── validators.ts         # Zod/Convex validators for each entity
│       └── errors.ts             # Error code constants
├── package.json
├── tsconfig.json
└── convex.json
```

### 5.2 Key Architecture Decisions
1. **MCP tool layer → Convex functions:** Each MCP tool maps to one or more Convex mutations/queries. The tool layer handles MCP protocol concerns; the function layer handles business logic.
2. **Tenant isolation:** Every query/mutation receives `tenantId` from the auth context and filters accordingly. No cross-tenant data access is possible.
3. **Audit logging:** Implemented as a wrapper/helper that each mutation calls after a successful CUD operation. The audit log write is part of the same Convex transaction to ensure consistency.
4. **Soft delete:** All queries filter out records where `deletedAt` is set, unless explicitly requesting deleted records (e.g., for restore operations).

### 5.3 Convex Search Indexes
For full-text search (`search_crm` tool), define Convex search indexes:
- `accounts.search_index` — fields: `name`, `industry`, `notes`
- `contacts.search_index` — fields: `firstName`, `lastName`, `email`, `title`, `notes`
- `opportunities.search_index` — fields: `name`, `stage`, `notes`
- `tasks.search_index` — fields: `title`, `description`
- `reminders.search_index` — fields: `title`, `description`

Each search index includes `tenantId` as a filter field for tenant isolation.

---

## 6. Validation Rules

### 6.1 Account Validation
- `name`: required, 1–255 characters
- `industry`: optional, 1–100 characters
- `website`: optional, valid URL format
- `phone`: optional, 1–50 characters
- `annualRevenue`: optional, must be >= 0
- `employeeCount`: optional, must be integer >= 0
- `status`: must be one of `"active"`, `"inactive"`, `"churned"`

### 6.2 Contact Validation
- `firstName`, `lastName`: required, 1–100 characters each
- `email`: optional, valid email format
- `accountId`: required, must reference an existing, non-deleted account in the same tenant

### 6.3 Opportunity Validation
- `name`: required, 1–255 characters
- `stage`: required, must be one of the tenant's configured stages
- `amount`: optional, must be >= 0
- `probability`: optional, must be 0–100
- `accountId`: required, must reference an existing, non-deleted account in the same tenant
- `primaryContactId`: optional, must reference an existing, non-deleted contact belonging to the same account

### 6.4 Task Validation
- `title`: required, 1–500 characters
- `status`: must be one of `"open"`, `"in_progress"`, `"completed"`, `"cancelled"`
- `priority`: must be one of `"low"`, `"medium"`, `"high"`, `"urgent"`
- At most one of `accountId`, `contactId`, `opportunityId` should be set (polymorphic link)

### 6.5 Reminder Validation
- `title`: required, 1–500 characters
- `remindAt`: required, must be a valid Unix timestamp
- `status`: must be one of `"pending"`, `"triggered"`, `"dismissed"`
- At most one of `accountId`, `contactId`, `opportunityId` should be set

---

## 7. Error Codes

| Code | HTTP-equiv | Description |
|------|-----------|-------------|
| `UNAUTHORIZED` | 401 | Missing or invalid auth token |
| `FORBIDDEN` | 403 | User doesn't have permission (e.g., non-admin calling admin tools) |
| `NOT_FOUND` | 404 | Entity not found or belongs to different tenant |
| `VALIDATION_ERROR` | 400 | Input validation failed (details include field-level errors) |
| `DELETION_HAS_DEPENDENCIES` | 409 | Account has related records; cascade requires confirmation |
| `INVALID_STAGE` | 400 | Opportunity stage not in tenant's configured stages |
| `DUPLICATE_INVITE` | 409 | User already invited or exists in tenant |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

---

## 8. Non-Functional Requirements

### 8.1 Performance
- All single-entity CRUD operations: < 200ms response time
- List operations (up to 200 records): < 500ms
- Search operations: < 1 second
- Pipeline summary: < 1 second

### 8.2 Scalability
- Data model supports thousands of accounts per tenant
- Cursor-based pagination prevents full-table scans
- Convex handles horizontal scaling automatically

### 8.3 Security
- All data access is scoped to the authenticated user's tenant
- No cross-tenant queries are possible by design
- Auth token validated on every single MCP request
- Admin-only operations (invite, deactivate, tenant settings) enforced at the function layer
- Soft-deleted records are excluded from all standard queries

### 8.4 Data Integrity
- Referential integrity enforced at the application layer:
  - Cannot create a contact without a valid account
  - Cannot create an opportunity without a valid account
  - Cannot set a primary contact that doesn't belong to the opportunity's account
  - Cascade delete maintains relational consistency
- Audit log writes are transactional with the operations they log

---

## 9. Future Considerations (Out of Scope for V1)

These are explicitly **not** in scope for the initial build but the architecture should not preclude them:

1. **Role-based access control (RBAC)** — Record-level or field-level permissions per user role
2. **Field-level audit diffs** — The `metadata.changes` field in the audit log is reserved for this
3. **Custom fields** — Allow tenants to define custom fields on any entity
4. **Webhooks / event notifications** — Push events when records change
5. **File attachments** — Attach documents to accounts, contacts, or opportunities
6. **Email integration** — Log emails against contacts/accounts
7. **Workflow automation** — Trigger actions based on stage changes or field updates
8. **API rate limiting** — Per-user or per-tenant rate limits
9. **Data export/import** — Bulk operations for migration
10. **Multiple MCP transports** — Support stdio transport for local AI agent use in addition to HTTP

---

## 10. Implementation Order

### Phase 1: Foundation
1. Initialize Convex project with TypeScript
2. Define the complete schema (`convex/schema.ts`) with all tables and indexes
3. Set up Google OAuth via Convex Auth
4. Implement tenant auto-provisioning on first login
5. Implement user resolution and the tenant context helper

### Phase 2: Core CRUD
6. Implement Account mutations & queries + MCP tools
7. Implement Contact mutations & queries + MCP tools
8. Implement Opportunity mutations & queries + MCP tools
9. Implement Task mutations & queries + MCP tools
10. Implement Reminder mutations & queries + MCP tools
11. Implement audit logging helper + integrate with all mutations

### Phase 3: MCP Server
12. Implement the MCP protocol handler (Convex HTTP action)
13. Implement auth middleware for MCP requests
14. Wire all tools into the MCP server
15. Implement cursor-based pagination across all list tools

### Phase 4: Search & Analytics
16. Configure Convex search indexes
17. Implement `search_crm` tool
18. Implement `get_pipeline_summary` tool
19. Implement `get_activity_feed` tool
20. Implement `get_overdue_items` tool

### Phase 5: Admin
21. Implement `invite_user`, `list_users`, `deactivate_user`, `reactivate_user`
22. Implement `get_tenant`, `update_tenant`

### Phase 6: Testing & Hardening
23. Write integration tests for all MCP tools
24. Test multi-tenant isolation
25. Test cascade delete + restore behavior
26. Test edge cases (deleted entities, invalid references, pagination boundaries)
