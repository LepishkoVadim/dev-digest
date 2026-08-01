# reviewer-core — Docs index
↑ [CLAUDE.md](../CLAUDE.md) · [README](../README.md)

Deep-dive engine design notes for `@devdigest/reviewer-core`. `CLAUDE.md` is the
map, the [README](../README.md) is the overview (pipeline + public API); this
folder holds the "why" behind non-obvious engine decisions. Nothing has been
extracted into a standalone doc yet — the table maps each stage to where it lives
in code and when it's worth pinning as a doc.

## Design surface

| Stage | Where it lives today | Extract a doc when |
|-------|----------------------|--------------------|
| Prompt assembly + untrusted-content fencing | `src/review/prompt.ts` (`assemblePrompt`, `wrapUntrusted`, `INJECTION_GUARD`) | you change the injection-defense model |
| Grounding gate — mandatory citation check vs the diff | `src/review/grounding.ts` (`groundFindings`) | you change what counts as a valid citation or how the score is recomputed |
| Structured output — Zod → JSON Schema, parse-with-repair | `src/llm/*` | you change the repair strategy or provider contract |
| Run orchestration — single-pass + `reduce` (map-reduce) | `src/review/run.ts` | you add a multi-pass or reduce strategy |
| Optional prompt slots (`skills`, `memory`, `specs`, `callers`) | `assemblePrompt` (omitted in the starter) | a course lesson starts feeding a slot |

Keep the pipeline diagram and public API in [`../README.md`](../README.md); add a
doc here only for a decision that outlives a single function. Link, don't copy.
