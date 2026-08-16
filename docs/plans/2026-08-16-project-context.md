# Implementation Plan: Project Context (SPEC-2026-08-16-project-context)

## 1. Requirements review

Spec: `specs/2026-08-16-project-context.md` · Spec ID `SPEC-2026-08-16-project-context`. All ACs and NFRs mapped below; each is reachable from a §6 step.

| # | requirement (as given) | verdict | note |
|---|---|---|---|
| AC-1 | Ordered `doc_paths: string[]` on agent + skill, bare repo-relative, no repo id | clear | new column both tables; new field on `Agent`/`AgentVersionConfig`/`Skill` — `knowledge.ts:180,210,121` |
| AC-2 | Page enumerates `.md` under configured roots at current checkout, flat browse-only list | clear | new `docs` module; config roots default `**/{specs,docs,insights}/**/*.md` |
| AC-3 | Per-doc `{path, tokens, type}`, type ∈ specs/docs/insights/readme, server-side tokenizer | clear | reuse `TiktokenTokenizer.count` (`tokenizer/index.ts:29`) — see Recommendation on tokenizer scope |
| AC-4 | Page selects doc → read-only Preview + "Used by N agents" | clear | preview endpoint (Open q. resolves to new endpoint); N = agents whose resolved doc set contains path |
| AC-5 | Footer = file count + last-scanned time; no chunk/coverage/index | clear | `scanned_at` from walk |
| AC-6 | Rescan re-walks clone, refreshes list + last-scanned | clear | `POST /api/repos/:repoId/docs/rescan` |
| AC-7 | Editor doc list: drag handle, checkbox, filename, path prefix, badge, Preview; "N of M attached" | clear | reuse SkillsTab drag pattern (`SkillsTab.tsx:24-41`) |
| AC-8 | Agent editor: attached-token total + fixed injection caption | clear | sum per-doc tokens from doc list |
| AC-9 | Attach/detach/reorder persists `doc_paths` without a Save button | clear | save-on-change, same as SkillsTab `POST .../skills` |
| AC-10 | Editor filter no-match → "no matches" empty state | clear | |
| AC-11 | Run doc set = agent `doc_paths` first, then linked-skill `doc_paths` in link order, dedup keep-first | clear | `linkedSkills` already ordered (`repository.ts:191-199`) |
| AC-12 | Read via `git.readFile(repo,path)` only after containment vs `clonePathFor(repo)` | clear | root-cause guard in adapter — see Recommendation |
| AC-13 | Bodies → existing `specs` slot, `wrapUntrusted`+`INJECTION_GUARD` unchanged, no extra LLM call | clear | `prompt.ts:103-106`; run-executor passes `specs` |
| AC-14 | Live Log "Specs: N context doc(s) attached to prompt" | clear | mirror skills line `run-executor.ts:219` |
| AC-15 | `specs_read` = `{path,tokens,skipped}[]`, one per deduped path, tokens 0 when skipped | clear | widen contract `trace.ts:90` |
| AC-16 | Trace shows path+tokens, marks skipped, renders sent bodies in Prompt-assembly | clear | `TraceBody.tsx:38-50` (specs_read), `:84-86` (specs block) |
| AC-17 | Missing path → skip+record, run continues | clear | |
| AC-18 | Raw size > 400 KB → skip+record, body never sent | clear | NFR-2 |
| AC-19 | Path escapes clone (`..`/abs/symlink) → skip+record, never read | clear | containment guard covers this; symlink needs `realpath` |
| AC-20 | No docs → run identical to today | clear | `specs` omitted, `specs_read: []`, no log line |
| AC-21 | Skill list + editor show "used by N agents" | clear | new `used_by_agents` on `Skill` DTO |
| AC-22 | Uncloned repo or no `.md` → reader empty state, not authoring CTA | clear | |
| AC-23 | Skill "SERIALIZES AS" preview = static path list under `## Project specifications`, labelled edit-time | clear | distinct from run-time `## Project context` (AC-13) |
| NFR-1 | Doc-list p95 < 800 ms for ≤200 docs | clear | verified server-side; plan does not add a perf test unless asked |
| NFR-2 | Per-doc read cap 400 KB | clear | AC-18 |
| NFR-3 | Run overhead < 300 ms for ≤10 docs | clear | verified server-side |
| NFR-4 | Editor a11y: keyboard attach/detach/reorder; skip/empty announced | clear | Design row 7 |
| NFR-5 | Every skip attributable from trace alone | clear | AC-15/16 |
| NFR-6 | Attached invariant reflected in a finding | clear | integration-level; covered by run path AC-11→16 |

**Blocking questions** — none. Every requirement is buildable against the current tree; the four spec Open questions all carry a standing assumption the spec itself states, recorded below.

**Assumptions** (from the spec's Open questions, planned on as written):
- Doc-list caps at 500 matched docs; filter narrows (AC-2/AC-7).
- Docs read from the clone's current checkout; a missing path is a skip (AC-17). No ref pinning.
- Preview uses a new `GET /api/repos/:repoId/docs/:path/preview`, containment-checked.
- Untrusted label stays `spec-N` (`prompt.ts:105`); no reviewer-core change.
- Uncloned + empty-of-`.md` both render the reader empty state; a walk/endpoint error renders a distinct error state (Design rows 5/6).

**Recommendations:**
- **Fix `git.readFile` containment at the adapter (root cause), not per-caller.** `simple-git.ts:129-131` does a bare `join` with no check; `server/INSIGHTS.md` (2026-08-16) flags this as latent traversal that activates the instant a non-hardcoded path arrives — Project Context is that first caller. Put the resolve-and-assert-under-`clonePathFor` guard (with `realpath` for the symlink case, AC-19) inside `readFile` so every current and future caller is safe with one diff, and have the run-executor treat a thrown containment error as a skip (AC-19). One guard beats a guard at each of the page-preview, doc-walk, and run-read sites. Trade-off: existing hardcoded callers now pay a `realpath` per read — negligible.
- **The doc walk (AC-2) reads only paths, not `git.readFile`.** Enumerate with a `.md` glob confined under `clonePathFor(repo)`; do not route the walk through `readFile`. Token counting reads each matched file — apply the same 400 KB cap there as at run time so a huge doc doesn't blow NFR-1.
- **Tokenizer is documented as "ONLY under modules/repo-intel" (`tokenizer/index.ts:12`).** The docs module and run-executor are new consumers. Resolve it from the DI container (as run-executor already does for repo-intel) rather than importing the class directly, and update that scope comment. Do not instantiate a second encoder.

## 2. Scope / Non-goals

**In scope:** the three read+attach surfaces (Project Context page at `/project-context`, agent Context tab, skill Context section), a server `docs` module (list/preview/rescan), `doc_paths` columns on agents+skills, widened `specs_read`, run-executor filling the dormant `specs` slot with containment-checked reads, `used_by_agents` on the Skill DTO, the Live Log line, and the trace renderer update.

**Non-goals (from spec, not planned):** doc authoring/editing/upload/delete; auto-selection by PR content; chunking/embedding/coverage/re-indexing; any change to the injection defense; any change to reviewer-core source; cross-repo docs; memory extraction. The design's `+`/`new-folder`/`upload`/`Preview|Edit`/chunks/coverage elements are deferred (Design rows 1-4).

## 3. Affected modules

| module | path | layer |
|---|---|---|
| server (new `docs` module) | `server/src/modules/docs/` | presentation + application + repository |
| server (git adapter) | `server/src/adapters/git/simple-git.ts` | infrastructure |
| server (run pipeline) | `server/src/modules/reviews/run-executor.ts`, `helpers.ts` | application |
| server (agents/skills) | `server/src/modules/{agents,skills}/`, `server/src/db/schema/{agents,skills}.ts` | presentation + repository + infra |
| shared contracts | `server/src/vendor/shared/contracts/{trace.ts,knowledge.ts}` + new docs contract | domain |
| client | `client/src/app/project-context/`, agent/skill editors, trace renderer, hooks, i18n | presentation |

## 4. Constraints in force
- **INSIGHTS (server):** `git.readFile` has no containment check — a non-hardcoded path escapes the clone; fix in the adapter — `server/INSIGHTS.md` (2026-08-16, "git.readFile has no clone-dir containment check").
- **INSIGHTS (server):** the `specs` / `## Project context` / `specs_read` pathway exists end-to-end but is fed empty — fill it, do not rebuild — `server/INSIGHTS.md` (2026-08-16).
- **INSIGHTS (server):** a `.it.test.ts` with an unstubbed provider makes live billed calls — any run-path integration test must keep `overrides.llm` — `server/INSIGHTS.md` (2026-08-08).
- **INSIGHTS (server + client):** edit shared contracts at source then `./scripts/sync-shared.sh`; never hand-edit the mirror — both INSIGHTS (2026-08-08/16).
- **INSIGHTS (client):** `@devdigest/ui`/`nav.ts` is vendored-but-not-synced, edit directly; the `/project-context` nav item already exists (`nav.ts:27`) — reuse, don't add — `client/INSIGHTS.md` (2026-08-01).
- **INSIGHTS (client):** `@testing-library/user-event` is NOT installed — use `fireEvent` in tests (contradicts the react-testing-library skill's default; the skill's guidance is overridden here).
- **INSIGHTS (reviewer-core):** package uses **npm**, and the gate is `typecheck && lint && coverage` (coverage re-runs the suite) — but this feature makes zero reviewer-core source edits, so only verify.
- **Architecture (Onion):** new `docs` module keeps route → service → repository; DB queries live in `repository.ts`, never `routes.ts` (`no-route-to-db`). The walk/read (git adapter, tokenizer) are ports resolved via the service's `Container`. Register the plugin in `modules/index.ts`.
- **Architecture:** the `used_by_agents` / per-doc "used by N agents" counts are cross-entity reads — compute inline in the owning module's repository with one `inArray` query (server INSIGHTS 2026-07-31 pattern), not by importing another module's repo (`no-cross-module-internals`).
- **CI gate:** `contracts-sync.yml` fails if `client/src/vendor/shared` drifts — run `sync-shared.sh` after editing `trace.ts`/`knowledge.ts`/new docs contract. `reviewer-core.yml` also watches `server/src/vendor/shared/**` and runs the coverage ratchet — widening `trace.ts` retriggers it. `arch:check` is not a CI gate but the architecture-reviewer runs `depcruise --ignore-known`; add no new edge.

## 5. Skills the implementer MUST invoke

| scope (path glob) | skill | why it applies here |
|---|---|---|
| `server/src/modules/docs/**`, `reviews/**` | `onion-architecture` | new module + run-executor changes must keep route→service→repo, ports via Container |
| `server/src/modules/docs/routes.ts`, `agents/routes.ts`, `skills/routes.ts` | `fastify-best-practices` | new/updated routes, Zod `params`/`body` schemas, error → status mapping |
| `server/src/modules/docs/repository.ts`, `agents/**`, `skills/**` | `drizzle-orm-patterns` | new `doc_paths` columns, `inArray` count queries, config-json write |
| `server/src/db/schema/{agents,skills}.ts` + migration | `postgresql-table-design` | adding a jsonb column, default, NOT NULL choice; migration not applied on boot |
| `server/src/vendor/shared/contracts/**` + any `.ts` above | `zod` | widen `specs_read`, new `DocListItem`/`DocList` schema, `doc_paths` fields |
| all `.ts` above | `typescript-expert` | derive types structurally; avoid a type-only cross-module import adding an arch edge (server INSIGHTS) |
| `server/src/adapters/git/simple-git.ts`, run-executor read path, docs endpoints | `security` | path-traversal containment (OWASP A01/A05); doc bodies untrusted → existing injection guard |
| `client/src/app/project-context/**`, editor `_components/**` | `frontend-ui-architecture` | where the page/tab/section files live; RSC vs client boundary; colocated `_components` |
| `client/**` component + hook files | `react-best-practices` | derive attached-token total during render (not state), drag/reorder state, keys |
| `client/src/app/project-context/page.tsx`, editors | `next-best-practices` | App Router page (route does not exist yet), loading/error states, thin page |
| `client/**/*.test.tsx` | `react-testing-library` | editor/page tests — but use `fireEvent`, not `user-event` (not installed) |

## 6. Steps

### Step 1 — Widen shared contracts (source only)
- files: `server/src/vendor/shared/contracts/trace.ts`, `server/src/vendor/shared/contracts/knowledge.ts`, new `server/src/vendor/shared/contracts/docs.ts` (+ export from the contracts barrel)
- layer: domain
- change: (a) In `trace.ts:90` replace `specs_read: z.array(z.string())` with `z.array(z.object({ path: z.string(), tokens: z.number().int(), skipped: z.boolean() }))`; export a `SpecRead` type. (b) In `knowledge.ts` add `doc_paths: z.array(z.string()).default([])` to `Agent` (`:180`), `AgentVersionConfig` (`:210`), and `Skill` (`:121`), and `used_by_agents: z.number().int().nullish()` to `Skill`. (c) New `docs.ts`: `DocType = z.enum(['specs','docs','insights','readme'])`, `DocListItem = z.object({ path, tokens: int, type: DocType, used_by_agents: z.number().int() })`, `DocList = z.object({ docs: z.array(DocListItem), scanned_at: z.string() })`.
- done when: `cd server && pnpm typecheck` passes with the new fields; contract compiles — AC-1, AC-3, AC-15

### Step 2 — Sync the shared mirror
- files: `client/src/vendor/shared/**` (generated), via `./scripts/sync-shared.sh`
- layer: n/a (generated)
- change: run `./scripts/sync-shared.sh`; do not hand-edit the mirror.
- done when: `./scripts/sync-shared.sh --check` exits 0 — no spec (CI-gate satisfaction for `contracts-sync.yml`)

### Step 3 — DB columns + migration for `doc_paths`
- files: `server/src/db/schema/agents.ts`, `server/src/db/schema/skills.ts`, generated migration under `server/src/db`
- layer: infrastructure
- change: add `docPaths: jsonb('doc_paths').$type<string[]>().notNull().default([])` to both `agents` and `skills` (mirror `evidenceFiles` jsonb precedent in `skills.ts`). Run `cd server && pnpm db:generate`. Do not hand-edit the generated SQL.
- done when: `pnpm db:generate` produces one migration adding both columns; `pnpm typecheck` passes — AC-1

### Step 4 — Containment guard in the git adapter (root cause)
- files: `server/src/adapters/git/simple-git.ts`
- layer: infrastructure
- change: in `readFile` (`:129-131`), resolve `join(clonePathFor(repo), path)`, `realpath` it, and assert the result stays under `realpath(clonePathFor(repo))`; throw a typed error (e.g. `PathEscapesCloneError`) otherwise, before reading. Add a `.md`-globbing walk helper the docs service calls that enumerates files confined under the clone dir, capped at 500 matches.
- done when: a unit test proves `readFile(repo, '../../etc/passwd')` and a symlink-escape both throw and never read; a hardcoded in-clone path still reads — AC-12, AC-19, NFR-2 (cap applied at read)

### Step 5 — New `docs` server module (list / preview / rescan)
- files: `server/src/modules/docs/{routes.ts,service.ts,repository.ts,helpers.ts,constants.ts}`, register in `server/src/modules/index.ts`; roots/glob/cap config in `server/src/platform/config.ts`
- layer: presentation (routes) + application (service) + repository
- change: `GET /api/repos/:repoId/docs` → walk clone at current checkout under configured roots (default glob `**/{specs,docs,insights}/**/*.md`, cap 500), per-doc `{path, tokens (tokenizer via Container, 400 KB cap), type (from root; `readme` for top-level README.md)}`, plus per-doc `used_by_agents` (repository: one `inArray` over agents' resolved doc sets — own `doc_paths` ∪ linked-skill `doc_paths`, dedup — counting agents containing that path), and `scanned_at`. `POST /api/repos/:repoId/docs/rescan` → same, re-walked. `GET /api/repos/:repoId/docs/:path/preview` → raw body via the now-guarded `git.readFile`. Uncloned/empty → empty `docs` + `scanned_at`; walk failure → 5xx (client renders error state). No create/upload/delete routes.
- done when: `.it.test.ts` (with a seeded clone fixture) returns docs with tokens>0 and correct `type`; a traversal `:path` on preview returns an error, never file content; uncloned repo returns `{docs:[], scanned_at}` — AC-2, AC-3, AC-4 (N), AC-5, AC-6, AC-22, NFR-1

### Step 6 — Persist `doc_paths` on agent + skill (repository + routes)
- files: `server/src/modules/agents/{repository.ts,service.ts,routes.ts}`, `server/src/modules/skills/{repository.ts,service.ts,routes.ts}`
- layer: repository + application + presentation
- change: add `doc_paths?: string[]` to `UpdateAgentBody` and `UpdateSkillBody`; persist on update; include `doc_paths` in the `agentVersions.configJson` write (`repository.ts:155-164`) and in `AgentVersionConfig`. Map `docPaths` → DTO `doc_paths` on read. Add `used_by_agents` to the `Skill` read DTO (skills repository: one `inArray` count over `agent_skills` per skill id — the same shape as AC-21). Do not import the agents repo from skills or vice versa (compute inline).
- done when: PUT agent/skill with `doc_paths` round-trips through GET; skill list/read carries `used_by_agents`; agent version snapshot includes `doc_paths` — AC-1, AC-9 (server side), AC-21

### Step 7 — Run-executor fills the `specs` slot
- files: `server/src/modules/reviews/run-executor.ts`, `server/src/modules/reviews/helpers.ts`
- layer: application
- change: after `linkedSkills` (`:218`), build the deduped ordered path set — agent `doc_paths` first, then each linked skill's `doc_paths` in link order, keep-first dedup (a pure helper in `helpers.ts`, unit-testable). For each path: guarded `git.readFile`; on containment error / missing / non-UTF-8 / >400 KB → record `{path, tokens:0, skipped:true}` and continue; else `tokenizer.count(body)`, push body to a `specs` array and `{path, tokens, skipped:false}`. Pass `...(specs.length ? { specs } : {})` into `reviewPullRequest` (`:225`). Emit `runLog.info("Specs: N context doc(s) attached to prompt")` only when `specs.length>0` (mirror `:219`). Set `trace.specs_read` to the recorded array (replaces `specs_read: []` at `:326`). No new LLM call.
- done when: run over an agent with an attached in-clone doc sends it in `specs`, logs the line, and persists `specs_read` with `skipped:false, tokens>0`; a missing/oversized/traversal path yields `skipped:true`; an agent with no docs behaves exactly as today (`specs` omitted, `specs_read:[]`, no log line) — AC-11, AC-13, AC-14, AC-15, AC-17, AC-18, AC-19, AC-20, NFR-3, NFR-5, NFR-6

### Step 8 — Trace renderer for widened `specs_read`
- files: `client/.../RunTraceDrawer/_components/TraceBody/TraceBody.tsx`, colocated styles, `client/messages/en/runs.json`
- layer: presentation
- change: `specs_read` is now objects — render each as `path · N tok`, visually mark `skipped:true` (badge/strikethrough) with a screen-reader-announced label (NFR-4). Truncate long paths with full path on `title` (Design row 8). The `## Project context` bodies already render via `prompt_assembly.specs` (`:84-86`) — keep.
- done when: `pnpm test` in client renders a mixed sent/skipped `specs_read` with the skipped entry marked; no type error from the object shape — AC-16, NFR-4, NFR-5

### Step 9 — Project Context page
- files: `client/src/app/project-context/page.tsx` (route does not exist yet), colocated `_components/ProjectContext*/`, a data hook in `client/src/lib/hooks/docs.ts`, `client/messages/en/*.json`
- layer: presentation
- change: thin page resolving the selected repo via the existing active-repo context; reuse the existing nav item (`nav.ts:27`, no nav edit). List docs (filename + doc icon, doc-type badge), select → read-only markdown Preview (`react-markdown`, already a dep) + "Used by N agents", footer = `N files · last scanned …`. Loading state distinct from empty (Design row 5); explicit error state on walk failure distinct from empty (Design row 6); reader empty state for uncloned/no-`.md` (AC-22). No create/upload/edit controls (Design rows 1-4).
- done when: `pnpm test` covers loaded/empty/error; footer shows count+time and no chunk/coverage; no authoring control rendered — AC-2, AC-4, AC-5, AC-6, AC-22

### Step 10 — Agent Context tab + Skill Context section
- files: `client/src/app/agents/[id]/_components/AgentEditor/_components/ContextTab/*` (new, register in `AgentEditor.tsx` tab list), `client/src/app/skills/[id]/_components/SkillEditor/_components/ContextSection/*` (new), reuse/extend the docs hook, `client/messages/en/*.json`
- layer: presentation
- change: doc list rows with drag handle + attach/detach checkbox + filename + path prefix + doc-type badge + Preview; "N of M attached" badge; filter with "no matches" empty state; save-on-change (POST `doc_paths` on every attach/detach/reorder — same shape as `SkillsTab.tsx:24-41` HTML5 drag + `setSkills`). Agent tab additionally shows attached-token total (sum of per-doc tokens, derived during render) + the fixed caption "Injected as an untrusted block (## Project context) into every run." Skill section additionally shows the "SERIALIZES AS" preview: static path list under a `## Project specifications` heading, labelled as an edit-time attachment preview (AC-23), plus the skill's "used by N agents". Keyboard-operable reorder (NFR-4).
- done when: `pnpm test` covers attach → persist, filter no-match empty state, reorder; agent token total updates on attach; skill preview shows paths under `## Project specifications`; keyboard reorder works via `fireEvent` — AC-7, AC-8, AC-9, AC-10, AC-21, AC-23, NFR-4

### Step 11 — reviewer-core verification (no source edits)
- files: none (verify only)
- layer: n/a
- change: none — the `specs` slot, `wrapUntrusted`, `INJECTION_GUARD` already exist (`prompt.ts:16-34,103-106,138`); label stays `spec-N`.
- done when: reviewer-core gate green with zero diff in `reviewer-core/src/**` — AC-13 (unchanged defense)

## 7. Contract / DB impact
- **Shared Zod edited:** yes — `trace.ts` (`specs_read` widened), `knowledge.ts` (`doc_paths` on Agent/AgentVersionConfig/Skill, `used_by_agents` on Skill), new `docs.ts`. Run `./scripts/sync-shared.sh` and commit both copies (Step 2); `contracts-sync.yml` + `reviewer-core.yml` (watches `vendor/shared`) both retrigger.
- **Schema changed:** yes — `doc_paths` jsonb on `agents` and `skills`. Run `cd server && pnpm db:generate` then `pnpm db:migrate`. **Migrations are NOT applied on boot** — run `pnpm db:migrate` before integration tests and before the app sees the new columns.

## 8. Verification commands
| when | command |
|---|---|
| after editing shared contracts | `./scripts/sync-shared.sh` |
| verify mirror not drifted | `./scripts/sync-shared.sh --check` |
| after schema change | `cd server && pnpm db:generate` |
| apply migration (not on boot) | `cd server && pnpm db:migrate` |
| server typecheck | `cd server && pnpm typecheck` |
| server lint | `cd server && pnpm lint` |
| server unit (hermetic) | `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'` |
| server integration (Docker) | `cd server && pnpm exec vitest run .it.test` |
| server arch check | `cd server && pnpm arch:check` |
| client typecheck | `cd client && pnpm typecheck` |
| client lint | `cd client && pnpm lint` |
| client tests | `cd client && pnpm test` |
| reviewer-core gate (verify no regression) | `cd reviewer-core && npm run typecheck && npm run lint && npm run coverage` |

## 9. Risks / open questions
- **Symlink-escape (AC-19)** needs `realpath` in the guard, not just a string-prefix check on the joined path — a naive `startsWith` misses a symlink whose textual path is in-clone. Step 4 must `realpath` both sides.
- **`configJson` back-compat:** existing `agent_versions` rows lack `doc_paths`; `AgentVersionConfig.doc_paths` defaults to `[]` (Step 1) so old snapshots parse. Confirm the reader tolerates the missing key (the `.default([])` covers it).
- **Tokenizer double-count cost (NFR-1):** the list endpoint token-counts every matched doc on each open/rescan; for 200 docs the encoder runs 200×. Resolve one tokenizer from the Container, don't re-instantiate per request.
- **`react-markdown` untrusted rendering:** the Preview renders repo `.md` (untrusted) — ensure raw HTML is not enabled (no `rehype-raw`) so a doc can't inject markup. `security` skill covers this in Step 9.
- **Open (spec, non-blocking):** doc-list cap number (assumed 500), clone staleness vs PR head (assumed current checkout), walk-failure vs uncloned distinction (assumed error-vs-empty). All carry the spec's standing assumption.

## 10. Execution mode
- **Recommended:** multi-agent pipeline — crosses three modules, edits shared Zod contracts and a DB migration, opens a new Onion boundary (the `docs` module), touches a security-sensitive path-traversal surface, and the run-path/trace changes need step-by-step conformance auditing against 23 ACs.
- **Agents:** `devdigest-implementer` → `devdigest-architecture-reviewer` (new module + adapter guard + no-new-arch-edge) → `devdigest-plan-verifier` (AC coverage across the 11 steps). Test-writer optional; the plan names per-step tests.
- **Single-agent-pass would lose:** the arch review of the new module boundary and the containment guard, and independent AC-conformance verification.
