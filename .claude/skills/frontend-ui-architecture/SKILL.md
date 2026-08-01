---
name: frontend-ui-architecture
description: >
  UI/frontend architecture and code organization for React + Next.js (App Router) + TypeScript.
  Answers where files live and why: component location and splitting, constants, utils vs helpers
  vs lib vs services, type placement, and where business logic belongs. Compares type-based,
  feature-based (bulletproof-react), and Feature-Sliced Design. Use when starting a project,
  reorganizing folders, deciding where a new file goes, or reviewing structure — NOT for React
  coding patterns (hooks, rendering, perf), which the react-expert skill covers.
license: MIT
metadata:
  version: "1.0.0"
  domain: frontend
  role: specialist
  scope: architecture
  triggers: >
    frontend architecture, ui architecture, project structure, folder structure, file organization,
    where should this go, component organization, feature-sliced design, fsd, bulletproof-react,
    colocation, business logic placement, constants, utils, helpers, next.js app router structure
  related-skills: react-expert, nextjs-developer, typescript-pro
---

# Frontend UI Architecture

Decide **where code lives and why** in a React + Next.js (App Router) + TypeScript
project. This skill is about *organization*, not coding technique — for hooks,
rendering, and React APIs use `react-expert`; for Next.js features use
`nextjs-developer`.

## When to Use This Skill

- Starting a new React/Next.js project and choosing a folder structure.
- Deciding where a new file belongs (component, constant, util, type, logic).
- Reorganizing a codebase that has become a `components/` + `utils/` dumping ground.
- Reviewing a PR/project for structural smells (misplaced logic, leaky boundaries).
- Choosing between type-based, feature-based, and Feature-Sliced Design.

## The One Principle: Colocation

> **Place code as close as reasonable to where it's used. Things that change
> together live together.** — Kent C. Dodds

Every rule below is a corollary. Start colocated (inside the feature/route that
uses it) and only **promote code upward to a shared layer when a second consumer
actually appears** — not in anticipation of one. Premature sharing creates
coupling; late sharing is a cheap move.

## Recommended Baseline (Next.js App Router + TS)

Feature-based, with the `app/` directory reserved for routing only. In App Router,
files are only routable if they export from `page`/`route`/`layout` etc., so you
*can* colocate freely inside `app/` — but keeping non-route code in `src/features`
and `src/components` keeps routing thin and features portable.

```
src/
  app/                      # routing ONLY: page.tsx, layout.tsx, route.ts, loading/error
    (marketing)/            # route groups organize without affecting the URL
    dashboard/
      page.tsx              # thin: composes feature UI + loads data
  features/                 # the bulk of the app — one folder per business domain
    auth/
      components/           # components used only inside this feature
      hooks/                # feature-specific hooks
      api/                  # data access for this feature (queries, mutations, server actions)
      utils/                # helpers specific to this feature
      constants.ts          # constants specific to this feature
      types.ts              # types specific to this feature
      index.ts              # public API of the feature — the ONLY entry other code imports
  components/               # shared, generic, domain-agnostic UI (ui/ primitives + layout)
    ui/                     # Button, Input, Dialog — no business knowledge
  lib/                      # wrappers/config around third-party libs (apiClient, db, auth config)
  utils/                    # generic pure helpers shared app-wide (formatDate, cn)
  hooks/                    # generic shared hooks (useMediaQuery, useDebounce)
  types/                    # truly global/shared types only
  config/                   # env, app-wide config constants
```

Enforce one boundary rule: **features may import from `components/`, `lib/`,
`utils/`, `hooks/`; they should not reach into another feature's internals** —
import from `features/x` only via its `index.ts`. This is the single rule that
keeps a feature-based codebase from rotting into spaghetti.

## Decision Rules

### Where do components live?
- **Used by one feature** → `features/<name>/components/`.
- **Used by 2+ features, domain-agnostic** (Button, Modal) → `components/ui/`.
- **Route-level composition** → the route's `page.tsx` in `app/`, kept thin: it
  wires data + feature components, holding no business logic itself.
- Promote a component from feature-local to shared only on the **second** real
  consumer. Don't design "reusable" components up front.

### How do I split a component?
- Split by **responsibility**, not by size or a rigid rule. Extract when a chunk
  has its own reason to change, its own state, or is reused.
- Prefer **composition** (passing `children`/slots) over the old
  container/presentational split — that pattern is largely obsolete since hooks.
- **Server vs Client boundary (App Router):** keep components Server Components by
  default; push `"use client"` as far **down** the tree as possible (to the leaf
  that needs interactivity/state), so most of the tree stays server-rendered.
- Colocate a component's styles, test, and types in its own folder once it grows
  past a single file.

### Where do constants live?
- Used by one feature → `features/<name>/constants.ts`.
- Truly global (routes map, query keys, enums) → `src/config/` or a top-level
  `constants.ts`. Environment values → `src/config/env.ts` (validated once).
- Rule of thumb: a constant lives at the **lowest** level that covers all its users.

### utils vs helpers vs lib vs services — what's the difference?
- **utils/** — *generic, pure, domain-agnostic* functions (`formatDate`, `cn`,
  `groupBy`). No app knowledge. Shared → `src/utils`; feature-specific →
  `features/x/utils`. Avoid a god `utils/` file: split by concern, and if a util
  knows about your domain it's not a util — it's a helper or belongs in the feature.
- **helpers** — same shape as utils but *domain-aware* (`getFullName(user)`).
  Keep them **in the feature** they serve, not in the global bucket.
- **lib/** — thin *wrappers/config around third-party dependencies* (the axios
  instance, the db client, auth config). One place to swap or configure a vendor.
- **services / api/** — *data access & side effects* (fetching, mutations, server
  actions). This is where "talk to the backend" lives — see business logic below.

### Where do TypeScript types live?
- **Colocate by default:** a component's props type sits in the component file; a
  feature's shared types in `features/x/types.ts`.
- Only *truly cross-cutting* types go in a global `src/types/`.
- `type` vs `interface`: **default to `type`** (declaration merging on `interface`
  silently merges same-named declarations — a footgun); use `interface extends`
  when composing many object types, since it type-checks faster than intersections
  at scale (Matt Pocock).

### Where does business logic live? (the most common mistake)
Placement is decided by *what kind* of logic it is:

1. **Reacting to a user action** (click, submit) → an **event handler**, or a
   function it calls. Not an Effect.
2. **Transforming data for render** (filter, sort, derive) → compute **during
   render**; memoize if expensive. Not an Effect, not state.
3. **Reusable stateful logic** tied to a domain → a **custom hook** in the feature.
4. **Talking to the server** → the **data layer** (`features/x/api/`, server
   actions, route handlers) — never inline in a component.
5. **Syncing with an external system** (subscriptions, non-React widgets) → the
   one legitimate `useEffect` use. Most Effects you write aren't this — see React's
   "You Might Not Need an Effect".

Keep components thin: they render UI and wire handlers; logic lives in hooks, the
data layer, and pure functions.

### Server state vs client state — don't merge them
- **Server state** (data you don't own, async, a cached snapshot) → a server-cache
  library (TanStack Query) or the App Router data layer. Don't copy it into
  `useState`.
- **Client state** (UI you fully control — open/closed, form drafts) → local state
  / context / a client store.
- Derive what the user sees from both; conflating them is a top source of bugs
  (TkDodo). This boundary drives your `api/` vs `hooks/` split.

## Architecture Comparison (pick one, commit to it)

| Approach | Groups code by | Best for | Cost |
|---|---|---|---|
| **Type-based** (`components/`, `hooks/`, `utils/`) | technical role | tiny apps, demos | doesn't scale — one feature's code scatters across every folder |
| **Feature-based** (bulletproof-react) | business domain | most production apps | needs discipline on the feature-boundary import rule |
| **Feature-Sliced Design (FSD)** | layered slices + segments | large apps, big teams | steepest learning curve; ceremony can be overkill for small apps |

**Recommendation:** feature-based (the baseline above) for the typical Next.js
app — it's the pragmatic middle. Reach for **FSD** when the team/app is large
enough that you need *enforced* layer rules (`app → pages → widgets → features →
entities → shared`, imports only point downward). Use **type-based** only for
throwaway or tiny projects. See `references/architecture-comparison.md` for the
full breakdown, FSD layer definitions, and a migration path.

## Quick "where does this go?" checklist
1. Is it used by exactly one feature? → put it in that feature.
2. Used by 2+ features and domain-agnostic? → shared layer (`components/ui`,
   `utils`, `hooks`, `lib`).
3. Does it wrap a third-party dep? → `lib/`.
4. Does it touch the server? → the data layer (`api/` / server action).
5. Still unsure? → keep it colocated. Promoting later is cheap; un-coupling isn't.

## Reference Guide

| Topic | Reference | Load when |
|---|---|---|
| Full architecture comparison, FSD layers, migration path | `references/architecture-comparison.md` | Choosing an approach or moving between them |
| Sources / further reading | `README.md` | Justifying a rule or going deeper |
