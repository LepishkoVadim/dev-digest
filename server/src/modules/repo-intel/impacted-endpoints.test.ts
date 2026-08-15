import { describe, it, expect } from 'vitest';
import { reverseReachable, mergeImpactedEndpoints } from './service.js';
import type { IndexerEdgeRow, IndexerFileFactsRow } from './repository.js';

/**
 * The reverse-import traversal is the heart of the "what depends on this?" map.
 * These tests pin the DIRECTION (dependents, never dependencies) and the depth
 * bound — the two things the homework's acceptance criteria call out explicitly.
 */
describe('reverseReachable', () => {
  // helper ← users ← index   (users imports helper; index imports users)
  // helper → base            (helper imports base — a DEPENDENCY, not dependent)
  const edges: IndexerEdgeRow[] = [
    { fromFile: 'src/api/users.ts', toFile: 'src/util/format.ts' },
    { fromFile: 'src/api/orders.ts', toFile: 'src/util/format.ts' },
    { fromFile: 'src/api/index.ts', toFile: 'src/api/users.ts' },
    { fromFile: 'src/util/format.ts', toFile: 'src/util/base.ts' },
  ];

  it('walks toward dependents and records the shallowest depth', () => {
    const reached = reverseReachable(edges, ['src/util/format.ts'], 2);
    expect(reached.get('src/util/format.ts')).toBe(0); // the change itself
    expect(reached.get('src/api/users.ts')).toBe(1);
    expect(reached.get('src/api/orders.ts')).toBe(1);
    expect(reached.get('src/api/index.ts')).toBe(2); // transitive dependent
  });

  it('never follows the changed file\'s own imports (direction check)', () => {
    const reached = reverseReachable(edges, ['src/util/format.ts'], 2);
    expect(reached.has('src/util/base.ts')).toBe(false);
  });

  it('respects the depth bound', () => {
    const reached = reverseReachable(edges, ['src/util/format.ts'], 1);
    expect(reached.has('src/api/users.ts')).toBe(true);
    expect(reached.has('src/api/index.ts')).toBe(false); // depth 2 > bound
  });
});

describe('mergeImpactedEndpoints', () => {
  it('dedupes by endpoint, merges via-files, keeps min depth, sorts by depth', () => {
    const depthByFile = new Map<string, number>([
      ['src/api/users.ts', 1],
      ['src/api/orders.ts', 1],
      ['src/api/index.ts', 2],
    ]);
    const facts: IndexerFileFactsRow[] = [
      { filePath: 'src/api/index.ts', endpoints: ['GET /users'], crons: [] }, // same ep, deeper
      { filePath: 'src/api/users.ts', endpoints: ['GET /users'], crons: [] },
      { filePath: 'src/api/orders.ts', endpoints: ['POST /orders'], crons: [] },
    ];
    const merged = mergeImpactedEndpoints(facts, depthByFile);

    const users = merged.find((e) => e.endpoint === 'GET /users')!;
    expect(users.depth).toBe(1); // min of {1,2}
    expect(users.viaFiles.sort()).toEqual(['src/api/index.ts', 'src/api/users.ts']);
    // Sorted by depth asc: depth-1 endpoints precede any deeper one.
    expect(merged[0]!.depth).toBe(1);
  });
});
