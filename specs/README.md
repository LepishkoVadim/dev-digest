# Specs — cross-module specifications
↑ [CLAUDE.md](../CLAUDE.md)

This top-level `specs/` directory holds Spec-Driven Development (SDD) specifications
that span **two or more** modules. Single-module specs live next to their module
instead — keep a spec as close to the code it governs as its scope allows.

| Spec scope | Location |
|------------|----------|
| `server` only | [`server/specs/`](../server/specs/README.md) |
| `client` only | [`client/specs/`](../client/specs/README.md) |
| `reviewer-core` only | [`reviewer-core/specs/`](../reviewer-core/specs/README.md) |
| `e2e` only | [`e2e/specs/`](../e2e/README.md) |
| `mcp-server` only | `mcp-server/specs/` |
| **cross-module (≥ 2 modules)** | `specs/` (here) |

The `Modules:` header line decides the location. If it names one module the spec
does not belong here; if it names two or more, it does.

## What a spec is

Specs are authored by the `devdigest-spec-creator` agent
([`.claude/agents/devdigest-spec-creator.md`](../.claude/agents/devdigest-spec-creator.md)).

A spec describes **what** a feature must do and **why** — the problem, goals /
non-goals, user stories, EARS acceptance criteria, edge cases, cross-module
interactions, and contracts. It deliberately stops short of **how** to implement it
(file-by-file tasks, layers, code) — that is the `devdigest-implementation-planner`
agent's Implementation Plan (`docs/plans/`). The intended chain is:

```
spec-creator → spec (WHAT/WHY) → planner → plan (HOW) → implementer → code
```

Skip the spec for a change whose behaviour is already pinned by the Zod contracts
in `@devdigest/shared` and the test suites. A spec earns its place when the
behaviour is not yet written down anywhere executable.

## Conventions

- **File name:** `YYYY-MM-DD-<kebab-feature-name>.md`
- **Spec ID** (in the header line): `SPEC-YYYY-MM-DD-<kebab-feature-name>`
- **Status lifecycle:** `draft` → `approved` → `implemented`
- **Language:** specs are written in English (aligned with the rest of the repo docs).

A spec that replaces an earlier decision links it via the `Supersedes:` header line.
The superseded spec keeps its file and its `Status:`; it is not deleted.

### Who moves the status

A lifecycle nobody advances leaves every spec at `draft` forever. So:

| Transition | Who | When |
|------------|-----|------|
| `draft` → `approved` | **a human** | after reading it; the agent never sets this |
| `approved` → `implemented` | `devdigest-doc-writer` | last in the pipeline, on settled code, once the ACs actually hold |

**A spec with an unresolved `blocker` row in *Design review* cannot reach
`approved`.** Otherwise the severity column is decoration. Resolve it, downgrade it
with a reason, or the spec stays `draft`.

### Traceability

The header carries two more lines, `none` at `draft` and filled in as the work
moves:

```
Plan:  docs/plans/<the Implementation Plan this spec produced>
PR:    <link>
```

Acceptance criteria are numbered `AC-1…` because those numbers travel: the
Implementation Plan cites them in its *done when* conditions, and
`devdigest-plan-verifier` reports one row per `AC-n`. An AC nobody can cite is an
AC nobody checks.

## Template

Every spec reproduces these sections in this order. A section that does not apply
says `none` and why — it is never deleted and never left blank.

| Section | Holds |
|---------|-------|
| header | `Spec ID` · `Status` · `Supersedes` · `Modules` · `Plan` · `PR` |
| Problem and user | who hurts and what it costs them today — not the solution |
| Goals / Non-goals | the non-goals are the half that stops scope creep |
| User stories | `As a <role>, I want <capability>, so that <outcome>` |
| Acceptance criteria (EARS) | numbered `AC-1…`, one requirement each, see below |
| Edge cases | the condition and the required behaviour, one line each |
| Design review | screen / what is missing / consequence / proposal / severity |
| Module contracts | from → to → channel → new or existing, plus one Mermaid sequence diagram |
| Non-functional requirements | `NFR-n` · requirement · **target with a number** · **how it is verified** — a measurable observable, not a test to write |
| Inputs and provenance | every input: origin, who controls it, whether it is trusted |
| Untrusted inputs | PR diffs, repo content, LLM output — and the required handling |
| Open questions | unresolved, each with the assumption currently standing in for it |

## Acceptance criteria — EARS

[EARS](https://alistairmavin.com/ears/) (Easy Approach to Requirements Syntax),
Mavin et al., IEEE RE'09. Five patterns, English, always `shall`:

| Pattern | When it applies | Shape |
|---------|-----------------|-------|
| Ubiquitous | always | The system shall … |
| Event-driven | on a trigger | WHEN \<trigger\>, the system shall … |
| State-driven | during a state | WHILE \<state\>, the system shall … |
| Unwanted behaviour | on an undesired condition | IF \<condition\>, THEN the system shall … |
| Optional feature | when a feature is enabled | WHERE \<feature enabled\>, the system shall … |

```
AC-4. IF the LLM call fails three times within 60 s, THEN the system shall mark
      the run `failed`, surface the provider error verbatim, and not retry.
```

Every criterion must be falsifiable — something a reader can later mark pass or
fail without asking the author what they meant. `fast`, `intuitive`,
`user-friendly`, `robust`, `properly`, `as needed` are banned: replace them with a
number or an observable condition, or move the sentence to *Non-functional
requirements* with a number attached. A section with only event-driven criteria is
incomplete — every failure named in *Edge cases* needs its `IF … THEN`.

## Writing one

The agent cannot hold a conversation, so it runs in **two calls**:

```
@agent-devdigest-spec-creator  <feature brief + designs>
        → blocking questions · proposals · RESUME BRIEF   (writes nothing)

@agent-devdigest-spec-creator  <RESUME BRIEF, with your answers appended>
        → the spec file, Status: draft
```

Paste the `RESUME BRIEF` back verbatim — phase 2 starts from an empty context and
sees only what that block carries.

Anything **findable** — a route's actual response shape, a library limit, what the
current UI already does — the agent investigates itself by dispatching `researcher`
subagents in parallel. What reaches you as `BLOCKING` should only ever be a
decision: a trade-off, a priority, a scope call. If you find yourself answering a
question you would have had to look up, tell the agent so.

Before reporting, the agent runs an eleven-item self-check over the file it wrote
(sections present, EARS conformance, edge case ↔ criterion coverage, NFR targets,
contract concreteness, no HOW leakage, `path:line` on every claim about existing
code). Its report names what failed on the first pass — read that section, it is
where the weak parts of the spec are.

The agent's own body is authoritative for the writing rules; this file is the index.
It may write only inside `specs/` and `<module>/specs/`, and never touches a
`README.md`, source code, or `INSIGHTS.md`.
