/* SmartDiffViewer — risk-ordered Files-changed view. Left: a searchable /
   filterable FileNav. Right: the server's deterministic Smart Diff grouping
   (core → wiring → boilerplate), boilerplate collapsed, per-file findings badges
   and per-line severity highlights. A findings summary strip (reused
   SeverityBadge) tops it off and doubles as a severity filter. Grouping is
   computed server-side (no LLM); badges/highlights come from the reviews
   endpoint (severity). Falls back to the flat DiffViewer while loading / on
   error / in "Original order". */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SeverityBadge } from "@devdigest/ui";
import type { PrFile } from "@/lib/types";
import type { SmartDiffGroup, SmartDiffRole } from "@devdigest/shared";
import { useSmartDiff } from "@/lib/hooks/smart-diff";
import { usePrReviews } from "@/lib/hooks/reviews";
import type { DiffCommentApi } from "../comments";
import { DiffViewer } from "../DiffViewer";
import { FileCard } from "../FileCard";
import { s, chevronFor } from "../styles";
import { type DiffFinding, type Severity } from "../severity";
import { FileNav } from "./FileNav";

const ROLE_ICON: Record<SmartDiffRole, React.ComponentType<{ size?: number; style?: React.CSSProperties }>> = {
  core: Icon.Layers,
  wiring: Icon.Wrench,
  boilerplate: Icon.Boxes,
};

const SEVERITIES: Severity[] = ["CRITICAL", "WARNING", "SUGGESTION"];

type ShellT = ReturnType<typeof useTranslations>;

/** DOM id on a file's wrapper, so the FileNav can scroll to it. */
const fileAnchorId = (path: string) => `sd-file-${path}`;

function OrderToggle({
  smartOrder,
  onChange,
  t,
}: {
  smartOrder: boolean;
  onChange: (v: boolean) => void;
  t: ShellT;
}) {
  const btn = (active: boolean): React.CSSProperties => ({
    fontSize: 12,
    padding: "3px 10px",
    borderRadius: 6,
    cursor: "pointer",
    border: "1px solid var(--border)",
    color: active ? "var(--text-primary)" : "var(--text-muted)",
    background: active ? "var(--bg-elevated)" : "transparent",
    fontWeight: active ? 600 : 400,
  });
  return (
    <div style={{ display: "flex", gap: 6 }}>
      <button type="button" style={btn(smartOrder)} onClick={() => onChange(true)}>
        {t("diffViewer.smartOrder")}
      </button>
      <button type="button" style={btn(!smartOrder)} onClick={() => onChange(false)}>
        {t("diffViewer.originalOrder")}
      </button>
    </div>
  );
}

function RoleGroup({
  group,
  open,
  onToggle,
  byPath,
  findingsByPath,
  commenting,
  scrollTop,
  t,
}: {
  group: SmartDiffGroup;
  open: boolean;
  onToggle: () => void;
  byPath: Map<string, PrFile>;
  findingsByPath: Map<string, DiffFinding[]>;
  commenting?: DiffCommentApi;
  /** scrollMarginTop so a jumped-to file clears the sticky page header. */
  scrollTop: number;
  t: ShellT;
}) {
  const RoleIcon = ROLE_ICON[group.role];
  return (
    <div>
      <div
        onClick={onToggle}
        style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 2px", cursor: "pointer" }}
      >
        <Icon.ChevronRight size={13} style={chevronFor(open)} />
        <RoleIcon size={14} style={{ color: "var(--text-muted)" }} />
        <span style={{ fontSize: 13, fontWeight: 600 }}>{t(`diffViewer.role.${group.role}`)}</span>
        <span style={{ fontSize: 12, color: "var(--text-muted)", flex: 1, minWidth: 0 }}>
          {t(`diffViewer.roleHint.${group.role}`)}
        </span>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {t("diffViewer.filesCount", { count: group.files.length })}
        </span>
      </div>
      {open && (
        <div style={{ ...s.list, marginBottom: 8 }}>
          {group.files.map((f) => {
            const file: PrFile =
              byPath.get(f.path) ?? { path: f.path, additions: f.additions, deletions: f.deletions, patch: null };
            return (
              <div key={f.path} id={fileAnchorId(f.path)} style={{ scrollMarginTop: scrollTop }}>
                <FileCard file={file} commenting={commenting} findings={findingsByPath.get(f.path) ?? []} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function SmartDiffViewer({
  prId,
  files,
  commenting,
}: {
  prId: string | null | undefined;
  files: PrFile[];
  commenting?: DiffCommentApi;
}) {
  const t = useTranslations("shell");
  const { data, isError } = useSmartDiff(prId);
  const { data: reviews } = usePrReviews(prId);
  const [smartOrder, setSmartOrder] = React.useState(true);
  const [openRoles, setOpenRoles] = React.useState<Set<SmartDiffRole>>(new Set(["core", "wiring"]));
  const [severityFilter, setSeverityFilter] = React.useState<Severity | null>(null);
  const [activePath, setActivePath] = React.useState<string | null>(null);
  const byPath = React.useMemo(() => new Map(files.map((f) => [f.path, f])), [files]);

  // The FileNav must stick BELOW the page's sticky PR header (position:sticky
  // top:0 inside <main>), or it hides behind it. That header's height varies
  // (tabs, optional stale banner), so measure it live rather than hardcoding.
  const rootRef = React.useRef<HTMLDivElement>(null);
  const [navTop, setNavTop] = React.useState(64);
  React.useEffect(() => {
    const main = rootRef.current?.closest("main");
    if (!main) return;
    const header = Array.from(main.children).find(
      (el) => getComputedStyle(el).position === "sticky",
    ) as HTMLElement | undefined;
    if (!header) return;
    const measure = () => setNavTop(header.offsetHeight + 12);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(header);
    return () => ro.disconnect();
  }, []);

  // Badges + line highlights come from the reviews endpoint (findings carry
  // severity — Smart Diff's finding_lines don't). Aggregate every review-kind
  // finding by file; each keeps its span + severity so it's counted and tinted
  // individually.
  const findingsByPath = React.useMemo(() => {
    const m = new Map<string, DiffFinding[]>();
    for (const r of reviews ?? []) {
      if (r.kind !== "review") continue;
      for (const f of r.findings) {
        const list = m.get(f.file) ?? [];
        list.push({ startLine: f.start_line, endLine: f.end_line, severity: f.severity as Severity });
        m.set(f.file, list);
      }
    }
    return m;
  }, [reviews]);

  const severityCounts = React.useMemo(() => {
    const counts: Record<Severity, number> = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
    for (const list of findingsByPath.values()) for (const f of list) counts[f.severity]++;
    return counts;
  }, [findingsByPath]);
  const totalFindings = SEVERITIES.reduce((n, sev) => n + severityCounts[sev], 0);

  const roleByPath = React.useMemo(() => {
    const m = new Map<string, SmartDiffRole>();
    for (const g of data?.groups ?? []) for (const f of g.files) m.set(f.path, g.role);
    return m;
  }, [data]);

  function selectFile(path: string) {
    setActivePath(path);
    const role = roleByPath.get(path);
    if (role && !openRoles.has(role)) setOpenRoles((prev) => new Set(prev).add(role));
    requestAnimationFrame(() => {
      document.getElementById(fileAnchorId(path))?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  // No Smart Diff (loading / error) or the user chose the raw order → flat viewer.
  if (isError || !data || !smartOrder) {
    return (
      <div ref={rootRef}>
        {data && !isError && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
            <OrderToggle smartOrder={smartOrder} onChange={setSmartOrder} t={t} />
          </div>
        )}
        <DiffViewer files={files} commenting={commenting} />
      </div>
    );
  }

  const split = data.split_suggestion;
  return (
    <div ref={rootRef}>
      {/* Summary strip: findings tally (clickable severity filter) + order toggle. */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        {totalFindings > 0 ? (
          SEVERITIES.filter((sev) => severityCounts[sev] > 0).map((sev) => {
            const active = severityFilter === sev;
            return (
              <button
                key={sev}
                type="button"
                aria-label={`${sev} ${severityCounts[sev]}`}
                onClick={() => setSeverityFilter((cur) => (cur === sev ? null : sev))}
                style={{ background: "none", border: "none", padding: 0, cursor: "pointer", opacity: !severityFilter || active ? 1 : 0.45 }}
              >
                <SeverityBadge severity={sev} count={severityCounts[sev]} />
              </button>
            );
          })
        ) : (
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("diffViewer.cleanNoFindings")}</span>
        )}
        {severityFilter && (
          <button
            type="button"
            aria-label="Clear severity filter"
            onClick={() => setSeverityFilter(null)}
            style={{ fontSize: 14, lineHeight: 1, color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer" }}
          >
            ×
          </button>
        )}
        <div style={{ marginLeft: "auto" }}>
          <OrderToggle smartOrder={smartOrder} onChange={setSmartOrder} t={t} />
        </div>
      </div>

      {split.too_big && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 10,
            padding: "8px 12px",
            borderRadius: 7,
            fontSize: 12,
            border: "1px solid var(--warn-text, #d29922)",
            color: "var(--warn-text, #d29922)",
            background: "var(--warn-bg, rgba(210,153,34,0.08))",
          }}
        >
          <Icon.AlertTriangle size={13} />
          {t("diffViewer.splitSuggestion", { lines: split.total_lines, parts: split.proposed_splits.length })}
        </div>
      )}

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        <FileNav
          groups={data.groups}
          findingsByPath={findingsByPath}
          activePath={activePath}
          severityFilter={severityFilter}
          onSelect={selectFile}
          top={navTop}
          t={t}
        />
        <div style={{ ...s.list, flex: 1, minWidth: 0 }}>
          {data.groups.map((g) => (
            <RoleGroup
              key={g.role}
              group={g}
              open={openRoles.has(g.role)}
              onToggle={() =>
                setOpenRoles((prev) => {
                  const next = new Set(prev);
                  if (next.has(g.role)) next.delete(g.role);
                  else next.add(g.role);
                  return next;
                })
              }
              byPath={byPath}
              findingsByPath={findingsByPath}
              commenting={commenting}
              scrollTop={navTop}
              t={t}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
