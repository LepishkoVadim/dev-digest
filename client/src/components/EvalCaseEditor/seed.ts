/* seed.ts — derive an eval-case draft from a review finding (AC-4/5/6). */
import type {
  EvalOwnerKind,
  ExpectationKind,
  ExpectedFinding,
  FindingRecord,
  PrDetail,
} from "@devdigest/shared";

export interface EvalCaseDraft {
  id?: string;
  owner_kind: EvalOwnerKind;
  owner_id: string;
  name: string;
  input_diff: string;
  /** Secondary inputs edited on the Files / PR meta tabs (raw JSON). */
  input_files?: unknown;
  input_meta?: unknown;
  /** null = unset (save blocked until picked). */
  expectation_kind: ExpectationKind | null;
  expected_output: ExpectedFinding[];
  notes: string | null;
  /** True when the draft was seeded from a review finding (drives the subtitle). */
  seeded_from_finding?: boolean;
}

/**
 * Seed a draft from a finding + its owning agent. The finding's action state sets
 * only the INITIAL badge (AC-4/5/6): accepted → must_find, dismissed →
 * must_not_flag, neither → unset. The author can flip it before saving (AC-7).
 */
export function seedFromFinding(f: FindingRecord, agentId: string): EvalCaseDraft {
  const kind: ExpectationKind | null = f.accepted_at
    ? "must_find"
    : f.dismissed_at
      ? "must_not_flag"
      : null;
  return {
    owner_kind: "agent",
    owner_id: agentId,
    name: f.title,
    input_diff: "",
    expectation_kind: kind,
    // Carry the finding's location + display hints as the expected finding
    // (AC-4). severity/category/title are display-only (row chip); the scorer
    // matches on file + line overlap.
    expected_output: [
      {
        file: f.file,
        start_line: f.start_line,
        end_line: f.end_line,
        severity: f.severity,
        category: f.category,
        title: f.title,
      },
    ],
    notes: null,
    seeded_from_finding: true,
  };
}

/**
 * Build a unified-diff block for one file — the SAME shape the server's review
 * path assembles (`server/src/modules/reviews/diff-loader.ts`), so a seeded case
 * parses identically to a real review. GitHub `PrFile.patch` is hunks only, so
 * we prepend the `diff --git` / `---` / `+++` headers.
 */
function fileDiff(path: string, patch: string): string {
  return `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n${patch}`;
}

/**
 * Fill a finding-seeded draft with the REAL PR inputs the finding came from: the
 * finding's file diff (Diff tab), the PR's changed-file list (Files tab) and PR
 * metadata (PR meta tab). Without this the Input tabs are empty and fall back to
 * placeholder text, which reads like mock data. Keyed by the finding's file
 * (`expected_output[0].file`); falls back to the first file that has a patch.
 */
export function enrichDraftFromPr(draft: EvalCaseDraft, pr: PrDetail): EvalCaseDraft {
  const targetFile = draft.expected_output[0]?.file;
  const file =
    (targetFile ? pr.files.find((f) => f.path === targetFile && f.patch) : undefined) ??
    pr.files.find((f) => f.patch);
  return {
    ...draft,
    input_diff: file?.patch ? fileDiff(file.path, file.patch) : draft.input_diff,
    input_files: pr.files.map((f) => ({
      path: f.path,
      additions: f.additions,
      deletions: f.deletions,
    })),
    input_meta: {
      pr_number: pr.number,
      title: pr.title,
      author: pr.author,
      branch: pr.branch,
      base: pr.base,
    },
  };
}

/** An empty draft for "+ New eval case" (manual authorship, AC-8). */
export function emptyDraft(owner_kind: EvalOwnerKind, owner_id: string): EvalCaseDraft {
  return {
    owner_kind,
    owner_id,
    name: "",
    input_diff: "",
    expectation_kind: null,
    expected_output: [],
    notes: null,
  };
}
