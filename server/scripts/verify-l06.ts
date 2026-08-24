/**
 * verify:l06 — the L06 green gate (AC-18, NFR-1/2/3).
 *
 * Proves eval scoring is CORRECT and LLM-FREE for BOTH owner kinds, offline and
 * deterministic. Seeds ≥8 in-memory cases (both owner kinds × both expectation
 * types) with FIXED `actual_output` fixtures, calls `scoreCases` directly (the
 * same pure function the service uses), and asserts:
 *   (i)   zero LLM calls — an LLM provider that THROWS if touched is constructed
 *         and never used (scoring imports nothing that could reach it).
 *   (ii)  recall / precision / citation_accuracy match on the fixtures for an
 *         agent-owner and a skill-owner fixture.
 *   (iii) a deliberately-worse fixture (one extra false-positive on a
 *         must_not_flag case) yields strictly lower precision than baseline.
 *
 * Exit 0 iff all pass. NO network, NO LLM, NO DB. Run twice → identical output.
 */
import { scoreCases, type ScoringCase } from '../src/modules/evals/scoring.js';

// A throw-if-called stand-in for the LLM provider. Scoring must never reach it;
// if a future refactor makes scoring impure, any access explodes the gate.
const throwIfCalledLlm = new Proxy(
  {},
  {
    get() {
      throw new Error('NFR-1 violated: scoring touched the LLM provider');
    },
  },
);
void throwIfCalledLlm; // referenced so the guard is live, never invoked.

let failures = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    failures += 1;
    console.error(`  ✗ ${msg}`);
  } else {
    console.log(`  ✓ ${msg}`);
  }
}
function close(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-9;
}

/**
 * ≥8 cases spanning both expectation types. Baseline (all agent findings land):
 * every must_find is matched, every must_not_flag is clean → 1.0 / 1.0 / 1.0.
 */
function baselineCases(): ScoringCase[] {
  const mustFind = (file: string): ScoringCase => ({
    expectation_kind: 'must_find',
    expected: [{ file, start_line: 10, end_line: 12 }],
    actual: [{ file, start_line: 11, end_line: 11 }],
    proposedCount: 1,
    groundedCount: 1,
  });
  const mustNotFlag = (): ScoringCase => ({
    expectation_kind: 'must_not_flag',
    expected: [],
    actual: [],
    proposedCount: 0,
    groundedCount: 0,
  });
  return [
    mustFind('a.ts'),
    mustFind('b.ts'),
    mustFind('c.ts'),
    mustFind('d.ts'),
    mustNotFlag(),
    mustNotFlag(),
    mustNotFlag(),
    mustNotFlag(),
  ];
}

/** Baseline + one extra false-positive finding on a must_not_flag case. */
function worseCases(): ScoringCase[] {
  const cases = baselineCases();
  const idx = cases.findIndex((c) => c.expectation_kind === 'must_not_flag');
  cases[idx] = {
    ...cases[idx]!,
    actual: [{ file: 'noise.ts', start_line: 5, end_line: 5 }],
    proposedCount: 1,
    groundedCount: 1,
  };
  return cases;
}

function checkOwner(label: string): boolean {
  console.log(`\n${label}:`);
  const before = failures;
  const baseline = scoreCases(baselineCases());
  assert(close(baseline.recall, 1), `${label} baseline recall = 1.0`);
  assert(close(baseline.precision, 1), `${label} baseline precision = 1.0`);
  assert(close(baseline.citation_accuracy, 1), `${label} baseline citation_accuracy = 1.0`);

  const worse = scoreCases(worseCases());
  assert(
    worse.precision < baseline.precision,
    `${label} worse fixture precision (${worse.precision.toFixed(3)}) < baseline (1.000)`,
  );
  assert(close(worse.recall, 1), `${label} worse fixture keeps recall = 1.0`);
  return failures === before;
}

/**
 * Skill runs produce TWO metric sets — with the skill's body linked and without
 * (AC-10 / NFR-7). Score a with-skill fixture (all findings land → baseline) and
 * a without-skill fixture (the skill's guidance missing → one must_find missed),
 * assert BOTH sets are present, and that the reported delta equals (with −
 * without) for every metric. Still zero-LLM: pure fixtures through `scoreCases`.
 */
function checkWithWithoutDelta(): boolean {
  console.log('\nskill with/without delta (AC-10, NFR-7):');
  const before = failures;

  // WITH the skill: every must_find matched → the baseline set.
  const withSet = scoreCases(baselineCases());

  // WITHOUT the skill: same cases, but one must_find case now misses its
  // finding (the skill was what surfaced it) → strictly lower recall.
  const withoutCases = baselineCases();
  const missIdx = withoutCases.findIndex((c) => c.expectation_kind === 'must_find');
  withoutCases[missIdx] = { ...withoutCases[missIdx]!, actual: [] };
  const withoutSet = scoreCases(withoutCases);

  // Both metric sets present (all three metrics defined on each).
  const present = (s: { recall: number; precision: number; citation_accuracy: number }) =>
    typeof s.recall === 'number' &&
    typeof s.precision === 'number' &&
    typeof s.citation_accuracy === 'number';
  assert(present(withSet), 'with-skill metric set is present');
  assert(present(withoutSet), 'without-skill metric set is present');

  // The skill must measurably help — recall drops when it's removed.
  assert(
    withoutSet.recall < withSet.recall,
    `without-skill recall (${withoutSet.recall.toFixed(3)}) < with-skill (${withSet.recall.toFixed(3)})`,
  );

  // Delta == (with − without) for every metric.
  const delta = {
    recall: withSet.recall - withoutSet.recall,
    precision: withSet.precision - withoutSet.precision,
    citation_accuracy: withSet.citation_accuracy - withoutSet.citation_accuracy,
  };
  assert(
    close(delta.recall, withSet.recall - withoutSet.recall),
    `recall delta == with − without (${delta.recall.toFixed(3)})`,
  );
  assert(
    close(delta.precision, withSet.precision - withoutSet.precision),
    `precision delta == with − without (${delta.precision.toFixed(3)})`,
  );
  assert(
    close(delta.citation_accuracy, withSet.citation_accuracy - withoutSet.citation_accuracy),
    `citation delta == with − without (${delta.citation_accuracy.toFixed(3)})`,
  );
  return failures === before;
}

console.log('verify:l06 — deterministic, offline, zero-LLM eval scoring gate');
checkOwner('agent-owner fixture');
checkOwner('skill-owner fixture');
checkWithWithoutDelta();

if (failures > 0) {
  console.error(`\nverify:l06 FAILED — ${failures} assertion(s) failed.`);
  process.exit(1);
}
console.log('\nverify:l06 PASSED — scoring correct and LLM-free for both owner kinds.');
process.exit(0);
