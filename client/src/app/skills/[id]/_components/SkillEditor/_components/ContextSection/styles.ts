import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 16, padding: 24 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "flex-start", gap: 12 } satisfies CSSProperties,
  titleWrap: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  h2: { margin: 0, fontSize: 15, fontWeight: 650, color: "var(--text-primary)" } satisfies CSSProperties,
  subtitle: { margin: "4px 0 0", fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  serializes: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: "12px 14px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-subtle, var(--bg-hover))",
  } satisfies CSSProperties,
  serializesLabel: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 0.5,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  serializesHint: { margin: 0, fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  serializesPre: {
    margin: 0,
    fontSize: 12,
    color: "var(--text-secondary)",
    whiteSpace: "pre-wrap",
    wordBreak: "break-all",
  } satisfies CSSProperties,
} as const;
