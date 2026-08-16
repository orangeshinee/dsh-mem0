# dsh-mem0

[中文](README.md) | English

A hot-pluggable [dsh](https://github.com/deepseek-ai/deepseek-harness) (DeepSeek
Harness) plugin for reading and writing memories on a
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
# Option 1: straight from GitHub (no publish step, recommended for users)
dsh plugin --profile web add github:orangeshinee/dsh-mem0

# Option 1 (pinned version): v* tag on GitHub Releases, built by CI
dsh plugin --profile web add github:orangeshinee/dsh-mem0#v0.1.0

# Option 2: from npm after publishing (maintainer runs npm publish once)
npm publish   # maintainer
dsh plugin --profile web add dsh-mem0

# Option 3: local development (link style)
dsh plugin --profile web add link:$(pwd)

# Restart dsh web after installing
```

The runtime dependencies (`@deepseek-ai/dsh-settings`, `@deepseek-ai/dsh-tools`,
`schemastery`) are hard dependencies, so `dsh plugin add` installs them with the
package (profiles default to `autoInstallPeers:false`, so peerDependencies would
not be installed).

## Release

Pushing a `v*` tag triggers CI (`.github/workflows/release.yml`) to build and
publish a GitHub Release automatically: `pnpm build` → four offline smoke tests
→ the `npm pack` artifact (`dsh-mem0-<version>.tgz`) is attached to the
Release, with auto-generated changelog.

```sh
git tag v0.1.0 && git push origin v0.1.0
```

The tag version must equal the `version` in `package.json` (CI fails
otherwise). If the repository has an `NPM_TOKEN` secret set, the same run also
publishes to npm (`npm publish`); without it that step is skipped and the
GitHub Release still happens.

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

> The configuration card is served by the browser half (`client/client.cjs`)
> and reads/writes the settings through the plugin-owned
> `/api/dsh-mem0/config` route (`src/settings-routes.ts`) — the harness's
> settings wire only exposes namespaces on its own allowlist, which a plugin
> cannot extend. `apiKey` is marked `role('secret')` in the schema: the route
> only sends a "configured / not configured" flag, the key literal never
> reaches the browser. After changing host-side code (`src/`) you must
> `pnpm build` and restart dsh web; a change to `client/client.cjs` alone only
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

## License

[MIT](LICENSE)
