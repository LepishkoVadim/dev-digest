"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, EmptyState, ErrorState, IconBtn, SectionLabel, Skeleton } from "@devdigest/ui";
import { ApiError } from "@/lib/api";
import { usePrIntent, useDeriveIntent } from "@/lib/hooks/reviews";
import { s, CONFIDENCE_COLOR } from "./styles";

interface IntentCardProps {
  /** Null while the PR is still resolving; the query stays disabled until it isn't. */
  prId: string | null;
}

/**
 * Derived intent & scope for a PR — the pre-review surface.
 *
 * `confidence` and `sources` come from the server, where confidence is COMPUTED
 * from which sources actually resolved (never self-reported by the model). Any
 * `unavailable` source is rendered as an explicit "missing context" line rather
 * than hidden, so the user can see the classification was working blind.
 */
export function IntentCard({ prId }: IntentCardProps) {
  const t = useTranslations("brief");
  const { data, isLoading, error, refetch } = usePrIntent(prId);
  const derive = useDeriveIntent(prId);

  // A 404 is the "never derived" state, not a failure.
  const notFound = error instanceof ApiError && error.status === 404;

  if (isLoading) {
    return (
      <section>
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
        <section>
          <SectionLabel icon="Target">{t("block.intent")}</SectionLabel>
          <div style={s.card}>
            <ErrorState body={(error as Error).message} onRetry={() => void refetch()} />
          </div>
        </section>
      );
    }
    return (
      <section>
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
    <section>
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
        <div style={s.summary}>{data.intent}</div>

        {data.in_scope.length > 0 && (
          <div style={s.scopeRow}>
            <span style={s.scopeLabel}>{t("inScope")}</span>
            {data.in_scope.map((item) => (
              <Badge key={item}>{item}</Badge>
            ))}
          </div>
        )}

        {data.out_of_scope.length > 0 && (
          <div style={s.scopeRow}>
            <span style={s.scopeLabel}>{t("outOfScope")}</span>
            {data.out_of_scope.map((item) => (
              <Badge key={item} color="var(--text-muted)">
                {item}
              </Badge>
            ))}
          </div>
        )}

        {missing.length > 0 && (
          <div style={s.missing}>
            <strong>{t("missingContext")}:</strong>{" "}
            {missing.map((src) => `${src.kind} (${src.ref})`).join(", ")}
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
