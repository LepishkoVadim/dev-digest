import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill, DocList } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/context.json";

const DOCS: DocList = {
  docs: [{ path: "specs/rule.md", tokens: 10, type: "specs", used_by_agents: 0 }],
  scanned_at: new Date().toISOString(),
};

vi.mock("../../../../../../../lib/repo-context", () => ({
  useActiveRepo: () => ({ repoId: "r1", reposLoaded: true }),
}));
vi.mock("../../../../../../../lib/hooks/docs", () => ({
  useRepoDocs: () => ({ data: DOCS }),
  useDocPreview: () => ({ data: { path: "", body: "" } }),
}));
vi.mock("../../../../../../../lib/hooks/skills", () => ({
  useUpdateSkill: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { ContextSection } from "./ContextSection";

const SKILL = { id: "sk1", doc_paths: ["specs/rule.md"], used_by_agents: 3 } as Skill;

afterEach(cleanup);

describe("ContextSection (AC-21, AC-23)", () => {
  it("shows the used-by-agents count and the SERIALIZES AS path list under ## Project specifications", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ context: messages }}>
        <div data-theme="dark">
          <ContextSection skill={SKILL} />
        </div>
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("Used by 3 agents")).toBeInTheDocument();
    expect(screen.getByText("SERIALIZES AS")).toBeInTheDocument();
    // Static path list under the edit-time heading (distinct from run-time block).
    expect(screen.getByText(/## Project specifications/)).toBeInTheDocument();
    expect(screen.getByText(/- specs\/rule\.md/)).toBeInTheDocument();
  });
});
