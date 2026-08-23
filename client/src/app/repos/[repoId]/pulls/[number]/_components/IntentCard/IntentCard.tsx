"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, EmptyState, ErrorState, Icon, IconBtn, SectionLabel, Skeleton } from "@devdigest/ui";
import { ApiError } from "@/lib/api";
import { usePrIntent, useDeriveIntent, useBrief } from "@/lib/hooks/reviews";
import { RiskAreas } from "../PrBriefCard";
import { s, CONFIDENCE_COLOR } from "./styles";

interface IntentCardProps {
  /** Null while the PR is still resolving; the query stays disabled until it isn't. */
  prId: string | null;
  /** For building GitHub blob links on the risk-area refs; plain-text fallback when missing. */
  repoFullName: string | null;
  headSha: string | null | undefined;
}

/**
 * Derived intent & scope for a PR — the pre-review surface.
 *
 * `confidence` and `sources` come from the server, where confidence is COMPUTED
 * from which sources actually resolved (never self-reported by the model). Any
 * `unavailable` source is rendered as an explicit "missing context" line rather
 * than hidden, so the user can see the classification was working blind.
 */
export function IntentCard({ prId, repoFullName, headSha }: IntentCardProps) {
  const t = useTranslations("brief");
  const { data, isLoading, error, refetch } = usePrIntent(prId);
  const derive = useDeriveIntent(prId);
  // The Brief's risk areas render inside this card (shared query — no extra fetch).
  const brief = useBrief(prId);

  // A 404 is the "never derived" state, not a failure.
  const notFound = error instanceof ApiError && error.status === 404;

  if (isLoading) {
    return (
      <section style={s.section}>
        <SectionLabel icon="Target">{t("block.intent")}</SectionLabel>
        <div style={s.card}>
          <Skeleton height={16} style={{ marginBottom: 10 }} />
          <Skeleton width="70%" height={16} />
        </div>
      </section>
    );
  }

  if (notFound || !data) {
    if (error && !notFound) {
      return (
        <section style={s.section}>
          <SectionLabel icon="Target">{t("block.intent")}</SectionLabel>
          <div style={s.card}>
            <ErrorState body={(error as Error).message} onRetry={() => void refetch()} />
          </div>
        </section>
      );
    }
    return (
      <section style={s.section}>
        <SectionLabel icon="Target">{t("block.intent")}</SectionLabel>
        <div style={s.card}>
          <EmptyState
            icon="Target"
            title={t("notDerived")}
            body={t("notDerivedHint")}
            cta={t("derive")}
            onCta={() => derive.mutate()}
            ctaLoading={derive.isPending}
          />
        </div>
      </section>
    );
  }

  // Derived during render — never stored in state.
  const sources = data.sources ?? [];
  const missing = sources.filter((src) => src.status === "unavailable");
  const confidence = data.confidence ?? undefined;
  const confColor = confidence ? CONFIDENCE_COLOR[confidence] : undefined;

  return (
    <section style={s.section}>
      <SectionLabel
        icon="Target"
        right={
          <IconBtn
            icon="RefreshCw"
            // IconBtn maps `label` to both title and aria-label (icon-only a11y).
            label={t("rederive")}
            active={derive.isPending}
            onClick={() => {
              if (!derive.isPending) derive.mutate();
            }}
          />
        }
      >
        {t("block.intent")}
      </SectionLabel>

      <div style={s.card}>
        <div style={s.summary}>{`“${data.intent}”`}</div>

        {(data.in_scope.length > 0 || data.out_of_scope.length > 0) && (
          <div style={s.scopeCols}>
            {data.in_scope.length > 0 && (
              <div style={s.scopeCol}>
                <div style={s.scopeHead}>
                  <Icon.Check size={13} style={{ color: "var(--ok, #4ade80)" }} />
                  <span style={s.scopeHeadLabel(true)}>{t("inScope")}</span>
                </div>
                {data.in_scope.map((item) => (
                  <div key={item} style={s.scopeItem}>
                    <span style={s.dot}>·</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            )}
            {data.out_of_scope.length > 0 && (
              <div style={s.scopeCol}>
                <div style={s.scopeHead}>
                  <Icon.X size={13} style={{ color: "var(--text-muted)" }} />
                  <span style={s.scopeHeadLabel(false)}>{t("outOfScope")}</span>
                </div>
                {data.out_of_scope.map((item) => (
                  <div key={item} style={s.scopeItem}>
                    <span style={s.dot}>·</span>
                    <span style={s.scopeItemMuted}>{item}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {missing.length > 0 && (
          <div style={s.missing}>
            <strong>{t("missingContext")}:</strong>{" "}
            {missing.map((src) => `${src.kind} (${src.ref})`).join(", ")}
          </div>
        )}

        {/* Risk areas from the Brief (rendered only once a Brief exists). */}
        {brief.data && (
          <div style={s.riskAreas}>
            <RiskAreas
              risks={brief.data.risks}
              riskLevel={brief.data.risk_level}
              repoFullName={repoFullName}
              headSha={headSha}
            />
          </div>
        )}

        <div style={s.meta}>
          {confidence && (
            <Badge color={confColor?.color} bg={confColor?.bg}>
              {t("confidence")}: {confidence}
            </Badge>
          )}
          <span>
            {t("sources")}: {sources.filter((src) => src.status === "used").length}/{sources.length}
          </span>
          {data.model && <span className="mono">{data.model}</span>}
          {data.derived_at && <span>{t("derivedAt", { when: data.derived_at })}</span>}
        </div>
      </div>
    </section>
  );
}
