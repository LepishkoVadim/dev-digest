/* CodeLine — one rendered diff line: gutter number, +/- sign, text, plus the
   hover "+" affordance, any anchored comment threads, and an inline composer. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SEV } from "@devdigest/ui";
import { commentTargetFor, type CommentThread, type DiffCommentApi, cs } from "../comments";
import { type Line } from "../helpers";
import { s, lineRowFor, lineSignFor } from "../styles";
import type { DiffFinding, Severity } from "../severity";
import { CommentThreadView } from "../CommentThreadView";
import { InlineComposer } from "../InlineComposer";

export function CodeLine({
  ln,
  path,
  threads,
  commenting,
  severity,
  labelFinding,
  onFindingClick,
  anchorId,
}: {
  ln: Line;
  path: string;
  threads: CommentThread[];
  commenting?: DiffCommentApi;
  /** Severity of the finding covering this line — tints the row + accent bar. */
  severity?: Severity;
  /** When set, shows a right-aligned severity label (one per finding, on its start line)
      that deep-links to the finding's FindingCard. */
  labelFinding?: DiffFinding;
  /** Navigate to a finding's FindingCard (Findings tab). */
  onFindingClick?: (findingId: string) => void;
  /** DOM id set on the row so a findings badge can scroll to it. */
  anchorId?: string;
}) {
  const t = useTranslations("shell");
  const [hover, setHover] = React.useState(false);
  const [composing, setComposing] = React.useState(false);

  if (ln.kind === "hunk") {
    return (
      <div className="mono" style={s.hunk}>
        {ln.text}
      </div>
    );
  }

  const sign = ln.kind === "add" ? "+" : ln.kind === "del" ? "−" : "";
  const target = commenting?.canComment ? commentTargetFor(ln) : null;
  const showAdd = hover && !!target && !composing;
  const LabelIcon = labelFinding ? Icon[SEV[labelFinding.severity].icon] : null;

  return (
    <div
      id={anchorId}
      style={cs.rowWrap}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div
        style={
          severity
            ? {
                ...lineRowFor(ln.kind),
                boxShadow: `inset 3px 0 0 ${SEV[severity].c}`,
                background: SEV[severity].bg,
              }
            : lineRowFor(ln.kind)
        }
      >
        <span className="mono tnum" style={{ ...s.lineNo, position: "relative" }}>
          {showAdd && target && (
            <button
              type="button"
              title="Add a comment on this line"
              aria-label="Add a comment on this line"
              onClick={() => setComposing(true)}
              style={cs.addBtn}
            >
              +
            </button>
          )}
          {ln.newNo ?? ln.oldNo ?? ""}
        </span>
        <span className="mono" style={lineSignFor(ln.kind)}>
          {sign}
        </span>
        <span className="mono" style={s.lineText}>
          {ln.text || " "}
        </span>
        {labelFinding && LabelIcon && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onFindingClick?.(labelFinding.id);
            }}
            title={t("diffViewer.openFinding")}
            style={{
              marginLeft: "auto",
              alignSelf: "center",
              flexShrink: 0,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 11,
              padding: "0 8px",
              border: "none",
              background: "none",
              cursor: onFindingClick ? "pointer" : "default",
              color: SEV[labelFinding.severity].c,
            }}
          >
            <LabelIcon size={11} />
            {t(`diffViewer.sev.${labelFinding.severity}`)}
          </button>
        )}
      </div>

      {commenting &&
        commenting.showComments &&
        threads.map((th) => (
          <CommentThreadView key={th.rootId} thread={th} commenting={commenting} path={path} />
        ))}

      {commenting && composing && target && (
        <InlineComposer
          commenting={commenting}
          path={path}
          line={target.line}
          side={target.side}
          onClose={() => setComposing(false)}
        />
      )}
    </div>
  );
}
