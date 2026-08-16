"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, SectionLabel } from "@devdigest/ui";
import { useBrief } from "@/lib/hooks/reviews";
import { ReviewFocusList } from "./BriefBits";
import { s } from "./styles";

interface ReviewFocusCardProps {
  prId: string | null;
  repoFullName: string | null;
  headSha: string | null | undefined;
}

/**
 * REVIEW FOCUS — READ THESE FIRST: the full-width "open these lines first" list
 * below the Intent/Blast grid. Reads the shared Brief query (no extra fetch) and
 * renders nothing until a Brief exists — the PrBriefCard owns the generate flow.
 */
export function ReviewFocusCard({ prId, repoFullName, headSha }: ReviewFocusCardProps) {
  const t = useTranslations("brief");
  const { data } = useBrief(prId);

  if (!data) return null;

  return (
    <section style={s.section}>
      <SectionLabel
        icon="ListChecks"
        right={<Badge color="var(--text-secondary)">{data.review_focus.length}</Badge>}
      >
        {t("brief.reviewFocus")} — {t("brief.reviewFocusHint")}
      </SectionLabel>
      <div style={s.card}>
        <ReviewFocusList focus={data.review_focus} repoFullName={repoFullName} headSha={headSha} />
      </div>
    </section>
  );
}
