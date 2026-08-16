import type { Container } from '../../platform/container.js';
import type { CommunitySkill, Skill, SkillType } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import { SkillsRepository } from './repository.js';
import { toSkillDto, deriveSkillName, extractSkillFromZip, COMMUNITY_CATALOG } from './helpers.js';
import { DEFAULT_SKILL_TYPE } from './constants.js';

/**
 * A1 — skills service. Business logic for the Skills tab + Skill editor.
 *
 * A Skill = a markdown rule/rubric/convention injected into review prompts. The
 * body is versioned via `skill_versions` (repository); name/type/enabled edits
 * don't bump. Skills arrive four ways (source): manually authored, extracted
 * from an uploaded file/zip, or imported from the community catalog. Imported
 * skills land DISABLED so they're reviewed before they affect any review.
 */

export { toSkillDto } from './helpers.js';

/** A body snapshot returned by the versions endpoints (no shared contract). */
export interface SkillVersionDto {
  skill_id: string;
  version: number;
  body: string;
  created_at: string;
}

/** Usage + effectiveness stats for a skill (read-only; real data only). */
export interface SkillStatsDto {
  used_by: number;
  agents: { id: string; name: string }[];
  findings_30d: number;
  accept_rate: number;
  findings_by_category: { category: string; count: number }[];
}

export interface CreateSkillInput {
  name: string;
  description?: string;
  type: SkillType;
  body: string;
  enabled?: boolean;
}

export interface UpdateSkillInput {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
  doc_paths?: string[];
}

export class SkillsService {
  private repo: SkillsRepository;

  constructor(private container: Container) {
    this.repo = new SkillsRepository(container.db);
  }

  async list(workspaceId: string): Promise<Skill[]> {
    const rows = await this.repo.list(workspaceId);
    // "Used by N agents" per skill — one inArray count, then map in JS (AC-21).
    const counts = await this.repo.usedByAgentsCounts(
      workspaceId,
      rows.map((r) => r.id),
    );
    return rows.map((r) => toSkillDto(r, counts.get(r.id) ?? 0));
  }

  async get(workspaceId: string, id: string): Promise<Skill | undefined> {
    const row = await this.repo.getById(workspaceId, id);
    if (!row) return undefined;
    const counts = await this.repo.usedByAgentsCounts(workspaceId, [id]);
    return toSkillDto(row, counts.get(id) ?? 0);
  }

  /** Delete a skill (and its versions / agent links, via cascade). */
  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteById(workspaceId, id);
  }

  async create(workspaceId: string, input: CreateSkillInput): Promise<Skill> {
    const row = await this.repo.insert({
      workspaceId,
      name: input.name,
      ...(input.description !== undefined ? { description: input.description } : {}),
      type: input.type,
      source: 'manual',
      body: input.body,
      enabled: input.enabled ?? true,
    });
    return toSkillDto(row);
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateSkillInput,
  ): Promise<Skill | undefined> {
    const row = await this.repo.update(workspaceId, id, {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.type !== undefined ? { type: patch.type } : {}),
      ...(patch.body !== undefined ? { body: patch.body } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      ...(patch.doc_paths !== undefined ? { docPaths: patch.doc_paths } : {}),
    });
    if (!row) return undefined;
    const counts = await this.repo.usedByAgentsCounts(workspaceId, [id]);
    return toSkillDto(row, counts.get(id) ?? 0);
  }

  /** Import a raw markdown body as an extracted, disabled skill. */
  async importFile(
    workspaceId: string,
    input: { name?: string; body: string },
  ): Promise<Skill> {
    const row = await this.repo.insert({
      workspaceId,
      name: input.name ?? deriveSkillName(input.body),
      type: DEFAULT_SKILL_TYPE,
      source: 'extracted',
      body: input.body,
      enabled: false,
    });
    return toSkillDto(row);
  }

  /** Import a skill from a base64 zip: extract SKILL.md, then same as importFile. */
  async importZip(
    workspaceId: string,
    input: { name?: string; dataBase64: string },
  ): Promise<Skill> {
    const bytes = Buffer.from(input.dataBase64, 'base64');
    const extracted = extractSkillFromZip(bytes);
    return this.importFile(workspaceId, {
      name: input.name ?? extracted.name,
      body: extracted.body,
    });
  }

  /** The public community catalog (only the CommunitySkill fields). */
  communityCatalog(): CommunitySkill[] {
    return COMMUNITY_CATALOG.map(({ name, repo, stars, lang, desc }) => ({
      name,
      repo,
      stars,
      lang,
      desc,
    }));
  }

  /** Import a catalog skill by name as a community, disabled skill. */
  async importCommunity(workspaceId: string, name: string): Promise<Skill> {
    const entry = COMMUNITY_CATALOG.find((s) => s.name === name);
    if (!entry) throw new NotFoundError('Community skill not found');
    const row = await this.repo.insert({
      workspaceId,
      name: entry.name,
      description: entry.desc,
      type: entry.type,
      source: 'community',
      body: entry.body,
      enabled: false,
    });
    return toSkillDto(row);
  }

  /**
   * Body history for a skill, newest version first. Workspace-scoped: undefined
   * when the skill isn't in this workspace (route → 404).
   */
  async listVersions(workspaceId: string, skillId: string): Promise<SkillVersionDto[] | undefined> {
    const skill = await this.repo.getById(workspaceId, skillId);
    if (!skill) return undefined;
    const rows = await this.repo.listVersions(skillId);
    return rows.map((r) => ({
      skill_id: r.skillId,
      version: r.version,
      body: r.body,
      created_at: r.createdAt.toISOString(),
    }));
  }

  /** A single body snapshot. Undefined when skill/version absent (route → 404). */
  async getVersion(
    workspaceId: string,
    skillId: string,
    version: number,
  ): Promise<SkillVersionDto | undefined> {
    const skill = await this.repo.getById(workspaceId, skillId);
    if (!skill) return undefined;
    const row = await this.repo.getVersion(skillId, version);
    return row
      ? {
          skill_id: row.skillId,
          version: row.version,
          body: row.body,
          created_at: row.createdAt.toISOString(),
        }
      : undefined;
  }

  /** Restore a past body — creates a new version with it. Undefined → 404. */
  async restoreVersion(
    workspaceId: string,
    id: string,
    version: number,
  ): Promise<Skill | undefined> {
    const row = await this.repo.restoreVersion(workspaceId, id, version);
    return row ? toSkillDto(row) : undefined;
  }

  /** Usage + effectiveness stats. Undefined when the skill isn't in the workspace. */
  async stats(workspaceId: string, id: string): Promise<SkillStatsDto | undefined> {
    const skill = await this.repo.getById(workspaceId, id);
    if (!skill) return undefined;
    const agents = await this.repo.agentsUsingSkill(workspaceId, id);
    const findings = await this.repo.findingStats(workspaceId, id);
    return {
      used_by: agents.length,
      agents,
      findings_30d: findings.findings_30d,
      accept_rate: findings.accept_rate,
      findings_by_category: findings.findings_by_category,
    };
  }
}
