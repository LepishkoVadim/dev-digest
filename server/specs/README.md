# server — Specs index
↑ [CLAUDE.md](../CLAUDE.md)

Behavior contracts for the API. Coverage today is executable — no prose specs are
extracted yet:

| Contract | Source |
|----------|--------|
| Request/response shapes — the live contract | route zod schemas in `@devdigest/shared` (drive validation **and** serialization) |
| Endpoint behavior end-to-end (real Postgres via testcontainers) | `src/**/*.it.test.ts` |
| Hermetic unit behavior (adapters mocked) | `src/**/*.test.ts` |

Add a prose spec here only when a behavior isn't pinned by the schemas or tests —
e.g. an error-envelope expectation, a rate-limit contract, or a cross-endpoint
invariant — rather than restating the zod schemas.
