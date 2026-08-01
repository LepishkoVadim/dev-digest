# e2e — Docs index
↑ [CLAUDE.md](../CLAUDE.md) · [README](../README.md)

Deep-dive e2e design notes for `@devdigest/e2e`. `CLAUDE.md` is the map, the
[README](../README.md) is the overview (flow format, run modes); this folder holds
the "why" behind non-obvious e2e decisions. Nothing has been extracted into a
standalone doc yet — the table maps each concern to where it lives and when it's
worth pinning as a doc.

## Design surface

| Area | Where it lives today | Extract a doc when |
|------|----------------------|--------------------|
| Flow format — JSON list of agent-browser commands | `specs/NN-name.flow.json`, run by `run.ts` | you extend the format (new step kinds, assertions) |
| Deterministic-locator rule — `--url` / `--text` / `find`, never `chat` | `run.ts` + convention | you relax or formalize the locator policy |
| Hermetic runner — isolated seeded stack on alt ports | `scripts/e2e.sh` (Postgres :5433, API :3101, web :3100) | you change the isolation model or port scheme |
| CI integration — path-filtered workflow, screenshot artifacts | `.github/workflows/e2e-web.yml` | you change how CI provisions or captures the run |

Keep the flow format and run instructions in [`../README.md`](../README.md); the
flow coverage table lives in [`../specs/README.md`](../specs/README.md). Add a doc
here only for a design decision neither covers. Link, don't copy.
