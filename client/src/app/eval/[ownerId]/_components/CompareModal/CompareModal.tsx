/* CompareModal — two-run per-metric deltas + config diff (AC-17/24). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Modal } from "@devdigest/ui";
import type { EvalRunRecord } from "@devdigest/shared";
import { useEvalVersionText } from "@/lib/hooks/evals";
import { lineDiff } from "./line-diff";

function pct(v: number | null): string {
  return v == null ? "—" : `${Math.round(v * 100)}%`;
}
function signedDelta(a: number | null, b: number | null): string {
  if (a == null || b == null) return "—";
  const d = Math.round((b - a) * 100);
  return `${d >= 0 ? "+" : ""}${d}%`;
}

export function CompareModal({
  runs,
  ownerId,
  onClose,
}: {
  /** Exactly two same-owner runs, chronological [older, newer]. */
  runs: [EvalRunRecord, EvalRunRecord];
  /** Owner id — used to fetch each run's version snapshot for the config diff. */
  ownerId: string;
  onClose: () => void;
}) {
  const t = useTranslations("eval");
  const [a, b] = runs;

  // Fetch the config snapshot (system_prompt / skill body) for each run's
  // version, then line-diff old vs new (AC-17). Same version → identical text →
  // empty diff, while the metric deltas above still render (AC-24).
  const oldText = useEvalVersionText(ownerId, a.version);
  const newText = useEvalVersionText(ownerId, b.version);
  const diff = React.useMemo(
    () => lineDiff(oldText.data?.text ?? "", newText.data?.text ?? ""),
    [oldText.data?.text, newText.data?.text],
  );
  const diffLoading = oldText.isLoading || newText.isLoading;

  const metrics: { label: string; a: number | null; b: number | null }[] = [
    { label: t("dashboard.metrics.recall"), a: a.recall, b: b.recall },
    { label: t("dashboard.metrics.precision"), a: a.precision, b: b.precision },
    { label: t("dashboard.metrics.citationAccuracy"), a: a.citation_accuracy, b: b.citation_accuracy },
    { label: t("dashboard.table.cost"), a: a.cost_usd, b: b.cost_usd },
  ];

  return (
    <Modal title={t("dashboard.recentRuns")} width={820} onClose={onClose}>
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
        <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ color: "var(--text-muted)", textAlign: "left" }}>
              <th style={cell}>Metric</th>
              <th style={cell}>v{a.version ?? "—"}</th>
              <th style={cell}>v{b.version ?? "—"}</th>
              <th style={cell}>Δ</th>
            </tr>
          </thead>
          <tbody>
            {metrics.map((m) => (
              <tr key={m.label}>
                <td style={cell}>{m.label}</td>
                <td style={cell}>{pct(m.a)}</td>
                <td style={cell}>{pct(m.b)}</td>
                <td style={cell}>{signedDelta(m.a, m.b)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>
            Config diff
          </div>
          {/* Scrolls; never truncates a changed line (AC-24). */}
          <pre
            style={{
              margin: 0,
              maxHeight: 320,
              overflow: "auto",
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: 12,
              fontFamily: "var(--mono)",
              fontSize: 12,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {diffLoading
              ? "…"
              : diff.length === 0
                ? "(no config change between these runs)"
                : diff.map((ln, i) => (
                    <div key={i} style={diffLineStyle(ln.sign)}>
                      {ln.sign}
                      {ln.text}
                    </div>
                  ))}
          </pre>
        </div>
      </div>
    </Modal>
  );
}

const cell: React.CSSProperties = { padding: "6px 10px", borderBottom: "1px solid var(--border)" };

function diffLineStyle(sign: " " | "+" | "-"): React.CSSProperties {
  if (sign === "+") return { color: "var(--ok, #22c55e)", background: "rgba(34,197,94,0.08)" };
  if (sign === "-") return { color: "var(--crit, #ef4444)", background: "rgba(239,68,68,0.08)" };
  return { color: "var(--text-muted)" };
}
