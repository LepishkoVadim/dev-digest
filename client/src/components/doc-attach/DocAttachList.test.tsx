import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { DocList } from "@devdigest/shared";
import messages from "../../../messages/en/context.json";

const DOCS: DocList = {
  docs: [
    { path: "specs/a.md", tokens: 10, type: "specs", used_by_agents: 0 },
    { path: "docs/b.md", tokens: 20, type: "docs", used_by_agents: 0 },
    { path: "insights/c.md", tokens: 30, type: "insights", used_by_agents: 0 },
  ],
  scanned_at: new Date().toISOString(),
};

vi.mock("../../lib/repo-context", () => ({
  useActiveRepo: () => ({ repoId: "r1", reposLoaded: true }),
}));
vi.mock("../../lib/hooks/docs", () => ({
  useRepoDocs: () => ({ data: DOCS }),
  useDocPreview: () => ({ data: { path: "", body: "# body" } }),
}));

import { DocAttachList } from "./DocAttachList";

afterEach(cleanup);

function renderList(attached: string[], onChange = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ context: messages }}>
      <div data-theme="dark">
        <DocAttachList attached={attached} onChange={onChange} />
      </div>
    </NextIntlClientProvider>,
  );
  return onChange;
}

describe("DocAttachList (AC-7/9/10, NFR-4)", () => {
  it("attaches a doc on checkbox click and persists the new path list", () => {
    const onChange = renderList([]);
    fireEvent.click(screen.getByRole("checkbox", { name: "specs/a.md" }));
    expect(onChange).toHaveBeenCalledWith(["specs/a.md"]);
  });

  it("detaches an already-attached doc", () => {
    const onChange = renderList(["specs/a.md"]);
    fireEvent.click(screen.getByRole("checkbox", { name: "specs/a.md" }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("shows a no-matches empty state when the filter matches nothing", () => {
    renderList([]);
    fireEvent.change(screen.getByPlaceholderText("Filter docs…"), {
      target: { value: "zzzz" },
    });
    expect(screen.getByText("No docs match your filter.")).toBeInTheDocument();
  });

  it("reorders an attached doc down with the keyboard (ArrowDown on the handle)", () => {
    const onChange = renderList(["specs/a.md", "docs/b.md"]);
    fireEvent.keyDown(screen.getByRole("button", { name: "Reorder a.md" }), { key: "ArrowDown" });
    expect(onChange).toHaveBeenCalledWith(["docs/b.md", "specs/a.md"]);
  });
});
