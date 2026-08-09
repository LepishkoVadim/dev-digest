import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SmartDiff, PrFile } from "@devdigest/shared";
import messages from "../../../../messages/en/shell.json";

// Mock the data hooks so the component renders synchronously without fetch.
const useSmartDiff = vi.fn();
const usePrReviews = vi.fn<() => { data: unknown[] }>(() => ({ data: [] }));
vi.mock("@/lib/hooks/smart-diff", () => ({ useSmartDiff: () => useSmartDiff() }));
vi.mock("@/lib/hooks/reviews", () => ({ usePrReviews: () => usePrReviews() }));

// SmartDiffViewer deep-links findings via the App Router — stub it in jsdom.
const routerReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: routerReplace, push: routerReplace }),
  usePathname: () => "/repos/r1/pulls/1",
  useSearchParams: () => new URLSearchParams(),
}));

import { SmartDiffViewer } from "./SmartDiffViewer";

afterEach(() => {
  cleanup();
  usePrReviews.mockReturnValue({ data: [] });
  routerReplace.mockClear();
});

// core file patch has two added lines so findings on lines 1 and 2 render.
const FILES: PrFile[] = [
  {
    path: "src/middleware/ratelimit.ts",
    additions: 84,
    deletions: 0,
    patch: "@@ -0,0 +1,2 @@\n+const a = 1;\n+const b = 2;",
  },
  { path: "package-lock.json", additions: 92, deletions: 24, patch: "@@ -1,1 +1,1 @@\n+dep" },
];

const SMART_DIFF: SmartDiff = {
  groups: [
    {
      role: "core",
      files: [{ path: "src/middleware/ratelimit.ts", additions: 84, deletions: 0, finding_lines: [1, 2], pseudocode_summary: null }],
    },
    {
      role: "boilerplate",
      files: [{ path: "package-lock.json", additions: 92, deletions: 24, finding_lines: [], pseudocode_summary: null }],
    },
  ],
  split_suggestion: { too_big: false, total_lines: 200, proposed_splits: [] },
};

// Two findings on the core file — one CRITICAL (line 1), one SUGGESTION (line 2).
const REVIEWS = [
  {
    kind: "review",
    findings: [
      { id: "f-crit", file: "src/middleware/ratelimit.ts", start_line: 1, end_line: 1, severity: "CRITICAL" },
      { id: "f-sugg", file: "src/middleware/ratelimit.ts", start_line: 2, end_line: 2, severity: "SUGGESTION" },
    ],
  },
];

function renderViewer() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ shell: messages }}>
      <SmartDiffViewer prId="pr1" files={FILES} />
    </NextIntlClientProvider>,
  );
}

describe("SmartDiffViewer", () => {
  it("renders Core logic before Boilerplate", () => {
    useSmartDiff.mockReturnValue({ data: SMART_DIFF, isError: false });
    renderViewer();
    // Role labels appear in both the file nav and the group headers — compare first occurrences.
    const core = screen.getAllByText("Core logic")[0]!;
    const boilerplate = screen.getAllByText("Boilerplate")[0]!;
    expect(core.compareDocumentPosition(boilerplate) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("badge counts FINDINGS (2), not flagged lines, and highlights each by severity", () => {
    useSmartDiff.mockReturnValue({ data: SMART_DIFF, isError: false });
    usePrReviews.mockReturnValue({ data: REVIEWS });
    renderViewer();

    // Two findings → "2 findings" (even though finding_lines could differ).
    expect(screen.getByText("2 findings")).toBeInTheDocument();
    // Per-line severity labels from the design: blocker (CRITICAL) + suggestion.
    expect(screen.getByText("blocker")).toBeInTheDocument();
    expect(screen.getByText("suggestion")).toBeInTheDocument();
  });

  it("shows a findings summary strip (SeverityBadge tally) and a searchable file nav", () => {
    useSmartDiff.mockReturnValue({ data: SMART_DIFF, isError: false });
    usePrReviews.mockReturnValue({ data: REVIEWS });
    renderViewer();

    // Summary strip: one Critical + one Suggestion.
    expect(screen.getByText("Critical")).toBeInTheDocument();
    expect(screen.getByText("Suggestion")).toBeInTheDocument();
    // File nav lists files by basename + a filter box.
    expect(screen.getByText("ratelimit.ts")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Filter files…")).toBeInTheDocument();
  });

  it("clicking a finding label deep-links to its FindingCard (?tab=findings&finding=<id>)", () => {
    useSmartDiff.mockReturnValue({ data: SMART_DIFF, isError: false });
    usePrReviews.mockReturnValue({ data: REVIEWS });
    renderViewer();
    fireEvent.click(screen.getByText("blocker"));
    expect(routerReplace).toHaveBeenCalledTimes(1);
    const url = routerReplace.mock.calls[0]![0] as string;
    expect(url).toContain("tab=findings");
    expect(url).toContain("finding=f-crit");
  });

  it("keeps the boilerplate group collapsed (its diff hidden by default)", () => {
    useSmartDiff.mockReturnValue({ data: SMART_DIFF, isError: false });
    renderViewer();
    // Core file diff is rendered (group open); boilerplate diff body is not.
    expect(screen.getByText("const a = 1;")).toBeInTheDocument();
    expect(screen.queryByText("dep")).not.toBeInTheDocument();
  });

  it("falls back to the flat diff when Smart Diff errors", () => {
    useSmartDiff.mockReturnValue({ data: undefined, isError: true });
    renderViewer();
    expect(screen.queryByText("Core logic")).not.toBeInTheDocument();
    expect(screen.getByText("src/middleware/ratelimit.ts")).toBeInTheDocument();
  });
});
