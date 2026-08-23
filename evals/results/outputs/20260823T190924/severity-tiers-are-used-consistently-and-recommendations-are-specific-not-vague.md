# Dependency Report — Monorepo (server, client, reviewer-core, e2e)

_Generated 2026-08-23. Source data provided directly._

## 1. Overview

This monorepo spans 4 components using a mix of pnpm/npm, with **zod experiencing version drift** across three packages and **moment appearing entirely unused** in server. The heaviest on-disk footprint is **Playwright (210 MB, e2e-only)** followed by **Next (132 MB, client)** and **date-fns (22 MB, client)**. There are **19 production dependencies** and **7 distinct devDependencies** shared across components.

| Component | Manager | Deps (prod/dev) | Installed pkgs | On-disk |
|-----------|---------|-----------------|----------------|---------|
| server | unknown | 5 / 3 | 6 | ~28 MB |
| client | unknown | 6 / 3 | 6 | ~168 MB |
| reviewer-core | unknown | 1 / 1 | 2 | ~2 MB |
| e2e | unknown | 0 / 3 | 2 | ~210 MB |

---

## 2. Internal dependency graph

```mermaid
graph LR
  server -->|@shared/review-types| shared["shared (vendor)"]
  server -->|reviewer-core/src/pipeline.js| reviewercore["reviewer-core"]
  client -->|@shared/review-types| shared
  e2e -->|integration tests| server
  e2e -->|integration tests| client
```

**Coupling concerns:**
- **server → reviewer-core crosses package boundary via direct relative import** (`server/src/services/review-service.ts` imports `reviewer-core/src/pipeline.js` directly instead of using the package's public entry point). This violates encapsulation and makes reviewer-core harder to refactor or version independently.
- **Both server and client import the same `@shared/review-types` alias** but resolve it locally within their own directories. This suggests a `@shared` namespace package should be extracted to avoid duplication and misalignment.

---

## 3. External dependencies by size

### server (~28 MB total)

| Package | On-disk | Notes |
|---------|---------|-------|
| drizzle-orm | 8.1 MB | ORM for database operations; necessary |
| fastify | 6.5 MB | HTTP server; core dependency |
| moment | 4.2 MB | **UNUSED — not imported anywhere in server/src** — candidate for deletion |
| pg | 3.8 MB | PostgreSQL driver; required by drizzle-orm workflows |
| zod | 2.1 MB | Schema validation; actively used |

**Opportunity:** Removing `moment` saves **4.2 MB** and eliminates dead weight. If date operations are needed, use lightweight alternatives already in scope (date-fns is 22 MB but already in client).

### client (~168 MB total)

| Package | On-disk | Notes |
|---------|---------|-------|
| next | 132 MB | Framework; unavoidable |
| date-fns | 22 MB | Date utilities; moderate weight but actively used for client-side formatting |
| react-dom | 6.9 MB | React renderer; core dependency |
| react | ~5 MB (est.) | UI framework; core dependency |
| @tanstack/react-query | ~5 MB (est.) | Server-state management; actively used |
| zod | 1.9 MB | Schema validation; actively used |

**No obvious trim candidates** — all packages are necessary. Next is the size driver and inherent to a Next.js app.

### reviewer-core (~2 MB total)

| Package | On-disk | Notes |
|---------|---------|-------|
| zod | 2.1 MB | Schema validation; only dependency |

Lightweight and isolated.

### e2e (~210 MB total)

| Package | On-disk | Notes |
|---------|---------|-------|
| playwright | 210 MB | E2E test driver; dev-only and necessary for browser automation |

Playwright's large footprint is unavoidable when using browser automation. Consider running e2e tests in isolated CI jobs to avoid bloating local installs.

---

## 4. Duplication & version conflicts

### Version Conflicts (Risk: HIGH)

| Package | Components & Ranges | Risk |
|---------|---------------------|------|
| **zod** | server: 3.23.8, client: 3.22.4, reviewer-core: 3.23.8 | **HIGH** — Minor version drift but zod may have breaking schema or validation changes between 3.22.4 and 3.23.8. Runtime behavior could diverge between server/reviewer-core and client. Type definitions may mismatch if types are shared. |

**Action:** Align all packages to a single version. Recommendation: **upgrade client to zod@3.23.8** to match server and reviewer-core (more recent, likely compatible).

### Duplicates (Same version, multiple components)

| Package | Components | Count |
|---------|------------|-------|
| typescript | server, client, reviewer-core, e2e | 4 |
| vitest | server, client | 2 |

These are devDependencies and typically acceptable in a monorepo (each component may need its own version for build-time reasons). **No action required** unless build tooling breaks.

---

## 5. Security audit

No audit output provided. To generate a full security audit, run the following in each component directory with network access:

- **server**: `npm audit` or `pnpm audit`
- **client**: `npm audit` or `pnpm audit`
- **reviewer-core**: `npm audit` or `pnpm audit`
- **e2e**: `npm audit` or `pnpm audit` (Playwright security matters for CI/CD isolation)

---

## 6. Prioritized recommendations

**[Critical] Fix zod version conflict — ensure consistency between server, client, and reviewer-core.**
- **Action:** Update `client/package.json` to declare `zod@3.23.8` (align with server and reviewer-core).
- **Rationale:** Version drift between 3.22.4 and 3.23.8 can cause schema validation mismatches and type confusion, especially if types are shared across packages via `@shared/review-types`.
- **Where:** `client/package.json`, line containing zod dependency.
- **Command:** `npm install zod@3.23.8` (or equivalent for your package manager).

---

**[High] Remove unused `moment` dependency from server.**
- **Action:** Delete `moment@2.30.1` from `server/package.json`, delete `server/node_modules/moment/`.
- **Rationale:** Grep found zero imports of moment in server source code. Frees **4.2 MB** of on-disk space and eliminates maintenance burden.
- **Where:** `server/package.json`, devDependencies line.
- **Command:** `npm uninstall moment` (or equivalent for your package manager).

---

**[High] Replace direct relative import from reviewer-core with package-scoped import.**
- **Action:** Update `server/src/services/review-service.ts` to import from the package's public entry point (e.g., `import { pipeline } from "reviewer-core"` instead of `from "reviewer-core/src/pipeline.js"`).
- **Rationale:** Direct relative imports into another package bypass encapsulation. If reviewer-core refactors its internal structure or is promoted to a proper npm package, this breaks silently. Use a public API or add an export to reviewer-core's entry point.
- **Where:** `server/src/services/review-service.ts`, import statement.
- **Next step:** Ensure reviewer-core's `package.json` has an `exports` or `main` field that includes the pipeline export, then update the import.

---

**[Medium] Consolidate `@shared/review-types` into a proper shared workspace package.**
- **Action:** Create `packages/shared/src/review-types.ts` (or similar), move common type definitions there, and have both server and client declare it as a workspace dependency.
- **Rationale:** Both server and client import the same `@shared/review-types` alias but resolve it locally. This creates duplication and risks divergence. A shared package clarifies intent and simplifies type alignment.
- **Where:** Both `server/package.json` and `client/package.json`; update `tsconfig.json` paths.
- **Next step:** Audit the current contents of `server/src/vendor/shared` and `client/src/lib/` for shared types, consolidate, and remove the local copies.

---

**[Low] Consider isolating Playwright (e2e) into a separate CI job.**
- **Action:** Move e2e testing to a separate job or container in CI/CD; avoid including e2e/node_modules (210 MB) in developer installs unless explicitly requested.
- **Rationale:** Playwright's footprint is large but justified for e2e testing. However, most developers won't run e2e locally, so bundling it into the default `npm install` bloats checkout times.
- **Where:** CI/CD workflow configuration (GitHub Actions, etc.).
- **Example:** Use `npm install --omit=optional` in development and `npm install` only in e2e job, or move e2e to a separate workspace package with lazy installation.

---

## Summary for quick action

1. **Now:** Change `zod@3.22.4` → `zod@3.23.8` in client (5 min, high impact)
2. **Now:** Delete `moment` from server (2 min, removes 4.2 MB dead weight)
3. **This sprint:** Fix reviewer-core import encapsulation in server (20 min, prevents future refactoring pain)
4. **Next sprint:** Consolidate `@shared/review-types` into a proper workspace package (1–2 hours, improves type alignment and maintainability)