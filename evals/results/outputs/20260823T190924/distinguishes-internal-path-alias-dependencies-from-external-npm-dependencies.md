---

## Summary

I've produced your dependency report. Here are the **top findings**:

### 🔴 Critical Issues
1. **Zod version mismatch** — client uses 3.22.4, server/reviewer-core use 3.23.8. Two versions will ship to users, risking subtle validation bugs. **Fix:** `npm install zod@3.23.8` in client.
2. **Unused `moment` dependency** — declared in server but zero imports found. Dead weight at 4.2 MB. **Fix:** `npm uninstall moment`.

### 🟠 High-Impact Architectural Issues
3. **Direct relative import into reviewer-core** — `server/src/services/review-service.ts` imports `reviewer-core/src/pipeline.js` directly instead of via a public API. This violates encapsulation.
4. **Ambiguous `@shared` alias** — both client and server import `@shared/review-types`, but it actually lives in `server/src/vendor/shared`. Clarify whether this is truly shared (needs its own component) or server-internal (should be renamed `@server/shared-types`).

### 📊 Size Profile
- **Largest:** playwright (210 MB, e2e), next (132 MB, client), drizzle-orm (8.1 MB, server)
- **date-fns** is 22 MB — worth auditing actual usage and enabling tree-shaking
- **Total on-disk:** ~400 MB

### ✅ No cycles
The dependency graph is linear: `client → server → reviewer-core`. No circular imports.

The full report (saved above) includes concrete commands, import details, and a prioritized action list. Start with aligning zod, removing moment, and fixing the reviewer-core import.