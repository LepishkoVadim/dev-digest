import { describe, it, expect } from 'vitest';
import { scoreCases, type ScoringCase } from './scoring.js';

/**
 * Hermetic scoring tests (zero LLM, AC-14/NFR-1). Reproduces the spec's worked
 * example: baseline 1.0/1.0/1.0 and the deliberately-worse fixture dropping
 * precision to 0.5.
 */
describe('scoreCases', () => {
  // Case A (must_find): expected [{a.ts,10-12}], actual (grounded) [{a.ts,11-11}] → match.
  const caseA: ScoringCase = {
    expectation_kind: 'must_find',
    expected: [{ file: 'a.ts', start_line: 10, end_line: 12 }],
    actual: [{ file: 'a.ts', start_line: 11, end_line: 11 }],
    proposedCount: 1,
    groundedCount: 1,
  };
  // Case B (must_not_flag): expected [], baseline actual [].
  const caseBClean: ScoringCase = {
    expectation_kind: 'must_not_flag',
    expected: [],
    actual: [],
    proposedCount: 0,
    groundedCount: 0,
  };

  it('scores the baseline worked example 1.0 / 1.0 / 1.0', () => {
    expect(scoreCases([caseA, caseBClean])).toEqual({
      recall: 1,
      precision: 1,
      citation_accuracy: 1,
    });
  });

  it('drops precision to 0.5 when a false positive is added to a must_not_flag case', () => {
    const caseBFalsePositive: ScoringCase = {
      ...caseBClean,
      actual: [{ file: 'b.ts', start_line: 5, end_line: 5 }],
      proposedCount: 1,
      groundedCount: 1,
    };
    const worse = scoreCases([caseA, caseBFalsePositive]);
    expect(worse.precision).toBe(0.5); // 1 matched / 2 actual
    expect(worse.recall).toBe(1); // must_find case still fully matched
    expect(worse.precision).toBeLessThan(1);
  });

  it('reports recall 1.0 for a pure must_not_flag set (vacuously complete)', () => {
    expect(scoreCases([caseBClean]).recall).toBe(1);
  });

  it('reports citation_accuracy as survivors/proposed and 1.0 when nothing proposed', () => {
    const ungrounded: ScoringCase = {
      expectation_kind: 'must_find',
      expected: [{ file: 'a.ts', start_line: 1, end_line: 1 }],
      actual: [{ file: 'a.ts', start_line: 1, end_line: 1 }],
      proposedCount: 4,
      groundedCount: 2,
    };
    expect(scoreCases([ungrounded]).citation_accuracy).toBe(0.5);
    expect(scoreCases([caseBClean]).citation_accuracy).toBe(1);
  });

  it('counts an unmatched actual on a must_find case against precision', () => {
    const noise: ScoringCase = {
      expectation_kind: 'must_find',
      expected: [{ file: 'a.ts', start_line: 10, end_line: 12 }],
      actual: [
        { file: 'a.ts', start_line: 11, end_line: 11 },
        { file: 'a.ts', start_line: 90, end_line: 90 },
      ],
      proposedCount: 2,
      groundedCount: 2,
    };
    const r = scoreCases([noise]);
    expect(r.recall).toBe(1);
    expect(r.precision).toBe(0.5);
  });
});
