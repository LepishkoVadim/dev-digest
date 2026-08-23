#!/usr/bin/env node
// Deterministic, offline dependency collector for this monorepo.
// Emits a single JSON document to stdout. No network, no npm deps.
//
// What it gathers per component (any dir with a package.json, node_modules skipped):
//   - manifest: name, version, declared dependencies + devDependencies
//   - manager:  pnpm | npm | yarn | none  (from the lockfile that's present)
//   - sizes:    on-disk size of each installed top-level package (du), + total
//   - audit:    severity counts from `<mgr> audit --json` (best-effort; degrades offline)
// Plus repo-wide cross-cutting analysis:
//   - internalEdges:   who imports whom, by source imports of sibling package names / org scope
//   - versionConflicts: same external package pinned to different ranges across components
//   - duplicates:       external packages declared by more than one component
//   - orphans:         dirs with node_modules but no package.json
//
// Usage: node collect.mjs [repoRoot]   (defaults to cwd)

import { execSync } from "node:child_process";
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const root = process.argv[2] ? process.argv[2] : process.cwd();
const SKIP_DIRS = new Set(["node_modules", ".git", ".next", "dist", "build", ".turbo", "coverage"]);
const SRC_EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

// Respect .gitignore so runtime artifacts (build caches, cloned checkouts, etc.)
// never pollute the analysis. If this isn't a git repo, SKIP_DIRS is the only filter.
let gitIgnored = () => false;
try {
  execSync("git rev-parse --is-inside-work-tree", { cwd: root, stdio: "ignore" });
  gitIgnored = (path) => {
    try { execSync(`git check-ignore -q ${JSON.stringify(path)}`, { cwd: root }); return true; }
    catch { return false; }
  };
} catch { /* not a git repo — carry on with SKIP_DIRS only */ }

// ---- discovery ---------------------------------------------------------------

/** Walk the tree collecting dirs that contain a package.json, and dirs that
 *  have node_modules but no package.json (orphans). node_modules subtrees are
 *  never descended into — we only care about the top level of each component. */
function discover(dir, out) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  const names = new Set(entries.map((e) => e.name));
  if (names.has("package.json")) out.packages.push(dir);
  else if (names.has("node_modules")) out.orphans.push(dir);
  for (const e of entries) {
    if (!e.isDirectory() || SKIP_DIRS.has(e.name) || e.name.startsWith(".")) continue;
    const child = join(dir, e.name);
    if (gitIgnored(child)) continue;
    discover(child, out);
  }
}

function readManifest(dir) {
  try { return JSON.parse(readFileSync(join(dir, "package.json"), "utf8")); }
  catch { return {}; }
}

function detectManager(dir) {
  if (existsSync(join(dir, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(dir, "package-lock.json"))) return "npm";
  if (existsSync(join(dir, "yarn.lock"))) return "yarn";
  return "none";
}

// ---- sizes (on-disk, offline) ------------------------------------------------

/** du -sk over each installed top-level package under node_modules (handles
 *  @scope/pkg). Returns [{name, kb}], largest first, plus the summed total. */
function measureSizes(dir) {
  const nm = join(dir, "node_modules");
  if (!existsSync(nm)) return { packages: [], totalKb: 0, installed: 0 };
  const targets = [];
  for (const e of readdirSync(nm, { withFileTypes: true })) {
    if (!e.isDirectory() && !e.isSymbolicLink()) continue;
    if (e.name === ".bin" || e.name === ".pnpm" || e.name === ".cache") continue;
    if (e.name.startsWith("@")) {
      const scope = join(nm, e.name);
      try {
        for (const s of readdirSync(scope, { withFileTypes: true }))
          if (s.isDirectory() || s.isSymbolicLink()) targets.push([`${e.name}/${s.name}`, join(scope, s.name)]);
      } catch { /* ignore unreadable scope */ }
    } else {
      targets.push([e.name, join(nm, e.name)]);
    }
  }
  const packages = [];
  let totalKb = 0;
  for (const [name, path] of targets) {
    let kb = 0;
    // -L dereferences symlinks so pnpm's store-linked packages report their real
    // footprint instead of ~0. stderr is dropped (symlink cycles warn, harmlessly).
    try { kb = parseInt(execSync(`du -skL ${JSON.stringify(path)}`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).split("\t")[0], 10) || 0; }
    catch { kb = 0; }
    totalKb += kb;
    packages.push({ name, kb });
  }
  packages.sort((a, b) => b.kb - a.kb);
  return { packages, totalKb, installed: packages.length };
}

// ---- audit (best-effort; needs registry, degrades gracefully) ---------------

function runAudit(dir, manager) {
  if (manager === "none") return { status: "skipped", reason: "no lockfile", severities: {} };
  const cmd = manager === "yarn" ? "yarn npm audit --json" : `${manager} audit --json`;
  let raw;
  try {
    raw = execSync(cmd, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 120000 });
  } catch (e) {
    // audit exits non-zero when vulns are found — stdout still holds the JSON.
    raw = e.stdout ? e.stdout.toString() : "";
    if (!raw) return { status: "unavailable", reason: "offline or audit failed", severities: {} };
  }
  // npm: {metadata:{vulnerabilities:{low,moderate,high,critical}}}
  // pnpm: same shape. Parse defensively.
  try {
    const j = JSON.parse(raw);
    const sev = j?.metadata?.vulnerabilities;
    if (sev) return { status: "ok", severities: sev };
  } catch { /* fall through */ }
  return { status: "unavailable", reason: "unparseable audit output", severities: {} };
}

// ---- internal graph (imports of sibling packages / org scope) ---------------

/** Detect the org scope shared by the workspace packages, e.g. "@devdigest". */
function detectScope(components) {
  const counts = {};
  for (const c of components) {
    const m = /^(@[^/]+)\//.exec(c.name || "");
    if (m) counts[m[1]] = (counts[m[1]] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

function listSourceFiles(dir, out, depth = 0) {
  if (depth > 12) return;
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name.startsWith(".") || SKIP_DIRS.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) listSourceFiles(p, out, depth + 1);
    else if (SRC_EXT.test(e.name)) out.push(p);
  }
}

/** For each component, count imports that reference the org scope or a sibling
 *  package name. Emits both edges (component -> imported specifier) and the raw
 *  specifier tallies, so the report can resolve aliases against tsconfig. */
function buildInternalGraph(components, scope) {
  const specRe = scope
    ? new RegExp(`(?:from|import|require\\()\\s*['"]((?:${escapeRe(scope)})/[^'"]+)['"]`, "g")
    : null;
  const siblingNames = new Set(components.map((c) => c.name).filter(Boolean));
  const byComponent = {};
  for (const c of components) {
    const files = [];
    listSourceFiles(c.absPath, files);
    const tally = {};
    for (const f of files) {
      let text;
      try { text = readFileSync(f, "utf8"); } catch { continue; }
      if (specRe) {
        specRe.lastIndex = 0;
        let m;
        while ((m = specRe.exec(text))) {
          const spec = m[1];
          tally[spec] = (tally[spec] || 0) + 1;
        }
      }
      for (const name of siblingNames) {
        if (name === c.name) continue;
        if (text.includes(`"${name}`) || text.includes(`'${name}`)) {
          tally[name] = (tally[name] || 0) + 1;
        }
      }
    }
    byComponent[c.dir] = tally;
  }
  return byComponent;
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

// ---- cross-cutting: duplicates & version conflicts ---------------------------

function crossCutting(components) {
  const seen = {}; // pkg -> [{component, range}]
  for (const c of components) {
    const all = { ...(c.dependencies || {}), ...(c.devDependencies || {}) };
    for (const [pkg, range] of Object.entries(all)) {
      (seen[pkg] ||= []).push({ component: c.dir, range });
    }
  }
  const duplicates = [], versionConflicts = [];
  for (const [pkg, uses] of Object.entries(seen)) {
    if (uses.length < 2) continue;
    duplicates.push({ pkg, count: uses.length, components: uses.map((u) => u.component) });
    const ranges = new Set(uses.map((u) => u.range));
    if (ranges.size > 1) versionConflicts.push({ pkg, ranges: uses });
  }
  duplicates.sort((a, b) => b.count - a.count);
  return { duplicates, versionConflicts };
}

// ---- main --------------------------------------------------------------------

const found = { packages: [], orphans: [] };
discover(root, found);

const components = found.packages.map((absPath) => {
  const m = readManifest(absPath);
  const dir = relative(root, absPath) || ".";
  return {
    dir,
    absPath,
    name: m.name || null,
    version: m.version || null,
    manager: detectManager(absPath),
    dependencies: m.dependencies || {},
    devDependencies: m.devDependencies || {},
    depCount: Object.keys(m.dependencies || {}).length,
    devDepCount: Object.keys(m.devDependencies || {}).length,
  };
});

const scope = detectScope(components);
for (const c of components) {
  const sizes = measureSizes(c.absPath);
  c.sizes = sizes;
  c.audit = runAudit(c.absPath, c.manager);
}
const internal = buildInternalGraph(components, scope);
const { duplicates, versionConflicts } = crossCutting(components);

// strip absPath from the public output
for (const c of components) delete c.absPath;

process.stdout.write(JSON.stringify({
  generatedAt: null, // stamped by the caller if desired; kept null for determinism
  root: relative(process.cwd(), root) || ".",
  orgScope: scope,
  components,
  internalImports: internal,
  duplicates,
  versionConflicts,
  orphans: found.orphans.map((p) => relative(root, p)),
}, null, 2));
