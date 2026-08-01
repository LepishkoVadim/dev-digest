---
name: onion-architecture
description: "Enforces Onion / Ports-and-Adapters (Clean) architecture on DevDigest backend modules (server/, Fastify 5 + Drizzle + Zod + the custom DI Container). Use when creating or reviewing a backend module, deciding where a file or piece of logic belongs, wiring an adapter, or reviewing a diff for layer-boundary violations. Owns the layer map, the inward-only dependency rule, file placement, and the mechanical dependency-cruiser check that fails on violations. Trigger terms: onion architecture, clean architecture, ports and adapters, hexagonal, dependency rule, layer boundary, where does this file go, domain layer, repository pattern, new backend module, arch:check."
metadata:
  tags: onion-architecture, clean-architecture, ports-and-adapters, hexagonal, backend, layering, dependency-rule, drizzle, fastify, dependency-cruiser
---

# Onion Architecture (DevDigest backend)

## When to use

- Creating a **new backend module** under `server/src/modules/<name>/`.
- Deciding **where a file or piece of logic goes** (route handler? service? repository? adapter? shared?).
- Wiring an **adapter / external SDK** into the app.
- **Reviewing a diff** for layer-boundary violations before it merges.
- A `pnpm arch:check` failure needs interpreting or fixing.

This skill owns **layer boundaries, the dependency rule, and file placement**. For
tool-level detail it defers to the sibling skills (see [Related skills](#related-skills)).

## The layers (as they exist here)

Concentric rings, core in the middle. Our stack maps onto them like this:

| Ring (inner → outer) | What it is here | Location |
|---|---|---|
| **Domain (core)** | Zod schemas + **port interfaces** (`LLMProvider`, `GitHubClient`, `GitClient`, `CodeIndex`, `Embedder`, `SecretsProvider`). Pure — no I/O, no framework. | `server/src/vendor/shared` (`@devdigest/shared`) |
| **Application (use cases)** | Orchestration / business logic. Depends only on domain ports + the `Container` type. | `modules/<name>/service.ts`, `reviews/run-executor.ts`, pkg `reviewer-core` |
| **Infrastructure (secondary adapters)** | *Implements* the ports: LLM/GitHub/Git clients, Drizzle repositories, DB access. | `server/src/adapters/*`, `modules/<name>/repository.ts`, `server/src/db/*` |
| **Presentation (primary adapters)** | Fastify routes, SSE. Turns HTTP into service calls. | `modules/<name>/routes.ts`, `platform/sse.ts` |
| **Composition root** | Wires concretes → ports. The **only** place that knows every layer. Exempt from the cross-layer rules. | `server/src/platform/container.ts` |

## The dependency rule (the one hard rule)

**Dependencies point inward only.** Concretely, in this codebase:

1. **Domain imports nothing outward.** `vendor/shared` must not import `fastify`,
   `drizzle-orm`, `adapters/`, `db/`, `platform/`, or any module. Ports are *defined*
   here; adapters implement them elsewhere.
2. **Application depends on ports, not the ORM.** `service.ts` / `run-executor.ts`
   must not import `drizzle-orm` or `db/client` · `db/schema`. Query building lives in
   the repository. (Services take the `Container` and construct their own repository —
   that's fine.)
3. **Presentation never touches the DB.** `routes.ts` must not import `drizzle-orm` or
   `db/schema` — it calls a service.
4. **No module reaches into another module.** Never import another module's
   `routes/service/repository`. Cross-module wiring goes through `platform/container.ts`;
   genuinely shared helpers go in `modules/_shared/`.
5. **Repositories/services return domain types** (Zod-inferred DTOs via `helpers.ts`
   mappers), not raw Drizzle rows.

The outer rings (`adapters/*`, `repository.ts`, `db/*`, `container.ts`) *are* the place
`drizzle-orm` and vendor SDKs belong — no restriction there.

## Where does this file go?

| You're writing… | It goes in… |
|---|---|
| An HTTP route / request validation | `modules/<name>/routes.ts` (Zod `params`/`body` via `fastify-type-provider-zod`) |
| Orchestration / business logic | `modules/<name>/service.ts` |
| A DB query (Drizzle) | `modules/<name>/repository.ts` (or a `repository/*.repo.ts` split) |
| A call to an external system (LLM, GitHub, git, ripgrep…) | `server/src/adapters/<kind>/` behind a port |
| A **port interface** + its domain type/schema | `server/src/vendor/shared` (edit at source, then re-vendor) |
| Row → DTO mapping / pure transforms | `modules/<name>/helpers.ts` |
| Constants / literals | `modules/<name>/constants.ts` |
| Wiring a new adapter or shared repository | `server/src/platform/container.ts` |
| A helper two modules both need | `modules/_shared/` |

## New module checklist

1. Create `modules/<name>/` with `routes.ts` (+ `service.ts`, `repository.ts`,
   `helpers.ts`, `constants.ts` as needed). Follow the existing `agents/` module as the
   reference shape.
2. `routes.ts` exports a **default Fastify plugin**; register it statically in
   `modules/index.ts` (one import + one entry — no filesystem autoload).
3. Construct any shared/cross-cutting dependency (a repository other modules also use, a
   new adapter) in `platform/container.ts`, not inside the module.
4. Keep the dependency rule: route → service → repository → db. Ports live in `shared`.
5. Run `pnpm arch:check` — it must stay green for your new files.

## Enforcement

The rule is mechanical, not just advice. `server/.dependency-cruiser.cjs` encodes four
`forbidden` rules (`no-domain-to-outer`, `no-route-to-db`, `no-app-to-orm`,
`no-cross-module-internals`).

```bash
cd server && pnpm arch:check      # depcruise src --config .dependency-cruiser.cjs
```

Exit non-zero = a boundary was crossed; the message names the exact `from → to` edge.
Wire it into CI / pre-push alongside `pnpm typecheck`.

> **Known pre-existing drift (as of this skill's creation):** the check currently reports
> ~10 violations in older modules — `settings/`, `workspace/`, `pulls/`, `polling/`
> `routes.ts` query the DB directly; `reviews/run-executor.ts` imports `db/schema`; and
> `pulls/routes.ts` imports `reviews/repository/run.repo.ts`. These are grandfathered debt,
> not a green baseline. **New and changed code must not add to the list**; fix the module
> you touch when practical.

## Related skills

Boundary rules are here; the *how* of each tool lives in its own skill:

- [`fastify-best-practices`](../fastify-best-practices/SKILL.md) — routes, plugins, schema validation, error handling (presentation ring).
- [`drizzle-orm-patterns`](../drizzle-orm-patterns/SKILL.md) — schema, queries, transactions (repository ring).
- [`zod`](../zod/SKILL.md) — the schemas that serve as domain contracts.
- [`typescript-expert`](../typescript-expert/SKILL.md) — type-level tools for keeping ports clean.

## References

See [`references.md`](./references.md) for annotated sources. Key reads:

- Onion Architecture — layers & dependency rule (NDepend): https://blog.ndepend.com/onion-architecture-layers/
- Clean Node.js Architecture (Khalil Stemmler): https://khalilstemmler.com/articles/enterprise-typescript-nodejs/clean-nodejs-architecture/
- Domain-Driven Hexagon — DDD + Hexagonal, TS examples: https://dev.to/sairyss/domain-driven-hexagon-18g5
- Repository pattern & the Dependency Rule (Cosmic Python, ch.2): https://www.cosmicpython.com/book/chapter_02_repository
