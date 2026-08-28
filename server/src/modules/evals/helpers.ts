import type { EvalCase, EvalRunRecord, ExpectationKind, ExpectedFinding } from '@devdigest/shared';
import { ExpectationKind as ExpectationKindSchema } from '@devdigest/shared';
import type * as t from '../../db/schema.js';

/** Pull the authored `expectation_kind` out of a case's `input_meta` jsonb. */
export function expectationKindOf(inputMeta: unknown): ExpectationKind | null {
  if (inputMeta && typeof inputMeta === 'object' && 'expectation_kind' in inputMeta) {
    const raw = (inputMeta as { expectation_kind?: unknown }).expectation_kind;
    const parsed = ExpectationKindSchema.safeParse(raw);
    if (parsed.success) return parsed.data;
  }
  return null;
}

/** Row → EvalCase DTO (extracts expectation_kind from input_meta). */
export function toEvalCaseDto(row: typeof t.evalCases.$inferSelect): EvalCase {
  return {
    id: row.id,
    owner_kind: row.ownerKind,
    owner_id: row.ownerId,
    name: row.name,
    input_diff: row.inputDiff ?? '',
    input_files: row.inputFiles ?? null,
    input_meta: row.inputMeta ?? null,
    expectation_kind: expectationKindOf(row.inputMeta),
    expected_output: row.expectedOutput ?? null,
    notes: row.notes ?? null,
  };
}

/** Row → EvalRunRecord DTO. `case_name` filled by the caller when joined. */
export function toEvalRunDto(
  row: typeof t.evalRuns.$inferSelect,
  caseName?: string | null,
): EvalRunRecord {
  return {
    id: row.id,
    case_id: row.caseId,
    case_name: caseName ?? null,
    ran_at: row.ranAt.toISOString(),
    actual_output: row.actualOutput ?? null,
    pass: row.pass ?? null,
    recall: row.recall ?? null,
    precision: row.precision ?? null,
    citation_accuracy: row.citationAccuracy ?? null,
    duration_ms: row.durationMs ?? null,
    cost_usd: row.costUsd ?? null,
    version: row.version ?? null,
  };
}

/** `expected_output` jsonb → ExpectedFinding[] (raw; caller schema-validates). */
export function expectedFindingsOf(expectedOutput: unknown): ExpectedFinding[] {
  return Array.isArray(expectedOutput) ? (expectedOutput as ExpectedFinding[]) : [];
}
