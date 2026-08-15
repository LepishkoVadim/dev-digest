import { describe, it, expect } from 'vitest';
import { matchRepo, matchPull } from './http/resolve.js';
import { toolOk, toolError } from './format.js';
import { summarizeBlast } from './tools/get-blast-radius.js';
import { buildFindingsResponse } from './tools/get-findings.js';
import { loadConfig } from './config.js';
import type { RepoDto, PrMetaDto, BlastReportDto, ReviewDto } from './http/client.js';

const repos: RepoDto[] = [
  { id: 'r1', owner: 'acme', name: 'api', full_name: 'acme/api' },
  { id: 'r2', owner: 'other', name: 'api', full_name: 'other/api' },
  { id: 'r3', owner: 'acme', name: 'web', full_name: 'acme/web' },
];

describe('matchRepo', () => {
  it('matches a unique full_name case-insensitively', () => {
    const res = matchRepo(repos, 'ACME/web');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.id).toBe('r3');
  });

  it('returns not_found with available list when nothing matches', () => {
    const res = matchRepo(repos, 'ghost');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe('not_found');
      expect(res.recovery).toContain('acme/api');
    }
  });

  it('returns ambiguous when a bare name matches multiple repos', () => {
    const res = matchRepo(repos, 'api');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe('ambiguous');
      expect(res.recovery).toContain('acme/api');
      expect(res.recovery).toContain('other/api');
    }
  });
});

describe('matchPull', () => {
  const pulls: PrMetaDto[] = [
    { id: 'p1', number: 42, status: 'open' },
    { id: 'p2', number: 7, status: 'merged' },
  ];
  it('finds a PR by number', () => {
    const res = matchPull(pulls, 42);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.id).toBe('p1');
  });
  it('not_found lists known numbers', () => {
    const res = matchPull(pulls, 999);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.recovery).toContain('42');
  });
});

describe('summarizeBlast', () => {
  const report: BlastReportDto = {
    status: 'ok',
    reason: null,
    changed_files: ['src/util/format.ts'],
    changed_symbols: [{ name: 'formatDate', file: 'src/util/format.ts', kind: 'function' }],
    symbols: [
      {
        name: 'formatDate',
        file: 'src/util/format.ts',
        kind: 'function',
        callers: [
          { file: 'src/api/users.ts', symbol: 'listUsers', line: 12, rank: 0.9, endpoints: ['GET /users'], crons: [] },
        ],
        endpoints: ['GET /users'],
        crons: [],
      },
    ],
    impacted_endpoints: [{ endpoint: 'GET /users', via_files: ['src/api/users.ts'], depth: 1 }],
    prior_prs: [
      {
        number: 800,
        title: 'Earlier refactor',
        status: 'merged',
        author: 'dev',
        date: '2026-01-01T00:00:00.000Z',
        note: 'Touched the same helper',
        files_overlap: ['src/util/format.ts'],
      },
    ],
    index: { status: 'full', last_indexed_sha: 'sha1', indexer_version: 2 },
  };

  it('collapses callers to file:line and preserves status, endpoints + prior PRs', () => {
    const s = summarizeBlast(report);
    expect(s.status).toBe('ok');
    expect(s.changed_files).toBe(1);
    expect(s.changed_symbols[0]!.callers[0]!.location).toBe('src/api/users.ts:12');
    expect(s.changed_symbols[0]!.endpoints).toEqual(['GET /users']);
    expect(s.impacted_endpoints[0]).toEqual({
      endpoint: 'GET /users',
      via: ['src/api/users.ts'],
      depth: 1,
    });
    expect(s.prior_prs[0]).toEqual({
      pr: '#800',
      title: 'Earlier refactor',
      author: 'dev',
      shared_files: 1,
    });
  });
});

describe('loadConfig', () => {
  it('throws on a set-but-invalid numeric env (fail fast, no silent fallback)', () => {
    const prev = process.env.DEVDIGEST_POLL_BUDGET_MS;
    process.env.DEVDIGEST_POLL_BUDGET_MS = 'abc';
    expect(() => loadConfig()).toThrow(/positive number/);
    if (prev === undefined) delete process.env.DEVDIGEST_POLL_BUDGET_MS;
    else process.env.DEVDIGEST_POLL_BUDGET_MS = prev;
  });
});

describe('buildFindingsResponse', () => {
  const reviews: ReviewDto[] = [
    {
      run_id: 'r1',
      agent_name: 'General',
      verdict: 'request_changes',
      score: 61,
      findings: [
        { severity: 'CRITICAL', title: 'x', file: 'a.ts', start_line: 1, end_line: 1, rationale: 'r' },
      ],
    },
    { run_id: 'r2', agent_name: 'Security', verdict: 'approve', score: 90, findings: [] },
  ];

  it('all_runs returns every review with total_findings', () => {
    const b = buildFindingsResponse(reviews, { allRuns: true, detailed: false, offset: 0, limit: 50 });
    expect(b?.reviews).toHaveLength(2);
    expect(b?.total_findings).toBe(1);
  });

  it('default returns just the matched/latest review (still an array)', () => {
    const b = buildFindingsResponse(reviews, { allRuns: false, detailed: false, offset: 0, limit: 50 });
    expect(b?.reviews).toHaveLength(1);
    expect(b?.reviews[0]!.run_id).toBe('r1');
  });

  it('run_id selects a specific run', () => {
    const b = buildFindingsResponse(reviews, { runId: 'r2', allRuns: false, detailed: false, offset: 0, limit: 50 });
    expect(b?.reviews[0]!.run_id).toBe('r2');
  });
});

describe('format (dual content)', () => {
  it('toolOk returns structuredContent AND a JSON text block', () => {
    const r = toolOk({ hello: 'world' });
    expect(r.structuredContent).toEqual({ hello: 'world' });
    expect(r.content[0]!.type).toBe('text');
    expect(JSON.parse(r.content[0]!.text)).toEqual({ hello: 'world' });
    expect(r.isError).toBeUndefined();
  });

  it('toolError sets isError and includes recovery in text + structuredContent', () => {
    const r = toolError('boom', { recovery: 'try again' });
    expect(r.isError).toBe(true);
    expect(r.content[0]!.text).toContain('boom');
    expect(r.content[0]!.text).toContain('try again');
    expect(r.structuredContent).toEqual({ error: 'boom', recovery: 'try again' });
  });
});
