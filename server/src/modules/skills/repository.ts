import { and, desc, eq, gte, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { SkillSource, SkillType } from '@devdigest/shared';
import { INITIAL_SKILL_VERSION } from './constants.js';

/**
 * A1 — skills data-access. Owns `skills` and `skill_versions` (body snapshots).
 * Mirrors AgentsRepository: workspace-scoped throughout, versions the body only
 * (name/description/type/enabled changes do NOT bump). The `agent_skills` link
 * table is owned by A2's agents repository; here we only read across it (+ the
 * findings tables) for the read-only stats endpoint.
 */

import type { SkillRow } from '../../db/rows.js';
export type { SkillRow };

export type SkillVersionRow = typeof t.skillVersions.$inferSelect;

export interface InsertSkill {
  workspaceId: string;
  name: string;
  description?: string;
  type: SkillType;
  source: SkillSource;
  body: string;
  enabled?: boolean;
  evidenceFiles?: string[] | null;
}

export interface UpdateSkill {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
}

/** Aggregated finding stats for a skill over the trailing 30 days. */
export interface SkillFindingStats {
  findings_30d: number;
  accept_rate: number;
  findings_by_category: { category: string; count: number }[];
}

export class SkillsRepository {
  constructor(private db: Db) {}

  async list(workspaceId: string): Promise<SkillRow[]> {
    return this.db.select().from(t.skills).where(eq(t.skills.workspaceId, workspaceId));
  }

  async listEnabled(workspaceId: string): Promise<SkillRow[]> {
    return this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.enabled, true)));
  }

  async getById(workspaceId: string, id: string): Promise<SkillRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)));
    return row;
  }

  /** Delete a skill (scoped to workspace). skill_versions + agent_skills links
   *  cascade. Returns false when no such skill existed in the workspace. */
  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning({ id: t.skills.id });
    return rows.length > 0;
  }

  /** Insert a skill AND snapshot its v1 body into skill_versions. */
  async insert(values: InsertSkill): Promise<SkillRow> {
    const [row] = await this.db
      .insert(t.skills)
      .values({
        workspaceId: values.workspaceId,
        name: values.name,
        description: values.description ?? '',
        type: values.type,
        source: values.source,
        body: values.body,
        enabled: values.enabled ?? true,
        version: INITIAL_SKILL_VERSION,
        evidenceFiles: values.evidenceFiles ?? null,
      })
      .returning();
    await this.snapshotVersion(row!.id, INITIAL_SKILL_VERSION, row!.body);
    return row!;
  }

  /**
   * Update a skill. A body change bumps the version and snapshots the NEW body
   * into skill_versions; name/description/type/enabled changes do NOT bump.
   */
  async update(
    workspaceId: string,
    id: string,
    patch: UpdateSkill,
  ): Promise<SkillRow | undefined> {
    const existing = await this.getById(workspaceId, id);
    if (!existing) return undefined;

    const bodyChanged = patch.body !== undefined && patch.body !== existing.body;
    const nextVersion = bodyChanged ? existing.version + 1 : existing.version;

    const [row] = await this.db
      .update(t.skills)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.type !== undefined ? { type: patch.type } : {}),
        ...(patch.body !== undefined ? { body: patch.body } : {}),
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
        ...(bodyChanged ? { version: nextVersion } : {}),
      })
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning();

    if (bodyChanged && row) await this.snapshotVersion(row.id, nextVersion, row.body);
    return row;
  }

  private async snapshotVersion(skillId: string, version: number, body: string): Promise<void> {
    await this.db
      .insert(t.skillVersions)
      .values({ skillId, version, body })
      .onConflictDoNothing();
  }

  // ---- skill_versions (immutable body snapshots) --------------------------

  /** All body snapshots for a skill, newest version first. */
  async listVersions(skillId: string): Promise<SkillVersionRow[]> {
    return this.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, skillId))
      .orderBy(desc(t.skillVersions.version));
  }

  /** A single body snapshot, or undefined if that version was never recorded. */
  async getVersion(skillId: string, version: number): Promise<SkillVersionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skillVersions)
      .where(and(eq(t.skillVersions.skillId, skillId), eq(t.skillVersions.version, version)));
    return row;
  }

  /**
   * Restore a past body: read that snapshot's body then `update` with it, which
   * creates a NEW version (current+1) carrying the old body. Returns the updated
   * row, or undefined when the skill / version doesn't exist in the workspace.
   */
  async restoreVersion(
    workspaceId: string,
    id: string,
    version: number,
  ): Promise<SkillRow | undefined> {
    const skill = await this.getById(workspaceId, id);
    if (!skill) return undefined;
    const snapshot = await this.getVersion(id, version);
    if (!snapshot) return undefined;
    return this.update(workspaceId, id, { body: snapshot.body });
  }

  // ---- read-only stats (real data only; no fabrication) -------------------

  /** Agents in this workspace that link this skill, as {id,name}. */
  async agentsUsingSkill(
    workspaceId: string,
    skillId: string,
  ): Promise<{ id: string; name: string }[]> {
    return this.db
      .select({ id: t.agents.id, name: t.agents.name })
      .from(t.agentSkills)
      .innerJoin(t.agents, eq(t.agentSkills.agentId, t.agents.id))
      .where(and(eq(t.agentSkills.skillId, skillId), eq(t.agents.workspaceId, workspaceId)));
  }

  /**
   * Finding stats over reviews produced (in the last 30 days) by agents that
   * link this skill: total findings, accept rate (accepted / total), and a
   * per-category breakdown. Returns zeros/empty when the skill has no linked
   * agents or those agents produced no recent findings.
   */
  async findingStats(workspaceId: string, skillId: string): Promise<SkillFindingStats> {
    const empty: SkillFindingStats = {
      findings_30d: 0,
      accept_rate: 0,
      findings_by_category: [],
    };

    const agents = await this.agentsUsingSkill(workspaceId, skillId);
    if (agents.length === 0) return empty;
    const agentIds = agents.map((a) => a.id);
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Reviews by those agents, in this workspace, in the window.
    const reviewRows = await this.db
      .select({ id: t.reviews.id })
      .from(t.reviews)
      .where(
        and(
          eq(t.reviews.workspaceId, workspaceId),
          inArray(t.reviews.agentId, agentIds),
          gte(t.reviews.createdAt, since),
        ),
      );
    if (reviewRows.length === 0) return empty;
    const reviewIds = reviewRows.map((r) => r.id);

    const findingRows = await this.db
      .select({ category: t.findings.category, acceptedAt: t.findings.acceptedAt })
      .from(t.findings)
      .where(inArray(t.findings.reviewId, reviewIds));

    const total = findingRows.length;
    if (total === 0) return empty;
    const accepted = findingRows.filter((f) => f.acceptedAt !== null).length;
    const byCategory = new Map<string, number>();
    for (const f of findingRows) byCategory.set(f.category, (byCategory.get(f.category) ?? 0) + 1);

    return {
      findings_30d: total,
      accept_rate: accepted / total,
      findings_by_category: [...byCategory].map(([category, count]) => ({ category, count })),
    };
  }
}
