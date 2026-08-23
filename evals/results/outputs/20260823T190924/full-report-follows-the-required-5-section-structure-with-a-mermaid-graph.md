# Dependency Report — Monorepo

_Generated 2026-08-23. Source data: provided manifest and size measurements._

## 1. Overview

This is a 4-component TypeScript monorepo with ~13 unique external dependencies. Components use a mix of workspace and relative imports; there's one notable version conflict (zod) and one unused production dependency (moment). Total on-disk install footprint across all components: **~400 MB** (dominated by playwright in e2e tests and next.js in the client).

| Component | Entry Point | Prod Deps | Dev Deps | Top Installed Package | On-disk Estimate |
|-----------|-------------|-----------|----------|----------------------|------------------|
| server | fastify | 5 | 3 | drizzle-orm (8.1M) | ~25 MB |
| client | next | 5 | 3 | next (132M) | ~163 MB |
| reviewer-core | zod | 1 | 1 | zod (2.1M) | ~2 MB |
| e2e | test suite | 0 | 2 | playwright (210M) | ~210 MB |

---

## 2. Internal Dependency Graph

```mermaid
graph LR
    client["client<br/>(next)"]
    server["server<br/>(fastify)"]
    reviewer["reviewer-core<br/>(zod)"]
    e2e["e2e<br/>(tests)"]
    
    client -->|@shared/review-types| server
    server -->|reviewer-core/src/pipeline.js| reviewer
```

**Cross-component imports:**
- **client → server**: via `@shared/review-types` alias (resolves to `server/src/vendor/shared`). Client imports review type definitions from server's vendor directory.
- **server → reviewer-core**: **direct relative import** of `reviewer-core/src/pipeline.js` (architectural smell — should use package entry point if reviewer-core is meant to be a public module).

**Unresolved aliases:** The `@shared/review-types` alias is resolved via server's tsconfig; client must have a matching path alias pointing to the same directory (verify `client/tsconfig.json`).

---

## 3. External Dependencies by Size

### server (on-disk)
| Package | Size | Notes |
|---------|------|-------|
| drizzle-orm | 8.1 MB | ORM; typical size for a heavy database toolkit |
| fastify | 6.5 MB | Web framework; moderate size |
| pg | 3.8 MB | PostgreSQL driver; expected |
| zod | 2.1 MB | Schema validation (3.23.8); used in pipeline |
| moment | 4.2 MB | **Unused in code** — no imports found under server/src; candidate for removal |
| **Total** | **~25 MB** | Drizzle and moment together account for >40% of footprint |

### client (on-disk)
| Package | Size | Notes |
|---------|------|-------|
| next | 132 MB | Framework + bundler + dev server; size is expected at this scale |
| date-fns | 22 MB | Date utility library; consider tree-shaking or lazy import if only small subset used |
| react-dom | 6.9 MB | React rendering engine; expected |
| zod | 1.9 MB | Schema validation (3.22.4 — **version conflict** with server) |
| @tanstack/react-query | — | Size not measured; likely <5 MB |
| **Total** | **~163 MB** | 81% is next.js + date-fns; these two dominate install time |

### reviewer-core (on-disk)
| Package | Size | Notes |
|---------|------|-------|
| zod | 2.1 MB | Schema validation (3.23.8); only dependency |
| **Total** | **~2 MB** | Minimal footprint by design |

### e2e (on-disk)
| Package | Size | Notes |
|---------|------|-------|
| playwright | 210 MB | Browser automation suite; contains Chromium, Firefox, WebKit binaries — heavy but necessary for test infrastructure |
| **Total** | **~210 MB** | Almost entirely playwright |

---

## 4. Duplication & Version Conflicts

### Version Conflicts ⚠️
| Package | Declared Across | Ranges | Risk |
|---------|-----------------|--------|------|
| **zod** | server, client, reviewer-core | `3.23.8` (server, reviewer-core) vs `3.22.4` (client) | **HIGH** — runtime type validation library; different versions may parse/validate differently. Two versions will be bundled unless deduplicated at install time. Risk of subtle validation bugs or type mismatches in shared code. |

### Duplicated Packages (same version across components)
| Package | Components | Shared Version |
|---------|-----------|----------------|
| typescript | server, client, reviewer-core, e2e | 5.6.3 (dev) |
| vitest | server, client, e2e | 2.1.4 (dev) |

**Note:** Duplicated dev dependencies are low-risk (no runtime cost) and typically acceptable in polyrepo setups for independent CI lanes. Prod duplicates (only zod here) are the ones to eliminate.

---

## 5. Security Audit

**Status:** Audit data not available (requires network access to npm registry).

To audit each component:
```bash
cd server && npm audit      # or pnpm audit
cd client && npm audit      # or pnpm audit
cd reviewer-core && npm audit
cd e2e && npm audit
```

Run these with network access to see detailed security advisories. Report findings in a follow-up.

---

## 6. Prioritized Recommendations

### 🔴 **Critical**

1. **[Critical] Resolve zod version conflict — client vs server/reviewer-core**
   - **Action:** Align on `zod@3.23.8` across all three components (server, client, reviewer-core).
   - **Rationale:** Version `3.22.4` (client) is ~2 releases behind `3.23.8` (used in server and reviewer-core). When client and server share type validation code via `@shared/review-types`, mismatches between zod versions can cause silent validation failures or type errors at runtime. This is especially risky since client imports server's review types.
   - **Where:** `client/package.json` — change `zod@3.22.4` → `zod@3.23.8`, then re-run install.
   - **Verify:** After upgrade, run `npm ls zod` in each component to confirm single resolution.

---

### 🟠 **High**

2. **[High] Remove unused `moment` dependency from server**
   - **Action:** Delete `moment@2.30.1` from `server/package.json` (prod dependencies).
   - **Rationale:** grep found zero imports of moment anywhere under `server/src`. Removing it saves 4.2 MB of on-disk bloat with zero runtime impact. Moment is also a legacy package; modern projects use `date-fns` (already in client) or native Date APIs.
   - **Where:** `server/package.json` — remove the line `"moment": "2.30.1"`, then reinstall.

3. **[High] Fix direct import of reviewer-core's internal module**
   - **Action:** Refactor `server/src/services/review-service.ts` to import from reviewer-core's public entry point (e.g., `import { pipeline } from "reviewer-core"`) instead of directly from `reviewer-core/src/pipeline.js`.
   - **Rationale:** Direct imports of internal source files break encapsulation and make future refactors of reviewer-core fragile. If reviewer-core has no public entry point, add one (e.g., export pipeline from `reviewer-core/index.js`).
   - **Where:** `server/src/services/review-service.ts` — update the import path. Then verify `reviewer-core/package.json` has a proper `main` or `exports` field.

---

### 🟡 **Medium**

4. **[Medium] Investigate date-fns usage in client — consider tree-shaking or lazy import**
   - **Action:** Audit which date-fns functions are imported in client/src. If only a small subset (e.g., `format`, `parseISO`) is used, consider:
     - Ensuring webpack/next.js tree-shakes unused functions (most modern bundlers do this by default).
     - Or, replace with a lighter alternative like `date-fns/locale` subpath imports to reduce bundle size.
   - **Rationale:** `date-fns` is 22 MB on disk, making it a significant contributor to client's install footprint. Most of date-fns' size comes from locale data; if only English is needed, tree-shaking or subpath imports can cut this substantially.
   - **Where:** `client/src` — grep for `from 'date-fns'` and count imports. Then verify webpack/next.js config includes tree-shaking.

5. **[Medium] Verify `@shared/review-types` alias resolution in client**
   - **Action:** Check `client/tsconfig.json` and confirm it has a `paths` entry for `@shared/review-types` that resolves to `server/src/vendor/shared` (or wherever server defines this alias).
   - **Rationale:** If client's tsconfig doesn't resolve `@shared/review-types`, the import in `client/src/lib/api-types.ts` will fail at build time or reference the wrong directory. This is a potential hidden bug.
   - **Where:** `client/tsconfig.json` — check `compilerOptions.paths`.

---

### 💡 **Low**

6. **[Low] Consolidate shared review types — consider moving to a separate `@shared` package**
   - **Action:** If type sharing between client and server grows, extract `server/src/vendor/shared` into a dedicated `packages/shared` workspace package with its own `package.json`. Then both client and server can depend on it as a published package.
   - **Rationale:** Currently, client reaches into server's internal vendor directory, which is architectural debt. A dedicated shared package makes the contract explicit and enables independent versioning/publishing.
   - **Where:** Create `packages/shared/`, move `server/src/vendor/shared` contents there, add to workspace root `package.json`, update imports in both client and server.

---

## Summary

- **Biggest wins:** Fix zod version conflict (prevents runtime bugs), remove moment (saves 4.2 MB with zero impact), and enforce public entry points for reviewer-core (improves maintainability).
- **Install footprint:** Playwright (e2e tests) and next.js (client framework) are the heaviest; both are justified by their role. Monitor date-fns for potential tree-shaking opportunity.
- **Architectural debt:** Client importing from server's internal vendor directory is the most significant smell; address with a dedicated shared package over time.