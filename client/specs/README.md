# client — Specs index
↑ [CLAUDE.md](../CLAUDE.md)

Behavior contracts for the UI. Coverage today is two-layered and executable — no
prose specs are extracted yet:

| Contract | Source |
|----------|--------|
| Component & interaction behavior (vitest + jsdom, `fetch` mocked) | `src/**/_components/<Name>/*.test.tsx` |
| End-to-end browser journeys (client + API + seeded DB) | [`../../e2e/specs`](../../e2e/README.md) |

Add a UI-only spec here only when a behavior needs a contract neither layer pins —
a cross-page interaction rule, a loading/error-state contract, or an accessibility
invariant — rather than duplicating an e2e flow.

Naming, status lifecycle, the section template and the EARS patterns live in
[`../../specs/README.md`](../../specs/README.md) — a spec that touches `client`
alone belongs here; one that spans two or more modules goes to the top-level
`specs/` instead.
