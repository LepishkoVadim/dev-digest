/* SmartDiffViewer — risk-ordered Files-changed view. Renders the server's
   deterministic Smart Diff grouping (core → wiring → boilerplate), keeps
   boilerplate collapsed, badges files that have review findings, and reuses the
   existing FileCard for the actual diff. Falls back to the flat DiffViewer while
   Smart Diff is loading or if it errors. No LLM — grouping is computed server-side
   from the PR's files + latest review findings. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { PrFile } from "@/lib/types";
import type { SmartDiffGroup, SmartDiffRole } from "@devdigest/shared";
import { useSmartDiff } from "@/lib/hooks/smart-diff";
import type { DiffCommentApi } from "../comments";
import { DiffViewer } from "../DiffViewer";
import { FileCard } from "../FileCard";
import { s, chevronFor } from "../styles";

const ROLE_ICON: Record<SmartDiffRole, React.ComponentType<{ size?: number; style?: React.CSSProperties }>> = {
  core: Icon.Layers,
  wiring: Icon.Wrench,
  boilerplate: Icon.Boxes,
};

function OrderToggle({
  smartOrder,
  onChange,
  t,
}: {
  smartOrder: boolean;
  onChange: (v: boolean) => void;
  t: ReturnType<typeof useTranslations>;
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
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginBottom: 10 }}>
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
  byPath,
  commenting,
  t,
}: {
  group: SmartDiffGroup;
  byPath: Map<string, PrFile>;
  commenting?: DiffCommentApi;
  t: ReturnType<typeof useTranslations>;
}) {
  // Boilerplate is skim material — collapsed by default.
  const [open, setOpen] = React.useState(group.role !== "boilerplate");
  const RoleIcon = ROLE_ICON[group.role];
  return (
    <div>
      <div
        onClick={() => setOpen((o) => !o)}
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
              <FileCard key={f.path} file={file} commenting={commenting} findingLines={f.finding_lines} />
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
  const [smartOrder, setSmartOrder] = React.useState(true);
  const byPath = React.useMemo(() => new Map(files.map((f) => [f.path, f])), [files]);

  // No Smart Diff (loading / error) or the user chose the raw order → flat viewer.
  if (isError || !data || !smartOrder) {
    return (
      <div>
        {data && !isError && <OrderToggle smartOrder={smartOrder} onChange={setSmartOrder} t={t} />}
        <DiffViewer files={files} commenting={commenting} />
      </div>
    );
  }

  const split = data.split_suggestion;
  return (
    <div>
      <OrderToggle smartOrder={smartOrder} onChange={setSmartOrder} t={t} />
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
      <div style={s.list}>
        {data.groups.map((g) => (
          <RoleGroup key={g.role} group={g} byPath={byPath} commenting={commenting} t={t} />
        ))}
      </div>
    </div>
  );
}
