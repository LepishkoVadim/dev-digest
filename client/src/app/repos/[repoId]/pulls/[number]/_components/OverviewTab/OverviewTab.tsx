"use client";

import React from "react";
import { SectionLabel } from "@devdigest/ui";
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
      {/* Derived intent (left) alongside the deterministic blast radius (right):
          what the PR intends, and what it could actually touch — before review. */}
      <div style={s.grid}>
        <IntentCard prId={prId} />
        <BlastCard prId={prId} repoFullName={repoFullName} headSha={headSha} />
      </div>

      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}
