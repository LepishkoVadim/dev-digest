/**
 * Intent classifier — pure helpers. Hermetic (no DB, no LLM, no network).
 *
 * The load-bearing test here is the FIRST one: the classifier must never see a
 * diff body. If `hunkHeaderDigest` ever starts emitting content lines, the whole
 * "metadata-only" guarantee is gone and this test is what catches it.
 */
import { describe, it, expect } from 'vitest';
import type { IntentSource, UnifiedDiff } from '@devdigest/shared';
import {
  MAX_DIGEST_FILES,
  buildIntentMessages,
  deriveConfidence,
  extractDocRefs,
  hunkHeaderDigest,
} from './intent.js';

/** A diff whose raw text and hunks carry very recognisable "secret" content. */
function diffWithSecrets(fileCount = 2): UnifiedDiff {
  return {
    raw: [
      'diff --git a/src/auth.ts b/src/auth.ts',
      '@@ -10,3 +10,4 @@',
      '-const OLD_TOKEN = "REMOVED_SECRET";',
      '+const API_KEY = "SUPER_SECRET_VALUE";',
      ' unchanged line of code',
    ].join('\n'),
    files: Array.from({ length: fileCount }, (_, i) => ({
      path: `src/file${i}.ts`,
      additions: 4 + i,
      deletions: 1,
      hunks: [
        {
          file: `src/file${i}.ts`,
          oldStart: 10,
          oldLines: 3,
          newStart: 10,
          newLines: 4,
          newLineNumbers: [10, 11, 12, 13],
        },
      ],
    })),
  };
}

describe('hunkHeaderDigest — the metadata-only boundary', () => {
  it('emits paths and @@ headers ONLY — never diff content', () => {
    const digest = hunkHeaderDigest(diffWithSecrets());

    // What it MUST contain: positions.
    expect(digest).toContain('src/file0.ts (+4/-1)');
    expect(digest).toContain('@@ -10,3 +10,4 @@');

    // What it must NEVER contain: anything from the diff body.
    expect(digest).not.toContain('SUPER_SECRET_VALUE');
    expect(digest).not.toContain('REMOVED_SECRET');
    expect(digest).not.toContain('unchanged line of code');
    expect(digest).not.toContain('API_KEY');

    // Structural guarantee: no line is an added/removed diff line. Every line is
    // either a file header or an `@@` hunk header (or a `…` cap marker).
    for (const line of digest.split('\n')) {
      expect(line.trimStart().startsWith('+')).toBe(false);
      expect(line.trimStart().startsWith('-')).toBe(false);
    }
  });

  it('caps huge PRs with an explicit "… (N more files)" marker', () => {
    const digest = hunkHeaderDigest(diffWithSecrets(MAX_DIGEST_FILES + 5));
    expect(digest).toContain('… (5 more files)');
    // Only the capped set is rendered.
    expect(digest).not.toContain(`src/file${MAX_DIGEST_FILES}.ts`);
  });

  it('renders nothing for an empty diff', () => {
    expect(hunkHeaderDigest({ raw: '', files: [] })).toBe('');
  });
});

describe('deriveConfidence — code-side, never model-reported', () => {
  const used = (kind: IntentSource['kind']): IntentSource => ({ kind, ref: 'r', status: 'used' });

  it('returns low whenever ANY source is unavailable, even with a full body+issue', () => {
    const sources: IntentSource[] = [
      used('pr_title'),
      used('pr_body'),
      used('linked_issue'),
      { kind: 'plan_doc', ref: 'docs/plan.md', status: 'unavailable' },
    ];
    expect(deriveConfidence(sources)).toBe('low');
  });

  it('returns low when the PR body is empty (title + files only)', () => {
    expect(
      deriveConfidence([used('pr_title'), { kind: 'pr_body', ref: '#1', status: 'empty' }, used('file_list')]),
    ).toBe('low');
  });

  it('returns medium with a body but no external doc, high with both', () => {
    expect(deriveConfidence([used('pr_title'), used('pr_body')])).toBe('medium');
    expect(deriveConfidence([used('pr_body'), used('linked_issue')])).toBe('high');
    expect(deriveConfidence([used('pr_body'), used('plan_doc')])).toBe('high');
  });

  it('never returns high for any input containing an unavailable source', () => {
    const kinds: IntentSource['kind'][] = ['linked_issue', 'plan_doc', 'file_list', 'hunk_headers'];
    for (const kind of kinds) {
      const sources: IntentSource[] = [
        used('pr_body'),
        used('linked_issue'),
        { kind, ref: 'x', status: 'unavailable' },
      ];
      expect(deriveConfidence(sources)).not.toBe('high');
    }
  });
});

describe('extractDocRefs — paths are read, links are marked, nothing is fetched', () => {
  it('marks an external http(s) link unavailable and records host+path only', () => {
    const refs = extractDocRefs('Design: https://notion.so/team/the-plan see there');
    const external = refs.find((r) => r.status === 'unavailable');
    expect(external).toBeDefined();
    expect(external!.kind).toBe('plan_doc');
    expect(external!.ref).toContain('notion.so');
    // A label, not content — and short enough to log safely.
    expect(external!.ref.length).toBeLessThanOrEqual(120);
  });

  it('picks up repo-relative plan/spec paths as readable candidates', () => {
    const refs = extractDocRefs('Implements docs/intent-plan.md and specs/api/v2.md');
    const paths = refs.filter((r) => r.status === 'used').map((r) => r.ref);
    expect(paths).toContain('docs/intent-plan.md');
    expect(paths).toContain('specs/api/v2.md');
  });

  it('does NOT treat a .md path inside a URL as a readable local path', () => {
    const refs = extractDocRefs('See https://github.com/o/r/blob/main/docs/plan.md');
    expect(refs.filter((r) => r.status === 'used')).toHaveLength(0);
    expect(refs.some((r) => r.status === 'unavailable')).toBe(true);
  });

  it('returns nothing for a body with no refs', () => {
    expect(extractDocRefs('Just a plain description.')).toHaveLength(0);
  });
});

describe('buildIntentMessages — every untrusted part is wrapped', () => {
  const sources: IntentSource[] = [
    { kind: 'pr_title', ref: '#7', status: 'used' },
    { kind: 'pr_body', ref: '#7', status: 'used' },
    { kind: 'linked_issue', ref: '#42', status: 'unavailable' },
  ];

  it('wraps title, body, issue, plan doc and file digest in <untrusted> blocks', () => {
    const [system, user] = buildIntentMessages({
      title: 'TITLE-TEXT',
      body: 'BODY-TEXT',
      linkedIssue: { ref: '#42', text: 'ISSUE-TEXT' },
      planDocs: [{ ref: 'docs/plan.md', text: 'DOC-TEXT' }],
      fileDigest: 'DIGEST-TEXT',
      sources,
    });
    expect(system!.role).toBe('system');
    const content = user!.content;
    for (const label of ['pr-title', 'pr-body', 'linked-issue', 'plan-doc', 'file-digest']) {
      expect(content).toContain(`<untrusted source="${label}">`);
    }
    for (const text of ['TITLE-TEXT', 'BODY-TEXT', 'ISSUE-TEXT', 'DOC-TEXT', 'DIGEST-TEXT']) {
      expect(content).toContain(text);
    }
  });

  it('lists unavailable sources under "## Missing context" and forbids inventing them', () => {
    const [system, user] = buildIntentMessages({ title: 'T', sources });
    expect(user!.content).toContain('## Missing context');
    expect(user!.content).toContain('linked_issue: #42');
    expect(system!.content).toMatch(/NEVER invent/i);
  });

  it('omits absent sections entirely', () => {
    const [, user] = buildIntentMessages({ title: 'T', sources: [] });
    expect(user!.content).not.toContain('## PR description');
    expect(user!.content).not.toContain('## Missing context');
    expect(user!.content).toContain('## PR title');
  });
});
