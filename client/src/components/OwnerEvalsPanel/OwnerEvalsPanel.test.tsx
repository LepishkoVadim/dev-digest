import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import evalMessages from "../../../messages/en/eval.json";
import { ToastProvider } from "../../lib/toast";

const CASE = {
  id: "c1",
  owner_kind: "skill",
  owner_id: "sk1",
  name: "breaking-change-gate",
  input_diff: "diff",
  input_files: null,
  input_meta: null,
  expectation_kind: "must_find",
  expected_output: [
    { file: "a.ts", start_line: 1, end_line: 2, severity: "CRITICAL", category: "security", title: "x" },
  ],
  notes: null,
};
const RUN = {
  id: "r1",
  case_id: "c1",
  ran_at: "2026-08-24T00:00:00Z",
  actual_output: { findings: [{ file: "a.ts" }], without_skill: { recall: 0, precision: 1, citation_accuracy: 1, cost_usd: 0 } },
  pass: true,
  recall: 1,
  precision: 1,
  citation_accuracy: 1,
  duration_ms: 10,
  cost_usd: 0,
  version: 3,
};
const DASH = {
  current: { recall: 1, precision: 1, citation_accuracy: 0.8, traces_passed: 1, traces_total: 1, cost_usd: 0 },
  delta: { recall: 0.04, precision: -0.02, citation_accuracy: 0.01 },
};

// Mock the eval data hooks so the panel renders without a query client/network.
vi.mock("../../lib/hooks/evals", () => ({
  useEvalCases: () => ({ data: [CASE], isLoading: false }),
  useEvalRuns: () => ({ data: [RUN] }),
  useEvalDashboard: () => ({ data: DASH }),
  useRunEval: () => ({ mutate: vi.fn(), isPending: false }),
  useRunEvalCase: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateEvalCase: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateEvalCase: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteEvalCase: () => ({ mutate: vi.fn() }),
}));

import { OwnerEvalsPanel } from "./OwnerEvalsPanel";

afterEach(cleanup);

function renderPanel(ownerKind: "agent" | "skill") {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: evalMessages }}>
      <ToastProvider>
        <OwnerEvalsPanel ownerKind={ownerKind} ownerId="sk1" />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("OwnerEvalsPanel (smoke)", () => {
  it("renders metrics + a populated case row (skill: with/without) without crashing", () => {
    renderPanel("skill");
    expect(screen.getByText("Eval metrics")).toBeInTheDocument();
    expect(screen.getByText("TRACES PASSED")).toBeInTheDocument();
    expect(screen.getByText("breaking-change-gate")).toBeInTheDocument();
    expect(screen.getByText("MUST FIND")).toBeInTheDocument();
  });

  it("renders for an agent owner (no with/without)", () => {
    renderPanel("agent");
    expect(screen.getByText("breaking-change-gate")).toBeInTheDocument();
  });
});
