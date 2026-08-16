import type { CSSProperties } from "react";

export const s = {
  section: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
  } satisfies CSSProperties,
  card: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 18,
    flex: 1,
    display: "flex",
    flexDirection: "column",
  } satisfies CSSProperties,
  summary: {
    fontSize: 14,
    fontStyle: "italic",
    color: "var(--text-primary)",
    lineHeight: 1.55,
    marginBottom: 18,
  } satisfies CSSProperties,
  scopeCols: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
    gap: 20,
  } satisfies CSSProperties,
  scopeCol: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  } satisfies CSSProperties,
  scopeHead: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginBottom: 2,
  } satisfies CSSProperties,
  scopeHeadLabel: (inScope: boolean): CSSProperties => ({
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: inScope ? "var(--ok, #4ade80)" : "var(--text-muted)",
  }),
  scopeItem: {
    display: "flex",
    gap: 6,
    fontSize: 13,
    lineHeight: 1.5,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  dot: {
    color: "var(--text-muted)",
    flexShrink: 0,
  } satisfies CSSProperties,
  scopeItemMuted: {
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  meta: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    marginTop: "auto",
    paddingTop: 12,
    borderTop: "1px solid var(--border)",
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  missing: {
    marginTop: 10,
    padding: "8px 10px",
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: "var(--bg-hover)",
    fontSize: 12,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  riskAreas: {
    marginTop: 18,
    paddingTop: 16,
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,
} as const;

/** Confidence → badge colour. Low is a warning: context was missing. */
export const CONFIDENCE_COLOR: Record<string, { color: string; bg: string }> = {
  high: { color: "var(--ok, #4ade80)", bg: "var(--bg-hover)" },
  medium: { color: "var(--warn, #fbbf24)", bg: "var(--bg-hover)" },
  low: { color: "var(--danger, #f87171)", bg: "var(--bg-hover)" },
};
