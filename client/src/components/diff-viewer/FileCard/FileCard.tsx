/* FileCard — one collapsible file in the diff: header (path, +/- stat, comment
   count) and, when open, its parsed lines plus any outdated comments. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SEV } from "@devdigest/ui";
import type { PrFile } from "@/lib/types";
import { AUTO_EXPAND_MAX_LINES } from "../constants";
import { parsePatch, type Line } from "../helpers";
import {
  buildThreads,
  keysForLine,
  partitionThreads,
  type CommentThread,
  type DiffCommentApi,
} from "../comments";
import { s, chevronFor } from "../styles";
import { CodeLine } from "../CodeLine";
import { OutdatedComments } from "../OutdatedComments";
import { severityByLine, labelByLine, topSeverity, type DiffFinding } from "../severity";

/** Threads anchored to a given parsed line (RIGHT=new, LEFT=old). */
function threadsForLine(ln: Line, matched: Map<string, CommentThread[]>): CommentThread[] {
  if (matched.size === 0) return [];
  const out: CommentThread[] = [];
  for (const key of keysForLine(ln)) {
    const list = matched.get(key);
    if (list) out.push(...list);
  }
  return out;
}

/** DOM id for a finding line, so a badge click can scroll straight to it. */
export function findingAnchorId(path: string, line: number): string {
  return `sd-line-${path}-${line}`;
}

export function FileCard({
  file,
  commenting,
  findings,
}: {
  file: PrFile;
  commenting?: DiffCommentApi;
  /** Review findings on this file (Smart Diff) — carry severity + span. */
  findings?: DiffFinding[];
}) {
  const t = useTranslations("shell");
  const fileFindings = React.useMemo(() => findings ?? [], [findings]);
  const sevByLine = React.useMemo(() => severityByLine(fileFindings), [fileFindings]);
  const lblByLine = React.useMemo(() => labelByLine(fileFindings), [fileFindings]);
  const topSev = React.useMemo(() => topSeverity(fileFindings), [fileFindings]);
  const findingCount = fileFindings.length;
  // First finding line (lowest new-side line), for the badge's scroll target.
  const firstFindingLine = React.useMemo(
    () => (fileFindings.length ? Math.min(...fileFindings.map((f) => Math.min(f.startLine, f.endLine))) : null),
    [fileFindings],
  );
  const [open, setOpen] = React.useState(
    (file.additions ?? 0) + (file.deletions ?? 0) <= AUTO_EXPAND_MAX_LINES ||
      findingCount > 0 // files with findings always start expanded
  );
  const lines = React.useMemo(() => parsePatch(file.patch), [file.patch]);

  // Badge click: make sure the file is open, then scroll to its first finding.
  function jumpToFirstFinding(e: React.MouseEvent) {
    e.stopPropagation();
    setOpen(true);
    if (firstFindingLine == null) return;
    requestAnimationFrame(() => {
      document
        .getElementById(findingAnchorId(file.path, firstFindingLine))
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  // Group this file's comments into threads, then split into ones we can anchor
  // to a rendered line vs. "outdated" (GitHub dropped the line / it's not here).
  const comments = commenting?.comments;
  const { matched, outdated } = React.useMemo(() => {
    if (!comments) return { matched: new Map<string, CommentThread[]>(), outdated: [] };
    const fileThreads = buildThreads(comments.filter((c) => c.path === file.path));
    const renderedKeys = new Set<string>();
    for (const ln of lines) for (const k of keysForLine(ln)) renderedKeys.add(k);
    return partitionThreads(fileThreads, renderedKeys);
  }, [comments, file.path, lines]);

  const commentCount = commenting
    ? commenting.comments.filter((c) => c.path === file.path).length
    : 0;

  return (
    <div style={s.fileCard}>
      <div onClick={() => setOpen((o) => !o)} style={s.fileHeader}>
        <Icon.ChevronRight size={13} style={chevronFor(open)} />
        <Icon.FileText size={14} style={s.fileIcon} />
        <span className="mono" style={s.filePath}>
          {file.path}
        </span>
        <span className="mono tnum" style={s.fileStat}>
          <span style={s.addText}>+{file.additions}</span>{" "}
          <span style={s.delText}>−{file.deletions}</span>
        </span>
        {findingCount > 0 && topSev && (
          <button
            type="button"
            onClick={jumpToFirstFinding}
            title={t("diffViewer.jumpToFinding")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 12,
              padding: "1px 7px",
              borderRadius: 999,
              cursor: "pointer",
              border: `1px solid ${SEV[topSev].c}`,
              color: SEV[topSev].c,
              background: SEV[topSev].bg,
            }}
          >
            <Icon.AlertTriangle size={12} />
            {t("diffViewer.findings", { count: findingCount })}
          </button>
        )}
        {commentCount > 0 && (
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-muted)" }}
          >
            <Icon.MessageSquare size={12} />
            {commentCount}
          </span>
        )}
      </div>
      {open && (
        <div style={s.fileBody}>
          {lines.length === 0 ? (
            <div style={s.noDiff}>{t("diffViewer.noDiffText")}</div>
          ) : (
            lines.map((ln, i) => {
              const severity = ln.newNo != null ? sevByLine.get(ln.newNo) : undefined;
              const severityLabel = ln.newNo != null ? lblByLine.get(ln.newNo) : undefined;
              return (
                <CodeLine
                  key={i}
                  ln={ln}
                  path={file.path}
                  threads={threadsForLine(ln, matched)}
                  commenting={commenting}
                  severity={severity}
                  severityLabel={severityLabel}
                  anchorId={severity ? findingAnchorId(file.path, ln.newNo!) : undefined}
                />
              );
            })
          )}
          {commenting && commenting.showComments && <OutdatedComments threads={outdated} />}
        </div>
      )}
    </div>
  );
}
