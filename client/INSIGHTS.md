# client — Insights
↑ [CLAUDE.md](./CLAUDE.md)

Append-only log of non-obvious decisions and gotchas for the web app. Newest
first. One entry per learning.

## Format
```
## YYYY-MM-DD — <short title>
**Problem:** …  **Decision:** …  **Why:** …
```

## 2026-07-31 — Hover popover that lazy-loads: mount content only while open
**Problem:** A hover popover on every PR-list row must show finding details, but fetching all rows' findings upfront is wasteful. **Decision:** `HoverCard` (pulls/_components/HoverCard) renders its content **only while `open`**; the list popover content (`ListFindingsPreview`) calls `usePrReviews(prId)` and thus fires the request only when the card mounts (on hover). **Why:** No `enabled` flag or hook changes needed — mount-gating is the trigger. TanStack caches by `["reviews", prId]`, so re-hover is instant. There is no Popover/Tooltip/HoverCard primitive in `@devdigest/ui`, so this small component fills the gap.

## 2026-07-31 — PR-detail findings are grouped per run; PR-wide filters live in FindingsTab
**Problem:** A PR-wide severity filter/tally has no single findings list to hook into — findings render per review run (`FindingsTab` → `ReviewRunAccordion` → `FindingsPanel`, one panel per run). **Decision:** Lift the aggregate (counts from `reviews.flatMap(r => r.findings)`) and the active-filter state to `FindingsTab`, thread `severityFilter` down into every `FindingsPanel`, and hide accordions with zero matches. **Why:** Matches how the detail page already fans findings across runs; computing counts from the already-fetched reviews keeps them consistent with what's rendered and needs zero extra requests.

## 2026-07-31 — next-intl keys need a dev restart + hard refresh to appear
**Problem:** A newly-added message key rendered as its raw path (e.g. `runs.trace.stat.cost`) even though the JSON was correct. **Decision:** After editing `messages/en/*.json`, restart the web dev server and hard-refresh. **Why:** `src/i18n/request.ts` reads messages via fs and they're hydrated into `NextIntlClientProvider` at page load; client-side navigation reuses the stale hydrated set, so a missing key falls back to the dotted path until a fresh server render.

## 2026-07-31 — Shared contracts have no sync script; mirror server→client
**Problem:** Client didn't see a contract field added on the server. **Decision:** Every `@devdigest/shared` change edited in `server/src/vendor/shared/contracts/*` must be hand-copied to `client/src/vendor/shared/contracts/*`. **Why:** No vendor-sync script exists; the vendored client copy is what the app validates against, so a one-sided edit drops the field with no error.

## 2026-08-01 — @devdigest/ui (incl. nav.ts) is vendored but NOT synced — edit it directly
**Problem:** Adding a sidebar entry (Skills) meant editing `src/vendor/ui/nav.ts`, but `src/vendor/*` is flagged do-not-touch. **Decision:** Add nav entries directly in `client/src/vendor/ui/nav.ts` (the `NAV` array + `SHORTCUTS`). **Why:** `scripts/sync-shared.sh` only mirrors `@devdigest/shared` (server→client); there is NO upstream source for `@devdigest/ui` and no CI check over it — the vendored `ui/` dir IS the de-facto source. The `activeKeyFor()` highlight logic already handles `/skills`, but the visible sidebar link only exists once it's in `NAV`. (The do-not-touch rule is really about `shared`, which contracts-sync CI enforces.)

## 2026-08-01 — recharts chart files MUST carry "use client" or dev RSC crashes
**Problem:** `/`, `/agents` (any route using `app/loading.tsx`) threw `TypeError: Super expression must either be null or a function` at `vendor/ui/charts/LineChart.tsx` — but ONLY in `pnpm dev`, never in `pnpm build`. **Decision:** Every chart file importing `recharts` (`vendor/ui/charts/LineChart.tsx`, `Donut.tsx`) must start with `"use client";`. **Why:** `loading.tsx` (a Server Component) imports `Skeleton` from the `@devdigest/ui` barrel; in dev the barrel is NOT tree-shaken, so `charts/index.ts` → recharts gets evaluated in the RSC/server graph, and recharts' class components fail `class extends <undefined>` under RSC. Prod hides it because tree-shaking drops the unused charts from that server module. The `"use client"` boundary keeps recharts out of the server graph entirely.
