import { describe, it, expect } from "vitest";
import { lineDiff } from "./line-diff";

describe("lineDiff (AC-17/24)", () => {
  it("returns an empty diff for identical text (same-version compare)", () => {
    expect(lineDiff("a\nb\nc", "a\nb\nc")).toEqual([]);
  });

  it("marks removed and added lines while keeping unchanged context", () => {
    const diff = lineDiff("keep\nold line\ntail", "keep\nnew line\ntail");
    expect(diff).toEqual([
      { sign: " ", text: "keep" },
      { sign: "-", text: "old line" },
      { sign: "+", text: "new line" },
      { sign: " ", text: "tail" },
    ]);
  });

  it("handles pure additions (empty old text)", () => {
    expect(lineDiff("", "one\ntwo")).toEqual([
      { sign: "-", text: "" },
      { sign: "+", text: "one" },
      { sign: "+", text: "two" },
    ]);
  });
});
