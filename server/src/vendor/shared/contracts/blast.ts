import { z } from 'zod';

/**
 * Blast Radius — the DETERMINISTIC, index-only map of a PR's potential impact.
 *
 * This is the contract behind `GET /pulls/:id/blast` and the studio's Blast tab.
 * It is INTENTIONALLY separate from `BlastRadius` in `contracts/brief.ts`, which
 * is the *LLM-composed* brief section (`downstream`/`summary`). This one is built
 * purely from the repo-intel index (symbols / references / file_edges /
 * file_facts / file_rank) — no model call, no clone re-parse.
 *
 * The names are prefixed `Blast*Report*` to avoid clashing with the brief
 * contract's `ChangedSymbol` / `BlastCaller` — both files are re-exported from
 * the same `@devdigest/shared` barrel.
 */

/**
 * Report-level health, derived in code (never masked):
 *  - `ok`       — a usable index answered the request.
 *  - `partial`  — the index exists but only covered part of the repo.
 *  - `degraded` — no usable index (flag off / not built / index failed); the
 *                 answer is best-effort or empty, and the UI must say so.
 *  - `empty`    — index is fine, but this diff has no indexed symbols/callers.
 */
export const BlastStatus = z.enum(['ok', 'partial', 'degraded', 'empty']);
export type BlastStatus = z.infer<typeof BlastStatus>;

/** One caller of a changed symbol (a reference site in a dependent file). */
export const BlastReportCaller = z.object({
  file: z.string(),
  /** Enclosing top-level symbol at the call site (best-effort label). */
  symbol: z.string(),
  /** 1-based line of the reference (for the file:line deep-link). */
  line: z.number().int(),
  /** file_rank.rank of the caller file (0 on the degraded path); sort key. */
  rank: z.number(),
  /** Endpoints registered in THIS caller's file (for the graph edges). */
  endpoints: z.array(z.string()),
  /** Crons/jobs in THIS caller's file (for the graph edges). */
  crons: z.array(z.string()),
});
export type BlastReportCaller = z.infer<typeof BlastReportCaller>;

/** A symbol declared in a changed file, with its cross-file callers + reachable facts. */
export const BlastReportSymbol = z.object({
  name: z.string(),
  file: z.string(),
  kind: z.string(),
  /** Callers, sorted by rank desc, capped per symbol (see MAX_CALLERS_PER_SYMBOL). */
  callers: z.array(BlastReportCaller),
  /** "METHOD /path" endpoints registered in this symbol's caller files. */
  endpoints: z.array(z.string()),
  /** Cron/job identifiers in this symbol's caller files. */
  crons: z.array(z.string()),
});
export type BlastReportSymbol = z.infer<typeof BlastReportSymbol>;

/** A previously-merged/closed PR that touched some of the same files. */
export const BlastPriorPr = z.object({
  number: z.number().int(),
  title: z.string(),
  status: z.string(),
  author: z.string(),
  /** ISO timestamp the PR was last updated/merged; null if unknown. */
  date: z.string().nullable(),
  /** Short context line (first line of the PR body); null if none. */
  note: z.string().nullable(),
  files_overlap: z.array(z.string()),
});
export type BlastPriorPr = z.infer<typeof BlastPriorPr>;

/** An HTTP endpoint that may be affected, reached via the reverse import graph. */
export const BlastImpactedEndpoint = z.object({
  /** "METHOD /path" (from file_facts / extractEndpoints). */
  endpoint: z.string(),
  /** The dependent file(s) that register/own the endpoint. */
  via_files: z.array(z.string()),
  /** Reverse-import distance from a changed file (0 = changed file itself). */
  depth: z.number().int(),
});
export type BlastImpactedEndpoint = z.infer<typeof BlastImpactedEndpoint>;

/** Plain changed-symbol row (declared in a changed file). */
export const BlastReportChangedSymbol = z.object({
  name: z.string(),
  file: z.string(),
  kind: z.string(),
});
export type BlastReportChangedSymbol = z.infer<typeof BlastReportChangedSymbol>;

/** Index provenance, so the UI can show what the map was built from. */
export const BlastIndexInfo = z.object({
  status: z.string(),
  last_indexed_sha: z.string(),
  indexer_version: z.number().int(),
});
export type BlastIndexInfo = z.infer<typeof BlastIndexInfo>;

/** The full Blast Radius report for one PR. */
export const BlastReport = z.object({
  status: BlastStatus,
  /** Human/machine reason when not `ok` (e.g. "no_data", "flag_off"); else null. */
  reason: z.string().nullable(),
  changed_files: z.array(z.string()),
  changed_symbols: z.array(BlastReportChangedSymbol),
  /** Changed symbols grouped with their callers (the tree the UI renders). */
  symbols: z.array(BlastReportSymbol),
  /** Endpoints reachable from the changed files via the 2-level reverse graph. */
  impacted_endpoints: z.array(BlastImpactedEndpoint),
  /** Prior PRs that touched the same files (history footer). */
  prior_prs: z.array(BlastPriorPr),
  index: BlastIndexInfo,
});
export type BlastReport = z.infer<typeof BlastReport>;
