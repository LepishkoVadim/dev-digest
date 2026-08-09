/**
 * blast — pure shaping of the repo-intel facade outputs into the `BlastReport`
 * contract. No I/O here (the route does the DB/facade calls); everything below
 * is deterministic and unit-testable without a database.
 */
import type {
  BlastImpactedEndpoint,
  BlastPriorPr,
  BlastReport,
  BlastReportCaller,
  BlastReportSymbol,
  BlastStatus,
} from '@devdigest/shared';
import type {
  BlastResult,
  ImpactedEndpointsResult,
  IndexState,
} from '../repo-intel/types.js';

/**
 * Callers shown per changed symbol. Mirrors repo-intel's MAX_CALLERS_PER_SYMBOL
 * (kept as a local constant so this module doesn't import another module's
 * internals). The persistent facade path already caps; this re-caps the
 * best-effort/degraded path too, so the contract holds on every path.
 */
export const BLAST_MAX_CALLERS_PER_SYMBOL = 20;

/**
 * Group the flat caller list under each changed symbol, sorted by rank DESC and
 * capped. `viaSymbol` on a caller is the changed symbol's name it reaches. Each
 * symbol also carries the endpoints/crons registered in its caller files
 * (`factsByFile`) — the "what this symbol can reach" the tree view renders.
 */
export function groupCallersBySymbol(
  changedSymbols: BlastResult['changedSymbols'],
  callers: BlastResult['callers'],
  factsByFile: BlastResult['factsByFile'] = {},
  cap: number = BLAST_MAX_CALLERS_PER_SYMBOL,
): BlastReportSymbol[] {
  const byName = new Map<string, BlastResult['callers']>();
  for (const c of callers) {
    const arr = byName.get(c.viaSymbol);
    if (arr) arr.push(c);
    else byName.set(c.viaSymbol, [c]);
  }

  return changedSymbols.map((sym) => {
    const group = [...(byName.get(sym.name) ?? [])].sort((a, b) => b.rank - a.rank);
    const mapped: BlastReportCaller[] = group.slice(0, cap).map((c) => ({
      file: c.file,
      symbol: c.symbol,
      line: c.line,
      rank: c.rank,
      endpoints: factsByFile?.[c.file]?.endpoints ?? [],
      crons: factsByFile?.[c.file]?.crons ?? [],
    }));
    // Endpoints/crons from THIS symbol's caller files (deduped, deterministic).
    const endpoints = new Set<string>();
    const crons = new Set<string>();
    for (const f of new Set(group.map((c) => c.file))) {
      const facts = factsByFile?.[f];
      if (!facts) continue;
      for (const e of facts.endpoints) endpoints.add(e);
      for (const c of facts.crons) crons.add(c);
    }
    return {
      name: sym.name,
      file: sym.file,
      kind: sym.kind,
      callers: mapped,
      endpoints: [...endpoints].sort(),
      crons: [...crons].sort(),
    };
  });
}

/**
 * Derive the report health from the facade signals. NEVER masks missing data:
 * a missing index surfaces as `degraded` with a reason, not as an empty `ok`.
 */
export function deriveStatus(input: {
  blast: BlastResult;
  impacted: ImpactedEndpointsResult;
  indexState: IndexState;
  callerCount: number;
  endpointCount: number;
  changedSymbolCount: number;
}): { status: BlastStatus; reason: string | null } {
  const { blast, impacted, indexState, callerCount, endpointCount, changedSymbolCount } = input;

  // No usable index anywhere → degraded (best-effort or empty answer).
  if (
    blast.degraded ||
    impacted.degraded ||
    indexState.degraded ||
    indexState.status === 'degraded' ||
    indexState.status === 'failed'
  ) {
    const reason =
      blast.reason ?? impacted.reason ?? indexState.degradedReason ?? indexState.reason ?? 'no_data';
    return { status: 'degraded', reason };
  }

  // Index only partially covered the repo — usable but incomplete.
  if (indexState.status === 'partial') {
    return { status: 'partial', reason: 'index_partial' };
  }

  // Index is healthy but this diff resolved to nothing indexable.
  if (changedSymbolCount === 0 && callerCount === 0 && endpointCount === 0) {
    return { status: 'empty', reason: null };
  }

  return { status: 'ok', reason: null };
}

/**
 * Order symbols by IMPORTANCE so the UI can lead with the ones that matter and
 * hide the long tail behind a "see all". Primary signal is the caller count
 * (most-used), then the caller files' rank, then reachable endpoints/crons, then
 * name for a stable tie-break. Symbols with no callers sink to the bottom.
 */
export function compareSymbolImportance(a: BlastReportSymbol, b: BlastReportSymbol): number {
  const maxRank = (s: BlastReportSymbol) => s.callers.reduce((m, c) => Math.max(m, c.rank), 0);
  return (
    b.callers.length - a.callers.length ||
    maxRank(b) - maxRank(a) ||
    b.endpoints.length + b.crons.length - (a.endpoints.length + a.crons.length) ||
    a.name.localeCompare(b.name)
  );
}

/** Compose the full report from the facade outputs (pure). */
export function buildBlastReport(input: {
  changedFiles: string[];
  blast: BlastResult;
  impacted: ImpactedEndpointsResult;
  indexState: IndexState;
  priorPrs?: BlastPriorPr[];
}): BlastReport {
  const { changedFiles, blast, impacted, indexState, priorPrs = [] } = input;

  const symbols = groupCallersBySymbol(blast.changedSymbols, blast.callers, blast.factsByFile).sort(
    compareSymbolImportance,
  );
  const callerCount = symbols.reduce((n, s) => n + s.callers.length, 0);

  const impacted_endpoints: BlastImpactedEndpoint[] = impacted.endpoints.map((e) => ({
    endpoint: e.endpoint,
    via_files: e.viaFiles,
    depth: e.depth,
  }));

  const { status, reason } = deriveStatus({
    blast,
    impacted,
    indexState,
    callerCount,
    endpointCount: impacted_endpoints.length,
    changedSymbolCount: blast.changedSymbols.length,
  });

  return {
    status,
    reason,
    changed_files: changedFiles,
    changed_symbols: blast.changedSymbols.map((s) => ({
      name: s.name,
      file: s.file,
      kind: s.kind,
    })),
    symbols,
    impacted_endpoints,
    prior_prs: priorPrs,
    index: {
      status: indexState.status,
      last_indexed_sha: indexState.lastIndexedSha,
      indexer_version: indexState.indexerVersion,
    },
  };
}
