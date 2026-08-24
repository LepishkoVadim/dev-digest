import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalRunRecord, FindingRecord } from "@devdigest/shared";
import messages from "../../../messages/en/eval.json";
import { EvalCaseEditor } from "./EvalCaseEditor";
import { emptyDraft, seedFromFinding } from "./seed";

afterEach(cleanup);

function renderEditor(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const baseFinding: FindingRecord = {
  id: "f1",
  severity: "CRITICAL",
  category: "security",
  title: "Hardcoded secret",
  file: "src/config.ts",
  start_line: 11,
  end_line: 11,
  rationale: "leak",
  confidence: 0.9,
  kind: "finding",
  review_id: "r1",
  accepted_at: null,
  dismissed_at: null,
};

describe("seedFromFinding (AC-4/5/6)", () => {
  it("seeds accepted → must_find, dismissed → must_not_flag, neither → unset", () => {
    expect(seedFromFinding({ ...baseFinding, accepted_at: "t" }, "ag1").expectation_kind).toBe(
      "must_find",
    );
    expect(seedFromFinding({ ...baseFinding, dismissed_at: "t" }, "ag1").expectation_kind).toBe(
      "must_not_flag",
    );
    expect(seedFromFinding(baseFinding, "ag1").expectation_kind).toBeNull();
  });
});

describe("EvalCaseEditor (AC-2/7/16)", () => {
  it("renders the two-column sections and blocks save until kind + valid JSON", () => {
    const onSave = vi.fn();
    renderEditor(
      <EvalCaseEditor draft={emptyDraft("agent", "ag1")} onClose={() => {}} onSave={onSave} />,
    );

    // Both columns present: name, input tabs, expected + actual output.
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /diff/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /files/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /pr meta/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/expected output/i)).toBeInTheDocument();
    // Actual output starts as "Never run yet".
    expect(screen.getByText(/never run yet/i)).toBeInTheDocument();

    // Unset → Save disabled (AC-2).
    const saveBtn = screen.getByRole("button", { name: /^save$/i });
    expect(saveBtn).toBeDisabled();

    // Flip picks must_find, badge shows POSITIVE (AC-7).
    fireEvent.click(screen.getByRole("button", { name: /flip expectation kind/i }));
    expect(screen.getByText(/POSITIVE CASE/i)).toBeInTheDocument();
    expect(saveBtn).toBeEnabled();

    fireEvent.click(saveBtn);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]![0].expectation_kind).toBe("must_find");
    expect(onSave.mock.calls[0]![1]).toEqual({ run: false });
  });

  it("blocks POST when expected_output JSON is malformed (AC-16)", () => {
    const onSave = vi.fn();
    const draft = { ...emptyDraft("agent", "ag1"), expectation_kind: "must_find" as const };
    renderEditor(<EvalCaseEditor draft={draft} onClose={() => {}} onSave={onSave} />);

    const expected = screen.getByLabelText(/expected output/i);
    fireEvent.change(expected, { target: { value: "{not valid json" } });

    expect(screen.getByText(/invalid json/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("runs the case and renders the actual output + result summary", async () => {
    const record: EvalRunRecord = {
      id: "run1",
      case_id: "c1",
      case_name: "case",
      ran_at: "2026-08-24T00:00:00Z",
      actual_output: { findings: [{ file: "src/config.ts", start_line: 11, end_line: 11 }] },
      pass: true,
      recall: 1,
      precision: 1,
      citation_accuracy: 1,
      duration_ms: 1800,
      cost_usd: 0.02,
      version: 3,
    };
    const onRunCase = vi.fn().mockResolvedValue(record);
    const draft = { ...emptyDraft("agent", "ag1"), expectation_kind: "must_find" as const };
    renderEditor(
      <EvalCaseEditor
        draft={draft}
        onClose={() => {}}
        onSave={() => {}}
        onRunCase={onRunCase}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /run case/i }));
    expect(onRunCase).toHaveBeenCalledTimes(1);

    // Result summary + the actual output JSON render after the run resolves.
    expect(await screen.findByText(/last run passed/i)).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getAllByText(/src\/config\.ts/i).length).toBeGreaterThan(0),
    );
  });
});
