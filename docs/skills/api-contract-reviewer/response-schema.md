# response-schema

**The shape of a response is a contract.** Clients deserialize it by name and
type. Flag any diff that removes, renames, or retypes a response field, or that
changes a field's requiredness.

Rules:

- Removed or **renamed** response field → CRITICAL (clients read `undefined`).
- Type narrowed/changed (`string → number`, `string → enum`, nullable → non-null
  the client relied on) → CRITICAL.
- A previously **always-present** field becoming optional/absent → CRITICAL.
- **Adding** a new optional field → safe, do not flag.

Cite the schema/serializer `file:line`. Required fix: keep the old field (or add
an alias) until a major release; make new fields additive.

## ❌ bad — renamed / removed / retyped response field

```diff
 return {
   id: user.id,
-  displayName: user.name,     // field renamed → clients lose `displayName`
+  name: user.name,
-  balanceCents: acct.cents,   // type changed number → string
+  balanceCents: String(acct.cents),
 }
```

## ✅ good — additive, old fields preserved

```diff
 return {
   id: user.id,
   displayName: user.name,     // kept
+  name: user.name,            // new alias, additive
+  avatarUrl: user.avatar ?? null,  // new optional field
 }
```
