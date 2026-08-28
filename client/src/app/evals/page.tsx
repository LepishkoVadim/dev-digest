/* /evals — cross-agent Eval Dashboard (the "all evals" overview). The sidebar
   "Eval Dashboard" nav item lands here: one styled row per agent (last run +
   metrics or a "configure" hint) and a Recent-runs table across ALL agents, so
   saved cases/runs are discoverable in one place. Click a row to open the
   per-agent dashboard at /eval/:ownerId. */
"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { Button, Badge, Icon, Sparkline, ProgressBar, ErrorState, Skeleton } from "@devdigest/ui";
import type { Agent, EvalDashboard, EvalRunRecord } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { useAgents } from "@/lib/hooks/agents";
import { api } from "@/lib/api";
import { notify } from "@/lib/toast";

const BAR = { recall: "#22c55e", precision: "#eab308", citation: "#f97316" };

export default function EvalsOverviewPage() {
  const t = useTranslations("eval");
  const router = useRouter();
  const qc = useQueryClient();
  const { data: agents, isLoading, isError } = useAgents();
  const [running, setRunning] = React.useState(false);
  const crumb = [{ label: "Skills Lab" }, { label: t("overview.title") }];

  // One /eval/:id fetch per agent, shared with useEvalDashboard's cache key.
  const dashQueries = useQueries({
    queries: (agents ?? []).map((a) => ({
      queryKey: ["eval-dashboard", a.id],
      queryFn: () => api.get<EvalDashboard>(`/eval/${a.id}`),
      enabled: !!agents,
    })),
  });
  const dashByAgent = new Map<string, EvalDashboard | undefined>(
    (agents ?? []).map((a, i) => [a.id, dashQueries[i]?.data]),
  );

  // Recent runs across ALL agents (newest first).
  const recentRuns = (agents ?? [])
    .flatMap((a) =>
      (dashByAgent.get(a.id)?.recent_runs ?? []).map((r) => ({ run: r, agentName: a.name })),
    )
    .sort((x, y) => (y.run.ran_at > x.run.ran_at ? 1 : -1))
    .slice(0, 12);

  async function runAll() {
    const targets = (agents ?? []).filter((a) => (dashByAgent.get(a.id)?.cases_total ?? 0) > 0);
    if (targets.length === 0) return;
    setRunning(true);
    try {
      for (const a of targets) await api.post(`/agents/${a.id}/eval-runs`);
      for (const a of targets) qc.invalidateQueries({ queryKey: ["eval-dashboard", a.id] });
      notify.success(t("overview.ranAll", { count: targets.length }));
    } catch (e) {
      notify.error(e instanceof Error ? e.message : t("overview.runFailed"));
    } finally {
      setRunning(false);
    }
  }

  if (isError) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState fullScreen title={t("overview.title")} body="Could not load agents." />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <div style={{ padding: 28, maxWidth: 1120, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "flex-start" }}>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>{t("overview.title")}</h1>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 6 }}>
              {t("overview.subtitle")}
            </p>
          </div>
          <Button
            kind="primary"
            size="sm"
            icon="Play"
            disabled={running || !agents}
            onClick={runAll}
          >
            {running ? t("overview.running") : t("overview.runAll")}
          </Button>
        </div>

        {/* Agent rows -------------------------------------------------- */}
        <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 10 }}>
          {isLoading || !agents ? (
            <>
              <Skeleton height={64} />
              <Skeleton height={64} />
              <Skeleton height={64} />
            </>
          ) : agents.length === 0 ? (
            <ErrorState title={t("overview.title")} body={t("overview.noAgents")} />
          ) : (
            agents.map((a) => (
              <AgentRow key={a.id} agent={a} dash={dashByAgent.get(a.id)} t={t} onOpen={() => router.push(`/eval/${a.id}`)} />
            ))
          )}
        </div>

        {/* Recent runs ------------------------------------------------- */}
        {recentRuns.length > 0 && (
          <div style={{ marginTop: 32 }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>{t("overview.recentRuns")}</div>
            <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ color: "var(--text-muted)", fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase" }}>
                  <th style={{ ...th, width: "16%" }}>{t("overview.col.agent")}</th>
                  <th style={{ ...th, width: "20%" }}>{t("overview.col.case")}</th>
                  <th style={{ ...th, width: "13%" }}>{t("overview.col.date")}</th>
                  <th style={{ ...th, width: 56 }}>{t("overview.col.version")}</th>
                  <th style={th}>{t("dashboard.metrics.recall")}</th>
                  <th style={th}>{t("dashboard.metrics.precision")}</th>
                  <th style={th}>{t("dashboard.metrics.citationAccuracy")}</th>
                  <th style={{ ...th, textAlign: "right", width: 56 }}>{t("overview.col.pass")}</th>
                </tr>
              </thead>
              <tbody>
                {recentRuns.map(({ run, agentName }) => (
                  <RunRow key={run.id} run={run} agentName={agentName} t={t} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function AgentRow({
  agent,
  dash,
  t,
  onOpen,
}: {
  agent: Agent;
  dash: EvalDashboard | undefined;
  t: ReturnType<typeof useTranslations>;
  onOpen: () => void;
}) {
  const cur = dash?.current;
  const latest = dash?.recent_runs?.[0];
  const hasRuns = cur != null && cur.traces_total > 0 && latest != null;
  const spark = (dash?.trend ?? []).map((p) => p.recall);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpen()}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "14px 18px",
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        cursor: "pointer",
      }}
    >
      <span style={{ display: "grid", placeItems: "center", width: 34, height: 34, borderRadius: 8, background: "var(--bg-hover)" }}>
        <Icon.Settings size={16} style={{ color: "var(--text-muted)" }} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>{agent.name}</span>
          {agent.model && <Badge color="var(--accent)">{agent.model}</Badge>}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>
          {hasRuns
            ? t("overview.lastRun", {
                version: latest!.version != null ? `v${latest!.version}` : "—",
                when: fmtDate(latest!.ran_at),
                passed: cur!.traces_passed,
                total: cur!.traces_total,
              })
            : t("overview.configure")}
        </div>
      </div>

      {hasRuns && (
        <>
          <Sparkline data={spark.length ? spark : [cur!.recall]} color={BAR.recall} />
          <Stat label={t("dashboard.metrics.recall")} value={cur!.recall} color={BAR.recall} />
          <Stat label={t("dashboard.metrics.precision")} value={cur!.precision} color={BAR.precision} />
          <Stat label={t("dashboard.metrics.citationAccuracy")} value={cur!.citation_accuracy} color={BAR.citation} />
        </>
      )}
      <Icon.ChevronRight size={16} style={{ color: "var(--text-muted)" }} />
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ textAlign: "right", minWidth: 64 }}>
      <div style={{ fontSize: 10, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--text-muted)" }}>
        {label}
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color }}>{`${Math.round(value * 100)}%`}</div>
    </div>
  );
}

function RunRow({
  run,
  agentName,
  t,
}: {
  run: EvalRunRecord;
  agentName: string;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <tr style={{ borderTop: "1px solid var(--border)" }}>
      <td style={{ ...td, fontWeight: 600 }}>{agentName}</td>
      <td style={{ ...td, color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 0 }}>
        {run.case_name ?? "—"}
      </td>
      <td style={{ ...td, color: "var(--text-muted)" }}>{fmtDate(run.ran_at)}</td>
      <td style={td}>{run.version != null && <Badge color="var(--ok)">{`v${run.version}`}</Badge>}</td>
      <td style={td}><MetricBar value={run.recall} color={BAR.recall} /></td>
      <td style={td}><MetricBar value={run.precision} color={BAR.precision} /></td>
      <td style={td}><MetricBar value={run.citation_accuracy} color={BAR.citation} /></td>
      <td style={{ ...td, textAlign: "right", fontWeight: 600 }}>{run.pass == null ? "—" : run.pass ? t("overview.passOne") : t("overview.failOne")}</td>
    </tr>
  );
}

/** A filled bar (0–100) + trailing % — the recent-runs metric cell. */
function MetricBar({ value, color }: { value: number | null; color: string }) {
  if (value == null) return <span style={{ color: "var(--text-muted)" }}>—</span>;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1 }}>
        <ProgressBar value={value * 100} color={color} />
      </div>
      <span className="mono tnum" style={{ minWidth: 34, textAlign: "right", color: "var(--text-secondary)" }}>
        {Math.round(value * 100)}%
      </span>
    </div>
  );
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

const th: React.CSSProperties = { textAlign: "left", padding: "8px 10px", fontWeight: 600 };
const td: React.CSSProperties = { padding: "10px 10px", verticalAlign: "middle" };
