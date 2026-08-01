import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

// Stable spy (hoisted) so the keyboard test can inspect action.mutate calls.
const mocks = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useFindingAction: () => ({ mutate: mocks.mutate, isPending: false }),
}));

import { FindingsPanel } from "./FindingsPanel";

afterEach(cleanup);

const FINDINGS: FindingRecord[] = [
  {
    id: "f1",
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded secret",
    file: "src/config.ts",
    start_line: 11,
    end_line: 11,
    rationale: "A secret is committed.",
    suggestion: null,
    confidence: 0.95,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
  },
];

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("FindingsPanel (smoke)", () => {
  it("renders the toolbar + a finding card", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    expect(screen.getByText("Hide low confidence")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
  });

  it("shows the empty state when nothing matches", () => {
    renderWithIntl(<FindingsPanel findings={[]} prId="pr1" />);
    expect(screen.getByText("No findings match")).toBeInTheDocument();
  });

  it("severityFilter shows only findings of that severity", () => {
    const warning: FindingRecord = {
      ...FINDINGS[0]!,
      id: "f2",
      severity: "WARNING",
      title: "Missing null check",
    };
    renderWithIntl(
      <FindingsPanel findings={[FINDINGS[0]!, warning]} prId="pr1" severityFilter="CRITICAL" />,
    );
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.queryByText("Missing null check")).not.toBeInTheDocument();
  });
});

describe("FindingsPanel (keyboard j/k)", () => {
  const warning: FindingRecord = {
    ...FINDINGS[0]!,
    id: "f2",
    severity: "WARNING",
    title: "Missing null check",
  };
  const press = (key: string) =>
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key })));

  it("j moves focus down; the action key fires on the focused finding", () => {
    mocks.mutate.mockClear();
    // Sorted by severity → [CRITICAL f1, WARNING f2]; focus starts on index 0.
    renderWithIntl(<FindingsPanel findings={[FINDINGS[0]!, warning]} prId="pr1" />);

    press("a"); // accept the focused (first) finding
    expect(mocks.mutate).toHaveBeenLastCalledWith({ findingId: "f1", action: "accept", prId: "pr1" });

    press("j"); // focus → second finding
    press("d"); // dismiss it
    expect(mocks.mutate).toHaveBeenLastCalledWith({ findingId: "f2", action: "dismiss", prId: "pr1" });
  });

  it("k clamps at the top (does not move above index 0)", () => {
    mocks.mutate.mockClear();
    renderWithIntl(<FindingsPanel findings={[FINDINGS[0]!, warning]} prId="pr1" />);
    press("k"); // already at top
    press("a");
    expect(mocks.mutate).toHaveBeenLastCalledWith({ findingId: "f1", action: "accept", prId: "pr1" });
  });
});
