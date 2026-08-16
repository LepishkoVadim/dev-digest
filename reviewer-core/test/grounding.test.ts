import { describe, it, expect } from 'vitest';
import type { BriefRisk, Finding, ReviewFocus, UnifiedDiff } from '@devdigest/shared';
import { groundBriefRefs, groundFindings } from '../src/grounding.js';

/**
 * Unit tests for the citation-grounding gate, focused on the new-side line index
 * built from hunks — in particular the fallback path (empty `newLineNumbers`),
 * where a pure-deletion hunk must NOT fabricate a line.
 */

function mkFinding(over: Partial<Finding>): Finding {
  return {
    id: 'f',
    severity: 'WARNING',
    category: 'bug',
    title: 't',
    file: 'src/a.ts',
    start_line: 1,
    end_line: 1,
    rationale: 'r',
    confidence: 0.9,
    kind: 'finding',
    ...over,
  } as Finding;
}

/** A one-file diff with a single hunk (fallback path: newLineNumbers empty). */
function diffWithHunk(newStart: number, newLines: number): UnifiedDiff {
  return {
    raw: '',
    files: [
      {
        path: 'src/a.ts',
        additions: newLines,
        deletions: 0,
        hunks: [{ file: 'src/a.ts', oldStart: newStart, oldLines: 1, newStart, newLines, newLineNumbers: [] }],
      },
    ],
  };
}

describe('groundFindings — new-side line index', () => {
  it('drops a finding citing a pure-deletion hunk (newLines === 0 adds no lines)', () => {
    // Pure deletion at new-side line 42: there is nothing to comment on there.
    const diff = diffWithHunk(42, 0);
    const finding = mkFinding({ start_line: 42, end_line: 42 });

    const { kept, dropped } = groundFindings([finding], diff);

    expect(kept).toHaveLength(0);
    expect(dropped).toHaveLength(1);
    expect(dropped[0]!.reason).toMatch(/do not intersect/);
  });

  it('keeps a finding on a real added line via the fallback range', () => {
    // Added lines 10..12 (newLines=3), no explicit newLineNumbers → fallback.
    const diff = diffWithHunk(10, 3);

    expect(groundFindings([mkFinding({ start_line: 11, end_line: 11 })], diff).kept).toHaveLength(1);
    // Line 13 is outside [10,12] → dropped.
    expect(groundFindings([mkFinding({ start_line: 13, end_line: 13 })], diff).dropped).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// groundBriefRefs — file/endpoint reference grounding for the PR Brief.
// ---------------------------------------------------------------------------

function mkRisk(over: Partial<BriefRisk>): BriefRisk {
  return {
    kind: 'auth',
    title: 't',
    explanation: 'e',
    severity: 'high',
    file_refs: [],
    endpoint_refs: [],
    ...over,
  };
}

function mkFocus(over: Partial<ReviewFocus>): ReviewFocus {
  return { file: 'src/a.ts', line: 1, reason: 'read this' , ...over };
}

describe('groundBriefRefs', () => {
  const changedFiles = new Set(['src/a.ts', 'src/b.ts']);
  const endpoints = new Set(['GET /users', 'POST /users']);

  it('keeps refs present in the diff / blast, drops the invented ones', () => {
    const candidate = {
      risks: [
        mkRisk({
          file_refs: ['src/a.ts', 'src/GHOST.ts'],
          endpoint_refs: ['GET /users', 'DELETE /ghost'],
        }),
      ],
      review_focus: [mkFocus({ file: 'src/b.ts' }), mkFocus({ file: 'src/PHANTOM.ts' })],
    };

    const res = groundBriefRefs(candidate, { changedFiles, endpoints });

    // Risk survives; only its ungrounded refs are stripped.
    expect(res.risks).toHaveLength(1);
    expect(res.risks[0]!.file_refs).toEqual(['src/a.ts']);
    expect(res.risks[0]!.endpoint_refs).toEqual(['GET /users']);
    // review_focus with a ghost file is dropped entirely.
    expect(res.review_focus.map((f) => f.file)).toEqual(['src/b.ts']);
    // Every drop is reported for the caller to log (NFR-4).
    const droppedRefs = res.dropped.map((d) => d.ref).sort();
    expect(droppedRefs).toEqual(['DELETE /ghost', 'src/GHOST.ts', 'src/PHANTOM.ts']);
  });

  it('drops ALL endpoint refs when the blast endpoints set is empty (AC-18)', () => {
    const candidate = {
      risks: [mkRisk({ file_refs: ['src/a.ts'], endpoint_refs: ['GET /users', 'POST /users'] })],
      review_focus: [mkFocus({ file: 'src/a.ts' })],
    };

    const res = groundBriefRefs(candidate, { changedFiles, endpoints: new Set<string>() });

    // File refs and focus survive (changed-file only); endpoints all gone.
    expect(res.risks[0]!.file_refs).toEqual(['src/a.ts']);
    expect(res.risks[0]!.endpoint_refs).toEqual([]);
    expect(res.review_focus).toHaveLength(1);
    expect(res.dropped.map((d) => d.ref).sort()).toEqual(['GET /users', 'POST /users']);
  });

  it('is a no-op (no drops) when every ref is grounded and handles absent endpoint_refs', () => {
    const candidate = {
      risks: [mkRisk({ file_refs: ['src/a.ts'], endpoint_refs: null })],
      review_focus: [mkFocus({ file: 'src/a.ts' })],
    };

    const res = groundBriefRefs(candidate, { changedFiles, endpoints });

    expect(res.dropped).toHaveLength(0);
    expect(res.risks[0]!.file_refs).toEqual(['src/a.ts']);
    expect(res.risks[0]!.endpoint_refs).toEqual([]);
    expect(res.review_focus).toHaveLength(1);
  });
});
