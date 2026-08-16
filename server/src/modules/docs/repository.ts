import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * Docs data-access. Owns the reads this module needs: the repo row (→ RepoRef)
 * and the cross-entity "used by N agents" counts. Cross-entity reads are done
 * inline here (one query each) rather than by importing another module's
 * repository — the onion `no-cross-module-internals` rule (server INSIGHTS
 * 2026-07-31 on-read pattern).
 */

export interface RepoBasics {
  owner: string;
  name: string;
}

export class DocsRepository {
  constructor(private db: Db) {}

  /** The repo's owner/name (→ RepoRef), workspace-scoped. */
  async getRepo(workspaceId: string, repoId: string): Promise<RepoBasics | undefined> {
    const [row] = await this.db
      .select({ owner: t.repos.owner, name: t.repos.name })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  /**
   * The resolved doc set of every agent in the workspace: for each agent, its
   * own `doc_paths` unioned with the `doc_paths` of its linked skills, dedup
   * keep-first (agent order wins), returned as one deduped Set per agent.
   *
   * Two queries (agents; agent_skills⋈skills), grouped in JS — the "used by N
   * agents" count for any path is then how many of these sets contain it.
   */
  async agentResolvedDocSets(workspaceId: string): Promise<Set<string>[]> {
    const agents = await this.db
      .select({ id: t.agents.id, docPaths: t.agents.docPaths })
      .from(t.agents)
      .where(eq(t.agents.workspaceId, workspaceId));
    if (agents.length === 0) return [];

    // Skill doc_paths per agent, in link order.
    const links = await this.db
      .select({
        agentId: t.agentSkills.agentId,
        order: t.agentSkills.order,
        docPaths: t.skills.docPaths,
      })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .where(eq(t.skills.workspaceId, workspaceId));

    const skillPathsByAgent = new Map<string, { order: number; docPaths: string[] }[]>();
    for (const l of links) {
      const arr = skillPathsByAgent.get(l.agentId) ?? [];
      arr.push({ order: l.order, docPaths: l.docPaths ?? [] });
      skillPathsByAgent.set(l.agentId, arr);
    }

    return agents.map((a) => {
      const set = new Set<string>(a.docPaths ?? []);
      const skillGroups = (skillPathsByAgent.get(a.id) ?? []).sort((x, y) => x.order - y.order);
      for (const g of skillGroups) for (const p of g.docPaths) set.add(p);
      return set;
    });
  }
}
