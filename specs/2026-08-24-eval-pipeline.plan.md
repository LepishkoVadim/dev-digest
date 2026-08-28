# Implementation Plan: Eval Pipeline (L06)

Spec: `specs/2026-08-24-eval-pipeline.md` · Spec ID `SPEC-2026-08-24-eval-pipeline` · status approved · 25 ACs, 8 NFRs.

## 1. Requirements review

All 25 ACs verified against the spec; no blocking questions (spec is decision-complete). Two storage-shape ambiguities resolved as assumptions:
- **AC-10 / NFR-7 (skill with/without storage):** `eval_runs` has one metric quad, not a with/without pair, and the only migration is `eval_runs.version`. The primary `eval_runs` row = **with-skill** metrics; the **without-skill** baseline set is stashed in that row's `actualOutput` jsonb (`{ without_skill: {recall,precision,citation_accuracy,cost_usd} }`). The "With X% / Without Y%" pair + delta derive client-side. (Mirrors the pr_brief.json jsonb-stash precedent.)
- **AC-23 (in-progress state):** no `status` column; cards read last completed run, in-flight row is client-side via the awaited POST + TanStack mutation `isPending`.
- **Skill→agent resolution (spec edge case):** use an inline Drizzle join mirroring `agentsUsingSkill` (`skills/repository.ts:200`); 0 or >1 linked agents → 422; exactly 1 → run with/without through it.

## 2. Scope / Non-goals

**In scope:** `eval_runs.version` migration; shared-contract edits (`expectation_kind`, `ExpectedFinding`+validator, `EvalRunRecord.version`); new `server/src/modules/evals/` module (routes+service+repository+scoring) with 8 routes; `verify:l06` fixture script; client — FindingCard "Turn into eval case", Evals tab on both editors, case-editor modal, `/eval/:ownerId` dashboard + nav reconciliation, two-run Compare modal; reuse of `reviewPullRequest`→`groundFindings`.

**Non-goals:** no prompt/skill mutation, promote, rollback; no cross-owner aggregation, "Run all agents", 30-day filter, alert banner; no CI/Compose/Conformance changes; AC-19 is a manual screenshot deliverable (not automated by verify); no `eval_cases` migration; no with/without or run-status columns.

## 3. Affected modules

| module | path | layer |
|---|---|---|
| shared contracts (source) | `server/src/vendor/shared/contracts/{knowledge.ts,eval-ci.ts}` | domain |
| shared contracts (mirror) | `client/src/vendor/shared/**` | domain (generated — sync-shared.sh only) |
| DB schema + migration | `server/src/db/schema/eval.ts`, `server/src/db/migrations/**` | infrastructure |
| new evals module | `server/src/modules/evals/{routes,service,repository,scoring,helpers,constants}.ts` | presentation / application / infrastructure |
| module registry | `server/src/modules/index.ts` | composition |
| verify script | `server/scripts/verify-l06.ts` + `server/package.json` | tooling (zero-LLM) |
| client dashboard route | `client/src/app/eval/[ownerId]/**` (+ nav reconcile) | presentation |
| client editors | `client/src/app/agents/[id]/_components/AgentEditor/**`, `client/src/app/skills/[id]/_components/SkillEditor/_components/EvalsTab/**` | presentation |
| client case editor + FindingCard | `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/**`, new case-editor component | presentation |
| client data layer | `client/src/lib/hooks/evals.ts` (new), `client/src/lib/api.ts` | data |
| nav | `client/src/vendor/ui/nav.ts` | presentation |

## 4. Constraints in force (from INSIGHTS + arch)

- Shared contracts: edit source then `sync-shared.sh`, never hand-mirror (contracts-sync.yml gates).
- A `.it.test.ts` with an unstubbed provider makes LIVE billed calls — inject `MockLLMProvider`; `verify:l06` uses a throw-if-called mock (NFR-1).
- Cross-module data via inline Drizzle in the owning module — do NOT import `skills/repository.ts` from `evals`.
- recharts chart files MUST carry `"use client"`.
- `@devdigest/ui` nav.ts is vendored but NOT synced — edit directly.
- Moving/renaming an App Router route → `rm -rf client/.next` before typecheck.
- next-intl keys need dev restart + hard refresh (build/CI unaffected).
- Onion: routes→service→repository; routes/service never import drizzle/db; scoring stays pure (no Container). `reviewPullRequest` called from the service, diffs through the injection guard — no bypass.
- CI gates: `contracts-sync.yml`, `reviewer-core.yml` (watches server/src/vendor/shared/**), `arch:check --ignore-known` (add zero new violations).
- Test split: DB-backed evals tests `*.it.test.ts`; scoring unit tests hermetic.

## 5. Skills the implementer MUST invoke

| scope | skill |
|---|---|
| `server/src/modules/evals/**` | `onion-architecture` |
| `server/src/modules/evals/routes.ts` | `fastify-best-practices` |
| `server/src/modules/evals/repository.ts`, schema, migrations | `drizzle-orm-patterns` |
| schema/migration | `postgresql-table-design` |
| `server/src/vendor/shared/contracts/**` + touched `.ts` | `zod` |
| touched `server/**`+`client/**` `.ts` | `typescript-expert` |
| run route, expected_output, owner authz | `security` |
| `client/src/app/**`, `nav.ts` | `frontend-ui-architecture` |
| `client/src/app/**/*.tsx` | `react-best-practices` |
| `client/src/app/eval/[ownerId]/**`, nav resolver | `next-best-practices` |
| `client/**/*.test.tsx` | `react-testing-library` |

## 6. Steps

Order is load-bearing: **contracts → sync → schema/migration → scoring → repository → service → routes → registry → verify → client data → client UI.**

### Step 1 — Amend shared contracts (source only)
- files: `server/src/vendor/shared/contracts/knowledge.ts`, `.../eval-ci.ts`; layer: domain
- change: add `ExpectedFinding = z.object({ file, start_line, end_line })` + array validator (the `expected_output` gate); add `expectation_kind: z.enum(['must_find','must_not_flag'])` (optional on `EvalCaseInput` for the 422-when-unset gate, surfaced on `EvalCase`); add `version: z.number().int().nullable()` to `EvalRunRecord`; add a `without_skill` metric-delta sub-shape per AC-10. Export schema + inferred type.
- done when: `cd server && pnpm typecheck` passes; enum, `ExpectedFinding[]`, `EvalRunRecord.version` exist — AC-1, AC-16, AC-12 (contract half).

### Step 2 — Sync shared contracts to client mirror
- files: `client/src/vendor/shared/**` (generated); change: run `./scripts/sync-shared.sh`, commit both.
- done when: `./scripts/sync-shared.sh --check` exits 0 — contracts-sync gate.

### Step 3 — Add `eval_runs.version` column + migration
- files: `server/src/db/schema/eval.ts`, generated migration; layer: infrastructure
- change: add `version: integer('version')` (nullable) to `evalRuns`; run `pnpm db:generate` (no hand-write). No FK (owner-versions are composite-PK'd `(ownerId, version)`; store the int, repo resolves).
- done when: exactly one new migration adds a nullable `version` int to `eval_runs`, no `eval_cases` change; `pnpm db:migrate` applies clean — AC-12/AC-13 (schema half), NFR-8.

### Step 4 — Pure scoring module
- files: `server/src/modules/evals/scoring.ts`; layer: application (pure — no Container/db/llm)
- change: match = `file` equal AND `[start_line,end_line]` overlap (inclusive); micro-averaged; recall over `must_find` only (`must_not_flag` excluded, `1.0` when zero must_find); precision over all cases (unmatched actuals on must_not_flag lower it); citation_accuracy = grounding survivors/total (`1.0` when zero findings). Zero LLM/network.
- done when: hermetic `scoring.test.ts` reproduces the spec's worked example (baseline 1.0/1.0/1.0; worse fixture precision 0.5) — AC-14, NFR-1.

### Step 5 — Evals repository
- files: `server/src/modules/evals/repository.ts`, `helpers.ts`; layer: infrastructure
- change: Drizzle CRUD on `eval_cases` (workspace-scoped); insert/list `eval_runs` (metrics + `version` + `actualOutput`); read `agent_versions.configJson` / `skill_versions.body` at a given `version` for Compare; resolve current owner version; inline skill→agent resolution (mirror `agentsUsingSkill`) → `{id,name}[]`; row→DTO mappers (extract `expectation_kind` from `input_meta`; map `version`, `without_skill`).
- done when: methods return DTOs (not raw rows); `arch:check` adds no new violation — AC-9/12/17 (data half), owner authz.

### Step 6 — Evals service (orchestration + run execution)
- files: `server/src/modules/evals/service.ts`, `constants.ts`; layer: application
- change: CRUD 422 gates (`expectation_kind` unset → 422; `expected_output` fails `ExpectedFinding[]` → 422); run — load owner cases (empty → 422), resolve owner version, per case `reviewPullRequest` (reuse ReviewInput assembly + `groundFindings`, cf. `run-executor.ts:240`) then `scoring.ts`; agent = single set; skill = run twice through the resolved linked agent (skills block present then absent), 422 if 0/>1 agents; per-case try/catch → `pass=false`, null metrics, error verbatim in `actual_output`, continue; persist rows with `version`.
- done when: `server/test/evals.it.test.ts` (provider = `MockLLMProvider`) drives POST run → rows persisted; empty-owner 422; throwing case isolated; skill 0/2 agents → 422; unchanged vs changed config → same then higher `version` — AC-9/10/11/12/13/20/21, NFR-4/7/8.

### Step 7 — Evals routes + dashboard read
- files: `server/src/modules/evals/routes.ts`; layer: presentation
- change: default plugin, zod `params`/`body` schema-first — `POST/GET /agents/:id/eval-runs`, `POST/GET /skills/:id/eval-runs` (thin, delegate to shared service), `GET/POST/PUT/DELETE /evals/cases` (+`?owner_kind=&owner_id=`), `GET /eval/:ownerId` → `EvalDashboard` (cards from last completed run). Workspace via `getContext`; no DB import.
- done when: registered, typecheck-clean, no `no-route-to-db` — AC-9/15/17 (transport), AC-22 read side.

### Step 8 — Register module
- files: `server/src/modules/index.ts`; change: one import + one `evals` entry.
- done when: typecheck + app boots with routes mounted.

### Step 9 — `verify:l06` fixture script
- files: `server/scripts/verify-l06.ts`, `server/package.json` (`"verify:l06": "tsx scripts/verify-l06.ts"`); layer: tooling (zero-LLM)
- change: seed ≥8 in-memory cases (both owner kinds + both expectation types) with fixed `actual_output` fixtures; call `scoring.ts` directly; assert (i) zero LLM calls (throw-if-called mock), (ii) recall/precision/citation match on fixtures for agent + skill owner, (iii) worse fixture (extra FP on must_not_flag) → strictly lower precision. Exit 0 iff all pass.
- done when: `cd server && pnpm verify:l06` exits 0 twice offline with identical metrics — AC-18, NFR-1/2/3. AC-19 NOT covered here.

### Step 10 — Client data layer
- files: `client/src/lib/hooks/evals.ts` (new), `client/src/lib/hooks/index.ts`, `client/src/lib/api.ts`; layer: data
- change: TanStack Query hooks — `useEvalCases(owner)`, case CRUD mutations, `useRunEval(owner)` (agent & skill POSTs), `useEvalDashboard(ownerId)`, run-history list. Invalidate on mutation. Optimistic in-flight run row via `isPending` (AC-23).
- done when: hooks typecheck against synced client contracts; no ad-hoc fetch in components.

### Step 11 — FindingCard "Turn into eval case" button
- files: `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/FindingCard.tsx`; layer: presentation
- change: always-present action button; seed editor — accepted (`f.accepted_at`) → `must_find`; dismissed (`f.dismissed_at`) → `must_not_flag`; neither → unset; carry `f.file/start_line/end_line` as `expected_output`; resolve owner via `finding.review_id → run → agent`. `aria-label` on the icon-button.
- done when: RTL test — accepted→POSITIVE, dismissed→NEGATIVE, neither→unset — AC-4/5/6.

### Step 12 — Case-editor modal
- files: new `client/src/app/.../_components/EvalCaseEditor/**` + `.test.tsx`; layer: presentation
- change: Diff | Files | PR-meta inputs; Expected-output JSON + "+ Finding skeleton" helper + client-side `ExpectedFinding[]` validation before POST; flippable POSITIVE/NEGATIVE badge; Run case / Run on save; "+ New eval case" opens empty/unset; block save while `expectation_kind` unset.
- done when: RTL test — save blocked until kind picked; flip persists; malformed JSON blocks POST — AC-2/3/7/8/16.

### Step 13 — Evals tab wired on both editors
- files: `client/src/app/agents/[id]/_components/AgentEditor/{constants.ts,AgentEditor.tsx}` + new `AgentEditor/_components/EvalsTab/**`; `client/src/app/skills/[id]/_components/SkillEditor/_components/EvalsTab/EvalsTab.tsx` (replace stub); layer: presentation
- change: Agent editor — add `{ key:"evals", labelKey:"editor.tabs.evals", icon:"FlaskConical" }` to `TABS` + render branch. Skill editor — replace stub with real tab: owner metrics, case rows (Step 12 editor), "View full dashboard →" → `/eval/:ownerId`. Skill run rows show "With skill X% / Without skill Y%" (from `without_skill` stash).
- done when: both editors render an Evals tab with case rows + dashboard link — AC-10 display.

### Step 14 — `/eval/:ownerId` dashboard page
- files: new `client/src/app/eval/[ownerId]/page.tsx` (thin) + colocated `_components/**`; layer: presentation
- change: three metric cards (value/signed delta/sparkline), "Metric trend" multi-line chart (recharts, `"use client"`), run-history table (Ran at | Version | Recall | Precision | Citation | Pass | Cost) with per-row checkbox; render from `EvalDashboard`; empty-state (no runs → no plot); loading skeleton + error banner; in-progress row from run mutation; Version column from `EvalRunRecord.version`. Breadcrumb "Skills Lab › Eval Dashboard › <owner name>".
- done when: renders cards+trend+table from a mocked dashboard; empty state shows no plot; Version populated — AC-15, AC-23.

### Step 15 — Two-run Compare modal
- files: new `client/src/app/eval/[ownerId]/_components/CompareModal/**` + `.test.tsx`; layer: presentation
- change: "Compare selected" enabled only for exactly 2 same-owner runs (disabled for 1, 3+, cross-owner); render per-metric deltas (recall/precision/citation + cost) + config diff — agent = `system_prompt` diff at each run's `version`; skill = `skill_versions.body` diff; long diff scrolls, no truncation; same-version skill diff empty but metric deltas still render.
- done when: RTL test — 1/3/cross-owner selection leaves action disabled; 2-run same-owner renders deltas + diff — AC-17/22/24, NFR-6.

### Step 16 — Nav reconciliation + i18n
- files: `client/src/vendor/ui/nav.ts` (`:36`), resolver in `app/eval/`; `client/messages/en/eval.json` (add only missing keys); layer: presentation
- change: make the "Eval Dashboard" nav item resolve a concrete owner (last-viewed/default/picker) → `/eval/:ownerId`, never blank; add only missing i18n keys.
- done when: activating the nav lands on a concrete `/eval/:ownerId`; no missing-key fallbacks — AC-25.

## 7. Contract / DB impact

- Shared Zod edited (Step 1) → `./scripts/sync-shared.sh` mandatory (Step 2); contracts-sync.yml gates.
- Schema changed (Step 3) → `pnpm db:generate` then `pnpm db:migrate` (not applied on boot). One new nullable column, no `eval_cases` change.

## 8. Verification commands

| when | command |
|---|---|
| after Step 1 | `cd server && pnpm typecheck` |
| after Step 2 | `./scripts/sync-shared.sh --check` |
| after Step 3 | `cd server && pnpm db:generate && pnpm db:migrate` |
| server unit (hermetic) | `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'` |
| server integration (Docker) | `cd server && pnpm exec vitest run .it.test` |
| module boundaries | `cd server && pnpm arch:check` |
| server lint + types | `cd server && pnpm lint && pnpm typecheck` |
| **L06 green gate** | `cd server && pnpm verify:l06` |
| client | `cd client && pnpm test && pnpm typecheck && pnpm lint` |
| client route move guard | `rm -rf client/.next` then `cd client && pnpm typecheck` |

## 9. Risks / open questions

- AC-10/NFR-7 storage: `without_skill` stash in `actualOutput` jsonb, not new columns — confirm acceptable (else a second migration).
- AC-23 in-progress: no persisted run-status; client-side only. If it must survive reload, needs a `status` column (out of scope).
- `eval_runs.version` plain int, no FK (owner-versions composite-PK'd). Confirm no FK expected.
- Skill→agent 422 relies on `agent_skills` linkage populated (by design).
- Coverage ratchet: editing `server/src/vendor/shared/**` re-triggers reviewer-core.yml coverage.

## 10. Execution mode

Multi-agent pipeline: `devdigest-implementer` → `devdigest-architecture-reviewer` → bounded fix rounds → `devdigest-plan-verifier` → `devdigest-doc-writer`. Test-writer out (tests assigned inline per step).
