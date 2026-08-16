import type { BriefRisk, Finding, ReviewFocus, UnifiedDiff } from '@devdigest/shared';

/**
 * Citation grounding — the mandatory mechanical gate for diff-findings.
 *
 * A diff-finding is kept ONLY if its [start_line, end_line] range intersects a
 * real hunk in the unified diff for the same file. Findings that fail are
 * dropped (the model "hallucinated" a location).
 *
 * EXCEPTION: findings from full-file scanners (hooks / blast / onboarding) are
 * not tied to a diff hunk — they ground against the file existing in the diff
 * (or are exempted entirely). We treat `kind` in {secret_leak, lethal_trifecta,
 * phantom, hook} as full-file: they only require the file to be present.
 */

const FULL_FILE_KINDS = new Set(['secret_leak', 'lethal_trifecta', 'phantom', 'hook']);

export interface GroundingResult {
  kept: Finding[];
  dropped: { finding: Finding; reason: string }[];
}

/** Build a quick lookup of file → set of new-side line numbers covered by hunks. */
export function buildLineIndex(diff: UnifiedDiff): Map<string, Set<number>> {
  const idx = new Map<string, Set<number>>();
  for (const f of diff.files) {
    const set = new Set<number>();
    for (const h of f.hunks) {
      if (h.newLineNumbers && h.newLineNumbers.length > 0) {
        for (const n of h.newLineNumbers) set.add(n);
      } else {
        // Fall back to the hunk's declared new range. NOT Math.max(newLines, 1):
        // a pure-deletion hunk (newLines === 0) has no new-side lines to comment
        // on, so it must contribute NOTHING — otherwise it fabricates line
        // `newStart` into the index and a finding citing it wrongly survives the
        // gate (a hallucination that should be dropped).
        for (let n = h.newStart; n < h.newStart + h.newLines; n++) set.add(n);
      }
    }
    idx.set(f.path, set);
  }
  return idx;
}

function rangeIntersects(lines: Set<number>, start: number, end: number): boolean {
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  for (let n = lo; n <= hi; n++) if (lines.has(n)) return true;
  return false;
}

/**
 * Apply the grounding gate to a set of findings against a unified diff.
 * Returns the kept findings and the dropped ones with reasons (for the trace).
 */
export function groundFindings(findings: Finding[], diff: UnifiedDiff): GroundingResult {
  const lineIndex = buildLineIndex(diff);
  const filesInDiff = new Set(diff.files.map((f) => f.path));
  const kept: Finding[] = [];
  const dropped: { finding: Finding; reason: string }[] = [];

  for (const finding of findings) {
    const isFullFile = finding.kind ? FULL_FILE_KINDS.has(finding.kind) : false;

    if (!filesInDiff.has(finding.file)) {
      dropped.push({ finding, reason: `file '${finding.file}' not present in diff` });
      continue;
    }

    if (isFullFile) {
      // full-file scanners only need the file to be in the diff
      kept.push(finding);
      continue;
    }

    const lines = lineIndex.get(finding.file) ?? new Set<number>();
    if (rangeIntersects(lines, finding.start_line, finding.end_line)) {
      kept.push(finding);
    } else {
      dropped.push({
        finding,
        reason: `lines ${finding.start_line}-${finding.end_line} do not intersect any diff hunk in '${finding.file}'`,
      });
    }
  }

  return { kept, dropped };
}

/** Human-readable summary, e.g. "3/3 passed" used in run-trace stats. */
export function groundingSummary(result: GroundingResult): string {
  const total = result.kept.length + result.dropped.length;
  return `${result.kept.length}/${total} passed`;
}

// ---------------------------------------------------------------------------
// Brief-reference grounding — the same "model proposes, code disposes" gate as
// `groundFindings`, but for the PR Brief. The Brief carries bare file PATHS
// (not line-ranged findings) and "METHOD /path" ENDPOINT refs, so it grounds
// against two sets: the diff's changed files, and the blast report's impacted
// endpoints. Anything the model invented — a path not in the diff, an endpoint
// not in the blast report — is dropped. PURE: no logging (the caller logs each
// `dropped` entry per NFR-4) and NO `risk_level` derivation (the caller does).
// ---------------------------------------------------------------------------

/** What the model returns, ungrounded — the parts this gate filters. */
export interface BriefCandidateRefs {
  risks: BriefRisk[];
  review_focus: ReviewFocus[];
}

export interface BriefGroundingResult {
  risks: BriefRisk[];
  review_focus: ReviewFocus[];
  /** One entry per dropped reference; the caller emits a log line each. */
  dropped: { ref: string; reason: string }[];
}

/**
 * Ground a Brief candidate's references.
 *   - `risks[].file_refs`  : keep only paths in `changedFiles`.
 *   - `risks[].endpoint_refs` : keep only endpoints in `endpoints`; when
 *     `endpoints` is empty (blast degraded/empty — AC-18), ALL endpoint refs
 *     are dropped.
 *   - `review_focus[].file`: keep the item only if its file is in `changedFiles`.
 *
 * A risk whose refs are all dropped is still KEPT (the risk narrative may still
 * be valid) but with empty ref arrays; only the ungrounded refs are removed.
 * `review_focus` items are DROPPED entirely when their file is ungrounded —
 * a "read this first" link that points nowhere is worse than nothing.
 */
export function groundBriefRefs(
  candidate: BriefCandidateRefs,
  input: { changedFiles: Set<string>; endpoints: Set<string> },
): BriefGroundingResult {
  const { changedFiles, endpoints } = input;
  const dropped: { ref: string; reason: string }[] = [];

  const risks: BriefRisk[] = candidate.risks.map((risk) => {
    const fileRefs = risk.file_refs.filter((f) => {
      if (changedFiles.has(f)) return true;
      dropped.push({ ref: f, reason: `file '${f}' not present in diff changed files` });
      return false;
    });
    const endpointRefs = (risk.endpoint_refs ?? []).filter((e) => {
      if (endpoints.has(e)) return true;
      dropped.push({ ref: e, reason: `endpoint '${e}' not present in blast impacted_endpoints` });
      return false;
    });
    return { ...risk, file_refs: fileRefs, endpoint_refs: endpointRefs };
  });

  const review_focus: ReviewFocus[] = candidate.review_focus.filter((focus) => {
    if (changedFiles.has(focus.file)) return true;
    dropped.push({ ref: focus.file, reason: `review_focus file '${focus.file}' not present in diff changed files` });
    return false;
  });

  return { risks, review_focus, dropped };
}
