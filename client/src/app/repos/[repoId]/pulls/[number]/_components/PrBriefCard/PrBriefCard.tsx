"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Icon, IconBtn, SectionLabel, Skeleton } from "@devdigest/ui";
import { ApiError } from "@/lib/api";
import { useBrief, useDeriveBrief, usePrReviews } from "@/lib/hooks/reviews";
import { VerdictBanner } from "../VerdictBanner";
import { s } from "./styles";

interface PrBriefCardProps {
  /** Null while the PR is still resolving; the query stays disabled until it isn't. */
  prId: string | null;
  /** Used to derive staleness (head SHA vs the Brief's stored state_key). */
  headSha: string | null | undefined;
}

/**
 * PR Brief — the top summary card on the Overview: the plain-language what/why,
 * shown together with the existing review verdict, finding/blocker counts and PR
 * score. Risk areas live in the Intent card and the "read these first" review
 * focus is a full-width section below the grid (see OverviewTab).
 *
 * Everything is DERIVED DURING RENDER (staleness, verdict context) — never copied
 * into state. The verdict/score/findings are read from the existing reviews and
 * rendered independently of the Brief's freshness (AC-15/16); the cost line comes
 * from the Brief's OWN StructuredResult (NFR-5), never from a review.
 */
export function PrBriefCard({ prId, headSha }: PrBriefCardProps) {
  const t = useTranslations("brief");
  const { data, isLoading, error, refetch } = useBrief(prId);
  const derive = useDeriveBrief(prId);
  const reviews = usePrReviews(prId);

  const notFound = error instanceof ApiError && error.status === 404;

  const header = (right?: React.ReactNode) => (
    <SectionLabel icon="FileText" right={right}>
      {t("brief.title")}
    </SectionLabel>
  );

  if (isLoading || derive.isPending) {
    return (
      <section style={s.section}>
        {header()}
        <div style={s.card}>
          <Skeleton height={18} style={{ marginBottom: 10 }} />
          <Skeleton width="80%" height={14} />
        </div>
      </section>
    );
  }

  // Error that is NOT a 404 → verbatim provider/request message + retry (AC-12).
  if (error && !notFound) {
    return (
      <section style={s.section}>
        {header()}
        <div style={s.card}>
          <ErrorState body={(error as Error).message} onRetry={() => void refetch()} />
        </div>
      </section>
    );
  }

  // A derive that failed carries the provider message verbatim (AC-8/AC-12).
  if (derive.isError) {
    return (
      <section style={s.section}>
        {header()}
        <div style={s.card}>
          <ErrorState body={(derive.error as Error).message} onRetry={() => derive.mutate()} />
        </div>
      </section>
    );
  }

  // Never derived → empty state with a Generate CTA (AC-10).
  if (notFound || !data) {
    return (
      <section style={s.section}>
        {header()}
        <div style={s.card}>
          <EmptyState
            icon="FileText"
            title={t("brief.notDerived")}
            body={t("brief.notDerivedHint")}
            cta={t("brief.generate")}
            onCta={() => derive.mutate()}
            ctaLoading={derive.isPending}
          />
        </div>
      </section>
    );
  }

  // Derived during render — never stored.
  const stale = !!headSha && !!data.state_key && headSha !== data.state_key;
  const summary = [data.what, data.why].filter(Boolean).join(" — ");

  const latestReview =
    (reviews.data ?? []).find((r) => r.kind === "review") ?? (reviews.data ?? [])[0];
  const hasVerdict = !!latestReview && latestReview.verdict != null;
  const blockers = hasVerdict
    ? latestReview!.findings.filter((f) => f.severity === "CRITICAL").length
    : 0;

  return (
    <section style={s.section}>
      {header(
        <IconBtn
          icon="RefreshCw"
          label={t("brief.regenerate")}
          active={derive.isPending}
          onClick={() => {
            if (!derive.isPending) derive.mutate();
          }}
        />,
      )}

      <div style={s.card}>
        {stale && (
          <div style={s.stale} role="status">
            <Icon.AlertTriangle size={14} />
            <span>{t("brief.stale")}</span>
          </div>
        )}

        {/* Verdict context — rendered independently of Brief freshness (AC-15/16).
            The Brief's what/why is the summary; verdict/score/findings come from
            the existing review, or an empty verdict state when none has run. */}
        {hasVerdict ? (
          <VerdictBanner
            verdict={latestReview!.verdict!}
            summary={summary || null}
            score={latestReview!.score}
            findingsCount={latestReview!.findings.length}
            blockers={blockers}
          />
        ) : (
          <div>
            <div style={s.what}>{data.what}</div>
            {data.why && <div style={s.why}>{data.why}</div>}
            <div style={{ ...s.verdictEmpty, marginTop: 10 }}>{t("brief.noVerdict")}</div>
          </div>
        )}

        {/* Cost line — from the Brief's OWN StructuredResult (NFR-5). */}
        <div style={s.meta}>
          {data.model && <span className="mono">{data.model}</span>}
          {data.cost_usd != null && <span>${data.cost_usd.toFixed(4)}</span>}
          {data.tokens_in != null && data.tokens_out != null && (
            <span>
              {data.tokens_in} → {data.tokens_out} {t("brief.tokens")}
            </span>
          )}
          {data.derived_at && <span>{t("derivedAt", { when: data.derived_at })}</span>}
        </div>
      </div>
    </section>
  );
}
