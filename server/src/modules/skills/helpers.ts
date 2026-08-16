import { unzipSync, strFromU8 } from 'fflate';
import type { CommunitySkill, Skill, SkillSource, SkillType } from '@devdigest/shared';
import type { SkillRow } from '../../db/rows.js';
import { ValidationError } from '../../platform/errors.js';
import { DEFAULT_SKILL_NAME } from './constants.js';

/**
 * Pure helpers for the skills module — DB row ⇄ DTO mapping, name derivation,
 * zip extraction, and the static community catalog. No I/O (unzipSync is CPU
 * only), no filesystem, no execution of archive entries.
 */

/**
 * Map a persisted skill row to the public `Skill` DTO. `usedByAgents` is the
 * cross-entity count (agents linking this skill), computed on read by the
 * service; omitted → `used_by_agents` is null.
 */
export function toSkillDto(row: SkillRow, usedByAgents?: number): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type as SkillType,
    source: row.source as SkillSource,
    body: row.body,
    enabled: row.enabled,
    version: row.version,
    evidence_files: row.evidenceFiles ?? null,
    doc_paths: row.docPaths ?? [],
    used_by_agents: usedByAgents ?? null,
  };
}

/**
 * Derive a skill name from its markdown body: the first `# heading`, slugified
 * (lowercase, non-alphanumerics → single dashes, trimmed). Falls back to
 * DEFAULT_SKILL_NAME when there's no heading / it slugifies to empty.
 */
export function deriveSkillName(body: string): string {
  const match = body.match(/^#\s+(.+)$/m);
  if (!match) return DEFAULT_SKILL_NAME;
  const slug = match[1]!
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || DEFAULT_SKILL_NAME;
}

/**
 * Extract the "core" markdown skill from a zip archive. Prefers a `SKILL.md`
 * entry (case-insensitive, any folder depth), else the first `*.md` entry. Only
 * that one entry is decoded (UTF-8); every other entry (scripts, binaries) is
 * ignored and never read or executed. Throws when no markdown entry exists.
 */
export function extractSkillFromZip(bytes: Uint8Array): { name: string; body: string } {
  const files = unzipSync(bytes);
  const names = Object.keys(files);
  const skillMd = names.find((n) => n.split('/').pop()?.toLowerCase() === 'skill.md');
  const pick = skillMd ?? names.find((n) => n.toLowerCase().endsWith('.md'));
  if (!pick) throw new ValidationError('No markdown skill found in archive');
  const body = strFromU8(files[pick]!);
  return { name: deriveSkillName(body), body };
}

/**
 * A small set of vetted community skills the "Import from community" browser
 * offers. The public list endpoint returns only the `CommunitySkill` fields
 * (name/repo/stars/lang/desc); import consumes `type` + `body`.
 */
export const COMMUNITY_CATALOG: (CommunitySkill & { type: SkillType; body: string })[] = [
  {
    name: 'no-secrets-in-code',
    repo: 'devdigest/community-skills',
    stars: 1420,
    lang: 'any',
    desc: 'Flag hardcoded credentials, API keys, and tokens committed to source.',
    type: 'security',
    body: '# No secrets in code\n\nReject any diff that adds a hardcoded secret: API keys, passwords, private keys, or long-lived tokens. Require they come from env vars or a secrets manager instead.',
  },
  {
    name: 'sql-injection-guard',
    repo: 'devdigest/community-skills',
    stars: 980,
    lang: 'any',
    desc: 'Require parameterized queries; flag string-concatenated SQL.',
    type: 'security',
    body: '# SQL injection guard\n\nFlag any SQL built by string concatenation or interpolation with user input. Require parameterized queries / prepared statements or a query builder.',
  },
  {
    name: 'test-coverage-rubric',
    repo: 'devdigest/community-skills',
    stars: 760,
    lang: 'any',
    desc: 'Rubric: new behavior needs a test; bug fixes need a regression test.',
    type: 'rubric',
    body: '# Test coverage rubric\n\nRate the change on tests: (1) new public behavior has a test, (2) each bug fix ships a regression test that fails before the fix, (3) edge/error paths are covered. Call out untested branches.',
  },
  {
    name: 'conventional-commits',
    repo: 'devdigest/community-skills',
    stars: 540,
    lang: 'any',
    desc: 'Enforce Conventional Commits style for PR titles and commit messages.',
    type: 'convention',
    body: '# Conventional commits\n\nPR titles and commit messages must follow Conventional Commits: `type(scope): summary` where type is feat|fix|docs|refactor|test|chore. Flag messages that do not.',
  },
  {
    name: 'error-handling-review',
    repo: 'devdigest/community-skills',
    stars: 610,
    lang: 'any',
    desc: 'Flag swallowed errors, empty catch blocks, and unhandled rejections.',
    type: 'custom',
    body: '# Error handling review\n\nFlag swallowed errors: empty catch blocks, catch that only logs and continues where it should abort, and unhandled promise rejections. Require errors to be handled, wrapped with context, or propagated.',
  },
];
