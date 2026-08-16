import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrIntentRecord, PrBriefRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/brief.json";
import { ApiError } from "../../../../../../../lib/api";

// Hoisted spies so the flow tests can assert the derive mutation fired.
const mocks = vi.hoisted(() => ({
  derive: vi.fn(),
  query: vi.fn(),
  brief: vi.fn(),
}));

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  usePrIntent: () => mocks.query(),
  useDeriveIntent: () => ({ mutate: mocks.derive, isPending: false }),
  useBrief: () => mocks.brief(),
}));

import { IntentCard } from "./IntentCard";

afterEach(cleanup);
beforeEach(() => {
  mocks.derive.mockClear();
  // Default: no Brief → the risk-areas block does not render.
  mocks.brief.mockReturnValue({ data: undefined });
});

const BRIEF: PrBriefRecord = {
  pr_id: "pr-1",
  what: "Adds a hardcoded Stripe key to config.",
  why: "Wiring up billing.",
  risk_level: "high",
  risks: [
    {
      kind: "security",
      title: "Secret in source",
      explanation: "A live key is committed.",
      severity: "high",
      file_refs: ["src/config.ts"],
      endpoint_refs: [],
    },
  ],
  review_focus: [{ file: "src/config.ts", line: 11, reason: "the secret" }],
  state_key: "sha-abc",
  tokens_in: 100,
  tokens_out: 50,
  cost_usd: 0.001,
  model: "openrouter/openai/gpt-4.1",
  derived_at: "2026-08-16T10:00:00.000Z",
};

const INTENT: PrIntentRecord = {
  pr_id: "pr-1",
  intent: "Adds rate limiting to the public API endpoints.",
  in_scope: ["rate limiting", "public API"],
  out_of_scope: ["billing"],
  confidence: "medium",
  sources: [
    { kind: "pr_title", ref: "#482", status: "used" },
    { kind: "pr_body", ref: "#482", status: "used" },
  ],
  model: "openrouter/deepseek/deepseek-v4-flash",
  derived_at: "2026-08-08T10:00:00.000Z",
};

function renderCard(props: { repoFullName?: string | null; headSha?: string | null } = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ brief: messages }}>
      <IntentCard
        prId="pr-1"
        repoFullName={props.repoFullName ?? "acme/app"}
        headSha={props.headSha === undefined ? "sha-abc" : props.headSha}
      />
    </NextIntlClientProvider>,
  );
}

describe("IntentCard", () => {
  it("renders the summary, both scope lists and the derived confidence, and re-derives on demand", () => {
    mocks.query.mockReturnValue({ data: INTENT, isLoading: false, error: null, refetch: vi.fn() });
    renderCard();

    expect(screen.getByText(/adds rate limiting to the public api/i)).toBeInTheDocument();
    expect(screen.getByText("rate limiting")).toBeInTheDocument();
    expect(screen.getByText("public API")).toBeInTheDocument();
    expect(screen.getByText("billing")).toBeInTheDocument();
    // Confidence is shown as reported by the server (computed there, not here).
    expect(screen.getByText(/confidence: medium/i)).toBeInTheDocument();
    expect(screen.getByText(/deepseek-v4-flash/)).toBeInTheDocument();

    // Icon-only re-derive button must be reachable by its accessible name.
    fireEvent.click(screen.getByRole("button", { name: /re-derive intent/i }));
    expect(mocks.derive).toHaveBeenCalledTimes(1);
  });

  it("shows the empty state on a 404 and fires the derive mutation when the user clicks Derive", () => {
    mocks.query.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new ApiError("not found", 404),
      refetch: vi.fn(),
    });
    renderCard();

    expect(screen.getByText(/intent not derived yet/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /derive intent/i }));
    expect(mocks.derive).toHaveBeenCalledTimes(1);
  });

  it("surfaces an unavailable source as a visible missing-context line, never hiding it", () => {
    mocks.query.mockReturnValue({
      data: {
        ...INTENT,
        confidence: "low",
        sources: [
          { kind: "pr_body", ref: "#482", status: "used" },
          { kind: "linked_issue", ref: "#471", status: "unavailable" },
        ],
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    renderCard();

    expect(screen.getByText(/missing context/i)).toBeInTheDocument();
    expect(screen.getByText(/linked_issue \(#471\)/)).toBeInTheDocument();
    expect(screen.getByText(/confidence: low/i)).toBeInTheDocument();
  });

  it("renders the Brief's code-derived risk badge and toggles a risk row exposing aria-expanded, keeping focus (AC-4/AC-17)", () => {
    mocks.query.mockReturnValue({ data: INTENT, isLoading: false, error: null, refetch: vi.fn() });
    mocks.brief.mockReturnValue({ data: BRIEF });
    renderCard();

    expect(screen.getByText(/risk: high/i)).toBeInTheDocument();

    // The accordion header is a real <button> — Enter/Space activation and focus
    // retention come from the platform; here we assert the aria state it exposes.
    const row = screen.getByRole("button", { name: /secret in source/i });
    expect(row).toHaveAttribute("aria-expanded", "false");

    row.focus();
    fireEvent.click(row);
    expect(row).toHaveAttribute("aria-expanded", "true");
    expect(row).toHaveFocus();
    expect(screen.getByText(/a live key is committed/i)).toBeInTheDocument();

    fireEvent.click(row);
    expect(row).toHaveAttribute("aria-expanded", "false");
  });

  it("shows the explicit empty risk-areas row when the Brief has no risks (AC-13)", () => {
    mocks.query.mockReturnValue({ data: INTENT, isLoading: false, error: null, refetch: vi.fn() });
    mocks.brief.mockReturnValue({ data: { ...BRIEF, risk_level: "low", risks: [] } });
    renderCard();

    expect(screen.getByText(/no risk areas identified/i)).toBeInTheDocument();
  });

  it("renders a risk file ref as plain text (no link) when repoFullName/headSha is missing (AC-14)", () => {
    mocks.query.mockReturnValue({ data: INTENT, isLoading: false, error: null, refetch: vi.fn() });
    mocks.brief.mockReturnValue({ data: BRIEF });
    renderCard({ repoFullName: null, headSha: null });

    const row = screen.getByRole("button", { name: /secret in source/i });
    fireEvent.click(row);
    expect(screen.getByText("src/config.ts")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /src\/config\.ts/ })).toBeNull();
  });

  it("does not render the risk-areas block when no Brief exists", () => {
    mocks.query.mockReturnValue({ data: INTENT, isLoading: false, error: null, refetch: vi.fn() });
    mocks.brief.mockReturnValue({ data: undefined });
    renderCard();

    expect(screen.queryByText(/risk areas/i)).toBeNull();
  });
});
