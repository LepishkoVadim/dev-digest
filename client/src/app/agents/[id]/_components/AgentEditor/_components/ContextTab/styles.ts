import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 14, padding: 24 } satisfies CSSProperties,
  tokenBar: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
    padding: "10px 12px",
    borderRadius: 8,
    background: "var(--bg-hover)",
  } satisfies CSSProperties,
  tokenTotal: { fontSize: 13, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  caption: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
