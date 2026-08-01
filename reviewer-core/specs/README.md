# reviewer-core — Specs index
↑ [CLAUDE.md](../CLAUDE.md)

Behavior contracts for the engine. Coverage today is the hermetic vitest suite
(stubbed `LLMProvider`, no keys, no network) — no prose specs are extracted yet:

| Contract | Source |
|----------|--------|
| Prompt assembly — sections, ordering, injection guard | vitest around `src/review/prompt.ts` |
| Grounding gate — ungrounded findings dropped, score recomputed | vitest around `src/review/grounding.ts` |
| `toReview` selection (CI payload helper) | vitest suite |
| Full `run` end-to-end with a stubbed provider | vitest around `src/review/run.ts` |

Add a prose spec here only for a higher-level invariant the tests don't state
plainly — e.g. a grounding invariant or an injection-guard case matrix — rather
than restating the tests.
