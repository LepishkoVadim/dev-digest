/**
 * blast repository — the infrastructure layer for the Blast route. Keeps the
 * ORM / db-schema out of routes.ts (onion `no-route-to-db`). Only two reads are
 * needed; the actual index reads live behind the RepoIntel facade.
 */
import { and, eq, inArray, ne } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { BlastPriorPr } from '@devdigest/shared';

export interface BlastPrRow {
  id: string;
  repoId: string;
}

/** How many prior PRs the history footer shows. */
const MAX_PRIOR_PRS = 10;
/** Max characters of the PR body used as the history note. */
const MAX_NOTE_CHARS = 180;

/** First non-empty line of a PR body, trimmed — the history "note". */
function firstLine(body: string | null): string | null {
  if (!body) return null;
  const line = body
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!line) return null;
  return line.length > MAX_NOTE_CHARS ? `${line.slice(0, MAX_NOTE_CHARS - 1)}…` : line;
}

export class BlastRepository {
  constructor(private db: Db) {}

  /** The PR row scoped to the tenant, or null (→ 404). */
  async getPr(workspaceId: string, id: string): Promise<BlastPrRow | null> {
    const [pr] = await this.db
      .select({ id: t.pullRequests.id, repoId: t.pullRequests.repoId })
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, id)));
    return pr ?? null;
  }

  /** Persisted changed-file paths for the PR (empty until detail is fetched). */
  async getChangedFiles(prId: string): Promise<string[]> {
    const rows = await this.db
      .select({ path: t.prFiles.path })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId));
    return rows.map((r) => r.path);
  }

  /**
   * Prior merged/closed PRs in the same repo that touched any of `changedFiles`,
   * newest first. Grouped in JS into one row per PR with its overlapping paths.
   */
  async getPriorPrs(
    repoId: string,
    excludePrId: string,
    changedFiles: string[],
  ): Promise<BlastPriorPr[]> {
    if (changedFiles.length === 0) return [];
    const rows = await this.db
      .select({
        number: t.pullRequests.number,
        title: t.pullRequests.title,
        status: t.pullRequests.status,
        author: t.pullRequests.author,
        updatedAt: t.pullRequests.updatedAt,
        openedAt: t.pullRequests.openedAt,
        body: t.pullRequests.body,
        path: t.prFiles.path,
      })
      .from(t.prFiles)
      .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.prFiles.prId))
      .where(
        and(
          eq(t.pullRequests.repoId, repoId),
          ne(t.pullRequests.id, excludePrId),
          inArray(t.pullRequests.status, ['merged', 'closed']),
          inArray(t.prFiles.path, changedFiles),
        ),
      );

    const byNumber = new Map<number, BlastPriorPr>();
    for (const r of rows) {
      const hit = byNumber.get(r.number);
      if (hit) {
        if (!hit.files_overlap.includes(r.path)) hit.files_overlap.push(r.path);
      } else {
        byNumber.set(r.number, {
          number: r.number,
          title: r.title,
          status: r.status,
          author: r.author,
          date: (r.updatedAt ?? r.openedAt)?.toISOString() ?? null,
          note: firstLine(r.body),
          files_overlap: [r.path],
        });
      }
    }
    return [...byNumber.values()]
      .sort((a, b) => b.number - a.number)
      .slice(0, MAX_PRIOR_PRS);
  }
}
