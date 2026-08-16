---
name: run-plan
description: "Executes an already-approved DevDigest Implementation Plan end to end: implementer → architecture review → bounded fix rounds → conditional plan verification. Takes the plan by file path, plus an optional spec, extra requirements and design artefacts. Does NOT write the spec (devdigest-spec-creator) and does NOT write the plan (devdigest-implementation-planner) — both are run manually before this. Test-writer is deliberately out of the pipeline. Trigger terms: run-plan, run the plan, execute the plan, implement the plan, build this plan, ship the plan."
metadata:
  tags: run-plan, sdd, orchestration, implementation, architecture-review, plan-verifier, pipeline
---

# run-plan — execute an approved Implementation Plan

Orchestrator for the **execution half** of SDD. Everything upstream is manual.

```
[manual] spec-creator ─▶ spec        [manual] implementation-planner ─▶ plan
                                                                          │
                                                    ┌─────────────────────┘
                                                    ▼
  ① implementer ─▶ ② architecture-reviewer ─▶ ③ fix rounds (≤2) ─▶ ④ plan-verifier?
                                                    │                     │
                                                    └── converged ────────┘
```

## Not in scope — do not do these here

- **Do not write or amend a spec.** No plan? No spec? Stop and say which is
  missing. Writing one yourself produces a plan nobody reviewed.
- **Do not re-plan.** If the plan and the codebase disagree, stop and report it.
  A plan that turns out wrong goes back to `devdigest-implementation-planner`,
  not into an improvised rewrite here.
- **Do not spawn `devdigest-test-writer`.** Deliberately cut for token cost —
  see *What skipping tests actually costs* below.
- **Do not spawn `devdigest-doc-writer`.** Run it manually once the change is
  settled.

## Inputs

| Input | Required | Form |
|---|---|---|
| Implementation Plan | **yes** | **a file path** — `docs/plans/<name>.md` |
| Spec | no | path under `specs/` or `<module>/specs/` |
| Extra requirements | no | free prose from the caller |
| Designs | no | screenshot paths, design-doc paths, or `client/src` references |

**The plan travels by reference, never by value.** If the caller pasted plan
text instead of a path, write it to `docs/plans/<YYYY-MM-DD>-<slug>.md` first and
use that path. Every downstream agent then re-reads what it needs instead of you
re-piping the whole plan through three prompts.

Designs are **pass-through reference** for the implementer when the plan touches
`client/**`. Do not analyse them for gaps — that was spec-creator's job and it
already ran.

## Preflight — three checks, then stop or go

1. **Locate the repo root.** `git rev-parse --show-toplevel`. If that fails from
   the cwd, find the directory holding `scripts/sync-shared.sh` and `cd` there
   first. Every gate command in every agent is written relative to the repo root
   (`cd server && …`, `./scripts/e2e.sh`); running them from anywhere else fails
   in a way that looks like a broken gate. Resolve it **once**, here.
2. **Read the plan.** Confirm it has the ten headings the planner emits. Note the
   step count and whether §1 *Requirements review* names a spec — both decide
   phase ④. **Unanswered blocking questions in §1 → stop.**
3. **Warn on the coverage ratchet.** If the plan touches `reviewer-core/**`, say
   so now: `npm run coverage` is a ratchet and **fails when coverage drops**. With
   test-writer cut, the implementer must write those tests itself or the gate
   blocks. Better to know at minute one than at fix round two.

## ① Implement

Spawn `devdigest-implementer` once. Give it:

- the plan **path** (not its text)
- the spec path and design paths, if supplied
- any extra requirements from the caller, verbatim
- nothing else — it re-reads the modules itself

Expect a **Change Report**. Read `Deviations` and `NOT verified here` before
moving on; a `blocked` step means stop and report, not continue.

## ② Architecture review

Spawn `devdigest-architecture-reviewer`. Give it the **commit range or "working
tree"**, never a summary of the diff — it re-derives ground truth itself, and
that re-derivation *is* the check.

Its verdict splits three ways, and only one of them is your problem:

| severity | meaning | action |
|---|---|---|
| `critical` | a **new** boundary crossing or real contract drift | **fix** — phase ③ |
| `grandfathered` | known pre-existing debt | **never fix here**, never block |
| `advisory` | everything else | report, do not fix |

Zero criticals → skip straight to ④.

## ③ Fix rounds — bounded at two

The reviewer writes nothing and fixes nothing. You turn its findings into work.

**Build a Fix Brief.** Not prose — the same shape the implementer already
executes, because its hard limit is *"edit only files named in §6"* and a fix
round's files are not in the original §6:

```markdown
# Fix Plan (round N) — derived from Architecture Review
## 5. Skills the implementer MUST invoke
| scope | skill | why |
## 6. Steps
### Step 1 — <finding F1 title>
- files: <exactly the paths F1 cites>
- change: <the reviewer's `suggested direction`, expanded to what must hold>
- done when: <the rule F1 violated no longer fires>
## 8. Verification commands
<the gate rows for the touched modules, verbatim>
```

Spawn `devdigest-implementer` with the Fix Brief **plus the original plan path**
(fresh context — it remembers nothing from ①). State explicitly: *fix only the
listed criticals; grandfathered and advisory findings are out of scope.* Without
that line it over-fixes and the diff stops matching the plan.

**Re-verify by finding class, not by respawning the reviewer.** Most criticals
are exactly what the deterministic gates catch, and those are free:

| finding came from | re-check with |
|---|---|
| `arch:check` / `depcruise` | `cd server && npx depcruise src --config .dependency-cruiser.cjs --ignore-known` |
| contract drift | `./scripts/sync-shared.sh --check` |
| reading only (reviewer-core purity, test-file layering, path-filter coupling) | one narrow re-read of just those files |

Only respawn the full `devdigest-architecture-reviewer` when a fix round touched
files **outside** what the findings named — that is when a *new* violation can
appear. Otherwise the cheap gate is the whole verification.

**Termination.** Hard cap of **two** rounds. A boundary violation that survives
two targeted fixes is a design problem, not a coding slip: stop, report the
surviving findings, and say it needs `devdigest-implementation-planner`, not a
third loop. Also stop early if a round fixes nothing or the finding count grows.

## ④ Plan verification — conditional, and last

**Run it last, after ③ converges.** Running it earlier means auditing code the
fix rounds are about to change; you would just pay for it twice.

**Run it when any of these hold:**

- the plan has **≥ 6 steps** — conformance accuracy is what collapses on long
  plans, and that is exactly the failure this agent exists to catch
- **a spec was supplied** — then it is *mandatory*. It is now the only thing in
  this pipeline that audits `AC-n` / `NFR-n`, extracted from the spec file
  itself. The implementer never read the spec and cannot report on it.
- the Change Report shows any `partial`, `blocked`, or a non-empty `Deviations`
- a fix round ran (③ moved code the plan did not name)

**Skip it otherwise, and say you skipped it and why.** On a short plan with a
clean Change Report you would be paying a fresh context to re-derive the
`plan compliance` table the implementer already gave you.

Give it the plan **path**, the commit range, and the **Change Report** — it
cross-checks claimed gate exits against evidence and `claimed, not evidenced` is
a valid verdict cell.

## Output

```markdown
## Verdict
<SHIPPED | BLOCKED: <what> | NEEDS RE-PLAN: <what>>

## Phases run
| phase | agent | outcome |
<one row each; a skipped phase is a row with the reason, not an omission>

## Gates
| command | exit |
<real exit codes, from the Change Report and from your own re-checks>

## Architecture
| # | finding | severity | round fixed | evidence |
<surviving criticals first; grandfathered and advisory listed, not fixed>

## Plan conformance
<the plan-verifier verdict line, or "skipped — <reason>">

## Not verified here
- tests for new behaviour (test-writer not in this pipeline)
- security review — `./scripts/pr-self-review.sh` is the gate, and it fires on push
- documentation — run `devdigest-doc-writer` manually
- <any gate that could not run, and why>

## Insight candidates
- `<module>/INSIGHTS.md` — <gotcha worth recording>
<not written here; the engineering-insights skill appends at end of session>
```

## What skipping tests actually costs

State this in the report, do not bury it:

- The gates run the **existing** suite, so regressions in existing behaviour are
  still caught. **New behaviour ships unverified** — that is the whole trade.
- `reviewer-core/` is the exception: its coverage ratchet fails on a drop, so new
  code there needs tests regardless of this pipeline (flagged in preflight).
- Backfill later with `devdigest-test-writer` against the Change Report and the
  diff — it accepts landed code, not only a plan.

## Cost discipline

- **One implementer per round, never a fan-out.** Sequential-by-data-dependency
  is not the same as needs-its-own-agent.
- **Never paste a diff into a reviewer's prompt.** Name the commit range. The
  re-derivation is the check.
- **Do not delegate a search and then redo it inline.** One pass, not both.
- Every subagent is a fresh context window with its own preload before it reads a
  line. A phase you can settle with `depcruise` is a phase you do not spawn.
