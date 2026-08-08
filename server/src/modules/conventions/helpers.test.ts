import { describe, it, expect } from 'vitest';
import type { ConventionCandidate } from '@devdigest/shared';
import { verifySnippet, buildSkillBody, conventionsSkillName } from './helpers.js';

const FILE = `import { db } from './db';

export async function getUser(id: string) {
  const user = await db.users.find(id);
  return user;
}`;

describe('verifySnippet — the code-side evidence gate', () => {
  it('returns the 1-based line when the snippet exists verbatim', () => {
    expect(verifySnippet(FILE, 'const user = await db.users.find(id);')).toBe(4);
  });

  it('tolerates leading/trailing whitespace differences from the model', () => {
    expect(verifySnippet(FILE, '   const user = await db.users.find(id);   ')).toBe(4);
  });

  it('matches on a partial (substring) line when no exact line matches', () => {
    expect(verifySnippet(FILE, 'db.users.find')).toBe(4);
  });

  it('drops a hallucinated snippet that is not in the file', () => {
    expect(verifySnippet(FILE, 'const posts = await db.posts.findMany();')).toBeNull();
  });

  it('drops an empty/whitespace-only snippet', () => {
    expect(verifySnippet(FILE, '   \n  ')).toBeNull();
  });
});

describe('buildSkillBody — only the passed (accepted) candidates appear', () => {
  const accepted: ConventionCandidate[] = [
    {
      id: '1',
      rule: 'Use async/await instead of .then() chains',
      evidence_path: 'src/api/users.ts',
      evidence_line: 4,
      evidence_snippet: 'const user = await db.users.find(id);',
      confidence: 0.9,
      accepted: true,
    },
  ];

  it('renders one section per accepted rule, citing path:line', () => {
    const body = buildSkillBody('payments-api', accepted);
    expect(body).toContain('# payments-api-conventions');
    expect(body).toContain('## Use async/await instead of .then() chains');
    expect(body).toContain('src/api/users.ts:4');
    expect(body).toContain('const user = await db.users.find(id);');
  });

  it('never includes a rule that was not passed in (rejected → absent)', () => {
    const body = buildSkillBody('payments-api', accepted);
    // A rejected candidate (never passed in) must not surface in the body.
    expect(body).not.toContain('Redis access goes through');
    expect(body.match(/^## /gm)).toHaveLength(1);
  });

  it('names the skill <repo>-conventions', () => {
    expect(conventionsSkillName('payments-api')).toBe('payments-api-conventions');
  });
});
