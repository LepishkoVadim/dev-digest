---
name: pr-self-review
description: "Local pre-PR self-review gate for DevDigest. Runs on all open changes (working tree + branch commits not on origin/main) before a PR is opened — manually or automatically before `git push` / `gh pr create`. Dispatches our existing skills as review lenses by scope (UI skills on client/**, backend/architecture skills on server/** + reviewer-core/**), plus fast deterministic gates (secret scan, new Onion arch violation, shared-contract drift). BLOCKS the PR if any critical finding survives. Trigger terms: pr self review, pre-PR check, before opening a PR, review my changes, can I merge, self review, pre-push review, check my diff."
metadata:
  tags: pr-self-review, code-review, pre-pr, gate, diff, security, onion-architecture, hook, quality
---

# PR Self Review (pre-PR gate)

Reviews **all open local changes** before a PR is opened and **blocks on any critical
finding**. It is an **orchestrator**, not a new reviewer: deterministic checks run in a
script; the per-file review reuses our existing skills as lenses.

## When to use

- The user says "run PR self review", "review my changes", "can I merge this", or invokes `/pr-self-review`.
- **Before you run `gh pr create` or `git push`** — run this first and do not open the PR if it BLOCKs.
- A `pr-self-review.sh` hook just blocked a push and the user wants the findings explained/fixed.

## Two parts

**1. Mechanical gate (fast, deterministic — `scripts/pr-self-review.sh`).**
Owns the three deterministic *critical* gates and is what the `PreToolUse` hook runs before a
push. Run it first:

```bash
./scripts/pr-self-review.sh          # human report; exit 1 on BLOCK
./scripts/pr-self-review.sh --json   # + machine verdict line (for CI reuse)
```

It checks: **secret scan** on added lines · **new Onion violation** (`arch:check --ignore-known`,
so the ~10 legacy violations don't block) · **shared-contract drift** (`sync-shared.sh --check`).
If it BLOCKs, stop — report those first; the LLM pass is moot until they're fixed.

**2. LLM lens pass (you, the agent).** If the mechanical gate passes, run the per-file review below.

## Diff → lens dispatch

Compute the change set, classify by path, run **only** the lenses whose files are present —
**scoped to changed hunks (added/modified lines), not whole files.**

```bash
base=$(git merge-base origin/main HEAD)
git diff --name-only "$base"; git ls-files --others --exclude-standard   # + untracked
```

| Changed files | Lens skills to apply |
|---|---|
| `client/**` (`.tsx/.ts/.css`) | `frontend-ui-architecture`, `react-best-practices`, `next-best-practices`, `react-testing-library` |
| `server/**`, `reviewer-core/**` | `onion-architecture`, `fastify-best-practices`, `drizzle-orm-patterns`, `postgresql-table-design` |
| `**/vendor/shared/**` + any `.ts` above | `zod`, `typescript-expert` |
| **every changed file** | `security` (OWASP lens) |
| skip (not reviewers) | `mermaid-diagram`, `engineering-insights` |

New skill added to the repo? Add one row here. Fan the lenses out as parallel subagents for speed.

## Process

1. Run `./scripts/pr-self-review.sh`. If it BLOCKs → report the criticals, stop.
2. Empty change set → PASS, nothing to review.
3. For each present group, apply its lenses to that file subset's changed hunks.
4. Advisory mechanical checks (never block): `pnpm lint` / `pnpm typecheck` on affected packages.
5. **Verify criticals adversarially.** For each LLM-produced `critical`, run one quick pass that
   tries to *refute* it; keep it only if it survives. (Mechanical criticals skip this — already
   deterministic.) False blocks are what get the whole gate disabled.
6. Normalize findings to `{severity, file:line, lens/rule, why, fix}`.
7. **Verdict:** BLOCK if ≥1 surviving `critical`; else PASS (list high/medium/low as advisory).
8. On PASS, optionally draft the PR description from the diff + advisory findings.

## Severity rubric — `critical` (= BLOCK)

- **Security**: injection (SQLi/XSS), auth/authorization bypass, secret in git/DB, unsafe
  deserialization, SSRF (OWASP Top 10).
- **Backend architecture**: a **new** Onion dependency-rule violation (domain→infra, route→DB,
  app→ORM, cross-module internals). The script's `arch:check --ignore-known` decides this.
- **Broken contract**: hand-edited **vendored** `vendor/shared` copy, or client/server shared
  drift (`sync-shared.sh` / `contracts-sync.yml`).
- **Data-loss hazard**: destructive migration / unguarded delete/overwrite.

Everything else (naming, perf smell, missing test, style) → high/medium/low, **advisory only**.
Keep the rubric tight; widen only when a real miss shows a gap.

## Blocking & escape hatch

- **Block**: BLOCK means do not open the PR. As a `PreToolUse` hook the script exits 2, aborting
  the `git push` / `gh pr create`.
- **Escape hatch (logged)**: `[skip-review]` in the latest commit subject, or `PR_SELFREVIEW=0`,
  bypasses the gate for a hotfix and records who/when/why to `.pr-self-review-audit.log`. Use it
  rarely; the override is visible in review.

## Related

Lens skills live in [`../README.md`](../README.md). Full rationale + build notes: [`PLAN.md`](./PLAN.md).
