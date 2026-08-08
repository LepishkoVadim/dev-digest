/* FileCard — one collapsible file in the diff: header (path, +/- stat, comment
   count) and, when open, its parsed lines plus any outdated comments. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
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
  findingLines,
}: {
  file: PrFile;
  commenting?: DiffCommentApi;
  /** New-side line numbers covered by review findings (Smart Diff). */
  findingLines?: number[];
}) {
  const t = useTranslations("shell");
  const findingSet = React.useMemo(() => new Set(findingLines ?? []), [findingLines]);
  const [open, setOpen] = React.useState(
    (file.additions ?? 0) + (file.deletions ?? 0) <= AUTO_EXPAND_MAX_LINES ||
      findingSet.size > 0 // files with findings always start expanded
  );
  const lines = React.useMemo(() => parsePatch(file.patch), [file.patch]);

  // Badge click: make sure the file is open, then scroll to its first finding.
  function jumpToFirstFinding(e: React.MouseEvent) {
    e.stopPropagation();
    setOpen(true);
    const first = findingLines?.[0];
    if (first == null) return;
    requestAnimationFrame(() => {
      document
        .getElementById(findingAnchorId(file.path, first))
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
        {findingSet.size > 0 && (
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
              border: "1px solid var(--warn-text, #d29922)",
              color: "var(--warn-text, #d29922)",
              background: "var(--warn-bg, rgba(210,153,34,0.08))",
            }}
          >
            <Icon.AlertTriangle size={12} />
            {t("diffViewer.findings", { count: findingSet.size })}
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
              const isFinding = ln.newNo != null && findingSet.has(ln.newNo);
              return (
                <CodeLine
                  key={i}
                  ln={ln}
                  path={file.path}
                  threads={threadsForLine(ln, matched)}
                  commenting={commenting}
                  isFinding={isFinding}
                  anchorId={isFinding ? findingAnchorId(file.path, ln.newNo!) : undefined}
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
