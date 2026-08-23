import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { DocList } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/context.json";

const state: {
  docs?: DocList;
  isLoading: boolean;
  isError: boolean;
} = { isLoading: false, isError: false };

// AppShell pulls in next/navigation (useRouter) + shell context; render children
// passthrough so the test targets the reader content, matching the repo's
// convention of testing inner views rather than the shell wrapper.
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children?: unknown }) => children,
}));
vi.mock("@/components/repo-not-found", () => ({
  RepoNotFound: () => "repo not found",
}));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: null }),
  useRepoNotFound: () => false,
}));
vi.mock("@/lib/hooks/docs", () => ({
  useRepoDocs: () => ({
    data: state.docs,
    isLoading: state.isLoading,
    isError: state.isError,
    refetch: vi.fn(),
  }),
  useRescanDocs: () => ({ mutate: vi.fn(), isPending: false }),
  useDocPreview: () => ({ data: { path: "", body: "# rendered body" }, isLoading: false, isError: false }),
}));

import { ProjectContextView } from "./ProjectContextView";

afterEach(cleanup);
beforeEach(() => {
  state.docs = undefined;
  state.isLoading = false;
  state.isError = false;
});

function renderView() {
  render(
    <NextIntlClientProvider locale="en" messages={{ context: messages }}>
      <div data-theme="dark">
        <ProjectContextView repoId="r1" />
      </div>
    </NextIntlClientProvider>,
  );
}

describe("ProjectContextView (AC-2/4/5/6/22)", () => {
  it("lists docs and previews a selected doc with 'Used by N agents' + footer", () => {
    state.docs = {
      docs: [{ path: "specs/api.md", tokens: 12, type: "specs", used_by_agents: 2 }],
      scanned_at: new Date().toISOString(),
    };
    renderView();

    expect(screen.getByText("api.md")).toBeInTheDocument();
    fireEvent.click(screen.getByText("api.md"));
    expect(screen.getByText("Used by 2 agents")).toBeInTheDocument();
    expect(screen.getByText("rendered body")).toBeInTheDocument();
    // Footer shows a file count, no chunk/coverage metric.
    expect(screen.getByText(/1 file · last scanned/)).toBeInTheDocument();
    expect(screen.queryByText(/chunk/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/coverage/i)).not.toBeInTheDocument();
  });

  it("renders the reader empty state (no authoring CTA) when no docs are found", () => {
    state.docs = { docs: [], scanned_at: new Date().toISOString() };
    renderView();
    expect(screen.getByText("No .md docs found")).toBeInTheDocument();
    expect(screen.queryByText(/add a spec/i)).not.toBeInTheDocument();
  });

  it("renders an error state distinct from empty when the walk fails", () => {
    state.isError = true;
    renderView();
    expect(screen.getByText("Couldn’t scan this repo")).toBeInTheDocument();
  });
});
