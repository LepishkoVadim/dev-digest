/**
 * Smart Diff — deterministic risk ordering for a PR's changed files. Pure: no
 * DB, no GitHub, NO LLM. Combines already-imported files with the findings of
 * the latest review into the `SmartDiff` contract.
 */
import type { SmartDiff, SmartDiffFile, SmartDiffRole } from '@devdigest/shared';
import { BOILERPLATE_PATTERNS, WIRING_PATTERNS, TOO_BIG_TOTAL_LINES } from './smart-diff.constants.js';

export interface SmartDiffFileInput {
  path: string;
  additions: number;
  deletions: number;
}

export interface SmartDiffFindingInput {
  file: string;
  start_line: number;
  end_line: number;
}

/** Groups render in this order — highest review priority first. */
const ROLE_ORDER: SmartDiffRole[] = ['core', 'wiring', 'boilerplate'];

/** Classify one file by path. Boilerplate wins over wiring wins over core. */
export function classifyRole(path: string): SmartDiffRole {
  if (BOILERPLATE_PATTERNS.some((re) => re.test(path))) return 'boilerplate';
  if (WIRING_PATTERNS.some((re) => re.test(path))) return 'wiring';
  return 'core';
}

/** Directory a file lives in (`src/a/b.ts` → `src/a`; root file → `.`). */
function dirOf(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? '.' : path.slice(0, i);
}

/** Union of the 1-based lines each finding covers, per file. */
function findingLinesByFile(findings: SmartDiffFindingInput[]): Map<string, number[]> {
  const sets = new Map<string, Set<number>>();
  for (const f of findings) {
    const set = sets.get(f.file) ?? new Set<number>();
    const start = Math.min(f.start_line, f.end_line);
    const end = Math.max(f.start_line, f.end_line);
    for (let l = start; l <= end; l++) set.add(l);
    sets.set(f.file, set);
  }
  const out = new Map<string, number[]>();
  for (const [file, set] of sets) out.set(file, [...set].sort((a, b) => a - b));
  return out;
}

export function buildSmartDiff(
  files: SmartDiffFileInput[],
  findings: SmartDiffFindingInput[],
): SmartDiff {
  const linesByFile = findingLinesByFile(findings);

  const byRole = new Map<SmartDiffRole, SmartDiffFile[]>();
  for (const file of files) {
    const role = classifyRole(file.path);
    const list = byRole.get(role) ?? [];
    list.push({
      path: file.path,
      additions: file.additions,
      deletions: file.deletions,
      finding_lines: linesByFile.get(file.path) ?? [],
      // No LLM in this path — a code summary would need one. Left null.
      pseudocode_summary: null,
    });
    byRole.set(role, list);
  }

  const groups = ROLE_ORDER.filter((role) => byRole.has(role)).map((role) => ({
    role,
    files: byRole.get(role)!,
  }));

  // Split suggestion: total counts every changed line; grouping ignores
  // boilerplate (splitting off a lock file helps nobody) and buckets by dir.
  const total_lines = files.reduce((n, f) => n + f.additions + f.deletions, 0);
  const byDir = new Map<string, string[]>();
  for (const file of files) {
    if (classifyRole(file.path) === 'boilerplate') continue;
    const dir = dirOf(file.path);
    (byDir.get(dir) ?? byDir.set(dir, []).get(dir)!).push(file.path);
  }
  const too_big = total_lines > TOO_BIG_TOTAL_LINES && byDir.size > 1;
  const proposed_splits = too_big
    ? [...byDir.entries()].map(([name, paths]) => ({ name, files: paths }))
    : [];

  return { groups, split_suggestion: { too_big, total_lines, proposed_splits } };
}
