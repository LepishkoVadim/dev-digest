# frontend-ui-architecture

A Claude Code skill for **UI/frontend architecture and code organization** in
React + Next.js (App Router) + TypeScript. It answers *where code lives and why*:
component location and splitting, constants, utils vs helpers vs lib vs services,
type placement, business-logic placement, and how the main architecture
methodologies compare (type-based, feature-based / bulletproof-react,
Feature-Sliced Design).

**Version:** 1.0.0

Scope note: this skill deliberately does **not** cover React coding technique
(hooks, rendering, performance) — that's `react-expert` — or Next.js feature APIs
— that's `nextjs-developer`. It complements both by owning *structure*.

## Files
- `SKILL.md` — the skill: principle, recommended baseline, decision rules, comparison table, checklist.
- `references/architecture-comparison.md` — deep dive on the three approaches, FSD layers, and migration path.

## Sources

Every recommendation in the skill traces to one of these. Grouped by topic.

### Project & folder structure
- [bulletproof-react — project structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md) — the canonical feature-based structure and the feature-boundary import rule.
- [bulletproof-react — project standards](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-standards.md) — linting, formatting, and consistency conventions.
- [bulletproof-react (repo)](https://github.com/alan2207/bulletproof-react) — reference implementation.
- [Robin Wieruch — React Folder Structure Best Practices](https://www.robinwieruch.de/react-folder-structure/) — the 5-step evolution from one file to feature folders.
- [Robin Wieruch — Feature-based React Architecture](https://www.robinwieruch.de/react-feature-architecture/) — decoupling features, keeping domains from intertwining.
- [profy.dev — Popular React Folder Structures & Screaming Architecture](https://profy.dev/article/react-folder-structure) — comparison of structures; the "screaming architecture" argument.

### Feature-Sliced Design
- [Feature-Sliced Design — Overview](https://feature-sliced.design/docs/get-started/overview) — what FSD is and when to use it.
- [FSD — Layers](https://feature-sliced.design/docs/reference/layers) — the 7 layers and the downward-only import rule.
- [FSD — Slices and Segments](https://feature-sliced.design/docs/reference/slices-segments) — slices (business domain) × segments (ui/model/api).

### Next.js App Router structure
- [Next.js — Getting Started: Project Structure](https://nextjs.org/docs/app/getting-started/project-structure) — official folder/file conventions.
- [Next.js — Routing: Project Organization & Colocation](https://nextjs.org/docs/14/app/building-your-application/routing/colocation) — safe colocation, private folders (`_folder`), route groups (`(group)`).

### Colocation principle
- [Kent C. Dodds — Colocation](https://kentcdodds.com/blog/colocation) — "place code as close to where it's relevant as possible."
- [Kent C. Dodds — State Colocation Will Make Your React App Faster](https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster) — keep state near where it's used.

### Business logic & effects placement
- [React docs — You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect) — event handlers vs Effects; don't use Effects for transforms or user actions.
- [React docs — Escape Hatches](https://react.dev/learn/escape-hatches) — Effects as synchronization with external systems only.

### Server state vs client state
- [TkDodo — Practical React Query](https://tkdodo.eu/blog/practical-react-query) — keep server state in the cache, don't copy into local state.
- [TkDodo — Deriving Client State from Server State](https://tkdodo.eu/blog/deriving-client-state-from-server-state) — derive what the user sees from both.
- [TkDodo — React Query and Forms](https://tkdodo.eu/blog/react-query-and-forms) — where forms blur the server/client-state line.

### TypeScript type placement & naming
- [Total TypeScript — Strongly Typing React Props](https://www.totaltypescript.com/react-props-typescript) — type/interface/inline for props; extract types for reuse.
- [Matt Pocock — default to `type`, use `interface extends` for object composition](https://x.com/mattpocockuk/status/1685947322491154433) — declaration-merging footgun; performance of `interface extends` vs intersections at scale.

## Method note
Sources were gathered via targeted web search and verified against primary docs
(official React/Next.js docs, FSD docs, bulletproof-react repo) rather than a
single secondary summary. Add new sources to the matching section above when the
skill's guidance is extended.
