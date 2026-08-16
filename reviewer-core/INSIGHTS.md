# reviewer-core — Insights
↑ [CLAUDE.md](./CLAUDE.md)

Append-only log of non-obvious decisions and gotchas for the engine. Newest
first. One entry per learning.

## Format
```
## YYYY-MM-DD — <short title>
**Problem:** …  **Decision:** …  **Why:** …
```

## 2026-08-16 — `npm test` and `npm run coverage` are the same suite run twice; the gate keeps only `coverage`  [tool/library quirk]
**Problem:** `test` is `vitest run --passWithNoTests` and `coverage` is `vitest run --coverage` (`package.json:11-12`) — `coverage` does not report over a prior run, it instruments and **executes the suite again**. The agent gate used to chain both (`… && npm test && npm run coverage`), so every gate pass ran the tests twice for one result, doubling wall-clock and doubling the test output landing in an agent's context on each fix-and-re-run iteration. Same shape one line up: `build` is byte-identical to `typecheck` (`package.json:8-9`, both `tsc --noEmit -p tsconfig.json`). **Decision:** The gate here is `npm run typecheck && npm run lint && npm run coverage` — fixed in `.claude/agents/devdigest-implementer.md` and `devdigest-test-writer.md` on 2026-08-16. Do not add `npm test` back unless `coverage` stops executing the suite. Two related traps: `reviewer-core/CLAUDE.md:8` says `pnpm test` / `pnpm typecheck`, but this package deliberately uses **npm** while the others use pnpm — follow the agents, that CLAUDE.md line is stale; and `TESTING.md:64` still documents `npm test` for the human path, which is fine, it is not the gate. **Why:** of the two commands `coverage` is the one to keep — it is the ratchet `.github/workflows/reviewer-core.yml` gates on, so it fails on a coverage drop that a bare `npm test` would pass.

## 2026-08-08 — OpenRouter silently ignores your JSON schema without `provider.require_parameters`  [gotcha]
**Problem:** `completeStructured` sends `response_format: { type: 'json_schema', json_schema: { strict: true, … } }` in `src/llm/openrouter.ts`, but OpenRouter routes to whatever provider endpoint is cheapest/available — and an endpoint that does not support structured output will **ignore the schema and return free prose**, which then fails `parseWithRepair` (or worse, repairs into a plausible-but-wrong object). No error from OpenRouter; it looks like a flaky model. **Decision:** Send `provider: { require_parameters: true }` in the request body alongside `response_format`, so OpenRouter only routes to endpoints that honour the passed params. Added in `src/llm/openrouter.ts` next to the existing `usage`/`session_id` extra-body spreads. **Why:** This affects **every** structured call through OpenRouter, not just the new intent classifier — the main review too. Trade-off to know: a model with *no* schema-supporting endpoint now fails loudly instead of quietly returning junk. That is the correct failure mode, but it is a behaviour change for any OpenRouter model previously "working" by luck.

## 2026-08-08 — `CLAUDE.md` module map is stale: files are `src/prompt.ts` / `src/grounding.ts`, not `src/review/*`
**Problem:** `reviewer-core/CLAUDE.md:19-20` lists the prompt builder as `src/review/prompt.ts` and grounding as `src/review/grounding.ts`. Those paths do not exist — planning against the map sends you to the wrong files. **Decision:** The real files are `src/prompt.ts` and `src/grounding.ts` (only `run.ts`/`reduce.ts` live under `src/review/`). Trust the tree, not the map, until `CLAUDE.md` is fixed. **Why:** The map was written before the files moved and nothing enforces it against disk, so it rots silently; an agent that reads it and stops (instead of globbing) plans against phantom paths.
