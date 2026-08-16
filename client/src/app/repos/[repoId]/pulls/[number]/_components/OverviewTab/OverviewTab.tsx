"use client";

import React from "react";
import { SectionLabel } from "@devdigest/ui";
import { PrBriefCard, ReviewFocusCard } from "../PrBriefCard";
import { IntentCard } from "../IntentCard";
import { BlastCard } from "../BlastCard";
import { s } from "./styles";

interface OverviewTabProps {
  prId: string | null;
  prBody: string | null | undefined;
  repoFullName: string | null;
  headSha: string | null | undefined;
}

export function OverviewTab({ prId, prBody, repoFullName, headSha }: OverviewTabProps) {
  return (
    <>
      {/* The one-glance what/why summary + verdict + PR score sits at the top of
          the Overview, above the intent/blast detail grid. */}
      <PrBriefCard prId={prId} headSha={headSha} />

      {/* Derived intent — with the Brief's risk areas — (left) alongside the
          deterministic blast radius (right): what the PR intends and could touch. */}
      <div style={s.grid}>
        <IntentCard prId={prId} repoFullName={repoFullName} headSha={headSha} />
        <BlastCard prId={prId} repoFullName={repoFullName} headSha={headSha} />
      </div>

      {/* "Read these first" — the highest-risk lines to open before the diff. */}
      <ReviewFocusCard prId={prId} repoFullName={repoFullName} headSha={headSha} />

      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}
