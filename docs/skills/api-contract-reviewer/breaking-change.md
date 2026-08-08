# breaking-change

**Removing or altering any published contract is a breaking change.** Flag it
CRITICAL unless the same PR ships a major-version bump *and* a deprecation path.

A published contract includes: a route path or method, a request param or its
requiredness, a response field or its type, an exported symbol (function, type,
constant), an error code, or an HTTP status code. Renames count as remove + add.

When you see one in the diff:

- Cite the exact `file:line` and name the contract.
- Severity CRITICAL when removed/renamed/retyped with no deprecation or major bump.
- Required fix: keep the old surface working (alias / optional / deprecated) OR
  bump major and document the removal.

## ❌ bad — silent breaking change

```diff
-router.get('/v1/users/:id', getUser)
+router.get('/v1/accounts/:id', getUser)   // route renamed, clients 404
```
```diff
-export function createInvoice(dto: InvoiceInput): Invoice
+export function createInvoice(dto: InvoiceInput, opts: Opts): Invoice  // new REQUIRED arg
```

## ✅ good — additive or deprecated-then-removed

```diff
 router.get('/v1/users/:id', getUser)
+router.get('/v1/accounts/:id', getUser)   // new alias, old path still served
```
```diff
-export function createInvoice(dto: InvoiceInput): Invoice
+export function createInvoice(dto: InvoiceInput, opts?: Opts): Invoice  // optional, back-compat
```
