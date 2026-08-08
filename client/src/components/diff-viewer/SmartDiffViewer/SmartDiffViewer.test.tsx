import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SmartDiff, PrFile } from "@devdigest/shared";
import messages from "../../../../messages/en/shell.json";

// Mock the data hook so the component renders synchronously without fetch.
const useSmartDiff = vi.fn();
vi.mock("@/lib/hooks/smart-diff", () => ({ useSmartDiff: () => useSmartDiff() }));

import { SmartDiffViewer } from "./SmartDiffViewer";

afterEach(cleanup);

const FILES: PrFile[] = [
  { path: "src/middleware/ratelimit.ts", additions: 84, deletions: 0, patch: "@@ -1,1 +1,1 @@\n+const x = 1;" },
  { path: "package-lock.json", additions: 92, deletions: 24, patch: "@@ -1,1 +1,1 @@\n+dep" },
];

const SMART_DIFF: SmartDiff = {
  groups: [
    {
      role: "core",
      files: [{ path: "src/middleware/ratelimit.ts", additions: 84, deletions: 0, finding_lines: [1], pseudocode_summary: null }],
    },
    {
      role: "boilerplate",
      files: [{ path: "package-lock.json", additions: 92, deletions: 24, finding_lines: [], pseudocode_summary: null }],
    },
  ],
  split_suggestion: { too_big: false, total_lines: 200, proposed_splits: [] },
};

function renderViewer() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ shell: messages }}>
      <SmartDiffViewer prId="pr1" files={FILES} />
    </NextIntlClientProvider>,
  );
}

describe("SmartDiffViewer", () => {
  it("renders Core logic before Boilerplate and shows the findings badge", () => {
    useSmartDiff.mockReturnValue({ data: SMART_DIFF, isError: false });
    renderViewer();

    const core = screen.getByText("Core logic");
    const boilerplate = screen.getByText("Boilerplate");
    // Core group appears earlier in the DOM than Boilerplate.
    expect(core.compareDocumentPosition(boilerplate) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // The core file has a finding → its clickable badge renders.
    expect(screen.getByText("1 findings")).toBeInTheDocument();
  });

  it("keeps the boilerplate group collapsed (lock file hidden by default)", () => {
    useSmartDiff.mockReturnValue({ data: SMART_DIFF, isError: false });
    renderViewer();
    // Core file card header is visible; the collapsed boilerplate file is not.
    expect(screen.getByText("src/middleware/ratelimit.ts")).toBeInTheDocument();
    expect(screen.queryByText("package-lock.json")).not.toBeInTheDocument();
  });

  it("falls back to the flat diff when Smart Diff errors", () => {
    useSmartDiff.mockReturnValue({ data: undefined, isError: true });
    renderViewer();
    // No group headers; the flat viewer still lists the file.
    expect(screen.queryByText("Core logic")).not.toBeInTheDocument();
    expect(screen.getByText("src/middleware/ratelimit.ts")).toBeInTheDocument();
  });
});
