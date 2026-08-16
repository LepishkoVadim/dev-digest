import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, DocList } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/context.json";

const DOCS: DocList = {
  docs: [
    { path: "specs/a.md", tokens: 10, type: "specs", used_by_agents: 0 },
    { path: "docs/b.md", tokens: 25, type: "docs", used_by_agents: 0 },
  ],
  scanned_at: new Date().toISOString(),
};

const mutate = vi.fn();
vi.mock("../../../../../../../lib/repo-context", () => ({
  useActiveRepo: () => ({ repoId: "r1", reposLoaded: true }),
}));
vi.mock("../../../../../../../lib/hooks/docs", () => ({
  useRepoDocs: () => ({ data: DOCS }),
  useDocPreview: () => ({ data: { path: "", body: "" } }),
}));
vi.mock("../../../../../../../lib/hooks/agents", () => ({
  useUpdateAgent: () => ({ mutate, isPending: false }),
}));

import { ContextTab } from "./ContextTab";

const AGENT = { id: "ag1", doc_paths: ["specs/a.md"] } as Agent;

afterEach(() => {
  cleanup();
  mutate.mockClear();
});

function renderTab(agent: Agent) {
  render(
    <NextIntlClientProvider locale="en" messages={{ context: messages }}>
      <div data-theme="dark">
        <ContextTab agent={agent} />
      </div>
    </NextIntlClientProvider>,
  );
}

describe("ContextTab (AC-8, AC-9)", () => {
  it("shows the attached-token total and the fixed injection caption", () => {
    renderTab(AGENT);
    // specs/a.md (10 tokens) is attached.
    expect(screen.getByText("10 tokens attached")).toBeInTheDocument();
    expect(
      screen.getByText("Injected as an untrusted block (## Project context) into every run."),
    ).toBeInTheDocument();
  });

  it("attaching a second doc persists and updates the token total", () => {
    renderTab(AGENT);
    fireEvent.click(screen.getByRole("checkbox", { name: "docs/b.md" }));
    expect(mutate).toHaveBeenCalledWith({ id: "ag1", patch: { doc_paths: ["specs/a.md", "docs/b.md"] } });
    // Local state updates optimistically → total = 10 + 25.
    expect(screen.getByText("35 tokens attached")).toBeInTheDocument();
  });
});
