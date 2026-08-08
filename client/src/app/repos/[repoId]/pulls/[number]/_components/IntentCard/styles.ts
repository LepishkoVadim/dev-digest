import type { CSSProperties } from "react";

export const s = {
  card: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 18,
  } satisfies CSSProperties,
  summary: {
    fontSize: 14,
    color: "var(--text-primary)",
    lineHeight: 1.55,
    marginBottom: 14,
  } satisfies CSSProperties,
  scopeRow: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  } satisfies CSSProperties,
  scopeLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginRight: 4,
  } satisfies CSSProperties,
  meta: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    marginTop: 14,
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
} as const;

/** Confidence → badge colour. Low is a warning: context was missing. */
export const CONFIDENCE_COLOR: Record<string, { color: string; bg: string }> = {
  high: { color: "var(--ok, #4ade80)", bg: "var(--bg-hover)" },
  medium: { color: "var(--warn, #fbbf24)", bg: "var(--bg-hover)" },
  low: { color: "var(--danger, #f87171)", bg: "var(--bg-hover)" },
};
