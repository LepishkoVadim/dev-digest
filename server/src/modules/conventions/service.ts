import type { ConventionCandidate, Skill } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { SkillsRepository } from '../skills/repository.js';
import { AgentsRepository } from '../agents/repository.js';
import { RepoRepository } from '../repos/repository.js';
import { toSkillDto } from '../skills/helpers.js';
import { ConventionsRepository, type InsertConvention } from './repository.js';
import {
  CONFIG_PATHS,
  SAMPLE_FILE_COUNT,
  ExtractionResult,
  buildExtractionMessages,
  buildSkillBody,
  conventionsSkillName,
  readFileSafe,
  toCandidateDto,
  verifySnippet,
  type Sample,
} from './helpers.js';

/**
 * Conventions Extractor — the pipeline is: sample (code) → cheap LLM → code-side
 * evidence gate → persist candidates. Sampling and verification are pure code;
 * only the middle step touches a model, and the gate throws out anything the
 * model couldn't ground in real source. Accepted candidates merge into ONE
 * `extracted` skill (optionally linked to an agent) — the whole point of the
 * feature.
 */
export class ConventionsService {
  private repo: ConventionsRepository;
  private skills: SkillsRepository;
  private agents: AgentsRepository;
  private repos: RepoRepository;

  constructor(private container: Container) {
    this.repo = new ConventionsRepository(container.db);
    this.skills = new SkillsRepository(container.db);
    this.agents = new AgentsRepository(container.db);
    this.repos = new RepoRepository(container.db);
  }

  async list(workspaceId: string, repoId: string): Promise<ConventionCandidate[]> {
    const rows = await this.repo.listByRepo(workspaceId, repoId);
    return rows.map(toCandidateDto);
  }

  /** Run extraction end-to-end and return the freshly-persisted candidates. */
  async extract(workspaceId: string, repoId: string): Promise<ConventionCandidate[]> {
    const repo = await this.repos.getById(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    const ref = { owner: repo.owner, name: repo.name };

    // 1. Sample — configs + top-ranked source files (all code, no model).
    const samples = await this.gatherSamples(repoId, ref);
    if (samples.length === 0) {
      throw new AppError(
        'no_samples',
        'No readable files to sample — is the repo cloned and indexed?',
        409,
      );
    }

    // 2. Cheap model → candidate rules with claimed evidence.
    const { provider, model } = await resolveFeatureModel(this.container, workspaceId, 'conventions');
    const llm = await this.container.llm(provider);
    const { data } = await llm.completeStructured({
      model,
      schema: ExtractionResult,
      schemaName: 'conventions',
      messages: buildExtractionMessages(samples),
      temperature: 0,
      maxTokens: 2000,
    });

    // 3. Code-side evidence gate — drop anything not grounded in real source,
    //    and pin each survivor to the verified line.
    const verified: InsertConvention[] = [];
    for (const c of data.candidates) {
      const content = await readFileSafe(this.container.git, ref, c.evidence_path);
      if (content == null) continue; // file doesn't exist → drop
      const line = verifySnippet(content, c.evidence_snippet);
      if (line == null) continue; // snippet not in file → drop
      verified.push({
        workspaceId,
        repoId,
        rule: c.rule,
        evidencePath: c.evidence_path,
        evidenceLine: line,
        evidenceSnippet: c.evidence_snippet,
        confidence: c.confidence,
      });
    }

    // 4. Persist (keeps previously-accepted rules).
    await this.repo.replaceUnaccepted(workspaceId, repoId, verified);
    return this.list(workspaceId, repoId);
  }

  async update(
    workspaceId: string,
    id: string,
    patch: { rule?: string; evidence_snippet?: string; accepted?: boolean },
  ): Promise<ConventionCandidate | undefined> {
    const row = await this.repo.update(workspaceId, id, {
      ...(patch.rule !== undefined ? { rule: patch.rule } : {}),
      ...(patch.evidence_snippet !== undefined ? { evidenceSnippet: patch.evidence_snippet } : {}),
      ...(patch.accepted !== undefined ? { accepted: patch.accepted } : {}),
    });
    return row ? toCandidateDto(row) : undefined;
  }

  /**
   * Build one `extracted`/`convention` skill from this repo's ACCEPTED
   * candidates. `body` is optional so the modal can save an edited version;
   * otherwise we render it from the accepted rules. When `agentId` is given the
   * skill is linked to that agent (appended after its existing skills).
   */
  async createSkill(
    workspaceId: string,
    repoId: string,
    input: { name?: string; description?: string; body?: string; enabled?: boolean; agentId?: string },
  ): Promise<Skill> {
    const repo = await this.repos.getById(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    const acceptedRows = await this.repo.listAccepted(workspaceId, repoId);
    if (acceptedRows.length === 0) {
      throw new AppError('no_accepted', 'No accepted conventions to build a skill from', 400);
    }
    const accepted = acceptedRows.map(toCandidateDto);

    const skillRow = await this.skills.insert({
      workspaceId,
      name: input.name ?? conventionsSkillName(repo.name),
      description:
        input.description ?? `${accepted.length} house conventions extracted from ${repo.name}`,
      type: 'convention',
      source: 'extracted',
      body: input.body ?? buildSkillBody(repo.name, accepted),
      enabled: input.enabled ?? true,
      evidenceFiles: accepted.map((c) => c.evidence_path),
    });

    if (input.agentId) {
      const agent = await this.agents.getById(workspaceId, input.agentId);
      if (!agent) throw new NotFoundError('Agent not found');
      const order = (await this.agents.linkedSkills(input.agentId)).length;
      await this.agents.linkSkill(input.agentId, skillRow.id, order);
    }

    return toSkillDto(skillRow);
  }

  /** Configs (if present) + top-ranked source files, each read from the clone. */
  private async gatherSamples(repoId: string, ref: { owner: string; name: string }): Promise<Sample[]> {
    const out: Sample[] = [];
    for (const path of CONFIG_PATHS) {
      const content = await readFileSafe(this.container.git, ref, path);
      if (content) out.push({ path, content });
    }
    const paths = await this.container.repoIntel.getConventionSamples(repoId, SAMPLE_FILE_COUNT);
    for (const path of paths) {
      const content = await readFileSafe(this.container.git, ref, path);
      if (content) out.push({ path, content });
    }
    return out;
  }
}
