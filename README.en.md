# dsh-mem0

[中文](README.md) | English

A hot-pluggable dsh plugin for reading and writing memories on a
[self-hosted mem0](https://github.com/mem0ai/mem0) instance: the host Agent
talks to your own mem0 REST server directly through the `mem0_*` tools (new
OSS build, `mem0/mem0-api-server`, dashboard included, `X-API-Key` auth,
endpoints have no `/v1` prefix).

Mounted via `dsh plugin add link:<this-directory>` — no dsh source changes.
No sidebar UI, but it does ship a browser half: a `dsh-mem0` configuration
card in Settings → Plugins → Plugin configuration that edits the settings
below.

## Tools

| Tool | Endpoint | Description |
|---|---|---|
| `mem0_add` | `POST /memories` | Store memories (a string or a message array; attributed by `defaultUserId` / `defaultAgentId`) |
| `mem0_search` | `POST /search` | Semantic search with relevance scores |
| `mem0_get` | `GET /memories` / `GET /memories/{id}` | List (filtered by identifiers) or fetch one |
| `mem0_update` | `PUT /memories/{id}` | Update a memory's text / metadata / expiration |
| `mem0_delete` | `DELETE /memories/{id}` / `DELETE /memories` | Delete one; bulk delete needs `confirm: "DELETE ALL"` + admin |
| `mem0_history` | `GET /memories/{id}/history` | Edit history of one memory |
| `mem0_reset` | `POST /reset` | Wipe everything (needs `confirm: "RESET"` + admin) |
| `mem0_status` | `GET /auth/setup-status` + `GET /configure` | Health / auth / configuration check (never prints the apiKey) |

## Install

```sh
# Build inside the dsh-mem0 directory
pnpm install && pnpm build

# Mount into the web profile (link style, local development)
dsh plugin --profile web add link:$(pwd)

# Restart dsh web to take effect
```

## Configuration

Settings → Plugins → Plugin configuration → `dsh-mem0` (or the config
section of the plugin row in the composition):

| Key | Default | Description |
|---|---|---|
| `baseUrl` | `http://127.0.0.1:8888` | Self-hosted mem0 address (no trailing slash, no `/v1`) |
| `apiKey` | empty | `m0sk_...` from the dashboard's API Keys, the legacy `ADMIN_API_KEY`, or a JWT |
| `authType` | `apiKey` | `apiKey` / `adminKey` / `jwt` / `none` |
| `defaultUserId` | `HeTony` | Owner used when a tool call does not specify `user_id` |
| `defaultAgentId` | `dsh-agent` | Agent used when a tool call does not specify `agent_id` |
| `timeoutMs` | `15000` | Per-request timeout |
| `announceToAgent` | `true` | Announce the plugin to agents in the system prompt |
| `enabled` | `true` | Master switch |

Settings are persisted by the dsh settings provider; changes to `baseUrl` /
`apiKey` / the default identifiers apply immediately, no restart needed.

> The configuration card is served by the browser half (`client/client.js`)
> and reads/writes the settings through the plugin-owned
> `/api/dsh-mem0/config` route (`src/settings-routes.ts`) — the harness's
> settings wire only exposes namespaces on its own allowlist, which a plugin
> cannot extend. `apiKey` is marked `role('secret')` in the schema: the route
> only sends a "configured / not configured" flag, the key literal never
> reaches the browser. After changing host-side code (`src/`) you must
> `pnpm build` and restart dsh web; a change to `client/client.js` alone only
> needs a page refresh.

## Development

```sh
pnpm typecheck   # tsc --noEmit
pnpm build       # outputs lib/ (ESM, sources in src/)
```

The build output is multi-file ESM (`tsc`); runtime dependencies
(`@deepseek-ai/dsh-*`) resolve from the host profile's `node_modules`.

For agent-oriented development notes (code map, platform traps, security red
lines), see [AGENTS.md](AGENTS.md).
