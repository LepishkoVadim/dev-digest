# Skills — demo & control experiments

The point of Skills: reusable, versioned prompt blocks that attach to agents and
change what a review catches. This doc is the manual walk-through (the "control
experiment") — the feature itself is seeded, so `./scripts/dev.sh` +
`cd server && pnpm db:seed` is enough to reproduce it.

## What's seeded

- **Skills** (`/skills`): `pr-quality-rubric` (rubric/manual), `no-then-chains`
  (convention/extracted), `secret-leakage-gate` + `lethal-trifecta`
  (security/community), `phantom-api-gate` (security/extracted, **disabled** — an
  unvetted import), `test-coverage-nudge` (custom/manual).
- **Agents**: Security Reviewer links 3 skills; **Test Quality Reviewer** (new)
  links `test-coverage-nudge` + `pr-quality-rubric`.

## Whole path once (do this on video)

1. **Create** a skill at `/skills` → Add Skill → Create from scratch.
2. **Import** one: Add Skill → Import from file → drop a `.md` or a `.zip`
   (the archive's core `SKILL.md`/first `*.md` is extracted server-side;
   scripts and binaries in the archive are never read). It lands **disabled**
   ("needs vetting") — its body is stored as untrusted data.
3. **Trust story**: a foreign skill is foreign instructions in the agent's
   prompt. Non-`manual` skills are wrapped in `<untrusted>…</untrusted>` and a
   disabled skill never reaches a prompt at all — vet, then enable.
4. **Attach**: open an agent → **Skills** tab → check skills, drag order
   (order = block order in the prompt).

## Control experiment A — Test Quality

PR with a test covering only the happy path.

- **Without skills** (unlink `test-coverage-nudge` from Test Quality Reviewer,
  or run a bare agent): the review passes — the uncovered branch is not flagged.
- **With skills** (re-attach `test-coverage-nudge` + `pr-quality-rubric`): the
  review flags the uncovered branch and the missed edge case.

## Control experiment B — API contract

PR changing a route handler's signature (a breaking change).

- **Without skills**: passes — no breaking-change finding.
- **With skills** (attach a convention/rubric skill describing API-contract
  stability): the breaking change is flagged.

## Seeing the skills block + token cost

Run either agent on a PR, open the run in the PR detail → **Run trace** →
**Prompt assembly**. The `Skills / rules` block is rendered there (untrusted
skills shown inside `<untrusted>` delimiters), and the token stats show the
added tokens the skills contributed to the prompt.
