import type { Container } from '../../platform/container.js';
import type { DocList, DocListItem, RepoRef } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import { DocsRepository } from './repository.js';
import { isDocPath, docTypeFor } from './helpers.js';
import { MAX_DOC_BYTES } from './constants.js';

/**
 * Docs service — Project Context reader. Walks the selected repo's clone at its
 * current checkout under the configured roots, token-counts each `.md`, and
 * attaches a per-doc "used by N agents" count. Read-only: no create/edit/delete.
 *
 * Onion: route → service → repository. FS/DB access is via the injected
 * Container's git adapter + this module's repository; the tokenizer is resolved
 * from the Container (not instantiated) — one shared encoder across requests.
 */
export class DocsService {
  private repo: DocsRepository;

  constructor(private container: Container) {
    this.repo = new DocsRepository(container.db);
  }

  /**
   * List docs for a repo. Uncloned repo / no `.md` under the roots → empty list
   * with a scanned_at (the reader shows an empty state). A walk/read failure of
   * the whole clone surfaces to the route (5xx → error state); a per-doc read
   * failure just drops that doc (best-effort token count).
   */
  async list(workspaceId: string, repoId: string): Promise<DocList> {
    const repoRow = await this.repo.getRepo(workspaceId, repoId);
    if (!repoRow) throw new NotFoundError('Repo not found');
    const ref: RepoRef = { owner: repoRow.owner, name: repoRow.name };
    const roots = this.container.config.docRoots;

    const paths = await this.container.git.walkFiles(ref, (p) => isDocPath(p, roots));
    paths.sort();

    // "Used by N agents" per path — one pass over every agent's resolved doc set.
    const agentSets = await this.repo.agentResolvedDocSets(workspaceId);
    const usedBy = (path: string): number => agentSets.filter((s) => s.has(path)).length;

    const tokenizer = this.container.tokenizer;
    const docs: DocListItem[] = [];
    for (const path of paths) {
      let tokens = 0;
      try {
        const body = await this.container.git.readFile(ref, path);
        // Cap by raw byte length before counting so a huge doc can't blow NFR-1.
        tokens = Buffer.byteLength(body, 'utf8') > MAX_DOC_BYTES ? 0 : tokenizer.count(body);
      } catch {
        // Unreadable (vanished between walk and read, decode failure) → tokens 0.
        tokens = 0;
      }
      docs.push({ path, tokens, type: docTypeFor(path), used_by_agents: usedBy(path) });
    }

    return { docs, scanned_at: new Date().toISOString() };
  }

  /** Rescan = re-walk. Same as list; the walk always reads the current checkout. */
  async rescan(workspaceId: string, repoId: string): Promise<DocList> {
    return this.list(workspaceId, repoId);
  }

  /**
   * Raw markdown body for the read-only Preview. Containment-checked by the git
   * adapter (a traversal / symlink-escape path throws → the route maps it to a
   * 404, never leaking file content). Returns undefined when unreadable.
   */
  async preview(workspaceId: string, repoId: string, path: string): Promise<string | undefined> {
    const repoRow = await this.repo.getRepo(workspaceId, repoId);
    if (!repoRow) throw new NotFoundError('Repo not found');
    const ref: RepoRef = { owner: repoRow.owner, name: repoRow.name };
    try {
      return await this.container.git.readFile(ref, path);
    } catch {
      return undefined;
    }
  }
}
