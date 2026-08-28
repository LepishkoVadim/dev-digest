/* EvalDashboardView — three metric cards (value/signed delta/sparkline), a
   metric-trend chart, and a run-history table with per-row checkboxes + a
   "Compare selected" action (AC-15/22/23). Renders from an EvalDashboard. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, LineChart, type ChartSeries } from "@devdigest/ui";
import type { EvalDashboard, EvalRunRecord } from "@devdigest/shared";
import { CompareModal, canCompare } from "./CompareModal";

const SERIES_COLORS = {
  recall: "var(--accent)",
  precision: "var(--ok, #22c55e)",
  citation: "var(--warn, #f59e0b)",
};

export function EvalDashboardView({
  dashboard,
  runPending,
  onRun,
}: {
  dashboard: EvalDashboard;
  /** True while a run is in progress → show an in-flight history row (AC-23). */
  runPending?: boolean;
  /** Trigger a run of the owner's case set (drives `runPending`). */
  onRun?: () => void;
}) {
  const t = useTranslations("eval");
  const [selected, setSelected] = React.useState<string[]>([]);
  const [comparing, setComparing] = React.useState<[EvalRunRecord, EvalRunRecord] | null>(null);

  const runs = dashboard.recent_runs;
  const hasRuns = runs.length > 0;

  const selectedRuns = runs.filter((r) => selected.includes(r.id));
  const compareEnabled = canCompare(selectedRuns);

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  function openCompare() {
    if (selectedRuns.length !== 2) return;
    // Chronological [older, newer]: recent_runs is newest-first.
    const [newer, older] = selectedRuns;
    setComparing([older!, newer!]);
  }

  const trend = dashboard.trend;
  const series: ChartSeries[] = [
    { name: "recall", color: SERIES_COLORS.recall, data: trend.map((p) => p.recall) },
    { name: "precision", color: SERIES_COLORS.precision, data: trend.map((p) => p.precision) },
    { name: "citation", color: SERIES_COLORS.citation, data: trend.map((p) => p.citation_accuracy) },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        <MetricCard
          label={t("dashboard.metrics.recall")}
          value={dashboard.current.recall}
          delta={dashboard.delta.recall}
          spark={trend.map((p) => p.recall)}
          hasRuns={hasRuns}
        />
        <MetricCard
          label={t("dashboard.metrics.precision")}
          value={dashboard.current.precision}
          delta={dashboard.delta.precision}
          spark={trend.map((p) => p.precision)}
          hasRuns={hasRuns}
        />
        <MetricCard
          label={t("dashboard.metrics.citationAccuracy")}
          value={dashboard.current.citation_accuracy}
          delta={dashboard.delta.citation_accuracy}
          spark={trend.map((p) => p.citation_accuracy)}
          hasRuns={hasRuns}
        />
      </div>

      {hasRuns ? (
        <section>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
            {t("dashboard.metricTrend")}
          </div>
          <LineChart series={series} />
        </section>
      ) : (
        <EmptyState icon="Gauge" title={t("dashboard.defaultTitle")} body={t("dashboard.noRuns")} />
      )}

      <section>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{t("dashboard.recentRuns")}</div>
          {onRun && (
            <Button
              kind="primary"
              size="sm"
              icon="Play"
              disabled={dashboard.cases_total === 0 || runPending}
              onClick={onRun}
            >
              {runPending
                ? t("dashboard.running")
                : t("dashboard.runEval", { count: dashboard.cases_total })}
            </Button>
          )}
          <Button kind="secondary" size="sm" disabled={!compareEnabled} onClick={openCompare}>
            Compare selected
          </Button>
        </div>
        <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ color: "var(--text-muted)", textAlign: "left" }}>
              <th style={cell} />
              <th style={cell}>{t("dashboard.table.ranAt")}</th>
              <th style={cell}>Version</th>
              <th style={cell}>{t("dashboard.table.recall")}</th>
              <th style={cell}>{t("dashboard.table.precision")}</th>
              <th style={cell}>{t("dashboard.table.citation")}</th>
              <th style={cell}>{t("dashboard.table.pass")}</th>
              <th style={cell}>{t("dashboard.table.cost")}</th>
            </tr>
          </thead>
          <tbody>
            {runPending && (
              <tr>
                <td style={cell} />
                <td style={cell} colSpan={7}>
                  {t("dashboard.running")}
                </td>
              </tr>
            )}
            {runs.map((r) => (
              <tr key={r.id}>
                <td style={cell}>
                  <input
                    type="checkbox"
                    aria-label={`Select run ${r.id}`}
                    checked={selected.includes(r.id)}
                    onChange={() => toggle(r.id)}
                  />
                </td>
                <td style={cell}>{new Date(r.ran_at).toLocaleString()}</td>
                <td style={cell}>{r.version == null ? "—" : `v${r.version}`}</td>
                <td style={cell}>{fmt(r.recall)}</td>
                <td style={cell}>{fmt(r.precision)}</td>
                <td style={cell}>{fmt(r.citation_accuracy)}</td>
                <td style={cell}>{r.pass == null ? "—" : r.pass ? t("dashboard.pass") : t("dashboard.fail")}</td>
                <td style={cell}>{r.cost_usd == null ? "—" : `$${r.cost_usd.toFixed(4)}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {comparing && dashboard.owner_id && (
        <CompareModal
          runs={comparing}
          ownerId={dashboard.owner_id}
          onClose={() => setComparing(null)}
        />
      )}
    </div>
  );
}

function fmt(v: number | null): string {
  return v == null ? "—" : `${Math.round(v * 100)}%`;
}

function MetricCard({
  label,
  value,
  delta,
  spark,
  hasRuns,
}: {
  label: string;
  value: number;
  delta: number;
  spark: number[];
  hasRuns: boolean;
}) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700 }}>
        {hasRuns ? `${Math.round(value * 100)}%` : "—"}
      </div>
      {hasRuns && (
        <div style={{ fontSize: 12, color: delta >= 0 ? "var(--ok, #22c55e)" : "var(--crit, #ef4444)" }}>
          {delta >= 0 ? "+" : ""}
          {Math.round(delta * 100)}%
        </div>
      )}
      {hasRuns && spark.length > 1 && (
        <div style={{ marginTop: 8 }}>
          <LineChart
            series={[{ name: label, color: "var(--accent)", data: spark }]}
            w={200}
            h={40}
          />
        </div>
      )}
    </div>
  );
}

const cell: React.CSSProperties = { padding: "6px 10px", borderBottom: "1px solid var(--border)" };
