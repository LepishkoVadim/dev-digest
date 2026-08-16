---
name: workflow-retro
description: "Use when a multi-agent workflow, subagent fan-out, or /run-plan pipeline has finished and you want a retrospective on HOW the run went — token spend, agent count and launch order, per-agent difficulties, duplicated work, coverage gaps — plus concrete recommendations for the next run. Manual trigger only; writes a report to chat and appends to docs/retro/ledger.md. Trigger terms: workflow retro, retro, retrospective, how did that run go, review the workflow run, post-mortem the agents, evaluate the workflow."
metadata:
  tags: retro, retrospective, workflow, multi-agent, orchestration, post-mortem, ledger, evaluation
---

# workflow-retro — retrospective on a multi-agent run

Manual retrospective for a finished multi-agent workflow / subagent fan-out / `/run-plan`.
Produces **analytics AND proposals** — never just numbers. Output goes to **chat** and is
appended to **`docs/retro/ledger.md`**.

**Manual only.** This skill is invoked by hand. Do NOT wire it into a Stop / PostToolUse /
cron hook — a retro that fires itself is noise. If asked to "make it automatic", push back.

## Boundary vs engineering-insights

- **`INSIGHTS.md`** (engineering-insights skill) = durable facts about the **code** (gotchas, footguns).
- **This ledger** = facts about the **run** (how the orchestration itself went). Different audience,
  different file. If a code gotcha surfaces during the retro, route it to `INSIGHTS.md`, not here.

## Data source

- **Default — in context.** Reason from what this conversation already holds: workflow results,
  `<task-notification>` blocks, agent summaries the main loop saw, the workflow script.
- **`deep`** (say "deep retro") — also read the persisted per-agent transcripts
  (`agent-*.jsonl` in the session/transcript dir) and `TaskOutput` for exact token / turn / cost
  numbers and verbatim agent difficulties. Use when the in-context numbers are approximate or the
  main loop only saw summaries.

State which mode you used in the report header; never present in-context estimates as exact.

## Output contract (fill every section, in order)

1. **Header** — date, workflow name/goal, trigger (manual), data source (in-context | deep).
2. **Metrics** — total tokens for the run · agents launched (count) · **launch order** (list, grouped
   by phase) · wall-clock · cost (if available) · retries / null-returns / failed agents.
3. **Per-agent notes** — for each agent: what was **hard**, what was **easy**, context/work it
   **duplicated** with another agent, what it **missed**.
4. **Cross-cutting** — redundancy across agents · coverage gaps · was the orchestration **shape**
   (parallel / pipeline / barrier) the right one?
5. **Recommendations** — concrete, next-run changes. Not "do better" — name the agent, the phase,
   the edit.
6. **Module insights** — per-module meta-insights about the run (one bullet per module touched).

Then append sections 1–6 as one dated entry to the **top** of `docs/retro/ledger.md`
(create the file with an `# Workflow retro ledger` header if missing). Newest first.

## What to look for (recommended evaluation lenses)

Beyond the raw counts, evaluate:

- **Parallelism efficiency** — wall-clock vs sum-of-agent-time. A `parallel()` barrier where the
  slowest agent was 3× the fastest wasted the fast ones' idle time → suggest `pipeline()`.
- **Cost concentration** — which single agent / phase dominated spend; is it over-modelled for its task?
- **Signal ratio** (review/research workflows) — findings proposed vs survived verification. Low ratio =
  finders too noisy or verifiers too lax.
- **Schema-retry count** — agents that failed structured output and retried; a recurring one means a
  bad schema or prompt, not a flaky model.
- **Redundant context** — the same files/context loaded independently by N agents → candidate for a
  single shared pre-read passed down.
- **Silent caps** — top-N slices, no-retry, sampling that bounded coverage without saying so.
- **Model-tier fit** — agents over- or under-modelled for their task.
- **Trend** — compare against the previous ledger entries; call out regressions and improvements.

Report only the lenses that actually apply to the run — don't pad.

## Common mistakes

- Numbers with no proposals → violates the "analytics AND proposals" purpose. Every metric that
  looks off gets a recommendation.
- Presenting in-context estimates as exact → say "in-context, approximate" or go `deep`.
- Dumping the whole per-agent transcript → summarise; the ledger is a record, not an archive.
- Writing code gotchas into the ledger → those go to the module `INSIGHTS.md`.

<!-- ponytail: single-file skill, no scripts. The "ledger" is a plain markdown append — no tooling
     needed. Skipped the writing-skills subagent pressure-test rig: this is a manual analytics
     report generator, not a discipline gate; the failure mode is a vague report, which the output
     contract above addresses directly. Add the rig if the report shape proves unreliable in use. -->
