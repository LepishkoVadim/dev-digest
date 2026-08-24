# Spec: Eval Pipeline (L06) — grounded scoring, mentor-parity dashboard, two-run compare, agent + skill owners

Spec ID:    SPEC-2026-08-24-eval-pipeline
Status:     approved
Supersedes: none
Modules:    server · client
Plan:       specs/2026-08-24-eval-pipeline.plan.md
PR:         none

## Problem and user

An agent author edits a reviewer's system prompt and has no falsifiable way to
know whether the change made the agent *better* or *worse*. Today the eval
schema (`eval_cases`, `eval_runs`) and the contract shells (`EvalCase`,
`EvalRun`, `EvalDashboard` in `@devdigest/shared`) exist, but nothing runs a
case, scores it, persists metrics, or shows them. The author is flying blind:
they ship a prompt, eyeball a few PRs, and hope. This spec defines the
owner-scoped eval loop — an owner is an **agent or a skill** — build a labelled
case set, run the real reviewer over it, score recall / precision /
citation-accuracy deterministically (no LLM in scoring), version each run against
the owner's config snapshot, and compare two runs so a prompt change's (or a
skill's) effect is *measured*, not guessed. The user is the agent/skill author
working in the studio.

## Goals / Non-goals

Goals:
- A labelled case set of ≥ 8 cases per **owner** (agent or skill), each case
  tagged with an explicit expectation type (`must_find` or `must_not_flag`).
- **Owner-scoped evals for both `owner_kind` values** — an Evals tab on the Agent
  editor *and* the Skill editor, each showing owner metrics, case rows, and a
  link to the owner's dashboard.
- Case authorship two ways: **one-click from a `FindingCard`** (accepted →
  initial `must_find` badge, dismissed → initial `must_not_flag` badge, neither →
  unset) *and* **manual "+ New eval case"** hand-authoring (diff + expected JSON).
  The finding's state only seeds the *initial* badge; the author can **flip** it
  in the editor before saving.
- A run route that executes the *real* reviewer (`reviewPullRequest`) once per
  case and persists metrics per run.
- **Skill A/B delta:** running a skill's eval executes each case **twice — with
  the skill linked and without it** — so the metric delta shows the skill's
  marginal effect. Agent evals vary system prompt / model / version instead (no
  with/without).
- Deterministic, **zero-LLM** scoring: recall, precision, citation-accuracy,
  with defined behaviour for `must_not_flag` cases and zero-finding cases. The
  UI states the rationale verbatim: "Scoring is mechanical — a finding counts
  when file matches and line ranges overlap. No model call in the score."
- **First-class run versioning:** each run records the owner's version at run
  time (agent config snapshot / skill content version); the run-history table
  shows a Version column and the version increments when the owner's config
  changes.
- Two-run Compare: metric deltas (recall/precision/citation + cost) + a
  **system-prompt diff** for an agent owner or a **skill-content diff** for a
  skill owner, sourced from the two runs' version snapshots.
- A per-owner `/eval/:ownerId` **mentor-parity dashboard**: three metric cards
  (recall / precision / citation) each with value, signed delta, and a
  **sparkline**; a **"Metric trend" multi-line chart**; a **run-history table**
  (Ran at | Version | Recall | Precision | Citation | Pass | Cost) with a
  per-row checkbox; and a **"Compare selected"** action enabled only for exactly
  two runs of the same owner.
- A fixture-based `pnpm verify:l06` (zero network, zero LLM) that proves scoring
  is correct and LLM-free for **both owner kinds**, runnable from `server/`.

Non-goals (load-bearing — these stop scope creep):
- **No prompt mutation / promote / rollback.** "Promote" (a run's version) is
  design-only, for both agent and skill owners.
- **No cross-agent aggregation, no "Run all agents", no 30-day range filter, no
  amber alert banner.** All design-only (see *Deferred*).
- Scoring correctness under a *real* prompt change is a **manual experiment**
  (the prompt-sensitivity screenshot: recall swings 100% → 40% → back as the
  prompt is edited between runs), not something `verify:l06` asserts (AC-18 /
  AC-19 split).
- No CI/Compose/Conformance changes (those contracts already exist in
  `eval-ci.ts` and are untouched here).

## User stories

- As an owner author, I want to turn an accepted or dismissed finding into a
  labelled eval case in one click — and hand-author cases from scratch — so that
  building a case set is a byproduct of reviewing rather than separate data-entry.
- As an owner author, I want to flip a case's expectation type in the editor
  before saving, so that a finding I accepted can still become a NEGATIVE case
  when that is what I mean to assert.
- As an owner author, I want to run my whole case set and see recall / precision /
  citation-accuracy, so that "is this agent/skill any good" has a number.
- As a skill author, I want each eval to run with and without my skill linked, so
  that I can see the skill's marginal effect on the metrics rather than the
  agent's baseline.
- As an owner author, I want a per-owner dashboard with metric cards, sparklines,
  a metric-trend chart, and a versioned run history, so that I can see how a
  metric moved across runs at a glance.
- As an owner author, I want to compare two runs side by side with metric deltas
  and a prompt/skill-content diff, so that I can see whether an edit moved the
  metrics and in which direction.
- As a course grader, I want `pnpm verify:l06` to pass deterministically, so
  that L06 completion is checkable without a network or an LLM key.

## What already exists (ground truth — do not re-derive)

| Thing | Where | Note |
|-------|-------|------|
| `eval_cases` table | `server/src/db/schema/eval.ts:7` | has `inputDiff`, `inputFiles`, `inputMeta` (jsonb), `expectedOutput` (jsonb), `ownerKind` enum `skill\|agent` (**both in scope**), `ownerId`; **no** `expectation_kind` column |
| `eval_runs` table | `server/src/db/schema/eval.ts:22` | has `caseId`, `actualOutput` (jsonb), `pass`, `recall`, `precision`, `citationAccuracy`, `durationMs`, `costUsd`; **no** `version` column — added by this spec (see Version decision) |
| `agent_versions` table | `server/src/db/schema/agents.ts:41` | PK `(agentId, version)`, `configJson` (jsonb) = the config snapshot incl. `system_prompt`; the agent-owner version source |
| `skill_versions` table | `server/src/db/schema/skills.ts:27` | PK `(skillId, version)`, `body` (text) = the skill content at that version; the skill-owner version + skill-content-diff source (`skills.version` is the current version, `skills.ts:18`) |
| `EvalCase` contract | `server/src/vendor/shared/contracts/knowledge.ts:73` | persisted shape; **no** `expectation_kind` field |
| `EvalCaseInput` contract | `server/src/vendor/shared/contracts/eval-ci.ts:20` | create/update payload; **no** `expectation_kind` field |
| `EvalRun` (metrics) contract | `server/src/vendor/shared/contracts/knowledge.ts:58` | `recall`/`precision`/`citation_accuracy` each `min(0).max(1)`, plus `traces_passed`/`traces_total`/`per_trace` |
| `EvalRunRecord`, `EvalRunResult`, `EvalDashboard`, `EvalTrendPoint` | `server/src/vendor/shared/contracts/eval-ci.ts:33-89` | API record + dashboard aggregate already declared; dashboard carries `trend`, `alert`, `delta` fields (design-only here) |
| `Finding` shape | `server/src/vendor/shared/contracts/findings.ts:47` | `file`, `start_line`, `end_line` (the match keys) |
| `reviewPullRequest` engine entry | `reviewer-core/src/review/run.ts:127` | real review; performs the LLM call + grounding gate |
| grounding gate | `reviewer-core/src/grounding.ts:56` (`groundFindings`) | drops ungrounded diff-findings; survivors vs total is the citation signal |
| prompt-injection guard | `reviewer-core/src/prompt.ts:16` (`INJECTION_GUARD`) | delimiter-wraps untrusted diff/spec blocks; reused unchanged by the run route |
| `AgentVersionConfig.system_prompt` | `server/src/vendor/shared/contracts/knowledge.ts:219` | source of the prompt text for the agent-owner Compare diff; snapshotted per `agent_versions.configJson` row |
| `EvalDashboard` (trend/delta/alert) | `server/src/vendor/shared/contracts/eval-ci.ts:68` | already declares `delta` (recall/precision/citation), `trend: EvalTrendPoint[]`, `recent_runs`, `alert` — the sparkline/metric-trend/deltas render from this existing shape; `alert` stays unrendered |
| `EvalRunRecord` | `server/src/vendor/shared/contracts/eval-ci.ts:33` | persisted run row returned by the API; **no `version` field yet** — this spec adds it |
| nav "Eval Dashboard" item | `client/src/vendor/ui/nav.ts:36` | href is `/evals` (owner-agnostic) — reconciled to `/eval/:ownerId` (see path-reconciliation note) |
| eval i18n bundle | `client/messages/en/eval.json` | reuse for all eval strings |

## Acceptance criteria (EARS)

AC-1. The system shall persist, per eval case, an `expectation_kind` of exactly
      one of `must_find` or `must_not_flag`, stored in `eval_cases.input_meta`,
      for both `owner_kind = agent` and `owner_kind = skill`.

AC-2. WHEN an author opens the case editor to save a new case, the system shall
      require an `expectation_kind` and shall reject the save with a `422` while
      the field is unset.

AC-3. WHEN an owner's case set is saved, the system shall allow ≥ 8 cases per
      owner spanning both expectation types, and the case editor shall not cap
      the count below 8.

AC-4. WHEN a finding on a `FindingCard` is accepted and its "create eval case"
      action is invoked, the system shall open the case editor with the **initial**
      badge set to `expectation_kind = must_find` (blue "POSITIVE CASE · MUST
      find …"), the finding's file/lines as `expected_output`, and the owner
      resolved via `finding.review_id → run → agent`.

AC-5. WHEN a finding on a `FindingCard` is dismissed and its "create eval case"
      action is invoked, the system shall open the case editor with the
      **initial** badge set to `expectation_kind = must_not_flag` (amber
      "NEGATIVE CASE · MUST NOT flag").

AC-6. WHEN a finding on a `FindingCard` is neither accepted nor dismissed and
      its "create eval case" action is invoked, the system shall open the case
      editor with `expectation_kind` unset and shall block save until the author
      picks one (per AC-2).

AC-7. WHILE the case editor is open, the system shall let the author flip the
      `expectation_kind` between `must_find` and `must_not_flag` before saving;
      the finding-seeded value sets only the initial badge and shall not be
      re-derived from the finding's accept/dismiss state on save — the saved
      `expectation_kind` is the value shown in the editor at save time.

AC-8. WHEN an author invokes "+ New eval case" (manual authorship, no source
      finding), the system shall open the case editor with an empty diff, an
      empty `expected_output`, and `expectation_kind` unset, and shall persist the
      case via `POST /evals/cases` carrying `owner_kind`/`owner_id` on save
      (subject to AC-2, AC-16).

AC-9. WHEN `POST /agents/:id/eval-runs` or `POST /skills/:id/eval-runs` is called,
      the system shall run `reviewPullRequest` once per case in the owner's case
      set using each case's fixed `input_diff`/`input_files`, and shall persist
      one `eval_runs` row per case with `actual_output`, `recall`, `precision`,
      `citation_accuracy`, `duration_ms`, `cost_usd`, and `pass`.

AC-10. WHEN `POST /skills/:id/eval-runs` is called, the system shall execute each
       case **twice** — once with the skill linked into the review and once
       without it — and shall record both metric sets so the row can show the
       "With skill X% / Without skill Y%" pair and the skill's marginal delta.

AC-11. WHEN `POST /agents/:id/eval-runs` is called, the system shall NOT run the
       with/without variant of AC-10; an agent run varies system prompt / model /
       version only and records a single metric set per case.

AC-12. WHEN a run completes, the system shall record the owner's version at run
       time on each `eval_runs` row via a nullable `version` reference column,
       pointing at the `agent_versions.version` (for an agent owner) or the
       `skill_versions.version` (for a skill owner) in force at run time — not a
       copied config blob.

AC-13. WHEN the owner's config changes between runs (an agent's system prompt /
       model / linked skills, or a skill's content), the system shall record a
       higher `version` on the next run, so the run-history Version column
       increments (e.g. v18 → v19 → v20).

AC-14. The scoring computation shall perform zero LLM calls and zero network I/O;
       it consumes only the case's `expected_output`, the case's
       `expectation_kind`, and the run's `actual_output`.

AC-15. WHEN the `/eval/:ownerId` dashboard is opened, the system shall render, for
       that single owner: three metric cards (recall / precision / citation
       accuracy) each with a value, a signed delta, and a sparkline; a
       "Metric trend" multi-line chart (recall/precision/citation over runs); and
       a run-history table with columns Ran at | Version | Recall | Precision |
       Citation | Pass | Cost, one selectable checkbox per row.

AC-16. WHEN a save is attempted and the case's `expected_output` fails the
       `ExpectedFinding[]` schema, THEN the system shall reject the save with a
       `422` and the validation error, and shall not persist the case.

AC-17. WHEN two runs of the **same owner** are selected, the system shall render
       per-metric deltas (recall, precision, citation_accuracy, and cost) and a
       diff of the two runs' versioned config: for an agent owner the
       `system_prompt` text diff (from `AgentVersionConfig.system_prompt` at each
       run's `version`), for a skill owner the skill-content diff (from
       `skill_versions.body` at each run's `version`).

AC-18. WHEN `pnpm verify:l06` is run from `server/`, the system shall exit `0`
       (green) if and only if: (i) scoring made zero LLM calls, (ii) recall,
       precision, and citation_accuracy match expected values on fixed
       `actual_output` fixtures for **both an agent-owner and a skill-owner
       fixture**, and (iii) a deliberately-worse fixture (one extra false-positive
       finding on a `must_not_flag` case) yields a lower precision than the
       baseline fixture.

AC-19. WHERE an author runs the manual prompt-change experiment, the system shall
       let two runs — one before and one after a real system-prompt edit — show
       different recall/precision in the Compare view; this AC is verified by a
       Compare screenshot, NOT by `verify:l06`.

AC-20. IF a run route request targets an owner with zero eval cases, THEN the
       system shall return `422` with a message naming the empty case set and
       shall not create an `eval_runs` row.

AC-21. IF `reviewPullRequest` throws for an individual case during a run, THEN
       the system shall persist that case's row with `pass = false`, a null
       metric set, the provider error recorded verbatim in `actual_output`, and
       shall continue running the remaining cases (partial failure is not total
       failure).

AC-22. WHEN runs are selected for compare, the system shall enable the "Compare
       selected" action only for exactly two runs of the same owner and shall
       disable it for any other selection count or a cross-owner pair.

AC-23. WHILE a run is in progress, the system shall show the in-progress run in
       the run-history table and shall read the metric cards from the last
       completed run, not the running one.

AC-24. IF a run's recorded config diff (system prompt or skill body) is longer
       than the diff viewport, THEN the system shall scroll the diff and shall not
       truncate any changed line.

AC-25. WHEN the "Eval Dashboard" nav item (`nav.ts:36`, href `/evals`) is
       activated, the system shall resolve a concrete owner and land on
       `/eval/:ownerId` — via a last-viewed/default owner or an owner picker — and
       shall never render a dashboard with no owner selected.

## Edge cases

- Empty case set → `422` on run (AC-20); dashboard shows the empty state, no
  metric cards.
- `expectation_kind` unset on save → `422` (AC-2, AC-6).
- Author flips a finding-seeded `must_find` to `must_not_flag` (or vice versa) →
  the saved kind is the editor's kind, not the finding's accept/dismiss state
  (AC-7).
- Manual case with no source finding → editor opens empty, unset kind, save
  gated by AC-2/AC-16 (AC-8).
- `expected_output` malformed → `422` with schema error (AC-16).
- `must_not_flag` case → recall is undefined for that case and excluded from the
  recall average; the case contributes only to precision (see scoring).
- Case with zero expected findings *and* zero actual findings →
  `citation_accuracy = 1.0` (no findings to ground = perfect, not divide-by-zero).
- One case throws mid-run → that row is `pass=false`/null-metrics, run continues
  (AC-21); dashboard run-history row shows the partial state.
- **Skill owner with no single runnable agent** → the with/without-skill pair
  needs a concrete agent to execute the review through. Resolution (decided): use
  the skill's linked agent automatically; if **zero** agents are linked, or
  **multiple** are linked with no default, return `422` naming the ambiguity and
  asking the author to designate one — never run a headless review. No explicit
  agent-picker UI is built for L06 (the single-linked-agent case is the norm).
- **Version bump semantics** → a run against an unchanged owner config records the
  *same* `version` as the previous run (no phantom bump); the Version column only
  increments when the underlying agent/skill config actually changes (AC-13).
- **Empty run history** → dashboard shows the empty-state history table, no
  sparklines (nothing to plot), no metric-trend chart; metric cards read as
  "no runs yet", not `0%`.
- Compare selection ≠ 2 runs, or two runs from different owners (cross-owner
  pair) → "Compare selected" disabled (AC-22).
- Skill compare where the two runs share the same skill `version` → the
  skill-content diff is empty; compare still renders the metric/with-without
  deltas (AC-17).
- Very long system-prompt / skill-body diff → diff view scrolls; no truncation of
  a changed line (AC-24).
- Run in progress → run-history table shows the in-progress run; metric cards
  read the last *completed* run, not the running one (AC-23).

## Design review

| # | Screen / flow | What is missing | Consequence | Proposal | Severity |
|---|---------------|-----------------|-------------|----------|----------|
| 1 | `/eval/:ownerId` dashboard | No empty state (owner with 0 cases / 0 runs) | Blank cards read as "0% recall", a false signal | Explicit empty state: "No cases yet — add one from a review"; no sparklines/trend when history empty | major (resolved, AC-15/edge) |
| 2 | `/eval/:ownerId` dashboard | No loading / error / run-in-progress states shown | User cannot tell a stuck run from a clean one | Skeleton on load; error banner on run failure; in-progress row in history table (AC-23) | major (resolved) |
| 3 | `FindingCard` "create eval case" | Button state when finding is neither accepted nor dismissed was undefined | Ambiguous label → wrong `expectation_kind` silently saved | Button always present; neither state opens editor with type UNSET, save blocked until picked (AC-6) | major (resolved) |
| 4 | Compare (2 runs) | Selection contract (how many runs, same owner) unspecified | Cross-owner or 1-run compare renders nonsense | Exactly 2 runs, same owner, else disabled (AC-22) | major (resolved) |
| 5 | Partial run failure | Design shows only the happy metric cards | One bad case would blank the whole run | Per-case failure isolation (AC-21); history row surfaces it | major (resolved) |
| 6 | POSITIVE / NEGATIVE badge | Where the badge reads its value was implicit; is it derived or authored | Badge could drift from stored truth, or lock to the finding's state | Badge reads authored `expectation_kind` from `input_meta` (AC-1); finding seeds initial only, author flips (AC-7) | major (resolved) |
| 7 | `expected_output` editor | No client-side JSON validation shown | Malformed JSON reaches the server as opaque `422` | Validate against `ExpectedFinding[]` before POST; "+ Finding skeleton" helper; "✓ valid JSON" indicator (AC-16) | minor |
| 8 | Skill Evals tab (Skill editor: Config \| Preview \| Stats \| Versions \| Context \| **Evals**) | Design shows the row but not what a skill run means | Author cannot tell a skill run from an agent run | Skill run = with/without-skill pair; rows show "With skill X% / Without skill Y%" (AC-10) | major (resolved) |
| 9 | Skill owner with no single runnable agent | The with/without pair needs a concrete agent; source unspecified | Skill run has nothing to execute against | Use the skill's linked agent; `422` if zero linked or multiple with no default — no picker UI (edge case) | major (resolved) |
| 10 | Nav "Eval Dashboard" → dashboard | `nav.ts:36` href is `/evals`; reference impl route is `/eval/:ownerId` | Nav lands on a route the dashboard does not serve, or an owner-less blank | Nav resolves last/default owner or an owner picker → `/eval/:ownerId` (AC-25) | major (resolved) |
| 11 | Run history Version column | Where the version value comes from was undefined | Column reads a copied blob that drifts from the real snapshot | `eval_runs.version` references `agent_versions`/`skill_versions` (AC-12/13) | major (resolved) |
| 12 | Metric cards + trend chart | Sparkline/trend data source and empty behaviour unspecified | Sparkline of one point, or a divide-by-zero delta | Render from `EvalDashboard.trend`/`delta` (`eval-ci.ts:68`); empty history → no plot (edge case) | minor |

No standalone design doc was supplied beyond the mentor demo video and the
screenshots referenced in the brief; gaps above are derived from those and the
existing `client/src` studio surfaces.

## Module contracts

| From | To | Channel | New or existing |
|------|----|---------|-----------------|
| client Agent-editor Evals tab | server | `GET /agents/:id/eval-runs` (list `EvalRunRecord[]`) | new route, existing contract |
| client Agent-editor Evals tab | server | `POST /agents/:id/eval-runs` (run all cases → `EvalRunResult[]`) | new route, existing contract |
| client Skill-editor Evals tab | server | `GET /skills/:id/eval-runs` (list `EvalRunRecord[]`) | new route, existing contract |
| client Skill-editor Evals tab | server | `POST /skills/:id/eval-runs` (run all cases, with/without skill → `EvalRunResult[]`) | new route, existing contract |
| client case editor | server | `POST /evals/cases` (create; body `EvalCaseInput` incl. `owner_kind`/`owner_id`; manual or finding-seeded) | new route, existing contract (`eval-ci.ts:20` already owner-scoped) |
| client case editor | server | `GET /evals/cases?owner_kind=&owner_id=` (list `EvalCase[]`) | new route, existing contract |
| client case editor | server | `PUT /evals/cases/:id` (update; body `EvalCaseInput`) | new route, existing contract |
| client case editor | server | `DELETE /evals/cases/:id` | new route |
| client dashboard | server | `GET /eval/:ownerId` (per-owner `EvalDashboard`: cards+delta, trend, recent_runs) | new route, existing contract (`eval-ci.ts:68`) |
| server evals module | reviewer-core | `reviewPullRequest(input)` per case (`reviewer-core/src/review/run.ts:127`); called twice for a skill owner (with/without linked skill) | existing function |
| server evals module | `@devdigest/shared` | `EvalCaseInput`/`EvalCase` gain `expectation_kind: 'must_find' \| 'must_not_flag'` (stored in `input_meta`); new `ExpectedFinding` (`{ file, start_line, end_line }`) + `ExpectedFinding[]` validator; `EvalRunRecord` (`eval-ci.ts:33`) gains a nullable `version: number` field | amended + new contract |
| server evals module | `agent_versions` | read `AgentVersionConfig.system_prompt` (`knowledge.ts:219`) at the run's `version` for the agent-owner Compare diff | existing |
| server evals module | `skill_versions` | read `skill_versions.body` (`skills.ts:34`) at the run's `version` for the skill-owner content diff | existing |
| server evals module | `eval_runs` | new nullable `version` (int) column recording the owner version at run time (see Version decision) | new migration |

**Route-shape decision:** the four run routes are **two thin owner-parameterized
routes** (`/agents/:id/eval-runs`, `/skills/:id/eval-runs`) both delegating to
**one shared evals service** in `server/src/modules/evals/` — not a single
generic `/evals/:ownerKind/:ownerId/runs`. Two named routes read cleaner at the
call site and keep the with/without-skill branch in the service, not the router.

**Path reconciliation (nav vs reference impl):** the nav "Eval Dashboard" item
(`client/src/vendor/ui/nav.ts:36`) is href `/evals` (owner-agnostic) while the
dashboard route is `/eval/:ownerId` (singular, one owner). The nav entry MUST
resolve a concrete owner — a last-viewed/default owner or an owner-picker
landing — and redirect to `/eval/:ownerId` (AC-25). Breadcrumb on the dashboard:
"Skills Lab › Eval Dashboard › <owner name>". Whether the nav href is changed to
a resolver route or kept as `/evals` with a redirect is a client-routing detail
for the planner; the contract is: nav → concrete `/eval/:ownerId`, never blank.

**Shared-contracts note:** `expectation_kind`, `ExpectedFinding`, the
`ExpectedFinding[]` validator, and the `EvalRunRecord.version` field are edited at
source in `server/src/vendor/shared/contracts/{knowledge.ts,eval-ci.ts}`, then
`./scripts/sync-shared.sh` MUST be run to mirror into `client/src/vendor/shared`;
`contracts-sync.yml` fails the PR if they drift.

**Storage decision (Q1) — FINAL:** `expectation_kind` lives in
`eval_cases.input_meta` (jsonb), not a dedicated column. Rationale: the metrics
already derive the must_find/must_not_flag distinction from `expected_output`
shape, so `expectation_kind` only drives the editor badge and case-list label —
no SQL filtering by type is required. Keeping it in `input_meta` avoids a second
`eval_cases` migration (the only migration this feature adds is
`eval_runs.version`). If a future dashboard needs to filter by type in SQL,
promote it to a column then.

**Version decision (Q2):** now that run versioning is first-class, the owner
version is recorded on a **new nullable `version` (int) reference column** on
`eval_runs` (new migration), referencing `agent_versions.version` /
`skill_versions.version` for the run's owner. This replaces the phase-1
`actual_output.agent_version` stash: the Version column and the Compare diff read
from the real version snapshot (`agent_versions.configJson` /
`skill_versions.body`), not a copied blob. Nullable so pre-existing rows parse.

```mermaid
sequenceDiagram
  participant Web as client Evals tab / dashboard
  participant API as server evals module
  participant Core as reviewer-core
  participant DB as Postgres
  Web->>API: POST /skills/:id/eval-runs (or /agents/:id/eval-runs)
  API->>DB: load eval_cases (owner, >=1) + owner version (agent_versions/skill_versions)
  loop each case
    API->>Core: reviewPullRequest(fixed input_diff) [with linked skill]
    Core-->>API: findings + grounding survivors
    opt owner_kind = skill
      API->>Core: reviewPullRequest(fixed input_diff) [without skill]
      Core-->>API: baseline findings
    end
    API->>API: score (zero LLM): recall/precision/citation_accuracy (+ with/without delta)
    API->>DB: insert eval_runs row (metrics, version ref)
  end
  API-->>Web: EvalRunResult[]
  Web->>API: GET /eval/:ownerId
  API->>DB: read run history + version snapshots (agent_versions.configJson / skill_versions.body)
  API-->>Web: EvalDashboard (cards+delta, trend, recent_runs; compare source)
```

## Scoring algorithm spec

Inputs per case: `expected_output` (an `ExpectedFinding[]`), `expectation_kind`,
and the run's actual findings (from `reviewPullRequest`, after the grounding
gate). For a **skill owner**, each case yields two findings sets — *with* the
skill linked and *without* — and the two are scored independently to produce the
"With skill / Without skill" pair (AC-10); the with/without *metric delta* is
their difference. The match rule and all set metrics below apply identically to
each set.

**User-facing rationale (verbatim, from the reference UI):** "Scoring is
mechanical — a finding counts when file matches and line ranges overlap. No model
call in the score."

**Match rule (default):** an actual finding *matches* an expected finding when
`file` is equal AND the `[start_line, end_line]` ranges overlap (inclusive).

**Set metrics are micro-averaged** across the agent's cases (pool all expected
and all actual findings across cases, then compute one ratio each — not a mean of
per-case ratios).

- **recall** = (matched expected findings) / (total expected findings), pooled
  over `must_find` cases only. `must_not_flag` cases have no expected findings →
  they are **excluded from recall** (recall undefined for them).
- **precision** = (matched actual findings) / (total actual findings), pooled
  over **all** cases. On a `must_not_flag` case, every actual finding is
  unmatched (there is nothing to match) → each one lowers precision. This is how
  `must_not_flag` exercises precision.
- **citation_accuracy** = (grounding survivors) / (total findings the model
  proposed), i.e. the fraction that passed `groundFindings`
  (`reviewer-core/src/grounding.ts:56`). WHEN a case produced **zero** findings,
  citation_accuracy for that case is `1.0` (nothing ungrounded).

Edge rules:
- Zero expected findings and zero actual findings on a case → contributes 0 to
  both recall numerator/denominator (it is a `must_not_flag` case, excluded from
  recall) and precision numerator/denominator; citation_accuracy = 1.0.
- A run with zero `must_find` cases → recall denominator is 0 → recall reported
  as `1.0` for the pooled run (vacuously complete — no expected findings to miss).
  FINAL: `1.0`, not `0.0`/`N/A`, so a pure `must_not_flag` set that the agent
  passes reads as green rather than a misleading 0% recall.

**Worked example** (two cases):

- Case A (`must_find`): expected `[{a.ts, 10-12}]`. Actual (grounded):
  `[{a.ts, 11-11}]` → overlap → matched.
- Case B (`must_not_flag`): expected `[]`. Baseline actual (grounded): `[]`.

Pooled baseline: recall = 1/1 = **1.0**; precision = 1/1 = **1.0** (Case A's
single actual finding matched; Case B contributed no actual findings);
citation_accuracy: Case A 1/1, Case B 1.0 (zero findings) → survivors 1 / total
1 = **1.0**.

Deliberately-worse fixture: add one false-positive actual finding
`[{b.ts, 5-5}]` to Case B. Now precision = 1 matched / 2 actual = **0.5** —
strictly lower than baseline `1.0`. This is the drop `verify:l06` asserts
(AC-18.iii), over **both an agent-owner and a skill-owner fixture** (AC-18.ii).

## Non-functional requirements

| # | Requirement | Target | How it is verified |
|---|-------------|--------|--------------------|
| NFR-1 | Scoring is LLM-free | 0 LLM calls, 0 network calls during scoring | `verify:l06` runs scoring against fixed fixtures with the LLM adapter replaced by a mock that fails if called; assertion (i) of AC-18 |
| NFR-2 | `pnpm verify:l06` is deterministic and offline | Same exit code and metric values on repeat runs with no network, for both owner kinds | run `pnpm verify:l06` twice offline; both exit `0` with identical printed metrics for the agent-owner and skill-owner fixtures |
| NFR-3 | Case set size | ≥ 8 cases per owner supported, spanning both expectation types | `verify:l06` seeds ≥ 8 cases across both types and scores them |
| NFR-4 | Run isolation | one failing case does not fail the run | inject a throwing case; assert remaining rows persisted and run returns (AC-21) |
| NFR-5 | Metric bounds | every persisted `recall`/`precision`/`citation_accuracy` ∈ [0,1] | `EvalRun` contract `min(0).max(1)` (`knowledge.ts:58`) rejects out-of-range at serialization |
| NFR-6 | Compare selection guard | compare action enabled only for exactly 2 same-owner runs | UI test: 1-run, 3-run, and cross-owner selections leave the action disabled (AC-22) |
| NFR-7 | Skill with/without pair | a skill run records exactly two metric sets per case (with skill, without skill) | `verify:l06` skill fixture asserts both sets present and that the with/without delta equals their difference (AC-10) |
| NFR-8 | Run versioning | every run carries a `version` referencing the owner's config at run time; an unchanged config records the same version, a changed config a higher one | `verify:l06` (or a DB-backed `.it.test.ts`) runs twice with an unchanged then a changed owner config and asserts the `version` stays then increments (AC-12/13) |

## Inputs and provenance

- `expectation_kind` — author-controlled, chosen in the case editor; trusted as a
  label but constrained to the two-value enum by the contract.
- `input_diff` / `input_files` — PR-derived, seeded from a real finding's PR or
  hand-edited by the author. **Untrusted** (see below).
- `expected_output` — author-editable JSON, validated against `ExpectedFinding[]`.
  **Untrusted** shape-wise (schema-gated), trusted as a label once valid.
- `actual_output` — produced by `reviewPullRequest` (LLM output through the
  grounding gate). **Untrusted** LLM output; only its grounded, structured
  findings feed scoring.
- `system_prompt` / `skill body` for the Compare diff — read server-side from
  `AgentVersionConfig.system_prompt` (`knowledge.ts:219`) or `skill_versions.body`
  (`skills.ts:34`) at the run's `version`; server-controlled snapshot, trusted.
- owner `version` — server-assigned int referencing `agent_versions` /
  `skill_versions`; trusted.
- `owner_kind` / `owner_id` — route-scoped and workspace-scoped server-side;
  trusted as identity but a run/case MUST be authorized to the owner's workspace
  (`eval_cases.workspaceId`, `eval.ts:9`) before it is run or listed (OWASP A01,
  no cross-owner/cross-workspace read via a guessed `owner_id`).

## Untrusted inputs

Not `none` — this feature feeds PR-derived diffs into an LLM.

- **Case `input_diff` / `input_files`** are PR-derived and author-editable →
  when a run feeds them into `reviewPullRequest`, they pass through the existing
  prompt-injection guard (`reviewer-core/src/prompt.ts:16`,
  delimiter-wrapping + guard rule). No new injection path is created; the run
  route MUST route diffs through the same engine entry, not a bypass. (OWASP A05
  / Agentic ASI01 goal-hijacking.)
- **`expected_output`** is author-supplied JSON → validated by the
  `ExpectedFinding[]` Zod schema on save (`422` on failure, AC-16); this blocks
  malformed or oversized payloads from being persisted (OWASP A08 mass-assignment
  / A03 integrity). Only `file`/`start_line`/`end_line` are read; no other keys
  are trusted.
- **`actual_output`** is LLM output → only its grounded findings (survivors of
  `groundFindings`) are used for scoring; ungrounded/hallucinated citations are
  already dropped by the mandatory gate before they can inflate recall.
- **Fake secrets inside `must_find` cases are expected test data, not leaks.** A
  case whose diff deliberately contains a planted secret (to assert the agent
  flags it) is legitimate; the secret-scan lens MUST NOT treat seeded eval-case
  fixtures as a real secret leak. These fixtures live in the eval case set / L06
  verify fixtures, not in application config, and never in git secrets.

## Deferred / design-only (out of scope for L06)

- **Promote** — no prompt/skill mutation, rollback, or version-activation flow,
  for either owner kind. The Compare "Promote" button is design-only.
- **Cross-agent (cross-owner) aggregation** and an all-owners grid —
  `/eval/:ownerId` is single-owner; nav resolves a concrete owner (AC-25).
- **"Run all agents"** button.
- **30-day range filter**.
- **Amber alert banner** — `EvalDashboard.alert` (`eval-ci.ts:87`) stays in the
  contract, unrendered.

Now **in scope** (moved out of Deferred): skill-scoped evals (`owner_kind =
skill`), sparklines, the metric-trend chart, and first-class run versioning.

## Open questions

None — all resolved (decisions recorded inline):

- **`expectation_kind` storage** → `eval_cases.input_meta` jsonb, no dedicated
  column (see *Module contracts* → Storage decision Q1).
- **Pooled recall with zero `must_find` cases** → `1.0`, vacuously complete
  (see *Scoring* → Edge rules).
- **Agent for a skill owner's with/without run** → the skill's linked agent;
  `422` if zero linked or multiple with no default; no picker UI in L06
  (see *Edge cases* + Design review row 9).
