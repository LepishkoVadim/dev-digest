import { describe, it, expect } from "vitest";
import { seedFromFinding, enrichDraftFromPr } from "./seed";
import type { FindingRecord, PrDetail } from "@devdigest/shared";

const finding = {
  id: "f1",
  review_id: "r1",
  severity: "CRITICAL",
  category: "security",
  title: "Missing authentication in API calls",
  file: "client/src/lib/api.ts",
  start_line: 9,
  end_line: 12,
  rationale: "…",
  confidence: 0.9,
  accepted_at: "2026-08-24T00:00:00Z",
  dismissed_at: null,
} as unknown as FindingRecord;

const pr = {
  number: 9,
  title: "Add smart diff",
  author: "yudox",
  branch: "feat/smart-diff",
  base: "main",
  files: [
    { path: "client/src/lib/api.ts", additions: 3, deletions: 1, patch: "@@ -9,7 +9,12 @@\n+ auth" },
    { path: "server/src/other.ts", additions: 1, deletions: 0, patch: "@@ -1 +1,2 @@\n+ x" },
  ],
} as unknown as PrDetail;

describe("enrichDraftFromPr", () => {
  it("seeds the finding's file diff as a real unified-diff block (not placeholder)", () => {
    const draft = enrichDraftFromPr(seedFromFinding(finding, "agent-1"), pr);
    // matches the server diff-loader format: diff --git / --- / +++ / patch
    expect(draft.input_diff).toBe(
      "diff --git a/client/src/lib/api.ts b/client/src/lib/api.ts\n" +
        "--- a/client/src/lib/api.ts\n" +
        "+++ b/client/src/lib/api.ts\n" +
        "@@ -9,7 +9,12 @@\n+ auth",
    );
    expect(draft.input_diff).not.toContain("sk_live_"); // no mock/placeholder leaked
  });

  it("fills Files + PR meta tabs from the real PR", () => {
    const draft = enrichDraftFromPr(seedFromFinding(finding, "agent-1"), pr);
    expect(draft.input_files).toEqual([
      { path: "client/src/lib/api.ts", additions: 3, deletions: 1 },
      { path: "server/src/other.ts", additions: 1, deletions: 0 },
    ]);
    expect(draft.input_meta).toMatchObject({ pr_number: 9, title: "Add smart diff", branch: "feat/smart-diff", base: "main" });
  });
});
