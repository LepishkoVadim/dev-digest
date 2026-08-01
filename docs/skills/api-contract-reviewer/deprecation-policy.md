# deprecation-policy

**Deprecate, don't silently delete.** A public surface that is going away must
first be marked deprecated and kept working for a release window, with a
documented replacement. A diff that removes a field/route/symbol *without* a
prior deprecation is a policy violation — flag it CRITICAL and point at the
missing deprecation.

What "properly deprecated" looks like:

- The old surface still functions (returns data / routes / exports).
- It is annotated: `@deprecated`, a `Deprecation`/`Sunset` header, a `deprecated: true`
  field, or a code comment naming the replacement and removal version.
- The replacement exists in the same or an earlier release.

Cite the removal `file:line`. Required fix: restore the surface and add the
deprecation marker; schedule removal for a later major.

## ❌ bad — hard removal, no deprecation

```diff
-  /** legacy total in cents */
-  totalCents: order.cents,     // removed outright — clients still read it
```
```diff
-router.get('/v1/report', legacyReport)   // deleted with no @deprecated window
```

## ✅ good — marked deprecated, still served

```diff
-  totalCents: order.cents,
+  /** @deprecated use `total` (major 4 removal) */
+  totalCents: order.cents,     // kept, annotated
+  total: { amount: order.cents, currency: 'usd' },
```
```diff
+// @deprecated since 3.2, removed in 4.0 — use GET /v2/report
 router.get('/v1/report', legacyReport)
