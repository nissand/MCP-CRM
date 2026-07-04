# Convex backend

Everything in this directory is deployed to Convex with `npx convex dev` (development, watch mode) or `npx convex deploy` (production).

| Path | Purpose |
|---|---|
| `schema.ts` | Database schema: tenants, users, accounts, contacts, opportunities, tasks, reminders, audit logs, and OAuth/session tables |
| `auth.ts` | Convex Auth configuration (Google provider) and the tenant-bootstrap logic that runs on first sign-in |
| `auth.config.ts` | JWT provider config consumed by Convex |
| `http.ts` | All HTTP routes: the `/mcp` endpoint, OAuth 2.1 discovery/authorize/token endpoints, the legacy `/sse` transport, and `/health` |
| `functions/` | CRM business logic, one module per entity. All functions are internal-only (callable solely from `http.ts`), authenticate via `getAuthContext`, and scope all data access to the caller's tenant |
| `lib/` | Shared helpers: JWT signature verification (`jwt.ts`), auth context resolution (`utils.ts`, `tokenAuth.ts`), typed errors (`errors.ts`), Zod validators (`validators.ts`) |
| `mcp/server.ts` | JSON-RPC dispatcher and the `TOOL_HANDLERS` registry mapping tool names to Convex functions |
| `mcp/tools/` | MCP tool definitions (names, LLM-facing descriptions, JSON input schemas), grouped by domain |
| `mcp/authCodes.ts`, `mcp/pkce.ts`, `mcp/sessions.ts` | Storage for the OAuth authorization-code flow and SSE sessions |
| `_generated/` | Convex codegen output — created by `npx convex dev`, gitignored |

See the [root README](../README.md) for setup and [CONTRIBUTING.md](../CONTRIBUTING.md) for how to add a new tool.
