import { describe, it, expect } from 'vitest';
import {
  buildBlastReport,
  groupCallersBySymbol,
  deriveStatus,
  compareSymbolImportance,
} from './service.js';
import type { BlastResult, ImpactedEndpointsResult, IndexState } from '../repo-intel/types.js';

const CHANGED = [{ file: 'src/util/format.ts', name: 'formatDate', kind: 'function' }];

function caller(file: string, rank: number, viaSymbol = 'formatDate') {
  return { file, symbol: `enclosing_${file}`, viaSymbol, line: 1, rank };
}

const healthyIndex: IndexState = {
  repoId: 'r1',
  status: 'full',
  filesIndexed: 10,
  filesSkipped: 0,
  durationMs: 5,
  lastIndexedSha: 'sha1',
  indexerVersion: 2,
  updatedAt: new Date(0),
};

describe('groupCallersBySymbol', () => {
  it('groups callers under their changed symbol, sorted by rank desc, capped', () => {
    const callers = [caller('a.ts', 0.1), caller('b.ts', 0.9), caller('c.ts', 0.5)];
    const [group] = groupCallersBySymbol(CHANGED, callers, {}, 2);
    expect(group!.name).toBe('formatDate');
    expect(group!.callers.map((c) => c.file)).toEqual(['b.ts', 'c.ts']); // top-2 by rank
  });

  it('ignores callers that reach a symbol not in the changed set', () => {
    const callers = [caller('a.ts', 0.5, 'somethingElse')];
    const [group] = groupCallersBySymbol(CHANGED, callers);
    expect(group!.callers).toHaveLength(0);
  });

  it('attaches endpoints/crons from the symbol\'s caller files (deduped, sorted)', () => {
    const callers = [caller('src/api/users.ts', 0.9), caller('src/api/orders.ts', 0.5)];
    const factsByFile = {
      'src/api/users.ts': { endpoints: ['GET /users'], crons: [] },
      'src/api/orders.ts': { endpoints: ['POST /orders'], crons: ['job:reindex'] },
    };
    const [group] = groupCallersBySymbol(CHANGED, callers, factsByFile);
    expect(group!.endpoints).toEqual(['GET /users', 'POST /orders']);
    expect(group!.crons).toEqual(['job:reindex']);
  });
});

describe('compareSymbolImportance', () => {
  const sym = (name: string, callers: number, endpoints = 0) => ({
    name,
    file: `${name}.ts`,
    kind: 'function',
    callers: Array.from({ length: callers }, () => ({
      file: 'x.ts',
      symbol: 'x',
      line: 1,
      rank: 0.5,
      endpoints: [],
      crons: [],
    })),
    endpoints: Array.from({ length: endpoints }, (_v, i) => `GET /${name}/${i}`),
    crons: [],
  });

  it('orders most-used symbols first and sinks zero-caller symbols', () => {
    const ordered = [sym('a', 0), sym('b', 5), sym('c', 2)].sort(compareSymbolImportance);
    expect(ordered.map((s) => s.name)).toEqual(['b', 'c', 'a']);
  });
});

describe('deriveStatus', () => {
  const base = { callerCount: 2, endpointCount: 1, changedSymbolCount: 1 };
  const okBlast: BlastResult = { changedSymbols: [], callers: [], impactedEndpoints: [] };
  const okImpacted: ImpactedEndpointsResult = { endpoints: [] };

  it('is degraded when the blast result is degraded', () => {
    const r = deriveStatus({
      ...base,
      blast: { ...okBlast, degraded: true, reason: 'no_data' },
      impacted: okImpacted,
      indexState: healthyIndex,
    });
    expect(r).toEqual({ status: 'degraded', reason: 'no_data' });
  });

  it('is degraded when the index failed', () => {
    const r = deriveStatus({
      ...base,
      blast: okBlast,
      impacted: okImpacted,
      indexState: { ...healthyIndex, status: 'failed' },
    });
    expect(r.status).toBe('degraded');
  });

  it('is partial when the index is partial (and otherwise healthy)', () => {
    const r = deriveStatus({
      ...base,
      blast: okBlast,
      impacted: okImpacted,
      indexState: { ...healthyIndex, status: 'partial' },
    });
    expect(r).toEqual({ status: 'partial', reason: 'index_partial' });
  });

  it('is empty when nothing resolved on a healthy index', () => {
    const r = deriveStatus({
      callerCount: 0,
      endpointCount: 0,
      changedSymbolCount: 0,
      blast: okBlast,
      impacted: okImpacted,
      indexState: healthyIndex,
    });
    expect(r).toEqual({ status: 'empty', reason: null });
  });

  it('is ok when data resolved on a healthy index', () => {
    const r = deriveStatus({
      ...base,
      blast: okBlast,
      impacted: okImpacted,
      indexState: healthyIndex,
    });
    expect(r).toEqual({ status: 'ok', reason: null });
  });
});

describe('buildBlastReport', () => {
  it('composes the report and maps endpoint fields to snake_case', () => {
    const blast: BlastResult = {
      changedSymbols: CHANGED,
      callers: [caller('src/api/users.ts', 0.9), caller('src/api/orders.ts', 0.5)],
      impactedEndpoints: ['GET /users'],
    };
    const impacted: ImpactedEndpointsResult = {
      endpoints: [{ endpoint: 'GET /users', viaFiles: ['src/api/users.ts'], depth: 1 }],
    };
    const report = buildBlastReport({
      changedFiles: ['src/util/format.ts'],
      blast,
      impacted,
      indexState: healthyIndex,
    });

    expect(report.status).toBe('ok');
    expect(report.changed_symbols).toEqual(CHANGED);
    expect(report.symbols[0]!.callers).toHaveLength(2);
    expect(report.impacted_endpoints[0]).toEqual({
      endpoint: 'GET /users',
      via_files: ['src/api/users.ts'],
      depth: 1,
    });
    expect(report.index).toEqual({
      status: 'full',
      last_indexed_sha: 'sha1',
      indexer_version: 2,
    });
  });
});
