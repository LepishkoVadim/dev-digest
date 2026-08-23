# Implementation Plan: PR Why + Risk Brief

Spec: `specs/2026-08-16-pr-why-risk-brief.md` · Spec ID: `SPEC-2026-08-16-pr-why-risk-brief`
Status: draft · Base: committed HEAD (in-flight working-tree changes ignored per constraint)

## 1. Requirements review

All requirements audited against committed HEAD.

| # | requirement | verdict | note |
|---|---|---|---|
| AC-1 | `GET /pulls/:id/brief` returns persisted Brief + `state_key` + cost fields | clear | mirrors `GET /pulls/:id/intent` (`routes.ts:142`); response includes `tokensIn/tokensOut/costUsd/model` from stored `StructuredResult` |
| AC-2 | `GET` with no Brief → `404`, no derive | clear | `NotFoundError` identical to intent (`routes.ts:145`) |
| AC-3 | `POST` gathers intent/blast/stats/hunk digest/issue/docs → derive via `risk_brief` → persist keyed by head SHA in `state_key` → return | clear | clone of `deriveIntent` (`service.ts:187-317`); `risk_brief` feature-model registered (`platform.ts:62`) |
| AC-4 | `risk_level` = max severity across `risks[]` in code, never model | clear | code-side gate, same shape as `deriveConfidence` |
| AC-5 | drop `file_refs`/`review_focus` not in diff changed-files or blast `impacted_endpoints`; log each drop | clear | new pure filter — `groundFindings` operates on line-ranged `Finding[]`, not bare paths/endpoints |
| AC-6 | `POST` overwrites regardless of head-SHA match | clear | upsert on `pr_id` PK |
| AC-7 | rate-limit >6 POST/min/workspace | clear | `config: { rateLimit: { max: 6, timeWindow: '1 minute' } }` (`routes.ts:154`) |
| AC-8 | LLM failure after retries → error with provider message verbatim, no partial persist | clear | let `completeStructured` throw; persist only after grounding+risk_level succeed |
| AC-9 | staleness banner when `headSha != state_key`, keep stale Brief visible | clear | client derives staleness during render |
| AC-10 | empty state + "Generate brief" CTA on 404 | clear | `EmptyState` from `IntentCard.tsx` |
| AC-11 | loading skeleton + disabled control while POST in flight | clear | `Skeleton` + `derive.isPending` |
| AC-12 | error state shows provider/request message verbatim, re-enables control | clear | `ErrorState` pattern |
| AC-13 | empty `risks[]` → explicit "No risk areas identified" row | clear | |
| AC-14 | missing `repoFullName`/`headSha` → file:line as plain text | clear | `MonoLink` plain-text fallback (BlastCard) |
| AC-15 | no review ever → empty verdict area, not zeroed | clear | verdict/score/findings via `usePrReviews`; render empty when none |
| AC-16 | verdict predating Brief `state_key` → render independently, no reconciliation | clear | each shows own staleness |
| AC-17 | risk row keyboard toggle (Enter/Space), `aria-expanded`, focus retention | clear | accordion a11y in `PrBriefCard` |
| AC-18 | blast `degraded`/`empty` → still derive, omit endpoint refs, focus = changed-files only | clear | grounding drops all endpoint refs when `impacted_endpoints` empty |
| NFR-1 | prompt excludes hunk bodies | clear | reuse `hunkHeaderDigest` (`intent.ts:45`) |
| NFR-2 | GET p95 <100ms, no LLM on path | clear | GET is a single repo read |
| NFR-3 | 6/min rate limit | clear | same as AC-7 |
| NFR-4 | one structured log line per dropped ref, naming PR id + ref | clear | log inside the grounding caller |
| NFR-5 | cost line from Brief's own `StructuredResult`, not any review | clear | persist + return `tokensIn/tokensOut/costUsd/model` |
| NFR-6 | `aria-expanded` per row; generate control accessible name | clear | `IconBtn` maps `label`→aria-label |
| NFR-7 | `temperature: 0` | clear | pass to `completeStructured` |
| new `Brief` shape, not dormant `PrBrief` | clear | append new `Brief` schema; leave `PrBrief` untouched |
| add `state_key` to `pr_brief` | clear | table exists (`schema/reviews.ts:76`); add `state_key text` |
| new `useBrief`/`useDeriveBrief` hooks | clear | mirror `usePrIntent`/`useDeriveIntent` (`hooks/reviews.ts:147-162`) |
| reuse `wrapUntrusted`+`capText` on every untrusted input | clear | `intent.ts` / `reviewer-core/src/prompt.ts:30` |

**Blocking questions** — none.

**Assumptions**
- **AC-5 grounding helper is new, not `groundFindings` verbatim.** `groundFindings` gates line-ranged `Finding[]`; the Brief grounds bare file paths against the diff's changed-file set and endpoints against blast `impacted_endpoints`. Plan: new pure `groundBriefRefs(candidate, { changedFiles, endpoints })` in reviewer-core returning `{ brief, dropped[] }`.
- **Blast data via `container.repoIntel`, not the blast module.** Importing `blast/service.ts`/`repository.ts` adds a new `no-cross-module-internals` edge. Reviews already uses `container.repoIntel.getBlastRadius`/`.getImpactedEndpoints`/`.getIndexState` in `run-executor.ts`; brief service does the same, reads changed files inline via Drizzle (Smart-Diff precedent).
- **Verdict on Overview reuses `usePrReviews`.** A small verdict summary inside/next to `PrBriefCard` fed by `usePrReviews(prId)`, not a move of `VerdictBanner`.

**Recommendations**
- Reuse existing `RiskSeverity` (`high|medium|low`) from `contracts/brief.ts` and extend the dormant `Risk` object shape rather than a parallel enum — one severity source for AC-4. Sharing a leaf enum with dormant `PrBrief` is fine (spec bans reviving `PrBrief`, not sharing an enum).
- Type `pr_brief.json` as `$type<Brief>()` when adding `state_key` + cost columns.

## 2. Scope / Non-goals

**Does:** `GET`/`POST /pulls/:id/brief`, a `deriveBrief` service, new `Brief` shared Zod contract + `state_key`/cost columns on `pr_brief`, pure `groundBriefRefs` in reviewer-core, `useBrief`/`useDeriveBrief` hooks, a `PrBriefCard` atop Overview with verdict context, i18n keys.

**Does not:** in-app file viewer (blob links only); run a review; revive dormant `PrBrief`; send hunk bodies; stream the Brief; per-risk edit/dismiss. AC-15/16 covered by rendering existing verdict data beside the Brief — no new verdict computation.

## 3. Affected modules

| module | path | layer |
|---|---|---|
| server | `server/src/modules/reviews/{routes,service,repository,intent}.ts`, `repository/pull.repo.ts` | presentation / application / infrastructure |
| server | `server/src/db/schema/reviews.ts` + generated migration | infrastructure |
| server | `server/src/vendor/shared/contracts/brief.ts`, `contracts/review-api.ts`, `index.ts` (source) | domain |
| reviewer-core | `reviewer-core/src/grounding.ts` (or new file) + `src/index.ts` | application (pure) |
| client | `client/src/vendor/shared/**` (mirror, via sync only), `src/lib/hooks/reviews.ts`, new `_components/PrBriefCard/**`, `OverviewTab.tsx`, `messages/en/brief.json` | presentation |

## 4. Constraints in force

- **INSIGHTS (cross-module):** reviews must not import `blast/service.ts`/`blast/repository.ts` — new `no-cross-module-internals` edge. Use `container.repoIntel` + inline Drizzle (Smart Diff, 2026-08-08; Blast index-only, 2026-08-09).
- **INSIGHTS:** `.it.test.ts` with an unstubbed provider makes live billed calls (2026-08-08). Inject `overrides.llm` keyed by `schemaName: 'Brief'`; failure-injection = provider returning schema-invalid output.
- **INSIGHTS:** model proposes, code disposes — `risk_level` and dropped refs code-derived (Intent confidence, 2026-08-08).
- **INSIGHTS:** shared contracts edited at source then `sync-shared.sh`; never hand-edit mirror (2026-08-08).
- **INSIGHTS (client):** Brief is an Overview *card*, not a tab; `brief.json` namespace pre-exists; restart dev + hard refresh after adding i18n keys (2026-08-09).
- **INSIGHTS (reviewer-core):** grounding lives in `src/grounding.ts` (flat) (2026-08-08).
- **Architecture:** onion inward-only; repository owns Drizzle; service takes `Container`; no `drizzle-orm` in routes/service; pure logic stays in reviewer-core.
- **CI gate:** `contracts-sync.yml` fails on mirror drift; `reviewer-core.yml` runs the coverage ratchet; `server-unit.yml` watches `reviewer-core/**`.

## 5. Skills the implementer MUST invoke

| scope | skill | why |
|---|---|---|
| `server/src/modules/reviews/**` | `onion-architecture` | route→service→repo wiring; no cross-module blast edge |
| `server/src/modules/reviews/routes.ts` | `fastify-best-practices` | Zod params, per-route `rateLimit`, `NotFoundError` |
| `server/src/modules/reviews/repository*.ts`, `db/schema/reviews.ts` | `drizzle-orm-patterns` | upsert-by-PK, `jsonb $type`, `state_key`, row→DTO |
| `server/src/db/schema/reviews.ts` + migration | `postgresql-table-design` | `state_key text`, no volatile default |
| shared contracts, reviewer-core, all `.ts` above | `zod` | new `Brief` schema, reuse `RiskSeverity`, `completeStructured` schema |
| `server/**`, `reviewer-core/**` | `typescript-expert` | port/DTO types, `StructuredResult<Brief>` across boundary |
| service, routes, `reviewer-core/src/grounding.ts` | `security` | untrusted PR/issue/doc bodies, grounded LLM output (AC-5), verbatim provider error (AC-8) |
| `PrBriefCard/**`, `OverviewTab.tsx` | `frontend-ui-architecture` | colocated card, thin page, card-not-tab |
| `PrBriefCard/**` | `react-best-practices` | derive staleness/risk_level during render, accordion handlers |
| `PrBriefCard/**`, `OverviewTab.tsx` | `next-best-practices` | `"use client"` boundary |
| hooks, `PrBriefCard.test.tsx` | `react-testing-library` | card states + a11y assertions |
| brief integration test | `engineering-insights` (read at start) | live-call trap + inline-Drizzle notes |

## 6. Steps

### Step 1 — Add the `Brief` shared contract (source)
- files: `server/src/vendor/shared/contracts/brief.ts`, `contracts/review-api.ts`, `index.ts`
- layer: domain
- change: append `Brief = { what, why, risk_level: RiskSeverity, risks: BriefRisk[], review_focus: ReviewFocus[] }` reusing `RiskSeverity`; `BriefRisk = { kind, title, explanation, severity, file_refs: string[], endpoint_refs?: string[] }`; `ReviewFocus = { file, line?, reason }`. Add `LlmBriefCandidate` (model output, no `risk_level`) for `completeStructured`. Add `PrBriefRecord` = `Brief` + `{ pr_id, state_key, tokensIn, tokensOut, costUsd, model, derived_at }`. Do not touch dormant `PrBrief`.
- done when: `cd server && pnpm typecheck` passes; schemas exported from `index.ts`. (AC-1, AC-4, NFR-5)

### Step 2 — Add `state_key` + cost columns to `pr_brief`, generate migration
- files: `server/src/db/schema/reviews.ts`, generated `server/src/db/migrations/*`
- layer: infrastructure
- change: type `json` `$type<Brief>()`; add `stateKey: text('state_key')`, `tokensIn/tokensOut integer`, `costUsd doublePrecision`, `model text`, `derivedAt timestamptz` (no volatile default → no rewrite). Run `pnpm db:generate`; do not hand-edit SQL.
- done when: `pnpm db:generate` emits a migration adding `state_key`+cost with no row drop. (AC-3, NFR-5)

### Step 3 — Repository: `upsertBrief` / `getBrief`
- files: `server/src/modules/reviews/repository/pull.repo.ts`, `repository.ts`
- layer: infrastructure
- change: `upsertBrief(db, prId, record)` (`onConflictDoUpdate` on `prBrief.prId`) and `getBrief(db, prId): Promise<PrBriefRecord | undefined>` (row→DTO). Re-export from `ReviewRepository`. Mirror `upsertIntent`/`getIntent`.
- done when: `pnpm typecheck` passes; returns DTO not raw row. (AC-1/3/6)

### Step 4 — reviewer-core: pure `groundBriefRefs`
- files: `reviewer-core/src/grounding.ts` (extend) + `src/index.ts`; test `src/grounding.test.ts`
- layer: application (pure)
- change: `groundBriefRefs(candidate, { changedFiles: Set<string>, endpoints: Set<string> })` → `{ risks, review_focus, dropped: {ref, reason}[] }`. Drop `file_refs`/`review_focus.file` not in `changedFiles`, `endpoint_refs` not in `endpoints`; when `endpoints` empty drop all endpoint refs (AC-18). No `risk_level` derivation (caller does). No logging (caller logs `dropped`).
- done when: `cd reviewer-core && npm test` covers keep/drop/empty-endpoints; `npm run coverage` ratchet green. (AC-5, AC-18, NFR-4)

### Step 5 — Service: `getBrief` + `deriveBrief`
- files: `server/src/modules/reviews/service.ts`, `intent.ts` (reuse `hunkHeaderDigest`, `capText`, message assembler)
- layer: application
- change: `getBrief(ws, prId)` → repo read (`NotFoundError` if pull missing; `undefined` if no brief). `deriveBrief(ws, prId)` cloning `deriveIntent`: gather sources (persisted intent via `repo.getIntent`, linked issue, plan docs, `hunkHeaderDigest`), blast inputs via `container.repoIntel.*` (never the blast module), `wrapUntrusted`+`capText` all untrusted parts (no hunk bodies — NFR-1), `resolveFeatureModel(container, ws, 'risk_brief')`, `completeStructured({ model, schema: LlmBriefCandidate, schemaName: 'Brief', messages, temperature: 0, maxTokens })` (NFR-7). Then code-side: `groundBriefRefs(...)` with `log?.info` per dropped ref naming PR id + ref (NFR-4/AC-5), `risk_level = max(risks[].severity)` (AC-4), `upsertBrief` with `state_key = pull.head_sha` + `StructuredResult` cost fields (AC-3/NFR-5). Let `completeStructured` throw; persist nothing on failure (AC-8).
- done when: hermetic unit test asserts messages contain no `+`/`-` diff-body lines (NFR-1) and `risk_level` = max severity ignoring model value (AC-4). (AC-3/5/6/8/18, NFR-1/4/5/7)

### Step 6 — Routes: `GET` / `POST /pulls/:id/brief`
- files: `server/src/modules/reviews/routes.ts`
- layer: presentation
- change: `GET /pulls/:id/brief` (`schema: { params: IdParams }`) → `service.getBrief`; `404 NotFoundError` identifying the PR when none (AC-2). `POST /pulls/:id/brief` with `config: { rateLimit: { max: 6, timeWindow: '1 minute' } }` (AC-7/NFR-3) → `service.deriveBrief`. Both wrap `getContext(container, req)`. No Drizzle in routes.
- done when: DB-backed `.it.test.ts` (provider stubbed, `schemaName: 'Brief'`): GET 404 before derive, POST 200 with `state_key`+cost, GET 200 after, 7th POST/min rejected. (AC-1/2/7/8, NFR-3)

### Step 7 — Sync shared contracts to client mirror
- files: `client/src/vendor/shared/**` (generated only)
- change: run `./scripts/sync-shared.sh` after Step 1. Do not hand-edit mirror.
- done when: `./scripts/sync-shared.sh --check` reports no drift.

### Step 8 — Client hooks `useBrief` / `useDeriveBrief`
- files: `client/src/lib/hooks/reviews.ts`
- layer: presentation
- change: `useBrief(prId)` (`api.get<PrBriefRecord>('/pulls/${prId}/brief')`, `queryKey ['pr-brief', prId]`, disabled when `prId` null, no throw-toast on 404) and `useDeriveBrief(prId)` (`api.post`, invalidates `['pr-brief', prId]`). Mirror `usePrIntent`/`useDeriveIntent` (`:147-162`).
- done when: `cd client && pnpm typecheck` passes.

### Step 9 — `PrBriefCard` component
- files: new `client/src/app/repos/[repoId]/pulls/[number]/_components/PrBriefCard/{PrBriefCard.tsx,styles.ts,index.ts,PrBriefCard.test.tsx}`
- layer: presentation
- change: `"use client"` card on `IntentCard`'s section pattern. States: loading skeleton + disabled control (AC-11); 404 → `EmptyState` "Generate brief" CTA (AC-10); error → `ErrorState` verbatim message + re-enabled control (AC-12); populated → `what`/`why`, code-derived `risk_level` badge, RISK AREAS accordion (Enter/Space, `aria-expanded`, focus retention — AC-17/NFR-6) with "No risk areas identified" when empty (AC-13), REVIEW FOCUS list of `MonoLink` blob links with plain-text fallback (AC-14), cost line from Brief fields (NFR-5), staleness banner "PR changed since this brief — regenerate" when `headSha !== state_key` keeping stale Brief shown (AC-9). Verdict-context block via `usePrReviews(prId)`: empty when no review (AC-15), rendered independently of Brief freshness (AC-16). No `dangerouslySetInnerHTML`.
- done when: `PrBriefCard.test.tsx` walks empty→generate, loading, error(verbatim), populated, empty-risks, stale-banner, missing-repo-plaintext; asserts `aria-expanded` toggles + generate control accessible name. (AC-9..17, NFR-5/6)

### Step 10 — Mount card + i18n keys
- files: `OverviewTab.tsx`, `client/messages/en/brief.json`
- layer: presentation
- change: render `<PrBriefCard prId repoFullName headSha />` at top of `OverviewTab` (above intent/blast grid). Add missing `brief.json` keys (risk_level labels, `reviewFocus`, `noRiskAreas`, `stale`, `generate`, `regenerate`, verdict-empty). Restart dev + hard refresh.
- done when: `cd client && pnpm test && pnpm typecheck` pass; card at Overview top; no missing-i18n warnings.

## 7. Contract / DB impact

Both. Shared Zod edited (Step 1) → `./scripts/sync-shared.sh` (Step 7), commit both copies. Schema changed (Step 2) → `pnpm db:generate` then `pnpm db:migrate`; **migrations are NOT applied on boot** — run `pnpm db:migrate` before DB-backed tests. `state_key`/cost columns nullable/no-volatile-default → no rewrite, no backfill.

## 8. Verification commands

| when | command |
|---|---|
| after Step 1 | `cd server && pnpm typecheck` |
| after Step 2 | `cd server && pnpm db:generate` |
| before DB-backed tests | `cd server && pnpm db:migrate` |
| after Step 4 | `cd reviewer-core && npm test && npm run coverage && pnpm typecheck` |
| after server steps | `cd server && pnpm typecheck && pnpm lint` |
| server unit (hermetic) | `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'` |
| server integration (Docker) | `cd server && pnpm exec vitest run .it.test` |
| server arch boundary | `cd server && pnpm arch:check` |
| after Step 1 + 7 | `./scripts/sync-shared.sh && ./scripts/sync-shared.sh --check` |
| after client steps | `cd client && pnpm typecheck && pnpm lint && pnpm test` |

## 9. Risks / open questions

- **Merge collision with the in-flight agent.** Touches files already `M` in the working tree: `reviews/{routes,service,repository.ts}`, `db/schema/reviews.ts`, `contracts/brief.ts` + `index.ts`, client `vendor/shared` mirror, `hooks/reviews.ts`, `OverviewTab.tsx`, `messages/en/brief.json`. Plan/implement against HEAD; expect a rebase. Regenerate the migration + `_journal.json` after merging rather than resolving SQL by hand.
- **arch:check baseline** ~13 known violations. Blast via `container.repoIntel` keeps the count flat; verify `pnpm arch:check` adds no new edge.
- **Live-call trap.** `risk_brief` → `openai`; any `.it.test.ts` exercising `deriveBrief` MUST inject `overrides.llm` keyed by `schemaName: 'Brief'`. Failure-injection (AC-8) = provider returning schema-invalid output.
- **Resolved:** verdict context on Overview = slim inline block fed by `usePrReviews` (not `VerdictBanner` reuse), to avoid coupling Overview to the Findings-tab component.

## 10. Execution mode

**Recommended: multi-agent pipeline** — spans three modules, edits a shared Zod contract + a DB migration, adds a pure reviewer-core unit under the coverage ratchet, touches an untrusted-LLM-output security surface, and collides with in-flight work.

Agents: `devdigest-implementer` → `devdigest-architecture-reviewer` → `devdigest-plan-verifier` → `devdigest-doc-writer`. Skip `devdigest-test-writer` (Steps 4/5/6/9 specify tests inline).

Single-agent pass ships faster but leaves the arch boundary, AC/NFR coverage, and merge-risk documentation unverified.
