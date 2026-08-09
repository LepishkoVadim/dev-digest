/* Per-line severity mapping for Smart Diff. A review finding spans
   [startLine, endLine] on the new side of the diff and carries a severity;
   these helpers fold a file's findings into "which severity tints each line"
   and "which line shows the label", so a line covered by two findings takes the
   most severe one. Distinct from finding_lines (a plain number[]): findings are
   counted individually and keep their type. */
import type { Severity } from "@devdigest/shared";

export type { Severity };

export interface DiffFinding {
  /** Persisted finding id — used to deep-link to its FindingCard. */
  id: string;
  startLine: number;
  endLine: number;
  severity: Severity;
}

const RANK: Record<Severity, number> = { CRITICAL: 3, WARNING: 2, SUGGESTION: 1 };

function moreSevere(a: Severity, b: Severity): Severity {
  return RANK[a] >= RANK[b] ? a : b;
}

/** New-side line number → highest-severity finding covering it (for row tint). */
export function severityByLine(findings: DiffFinding[]): Map<number, Severity> {
  const m = new Map<number, Severity>();
  for (const f of findings) {
    const lo = Math.min(f.startLine, f.endLine);
    const hi = Math.max(f.startLine, f.endLine);
    for (let l = lo; l <= hi; l++) {
      const cur = m.get(l);
      m.set(l, cur ? moreSevere(cur, f.severity) : f.severity);
    }
  }
  return m;
}

/** New-side start line → the finding whose label sits there (highest severity
    wins when several start on the same line). Carries the id so the label can
    deep-link to its FindingCard. */
export function labelByLine(findings: DiffFinding[]): Map<number, DiffFinding> {
  const m = new Map<number, DiffFinding>();
  for (const f of findings) {
    const l = Math.min(f.startLine, f.endLine);
    const cur = m.get(l);
    m.set(l, cur ? (moreSevere(cur.severity, f.severity) === cur.severity ? cur : f) : f);
  }
  return m;
}

/** The most severe finding in the set — colours the file's header badge. */
export function topSeverity(findings: DiffFinding[]): Severity | null {
  return findings.reduce<Severity | null>(
    (acc, f) => (acc ? moreSevere(acc, f.severity) : f.severity),
    null,
  );
}
