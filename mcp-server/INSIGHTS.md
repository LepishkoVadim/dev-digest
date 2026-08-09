# mcp-server — Insights
↑ [../CLAUDE.md](../CLAUDE.md)

Append-only log of non-obvious decisions and gotchas for the MCP server. Newest
first. One entry per learning.

## Format
```
## YYYY-MM-DD — <short title>  [<insight type>]
**Problem:** …  **Decision:** …  **Why:** …
```

## 2026-08-09 — Tool-result shaper type needs an index signature or every registerTool handler fails to typecheck  [gotcha]
**Problem:** A hand-written `ToolResult` interface (`{ content, structuredContent?, isError? }`) is rejected by `server.registerTool` in `@modelcontextprotocol/sdk` v1.30: `TS2345 … Index signature for type 'string' is missing in type 'ToolResult'`. Every one of the 5 tool handlers errors identically. **Decision:** Add `[x: string]: unknown;` to the `ToolResult` interface (`src/format.ts`) — the SDK's `CallToolResult` return type declares `[x: string]: unknown`, so structural compatibility requires it. **Why:** The SDK's callback return type is an open (index-signatured) object; a closed interface is not assignable to it even though the fields match. Evidence: `src/format.ts` `ToolResult`, error surfaced across `src/tools/*.ts`.

## 2026-08-09 — POST /pulls/:id/review returns runs+reviews synchronously, but poll GET /pulls/:id/runs to a terminal status anyway  [working approach]
**Problem:** `POST /pulls/:id/review` (`server/src/modules/reviews/routes.ts`) returns `ReviewRunResponse = { pr_id, runs[], reviews[] }` — it looks fire-and-forget (202) per the plan, but actually blocks server-side and returns the persisted reviews inline. **Decision:** Don't trust the inline `reviews` as necessarily complete for large PRs; the resilient shape (implemented in `src/tools/run-agent-on-pr.ts`) is: POST → take `runs[0].run_id` → poll `GET /pulls/:id/runs` (`RunSummary.status` ∈ `running|done|failed|cancelled`) every ~2s to a ≤120s budget → on `done` read `GET /pulls/:id/reviews`; on budget-exhaust return `{status:'running', run_id}` (B10, the expected path for large PRs). **Why:** `RunSummary.status` is the server's source of truth for terminality; the finding DTO uses `start_line`/`end_line` (not `line`) — map `file:start_line` for the concise view. Evidence: `server/src/vendor/shared/contracts/trace.ts` `RunSummary`, `contracts/findings.ts` `Finding`.

## 2026-08-09 — No lookup-by-name endpoint; resolve ids by listing then matching, and keep the matcher pure  [codebase convention]
**Problem:** MCP tools take human identifiers (repo name, PR number, agent name) but the API only addresses by uuid (`GET /repos/:id`, `GET /pulls/:id`, `GET /agents/:id`) — no `?name=` query exists. **Decision:** List-then-match: `GET /repos` → match `full_name`/`name`/`owner/name` case-insensitively (exactly one wins; zero → not_found listing available; many → ambiguous asking for owner/name); then `GET /repos/:id/pulls` → match `number`. Split the pure matchers (`matchRepo`/`matchPull` in `src/http/resolve.ts`) from the fetch so they unit-test without a network. **Why:** Two list calls per invocation is fine for a local tool over small lists; the pure/impure split is the only thing that makes the branchy match logic testable. Evidence: `src/http/resolve.ts`, `src/pure.test.ts`; `server/src/modules/repos/routes.ts` + `pulls/routes.ts` (route inventory).
