# client — Docs index
↑ [CLAUDE.md](../CLAUDE.md) · [README](../README.md)

Deep-dive UI design notes for `@devdigest/web`. `CLAUDE.md` is the map, the
[README](../README.md) is the overview (route map + stack); this folder holds the
"why" behind non-obvious client decisions. Nothing has been extracted into a
standalone doc yet — the table maps each concern to where it lives in code and
when it's worth pinning as a doc.

## Design surface

| Area | Where it lives today | Extract a doc when |
|------|----------------------|--------------------|
| Data access — one hook per API surface, single `fetch` chokepoint | `src/lib/hooks/*` → `src/lib/api.ts` | you add a caching/invalidation or error-envelope convention |
| App chrome — nav, breadcrumbs, `g`-then-key shortcuts | `src/components/app-shell` | you change the shortcut model or shell contract |
| Feature composition — thin pages, colocated `_components/<Name>/` | `src/app/**/page.tsx` | you formalize the page/feature boundary |
| i18n — messages per locale | `src/i18n`, `messages/<locale>/*.json` | you add a locale or a message-key convention |
| Vendored primitives (edit at source) | `src/vendor/ui`, `src/vendor/shared` | never — edit upstream |

Keep the route map and stack in [`../README.md`](../README.md); add a doc here only
for a decision that outlives a single component. Link, don't copy.
