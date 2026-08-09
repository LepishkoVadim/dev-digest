# `@devdigest/mcp-server`

A local **stdio** MCP server that exposes DevDigest's review agents to a local
MCP client (Claude Code / Claude Desktop). It is a thin HTTP wrapper over the
running Fastify API on `:3001` — it imports no server internals, touches no DB,
and adds no auth (the API has none today; workspace/user are resolved
server-side).

## Requirements

- The **DevDigest API must be running** (`./scripts/dev.sh`, or `cd server && pnpm dev`) on `:3001`.
- Node ≥ 22.

## Tools (5, namespaced `devdigest_*`)

Registered in a fixed order for a stable `tools/list`:

| Tool | Args | Returns |
|---|---|---|
| `devdigest_list_agents` | none | `{ agents: [{ id, name, enabled, model }] }` |
| `devdigest_run_agent_on_pr` | `repo`, `pr`, `agent` | `{status:'done', verdict, score, findings[]}` or `{status:'running', run_id}` on timeout |
| `devdigest_get_findings` | `repo`, `pr`, `run_id?`, `response_format?`, `offset?`, `limit?` | paginated findings (concise default; detailed adds rationale/suggestion) |
| `devdigest_get_conventions` | `repo` | `{ conventions: [{ rule, evidence_snippet }] }` (accepted only) |
| `devdigest_get_blast_radius` | `repo`, `files[]` | **stub**: `{status:'not_implemented'}` — not wired up yet |

`repo` accepts a bare name or `owner/name`; `agent` accepts a name or id. Ids are
resolved by listing (`GET /repos`, `GET /repos/:id/pulls`, `GET /agents`) and
matching — there is no lookup-by-name endpoint.

## Blocking + timeout

`devdigest_run_agent_on_pr` fires the review then polls
`GET /pulls/:id/runs` every ~2s up to a ~120s budget. Large PRs commonly exceed
the budget — that is the **expected** path: the tool returns
`{status:'running', run_id}` and you call `devdigest_get_findings` (with `repo`,
`pr`, and the `run_id`) later. Because the tool can block ~120s, the MCP client
must raise its per-tool timeout — `.mcp.json` sets `MCP_TOOL_TIMEOUT=120000`.

## Environment

| Var | Default | Purpose |
|---|---|---|
| `DEVDIGEST_API_URL` | `http://localhost:3001` | Base URL of the Fastify API |
| `DEVDIGEST_POLL_INTERVAL_MS` | `2000` | Poll interval while waiting for a run |
| `DEVDIGEST_POLL_BUDGET_MS` | `120000` | Max time to block before returning `run_id` |
| `MCP_TOOL_TIMEOUT` | — | Client-side per-tool timeout; set in `.mcp.json` ≥ budget |

No secrets are read, sent, or logged. **All logging goes to stderr** (stdout is
the JSON-RPC channel).

## Run / verify

```bash
# install (npm lockfile, like reviewer-core/e2e)
cd mcp-server && npm install

# typecheck + lint + unit tests
npm run typecheck && npm run lint && npm run test

# smoke via MCP Inspector (with the API running)
npx @modelcontextprotocol/inspector npx tsx src/index.ts
```

In Claude Code, the root `.mcp.json` registers this server as `devdigest`;
confirm the 5 tools appear via `/mcp`.
