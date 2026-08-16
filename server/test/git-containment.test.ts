import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RepoRef } from '@devdigest/shared';
import { SimpleGitClient, PathEscapesCloneError } from '../src/adapters/git/simple-git.js';

/**
 * Root-cause containment guard for git.readFile (server INSIGHTS 2026-08-16):
 * a non-hardcoded path must not escape the clone dir. Real filesystem, no
 * Docker (hermetic — plain `.test.ts`).
 */
describe('SimpleGitClient containment guard (AC-12, AC-19, NFR-2)', () => {
  let base: string;
  let secretDir: string;
  const repo: RepoRef = { owner: 'acme', name: 'payments' };
  let git: SimpleGitClient;

  beforeAll(async () => {
    base = await mkdtemp(join(tmpdir(), 'ddg-clone-'));
    secretDir = await mkdtemp(join(tmpdir(), 'ddg-secret-'));
    git = new SimpleGitClient(base);
    const clone = join(base, repo.owner, repo.name);
    await mkdir(join(clone, 'specs'), { recursive: true });
    await writeFile(join(clone, 'specs', 'public-api.md'), '# Public API\n\nrules here');
    await writeFile(join(clone, 'README.md'), '# Readme');
    // A secret file OUTSIDE the clone, and an in-clone symlink pointing at it.
    await writeFile(join(secretDir, 'passwd'), 'root:x:0:0');
    await symlink(join(secretDir, 'passwd'), join(clone, 'escape-link'));
  });

  afterAll(async () => {
    await rm(base, { recursive: true, force: true });
    await rm(secretDir, { recursive: true, force: true });
  });

  it('reads a hardcoded in-clone path', async () => {
    const body = await git.readFile(repo, 'specs/public-api.md');
    expect(body).toContain('Public API');
  });

  it('rejects a `..` traversal, never reading', async () => {
    await expect(git.readFile(repo, '../../etc/passwd')).rejects.toBeInstanceOf(
      PathEscapesCloneError,
    );
  });

  it('rejects an absolute path outside the clone', async () => {
    await expect(git.readFile(repo, join(secretDir, 'passwd'))).rejects.toBeInstanceOf(
      PathEscapesCloneError,
    );
  });

  it('rejects an in-clone symlink that escapes the clone (realpath, not startsWith)', async () => {
    await expect(git.readFile(repo, 'escape-link')).rejects.toBeInstanceOf(
      PathEscapesCloneError,
    );
  });

  it('walkFiles lists .md under the clone and does not follow the escaping symlink', async () => {
    const md = await git.walkFiles(repo, (p) => p.endsWith('.md'));
    expect(md).toContain('specs/public-api.md');
    expect(md).toContain('README.md');
    expect(md).not.toContain('escape-link');
  });

  it('walkFiles returns [] for an uncloned repo', async () => {
    const none = await git.walkFiles({ owner: 'nobody', name: 'nope' }, () => true);
    expect(none).toEqual([]);
  });
});
