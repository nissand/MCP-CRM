# Contributing to MCP-CRM

Thanks for helping out! This document covers the local dev setup, project conventions, and the most common change: adding or modifying an MCP tool.

## Dev setup

Follow the [Installation section of the README](README.md#installation) first — you need your own Convex deployment and Google OAuth client to run the project. Then:

```bash
npm install
npx convex dev          # deploys backend, watches for changes, regenerates convex/_generated/
npm run lint            # typecheck; run before pushing
```

The auth app runs separately:

```bash
cd auth-app
cp .env.example .env.local   # fill in your deployment URLs
npm install
npm run dev
```

`convex/_generated/` is produced by `npx convex dev` (or `npx convex codegen`) and is gitignored — don't commit it, and expect type errors until you've run codegen at least once.

## How the pieces fit together

An MCP tool call flows through three layers:

1. **`convex/http.ts`** receives the HTTP request on `/mcp`, extracts the Bearer token, and hands the JSON-RPC body to the dispatcher.
2. **`convex/mcp/server.ts`** routes `tools/call` to a Convex function using the `TOOL_HANDLERS` registry; tool *definitions* (what clients see in `tools/list`) live in `convex/mcp/tools/`.
3. **`convex/functions/*.ts`** implement the business logic. Every handler starts with `getAuthContext(ctx, args._token)` which resolves the user + tenant, and all reads/writes are scoped to `auth.tenantId`.

## Adding a new MCP tool

Three steps, all typechecked:

1. **Implement the Convex function** in the right module under `convex/functions/`. Follow the existing patterns:
   - Accept `_token: v.optional(v.string())` and call `getAuthContext(ctx, args._token)` first.
   - Verify tenant ownership of any entity you touch with `verifyTenantAccess`.
   - Log writes with `logAudit` / `withAudit`.
   - Use the error helpers from `convex/lib/errors.ts` (`notFound`, `validationError`, …) — they serialize cleanly into MCP error responses.
2. **Add the tool definition** (name, description, JSON input schema) to the matching file in `convex/mcp/tools/`. Write descriptions for an LLM audience: say what the tool does, when to use it, and what it returns.
3. **Register the handler** in `TOOL_HANDLERS` in `convex/mcp/server.ts`, mapping the tool name to your function with the correct `kind` (`query` or `mutation`).

Test it end-to-end with curl (see "Calling a tool manually" in the README) or through a connected Claude session.

## Conventions

- TypeScript strict mode; no new `any` unless you're at the untyped JSON boundary (tool args) — and say so in a comment.
- Tool names are `snake_case` verbs: `create_account`, `get_pipeline_summary`.
- All timestamps are Unix milliseconds (`Date.now()`).
- Deletes are soft (`deletedAt`) and paired with a `restore_*` tool.
- Never hardcode deployment URLs — read them from environment variables (`CONVEX_SITE_URL`, `SITE_URL`, `VITE_*`).

## Pull requests

- Branch from `main`, keep PRs focused on one change.
- Run `npm run lint` before pushing.
- Describe how you verified the change (curl transcript, Claude session, etc.) — there is no automated test suite yet, so reviewers rely on this.
