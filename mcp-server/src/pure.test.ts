import { describe, it, expect } from 'vitest';
import { matchRepo, matchPull } from './http/resolve.js';
import { toolOk, toolError } from './format.js';
import type { RepoDto, PrMetaDto } from './http/client.js';

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
