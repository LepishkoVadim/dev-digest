"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import type { BriefRisk, ReviewFocus } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";
import { s, RISK_COLOR } from "./styles";

interface RefLoc {
  /** For building GitHub blob links; plain-text fallback when either is missing (AC-14). */
  repoFullName: string | null;
  headSha: string | null | undefined;
}

/**
 * A file:line reference — a blue GitHub blob link, or plain text when the repo
 * metadata needed to build the link is missing (AC-14). Model text never becomes
 * a raw href; only the file/line values feed `githubBlobUrl`.
 */
export function FileRef({
  repoFullName,
  headSha,
  file,
  line,
}: RefLoc & { file: string; line?: number | null }) {
  const text = line != null ? `${file}:${line}` : file;
  const href =
    repoFullName && headSha ? githubBlobUrl(repoFullName, headSha, file, line ?? undefined) : undefined;
  return href ? (
    <a className="mono" style={s.fileLink} href={href} target="_blank" rel="noreferrer">
      {text}
    </a>
  ) : (
    <span className="mono" style={s.muted}>
      {text}
    </span>
  );
}

/**
 * RISK AREAS — the code-derived overall `risk_level` badge plus one expandable
 * row per risk. The accordion header is a real <button>, so Enter/Space
 * activation, focus retention and aria-expanded come from the platform (AC-17).
 * Lives inside the Intent card per the Overview layout.
 */
export function RiskAreas({
  risks,
  riskLevel,
  repoFullName,
  headSha,
}: RefLoc & { risks: BriefRisk[]; riskLevel: string }) {
  const t = useTranslations("brief");
  const [open, setOpen] = React.useState<Record<number, boolean>>({});
  const riskColor = RISK_COLOR[riskLevel];

  return (
    <div>
      <div style={s.groupHead}>
        <span style={s.groupLabel}>{t("brief.riskAreas")}</span>
        <Badge color={riskColor?.color} bg={riskColor?.bg}>
          {t("brief.riskLevel")}: {t(`brief.risk.${riskLevel}`)}
        </Badge>
      </div>

      {risks.length === 0 ? (
        <div style={s.emptyRow}>{t("brief.noRiskAreas")}</div>
      ) : (
        risks.map((risk, i) => {
          const isOpen = open[i] ?? false;
          const sevColor = RISK_COLOR[risk.severity];
          return (
            <div key={`${risk.kind}-${i}`} style={s.riskRow}>
              <button
                type="button"
                style={s.riskHeader}
                aria-expanded={isOpen}
                onClick={() => setOpen((o) => ({ ...o, [i]: !isOpen }))}
              >
                {isOpen ? <Icon.ChevronDown size={14} /> : <Icon.ChevronRight size={14} />}
                <span style={s.riskTitle}>{risk.title}</span>
                <Badge color={sevColor?.color} bg={sevColor?.bg}>
                  {t(`brief.risk.${risk.severity}`)}
                </Badge>
              </button>
              {isOpen && (
                <div style={s.riskBody}>
                  <div>{risk.explanation}</div>
                  {(risk.file_refs.length > 0 || (risk.endpoint_refs?.length ?? 0) > 0) && (
                    <div style={s.refList}>
                      {risk.file_refs.map((f) => (
                        <FileRef key={`f-${f}`} repoFullName={repoFullName} headSha={headSha} file={f} />
                      ))}
                      {(risk.endpoint_refs ?? []).map((e) => (
                        <span key={`e-${e}`} className="mono" style={s.muted}>
                          {e}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

/**
 * REVIEW FOCUS — the "read these first" list: a blue file:line link + its reason,
 * one per line. Rendered full-width below the Intent/Blast grid.
 */
export function ReviewFocusList({
  focus,
  repoFullName,
  headSha,
}: RefLoc & { focus: ReviewFocus[] }) {
  const t = useTranslations("brief");
  if (focus.length === 0) {
    return <div style={s.emptyRow}>{t("brief.noReviewFocus")}</div>;
  }
  return (
    <>
      {focus.map((f, i) => (
        <div key={`${f.file}-${i}`} style={s.focusItem}>
          <Icon.ChevronRight size={13} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
          <FileRef repoFullName={repoFullName} headSha={headSha} file={f.file} line={f.line} />
          <span style={s.focusReason}>— {f.reason}</span>
        </div>
      ))}
    </>
  );
}
