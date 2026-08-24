import type { ExpectationKind, ExpectedFinding } from '@devdigest/shared';

/**
 * Pure, ZERO-LLM eval scoring (L06). Consumes only a case's expected findings,
 * its expectation_kind, and the run's actual (grounded) findings + grounding
 * counts. No Container, no db, no llm, no network — this is the invariant that
 * `verify:l06` asserts (AC-14, NFR-1). Keep it that way.
 *
 * Metrics are micro-averaged across a set of cases (pool all expected / all
 * actual, then one ratio each — not a mean of per-case ratios).
 */

/** The minimal actual-finding shape scoring reads (file + line range). */
export interface ScoredActual {
  file: string;
  start_line: number;
  end_line: number;
}

/** One case's inputs to scoring. */
export interface ScoringCase {
  expectation_kind: ExpectationKind;
  /** Author-labelled expected findings (empty for a `must_not_flag` case). */
  expected: ExpectedFinding[];
  /** Findings that SURVIVED grounding (the ones that feed precision/recall). */
  actual: ScoredActual[];
  /** How many findings the model proposed before grounding (citation denom). */
  proposedCount: number;
  /** How many survived grounding (citation numerator). */
  groundedCount: number;
}

export interface ScoreResult {
  recall: number;
  precision: number;
  citation_accuracy: number;
}

/** file equal AND [start_line,end_line] ranges overlap (inclusive). */
function matches(a: ScoredActual, e: ExpectedFinding): boolean {
  if (a.file !== e.file) return false;
  const aLo = Math.min(a.start_line, a.end_line);
  const aHi = Math.max(a.start_line, a.end_line);
  const eLo = Math.min(e.start_line, e.end_line);
  const eHi = Math.max(e.start_line, e.end_line);
  return aLo <= eHi && eLo <= aHi;
}

/**
 * Micro-averaged metrics over a pool of cases.
 *
 *  - recall    = matched expected / total expected, pooled over `must_find`
 *    cases only. Zero must_find findings in the pool → 1.0 (vacuously complete,
 *    per the spec's FINAL edge rule — not 0.0/N/A).
 *  - precision = matched actual / total actual, pooled over ALL cases. On a
 *    `must_not_flag` case every actual is unmatched → each lowers precision.
 *    Zero actual findings in the pool → 1.0.
 *  - citation_accuracy = grounding survivors / total proposed, pooled. Zero
 *    proposed → 1.0 (nothing ungrounded).
 */
export function scoreCases(cases: ScoringCase[]): ScoreResult {
  let expectedTotal = 0;
  let recallMatched = 0;
  let actualTotal = 0;
  let precisionMatched = 0;
  let proposedTotal = 0;
  let groundedTotal = 0;

  for (const c of cases) {
    // Recall pools over must_find cases only. A must_not_flag case has no
    // expected findings and is excluded from the recall denominator.
    if (c.expectation_kind === 'must_find') {
      for (const e of c.expected) {
        expectedTotal += 1;
        if (c.actual.some((a) => matches(a, e))) recallMatched += 1;
      }
    }

    // Precision pools over every case. An actual finding counts as matched when
    // it overlaps ANY expected finding for the same case.
    for (const a of c.actual) {
      actualTotal += 1;
      if (c.expected.some((e) => matches(a, e))) precisionMatched += 1;
    }

    proposedTotal += c.proposedCount;
    groundedTotal += c.groundedCount;
  }

  return {
    recall: expectedTotal === 0 ? 1 : recallMatched / expectedTotal,
    precision: actualTotal === 0 ? 1 : precisionMatched / actualTotal,
    citation_accuracy: proposedTotal === 0 ? 1 : groundedTotal / proposedTotal,
  };
}
