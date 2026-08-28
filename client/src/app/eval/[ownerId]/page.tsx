/* /eval/:ownerId — per-owner mentor-parity Eval Dashboard (AC-15/23/25).
   Thin page: resolves the owner id, loads the dashboard, wires the view. */
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useEvalDashboard, useRunEval } from "@/lib/hooks/evals";
import { ApiError } from "@/lib/api";
import { EvalDashboardView } from "./_components";

export default function EvalDashboardPage() {
  const { ownerId } = useParams<{ ownerId: string }>();
  const t = useTranslations("eval");
  const { data, isLoading, isError, error, refetch } = useEvalDashboard(ownerId);

  // Run the owner's case set from the dashboard; `isPending` drives the
  // in-progress history row while the cards keep the last completed run (AC-23).
  const runEval = useRunEval({ kind: data?.owner_kind ?? "agent", id: ownerId });

  // Remember the last-viewed owner so the /evals resolver lands here next time.
  React.useEffect(() => {
    if (ownerId && typeof window !== "undefined") {
      window.localStorage.setItem("devdigest.eval.lastOwnerId", ownerId);
    }
  }, [ownerId]);

  const crumb = [
    { label: t("page.crumbSkillsLab") },
    { label: t("page.crumbEvalDashboard") },
    { label: data?.owner_id ?? ownerId },
  ];

  if (isError) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState
          fullScreen
          title={t("dashboard.defaultTitle")}
          body={error instanceof ApiError ? error.message : t("dashboard.loading")}
          onRetry={() => refetch()}
        />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <div style={{ padding: 28, maxWidth: 1000, margin: "0 auto" }}>
        {isLoading || !data ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Skeleton height={24} width={240} />
            <Skeleton height={200} />
          </div>
        ) : (
          <EvalDashboardView
            dashboard={data}
            runPending={runEval.isPending}
            onRun={() => runEval.mutate()}
          />
        )}
      </div>
    </AppShell>
  );
}
