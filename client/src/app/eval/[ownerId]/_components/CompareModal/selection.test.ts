import { describe, it, expect } from "vitest";
import type { EvalRunRecord } from "@devdigest/shared";
import { canCompare } from "./selection";

type OwnedRun = EvalRunRecord & { _owner: string };

function run(id: string, owner = "o1"): OwnedRun {
  return {
    id,
    case_id: "c1",
    case_name: null,
    ran_at: "2026-08-24T00:00:00Z",
    actual_output: null,
    pass: true,
    recall: 1,
    precision: 1,
    citation_accuracy: 1,
    duration_ms: 10,
    cost_usd: null,
    version: 1,
    _owner: owner,
  };
}

describe("canCompare (AC-22, NFR-6)", () => {
  it("is disabled for 1, 3+, and cross-owner selections; enabled for exactly 2 same-owner", () => {
    expect(canCompare([run("a")])).toBe(false);
    expect(canCompare([run("a"), run("b"), run("c")])).toBe(false);
    expect(canCompare([run("a"), run("b")])).toBe(true);
    // cross-owner pair
    const byOwner = (r: EvalRunRecord) => (r as OwnedRun)._owner;
    expect(canCompare([run("a", "o1"), run("b", "o2")], byOwner)).toBe(false);
    expect(canCompare([run("a", "o1"), run("b", "o1")], byOwner)).toBe(true);
  });
});
