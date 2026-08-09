# Plan: `mcp-server` — local stdio MCP server for DevDigest review agents

## 1. Scope / Non-goals
Add a new standalone package `mcp-server/` (sibling to `client/`, `server/`, `reviewer-core/`, `e2e/`) exposing 5 MCP tools over **stdio** to a local MCP client (Claude Code / Desktop). Tools are namespaced `devdigest_*`: `devdigest_list_agents`, `devdigest_run_agent_on_pr`, `devdigest_get_findings`, `devdigest_get_conventions` (all real, backed by HTTP calls to the running Fastify API on `:3001`), and `devdigest_get_blast_radius` (schema-correct stub, no wiring to `RepoIntelService`).

Non-goals: no change to `server/`, `reviewer-core/`, `client/`, or `repo-intel`; no real blast-radius logic; no new HTTP route on the API; no auth system added (none exists today — see §4); no workspace multi-tenancy; **no dynamic tool loading / tool-search / code-execution optimizations** — those pay off at 30–50+ tools (~55k startup tokens); with 5 small tools static registration is correct and cheaper to build.

## 2. MCP best practices this plan bakes in (researched — see Sources)
The original driver was "don't bloat every new chat's context." Startup cost = the `tools/list` payload (5 tool definitions), so the levers are **fewer, tighter definitions** and **compact responses**. Concrete rules applied throughout:

- **B1 — Description budget 1–3 sentences, ~200–400 chars each.** Cover: what it does · required inputs · what it returns · when to pick it over a sibling tool. Verbose multi-paragraph descriptions are the single biggest token waste in a tool list.
- **B2 — Flat input schemas.** No nested objects — every arg is a top-level scalar/enum. Deeper nesting = more tokens + higher LLM parse-failure rate. Split rather than nest.
- **B3 — Skip `outputSchema` deliberately.** It's optional and would add to the *startup* `tools/list` payload for all 5 tools. We still return `structuredContent` (any JSON is allowed without a declared schema), so the model gets machine-readable data at call time without paying the schema cost at every chat start. Upgrade path: add `outputSchema` per-tool only if a consuming client starts validating. (This is the sharpest token lever and the reason it's called out.)
- **B4 — Dual-content results (spec requirement).** Every success returns BOTH `structuredContent` (the object) AND a `content: [{type:'text', text: JSON.stringify(...)}]` block — the spec requires the serialized-JSON text block for backwards-compat with clients that don't read structuredContent. This lives once in `format.ts::toolOk`, not per tool.
- **B5 — Set all four annotations on every tool**: `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`. Missing annotations are a top reason clients mis-handle/reject tools.
- **B6 — No-arg tools use `{ type:'object', additionalProperties:false }`** (spec "recommended" for zero params) — `devdigest_list_agents`.
- **B7 — Deterministic tool registration order.** Register the 5 tools in a fixed order; a stable `tools/list` lets the client cache it and improves the model's prompt-cache hit rate.
- **B8 — Two-tier errors (spec).** Protocol errors (unknown tool / malformed args) are JSON-RPC errors the SDK raises for us. Everything expected — API down, not-found, business failure — is a tool result with `isError:true` and actionable recovery text the model can self-correct on. An **empty result is a success, not an error**.
- **B9 — Compact responses / no raw payloads.** Return only the fields the agent needs (concise default); never echo a raw `ReviewRecord`/`RunTrace`. Large finding sets paginate summary-first. (For a local tool, pagination is enough; the spec's "return a resource URI for huge payloads" is noted as the upgrade path, not built.)
- **B10 — Explicit state handle (spec "stateful tools").** MCP has no session, so `run_agent_on_pr`'s timeout returns an explicit `run_id`; `get_findings` accepts it back. The tool description states what `run_id` is and that the caller carries it forward.

## 3. File layout
```
mcp-server/
  src/
    index.ts        composition root: build McpServer, register 5 tools in fixed order (B7), connect StdioServerTransport
    config.ts       reads env (DEVDIGEST_API_URL, poll interval/budget) with safe defaults; no secrets
    log.ts          stderr-only logger — one line: `export const log = console.error`. Never stdout (see §4).
    format.ts       toolOk(obj) / toolError(msg, {recovery}) — enforce B4 (dual content) + B8 (isError) in one place
    http/
      client.ts     the ONLY place that calls fetch; one fn per REST call; wraps failures in typed errors
      resolve.ts    id-resolution helpers (repo name → repoId, (repo, pr#) → pull id), built on client.ts
    tools/
      list-agents.ts  run-agent-on-pr.ts  get-findings.ts  get-conventions.ts  get-blast-radius.ts
```
Each tool file exports a registration function `(server, client) => void`.

## 4. Constraints in force
- **stdout is the JSON-RPC channel.** Any write to stdout corrupts the protocol. ALL logging → **stderr** (`console.error` only). Verification gate: `grep -rn "console.log" mcp-server/src` must return nothing.
- **Blocking tool vs. client timeout.** `devdigest_run_agent_on_pr` blocks while polling (~2s interval, ≤120s budget), which exceeds the client's *default* per-tool timeout, so `.mcp.json` MUST set `MCP_TOOL_TIMEOUT` ≥ the budget (env, never hardcoded).
- **Review runs are fire-and-forget.** `POST /pulls/:id/review` returns 202 + run ids, no findings — poll `GET /pulls/:id/runs` (or `/runs/active`, both exist: `reviews/routes.ts:98,104`) to a terminal status, then read `GET /pulls/:id/reviews`.
- **Auth**: none today. `LocalNoAuthProvider` always resolves the same seeded user/workspace; routes take no `workspaceId`. The MCP server passes no auth and no workspace. (`server/INSIGHTS.md`, 2026-08-09.)
- **SDK + zod (risk closed):** `@modelcontextprotocol/sdk` v1.x `registerTool` accepts a **zod v3 raw shape**; SDK 1.17.x is known-incompatible with zod v4. So `zod@^3.24.1` (the repo's existing pin) is the *correct* choice, not a compromise.
- **Architecture**: HTTP-wrap (not importing server internals) keeps the Onion boundary in `server/` intact; no server file is touched, so `pnpm arch:check` is unaffected.
- **Security (spec MUSTs)**: validate all tool inputs (zod), never log secrets, rate-limit — we ride the API's existing 10 req/min per-route limit and the ≤120s poll budget stays under it.

## 5. Skills the implementer MUST invoke
| scope | skill | why |
|---|---|---|
| `mcp-server/**/*.ts` | `typescript-expert` | strict tsconfig, ESM, zod-inferred types; `structuredContent` needs an index-signature-compatible type |
| `mcp-server/src/tools/*.ts` | `zod` | per-field `.describe()`, flat raw shapes (B2), zod v3 |
| `mcp-server/src/http/client.ts` | `security` | validate before forwarding, fail-closed, no secret logging (B / §4 MUSTs) |
| session end | `engineering-insights` | write findings to a new `mcp-server/INSIGHTS.md` |

(Fastify/Drizzle/Onion/React/Next skills don't apply — no server, no DB, no UI.)

## 6. The 5 tools
Each: verb+object snake_case name, `description` per B1, flat args per B2, per-field `.describe()`, all four annotations (B5), result via `format.ts` (B4/B8).

| tool | args (flat) | returns (concise, structuredContent) | annotations |
|---|---|---|---|
| `devdigest_list_agents` | none → `{type:object, additionalProperties:false}` (B6) | `{ agents: [{ id, name, enabled, model }] }` | readOnly ✓ · destructive ✗ · idempotent ✓ · openWorld ✓ |
| `devdigest_run_agent_on_pr` | `repo, pr, agent` | completed `{ verdict, score, findings:[{severity,title,file,line,rationale}] }`; timeout `{ status:"running", run_id, message }` (B10) | readOnly ✗ · destructive ✗ · idempotent ✗ · openWorld ✓ |
| `devdigest_get_findings` | `run_id?`, `repo?`, `pr?`, `response_format:"concise"\|"detailed"` (default concise), `offset?`, `limit?` | concise: verdict/score + summary-first paginated findings (`severity,title,file:line`); detailed adds `rationale`/`suggestion` (B9) | readOnly ✓ · destructive ✗ · idempotent ✓ · openWorld ✓ |
| `devdigest_get_conventions` | `repo` | `{ conventions:[{rule, evidence_snippet}] }` (accepted-only default) | readOnly ✓ · destructive ✗ · idempotent ✓ · openWorld ✓ |
| `devdigest_get_blast_radius` | `repo, files[]` | **stub, always**: `{ status:"not_implemented", message:"…" }`, no HTTP call; description tells the agent not to rely on it | readOnly ✓ · destructive ✗ · idempotent ✓ · openWorld ✓ |

- `run_agent_on_pr`: resolve ids → `POST /pulls/:id/review` → poll every ~2s to ≤120s until every run is terminal (`done`/`failed`/`cancelled`) → read findings. Timeout → `{status:"running", run_id}` + "call `devdigest_get_findings` with this run_id later" (B10). Large PRs commonly exceed 120s, so the timeout path is expected, not an edge case.
- `get_blast_radius`: leave a one-line comment pointing at `RepoIntelService.getBlastRadius` (`server/src/modules/repo-intel/service.ts:212`) — the real work later is "add a route", not "build it" (`server/INSIGHTS.md`, 2026-08-09).

### 6.1 Final tool `description` strings — COPY VERBATIM (do not paraphrase)
Each is written to B1 (1–3 sentences, ~200–400 chars: what · inputs · returns · when to pick over a sibling), with B8 recovery hints and the B10 `run_id` handle stated inline. Use these exact strings in `registerTool({ description })`; do not shorten, expand, or reword during implementation.

- **`devdigest_list_agents`**
  > `Lists the review agents configured in DevDigest (id, name, model, enabled). Takes no arguments. Call this first to discover which agent to pass to devdigest_run_agent_on_pr — names are resolved to ids there. Read-only; does not run any review.`

- **`devdigest_run_agent_on_pr`**
  > `Runs a review agent on a pull request and blocks up to ~120s for it to finish. Args: repo (name or owner/name), pr (number), agent (name or id from devdigest_list_agents). Returns verdict, score and findings when done, or {status:'running', run_id} on timeout — pass run_id to devdigest_get_findings later. Starts a new run each call; to read an existing review, use devdigest_get_findings.`

- **`devdigest_get_findings`**
  > `Fetches findings for an already-completed review, without starting a new run. Identify it by run_id (from devdigest_run_agent_on_pr) or by repo + pr. response_format 'concise' (default) returns verdict, score and paginated findings (severity, title, file:line); 'detailed' adds rationale and suggestion. Use offset/limit to page large sets. Read-only.`

- **`devdigest_get_conventions`**
  > `Returns the coding conventions DevDigest has extracted for a repository (each with the rule and an evidence snippet). Arg: repo (name or owner/name). Returns accepted conventions by default. Read-only; does not extract or modify anything.`

- **`devdigest_get_blast_radius`**
  > `NOT IMPLEMENTED YET — do not rely on this tool. Intended to return the blast radius (impacted files/symbols) for a set of changed files, but currently always returns {status:'not_implemented'} without calling the API. Args repo and files[] are accepted for forward compatibility only.`

## 7. id-resolution strategy (the one real design point)
No lookup-by-name/number endpoint exists (verified: `repos/routes.ts` = `GET /repos` + `/repos/:id`; `pulls/routes.ts` = `GET /repos/:id/pulls` + `/pulls/:id`). List-then-match in `resolve.ts`:
- **repo → repoId**: `GET /repos` → match `repo` case-insensitively, in order: `full_name`, then `name`, then `${owner}/${name}`. Exactly one → its `id`. Zero → `isError` listing available `full_name`s. Multiple (ambiguous bare name) → `isError` asking for `owner/name`.
- **(repo, pr#) → pull id**: with `repoId`, `GET /repos/:id/pulls` → match `number === pr`. Found → `id`. Not found → `isError` listing a few open PR numbers.
- Cost: two list calls per invocation — fine for a local tool (small lists); flagged, not solved.

## 8. Steps
1. **Scaffold** — `package.json` (`@devdigest/mcp-server`, ESM, node ≥22, `tsx` dev), `tsconfig.json` ← `server/`, `eslint.config.mjs` ← `reviewer-core/`. Deps: `@modelcontextprotocol/sdk` (v1.x), `zod@^3.24.1`.
2. **config.ts** — `DEVDIGEST_API_URL` (default `http://localhost:3001`), poll interval/budget; safe defaults; no secrets; no workspace-id.
3. **log.ts + format.ts** — stderr logger (§4); `toolOk`/`toolError` shapers implementing B4 + B8 once.
4. **http/client.ts** — one fn per REST call (`listAgents`, `runReview`, `listRunsForPull`, `reviewsForPull`, `listRepos`, `listPulls`, `listConventions`); every failure → typed `ApiError`/`ApiUnreachableError`, never an unhandled rejection. Only `fetch` site.
5. **http/resolve.ts** — §7.
6. **tools/** — the 5 tools per §6, applying B1–B10.
7. **index.ts + `.mcp.json`** — build `McpServer`, register the 5 tools in fixed order (B7), connect `StdioServerTransport`. Root `.mcp.json`: `command: npx tsx mcp-server/src/index.ts`, `MCP_TOOL_TIMEOUT` ≥120s, `DEVDIGEST_API_URL` from env.
8. **Docs** — `mcp-server/README.md` (setup, 5 tools, env, requires API running, verification via MCP Inspector + `/mcp` in Claude Code) + a row in root `CLAUDE.md`/`README.md` module tables.

## 9. Contract / DB impact
None — no shared Zod schema touched, no migration. Any locally-duplicated input shape is a local tool-input copy, NOT a `@devdigest/shared` mirror; do not wire into `sync-shared.sh`.

## 10. Verification commands
- `pnpm install` / `pnpm typecheck` inside `mcp-server/`
- **`grep -rn "console.log" mcp-server/src`** → must be empty (stdout-safety gate)
- Manual smoke: `./scripts/dev.sh` up, drive with MCP Inspector, confirm 5 tools via `/mcp` in Claude Code
- `cd server && pnpm arch:check` — confirms no drift (this plan touches nothing in `server/`)

## 11. Open questions (yours to decide)
1. **Unit tests** — default: out of scope (typecheck + grep + Inspector). Recommend ONE small test file for the two pure functions with real branching — `resolve.ts` (match/ambiguity) and `format.ts` (dual-content shape). Your call.
2. `MCP_TOOL_TIMEOUT` / 120s budget — timeout → `{status:"running"}` → check later is the *expected* path for large PRs. OK?
3. Skip auth entirely (matches reality) vs. add a forward-compatible token now?
4. npm or pnpm lockfile for this package (defaults to npm, matching reviewer-core/e2e)?

*(Former open question about zod/SDK compatibility is resolved — see §4: zod v3 raw shape, SDK v1.x.)*

## Sources
- [MCP spec — Tools (2026-07-28)](https://modelcontextprotocol.io/specification/2025-11-25/server/tools) — annotations, dual content, output schema, two-tier errors, stateful handles, deterministic ordering, no-arg schema
- [MCP Tool Schema Design Guide 2026 — 7 principles (KanseiLink)](https://kansei-link.com/en/insights/mcp-tool-schema-design-guide-2026.html) — description budget, flat schemas, annotations, large-payload URIs
- [Reducing MCP token usage 100x (Speakeasy)](https://www.speakeasy.com/blog/how-we-reduced-token-usage-by-100x-dynamic-toolsets-v2/) & [Anthropic — Code execution with MCP](https://www.anthropic.com/engineering/code-execution-with-mcp) — when dynamic loading pays off (why we skip it at 5 tools)
- [typescript-sdk `registerTool` ZodType PR #816](https://github.com/modelcontextprotocol/typescript-sdk/pull/816) & [SDK v1.17.5 incompatible with Zod v4 #1429](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1429) — zod v3 raw shape confirmed, v4 incompatible
