import { simpleGit, type SimpleGit } from 'simple-git';
import { join, relative, resolve, sep } from 'node:path';
import { mkdir, readFile, access, rm, realpath, readdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import type {
  GitClient,
  RepoRef,
  CloneOptions,
  UnifiedDiff,
  BlameLine,
  GitCommit,
} from '@devdigest/shared';
import { parseUnifiedDiff } from './diff-parser.js';

/**
 * Depth fetched by `sync()`. Deeper than the shallow clone (CLONE_DEPTH=1) so the
 * previously-indexed sha is usually reachable, keeping the resync diff incremental;
 * when it isn't, the indexer falls back to a full reindex.
 */
const RESYNC_FETCH_DEPTH = 50;

/**
 * Hard cap on `.md` matches returned by {@link SimpleGitClient.walkFiles}. A repo
 * with more docs than this is truncated (the editor filter narrows it). Keeps the
 * doc-list walk bounded (NFR-1).
 */
const MAX_WALK_MATCHES = 500;

/**
 * Thrown by {@link SimpleGitClient.readFile} when a supplied path resolves
 * outside the repo's clone directory (`..`, absolute path, or a symlink escaping
 * the clone). Callers (e.g. the run-executor doc reader) treat it as a skip.
 */
export class PathEscapesCloneError extends Error {
  constructor(path: string) {
    super(`Path escapes clone directory: ${path}`);
    this.name = 'PathEscapesCloneError';
  }
}

/**
 * True when `child` (an already-realpath'd absolute path) is the same as or
 * nested under `parent` (also realpath'd). Uses `path.relative` rather than a
 * string `startsWith`, so `/clone-evil` is not treated as inside `/clone`.
 */
function isInside(parent: string, child: string): boolean {
  if (child === parent) return true;
  const rel = relative(parent, child);
  return rel.length > 0 && !rel.startsWith('..') && !rel.startsWith(`..${sep}`);
}

/**
 * GitClient over simple-git. Repos clone to
 * `<cloneDir>/<owner>/<repo>`. We NEVER execute repo code — only git ops.
 */
export class SimpleGitClient implements GitClient {
  constructor(private cloneDir: string) {
    // Force non-interactive auth so an unauthenticated/private clone fails in
    // ~1s with a clear error instead of hanging on a credential prompt until the
    // job timeout. Set on process.env (inherited by git subprocesses) rather
    // than via simple-git's .env(), which inspects and rejects vars like
    // PAGER/EDITOR present in the shell environment.
    process.env.GIT_TERMINAL_PROMPT ??= '0';
    process.env.GCM_INTERACTIVE ??= 'never';
  }

  clonePathFor(repo: RepoRef): string {
    return join(this.cloneDir, repo.owner, repo.name);
  }

  private git(repo: RepoRef): SimpleGit {
    return simpleGit(this.clonePathFor(repo));
  }

  private async exists(path: string): Promise<boolean> {
    try {
      await access(path, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  async clone(repo: RepoRef, url: string, opts?: CloneOptions): Promise<{ path: string }> {
    const dest = this.clonePathFor(repo);
    await mkdir(join(this.cloneDir, repo.owner), { recursive: true });
    if (await this.exists(join(dest, '.git'))) {
      // already cloned → fetch latest
      await simpleGit(dest).fetch();
      return { path: dest };
    }
    // A prior clone may have timed out mid-write, leaving a partial dir without
    // a .git — git clone refuses a non-empty dest, so clear it first.
    if (await this.exists(dest)) await rm(dest, { recursive: true, force: true });
    const args: string[] = [];
    if (opts?.depth) args.push('--depth', String(opts.depth));
    if (opts?.branch) args.push('--branch', opts.branch);
    await simpleGit(this.cloneDir).clone(url, dest, args);
    return { path: dest };
  }

  async fetchPullHead(repo: RepoRef, n: number): Promise<void> {
    // Fetch the PR head ref into a local ref (GitHub exposes pull/<n>/head).
    await this.git(repo).fetch(['origin', `pull/${n}/head:pr-${n}`]);
  }

  async sync(repo: RepoRef, branch: string): Promise<{ head: string }> {
    // Resync the read-only mirror to upstream. A bare `fetch` only moves
    // `origin/<branch>`, so we `reset --hard` to advance local HEAD + worktree —
    // safe here because we never commit to or run code from the clone.
    // Fetch a bounded depth (> the shallow CLONE_DEPTH) so the prior indexed sha
    // is usually reachable for an incremental diff; the indexer falls back to a
    // full reindex when it isn't.
    const g = this.git(repo);
    await g.fetch(['origin', branch, '--depth', String(RESYNC_FETCH_DEPTH)]);
    await g.reset(['--hard', `origin/${branch}`]);
    return { head: (await g.revparse(['HEAD'])).trim() };
  }

  async currentHead(repo: RepoRef): Promise<string> {
    return (await this.git(repo).revparse(['HEAD'])).trim();
  }

  async diff(repo: RepoRef, base: string, head: string): Promise<UnifiedDiff> {
    const raw = await this.git(repo).diff([`${base}...${head}`]);
    return parseUnifiedDiff(raw);
  }

  /**
   * `git diff --name-only base..head` — used by the incremental indexer to
   * pick the file set that changed since `last_indexed_sha`. Two-dot is
   * intentional (commits reachable from `head` but not `base`), unlike the
   * three-dot symmetric form `diff()` uses for review diffs.
   */
  async diffNameOnly(repo: RepoRef, base: string, head: string): Promise<string[]> {
    if (base === head) return [];
    const raw = await this.git(repo).raw(['diff', '--name-only', `${base}..${head}`]);
    return raw
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  async blame(repo: RepoRef, path: string): Promise<BlameLine[]> {
    const raw = await this.git(repo).raw(['blame', '--line-porcelain', path]);
    return parseBlamePorcelain(raw);
  }

  async log(repo: RepoRef, path?: string): Promise<GitCommit[]> {
    const log = await this.git(repo).log(path ? { file: path } : undefined);
    return log.all.map((c) => ({
      sha: c.hash,
      message: c.message,
      author: c.author_name,
      date: c.date,
    }));
  }

  /**
   * Read a repo-relative file from the clone, AFTER asserting the resolved path
   * stays inside the clone dir. Root-cause containment guard (server INSIGHTS
   * 2026-08-16): the path may be attacker/owner-supplied (Project Context docs),
   * so a bare `join` would let `../../etc/passwd`, an absolute path, or an
   * in-clone symlink pointing outside escape the sandbox.
   *
   * We `realpath` BOTH the clone dir and the resolved target so a symlink whose
   * textual path is in-clone but which points outside is still rejected — a
   * naive `startsWith` on the joined string misses that. Throws
   * {@link PathEscapesCloneError} before any read when containment fails.
   */
  async readFile(repo: RepoRef, path: string): Promise<string> {
    const cloneRoot = await realpath(this.clonePathFor(repo));
    // Resolve the requested path against the clone root. `resolve` collapses
    // `..` segments and makes an absolute input absolute (which then fails the
    // containment check below unless it happens to sit inside the clone).
    const target = resolve(cloneRoot, path);
    // realpath the target so an in-clone symlink pointing outside is unmasked.
    // The file may not exist yet — realpath throws ENOENT; fall back to the
    // lexically-resolved path (a non-existent path can't be a symlink escape,
    // and the subsequent readFile surfaces the ENOENT to the caller as a skip).
    let real: string;
    try {
      real = await realpath(target);
    } catch {
      real = target;
    }
    if (!isInside(cloneRoot, real)) throw new PathEscapesCloneError(path);
    return readFile(real, 'utf8');
  }

  /**
   * Enumerate files under the clone matching `predicate(relPath)`, confined to
   * the clone dir. Symlinked directories are NOT descended (containment: a
   * symlink out of the clone must not leak files into the list). Returns
   * repo-relative POSIX-style paths, capped at {@link MAX_WALK_MATCHES}.
   *
   * The doc walk (AC-2) reads only paths here, never `readFile`; token counting
   * of matched files happens in the service with its own size cap.
   */
  async walkFiles(repo: RepoRef, predicate: (relPath: string) => boolean): Promise<string[]> {
    let root: string;
    try {
      root = await realpath(this.clonePathFor(repo));
    } catch {
      // Uncloned repo → no clone dir. Empty list (the reader shows empty state).
      return [];
    }
    const out: string[] = [];
    const walk = async (dir: string): Promise<void> => {
      if (out.length >= MAX_WALK_MATCHES) return;
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        if (out.length >= MAX_WALK_MATCHES) return;
        // Skip symlinks entirely — a symlinked file or dir could point outside
        // the clone; we never follow one in the walk.
        if (e.isSymbolicLink()) continue;
        if (e.name === '.git') continue;
        const abs = join(dir, e.name);
        if (e.isDirectory()) {
          await walk(abs);
        } else if (e.isFile()) {
          const rel = relative(root, abs).split(sep).join('/');
          if (predicate(rel)) out.push(rel);
        }
      }
    };
    await walk(root);
    return out;
  }
}

function parseBlamePorcelain(raw: string): BlameLine[] {
  const out: BlameLine[] = [];
  const lines = raw.split('\n');
  let sha = '';
  let author = '';
  let date = '';
  let summary = '';
  let lineNo = 0;
  for (const line of lines) {
    const header = line.match(/^([0-9a-f]{40})\s+\d+\s+(\d+)/);
    if (header) {
      sha = header[1]!;
      lineNo = Number(header[2]);
    } else if (line.startsWith('author ')) author = line.slice(7);
    else if (line.startsWith('author-time '))
      date = new Date(Number(line.slice(12)) * 1000).toISOString();
    else if (line.startsWith('summary ')) summary = line.slice(8);
    else if (line.startsWith('\t')) {
      out.push({ line: lineNo, sha, author, date, summary });
    }
  }
  return out;
}
