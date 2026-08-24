/* OwnerEvalsPanel — the Evals tab body shared by the Agent + Skill editors.
   EVAL METRICS cards (recall/precision/citation/traces-passed) + the mechanical-
   scoring note, then the case list: each row shows its MUST FIND / MUST NOT FLAG
   badge, expected/got + recall from its latest run, a severity·category chip, and
   Run / Edit / delete. Skill rows also show the with/without-skill delta (AC-10).
   "View full dashboard →" links to /eval/:ownerId. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, Badge, Card, EmptyState, SectionLabel } from "@devdigest/ui";
import type {
  EvalCase,
  EvalOwnerKind,
  EvalRunRecord,
  EvalWithoutSkill,
  ExpectedFinding,
} from "@devdigest/shared";
import { EvalWithoutSkill as EvalWithoutSkillSchema } from "@devdigest/shared";
import {
  useEvalCases,
  useEvalRuns,
  useEvalDashboard,
  useRunEval,
  useRunEvalCase,
  useCreateEvalCase,
  useUpdateEvalCase,
  useDeleteEvalCase,
  type EvalOwner,
} from "../../lib/hooks/evals";
import { EvalCaseEditor, emptyDraft, type EvalCaseDraft } from "../EvalCaseEditor";

function toDraft(c: EvalCase): EvalCaseDraft {
  return {
    id: c.id,
    owner_kind: c.owner_kind,
    owner_id: c.owner_id,
    name: c.name,
    input_diff: c.input_diff,
    input_files: c.input_files ?? null,
    input_meta: c.input_meta ?? null,
    expectation_kind: c.expectation_kind ?? null,
    expected_output: Array.isArray(c.expected_output) ? (c.expected_output as ExpectedFinding[]) : [],
    notes: c.notes ?? null,
  };
}

export function OwnerEvalsPanel({
  ownerKind,
  ownerId,
}: {
  ownerKind: EvalOwnerKind;
  ownerId: string;
}) {
  const t = useTranslations("eval");
  const owner: EvalOwner = { kind: ownerKind, id: ownerId };
  const cases = useEvalCases(owner);
  const runs = useEvalRuns(owner);
  const dash = useEvalDashboard(ownerId);
  const runEval = useRunEval(owner);
  const runCase = useRunEvalCase(owner);
  const createCase = useCreateEvalCase(owner);
  const updateCase = useUpdateEvalCase(owner);
  const deleteCase = useDeleteEvalCase(owner);
  const [editing, setEditing] = React.useState<EvalCaseDraft | null>(null);
  const [runningId, setRunningId] = React.useState<string | null>(null);

  const caseList = cases.data ?? [];
  const caseCount = caseList.length;

  // Latest run per case (runs come newest-first; keep the first seen per case).
  const latestByCase = React.useMemo(() => {
    const m = new Map<string, EvalRunRecord>();
    for (const r of runs.data ?? []) if (!m.has(r.case_id)) m.set(r.case_id, r);
    return m;
  }, [runs.data]);

  const passedCount = caseList.filter((c) => latestByCase.get(c.id)?.pass === true).length;
  const cur = dash.data?.current;
  const delta = dash.data?.delta;

  function toInput(draft: EvalCaseDraft) {
    return {
      owner_kind: draft.owner_kind,
      owner_id: draft.owner_id,
      name: draft.name,
      input_diff: draft.input_diff,
      input_files: draft.input_files ?? null,
      input_meta: draft.input_meta ?? null,
      expectation_kind: draft.expectation_kind,
      expected_output: draft.expected_output,
      notes: draft.notes,
    };
  }

  async function persist(draft: EvalCaseDraft): Promise<string> {
    const input = toInput(draft);
    if (draft.id) {
      await updateCase.mutateAsync({ id: draft.id, input });
      return draft.id;
    }
    return (await createCase.mutateAsync(input)).id;
  }

  async function saveDraft(draft: EvalCaseDraft, opts: { run: boolean }) {
    const id = await persist(draft);
    if (opts.run) await runCase.mutateAsync(id);
    setEditing(null);
  }

  async function runDraft(draft: EvalCaseDraft) {
    const id = await persist(draft);
    setEditing({ ...draft, id });
    return runCase.mutateAsync(id);
  }

  async function runRow(id: string) {
    setRunningId(id);
    try {
      await runCase.mutateAsync(id);
    } finally {
      setRunningId(null);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 20 }}>
      {/* EVAL METRICS ------------------------------------------------------ */}
      <div style={{ display: "flex", alignItems: "center" }}>
        <div style={{ flex: 1 }}>
          <SectionLabel>{t("evalsTab.metricsTitle")}</SectionLabel>
        </div>
        <Link href={`/eval/${ownerId}`} style={{ fontSize: 13, color: "var(--accent)" }}>
          {t("evalsTab.viewDashboard")}
        </Link>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <MetricCard label={t("dashboard.metrics.recall")} value={cur?.recall} delta={delta?.recall} />
        <MetricCard label={t("dashboard.metrics.precision")} value={cur?.precision} delta={delta?.precision} />
        <MetricCard
          label={t("dashboard.metrics.citationAccuracy")}
          value={cur?.citation_accuracy}
          delta={delta?.citation_accuracy}
        />
        <Card>
          <div style={{ padding: 14 }}>
            <div style={cardLabel}>{t("evalsTab.tracesPassed")}</div>
            <div style={cardValue}>{cur ? `${cur.traces_passed}/${cur.traces_total}` : "—"}</div>
          </div>
        </Card>
      </div>

      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
        {"<> "}
        {t("evalsTab.scoringNote")}
      </div>

      {/* EVAL CASES -------------------------------------------------------- */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 15, fontWeight: 700 }}>{t("evalsTab.casesHeading")}</span>
        {caseCount > 0 && (
          <Badge color="var(--ok)">
            {t("evalsTab.passingSummary", { passed: passedCount, total: caseCount })}
          </Badge>
        )}
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {t("evalsTab.casesCount", { count: caseCount })}
        </span>
        <div style={{ flex: 1 }} />
        <Button
          kind="secondary"
          size="sm"
          icon="Play"
          disabled={caseCount === 0 || runEval.isPending}
          onClick={() => runEval.mutate()}
        >
          {runEval.isPending ? t("evalsTab.running") : t("evalsTab.runAllEvals")}
        </Button>
        <Button kind="primary" size="sm" icon="Plus" onClick={() => setEditing(emptyDraft(ownerKind, ownerId))}>
          {t("evalsTab.newCaseFull")}
        </Button>
      </div>

      {cases.isLoading ? (
        <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{t("evalsTab.loadingCases")}</div>
      ) : caseCount === 0 ? (
        <EmptyState icon="FlaskConical" title={t("evalsTab.casesHeading")} body={t("evalsTab.emptyCases")} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {caseList.map((c) => (
            <CaseRow
              key={c.id}
              c={c}
              ownerKind={ownerKind}
              run={latestByCase.get(c.id) ?? null}
              busy={runningId === c.id}
              onRun={() => runRow(c.id)}
              onEdit={() => setEditing(toDraft(c))}
              onDelete={() => deleteCase.mutate(c.id)}
              t={t}
            />
          ))}
        </div>
      )}

      {editing && (
        <EvalCaseEditor
          draft={editing}
          saving={createCase.isPending || updateCase.isPending}
          lastRun={editing.id ? runs.data?.find((r) => r.case_id === editing.id) ?? null : null}
          onClose={() => setEditing(null)}
          onSave={saveDraft}
          onRunCase={runDraft}
        />
      )}
    </div>
  );
}

/** One case row: status, name + kind badge, expected/got·recall, sev·cat, actions. */
function CaseRow({
  c,
  ownerKind,
  run,
  busy,
  onRun,
  onEdit,
  onDelete,
  t,
}: {
  c: EvalCase;
  ownerKind: EvalOwnerKind;
  run: EvalRunRecord | null;
  busy: boolean;
  onRun: () => void;
  onEdit: () => void;
  onDelete: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const isNegative = c.expectation_kind === "must_not_flag";
  const expected = isNegative ? 0 : Array.isArray(c.expected_output) ? c.expected_output.length : 0;
  const got = run ? findingsCount(run.actual_output) : null;
  const hint = (Array.isArray(c.expected_output) ? c.expected_output[0] : undefined) as
    | ExpectedFinding
    | undefined;
  const status = run == null ? "none" : run.pass ? "pass" : "fail";
  const without = ownerKind === "skill" && run ? readWithoutSkill(run.actual_output) : null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 12px",
        border: "1px solid var(--border)",
        borderRadius: 8,
      }}
    >
      <span aria-label={`status-${status}`} style={{ fontSize: 14, color: statusColor(status) }}>
        {status === "pass" ? "✓" : status === "fail" ? "✗" : "○"}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {c.name}
          </span>
          <Badge color={isNegative ? "var(--ok)" : "var(--accent)"}>
            {isNegative ? t("evalsTab.mustNotFlag") : t("evalsTab.mustFind")}
          </Badge>
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
          {t("evalsTab.expectedGot", { expected, got: got == null ? "—" : got })}
          {run?.recall != null && t("evalsTab.recallSuffix", { recall: Math.round(run.recall * 100) })}
        </div>
        {without && run?.recall != null && (
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
            {t("evalsTab.withSkill", { value: Math.round(run.recall * 100) })}
            {" · "}
            {t("evalsTab.withoutSkill", { value: Math.round((without.recall ?? 0) * 100) })}
          </div>
        )}
      </div>
      {(hint?.severity || hint?.category) && (
        <span style={{ fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
          {[hint?.severity, hint?.category].filter(Boolean).join(" · ")}
        </span>
      )}
      <Button kind="ghost" size="sm" icon="Play" disabled={busy} onClick={onRun}>
        {busy ? t("evalsTab.running") : t("evalsTab.run")}
      </Button>
      <Button kind="ghost" size="sm" icon="Edit" onClick={onEdit}>
        {t("evalsTab.edit")}
      </Button>
      <Button kind="ghost" size="sm" icon="Trash" aria-label={t("evalsTab.delete")} onClick={onDelete} />
    </div>
  );
}

/** got M — number of actual findings the run produced (0 for an errored run). */
function findingsCount(actualOutput: unknown): number {
  if (!actualOutput || typeof actualOutput !== "object") return 0;
  const f = (actualOutput as Record<string, unknown>).findings;
  return Array.isArray(f) ? f.length : 0;
}

function statusColor(s: "pass" | "fail" | "none"): string {
  return s === "pass" ? "var(--ok)" : s === "fail" ? "var(--crit)" : "var(--text-muted)";
}

function MetricCard({ label, value, delta }: { label: string; value?: number | null; delta?: number | null }) {
  return (
    <Card>
      <div style={{ padding: 14 }}>
        <div style={cardLabel}>{label}</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={cardValue}>{value == null ? "—" : `${Math.round(value * 100)}%`}</span>
          {delta != null && delta !== 0 && (
            <span style={{ fontSize: 12, color: delta > 0 ? "var(--ok)" : "var(--crit)" }}>
              {delta > 0 ? "↑" : "↓"} {Math.abs(delta).toFixed(2)}
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}

const cardLabel: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: 0.5,
  textTransform: "uppercase",
  color: "var(--text-muted)",
  marginBottom: 6,
};
const cardValue: React.CSSProperties = { fontSize: 24, fontWeight: 700, color: "var(--accent)" };

/** Extract the without-skill baseline stashed on a skill run's actual_output. */
function readWithoutSkill(actualOutput: unknown): EvalWithoutSkill | null {
  if (!actualOutput || typeof actualOutput !== "object") return null;
  const parsed = EvalWithoutSkillSchema.safeParse((actualOutput as Record<string, unknown>).without_skill);
  return parsed.success ? parsed.data : null;
}
