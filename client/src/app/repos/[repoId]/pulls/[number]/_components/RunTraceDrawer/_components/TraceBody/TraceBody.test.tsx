import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunTrace } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/runs.json";
import { TraceBody } from "./TraceBody";

const trace = (specs_read: RunTrace["specs_read"]): RunTrace => ({
  config: { agent: "Sec", version: "1", provider: "openai", model: "gpt-4.1", pr: 1, source: "local" },
  stats: { duration_ms: 100, tokens_in: 1, tokens_out: 1, findings: 0, grounding: "0/0 passed", cost_usd: 0 },
  prompt_assembly: {
    system: "s",
    skills: null,
    memory: null,
    specs: "<untrusted source=\"spec-0\">api/ must not import db/</untrusted>",
    user: "u",
  },
  tool_calls: [],
  raw_output: "{}",
  memory_pulled: [],
  specs_read,
  log: [],
});

function renderBody(t: RunTrace) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      <div data-theme="dark">
        <TraceBody trace={t} findings={[]} />
      </div>
    </NextIntlClientProvider>,
  );
}

afterEach(cleanup);

describe("TraceBody specs_read (AC-16, NFR-4/5)", () => {
  it("renders a sent doc with its token count and marks a skipped doc", () => {
    renderBody(
      trace([
        { path: "specs/rule.md", tokens: 42, skipped: false },
        { path: "specs/missing.md", tokens: 0, skipped: true },
      ]),
    );

    // Sent doc: path + token count, no "skipped" label.
    const sent = screen.getByText("specs/rule.md").closest("span")!;
    expect(within(sent.parentElement!).getByText(/42 tok/)).toBeInTheDocument();

    // Skipped doc: path present + a visible "skipped" marker for screen readers.
    expect(screen.getByText("specs/missing.md")).toBeInTheDocument();
    expect(screen.getByText("skipped")).toBeInTheDocument();
  });

  it("shows the empty state when no docs were read", () => {
    renderBody(trace([]));
    expect(screen.getByText("none")).toBeInTheDocument();
  });
});
