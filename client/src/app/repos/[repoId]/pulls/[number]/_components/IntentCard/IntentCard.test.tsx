import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrIntentRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/brief.json";
import { ApiError } from "../../../../../../../lib/api";

// Hoisted spies so the flow tests can assert the derive mutation fired.
const mocks = vi.hoisted(() => ({
  derive: vi.fn(),
  query: vi.fn(),
}));

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  usePrIntent: () => mocks.query(),
  useDeriveIntent: () => ({ mutate: mocks.derive, isPending: false }),
}));

import { IntentCard } from "./IntentCard";

afterEach(cleanup);
beforeEach(() => {
  mocks.derive.mockClear();
});

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

function renderCard() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ brief: messages }}>
      <IntentCard prId="pr-1" />
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
});
