import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { deriveSkillName, extractSkillFromZip } from './helpers.js';
import { resolveSkillBlocks } from '../reviews/helpers.js';
import { DEFAULT_SKILL_NAME } from './constants.js';

describe('deriveSkillName', () => {
  it('slugifies the first markdown heading', () => {
    expect(deriveSkillName('# No Secrets In Code\n\nbody')).toBe('no-secrets-in-code');
  });

  it('falls back when there is no heading', () => {
    expect(deriveSkillName('just some text, no heading')).toBe(DEFAULT_SKILL_NAME);
  });

  it('falls back when the heading slugifies to empty', () => {
    expect(deriveSkillName('# !!!')).toBe(DEFAULT_SKILL_NAME);
  });
});

describe('extractSkillFromZip', () => {
  it('returns the SKILL.md body and never a sibling script', () => {
    const zip = zipSync({
      'evil.sh': strToU8('#!/bin/sh\nrm -rf /'),
      'skills/SKILL.md': strToU8('# My Rule\n\nDo the thing.'),
      'README.txt': strToU8('ignore me'),
    });
    const out = extractSkillFromZip(zip);
    expect(out.body).toBe('# My Rule\n\nDo the thing.');
    expect(out.body).not.toContain('rm -rf');
    expect(out.name).toBe('my-rule');
  });

  it('falls back to the first *.md when no SKILL.md exists', () => {
    const zip = zipSync({ 'doc.md': strToU8('# Doc Skill\n\nx'), 'bin.dat': strToU8('\0\0') });
    expect(extractSkillFromZip(zip).body).toBe('# Doc Skill\n\nx');
  });

  it('throws when the archive has no markdown', () => {
    const zip = zipSync({ 'evil.sh': strToU8('rm -rf /') });
    expect(() => extractSkillFromZip(zip)).toThrow(/No markdown skill/);
  });
});

describe('resolveSkillBlocks', () => {
  const mk = (o: Partial<{ name: string; body: string; enabled: boolean; source: string }>) => ({
    skill: {
      name: o.name ?? 's',
      body: o.body ?? 'B',
      enabled: o.enabled ?? true,
      source: (o.source ?? 'manual') as 'manual' | 'extracted' | 'community' | 'imported_url',
    },
  });

  it('uses a manual skill body raw', () => {
    expect(resolveSkillBlocks([mk({ source: 'manual', body: 'raw body' })])).toEqual(['raw body']);
  });

  it('wraps a non-manual skill body as untrusted', () => {
    const [block] = resolveSkillBlocks([mk({ source: 'community', name: 'x', body: 'B' })]);
    expect(block).toContain('<untrusted');
    expect(block).toContain('B');
  });

  it('drops disabled skills', () => {
    expect(resolveSkillBlocks([mk({ enabled: false })])).toEqual([]);
  });
});
