import { describe, it, expect } from 'vitest';
import type { Finding, UnifiedDiff } from '@devdigest/shared';
import { groundFindings } from '../src/grounding.js';

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
