# semver-discipline

**Map the change to the version bump it demands.** A breaking contract change
requires a **major** bump; a purely additive change is **minor**; internal-only
is **patch**. If a diff makes a breaking change but the version (in `package.json`,
an API `version` field, or the route prefix like `/v1`) is unchanged or only
patch-bumped, flag it CRITICAL.

Decision rule:

- Remove/rename/retype public surface, new required input, changed status code
  → **MAJOR** required.
- Add optional field / new endpoint / new optional param → **MINOR**.
- Refactor with identical public surface → **PATCH**.

Cite the version source `file:line` (or note its absence). Required fix: bump the
major, or make the change additive so a minor suffices.

## ❌ bad — breaking change, no major bump

```diff
 // package.json
-  "version": "2.4.1",
+  "version": "2.4.2",          // patch bump…
 // routes.ts
-router.post('/orders', create)
+router.post('/orders', create) // …but `status` field removed from response = breaking
```

## ✅ good — breaking change carried by a major bump

```diff
 // package.json
-  "version": "2.4.1",
+  "version": "3.0.0",          // major bump signals the break
 // routes.ts  (and /v1 kept alongside /v2)
+router.post('/v2/orders', create)
```
