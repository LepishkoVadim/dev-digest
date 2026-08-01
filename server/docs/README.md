# server — Docs index
↑ [CLAUDE.md](../CLAUDE.md) · [README](../README.md)

Deep-dive backend design notes for `@devdigest/api`. `CLAUDE.md` is the map, the
[README](../README.md) is the overview (request/DI flow, API map, review context);
this folder holds the "why" behind non-obvious backend decisions. Nothing has been
extracted into a standalone doc yet — the table maps each concern to where it lives
in code and when it's worth pinning as a doc.

## Design surface

| Area | Where it lives today | Extract a doc when |
|------|----------------------|--------------------|
| Feature modules — routes + service per plugin | `src/modules/<name>/`, registered in `src/modules/index.ts` | you add a module with non-trivial cross-module coupling |
| Adapters (ports) behind the DI container | `src/adapters/*` (+ `mocks.ts`), `src/platform/container.ts` | you add a port or change the swap-for-mocks contract |
| Schema-first validation — zod as route schema | `@devdigest/shared` via `fastify-type-provider-zod` | you change the error envelope or validation flow |
| Review context — Repo Intel, injection guard, grounding | `src/modules/reviews/run-executor.ts` → `reviewer-core/prompt.ts` | you change what the reviewer prompt is assembled from |
| DB schema & migrations (not applied on boot) | `src/db/` (regenerate via `pnpm db:generate`) | you document a schema decision the migration can't self-explain |

Keep the request flow, API map, and env table in [`../README.md`](../README.md);
add a doc here only for a decision that spans modules. Link, don't copy.
