/* EvalCaseEditor — two-column modal to author/edit one eval case (AC-2/3/7/8/16)
   plus run it (single-case run → Actual output). LEFT: badge+flip, Name, Input
   (Diff | Files | PR meta tabs). RIGHT: Expected output (client-side
   ExpectedFinding[] validation before POST) + Actual output (last run's result).
   FOOTER: Run-on-save toggle, Cancel / Run case / Save. Save stays blocked until
   an expectation_kind is picked and the expected_output JSON is valid. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Modal, Button, Badge } from "@devdigest/ui";
import {
  ExpectedFindings,
  type EvalRunRecord,
  type ExpectationKind,
} from "@devdigest/shared";
import type { EvalCaseDraft } from "./seed";

const FINDING_SKELETON = JSON.stringify(
  [{ file: "src/config.ts", start_line: 11, end_line: 11 }],
  null,
  2,
);

type InputTab = "diff" | "files" | "prMeta";

export interface EvalCaseEditorProps {
  draft: EvalCaseDraft;
  saving?: boolean;
  /** Last run's actual_output for this case (null → "Never run yet"). */
  lastRun?: EvalRunRecord | null;
  onClose: () => void;
  /** Persist. When `run` is true, the caller also runs the case after saving. */
  onSave: (draft: EvalCaseDraft, opts: { run: boolean }) => void;
  /** Persist (create/update) then run the case; resolves to the run record. */
  onRunCase?: (draft: EvalCaseDraft) => Promise<EvalRunRecord | null | undefined>;
}

function jsonOrNull(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

export function EvalCaseEditor({
  draft,
  saving,
  lastRun,
  onClose,
  onSave,
  onRunCase,
}: EvalCaseEditorProps) {
  const t = useTranslations("eval");
  const [name, setName] = React.useState(draft.name);
  const [diff, setDiff] = React.useState(draft.input_diff);
  const [filesText, setFilesText] = React.useState(
    draft.input_files == null ? "" : JSON.stringify(draft.input_files, null, 2),
  );
  const [metaText, setMetaText] = React.useState(
    draft.input_meta == null ? "" : JSON.stringify(draft.input_meta, null, 2),
  );
  const [tab, setTab] = React.useState<InputTab>("diff");
  const [kind, setKind] = React.useState<ExpectationKind | null>(draft.expectation_kind);
  const [expectedText, setExpectedText] = React.useState(
    JSON.stringify(draft.expected_output ?? [], null, 2),
  );
  const [runOnSave, setRunOnSave] = React.useState(false);
  const [running, setRunning] = React.useState(false);
  const [runResult, setRunResult] = React.useState<EvalRunRecord | null>(lastRun ?? null);

  // Validate the expected_output JSON against the ExpectedFinding[] schema on
  // every keystroke — the same gate the server applies (AC-16), surfaced early.
  const validation = React.useMemo(() => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(expectedText || "[]");
    } catch {
      return { valid: false as const, value: [] };
    }
    const res = ExpectedFindings.safeParse(parsed);
    return res.success
      ? { valid: true as const, value: res.data }
      : { valid: false as const, value: [] };
  }, [expectedText]);

  const canSave = kind != null && validation.valid && !saving && !running;

  function buildDraft(): EvalCaseDraft | null {
    if (kind == null) return null;
    return {
      ...draft,
      name: name.trim() || t("caseEditor.newCase"),
      input_diff: diff,
      input_files: jsonOrNull(filesText),
      input_meta: jsonOrNull(metaText),
      expectation_kind: kind,
      expected_output: validation.value,
    };
  }

  function save() {
    if (!canSave) return;
    const next = buildDraft();
    if (next) onSave(next, { run: runOnSave });
  }

  async function runCase() {
    const next = buildDraft();
    if (!next || !onRunCase || running) return;
    setRunning(true);
    try {
      const record = await onRunCase(next);
      if (record) setRunResult(record);
    } finally {
      setRunning(false);
    }
  }

  function flip() {
    setKind((k) => (k === "must_find" ? "must_not_flag" : "must_find"));
  }

  const badge =
    kind === "must_find" ? (
      <Badge color="var(--accent)">POSITIVE CASE · MUST find</Badge>
    ) : kind === "must_not_flag" ? (
      <Badge color="var(--warn)">NEGATIVE CASE · MUST NOT flag</Badge>
    ) : (
      <Badge color="var(--text-muted)">Pick an expectation</Badge>
    );

  const subtitle = draft.seeded_from_finding
    ? t("caseEditor.seededSubtitle")
    : t("caseEditor.subtitle");

  return (
    <Modal
      width={920}
      title={draft.id ? t("caseEditor.caseTitle", { name: draft.name }) : t("caseEditor.newCase")}
      subtitle={subtitle}
      onClose={onClose}
      footer={
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <input
              type="checkbox"
              aria-label={t("caseEditor.runOnSave")}
              checked={runOnSave}
              onChange={(e) => setRunOnSave(e.target.checked)}
            />
            {t("caseEditor.runOnSave")}
          </label>
          <div style={{ flex: 1 }} />
          <Button kind="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          {onRunCase && (
            <Button
              kind="secondary"
              size="sm"
              disabled={kind == null || !validation.valid || running || saving}
              onClick={runCase}
            >
              {running ? t("caseEditor.running") : t("caseEditor.runCase")}
            </Button>
          )}
          <Button kind="primary" size="sm" disabled={!canSave} onClick={save}>
            {saving ? t("caseEditor.saving") : t("caseEditor.save")}
          </Button>
        </div>
      }
    >
      <div style={twoCol}>
        {/* LEFT column: badge + name + input tabs */}
        <div style={col}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {badge}
            <Button kind="secondary" size="sm" onClick={flip} aria-label="Flip expectation kind">
              Flip
            </Button>
          </div>

          <label style={field}>
            <span style={fieldLabel}>
              {t("caseEditor.nameLabel")} <span style={{ color: "var(--crit)" }}>*</span>
            </span>
            <input
              aria-label={t("caseEditor.nameLabel")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("caseEditor.namePlaceholder")}
              style={inputStyle}
            />
          </label>

          <div style={field}>
            <span style={fieldLabel}>{t("caseEditor.inputLabel")}</span>
            <div role="tablist" style={{ display: "flex", gap: 4 }}>
              <TabButton active={tab === "diff"} onClick={() => setTab("diff")}>
                {t("caseEditor.tabs.diff")}
              </TabButton>
              <TabButton active={tab === "files"} onClick={() => setTab("files")}>
                {t("caseEditor.tabs.files")}
              </TabButton>
              <TabButton active={tab === "prMeta"} onClick={() => setTab("prMeta")}>
                {t("caseEditor.tabs.prMeta")}
              </TabButton>
            </div>
            {tab === "diff" && (
              <textarea
                aria-label={t("caseEditor.tabs.diff")}
                value={diff}
                onChange={(e) => setDiff(e.target.value)}
                placeholder={t("caseEditor.diffPlaceholder")}
                rows={12}
                style={mono}
              />
            )}
            {tab === "files" && (
              <textarea
                aria-label={t("caseEditor.tabs.files")}
                value={filesText}
                onChange={(e) => setFilesText(e.target.value)}
                placeholder="[]"
                rows={12}
                style={mono}
              />
            )}
            {tab === "prMeta" && (
              <textarea
                aria-label={t("caseEditor.tabs.prMeta")}
                value={metaText}
                onChange={(e) => setMetaText(e.target.value)}
                placeholder="{}"
                rows={12}
                style={mono}
              />
            )}
          </div>
        </div>

        {/* RIGHT column: expected output (top) + actual output (below) */}
        <div style={col}>
          <div style={field}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={fieldLabel}>{t("caseEditor.expectedOutput")}</span>
              <span
                role="status"
                style={{ fontSize: 12, color: validation.valid ? "var(--ok)" : "var(--crit)" }}
              >
                {validation.valid ? t("caseEditor.validJson") : t("caseEditor.invalidJson")}
              </span>
              <Button
                kind="ghost"
                size="sm"
                onClick={() => setExpectedText(FINDING_SKELETON)}
                aria-label="Insert finding skeleton"
              >
                + Finding skeleton
              </Button>
            </div>
            <textarea
              aria-label={t("caseEditor.expectedOutput")}
              value={expectedText}
              onChange={(e) => setExpectedText(e.target.value)}
              rows={8}
              style={mono}
            />
          </div>

          <div style={field}>
            <span style={fieldLabel}>{t("caseEditor.actualOutput")}</span>
            {runResult ? (
              <>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  {runResult.pass
                    ? t("caseEditor.lastRunPassed")
                    : t("caseEditor.lastRunFailed")}{" "}
                  ·{" "}
                  {t("caseEditor.resultSummary", {
                    recall: pct(runResult.recall),
                    precision: pct(runResult.precision),
                    citation: pct(runResult.citation_accuracy),
                    duration: secs(runResult.duration_ms),
                  })}
                </div>
                <pre aria-label={t("caseEditor.actualOutput")} style={{ ...mono, margin: 0, whiteSpace: "pre-wrap" }}>
                  {JSON.stringify(runResult.actual_output ?? null, null, 2)}
                </pre>
              </>
            ) : (
              <div style={{ fontSize: 13, color: "var(--text-muted)", padding: "8px 0" }}>
                {t("caseEditor.neverRun")}
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={{
        border: "none",
        background: "transparent",
        borderBottom: `2px solid ${active ? "var(--accent)" : "transparent"}`,
        color: active ? "var(--text-primary)" : "var(--text-secondary)",
        fontSize: 13,
        fontWeight: active ? 600 : 400,
        padding: "4px 8px",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function pct(value: number | null): number {
  return value == null ? 0 : Math.round(value * 100);
}

function secs(ms: number | null): string {
  return ms == null ? "0" : (ms / 1000).toFixed(1);
}

const twoCol: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: 20,
  padding: 20,
};

const col: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 16, minWidth: 0 };

const field: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6 };

const fieldLabel: React.CSSProperties = { fontSize: 12, color: "var(--text-secondary)" };

const inputStyle: React.CSSProperties = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 13,
  color: "var(--text-primary)",
};

const mono: React.CSSProperties = {
  ...inputStyle,
  fontFamily: "var(--mono)",
  resize: "vertical",
};
