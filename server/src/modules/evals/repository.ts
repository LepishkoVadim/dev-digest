import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { EvalOwnerKind } from '@devdigest/shared';

/**
 * Evals data-access (L06). Owns `eval_cases` + `eval_runs` (workspace-scoped),
 * and reads the owner's version snapshots (`agent_versions` / `skill_versions`)
 * for the run version + Compare diff. Cross-entity reads (skill→agent linkage,
 * owner version) use inline Drizzle in THIS module — never import another
 * module's repository (onion: no-cross-module-internals).
 */

export type EvalCaseRow = typeof t.evalCases.$inferSelect;
export type EvalRunRow = typeof t.evalRuns.$inferSelect;

export interface InsertEvalCase {
  workspaceId: string;
  ownerKind: EvalOwnerKind;
  ownerId: string;
  name: string;
  inputDiff: string;
  inputFiles?: unknown;
  inputMeta?: unknown;
  expectedOutput?: unknown;
  notes?: string | null;
}

export interface UpdateEvalCase {
  name?: string;
  inputDiff?: string;
  inputFiles?: unknown;
  inputMeta?: unknown;
  expectedOutput?: unknown;
  notes?: string | null;
}

export interface InsertEvalRun {
  caseId: string;
  actualOutput: unknown;
  pass: boolean | null;
  recall: number | null;
  precision: number | null;
  citationAccuracy: number | null;
  durationMs: number | null;
  costUsd: number | null;
  version: number | null;
}

export interface LinkedAgent {
  id: string;
  name: string;
}

export class EvalsRepository {
  constructor(private db: Db) {}

  // ---- eval_cases (workspace-scoped) --------------------------------------

  async listCases(
    workspaceId: string,
    ownerKind: EvalOwnerKind,
    ownerId: string,
  ): Promise<EvalCaseRow[]> {
    return this.db
      .select()
      .from(t.evalCases)
      .where(
        and(
          eq(t.evalCases.workspaceId, workspaceId),
          eq(t.evalCases.ownerKind, ownerKind),
          eq(t.evalCases.ownerId, ownerId),
        ),
      );
  }

  async getCase(workspaceId: string, id: string): Promise<EvalCaseRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, id)));
    return row;
  }

  async insertCase(values: InsertEvalCase): Promise<EvalCaseRow> {
    const [row] = await this.db
      .insert(t.evalCases)
      .values({
        workspaceId: values.workspaceId,
        ownerKind: values.ownerKind,
        ownerId: values.ownerId,
        name: values.name,
        inputDiff: values.inputDiff,
        inputFiles: (values.inputFiles as object | undefined) ?? null,
        inputMeta: (values.inputMeta as object | undefined) ?? null,
        expectedOutput: (values.expectedOutput as object | undefined) ?? null,
        notes: values.notes ?? null,
      })
      .returning();
    return row!;
  }

  async updateCase(
    workspaceId: string,
    id: string,
    patch: UpdateEvalCase,
  ): Promise<EvalCaseRow | undefined> {
    const [row] = await this.db
      .update(t.evalCases)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.inputDiff !== undefined ? { inputDiff: patch.inputDiff } : {}),
        ...(patch.inputFiles !== undefined ? { inputFiles: patch.inputFiles as object } : {}),
        ...(patch.inputMeta !== undefined ? { inputMeta: patch.inputMeta as object } : {}),
        ...(patch.expectedOutput !== undefined
          ? { expectedOutput: patch.expectedOutput as object }
          : {}),
        ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
      })
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, id)))
      .returning();
    return row;
  }

  async deleteCase(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, id)))
      .returning({ id: t.evalCases.id });
    return rows.length > 0;
  }

  // ---- eval_runs ----------------------------------------------------------

  async insertRun(values: InsertEvalRun): Promise<EvalRunRow> {
    const [row] = await this.db
      .insert(t.evalRuns)
      .values({
        caseId: values.caseId,
        actualOutput: (values.actualOutput as object | undefined) ?? null,
        pass: values.pass,
        recall: values.recall,
        precision: values.precision,
        citationAccuracy: values.citationAccuracy,
        durationMs: values.durationMs,
        costUsd: values.costUsd,
        version: values.version,
      })
      .returning();
    return row!;
  }

  /** All runs for an owner's cases, newest first, with the case name joined. */
  async listRunsForOwner(
    workspaceId: string,
    ownerKind: EvalOwnerKind,
    ownerId: string,
  ): Promise<{ run: EvalRunRow; caseName: string }[]> {
    const rows = await this.db
      .select({ run: t.evalRuns, caseName: t.evalCases.name })
      .from(t.evalRuns)
      .innerJoin(t.evalCases, eq(t.evalRuns.caseId, t.evalCases.id))
      .where(
        and(
          eq(t.evalCases.workspaceId, workspaceId),
          eq(t.evalCases.ownerKind, ownerKind),
          eq(t.evalCases.ownerId, ownerId),
        ),
      )
      .orderBy(desc(t.evalRuns.ranAt));
    return rows.map((r) => ({ run: r.run, caseName: r.caseName }));
  }

  // ---- owner version resolution -------------------------------------------

  /**
   * The owner's CURRENT version — the int stamped on runs (AC-12/13). Reads the
   * live `agents.version` / `skills.version` counter (bumped on config change),
   * scoped to the workspace. Returns null if the owner is not in the workspace.
   */
  async currentOwnerVersion(
    workspaceId: string,
    ownerKind: EvalOwnerKind,
    ownerId: string,
  ): Promise<number | null> {
    if (ownerKind === 'agent') {
      const [row] = await this.db
        .select({ version: t.agents.version })
        .from(t.agents)
        .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, ownerId)));
      return row?.version ?? null;
    }
    const [row] = await this.db
      .select({ version: t.skills.version })
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, ownerId)));
    return row?.version ?? null;
  }

  /** The agent's `system_prompt` snapshot at a version (Compare diff, AC-17). */
  async agentPromptAtVersion(agentId: string, version: number): Promise<string | null> {
    const [row] = await this.db
      .select({ configJson: t.agentVersions.configJson })
      .from(t.agentVersions)
      .where(and(eq(t.agentVersions.agentId, agentId), eq(t.agentVersions.version, version)));
    const cfg = row?.configJson as { system_prompt?: unknown } | undefined;
    return typeof cfg?.system_prompt === 'string' ? cfg.system_prompt : null;
  }

  /** The skill body snapshot at a version (Compare diff, AC-17). */
  async skillBodyAtVersion(skillId: string, version: number): Promise<string | null> {
    const [row] = await this.db
      .select({ body: t.skillVersions.body })
      .from(t.skillVersions)
      .where(and(eq(t.skillVersions.skillId, skillId), eq(t.skillVersions.version, version)));
    return row?.body ?? null;
  }

  // ---- skill → agent resolution (inline, mirrors agentsUsingSkill) --------

  /** Agents in this workspace that link this skill, as {id,name}. */
  async agentsLinkingSkill(workspaceId: string, skillId: string): Promise<LinkedAgent[]> {
    return this.db
      .select({ id: t.agents.id, name: t.agents.name })
      .from(t.agentSkills)
      .innerJoin(t.agents, eq(t.agentSkills.agentId, t.agents.id))
      .where(and(eq(t.agentSkills.skillId, skillId), eq(t.agents.workspaceId, workspaceId)));
  }

  /** One agent row (workspace-scoped) — the executor for a skill's with/without run. */
  async getAgent(
    workspaceId: string,
    agentId: string,
  ): Promise<typeof t.agents.$inferSelect | undefined> {
    const [row] = await this.db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, agentId)));
    return row;
  }

  /** The skill row (workspace-scoped) — its body is the linked-skill block. */
  async getSkill(
    workspaceId: string,
    skillId: string,
  ): Promise<typeof t.skills.$inferSelect | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, skillId)));
    return row;
  }
}
