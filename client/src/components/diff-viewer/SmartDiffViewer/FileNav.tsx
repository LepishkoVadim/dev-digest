/* FileNav — left-hand file explorer for Smart Diff: a GitHub-style searchable,
   filterable file list. Filter by name, by role, by "has findings", or by the
   active severity (driven by the summary strip). Clicking a file scrolls the
   diff to it. Purely presentational — the parent owns scroll + severity state. */
"use client";

import React from "react";
import { TextInput, SeverityBadge, Button } from "@devdigest/ui";
import type { SmartDiffGroup, SmartDiffRole } from "@devdigest/shared";
import { topSeverity, type DiffFinding, type Severity } from "../severity";

const ROLES: SmartDiffRole[] = ["core", "wiring", "boilerplate"];

/** Colour a file's status dot from its +/- counts (added / removed / modified). */
function statusColor(additions: number, deletions: number): string {
  if (additions > 0 && deletions === 0) return "var(--code-add-text)";
  if (deletions > 0 && additions === 0) return "var(--code-del-text)";
  return "var(--warn)";
}
const baseName = (p: string) => (p.includes("/") ? p.slice(p.lastIndexOf("/") + 1) : p);
const dirName = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");

function chipStyle(active: boolean): React.CSSProperties {
  return {
    fontSize: 11,
    padding: "2px 8px",
    borderRadius: 999,
    cursor: "pointer",
    border: "1px solid var(--border)",
    color: active ? "var(--text-primary)" : "var(--text-muted)",
    background: active ? "var(--bg-elevated)" : "transparent",
  };
}

export function FileNav({
  groups,
  findingsByPath,
  activePath,
  severityFilter,
  onSelect,
  top,
  t,
}: {
  groups: SmartDiffGroup[];
  findingsByPath: Map<string, DiffFinding[]>;
  activePath?: string | null;
  severityFilter?: Severity | null;
  onSelect: (path: string) => void;
  /** Sticky offset — clears the page's sticky PR header (measured by the parent). */
  top: number;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  const [search, setSearch] = React.useState("");
  const [filterOpen, setFilterOpen] = React.useState(false);
  const [roleFilter, setRoleFilter] = React.useState<Set<SmartDiffRole>>(new Set(ROLES));
  const [onlyFindings, setOnlyFindings] = React.useState(false);

  const q = search.trim().toLowerCase();
  const visible = (path: string) => {
    if (q && !path.toLowerCase().includes(q)) return false;
    const fs = findingsByPath.get(path) ?? [];
    if (onlyFindings && fs.length === 0) return false;
    if (severityFilter && !fs.some((f) => f.severity === severityFilter)) return false;
    return true;
  };

  const toggleRole = (r: SmartDiffRole) =>
    setRoleFilter((prev) => {
      const next = new Set(prev);
      if (next.has(r)) next.delete(r);
      else next.add(r);
      return next;
    });

  const shownGroups = groups
    .filter((g) => roleFilter.has(g.role))
    .map((g) => ({ role: g.role, files: g.files.filter((f) => visible(f.path)) }))
    .filter((g) => g.files.length > 0);

  return (
    <aside
      style={{
        width: 264,
        flexShrink: 0,
        position: "sticky",
        top,
        alignSelf: "flex-start",
        maxHeight: `calc(100vh - ${top + 24}px)`,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      {/* Pinned header — stays put while the file list scrolls under it. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>
        <TextInput
          value={search}
          onChange={setSearch}
          placeholder={t("diffViewer.filterPlaceholder")}
          suffix={
            <Button
              kind="ghost"
              size="sm"
              icon="Filter"
              active={filterOpen || onlyFindings || roleFilter.size < ROLES.length}
              aria-label={t("diffViewer.filterTitle")}
              onClick={() => setFilterOpen((o) => !o)}
            />
          }
        />
        {filterOpen && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {ROLES.map((r) => (
              <button key={r} type="button" style={chipStyle(roleFilter.has(r))} onClick={() => toggleRole(r)}>
                {t(`diffViewer.role.${r}`)}
              </button>
            ))}
            <button type="button" style={chipStyle(onlyFindings)} onClick={() => setOnlyFindings((v) => !v)}>
              {t("diffViewer.onlyFindings")}
            </button>
          </div>
        )}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4, paddingRight: 2 }}>
        {shownGroups.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--text-muted)", padding: "10px 4px" }}>
            {t("diffViewer.noFilesMatch")}
          </div>
        ) : (
          shownGroups.map((g) => (
            <div key={g.role}>
              <div
                style={{
                  fontSize: 10,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "var(--text-muted)",
                  padding: "6px 4px 2px",
                }}
              >
                {t(`diffViewer.role.${g.role}`)}
              </div>
              {g.files.map((f) => {
                const fs = findingsByPath.get(f.path) ?? [];
                const top = topSeverity(fs);
                const active = activePath === f.path;
                const dir = dirName(f.path);
                return (
                  <button
                    key={f.path}
                    type="button"
                    onClick={() => onSelect(f.path)}
                    title={f.path}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      width: "100%",
                      textAlign: "left",
                      padding: "5px 6px",
                      borderRadius: 6,
                      border: "none",
                      cursor: "pointer",
                      background: active ? "var(--bg-elevated)" : "transparent",
                      color: "var(--text-primary)",
                    }}
                  >
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: 2,
                        flexShrink: 0,
                        background: statusColor(f.additions, f.deletions),
                      }}
                    />
                    {/* name on top, folder path underneath — both truncate, name stays left-aligned */}
                    <span style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1, gap: 1 }}>
                      <span
                        className="mono"
                        style={{ fontSize: 12.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                      >
                        {baseName(f.path)}
                      </span>
                      {dir && (
                        <span
                          className="mono"
                          style={{
                            fontSize: 10.5,
                            color: "var(--text-muted)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {dir}
                        </span>
                      )}
                    </span>
                    {top && (
                      <span style={{ flexShrink: 0 }}>
                        <SeverityBadge severity={top} count={fs.length} compact />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
