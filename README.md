# MCP-CRM

A headless, multi-tenant CRM designed to be used **entirely through AI agents**. There is no dashboard — all functionality (accounts, contacts, opportunities, tasks, reminders, search, analytics, user administration) is exposed as 40 [Model Context Protocol (MCP)](https://modelcontextprotocol.io) tools that clients like Claude, Claude Desktop, Claude Code, and custom agents can call.

The entire backend runs on [Convex](https://convex.dev): the database, the business logic, and the MCP server itself (as Convex HTTP actions). A tiny React app handles Google sign-in and token issuance — that's the only UI in the project.

## Architecture

```
┌─────────────────┐   MCP over HTTP (JSON-RPC)   ┌──────────────────────────────┐
│  MCP client     │ ───────────────────────────► │  Convex deployment           │
│  (Claude, etc.) │   Bearer token / OAuth 2.1   │                              │
└─────────────────┘                              │  convex/http.ts   HTTP routes│
        │                                        │  convex/mcp/      MCP server │
        │ OAuth authorize redirect               │  convex/functions CRM logic  │
        ▼                                        │  convex/schema.ts database   │
┌─────────────────┐   Google OAuth (Convex Auth) │                              │
│  auth-app       │ ───────────────────────────► │                              │
│  (React/Vite)   │   issues JWT access tokens   │                              │
└─────────────────┘                              └──────────────────────────────┘
```

- **Multi-tenant**: the first sign-in creates a tenant and makes that user its admin. Admins can invite additional users. All data is isolated per tenant.
- **Two ways to authenticate MCP calls**:
  1. **OAuth 2.1** — clients that support MCP authorization (claude.ai connectors, Claude Desktop) discover the endpoints via `/.well-known/oauth-authorization-server`, get redirected to the auth app for Google sign-in, and receive a token automatically.
  2. **Static Bearer token** — sign in to the auth app in a browser, copy your token, and configure it as an `Authorization: Bearer` header (or `?token=` query parameter).
- **Audited**: every create/update/delete/restore is written to an audit log, queryable through the `get_activity_feed` tool.
- **Soft deletes**: deletes mark records with `deletedAt`; every entity has a matching `restore_*` tool.

## Repository layout

```
convex/                  Convex backend (deployed with `npx convex dev/deploy`)
├── schema.ts            Database schema (tenants, users, accounts, contacts, …)
├── auth.ts              Convex Auth setup (Google provider, tenant bootstrap)
├── http.ts              HTTP routes: /mcp endpoint, OAuth 2.1 endpoints, SSE
├── functions/           CRM business logic (one module per entity)
├── lib/                 Shared helpers (auth context, errors, validation, audit)
└── mcp/                 MCP protocol layer
    ├── server.ts        JSON-RPC dispatcher + tool → Convex function registry
    ├── tools/           MCP tool definitions (name, description, input schema)
    ├── authCodes.ts     OAuth authorization codes
    ├── pkce.ts          PKCE challenge storage
    └── sessions.ts      Sessions for the legacy HTTP+SSE transport

auth-app/                React app for Google sign-in and token issuance
mcp-proxy/               Optional stdio↔HTTP bridge for stdio-only MCP clients
docs/PRD.md              Original product requirements document
```

## Installation

### Prerequisites

- **Node.js 18+** and npm
- A free [Convex account](https://dashboard.convex.dev)
- A **Google Cloud OAuth client** (for user sign-in) — created below
- Somewhere to host the auth app (Vercel, Netlify, …) or run it locally

### 1. Clone and install

```bash
git clone <this-repo>
cd MCP-CRM
npm install
cd auth-app && npm install && cd ..
```

### 2. Create the Convex deployment

```bash
npx convex dev
```

Follow the prompts to log in and create a project. This deploys the schema and functions, and writes `.env.local` with your `CONVEX_DEPLOYMENT` and `CONVEX_URL`. Keep it running during development — it live-reloads on changes.

Your deployment gets two URLs. You'll need both:

- **Client URL**: `https://<deployment>.convex.cloud` (WebSocket API, used by the auth app)
- **Site URL**: `https://<deployment>.convex.site` (HTTP actions — this is where the MCP server lives)

### 3. Set up Google OAuth

1. In the [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create an **OAuth client ID** of type *Web application*.
2. Add this **authorized redirect URI** (note: `.convex.site`, not `.convex.cloud`):
   ```
   https://<deployment>.convex.site/api/auth/callback/google
   ```
3. Configure Convex Auth keys and environment variables:
   ```bash
   npx @convex-dev/auth            # generates JWT_PRIVATE_KEY and JWKS
   npx convex env set AUTH_GOOGLE_ID <your-google-client-id>
   npx convex env set AUTH_GOOGLE_SECRET <your-google-client-secret>
   ```

### 4. Run / deploy the auth app

```bash
cd auth-app
cp .env.example .env.local   # then fill in your deployment URLs
npm run dev                  # local development, http://localhost:5173
```

For production, deploy `auth-app/` to any static host (e.g. Vercel with `npm run build`, output `dist/`) and set the same two environment variables there.

### 5. Point the backend at the auth app

The MCP server redirects unauthenticated users to the auth app, so the backend needs its URL:

```bash
npx convex env set SITE_URL https://your-auth-app.example.com
```

(`SITE_URL` is also used by Convex Auth for post-sign-in redirects. If you ever host the auth app somewhere different from `SITE_URL`, set `AUTH_APP_URL` as an override.)

### 6. Verify

```bash
curl https://<deployment>.convex.site/health
# {"status":"ok","service":"mcp-crm",...}

curl -X POST https://<deployment>.convex.site/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
# should return all 40 tool definitions
```

## Connecting via MCP

The MCP endpoint is:

```
https://<deployment>.convex.site/mcp
```

### Option A — claude.ai / Claude Desktop connector (OAuth, recommended)

1. In Claude, go to **Settings → Connectors → Add custom connector**.
2. Enter the MCP endpoint URL above.
3. Claude discovers the OAuth endpoints automatically and opens the auth app; sign in with Google.
4. Done — Claude receives a token and can call all CRM tools.

The first Google account to sign in becomes the **admin of a new tenant**. Invite teammates with the `invite_user` tool; they join your tenant when they sign in with the invited email.

### Option B — Claude Code (Bearer token)

Get a token by opening the auth app in your browser and signing in — it displays your token with copy-paste-ready config. Then:

```bash
claude mcp add --transport http mcp-crm \
  https://<deployment>.convex.site/mcp \
  --header "Authorization: Bearer <your-token>"
```

Or add it to `.mcp.json` in your project:

```json
{
  "mcpServers": {
    "mcp-crm": {
      "type": "http",
      "url": "https://<deployment>.convex.site/mcp",
      "headers": {
        "Authorization": "Bearer <your-token>"
      }
    }
  }
}
```

> **Note:** tokens issued by Convex Auth expire after ~1 hour. For long-lived setups prefer the OAuth connector (Option A), which refreshes automatically.

### Option C — clients that can't send headers

Append the token as a query parameter:

```
https://<deployment>.convex.site/mcp?token=<your-token>
```

When a connector UI asks about authentication, choose "No authentication required" — the token is already in the URL. Be aware the token may end up in server/proxy logs; prefer header auth when available.

### Option D — stdio-only clients

`mcp-proxy/index.js` bridges stdio to the HTTP endpoint (no dependencies, plain Node):

```json
{
  "mcpServers": {
    "mcp-crm": {
      "command": "node",
      "args": ["/absolute/path/to/MCP-CRM/mcp-proxy/index.js"],
      "env": {
        "MCP_CRM_URL": "https://<deployment>.convex.site/mcp",
        "MCP_CRM_TOKEN": "<your-token>"
      }
    }
  }
}
```

### Calling a tool manually

```bash
curl -X POST https://<deployment>.convex.site/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-token>" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "create_account",
      "arguments": { "name": "Acme Corp", "industry": "Manufacturing" }
    }
  }'
```

## Tool reference

| Category | Tools |
|---|---|
| Accounts | `create_account`, `get_account`, `list_accounts`, `update_account`, `delete_account`, `restore_account` |
| Contacts | `create_contact`, `get_contact`, `list_contacts`, `update_contact`, `delete_contact`, `restore_contact` |
| Opportunities | `create_opportunity`, `get_opportunity`, `list_opportunities`, `update_opportunity`, `delete_opportunity`, `restore_opportunity` |
| Tasks | `create_task`, `get_task`, `list_tasks`, `update_task`, `delete_task`, `restore_task` |
| Reminders | `create_reminder`, `get_reminder`, `list_reminders`, `update_reminder`, `delete_reminder`, `restore_reminder` |
| Search & analytics | `search_crm`, `get_pipeline_summary`, `get_activity_feed`, `get_overdue_items` |
| Admin | `get_tenant`, `update_tenant`, `invite_user`, `list_users`, `deactivate_user`, `reactivate_user` |

Full input schemas live in [`convex/mcp/tools/`](convex/mcp/tools/) and are returned by the `tools/list` MCP method.

## Development

```bash
npx convex dev        # deploy + watch backend (also regenerates convex/_generated/)
npm run lint          # TypeScript typecheck (backend)
cd auth-app && npm run dev   # auth app with hot reload
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for conventions and a walkthrough of adding a new MCP tool.

## Security notes & known limitations

- **Tenant isolation** is enforced in every function via `getAuthContext` + `verifyTenantAccess`; cross-tenant lookups return "not found".
- **JWT validation**: access tokens are validated for expiration, issuer, and audience, but **cryptographic signature verification is not yet implemented** in the token path used by MCP calls (`convex/lib/tokenAuth.ts`). Treat deployments as unsuitable for sensitive production data until this is addressed.
- **PKCE**: challenges are stored during the OAuth flow but verification is currently disabled in the token exchange (`convex/mcp/authCodes.ts`).
- **Token lifetime**: tokens expire after ~1 hour; the refresh-token grant currently echoes the same token rather than minting a new one.

Contributions addressing any of these are very welcome — see the issues tracker.
