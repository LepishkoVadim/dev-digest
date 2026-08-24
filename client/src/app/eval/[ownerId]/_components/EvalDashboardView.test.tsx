import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalDashboard, EvalRunRecord } from "@devdigest/shared";
import messages from "../../../../../messages/en/eval.json";
import { EvalDashboardView } from "./EvalDashboardView";

afterEach(cleanup);

function renderView(dashboard: EvalDashboard) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      <EvalDashboardView dashboard={dashboard} />
    </NextIntlClientProvider>,
  );
}

function record(id: string, version: number): EvalRunRecord {
  return {
    id,
    case_id: "c1",
    case_name: "case",
    ran_at: "2026-08-24T00:00:00Z",
    actual_output: null,
    pass: true,
    recall: 1,
    precision: 1,
    citation_accuracy: 1,
    duration_ms: 10,
    cost_usd: 0.01,
    version,
  };
}

const EMPTY: EvalDashboard = {
  owner_kind: "agent",
  owner_id: "ag1",
  cases_total: 0,
  current: { recall: 0, precision: 0, citation_accuracy: 0, traces_passed: 0, traces_total: 0, cost_usd: null },
  delta: { recall: 0, precision: 0, citation_accuracy: 0 },
  trend: [],
  recent_runs: [],
  alert: null,
};

describe("EvalDashboardView (AC-15/22/23)", () => {
  it("shows the empty state and no metric trend when history is empty", () => {
    renderView(EMPTY);
    expect(screen.getByText(/no runs yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/metric trend/i)).not.toBeInTheDocument();
  });

  it("renders run rows with the Version column and gates Compare on a 2-run selection", () => {
    const dashboard: EvalDashboard = {
      ...EMPTY,
      cases_total: 2,
      current: { recall: 1, precision: 1, citation_accuracy: 1, traces_passed: 1, traces_total: 1, cost_usd: 0.01 },
      trend: [
        { ran_at: "2026-08-24T00:00:00Z", recall: 1, precision: 1, citation_accuracy: 1, pass_rate: 1, cost_usd: 0.01 },
        { ran_at: "2026-08-24T01:00:00Z", recall: 1, precision: 1, citation_accuracy: 1, pass_rate: 1, cost_usd: 0.01 },
      ],
      recent_runs: [record("r2", 19), record("r1", 18)],
    };
    renderView(dashboard);

    expect(screen.getByText("v19")).toBeInTheDocument();
    expect(screen.getByText("v18")).toBeInTheDocument();

    const compare = screen.getByRole("button", { name: /compare selected/i });
    expect(compare).toBeDisabled();

    const checks = screen.getAllByRole("checkbox");
    fireEvent.click(checks[0]!);
    expect(compare).toBeDisabled(); // 1 selected
    fireEvent.click(checks[1]!);
    expect(compare).toBeEnabled(); // 2 selected
  });
});
