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
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 12,
    flex: 1,
  } satisfies CSSProperties,

  // --- stat bar (symbols · callers · endpoints · cron  +  Tree/Graph) ---
  statBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    paddingBottom: 12,
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  stats: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    flexWrap: "wrap",
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  stat: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
  } satisfies CSSProperties,
  toggle: {
    display: "inline-flex",
    border: "1px solid var(--border)",
    borderRadius: 6,
    overflow: "hidden",
  } satisfies CSSProperties,
  toggleBtn: (active: boolean): CSSProperties => ({
    border: "none",
    background: active ? "var(--bg-hover)" : "transparent",
    color: active ? "var(--text-primary)" : "var(--text-muted)",
    fontSize: 12,
    padding: "3px 10px",
    cursor: "pointer",
  }),

  partialBanner: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    borderRadius: 6,
    background: "var(--bg-hover)",
    color: "var(--text-secondary)",
    padding: "8px 10px",
    fontSize: 12,
  } satisfies CSSProperties,

  // --- symbol tree ---
  tree: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
  } satisfies CSSProperties,
  symbolHead: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 4px",
    cursor: "pointer",
    borderRadius: 6,
  } satisfies CSSProperties,
  symbolName: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  callerCount: {
    marginLeft: "auto",
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  symbolBody: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    margin: "2px 0 8px 10px",
    paddingLeft: 14,
    borderLeft: "1px solid var(--border)",
    minWidth: 0,
  } satisfies CSSProperties,
  callerRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 6,
    color: "var(--text-muted)",
    minWidth: 0,
  } satisfies CSSProperties,
  // Long, space-less file paths must break inside the card, not overflow it.
  callerLink: {
    minWidth: 0,
    overflowWrap: "anywhere",
    wordBreak: "break-all",
  } satisfies CSSProperties,
  callerIcon: {
    flexShrink: 0,
    marginTop: 3,
  } satisfies CSSProperties,
  chipRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 2,
  } satisfies CSSProperties,
  chip: (kind: "endpoint" | "cron"): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 11.5,
    padding: "2px 8px",
    borderRadius: 999,
    fontFamily: "var(--font-mono, monospace)",
    color: kind === "endpoint" ? "var(--accent-text, #7aa2f7)" : "var(--warn, #fbbf24)",
    background:
      kind === "endpoint"
        ? "color-mix(in srgb, var(--accent-text, #7aa2f7) 12%, transparent)"
        : "color-mix(in srgb, var(--warn, #fbbf24) 12%, transparent)",
    border: `1px solid ${
      kind === "endpoint"
        ? "color-mix(in srgb, var(--accent-text, #7aa2f7) 30%, transparent)"
        : "color-mix(in srgb, var(--warn, #fbbf24) 30%, transparent)"
    }`,
  }),
  muted: {
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  emptyMsg: {
    margin: "auto 0",
    textAlign: "center",
    fontSize: 13,
    color: "var(--text-muted)",
    padding: "24px 8px",
    lineHeight: 1.5,
  } satisfies CSSProperties,

  seeAll: {
    alignSelf: "flex-start",
    border: "none",
    background: "transparent",
    color: "var(--accent-text, #7aa2f7)",
    fontSize: 12,
    padding: "2px 0",
    cursor: "pointer",
  } satisfies CSSProperties,
  modalList: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
  } satisfies CSSProperties,

  // --- prior PRs footer (anchored to the bottom of the stretched card) ---
  footer: {
    marginTop: "auto",
    paddingTop: 4,
  } satisfies CSSProperties,
  footerHead: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    cursor: "pointer",
    fontSize: 13,
    color: "var(--text-secondary)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "10px 12px",
    background: "var(--bg, transparent)",
  } satisfies CSSProperties,
  footerCount: {
    fontSize: 11,
    padding: "1px 7px",
    borderRadius: 999,
    background: "var(--bg-hover)",
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  footerChevron: {
    marginLeft: "auto",
    display: "inline-flex",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  priorList: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    marginTop: 12,
    padding: "0 6px 4px",
  } satisfies CSSProperties,
  priorItem: {
    display: "flex",
    gap: 8,
    alignItems: "flex-start",
  } satisfies CSSProperties,
  priorBullet: {
    color: "var(--text-muted)",
    lineHeight: 1.3,
    flexShrink: 0,
  } satisfies CSSProperties,
  priorMain: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    minWidth: 0,
  } satisfies CSSProperties,
  priorTitleRow: {
    display: "flex",
    alignItems: "baseline",
    gap: 8,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  priorTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  priorMeta: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  priorNote: {
    fontSize: 12.5,
    color: "var(--text-secondary)",
    lineHeight: 1.5,
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
  noteCode: {
    fontFamily: "var(--font-mono, monospace)",
    fontSize: 11.5,
    padding: "1px 5px",
    borderRadius: 4,
    background: "var(--bg-hover)",
    color: "var(--accent-text, #7aa2f7)",
  } satisfies CSSProperties,
} as const;
