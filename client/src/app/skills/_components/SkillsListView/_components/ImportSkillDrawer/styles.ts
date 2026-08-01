import type { CSSProperties } from "react";

/** Co-located styles for ImportSkillDrawer. */
export const s = {
  body: { padding: 24, display: "flex", flexDirection: "column", gap: 14 } satisfies CSSProperties,
  tabs: { display: "flex", gap: 4, borderBottom: "1px solid var(--border)", padding: "0 24px" } satisfies CSSProperties,
  tab: (active: boolean): CSSProperties => ({
    padding: "10px 14px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    background: "none",
    border: "none",
    color: active ? "var(--text-primary)" : "var(--text-secondary)",
    borderBottom: "2px solid " + (active ? "var(--accent)" : "transparent"),
  }),
  hint: { fontSize: 12, color: "var(--text-muted)", lineHeight: 1.4 } satisfies CSSProperties,
  fileInput: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  footer: { display: "flex", gap: 10, justifyContent: "flex-end" } satisfies CSSProperties,
  // community
  commRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 0",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  commMain: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  commName: { fontSize: 14, fontWeight: 600 } satisfies CSSProperties,
  commMeta: { fontSize: 12, color: "var(--text-muted)", display: "flex", gap: 10, marginTop: 2 } satisfies CSSProperties,
  commDesc: { fontSize: 13, color: "var(--text-secondary)", marginTop: 4 } satisfies CSSProperties,
  list: { maxHeight: 380, overflowY: "auto" } satisfies CSSProperties,
} as const;
