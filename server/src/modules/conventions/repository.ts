import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * Conventions data-access. Owns the `conventions` table (extracted candidates).
 * Workspace-scoped throughout. A candidate is model-proposed AND code-verified
 * before it lands here; `accepted` is flipped by the user in the UI.
 */

export type ConventionRow = typeof t.conventions.$inferSelect;

export interface InsertConvention {
  workspaceId: string;
  repoId: string;
  rule: string;
  evidencePath: string;
  evidenceLine: number | null;
  evidenceSnippet: string;
  confidence: number;
}

export class ConventionsRepository {
  constructor(private db: Db) {}

  async listByRepo(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    return this.db
      .select()
      .from(t.conventions)
      .where(
        and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)),
      );
  }

  async getById(workspaceId: string, id: string): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)));
    return row;
  }

  async listAccepted(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    return this.db
      .select()
      .from(t.conventions)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          eq(t.conventions.accepted, true),
        ),
      );
  }

  /**
   * Replace a repo's UNACCEPTED candidates with a fresh extraction. Accepted
   * ones are preserved so a re-scan never discards a rule the user kept.
   * ponytail: delete-then-insert (not upsert-by-rule) — a re-scan is a full
   * refresh; dedupe-by-rule is the upgrade path if churn becomes annoying.
   */
  async replaceUnaccepted(
    workspaceId: string,
    repoId: string,
    rows: InsertConvention[],
  ): Promise<void> {
    await this.db
      .delete(t.conventions)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          eq(t.conventions.accepted, false),
        ),
      );
    if (rows.length) await this.db.insert(t.conventions).values(rows);
  }

  async update(
    workspaceId: string,
    id: string,
    patch: { rule?: string; evidenceSnippet?: string; accepted?: boolean },
  ): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .update(t.conventions)
      .set({
        ...(patch.rule !== undefined ? { rule: patch.rule } : {}),
        ...(patch.evidenceSnippet !== undefined
          ? { evidenceSnippet: patch.evidenceSnippet }
          : {}),
        ...(patch.accepted !== undefined ? { accepted: patch.accepted } : {}),
      })
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning();
    return row;
  }
}
