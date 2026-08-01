import { describe, it, expect } from "vitest";
import { lineDiff } from "./helpers";

describe("lineDiff", () => {
  it("marks unchanged, added and removed lines", () => {
    const d = lineDiff("a\nb\nc", "a\nx\nc");
    expect(d).toEqual([
      { kind: "same", text: "a" },
      { kind: "del", text: "b" },
      { kind: "add", text: "x" },
      { kind: "same", text: "c" },
    ]);
  });

  it("handles pure additions", () => {
    expect(lineDiff("a", "a\nb")).toEqual([
      { kind: "same", text: "a" },
      { kind: "add", text: "b" },
    ]);
  });
});
