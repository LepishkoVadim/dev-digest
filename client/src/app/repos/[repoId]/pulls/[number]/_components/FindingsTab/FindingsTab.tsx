"use client";

import React, { useCallback } from "react";
import { Icon, Badge, Button, SectionLabel, EmptyState, SeverityBadge, SEV } from "@devdigest/ui";
import { RunStatus } from "../RunStatus";
import { RunHistory } from "../RunHistory/RunHistory";
import { ReviewRunAccordion } from "../ReviewRunAccordion";
import { s } from "./styles";
import type { FindingRecord, ReviewRecord, RunSummary, PrCommit } from "@devdigest/shared";
import type { EvalCaseDraft } from "@/components/EvalCaseEditor";
import type { useCancelRun } from "@/lib/hooks/reviews";

interface FindingsTabProps {
  prId: string | null;
  liveRunIds: string[];
  reviewRunning: boolean;
  lethalTrifecta: FindingRecord[];
  runs: ReviewRecord[];
  prRuns: RunSummary[] | undefined;
  prCommits: PrCommit[];
  cancelMutation: ReturnType<typeof useCancelRun>;
  /** owner/repo + head sha — used to deep-link a finding's file:line to GitHub. */
  repoFullName?: string | null;
  headSha?: string | null;
  onOpenTrace: (id: string) => void;
  onDelete: (id: string) => void;
  onRunDone: () => void;
  /** Active severity filter (from ?severity=), or null for "all". */
  severityFilter?: string | null;
  /** Toggle the severity filter (null clears it). */
  onSetSeverity: (severity: string | null) => void;
  /** Finding id to reveal (from ?finding=, e.g. a Smart Diff badge click). */
  focusFindingId?: string | null;
  /** Called once the focused finding has been revealed, so the param can clear. */
  onFindingFocused?: () => void;
  /** Open the case editor seeded from a finding (owner = the finding's agent). */
  onCreateEvalCase?: (draft: EvalCaseDraft) => void;
}

const SEVERITIES = ["CRITICAL", "WARNING", "SUGGESTION"] as const;

export function FindingsTab({
  prId,
  liveRunIds,
  reviewRunning,
  lethalTrifecta,
  runs,
  prRuns,
  prCommits,
  cancelMutation,
  repoFullName,
  headSha,
  onOpenTrace,
  onDelete,
  onRunDone,
  severityFilter,
  onSetSeverity,
  focusFindingId,
  onFindingFocused,
  onCreateEvalCase,
}: FindingsTabProps) {
  const handleCancelAll = useCallback(() => {
    liveRunIds.forEach((id) => cancelMutation.mutate(id));
  }, [liveRunIds, cancelMutation]);

  const handleOpenFirstTrace = useCallback(() => {
    if (liveRunIds[0]) onOpenTrace(liveRunIds[0]);
  }, [liveRunIds, onOpenTrace]);

  const handleOpenTrace = useCallback(
    (id: string) => {
      onOpenTrace(id);
    },
    [onOpenTrace],
  );

  const handleDelete = useCallback(
    (id: string) => {
      onDelete(id);
    },
    [onDelete],
  );

  // Timeline → Review-runs navigation: clicking an agent name in the timeline
  // opens + scrolls to that run's accordion below. The nonce re-triggers the
  // scroll even when the same run is clicked twice.
  const [target, setTarget] = React.useState<{ runId: string; n: number } | null>(null);
  const handleGoToReview = useCallback((runId: string) => {
    setTarget((p) => ({ runId, n: (p?.n ?? 0) + 1 }));
  }, []);

  // Deep-link from a Smart Diff finding badge (?finding=<id>): open the run's
  // accordion, scroll to that FindingCard, flash it, then clear the param.
  React.useEffect(() => {
    if (!focusFindingId) return;
    const review = runs.find((r) => r.findings.some((f) => f.id === focusFindingId));
    if (!review) return; // reviews not loaded yet — effect re-runs when `runs` arrives
    // A severity filter could hide the target run — clear it so the card renders.
    if (severityFilter && !review.findings.some((f) => f.id === focusFindingId && f.severity === severityFilter)) {
      onSetSeverity(null);
    }
    if (review.run_id) setTarget((p) => ({ runId: review.run_id!, n: (p?.n ?? 0) + 1 }));

    let raf = 0;
    let tries = 0;
    const tick = () => {
      const el = document.querySelector<HTMLElement>(`[data-finding-id="${focusFindingId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.style.transition = "box-shadow .25s";
        el.style.boxShadow = "0 0 0 2px var(--accent-text, #6b8afd)";
        window.setTimeout(() => {
          el.style.boxShadow = "";
        }, 1600);
        onFindingFocused?.();
        return;
      }
      if (tries++ < 30) raf = requestAnimationFrame(tick); // wait for the accordion to open
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusFindingId, runs]);

  // Aggregate per-severity counts across all this PR's reviews — the same
  // findings the accordions render, so the tally always matches what's shown.
  const severityCounts = React.useMemo(() => {
    const counts: Record<string, number> = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
    for (const review of runs) {
      for (const f of review.findings) {
        if (f.severity in counts) counts[f.severity]!++;
      }
    }
    return counts;
  }, [runs]);
  const totalFindings = SEVERITIES.reduce((n, sev) => n + severityCounts[sev]!, 0);

  // When a severity filter is active, hide accordions that have none of it.
  const visibleRuns = severityFilter
    ? runs.filter((r) => r.findings.some((f) => f.severity === severityFilter))
    : runs;

  // run_id → that run's findings, for the timeline's per-run badges + hover popover.
  const findingsByRunId = React.useMemo(() => {
    const map = new Map<string, FindingRecord[]>();
    for (const r of runs) if (r.run_id) map.set(r.run_id, r.findings);
    return map;
  }, [runs]);

  return (
    <section>
      {liveRunIds.length > 0 && (
        <div style={s.liveRunSection}>
          <SectionLabel
            icon="Sparkles"
            right={
              <div style={s.cancelActions}>
                <Button
                  kind="danger"
                  size="sm"
                  icon="X"
                  loading={cancelMutation.isPending}
                  onClick={handleCancelAll}
                >
                  Cancel
                </Button>
                <Button kind="ghost" size="sm" icon="FileText" onClick={handleOpenFirstTrace}>
                  Open run trace
                </Button>
              </div>
            }
          >
            Live review
          </SectionLabel>
          <RunStatus runIds={liveRunIds} onDone={onRunDone} />
        </div>
      )}

      {reviewRunning && (
        <div style={s.reviewInProgress}>
          <Icon.RefreshCw size={16} style={{ color: "var(--accent)", animation: "ddspin 1s linear infinite" }} />
          <span style={s.reviewInProgressText}>Review in progress…</span>
          <span style={s.reviewInProgressSub}>
            the agent is analyzing the diff — this can take a while on large PRs.
          </span>
        </div>
      )}

      {lethalTrifecta.length > 0 && (
        <div style={s.lethalTrifecta}>
          <Icon.Shield size={16} style={{ color: "var(--crit)" }} />
          <span style={s.lethalTrifectaTitle}>Lethal Trifecta detected</span>
          <Badge color="var(--crit)" bg="transparent">
            {lethalTrifecta.length} finding(s)
          </Badge>
        </div>
      )}

      {((prRuns && prRuns.length > 0) || prCommits.length > 0) && (
        <div style={s.timelineSection}>
          <SectionLabel
            icon="Activity"
            right={<span style={{ fontSize: 12, color: "var(--text-muted)" }}>runs &amp; commits · newest first</span>}
          >
            Timeline
          </SectionLabel>
          <RunHistory
            runs={prRuns ?? []}
            commits={prCommits}
            onOpenTrace={handleOpenTrace}
            onGoToReview={handleGoToReview}
            onDelete={handleDelete}
            findingsByRunId={findingsByRunId}
          />
        </div>
      )}

      <SectionLabel
        icon="AlertOctagon"
        right={<span style={{ fontSize: 12, color: "var(--text-muted)" }}>grouped by run · newest first</span>}
      >
        Review runs
      </SectionLabel>
      {totalFindings > 0 && (
        <div style={s.severityFilterBar}>
          {SEVERITIES.filter((sev) => severityCounts[sev]! > 0).map((sev) => {
            const active = severityFilter === sev;
            return (
              <button
                key={sev}
                type="button"
                aria-pressed={active}
                aria-label={`${SEV[sev].label} ${severityCounts[sev]}`}
                onClick={() => onSetSeverity(active ? null : sev)}
                style={{ ...s.severityFilterBtn, opacity: !severityFilter || active ? 1 : 0.45 }}
              >
                <SeverityBadge severity={sev} count={severityCounts[sev]} />
              </button>
            );
          })}
          {severityFilter && (
            <button type="button" onClick={() => onSetSeverity(null)} style={s.severityClearBtn}>
              Clear filter
            </button>
          )}
        </div>
      )}
      {visibleRuns.length === 0 ? (
        severityFilter && runs.length > 0 ? (
          <EmptyState
            icon="Filter"
            title="No findings at this severity"
            body="No runs have findings of the selected severity. Clear the filter to see all findings."
          />
        ) : reviewRunning || liveRunIds.length > 0 ? null : (
          <EmptyState
            icon="Sparkles"
            title="No findings yet"
            body="Run a review to generate findings. Use Run Review ▾ above (run all enabled agents or a specific one)."
          />
        )
      ) : (
        prId &&
        visibleRuns.map((review, i) => (
          <ReviewRunAccordion
            key={review.id}
            review={review}
            prId={prId}
            defaultOpen={i === 0}
            repoFullName={repoFullName}
            headSha={headSha}
            targetRunId={target?.runId ?? null}
            targetNonce={target?.n ?? 0}
            severityFilter={severityFilter}
            onCreateEvalCase={onCreateEvalCase}
          />
        ))
      )}
    </section>
  );
}
