# Agents

Subagents for DevDigest. Each runs in its **own context window**, sees none of the
main conversation's history, and returns a single structured report. This file is
the **map** — the rules live in each agent's own markdown body.

## Catalog

| Agent | Role | Writes files? | Model |
|-------|------|---------------|-------|
| [researcher](researcher.md) | Finds where something is implemented and how it works; external docs research | No | `sonnet` |
| [devdigest-planner](devdigest-planner.md) | Turns a task into a Development Plan before any code is written | No | inherit |
| [devdigest-implementer](devdigest-implementer.md) | Executes an approved plan across the packages, runs the repo's gates | Yes | inherit |
| [devdigest-test-writer](devdigest-test-writer.md) | Writes/extends tests per package from a plan or from code that landed | Yes (tests only) | `sonnet` |
| [devdigest-architecture-reviewer](devdigest-architecture-reviewer.md) | Read-only boundary review: Onion, `reviewer-core/` purity, contract drift, CI coupling | No | `sonnet` |
| [devdigest-plan-verifier](devdigest-plan-verifier.md) | Read-only plan↔code correspondence audit, one row per plan item | No | `sonnet` |
| [devdigest-doc-writer](devdigest-doc-writer.md) | Turns implemented work into routed docs with Mermaid diagrams | Yes (markdown only) | `sonnet` |

**Model tiering (why).** `planner` and `implementer` stay on `inherit` (the
session's Opus) — open-ended design and cross-package edits are where the strong
model earns its cost. The other four run on `sonnet`: they execute against an
*explicit spec* the strong model already produced — a plan to audit, a rule file
to check against, tests to write from a plan, docs from settled code. Their
verdict is anchored to something falsifiable (`arch:check` output, a `file:line`
rule, the plan text), so a cheaper model does not weaken the check. The gates the
reviewers run first (`arch:check`, `depcruise`, `sync-shared.sh --check`) are
deterministic bash — model-independent by construction. If `architecture-reviewer`
on `sonnet` ever misses a boundary smell the gates cannot catch, flip that one
back to `inherit` — it is the most judgment-heavy of the four.

**Security review is not in this set.** Architecture review is
(`devdigest-architecture-reviewer`); security remains an open gap, and planner,
implementer and test-writer are all configured so they cannot review their own
work.

## Pipeline

```
task ──▶ devdigest-planner ──▶ Development Plan ──▶ [you approve]
                                      │
                                      ▼
                          devdigest-implementer ──▶ Change Report
                                      │
              ┌───────────────────────┼───────────────────────┐
              ▼                       ▼                       ▼
   devdigest-test-writer   devdigest-architecture-   devdigest-plan-verifier
        (Test Report)        reviewer (Arch Review)   (Plan Verification)
              │                       │                       │
              └───────────────────────┴───────────────────────┘
                                      │
                                      ▼
                          devdigest-doc-writer ──▶ Documentation Report
                                      │
                                      ▼
                   ./scripts/pr-self-review.sh (PreToolUse hook on push)
```

- `devdigest-test-writer` takes **either** a Development Plan (tests for planned
  work) **or** a Change Report plus the diff (backfill for what landed). It
  writes files, so it runs before the read-only reviewers — its tests become
  part of the diff they audit.
- `devdigest-architecture-reviewer` and `devdigest-plan-verifier` are
  independent: one asks "does this respect the boundaries", the other "does this
  match the plan". Neither writes, so the order between them does not matter.
- `devdigest-doc-writer` runs last, on settled code. Documenting a diff that is
  about to change is waste, and a diagram is the first thing to rot.

There is no automatic context transfer between subagents. The plan text **is** the
handoff — pass it to the implementer explicitly.

`researcher` sits outside this pipeline: use it when you do not yet know enough to
state the task.

## Orchestration cost discipline

Each subagent is a fresh context window with its own system prompt and skill
preload (~32k tokens before it reads a line). The spend is dominated by (a) how
many agents you spawn, (b) how big each handoff artifact is, and (c) which model
each runs on. Rules that cut tokens without cutting a check:

- **Ground once; hand off by reference, not by value.** Write the file:line map
  and the plan to a file (`docs/plans/…` or `/tmp`) and pass the *path*. A later
  agent re-reads what it needs; you are not re-piping 50KB of prose through every
  prompt. Derived artifacts (map, plan, Change Report) travel by reference.
- **Verifiers read ground truth fresh — never summarize code to a verifier.** The
  diff and the source are the one thing you do *not* pre-digest: `git diff` is
  cheap and a summary is exactly where a real defect hides. `architecture-reviewer`
  and `plan-verifier` re-derive the diff themselves — that is the check, not
  waste. Do not paste the diff into their prompt; name the commit range.
- **Do not delegate a search and then redo it inline.** One `Explore` (or one
  direct sweep), not both. If you dispatched the grounding, wait for it and use
  it; re-grepping the same files in the main loop pays for the same read twice.
- **Collapse the grounding fan-out.** Multiple read-only maps of the same
  codebase are one agent with a combined brief, not three — the system-prompt and
  skill-preload overhead is per-agent, and their outputs overlap anyway. Fan out
  only when the sub-tasks are genuinely independent *and* run in parallel for
  wall-clock, not for coverage.
- **Right-size the artifact to its reader.** A plan the implementer executes does
  not need the grounding re-quoted (the planner is told this in "Reference, do not
  restate"); a Change Report trims command output to a tail, not a transcript.
- **Match the model to the task, not to the pipeline.** The four spec-anchored
  agents run on `sonnet` (see the Catalog note). Reserve `inherit`/Opus for the
  planner and implementer, and pass `model: 'sonnet'`/`'haiku'` at the call site
  for any one-off mechanical sweep (a grep-and-report, a sync check).

Sequential-by-data-dependency ≠ needs-its-own-agent: if step B only reformats
step A's output, do it in A. Spawn B when it needs a fresh context, a different
model, or a tool the current agent lacks — not because it is "a separate concern".

## Contracts

| Agent | Reads | Returns |
|-------|-------|---------|
| `researcher` | repo (Glob → Grep → Read → `git log`), or external docs | Report: Question / Conclusion / Evidence / Not found / Uncertainties |
| `devdigest-planner` | root + module `CLAUDE.md`, **every touched `INSIGHTS.md`**, `TESTING.md`, `docs/ARCHITECTURE.md`, `.dependency-cruiser.cjs` | **Development Plan**, §1–§8: scope · modules · constraints · **§4 skills per scope** · ordered steps with *done when* · contract/DB impact · verbatim verification commands · risks |
| `devdigest-implementer` | the Development Plan, module `CLAUDE.md` + `INSIGHTS.md` | **Change Report**: plan compliance · commands run with exit codes · deviations · **not verified here** · insight candidates |
| `devdigest-test-writer` | the plan or Change Report, `TESTING.md`, module `CLAUDE.md` + `INSIGHTS.md`, the code under test | **Test Report**: tests added/changed with the regression each catches · commands run with exit codes · coverage of the plan · not verified here · insight candidates |
| `devdigest-architecture-reviewer` | the diff, `server/.dependency-cruiser.cjs`, `onion-architecture`, module `CLAUDE.md`, the workflows | **Architecture Review**: verdict · gates run · findings as *where / code / rule violated / rule defined in* · **checked and clean** · not checked here |
| `devdigest-plan-verifier` | the plan text (pasted by you) plus a diff, commit range or working tree | **Plan Verification**: one row per plan item → `DONE / PARTIAL / MISSING / DEVIATED / UNVERIFIABLE` + `path:line` evidence · contract/DB impact · §7 commands · files changed but not planned |
| `devdigest-doc-writer` | the implemented change, module `CLAUDE.md` + `README.md`, the destination doc | **Documentation Report**: documents written · routing decisions · diagrams · index/map files updated · every claim → `path:line` |

None of these agents writes to `INSIGHTS.md`. They surface candidates; the
`engineering-insights` skill appends at end of session. The two read-only
reviewers *cannot* write it — if the session `Stop` hook demands the recording
step, they are told to say so plainly rather than route around it via `bash`.

## Permissions

| | `researcher` | `planner` | `implementer` | `test-writer` | `architecture-reviewer` | `plan-verifier` | `doc-writer` |
|---|---|---|---|---|---|---|---|
| `tools` | `Read, Glob, Grep, Bash, WebSearch, WebFetch` | `Read, Glob, Grep, Bash, WebFetch, Skill` | *(omitted — inherits)* | `Read, Write, Edit, Glob, Grep, Bash, Skill` | `Read, Glob, Grep, Bash, Skill` | `Read, Glob, Grep, Bash, Skill` | `Read, Write, Edit, Glob, Grep, Bash, Skill` |
| `disallowedTools` | — | — | `Agent` | — | `Edit, Write, NotebookEdit, Agent` | `Edit, Write, NotebookEdit, Agent` | — |
| `permissionMode` | — | — | `acceptEdits` | `acceptEdits` | — | — | `acceptEdits` |
| `skills` (preloaded) | — | all 14 | all 14 | 10 (testing + scope) | 4 | **0** | 3 |

**Why the four new agents preload a subset.** `skills:` costs ~32k tokens per
invocation for the full 14 and does **not** gate access — any agent with the
`Skill` tool can invoke an unlisted skill on demand. Planner and implementer
preload everything because they must reason across the whole catalogue;
`plan-verifier` preloads nothing because it compares two texts and needs no
domain skill to do it. If an agent turns out to skip a skill it needed, add it
to that agent's `skills:` rather than to all of them.

Notes that matter in practice:

- **Read-only is discipline, not a sandbox.** Both `researcher` and
  `devdigest-planner` keep `Bash` (for `git log`, `rg`, `head`), and `bash` can
  write. Each body forbids `>`, `>>`, `tee`, `sed -i`, `patch` explicitly. If you
  need a hard guarantee, drop `Bash` or add a deny rule in `settings.json`.
- **A permissive parent overrides a restrictive child.** If your main session runs
  `bypassPermissions` or `acceptEdits`, a subagent's `permissionMode` is ignored.
- **No `Agent` tool** on planner or implementer — neither can spawn subagents, so
  review stays with the dedicated agents.
- **`skills:` preloads full text (~32k tokens per invocation), it does not gate
  access.** Any agent with the `Skill` tool can still invoke unlisted skills. A
  skill added to `.claude/skills/` after these files were written is *not*
  preloaded — both agents are told to check for newcomers.

## Sources behind the planner / implementer rules

Verified against the live docs, not recalled. Two pages:

- **S1** — [Create custom subagents](https://code.claude.com/docs/en/sub-agents)
- **S2** — [Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)

| Rule | Source | Where it landed |
|------|--------|-----------------|
| Only `name` + `description` required; `description` states *when to delegate* | S1 | Both frontmatters; descriptions are trigger conditions, not job titles |
| "include phrases like **use proactively**" to encourage delegation | S1 | Planner `description` |
| `tools` is an allowlist; `disallowedTools` a denylist subtracted from the inherited pool | S1 | Planner allowlist · implementer `disallowedTools: Agent` |
| "omit `Agent` … to keep one subagent from spawning" | S1 | Both — review stays external |
| `model` defaults to `inherit` | S1 | Field omitted on both, deliberately |
| `skills:` injects **full content** at startup; controls preloading, **not** access | S1 | Both preload all 14; bodies say "already loaded, don't re-invoke" |
| Subagent starts with a **fresh, isolated context window** | S1 | Planner's mandatory read list — it remembers nothing from your session |
| Parent `bypassPermissions`/`acceptEdits` "takes precedence and can't be overridden" | S1 | The read-only caveat above |
| ⚠ Many subagents returning detailed results "can consume significant context" | S1 | Fixed-shape Change Report; command output trimmed to a tail |
| Chaining passes context explicitly between subagents | S1 | Plan text is the handoff artifact |
| **plan-validate-execute**: "create a plan in a structured format, then validate that plan … before executing" | S2 | The whole pipeline; plan is the verifiable intermediate output |
| Feedback loop: "Run validator → fix errors → repeat… **Only proceed when validation passes**" | S2 | Plan §7 gates; implementer must re-run on non-zero exit |
| **Low freedom** for fragile operations: "Run exactly this script… do not add additional flags" | S2 | §7 commands verbatim; `db:migrate` / `sync-shared.sh` / `arch:check` guardrails |
| Third-person descriptions; no vague `Helps with documents` | S2 | Both descriptions name concrete paths and triggers |
| Workflows as ordered, checkable steps | S2 | Plan §5 with *done when*; report opens with a step→status table |
| Avoid time-sensitive / rotting information | S2 | Skill catalogue checked from disk, not hardcoded |
| Consistent terminology | S2 | Module and layer names match root `CLAUDE.md` and CI |

Not applied, worth knowing: S2 recommends **building evaluations before
documentation** (≥3 scenarios, tested across Haiku/Sonnet/Opus). No agent here has
any. Running them on two or three real DevDigest tickets and tuning the
`description` fields from what you observe is the cheapest next step.

## Sources behind the reviewer / test-writer / doc-writer rules

The four newer agents encode findings from external research, not just repo
convention. Each rule below is traceable.

| Rule | Where it landed | Source |
|------|-----------------|--------|
| `Bash` can still write (`echo x > f`); a tools allowlist without `Bash` is the only hard isolation | Both reviewers deny `Edit/Write/NotebookEdit` **and** forbid `>`, `>>`, `tee`, `sed -i`, `patch` in prose | [Create custom subagents](https://code.claude.com/docs/en/sub-agents) |
| `skills:` preloads full text and does **not** gate access | Subset preloading on all four; the table above | [Create custom subagents](https://code.claude.com/docs/en/sub-agents) |
| Agent-authored tests add mocks in 36% of commits vs 26% for humans (1.2M commits, 2,168 repos) | test-writer's over-mocking prohibition | [Hora & Robbes, MSR 2026](https://arxiv.org/abs/2602.00409) |
| AI defaults to over-mocking; instruct it explicitly not to. Weak assertions and verbose test names are the other two failure modes | test-writer's anti-pattern list | [Vitest: Writing Tests with AI](https://main.vitest.dev/guide/learn/writing-tests-with-ai) |
| The "refactoring test": if internals change and behaviour does not, the test must not break | test-writer's philosophy section | [Vitest: Testing in Practice](https://main.vitest.dev/guide/learn/testing-in-practice) |
| Query priority `getByRole` → … → `getByTestId` as escape hatch; `userEvent` is always async | test-writer's client scope rules | [Testing Library: About Queries](https://testing-library.com/docs/queries/about/) |
| Tautological assertions pass after the bug lands — 78% line coverage at 31% mutation score | test-writer's tautology prohibition | [getautonoma](https://getautonoma.com/blog/ai-generated-tests-pass-but-dont-assert) |
| LLM review gains come from **augmenting** static analysers, not replacing them; LLM-validating-LLM is "circular validation" | architecture-reviewer runs `arch:check` / `depcruise --ignore-known` **first** and reports only what the gates cannot see | [arxiv 2502.18474](https://arxiv.org/abs/2502.18474) · [the-regent #120](https://github.com/thiagobutignon/the-regent/issues/120) |
| A finding needs `ruleId` + message + `artifactLocation.uri` + `region.startLine` to be actionable | architecture-reviewer's four-field evidence rule (SARIF's required fields, rendered as markdown for a human reader) | [SARIF 2.1.0 guide](https://www.sonarsource.com/resources/library/sarif/) |
| Single-pass spec-conformance accuracy collapses with plan length (52.4% → 11.0%); two-phase extraction-then-audit recovers to 72–85% | plan-verifier's mandatory two-pass method | [arxiv 2508.12358](https://arxiv.org/html/2508.12358v1) |
| LLM verifiers over-correct: 87.2% false negatives, 48.2% of them "logic error claims without falsifiable evidence" | plan-verifier's `UNVERIFIABLE` status and its forbidden-output section | [arxiv 2603.00539 / Springer AutoSE 2026](https://link.springer.com/article/10.1007/s10515-026-00638-5) |
| Status enumerations beat free text for conformance verdicts (`covered/partially_covered/not_covered`; `pass/fail/skip/uncertain`) | plan-verifier's five-status table | [R2Code](https://arxiv.org/html/2604.22432v1) · [agent-spec](https://github.com/ZhangHanDong/agent-spec) |
| Diátaxis: route by the reader's situation on two axes; blurring categories is the main cause of bad docs | doc-writer's routing preamble | [diataxis.fr](https://diataxis.fr/) |
| MADR 4.0.0 is the current ADR format (superset of Nygard); the point is motivation, not outcome | doc-writer's ADR section | [MADR](https://adr.github.io/madr/) · [Nygard 2011](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions) |
| **GitHub does not render Mermaid C4** — flowchart/sequence/ER/state do render | doc-writer's diagram table | [GitHub Discussion #197898](https://github.com/orgs/community/discussions/197898) · [GitHub Blog](https://github.blog/developer-skills/github/include-diagrams-markdown-files-mermaid/) |
| AI docs are "hollow": they paraphrase code, adopt README voice everywhere, and their diagrams rot within weeks | doc-writer's anti-pattern list and its last-in-pipeline position | [passo.uno](https://passo.uno/whats-wrong-ai-generated-docs/) · [arxiv 2604.08293](https://arxiv.org/pdf/2604.08293) |

## Adding an agent

`name` + `description` are the only required fields — `description` decides whether
Claude ever picks the agent, so write it as *when to delegate*, in third person,
naming concrete paths. `allowed-tools:` and `permissions:` are **skill** fields and
do nothing here; use `tools` / `disallowedTools` / `permissionMode`.

Invoke explicitly with `@agent-<name>`.

---

**Known drift:** [`../skills/README.md`](../skills/README.md) lists 12 skills; the
directory holds 14 (`engineering-insights` and `frontend-ui-architecture` are
missing from that catalog).
