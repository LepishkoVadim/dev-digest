---
name: dependency-checker
description: >-
  Analyze the dependencies of this monorepo and produce a structured, developer-facing
  report: a Mermaid graph of how components depend on each other, per-component tables of
  external packages with their on-disk size, a security audit summary, and a prioritized
  list of concrete recommendations. Use this skill whenever the user asks to audit, map,
  review, visualize, or clean up dependencies — including questions like "which packages
  are heaviest", "what's duplicated across our packages", "draw our dependency graph",
  "are our deps out of date or vulnerable", "how are client/server/reviewer-core coupled",
  or any request to understand what the repo depends on and what to do about it. Trigger it
  even when the user doesn't say the word "dependencies" but clearly wants a picture of the
  packages, their sizes, or the coupling between components.
---

# Dependencies Checker

Produce one structured report that a developer can open and immediately act on. The report
answers four questions in order: **what components exist and how are they coupled**,
**what do they depend on and how heavy is it**, **is any of it vulnerable**, and **what
should we do first**.

The heavy, error-prone data gathering (walking the tree, measuring sizes, running audits,
grepping imports) is done once by a deterministic script so every run is fast and
repeatable. Your job is to run it, interpret the JSON, and write the report. Do not
re-derive the data by hand — the script already handles the monorepo's quirks (mixed
package managers, pnpm symlinks, git-ignored clones).

## Workflow

1. **Collect.** From the repo root, run the collector and capture its JSON:

   ```bash
   mkdir -p docs/dependencies
   node .claude/skills/dependency-checker/scripts/collect.mjs > docs/dependencies/deps.json
   ```

   It emits one JSON document (schema below). It never writes anywhere except stdout, so
   the redirect is what saves `deps.json`. It may take a minute if `node_modules` is large;
   that's the size measurement.

2. **Read `docs/dependencies/deps.json`.** Understand what's there before writing prose.
   Pay attention to the interpretation notes below — a few numbers mean less than they look.

3. **Resolve internal aliases.** The internal graph is built from *import specifiers*
   (e.g. `@devdigest/ui`, `@devdigest/shared`), not from `package.json` deps — in this repo
   components don't declare each other as workspace packages, they import via TS path
   aliases. To turn a specifier into a real component, read the relevant `tsconfig.json`
   `compilerOptions.paths` (start with the importing component's tsconfig). Map each alias to
   the directory it points at, then draw the edge to that component. If an alias points
   inside the same component, it's an internal module, not a cross-component edge — skip it.

4. **Write `docs/dependencies/report.md`** using the exact template below.

5. **Summarize in chat**: 3-5 bullets — the biggest size sink, any vulnerabilities, the
   worst version conflict, and the top recommendation. Link to the report file.

## Interpreting `deps.json` (read before writing)

- **`components[].sizes`** is **on-disk** size (`du -skL`, symlinks dereferenced so pnpm's
  store-linked packages report their real footprint). This is install footprint, *not*
  shipped bundle size. Say "on-disk" in the report so nobody confuses it with what ships to
  users. A package with `installed: 0` simply isn't installed in that component (deps not
  run there) — report it as "not installed", not "0 MB".
- **`sizes.packages`** is every top-level installed package, largest first. The heaviest few
  are what matter; you don't need to list all of them.
- **`orphans`** are directories that have `node_modules` but no `package.json`. They're
  usually stale installs — worth flagging for deletion, but they have no manifest to analyze.
- **`duplicates`** = external packages declared by more than one component. Normal in a
  polyrepo-style monorepo, but each one is a maintenance and size cost.
- **`versionConflicts`** = a subset of duplicates where the declared ranges differ across
  components. These are the ones that bite (two versions of the same lib, subtle behavior
  drift), so rank them above plain duplicates.
- **`audit.status`**: `ok` means real counts in `severities`. `unavailable` means the audit
  couldn't run (usually offline — audit needs the registry); `skipped` means no lockfile.
  Never report "0 vulnerabilities" when the status isn't `ok` — report "audit unavailable"
  and say why, so a network failure isn't mistaken for a clean bill of health.
- **Mixed managers**: `manager` is per-component (`pnpm`/`npm`/`yarn`/`none`). Note it — an
  upgrade command that works in one component won't work in another.

## `deps.json` schema (abridged)

```
orgScope            string|null   detected shared scope, e.g. "@devdigest"
components[]        {
  dir               string        path relative to repo root
  name, version     string|null   from package.json
  manager           "pnpm"|"npm"|"yarn"|"none"
  dependencies      {name: range} devDependencies same shape
  depCount, devDepCount  number
  sizes             { packages: [{name, kb}], totalKb, installed }
  audit             { status, severities: {info,low,moderate,high,critical}, reason? }
}
internalImports     { [componentDir]: { [importSpecifier]: count } }
duplicates[]        { pkg, count, components[] }
versionConflicts[]  { pkg, ranges: [{component, range}] }
orphans[]           string[]      dirs with node_modules but no package.json
```

## Report structure

Write `docs/dependencies/report.md` with EXACTLY these sections, in this order. Scale each
to what the data actually shows — don't pad, don't invent findings the data doesn't support.

```markdown
# Dependency Report — <repo name>

_Generated <date>. Source data: `deps.json` (regenerate with the dependency-checker skill)._

## 1. Overview

One short paragraph: how many components, which package managers, total external
dependencies, total on-disk footprint. Then a table:

| Component | Package | Manager | Deps (prod/dev) | Installed pkgs | On-disk |
|-----------|---------|---------|-----------------|----------------|---------|
| client | @devdigest/web | pnpm | 11 / N | 30 | 336 MB |
| ... |

## 2. Internal dependency graph

A Mermaid `graph LR` showing which component imports which (resolved from import
specifiers via tsconfig aliases — see the skill). One node per component; edge A --> B
means A imports from B. Label edges with the import count if useful. Call out any cycles
explicitly beneath the diagram — a cycle between components is an architectural smell.

​```mermaid
graph LR
  client --> shared
  client --> ui
  ...
​```

If a specifier can't be resolved to a component, list it under the diagram as
"unresolved aliases" rather than dropping it silently.

## 3. External dependencies by size

Per component, a table of the heaviest installed packages (top ~10), largest first:

| Package | On-disk | Notes |
|---------|---------|-------|

Note = why it's heavy or whether it's a candidate to trim (e.g. "dev-only", "pulls a
native toolchain", "used in one place"). Only add a note when you have a basis for it.

## 4. Duplication & version conflicts

- **Version conflicts** (rank first): table of `package | components & ranges | risk`.
- **Duplicates** (same version, multiple components): shorter list — these are lower risk.

## 5. Security audit

Per-component severity counts. If any component's audit is `unavailable`/`skipped`, state
that plainly and how to run it (`<manager> audit` in that component with network access).

| Component | Critical | High | Moderate | Low | Status |
|-----------|----------|------|----------|-----|--------|

## 6. Prioritized recommendations

The payoff section. A numbered list, highest impact first, each item:
**[Priority] Action — rationale — where.** Priorities:

1. **Critical** — known vulnerabilities (high/critical audit findings). Fix now.
2. **High** — version conflicts of the same package across components; orphaned
   `node_modules` to delete.
3. **Medium** — heavyweight dependencies used in one or few places (candidates to replace
   with something lighter or native); duplicated packages worth consolidating.
4. **Low** — nice-to-haves: dedupe minor duplicates, tidy devDependencies.

Every recommendation names the component(s) and the concrete next step (a command, a
package to drop, a version to align on). No vague "consider reviewing X".
```

## Notes

- The collector is offline except the audit step, which needs the npm registry. Everything
  else works with no network. If audits come back `unavailable`, the rest of the report is
  still fully valid — just say the audit needs a networked re-run.
- Don't add a dependency to run this. The collector is plain Node with zero packages; keep
  it that way.
- If the user wants the report somewhere other than `docs/dependencies/`, honor that — the
  path is not sacred, the structure is.
