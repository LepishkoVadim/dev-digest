/* line-diff.ts — a minimal LCS line diff for the Compare modal's prompt/skill
   diff (AC-17). Produces unified-style `+`/`-`/` ` lines; identical texts yield
   an empty diff (so a same-version compare shows no config change, AC-24). */

export interface DiffLine {
  sign: " " | "+" | "-";
  text: string;
}

/** Longest-common-subsequence line diff of `oldText` vs `newText`. */
export function lineDiff(oldText: string, newText: string): DiffLine[] {
  if (oldText === newText) return [];
  const a = oldText.split("\n");
  const b = newText.split("\n");
  const n = a.length;
  const m = b.length;

  // LCS length table.
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ sign: " ", text: a[i]! });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      out.push({ sign: "-", text: a[i]! });
      i++;
    } else {
      out.push({ sign: "+", text: b[j]! });
      j++;
    }
  }
  while (i < n) out.push({ sign: "-", text: a[i++]! });
  while (j < m) out.push({ sign: "+", text: b[j++]! });
  return out;
}
