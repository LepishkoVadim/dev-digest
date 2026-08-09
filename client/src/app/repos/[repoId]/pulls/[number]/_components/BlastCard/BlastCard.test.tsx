import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { BlastReport } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/blast.json";

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../../../../../../../lib/hooks/blast", () => ({ useBlast: () => mocks.query() }));

import { BlastCard } from "./BlastCard";

afterEach(cleanup);

const OK: BlastReport = {
  status: "ok",
  reason: null,
  changed_files: ["src/util/format.ts"],
  changed_symbols: [{ name: "formatDate", file: "src/util/format.ts", kind: "function" }],
  symbols: [
    {
      name: "formatDate",
      file: "src/util/format.ts",
      kind: "function",
      callers: [
        { file: "src/api/users.ts", symbol: "listUsers", line: 12, rank: 0.9, endpoints: ["GET /users"], crons: [] },
        { file: "src/api/orders.ts", symbol: "listOrders", line: 8, rank: 0.5, endpoints: ["POST /orders"], crons: [] },
      ],
      endpoints: ["GET /users"],
      crons: ["reset-rate-buckets (hourly)"],
    },
  ],
  impacted_endpoints: [{ endpoint: "GET /users", via_files: ["src/api/users.ts"], depth: 1 }],
  prior_prs: [
    {
      number: 800,
      title: "Earlier refactor",
      status: "merged",
      author: "marisa.koch",
      date: "2026-02-02T00:00:00.000Z",
      note: "Redis client already lives here — reuse `src/lib/redis.ts` instead.",
      files_overlap: ["src/util/format.ts"],
    },
  ],
  index: { status: "full", last_indexed_sha: "abc1234", indexer_version: 2 },
};

function renderCard(data: Partial<BlastReport> & Pick<BlastReport, "status">) {
  mocks.query.mockReturnValue({ data, isLoading: false, isError: false, refetch: vi.fn() });
  return render(
    <NextIntlClientProvider locale="en" messages={{ blast: messages }}>
      <BlastCard prId="pr-1" repoFullName="acme/blast-demo" headSha="abc1234" />
    </NextIntlClientProvider>,
  );
}

describe("BlastCard", () => {
  it("renders in overview with stats, the first symbol expanded, callers and endpoint/cron chips", () => {
    renderCard(OK);

    // Card title + stat labels.
    expect(screen.getByText(messages.tab.title)).toBeInTheDocument();
    expect(screen.getByText("formatDate()")).toBeInTheDocument();
    expect(screen.getByText("GET /users")).toBeInTheDocument();
    expect(screen.getByText("reset-rate-buckets (hourly)")).toBeInTheDocument();

    // Caller file:line deep-links to the exact line on GitHub (pinned to sha).
    const link = screen.getByText("src/api/users.ts:12").closest("a");
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/acme/blast-demo/blob/abc1234/src/api/users.ts#L12",
    );
  });

  it("switches to the graph view", () => {
    renderCard(OK);
    fireEvent.click(screen.getByRole("button", { name: messages.view.graph }));
    // Symbol still present in the graph layout.
    expect(screen.getByText("formatDate()")).toBeInTheDocument();
  });

  it("expands the prior-PRs footer", () => {
    renderCard(OK);
    expect(screen.getByText(messages.priorPrs.title)).toBeInTheDocument();
    fireEvent.click(screen.getByText(messages.priorPrs.title));
    expect(screen.getByText("#800")).toBeInTheDocument();
    expect(screen.getByText("Earlier refactor")).toBeInTheDocument();
    // Author + date meta and the note (with inline code) render.
    expect(screen.getByText("marisa.koch")).toBeInTheDocument();
    expect(screen.getByText(/2026-02-02/)).toBeInTheDocument();
    expect(screen.getByText("src/lib/redis.ts")).toBeInTheDocument(); // inline code chip
  });

  it("shows only the top symbols inline and opens the rest in a 'See all' modal", () => {
    const many: BlastReport = {
      ...OK,
      changed_symbols: Array.from({ length: 8 }, (_v, i) => ({
        name: `sym${i}`,
        file: `src/f${i}.ts`,
        kind: "function",
      })),
      symbols: Array.from({ length: 8 }, (_v, i) => ({
        name: `sym${i}`,
        file: `src/f${i}.ts`,
        kind: "function",
        callers: [],
        endpoints: [],
        crons: [],
      })),
    };
    renderCard(many);

    // The 7th/8th symbols are hidden inline...
    expect(screen.queryByText("sym7()")).not.toBeInTheDocument();
    // ...behind a "See all 8 symbols" button.
    const seeAll = screen.getByText("See all 8 symbols");
    fireEvent.click(seeAll);
    // The modal lists every symbol, including the previously-hidden one.
    expect(screen.getByText("sym7()")).toBeInTheDocument();
  });

  it("shows degraded / empty / partial states honestly", () => {
    const { rerender } = renderCard({ ...OK, status: "degraded", symbols: [] });
    expect(screen.getByText(messages.state.degradedBody)).toBeInTheDocument();

    mocks.query.mockReturnValue({
      data: { ...OK, status: "empty", symbols: [] },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    rerender(
      <NextIntlClientProvider locale="en" messages={{ blast: messages }}>
        <BlastCard prId="pr-1" repoFullName="acme/blast-demo" headSha="abc1234" />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText(messages.state.emptyBody)).toBeInTheDocument();

    mocks.query.mockReturnValue({
      data: { ...OK, status: "partial" },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    rerender(
      <NextIntlClientProvider locale="en" messages={{ blast: messages }}>
        <BlastCard prId="pr-1" repoFullName="acme/blast-demo" headSha="abc1234" />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText(messages.state.partialBanner)).toBeInTheDocument();
  });
});
