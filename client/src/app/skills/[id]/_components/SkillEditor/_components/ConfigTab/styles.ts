import type { CSSProperties } from "react";

/** Co-located styles for the skill ConfigTab (mirrors agent ConfigTab). */
export const s = {
  wrap: { maxWidth: 760 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", marginBottom: 20 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  enabledLabel: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  bodyMeta: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  filenameChip: {
    fontWeight: 600,
    color: "var(--accent-text)",
    background: "var(--bg-hover)",
    padding: "1px 8px",
    borderRadius: 4,
  } satisfies CSSProperties,
  dirtyDot: { color: "var(--warn, #f59e0b)", fontWeight: 600 } satisfies CSSProperties,
  actions: { display: "flex", gap: 10, marginTop: 10 } satisfies CSSProperties,
  savedNote: { alignSelf: "center", fontSize: 13, color: "var(--ok)" } satisfies CSSProperties,
} as const;
