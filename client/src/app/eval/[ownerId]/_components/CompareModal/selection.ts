import type { EvalRunRecord } from "@devdigest/shared";

/**
 * "Compare selected" is enabled ONLY for exactly two runs of the same owner
 * (AC-22, NFR-6). The dashboard is single-owner, so the same-owner constraint is
 * enforced by construction; we still guard the count and reject a cross-owner
 * pair defensively (any run whose owner differs from the rest).
 */
export function canCompare(
  selected: EvalRunRecord[],
  runByCaseOwner?: (r: EvalRunRecord) => string,
): boolean {
  if (selected.length !== 2) return false;
  if (runByCaseOwner) {
    const [a, b] = selected;
    if (runByCaseOwner(a!) !== runByCaseOwner(b!)) return false;
  }
  return true;
}
