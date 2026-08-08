# reviewer-core — Insights
↑ [CLAUDE.md](./CLAUDE.md)

Append-only log of non-obvious decisions and gotchas for the engine. Newest
first. One entry per learning.

## Format
```
## YYYY-MM-DD — <short title>
**Problem:** …  **Decision:** …  **Why:** …
```

## 2026-08-08 — OpenRouter silently ignores your JSON schema without `provider.require_parameters`  [gotcha]
**Problem:** `completeStructured` sends `response_format: { type: 'json_schema', json_schema: { strict: true, … } }` in `src/llm/openrouter.ts`, but OpenRouter routes to whatever provider endpoint is cheapest/available — and an endpoint that does not support structured output will **ignore the schema and return free prose**, which then fails `parseWithRepair` (or worse, repairs into a plausible-but-wrong object). No error from OpenRouter; it looks like a flaky model. **Decision:** Send `provider: { require_parameters: true }` in the request body alongside `response_format`, so OpenRouter only routes to endpoints that honour the passed params. Added in `src/llm/openrouter.ts` next to the existing `usage`/`session_id` extra-body spreads. **Why:** This affects **every** structured call through OpenRouter, not just the new intent classifier — the main review too. Trade-off to know: a model with *no* schema-supporting endpoint now fails loudly instead of quietly returning junk. That is the correct failure mode, but it is a behaviour change for any OpenRouter model previously "working" by luck.

## 2026-08-08 — `CLAUDE.md` module map is stale: files are `src/prompt.ts` / `src/grounding.ts`, not `src/review/*`
**Problem:** `reviewer-core/CLAUDE.md:19-20` lists the prompt builder as `src/review/prompt.ts` and grounding as `src/review/grounding.ts`. Those paths do not exist — planning against the map sends you to the wrong files. **Decision:** The real files are `src/prompt.ts` and `src/grounding.ts` (only `run.ts`/`reduce.ts` live under `src/review/`). Trust the tree, not the map, until `CLAUDE.md` is fixed. **Why:** The map was written before the files moved and nothing enforces it against disk, so it rots silently; an agent that reads it and stops (instead of globbing) plans against phantom paths.
