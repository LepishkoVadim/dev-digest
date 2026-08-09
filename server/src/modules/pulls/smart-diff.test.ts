import { describe, it, expect } from 'vitest';
import { classifyRole, buildSmartDiff } from './smart-diff.js';

describe('classifyRole', () => {
  it('classifies lock files and generated output as boilerplate', () => {
    expect(classifyRole('pnpm-lock.yaml')).toBe('boilerplate');
    expect(classifyRole('server/package-lock.json')).toBe('boilerplate');
    expect(classifyRole('package.json')).toBe('boilerplate');
    expect(classifyRole('dist/bundle.js')).toBe('boilerplate');
    expect(classifyRole('src/__snapshots__/x.snap')).toBe('boilerplate');
    expect(classifyRole('web/app.min.js')).toBe('boilerplate');
  });

  it('classifies config and entry/glue files as wiring', () => {
    expect(classifyRole('src/server.ts')).toBe('wiring');
    expect(classifyRole('src/config.ts')).toBe('wiring');
    expect(classifyRole('src/api/public/index.ts')).toBe('wiring');
    expect(classifyRole('next.config.mjs')).toBe('wiring');
    expect(classifyRole('tsconfig.json')).toBe('wiring');
    expect(classifyRole('.github/workflows/ci.yml')).toBe('wiring');
  });

  it('classifies real business logic as core', () => {
    expect(classifyRole('src/middleware/ratelimit.ts')).toBe('core');
    expect(classifyRole('src/api/users.ts')).toBe('core');
  });
});

describe('buildSmartDiff', () => {
  const files = [
    { path: 'src/middleware/ratelimit.ts', additions: 84, deletions: 0 },
    { path: 'src/config.ts', additions: 4, deletions: 0 },
    { path: 'package-lock.json', additions: 92, deletions: 24 },
  ];

  it('orders groups core → wiring → boilerplate and drops empty groups', () => {
    const sd = buildSmartDiff(files, []);
    expect(sd.groups.map((g) => g.role)).toEqual(['core', 'wiring', 'boilerplate']);
    expect(sd.groups[0]!.files[0]!.path).toBe('src/middleware/ratelimit.ts');
  });

  it('expands finding start..end into sorted unique finding_lines on the right file', () => {
    const sd = buildSmartDiff(files, [
      { file: 'src/middleware/ratelimit.ts', start_line: 52, end_line: 53 },
      { file: 'src/middleware/ratelimit.ts', start_line: 28, end_line: 28 },
      { file: 'src/config.ts', start_line: 12, end_line: 12 },
    ]);
    const core = sd.groups.find((g) => g.role === 'core')!.files[0]!;
    expect(core.finding_lines).toEqual([28, 52, 53]);
    const wiring = sd.groups.find((g) => g.role === 'wiring')!.files[0]!;
    expect(wiring.finding_lines).toEqual([12]);
    // lock file has no findings
    expect(sd.groups.find((g) => g.role === 'boilerplate')!.files[0]!.finding_lines).toEqual([]);
  });

  it('flags too_big only when large AND multi-directory, excluding boilerplate from splits', () => {
    const big = [
      { path: 'src/a/one.ts', additions: 300, deletions: 0 },
      { path: 'src/b/two.ts', additions: 300, deletions: 0 },
      { path: 'pnpm-lock.yaml', additions: 999, deletions: 0 },
    ];
    const sd = buildSmartDiff(big, []);
    expect(sd.split_suggestion.too_big).toBe(true);
    expect(sd.split_suggestion.total_lines).toBe(1599);
    expect(sd.split_suggestion.proposed_splits.map((s) => s.name).sort()).toEqual(['src/a', 'src/b']);
    // a large PR confined to one directory is not worth splitting
    const oneDir = buildSmartDiff(
      [{ path: 'src/a/one.ts', additions: 600, deletions: 0 }],
      [],
    );
    expect(oneDir.split_suggestion.too_big).toBe(false);
  });
});
