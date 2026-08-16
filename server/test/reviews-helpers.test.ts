import { describe, it, expect } from 'vitest';
import { taskLine, resolveDocPaths } from '../src/modules/reviews/helpers.js';

describe('resolveDocPaths (AC-11)', () => {
  const skill = (docPaths: string[] | null) => ({ skill: { docPaths } });

  it('agent docs first, then linked-skill docs in link order', () => {
    expect(
      resolveDocPaths(['specs/a.md'], [skill(['docs/b.md']), skill(['insights/c.md'])]),
    ).toEqual(['specs/a.md', 'docs/b.md', 'insights/c.md']);
  });

  it('dedups keep-first — agent order wins over a skill duplicate', () => {
    expect(resolveDocPaths(['specs/a.md'], [skill(['specs/a.md', 'docs/b.md'])])).toEqual([
      'specs/a.md',
      'docs/b.md',
    ]);
  });

  it('tolerates null/empty doc lists', () => {
    expect(resolveDocPaths(null, [skill(null)])).toEqual([]);
    expect(resolveDocPaths([], [])).toEqual([]);
  });
});

/**
 * Unit coverage for the review task-line. The key invariant: our trusted
 * instruction always tells the model to review the whole diff and never
 * withhold a security/correctness finding — no matter what the PR text claims.
 */

describe('taskLine', () => {
  const pull = { number: 3, title: 'test: vulnerable fixture', author: 'burnjohn' } as never;

  it('names the PR being reviewed', () => {
    const line = taskLine(pull);
    expect(line).toContain('#3');
    expect(line).toContain('test: vulnerable fixture');
  });

  it('keeps the non-negotiable "never withhold security" rule', () => {
    const line = taskLine(pull);
    expect(line).toMatch(/never .*withhold .*(or downgrade )?.*security/i);
    expect(line).toMatch(/review the entire diff/i);
  });
});
