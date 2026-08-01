# Architecture Comparison: Type-based vs Feature-based vs FSD

Depth reference for the comparison table in `SKILL.md`. Read when choosing an
approach or migrating between them.

## 1. Type-based (a.k.a. "group by role")

```
src/
  components/   hooks/   utils/   services/   types/
```

Everything of the same *technical kind* lives together. A single feature's code
is scattered across all folders.

- **Pro:** obvious for beginners; fine up to a few screens.
- **Con:** doesn't scale. Adding/removing a feature means touching every folder;
  nothing tells you what the app *does* ("screaming architecture" fails — the
  structure screams "React", not the product). Deleting a feature safely is hard.
- **Verdict:** demos, prototypes, throwaway apps only.

## 2. Feature-based (bulletproof-react)

Group by **business domain**; a shared layer holds domain-agnostic code.

```
src/
  app/           # routing / app setup
  features/      # one folder per domain; each self-contained (components, api, hooks, utils, types)
  components/    # shared UI (ui/ primitives)
  lib/  utils/  hooks/  config/  types/   # shared, generic
```

Robin Wieruch's 5-step evolution lands here naturally: single file → multiple
component files → per-component folders (styles/tests/constants/types colocated)
→ split React features (hooks/context) from non-React helpers → **feature folders**
separating domain code from generic UI.

**The rule that makes it work — import boundaries:**
- A feature may import from shared layers (`components`, `lib`, `utils`, `hooks`).
- A feature must **not** reach into another feature's internals — cross-feature
  use goes through the feature's `index.ts` public API (or, stricter, is
  disallowed and lifted to a shared layer).
- Enforce with ESLint (e.g. `eslint-plugin-boundaries` / `import/no-restricted-paths`).

- **Pro:** scales to most production apps; features are portable and deletable;
  colocation keeps changes local.
- **Con:** requires discipline — without the boundary rule it degrades into
  cross-imported spaghetti.
- **Verdict:** the pragmatic default for Next.js App Router apps.

## 3. Feature-Sliced Design (FSD)

A formal methodology: a strict two-dimensional grid of **layers** (technical
scope) × **slices** (business domain) × **segments** (technical purpose).

### Layers (top → bottom, imports only point downward)
1. **app** — app-wide setup: routing, entrypoints, global styles, providers.
2. **pages** — full pages / large route-level compositions.
3. **widgets** — large self-contained blocks delivering a whole use case.
4. **features** — reused implementations of product actions with business value.
5. **entities** — business entities (user, product) — the domain nouns.
6. **shared** — generic, business-agnostic UI/utils/config (like the baseline's
   `components/ui`, `lib`, `utils`).

Key constraint: a module in a layer may only import from layers **strictly below**
it. `app` and `shared` have no slices (they're split into segments directly);
`pages`, `widgets`, `features`, `entities` are split into **slices** (by domain),
each slice into **segments**.

### Segments (inside a slice)
- **ui** — visual components.
- **model** — state, business logic, types (store, actions).
- **api** — backend interaction (requests, mappers).
- (others as needed: `lib`, `config`).

- **Pro:** enforced boundaries and a shared vocabulary — excellent for large apps
  and big teams; near-impossible to create circular/upward deps.
- **Con:** steepest learning curve; the layer ceremony (entities vs features vs
  widgets debates) is overkill for small apps.
- **Verdict:** large/long-lived apps, multiple teams, when you want the
  architecture *enforced* rather than *agreed*.

## Choosing

| You have… | Use |
|---|---|
| a prototype / < ~5 screens | type-based (or jump straight to feature-based) |
| a normal production app, one or a few devs | **feature-based** |
| a large app, multiple teams, long lifetime | FSD |

## Migration path (type-based → feature-based → FSD)

1. **Type-based → feature-based:** create `features/`. For each domain, move its
   components/hooks/api/utils/types out of the global buckets into
   `features/<domain>/`. Leave only genuinely shared, domain-agnostic code in
   `components/ui`, `utils`, `lib`, `hooks`. Add a `features/<domain>/index.ts`
   public API and turn on the boundary ESLint rule. Do it one feature at a time.
2. **Feature-based → FSD:** you're most of the way there — `features/` splits into
   FSD's `entities`/`features`/`widgets`/`pages` by granularity, shared code
   becomes `shared`, and each slice adopts `ui`/`model`/`api` segments. Introduce
   the downward-only import rule and enforce it. Only worth it when scale demands
   enforced layers.

Don't mix methodologies within one codebase — pick one and apply it consistently.
