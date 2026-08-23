import { and, eq } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import { IntentConfidence, type Brief, type Intent, type PrBriefRecord } from '@devdigest/shared';
import type { PullRow } from '../../../db/rows.js';

// ---- PR lookup (workspace-scoped) -----------------------------------------

export async function getPull(
  db: Db,
  workspaceId: string,
  prId: string,
): Promise<PullRow | undefined> {
  const [row] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
  return row;
}

export async function getRepo(
  db: Db,
  repoId: string,
): Promise<typeof t.repos.$inferSelect | undefined> {
  const [row] = await db.select().from(t.repos).where(eq(t.repos.id, repoId));
  return row;
}

export async function getPrFiles(
  db: Db,
  prId: string,
): Promise<(typeof t.prFiles.$inferSelect)[]> {
  return db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));
}

/**
 * Record the commit a review just ran against, so the PR list can derive
 * `reviewed` vs `needs_review` (head moved since the last review) vs `stale`.
 */
export async function markReviewed(db: Db, prId: string, sha: string): Promise<void> {
  await db
    .update(t.pullRequests)
    .set({ lastReviewedSha: sha })
    .where(eq(t.pullRequests.id, prId));
}

// ---- intent ---------------------------------------------------------------

/**
 * The persisted intent DTO: the shared `Intent` plus the storage-only
 * `derived_at` stamp. PK is `pr_id`, so a re-derive OVERWRITES rather than
 * appending — intent is per-PR, not per-SHA.
 */
export type StoredIntent = Intent & { derived_at: string | null };

export async function upsertIntent(db: Db, prId: string, intent: Intent): Promise<void> {
  const values = {
    intent: intent.intent,
    inScope: intent.in_scope,
    outOfScope: intent.out_of_scope,
    confidence: intent.confidence ?? null,
    sources: intent.sources ?? [],
    model: intent.model ?? null,
    derivedAt: new Date(),
  };
  await db
    .insert(t.prIntent)
    .values({ prId, ...values })
    .onConflictDoUpdate({ target: t.prIntent.prId, set: values });
}

export async function getIntent(db: Db, prId: string): Promise<StoredIntent | undefined> {
  const [row] = await db.select().from(t.prIntent).where(eq(t.prIntent.prId, prId));
  if (!row) return undefined;
  return {
    intent: row.intent,
    in_scope: row.inScope,
    out_of_scope: row.outOfScope,
    confidence: IntentConfidence.safeParse(row.confidence).data ?? null,
    sources: row.sources,
    model: row.model,
    derived_at: row.derivedAt?.toISOString() ?? null,
  };
}

// ---- brief ----------------------------------------------------------------

/**
 * The cost/audit metadata persisted alongside the Brief JSON. `state_key` is the
 * head SHA the Brief was derived against (the staleness key).
 */
export interface BriefMeta {
  stateKey: string;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
  model: string | null;
}

/**
 * Upsert the live Brief for a PR. PK = `pr_id`, so a re-derive OVERWRITES —
 * the Brief is per-PR (keyed on head SHA via `state_key`, not per-SHA rows).
 */
export async function upsertBrief(
  db: Db,
  prId: string,
  brief: Brief,
  meta: BriefMeta,
): Promise<void> {
  const values = {
    json: brief,
    stateKey: meta.stateKey,
    tokensIn: meta.tokensIn,
    tokensOut: meta.tokensOut,
    costUsd: meta.costUsd,
    model: meta.model,
    derivedAt: new Date(),
  };
  await db
    .insert(t.prBrief)
    .values({ prId, ...values })
    .onConflictDoUpdate({ target: t.prBrief.prId, set: values });
}

export async function getBrief(db: Db, prId: string): Promise<PrBriefRecord | undefined> {
  const [row] = await db.select().from(t.prBrief).where(eq(t.prBrief.prId, prId));
  if (!row) return undefined;
  return {
    ...row.json,
    pr_id: prId,
    state_key: row.stateKey,
    tokens_in: row.tokensIn,
    tokens_out: row.tokensOut,
    cost_usd: row.costUsd,
    model: row.model,
    derived_at: row.derivedAt?.toISOString() ?? null,
  };
}
