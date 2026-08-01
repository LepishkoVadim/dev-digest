# Onion Architecture — examples

Good/bad pairs grounded in the real `server/src` code. Each ❌ is a violation the
`pnpm arch:check` ruleset catches; each ✅ is the shape it wants.

## 1. Presentation must not touch the DB (`no-route-to-db`)

❌ Route builds a Drizzle query itself (this is the current drift in `settings/`,
`workspace/`, `pulls/`, `polling`):

```ts
// modules/things/routes.ts
import { eq } from 'drizzle-orm';
import * as t from '../../db/schema.js';

app.get('/things/:id', async (req) => {
  return app.db.select().from(t.things).where(eq(t.things.id, req.params.id));
});
```

✅ Route calls a service; the service owns orchestration, the repository owns the query:

```ts
// modules/things/routes.ts
import { ThingsService } from './service.js';

app.get('/things/:id', async (req) => {
  const svc = new ThingsService(app.container);
  return svc.get(getContext(req).workspaceId, req.params.id);
});
```

## 2. Application depends on ports, not the ORM (`no-app-to-orm`)

❌ Service (or `run-executor.ts`) imports `db/schema` and builds queries — the current
drift in `reviews/run-executor.ts`:

```ts
// modules/reviews/run-executor.ts
import * as schema from '../../db/schema.js';   // ← app layer reaching into infra
```

✅ Follow `AgentsService`: hold a repository, delegate all data access to it. The service
never sees `drizzle-orm`:

```ts
// modules/agents/service.ts
export class AgentsService {
  private repo: AgentsRepository;
  constructor(private container: Container) {
    this.repo = new AgentsRepository(container.db);
  }
  async list(workspaceId: string): Promise<Agent[]> {
    const rows = await this.repo.list(workspaceId);
    return rows.map(toAgentDto);          // ← returns domain DTOs, not raw rows
  }
}
```

`drizzle-orm` + `db/schema` live only in `repository.ts`:

```ts
// modules/agents/repository.ts  (infrastructure ring — imports are fine here)
import { and, asc, desc, eq } from 'drizzle-orm';
import * as t from '../../db/schema.js';
```

## 3. Domain stays pure (`no-domain-to-outer`)

❌ A port/domain file in `vendor/shared` importing an adapter or the ORM:

```ts
// vendor/shared/adapters.ts
import { OpenAIProvider } from '../../adapters/llm/openai.js';   // ← core → infra, forbidden
```

✅ The domain *defines* the port; the adapter *implements* it (dependency inversion):

```ts
// vendor/shared/adapters.ts — the port (pure interface, no imports outward)
export interface LLMProvider {
  complete(input: CompletionInput): Promise<CompletionResult>;
}

// adapters/llm/openai.ts — the adapter depends inward on the port
import type { LLMProvider } from '@devdigest/shared';
export class OpenAIProvider implements LLMProvider { /* … */ }
```

## 4. No cross-module internals (`no-cross-module-internals`)

❌ One module importing another module's repository — the current drift in `pulls/`:

```ts
// modules/pulls/routes.ts
import { runCostUsd } from '../reviews/repository/run.repo.js';   // ← pulls → reviews internals
```

✅ Shared/cross-cutting repositories are constructed once in the composition root and
handed to whoever needs them; modules never import each other:

```ts
// platform/container.ts — the ONE place allowed to wire across layers
import { AgentsRepository } from '../modules/agents/repository.js';
import { ReviewRepository } from '../modules/reviews/repository.js';
// … exposed on the Container so any service can use them via `container`
```

If two modules genuinely share a pure helper, it goes in `modules/_shared/` (which the
rule explicitly allows).

## Why the Container is exempt

`platform/container.ts` imports adapters, module repositories, and `reviewer-core` all at
once — that's its job as the composition root. The ruleset scopes the cross-layer `from`
patterns to `vendor/shared`, `routes.ts`, `service.ts`, and `modules/*`, so `platform/`
is never flagged. Keep all "knows every layer" wiring there and nowhere else.
