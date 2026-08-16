import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrBriefRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/brief.json";

const mocks = vi.hoisted(() => ({ brief: vi.fn() }));

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useBrief: () => mocks.brief(),
}));

import { ReviewFocusCard } from "./ReviewFocusCard";

afterEach(cleanup);
beforeEach(() => mocks.brief.mockReset());

const BRIEF: PrBriefRecord = {
  pr_id: "pr-1",
  what: "w",
  why: "y",
  risk_level: "high",
  risks: [],
  review_focus: [
    { file: "src/config.ts", line: 12, reason: "live Stripe key committed" },
    { file: "src/api/users.ts", line: 46, reason: "N+1 query" },
  ],
  state_key: "sha-abc",
  tokens_in: 1,
  tokens_out: 1,
  cost_usd: 0.001,
  model: "openrouter/openai/gpt-4.1",
  derived_at: "2026-08-16T10:00:00.000Z",
};

function renderCard(repoFullName: string | null = "acme/app", headSha: string | null = "sha-abc") {
  return render(
    <NextIntlClientProvider locale="en" messages={{ brief: messages }}>
      <ReviewFocusCard prId="pr-1" repoFullName={repoFullName} headSha={headSha} />
    </NextIntlClientProvider>,
  );
}

describe("ReviewFocusCard", () => {
  it("renders nothing until a Brief exists", () => {
    mocks.brief.mockReturnValue({ data: undefined });
    const { container } = renderCard();
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the focus list as blue blob links with reasons and a count (AC-14)", () => {
    mocks.brief.mockReturnValue({ data: BRIEF });
    renderCard();

    expect(screen.getByText(/read these first/i)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "src/config.ts:12" });
    expect(link).toHaveAttribute("href", expect.stringContaining("src/config.ts#L12"));
    expect(screen.getByText(/live Stripe key committed/)).toBeInTheDocument();
    expect(screen.getByText(/N\+1 query/)).toBeInTheDocument();
  });

  it("falls back to plain text (no link) when repo metadata is missing (AC-14)", () => {
    mocks.brief.mockReturnValue({ data: BRIEF });
    renderCard(null, null);

    expect(screen.getByText("src/config.ts:12")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "src/config.ts:12" })).toBeNull();
  });
});
