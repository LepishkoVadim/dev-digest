/* BlastCard — deterministic, index-only impact map, shown in the PR Overview
   next to Intent. changed symbols → callers → reachable endpoints/crons, plus a
   prior-PRs footer. No LLM. file:line links open the exact line on GitHub
   (pinned to the PR head sha), the same deep-link the findings use.

   Symbols are server-ranked by importance (most callers first); only the top few
   show inline, the rest open in a "See all" modal so a 90-symbol diff stays
   scannable. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Icon, MonoLink, Modal, Skeleton, ErrorState, Avatar } from "@devdigest/ui";
import type { BlastReportSymbol } from "@devdigest/shared";
import { githubBlobUrl, githubPrUrl } from "@/lib/github-urls";
import { useBlast } from "@/lib/hooks/blast";
import { BlastGraph } from "./BlastGraph";
import { s } from "./styles";

/** How many symbols show inline before the rest move behind "See all". */
const TOP_N = 6;

interface BlastCardProps {
  prId: string | null;
  repoFullName: string | null;
  headSha: string | null | undefined;
}

type FileLink = (file: string, line?: number) => React.ReactNode;

function label(sym: { name: string; kind: string }): string {
  return sym.kind === "function" || sym.kind === "method" ? `${sym.name}()` : sym.name;
}

/** Render a note, turning `backtick`-wrapped spans into inline code chips. */
function renderNote(note: string): React.ReactNode {
  return note.split(/(`[^`]+`)/g).map((seg, i) =>
    seg.startsWith("`") && seg.endsWith("`") && seg.length > 1 ? (
      <code key={i} style={s.noteCode}>
        {seg.slice(1, -1)}
      </code>
    ) : (
      <React.Fragment key={i}>{seg}</React.Fragment>
    ),
  );
}

/** One symbol row (collapsible): header + callers + endpoint/cron chips. */
function SymbolNode({
  sym,
  open,
  onToggle,
  fileLink,
  t,
}: {
  sym: BlastReportSymbol;
  open: boolean;
  onToggle: () => void;
  fileLink: FileLink;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div>
      <div style={s.symbolHead} onClick={onToggle}>
        {open ? <Icon.ChevronDown size={14} /> : <Icon.ChevronRight size={14} />}
        <Icon.Code size={13} style={{ color: "var(--text-muted)" }} />
        <span className="mono" style={s.symbolName}>
          {label(sym)}
        </span>
        <span style={s.callerCount}>{t("callerCount", { count: sym.callers.length })}</span>
      </div>

      {open && (
        <div style={s.symbolBody}>
          {sym.callers.length === 0 ? (
            <span style={s.muted}>{t("tab.noCallers")}</span>
          ) : (
            sym.callers.map((c) => (
              <div key={`${c.file}:${c.line}`} style={s.callerRow}>
                <Icon.CornerDownRight size={12} style={s.callerIcon} />
                <span style={s.callerLink}>{fileLink(c.file, c.line)}</span>
              </div>
            ))
          )}
          {(sym.endpoints.length > 0 || sym.crons.length > 0) && (
            <div style={s.chipRow}>
              {sym.endpoints.map((e) => (
                <span key={e} style={s.chip("endpoint")}>
                  <Icon.Globe size={11} /> {e}
                </span>
              ))}
              {sym.crons.map((c) => (
                <span key={c} style={s.chip("cron")}>
                  <Icon.Clock size={11} /> {c}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function BlastCard({ prId, repoFullName, headSha }: BlastCardProps) {
  const t = useTranslations("blast");
  const { data, isLoading, isError, error, refetch } = useBlast(prId);
  const [view, setView] = React.useState<"tree" | "graph">("tree");
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});
  const [priorOpen, setPriorOpen] = React.useState(false);
  const [modalOpen, setModalOpen] = React.useState(false);

  const header = <SectionLabel icon="Zap">{t("tab.title")}</SectionLabel>;

  if (isLoading) {
    return (
      <section style={s.section}>
        {header}
        <div style={s.card}>
          <Skeleton height={16} />
          <Skeleton height={60} />
        </div>
      </section>
    );
  }

  if (isError || !data) {
    return (
      <section style={s.section}>
        {header}
        <div style={s.card}>
          <ErrorState
            title={t("state.errorTitle")}
            body={error instanceof Error ? error.message : undefined}
            onRetry={() => void refetch()}
          />
        </div>
      </section>
    );
  }

  const fileLink: FileLink = (file, line) => {
    const text = line != null ? `${file}:${line}` : file;
    const href =
      repoFullName && headSha ? githubBlobUrl(repoFullName, headSha, file, line) : undefined;
    return href ? (
      <MonoLink href={href}>{text}</MonoLink>
    ) : (
      <span className="mono" style={s.muted}>
        {text}
      </span>
    );
  };

  if (data.status === "degraded") {
    return (
      <section style={s.section}>
        {header}
        <div style={s.card}>
          <div style={s.emptyMsg}>{t("state.degradedBody")}</div>
        </div>
      </section>
    );
  }

  if (data.status === "empty") {
    return (
      <section style={s.section}>
        {header}
        <div style={s.card}>
          <div style={s.emptyMsg}>{t("state.emptyBody")}</div>
        </div>
      </section>
    );
  }

  // Stat totals (across ALL symbols, not just the visible slice).
  const callerTotal = data.symbols.reduce((n, sym) => n + sym.callers.length, 0);
  const endpointTotal = new Set(data.symbols.flatMap((sym) => sym.endpoints)).size;
  const cronTotal = new Set(data.symbols.flatMap((sym) => sym.crons)).size;

  const keyOf = (sym: BlastReportSymbol) => `${sym.file}:${sym.name}`;
  const toggle = (sym: BlastReportSymbol, fallback: boolean) => {
    const k = keyOf(sym);
    setExpanded((e) => ({ ...e, [k]: !(e[k] ?? fallback) }));
  };

  const visible = data.symbols.slice(0, TOP_N);
  const hiddenCount = data.symbols.length - visible.length;

  return (
    <section style={s.section}>
      {header}
      <div style={s.card}>
        {/* stat bar + view toggle */}
        <div style={s.statBar}>
          <div style={s.stats}>
            <span style={s.stat}>
              <Icon.Code size={13} /> {data.symbols.length} {t("stat.symbols")}
            </span>
            <span style={s.stat}>
              <Icon.CornerDownRight size={13} /> {callerTotal} {t("stat.callers")}
            </span>
            <span style={s.stat}>
              <Icon.Globe size={13} /> {endpointTotal} {t("stat.endpoints")}
            </span>
            <span style={s.stat}>
              <Icon.Clock size={13} /> {cronTotal} {t("stat.crons")}
            </span>
          </div>
          <div style={s.toggle} role="tablist" aria-label={t("tab.title")}>
            <button
              type="button"
              style={s.toggleBtn(view === "tree")}
              onClick={() => setView("tree")}
            >
              {t("view.tree")}
            </button>
            <button
              type="button"
              style={s.toggleBtn(view === "graph")}
              onClick={() => setView("graph")}
            >
              {t("view.graph")}
            </button>
          </div>
        </div>

        {data.status === "partial" && (
          <div style={s.partialBanner}>
            <Icon.AlertTriangle size={13} style={{ color: "var(--warn)", flexShrink: 0 }} />
            <span>{t("state.partialBanner")}</span>
          </div>
        )}

        {view === "tree" ? (
          <div style={s.tree}>
            {visible.map((sym, i) => (
              <SymbolNode
                key={keyOf(sym)}
                sym={sym}
                open={expanded[keyOf(sym)] ?? i === 0}
                onToggle={() => toggle(sym, i === 0)}
                fileLink={fileLink}
                t={t}
              />
            ))}
          </div>
        ) : visible.some((sym) => sym.callers.length > 0) ? (
          <BlastGraph symbols={visible} />
        ) : (
          <span style={s.muted}>{t("graph.empty")}</span>
        )}

        {hiddenCount > 0 && (
          <button type="button" style={s.seeAll} onClick={() => setModalOpen(true)}>
            {t("seeAll", { count: data.symbols.length })}
          </button>
        )}

        {/* prior PRs footer */}
        <div style={s.footer}>
          <div
            style={s.footerHead}
            onClick={() => data.prior_prs.length > 0 && setPriorOpen((v) => !v)}
          >
            <Icon.History size={14} />
            <span>{t("priorPrs.title")}</span>
            <span style={s.footerCount}>{data.prior_prs.length}</span>
            {data.prior_prs.length > 0 && (
              <span style={s.footerChevron}>
                {priorOpen ? <Icon.ChevronDown size={16} /> : <Icon.ChevronRight size={16} />}
              </span>
            )}
          </div>
          {priorOpen && (
            <div style={s.priorList}>
              {data.prior_prs.map((p) => (
                <div key={p.number} style={s.priorItem}>
                  <span style={s.priorBullet}>·</span>
                  <div style={s.priorMain}>
                    <div style={s.priorTitleRow}>
                      {repoFullName ? (
                        <MonoLink href={githubPrUrl(repoFullName, p.number)}>#{p.number}</MonoLink>
                      ) : (
                        <span className="mono">#{p.number}</span>
                      )}
                      <span style={s.priorTitle}>{p.title}</span>
                    </div>
                    <div style={s.priorMeta}>
                      <Avatar name={p.author} size={16} />
                      <span>{p.author}</span>
                      {p.date && <span>· {p.date.slice(0, 10)}</span>}
                    </div>
                    {p.note && <div style={s.priorNote}>{renderNote(p.note)}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {modalOpen && (
        <Modal
          title={t("tab.title")}
          subtitle={t("allSymbols", { count: data.symbols.length })}
          onClose={() => setModalOpen(false)}
        >
          <div style={s.modalList}>
            {data.symbols.map((sym) => (
              <SymbolNode
                key={keyOf(sym)}
                sym={sym}
                open={expanded[keyOf(sym)] ?? false}
                onToggle={() => toggle(sym, false)}
                fileLink={fileLink}
                t={t}
              />
            ))}
          </div>
        </Modal>
      )}
    </section>
  );
}
