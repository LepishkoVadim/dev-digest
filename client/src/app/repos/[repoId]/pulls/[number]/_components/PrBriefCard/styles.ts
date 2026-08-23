import type { CSSProperties } from "react";

export const s = {
  section: {
    display: "flex",
    flexDirection: "column",
    marginBottom: 24,
  } satisfies CSSProperties,
  card: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 18,
    display: "flex",
    flexDirection: "column",
    gap: 14,
  } satisfies CSSProperties,
  what: {
    fontSize: 15,
    fontWeight: 600,
    color: "var(--text-primary)",
    lineHeight: 1.5,
  } satisfies CSSProperties,
  why: {
    fontSize: 13,
    color: "var(--text-secondary)",
    lineHeight: 1.55,
  } satisfies CSSProperties,
  stale: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    borderRadius: 6,
    border: "1px solid var(--warn, #fbbf24)",
    background: "var(--bg-hover)",
    fontSize: 12,
    color: "var(--warn, #fbbf24)",
  } satisfies CSSProperties,
  groupLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 6,
  } satisfies CSSProperties,
  groupHead: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  } satisfies CSSProperties,
  // File:line links render blue by default (not just on hover) per the design.
  fileLink: {
    color: "var(--accent-text, #7aa2f7)",
    textDecoration: "none",
  } satisfies CSSProperties,
  riskRow: {
    border: "1px solid var(--border)",
    borderRadius: 6,
    marginBottom: 6,
    overflow: "hidden",
  } satisfies CSSProperties,
  riskHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    padding: "10px 12px",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    textAlign: "left",
    color: "var(--text-primary)",
    fontSize: 13,
  } satisfies CSSProperties,
  riskTitle: {
    flex: 1,
    fontWeight: 600,
  } satisfies CSSProperties,
  riskBody: {
    padding: "0 12px 12px 12px",
    fontSize: 13,
    color: "var(--text-secondary)",
    lineHeight: 1.55,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,
  refList: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    fontSize: 12,
  } satisfies CSSProperties,
  focusItem: {
    display: "flex",
    gap: 8,
    alignItems: "baseline",
    fontSize: 13,
    lineHeight: 1.5,
    marginBottom: 4,
  } satisfies CSSProperties,
  focusReason: {
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  emptyRow: {
    padding: "10px 12px",
    fontSize: 13,
    color: "var(--text-muted)",
    fontStyle: "italic",
  } satisfies CSSProperties,
  verdict: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
    fontSize: 12,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  verdictEmpty: {
    fontSize: 12,
    color: "var(--text-muted)",
    fontStyle: "italic",
  } satisfies CSSProperties,
  meta: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
    paddingTop: 12,
    borderTop: "1px solid var(--border)",
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  muted: {
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;

/** risk_level → badge colour. High is danger, low is calm. */
export const RISK_COLOR: Record<string, { color: string; bg: string }> = {
  high: { color: "var(--danger, #f87171)", bg: "var(--bg-hover)" },
  medium: { color: "var(--warn, #fbbf24)", bg: "var(--bg-hover)" },
  low: { color: "var(--ok, #4ade80)", bg: "var(--bg-hover)" },
};
