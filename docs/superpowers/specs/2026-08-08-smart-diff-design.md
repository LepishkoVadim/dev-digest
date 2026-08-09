# Smart Diff — design

Sort a PR's changed files by risk so the reviewer sees business logic first, not
lock files or generated code. **No new LLM call** — deterministic composition of
already-imported PR files with the findings of the latest review.

## What already exists (reused, not rebuilt)

- **Contract**: `SmartDiff` in `server/src/vendor/shared/contracts/brief.ts`
  (`groups[{ role, files[{ path, additions, deletions, finding_lines,
  pseudocode_summary? }] }]` + `split_suggestion{ too_big, total_lines,
  proposed_splits }`). Already re-exported and imported by `review-api.ts`.
- **Data**: `GET /pulls/:id` returns `files[{ path, additions, deletions, patch }]`;
  findings live in `findings` (`file`, `start_line`, `end_line`, `severity`) via
  `reviews` (`kind:'review'`).
- **UI**: `components/diff-viewer` (`DiffViewer` → `FileCard` → `CodeLine`,
  `parsePatch`) already renders unified-diff patches, wired into `DiffTab`.

## Backend — `server/src/modules/pulls/`

- `smart-diff.constants.ts` — `BOILERPLATE_PATTERNS`, `WIRING_PATTERNS` (regex
  lists), `TOO_BIG_TOTAL_LINES`. Core = anything not wiring/boilerplate.
- `smart-diff.ts` — pure `classifyRole(path)` + `buildSmartDiff(files, findings)`:
  classify each file, attach `finding_lines` (union of `start_line..end_line` for
  that file), compute `split_suggestion` (too_big when total changed lines exceed
  the threshold and >1 top-level dir; splits group non-boilerplate files by
  top-level dir). `pseudocode_summary` left null — it would need the forbidden LLM.
- `smart-diff.test.ts` — hermetic unit test (classification, finding-line mapping,
  split suggestion).
- `routes.ts` — `GET /pulls/:id/smart-diff`: resolve PR (workspace-scoped) → its
  `prFiles` + findings across the PR's `kind:'review'` reviews →
  `buildSmartDiff(...)`. Type-only serialization (matches every other route —
  none set a `response` schema).

### Findings scoping
Badges aggregate findings across **all** of the PR's `review`-kind reviews (deduped
by file+line span), matching the PR-list severity tally. A single "Run Review"
with `all:true` produces one review row per agent; scoping to one row would drop
most badges. Trivially switchable to newest-row-only if required.

## Frontend — `client/`

- `src/lib/hooks/smart-diff.ts` — `useSmartDiff(prId)` → `GET /pulls/:id/smart-diff`
  (React Query, `["smart-diff", prId]`).
- `components/diff-viewer/SmartDiffViewer/` — renders groups core → wiring →
  boilerplate; boilerplate collapsed by default; a **Smart order / Original order**
  toggle (mockup, near-free). Joins each `SmartDiffFile` to the `PrFile` (patch) by
  path and reuses `FileCard`. Falls back to flat `DiffViewer` if smart-diff errors
  or hasn't loaded.
- `FileCard` gains optional `findingLines?: number[]`: auto-expands, renders a
  clickable **N findings** badge that scrolls to the first finding line.
- `CodeLine` gains optional `isFinding` / `anchorId`: highlights the line and sets
  a DOM id for scroll-to. Both changes are additive — existing usage unaffected.
- `DiffTab` renders `SmartDiffViewer` instead of `DiffViewer`.
- i18n: new keys under `diffViewer` in `messages/en/shell.json`.

## Not in scope
- `pseudocode_summary` (needs an LLM the spec forbids).
- The demo video and the actual `git push` / PR open — author-produced.
