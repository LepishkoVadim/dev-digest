import type { CSSProperties } from "react";

export const s = {
  // Two-pane reader that fills the AppShell content area.
  wrap: { display: "flex", height: "100%", minHeight: 0 } satisfies CSSProperties,

  // Left column: fixed header + scrollable file list + footer pinned at bottom.
  list: {
    width: 320,
    flexShrink: 0,
    borderRight: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
  } satisfies CSSProperties,
  listHead: {
    padding: "14px 14px 10px",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  listLabelRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  } satisfies CSSProperties,
  listLabel: {
    fontSize: 11,
    fontWeight: 650,
    letterSpacing: "0.06em",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  listPath: { margin: "4px 0 0", fontSize: 12, color: "var(--text-secondary)" } satisfies CSSProperties,
  listScroll: { flex: 1, minHeight: 0, overflowY: "auto", padding: 8 } satisfies CSSProperties,
  row: (active: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 10px",
    borderRadius: 8,
    cursor: "pointer",
    background: active ? "var(--bg-hover)" : "transparent",
    border: "1px solid transparent",
    width: "100%",
    textAlign: "left",
  }),
  rowName: {
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: 13,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  rowPrefix: { color: "var(--text-muted)", fontSize: 11 } satisfies CSSProperties,

  // Right column: preview pane.
  preview: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", minHeight: 0 } satisfies CSSProperties,
  previewHead: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "14px 24px",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  previewPath: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    color: "var(--text-secondary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  previewLabel: {
    fontSize: 12,
    color: "var(--text-muted)",
    padding: "2px 8px",
    borderRadius: 6,
    background: "var(--bg-hover)",
  } satisfies CSSProperties,
  previewBody: { flex: 1, minHeight: 0, overflowY: "auto", padding: "18px 24px" } satisfies CSSProperties,
  placeholder: { color: "var(--text-muted)", fontSize: 13, padding: 24 } satisfies CSSProperties,

  footer: {
    padding: "10px 14px",
    borderTop: "1px solid var(--border)",
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;
