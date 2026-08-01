/* Stats tab — usage/finding KPIs (counts only, no dollar figures), the agents
   using this skill, and findings-by-category as a donut. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { MetricCard, Donut, Skeleton, EmptyState, Icon, type DonutSegment } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useSkillStats } from "../../../../../../../lib/hooks/skills";

const CAT_COLORS = ["var(--accent)", "#f59e0b", "#22c55e", "#a855f7", "#ef4444", "#0ea5e9"];

export function StatsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const { data: stats, isLoading } = useSkillStats(skill.id);

  if (isLoading) return <Skeleton height={200} />;
  if (!stats) return <EmptyState icon="BarChart" title={t("editor.stats.emptyTitle")} />;

  const segments: DonutSegment[] = stats.findings_by_category.map((c, i) => ({
    label: c.category,
    value: c.count,
    color: CAT_COLORS[i % CAT_COLORS.length]!,
  }));

  return (
    <div style={{ maxWidth: 760, display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", gap: 12 }}>
        <MetricCard label={t("editor.stats.usedBy")} value={stats.used_by} />
        <MetricCard label={t("editor.stats.findings30d")} value={stats.findings_30d} />
        <MetricCard label={t("editor.stats.acceptRate")} value={Math.round(stats.accept_rate * 100)} suffix="%" />
      </div>

      <section>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.03em", marginBottom: 10 }}>
          {t("editor.stats.agentsUsing")}
        </h3>
        {stats.agents.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>{t("editor.stats.noAgents")}</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {stats.agents.map((a) => (
              <Link
                key={a.id}
                href={`/agents/${a.id}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 12px",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  background: "var(--bg-elevated)",
                  color: "var(--text-primary)",
                  textDecoration: "none",
                  fontSize: 14,
                }}
              >
                <Icon.Cpu size={14} style={{ color: "var(--accent)" }} />
                {a.name}
                <Icon.ArrowRight size={13} style={{ marginLeft: "auto", color: "var(--text-muted)" }} />
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.03em", marginBottom: 12 }}>
          {t("editor.stats.findingsByCategory")}
        </h3>
        {segments.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>{t("editor.stats.noFindings")}</p>
        ) : (
          <Donut segments={segments} valuePrefix="" />
        )}
      </section>
    </div>
  );
}
