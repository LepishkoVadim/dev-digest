import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrBriefRecord } from "@devdigest/shared";
import briefMessages from "../../../../../../../../messages/en/brief.json";
import prReviewMessages from "../../../../../../../../messages/en/prReview.json";
import { ApiError } from "../../../../../../../lib/api";

const mocks = vi.hoisted(() => ({
  derive: vi.fn(),
  brief: vi.fn(),
  reviews: vi.fn(),
  derivePending: false,
  deriveError: null as Error | null,
}));

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useBrief: () => mocks.brief(),
  useDeriveBrief: () => ({
    mutate: mocks.derive,
    isPending: mocks.derivePending,
    isError: mocks.deriveError != null,
    error: mocks.deriveError,
  }),
  usePrReviews: () => mocks.reviews(),
}));

import { PrBriefCard } from "./PrBriefCard";

afterEach(cleanup);
beforeEach(() => {
  mocks.derive.mockClear();
  mocks.derivePending = false;
  mocks.deriveError = null;
  mocks.reviews.mockReturnValue({ data: [] });
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

// A minimal persisted review — only the fields the top card reads.
const REVIEW = {
  kind: "review",
  verdict: "request_changes",
  score: 61,
  findings: [{ severity: "CRITICAL" }, { severity: "WARNING" }],
};

function renderCard(props: { headSha?: string | null } = {}) {
  return render(
    <NextIntlClientProvider
      locale="en"
      messages={{ brief: briefMessages, prReview: prReviewMessages }}
    >
      <PrBriefCard prId="pr-1" headSha={props.headSha === undefined ? "sha-abc" : props.headSha} />
    </NextIntlClientProvider>,
  );
}

describe("PrBriefCard", () => {
  it("empty state on 404 fires the generate mutation", () => {
    mocks.brief.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new ApiError("not found", 404),
      refetch: vi.fn(),
    });
    renderCard();

    expect(screen.getByText(/no brief yet/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /generate brief/i }));
    expect(mocks.derive).toHaveBeenCalledTimes(1);
  });

  it("shows a loading skeleton and no generate control while a derive is in flight", () => {
    mocks.derivePending = true;
    mocks.brief.mockReturnValue({ data: undefined, isLoading: false, error: null, refetch: vi.fn() });
    renderCard();
    // No interactive generate/regenerate control while pending (AC-11).
    expect(screen.queryByRole("button", { name: /generate brief|regenerate brief/i })).toBeNull();
  });

  it("renders the provider error message verbatim and re-enables retry (AC-8/AC-12)", () => {
    mocks.deriveError = new Error("provider exploded: 429 rate limited");
    mocks.brief.mockReturnValue({ data: undefined, isLoading: false, error: null, refetch: vi.fn() });
    renderCard();

    expect(screen.getByText(/provider exploded: 429 rate limited/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(mocks.derive).toHaveBeenCalled();
  });

  it("renders the what/why summary alongside the review verdict, score and finding/blocker counts (AC-16)", () => {
    mocks.brief.mockReturnValue({ data: BRIEF, isLoading: false, error: null, refetch: vi.fn() });
    mocks.reviews.mockReturnValue({ data: [REVIEW] });
    renderCard();

    // Brief's what/why is the summary paragraph.
    expect(screen.getByText(/adds a hardcoded stripe key/i)).toBeInTheDocument();
    // Verdict + counts come from the review, rendered independently of the Brief.
    expect(screen.getByText(/request changes/i)).toBeInTheDocument();
    expect(screen.getByText(/2 findings · 1 blockers/)).toBeInTheDocument();
    expect(screen.getByText("61")).toBeInTheDocument();
  });

  it("renders an empty verdict (no score, no verdict label) when no review has run (AC-15)", () => {
    mocks.brief.mockReturnValue({ data: BRIEF, isLoading: false, error: null, refetch: vi.fn() });
    mocks.reviews.mockReturnValue({ data: [] });
    renderCard();

    expect(screen.getByText(/adds a hardcoded stripe key/i)).toBeInTheDocument();
    expect(screen.getByText(/no review has run yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/request changes/i)).toBeNull();
  });

  it("shows the cost line from the Brief's own StructuredResult (NFR-5)", () => {
    mocks.brief.mockReturnValue({ data: BRIEF, isLoading: false, error: null, refetch: vi.fn() });
    renderCard();

    expect(screen.getByText("openrouter/openai/gpt-4.1")).toBeInTheDocument();
    expect(screen.getByText("$0.0010")).toBeInTheDocument();
  });

  it("shows the staleness banner when head SHA differs from state_key, keeping the brief visible", () => {
    mocks.brief.mockReturnValue({ data: BRIEF, isLoading: false, error: null, refetch: vi.fn() });
    renderCard({ headSha: "sha-DIFFERENT" });

    expect(screen.getByText(/pr changed since this brief/i)).toBeInTheDocument();
    // Stale brief is still rendered.
    expect(screen.getByText(/adds a hardcoded stripe key/i)).toBeInTheDocument();
  });
});
