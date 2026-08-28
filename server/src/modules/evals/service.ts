import type { Container } from '../../platform/container.js';
import type {
  EvalCase,
  EvalCaseInput,
  EvalDashboard,
  EvalRunRecord,
  EvalRunResult,
  EvalOwnerKind,
  ExpectationKind,
  Finding,
  Provider,
  UnifiedDiff,
} from '@devdigest/shared';
import { ExpectedFindings } from '@devdigest/shared';
import { reviewPullRequest, wrapUntrusted } from '@devdigest/reviewer-core';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import { ValidationError } from '../../platform/errors.js';
import { EvalsRepository, type EvalCaseRow, type EvalRunRow } from './repository.js';
import { scoreCases, type ScoringCase } from './scoring.js';
import { toEvalCaseDto, toEvalRunDto, expectationKindOf, expectedFindingsOf } from './helpers.js';
import { EVAL_REVIEW_STRATEGY } from './constants.js';

/**
 * Evals service (L06) — case CRUD (with the 422 authorship gates) and run
 * execution. A run loads the owner's cases, resolves the owner version, and for
 * each case executes the REAL reviewer (`reviewPullRequest`, through the same
 * grounding + injection guard as a normal review — never a bypass), then scores
 * deterministically (`scoring.ts`, zero LLM). Per-case failures are isolated.
 *
 * Skill owners run each case TWICE — with the skill's body linked and without —
 * recording the without-skill baseline in `actual_output.without_skill` (AC-10).
 * Agent owners record a single metric set (AC-11).
 */
export class EvalsService {
  private repo: EvalsRepository;

  constructor(private container: Container) {
    this.repo = new EvalsRepository(container.db);
  }

  // ---- case CRUD ----------------------------------------------------------

  async listCases(
    workspaceId: string,
    ownerKind: EvalOwnerKind,
    ownerId: string,
  ): Promise<EvalCase[]> {
    const rows = await this.repo.listCases(workspaceId, ownerKind, ownerId);
    return rows.map(toEvalCaseDto);
  }

  async createCase(workspaceId: string, input: EvalCaseInput): Promise<EvalCase> {
    this.assertValidCase(input);
    const inputMeta = this.mergeExpectationKind(input.input_meta, input.expectation_kind ?? null);
    const row = await this.repo.insertCase({
      workspaceId,
      ownerKind: input.owner_kind,
      ownerId: input.owner_id,
      name: input.name,
      inputDiff: input.input_diff ?? '',
      inputFiles: input.input_files ?? null,
      inputMeta,
      expectedOutput: input.expected_output ?? [],
      notes: input.notes ?? null,
    });
    return toEvalCaseDto(row);
  }

  async updateCase(
    workspaceId: string,
    id: string,
    input: EvalCaseInput,
  ): Promise<EvalCase | undefined> {
    this.assertValidCase(input);
    const inputMeta = this.mergeExpectationKind(input.input_meta, input.expectation_kind ?? null);
    const row = await this.repo.updateCase(workspaceId, id, {
      name: input.name,
      inputDiff: input.input_diff ?? '',
      inputFiles: input.input_files ?? null,
      inputMeta,
      expectedOutput: input.expected_output ?? [],
      notes: input.notes ?? null,
    });
    return row ? toEvalCaseDto(row) : undefined;
  }

  async deleteCase(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteCase(workspaceId, id);
  }

  /**
   * The two save-time 422 gates (AC-2, AC-16): reject an unset expectation_kind
   * and an `expected_output` that fails the `ExpectedFinding[]` schema.
   */
  private assertValidCase(input: EvalCaseInput): void {
    if (input.expectation_kind == null) {
      throw new ValidationError('expectation_kind is required (must_find or must_not_flag)');
    }
    const parsed = ExpectedFindings.safeParse(input.expected_output ?? []);
    if (!parsed.success) {
      throw new ValidationError('expected_output must be an ExpectedFinding[]', parsed.error.issues);
    }
  }

  private mergeExpectationKind(inputMeta: unknown, kind: ExpectationKind | null): unknown {
    const base =
      inputMeta && typeof inputMeta === 'object' && !Array.isArray(inputMeta)
        ? (inputMeta as Record<string, unknown>)
        : {};
    return { ...base, expectation_kind: kind };
  }

  // ---- run execution ------------------------------------------------------

  /**
   * Run every case in an owner's set through the real reviewer + scoring, one
   * `eval_runs` row per case. Empty case set → 422 (AC-20). For a skill owner
   * the linked agent is resolved (0/>1 → 422, AC-10 / edge case).
   */
  async runOwner(
    workspaceId: string,
    ownerKind: EvalOwnerKind,
    ownerId: string,
  ): Promise<EvalRunResult[]> {
    const cases = await this.repo.listCases(workspaceId, ownerKind, ownerId);
    if (cases.length === 0) {
      throw new ValidationError(
        `No eval cases for this ${ownerKind}; add at least one case before running.`,
      );
    }

    const version = await this.repo.currentOwnerVersion(workspaceId, ownerKind, ownerId);

    // Resolve the executor agent + optional skill block up front (skill owner
    // needs a single linked agent to run through; agent owner runs itself).
    const exec = await this.resolveExecutor(workspaceId, ownerKind, ownerId);

    const results: EvalRunResult[] = [];
    for (const caseRow of cases) {
      const { record, result } = await this.runCase(caseRow, exec, ownerKind, version);
      results.push({ run_id: record.id, case_id: caseRow.id, result });
    }

    return results;
  }

  /**
   * Run exactly one persisted case (AC-9/10/21) — the per-case path shared by
   * `runOwner` and the single-case route. Executes the real reviewer (with the
   * skill block for a skill owner, plus the without-skill baseline), scores
   * deterministically, persists one `eval_runs` row stamped with `version`, and
   * returns both the persisted row and the metrics. Per-case failures are
   * isolated here (pass=false, null metrics, error in actual_output).
   */
  private async runCase(
    caseRow: EvalCaseRow,
    exec: ResolvedExecutor,
    ownerKind: EvalOwnerKind,
    version: number | null,
  ): Promise<{ record: EvalRunRow; result: EvalRunResult['result'] }> {
    const started = Date.now();
    const expectationKind = expectationKindOf(caseRow.inputMeta) ?? 'must_find';
    const expected = expectedFindingsOf(caseRow.expectedOutput);
    try {
      const diff = parseUnifiedDiff(caseRow.inputDiff ?? '');

      // WITH the skill (for a skill owner) / the plain agent run.
      const withRun = await this.reviewOnce(exec, diff, exec.skillBlocks);
      const withScore = scoreCases([toScoringCase(expectationKind, expected, withRun)]);

      let withoutStash: Record<string, unknown> | undefined;
      if (ownerKind === 'skill') {
        // WITHOUT the skill — same agent, skill block removed (AC-10).
        const withoutRun = await this.reviewOnce(exec, diff, []);
        const withoutScore = scoreCases([toScoringCase(expectationKind, expected, withoutRun)]);
        withoutStash = {
          without_skill: {
            recall: withoutScore.recall,
            precision: withoutScore.precision,
            citation_accuracy: withoutScore.citation_accuracy,
            cost_usd: withoutRun.costUsd,
          },
        };
      }

      const pass = withScore.recall === 1 && withScore.precision === 1;
      const record = await this.repo.insertRun({
        caseId: caseRow.id,
        actualOutput: {
          findings: withRun.findings,
          grounding: withRun.grounding,
          ...(withoutStash ?? {}),
        },
        pass,
        recall: withScore.recall,
        precision: withScore.precision,
        citationAccuracy: withScore.citation_accuracy,
        durationMs: Date.now() - started,
        costUsd: withRun.costUsd,
        version,
      });
      return {
        record,
        result: {
          recall: withScore.recall,
          precision: withScore.precision,
          citation_accuracy: withScore.citation_accuracy,
          traces_passed: pass ? 1 : 0,
          traces_total: 1,
          duration_ms: record.durationMs ?? 0,
          cost_usd: withRun.costUsd,
          per_trace: [],
        },
      };
    } catch (err) {
      // Per-case isolation (AC-21): persist pass=false, null metrics, the
      // provider error verbatim in actual_output; continue the run.
      const message = (err as Error).message;
      const record = await this.repo.insertRun({
        caseId: caseRow.id,
        actualOutput: { error: message },
        pass: false,
        recall: null,
        precision: null,
        citationAccuracy: null,
        durationMs: Date.now() - started,
        costUsd: null,
        version,
      });
      return {
        record,
        result: {
          recall: 0,
          precision: 0,
          citation_accuracy: 0,
          traces_passed: 0,
          traces_total: 1,
          duration_ms: record.durationMs ?? 0,
          cost_usd: null,
          per_trace: [{ name: caseRow.name, pass: false, expected: null, actual: message }],
        },
      };
    }
  }

  /**
   * Run one persisted case by id through the SAME per-case path as an owner run
   * (POST /evals/cases/:id/run). Resolves the case's owner + version, executes
   * `reviewPullRequest`, persists the `eval_runs` row, and returns the record.
   */
  async runSingleCase(workspaceId: string, caseId: string): Promise<EvalRunRecord | undefined> {
    const caseRow = await this.repo.getCase(workspaceId, caseId);
    if (!caseRow) return undefined;
    const ownerKind = caseRow.ownerKind;
    const ownerId = caseRow.ownerId;
    const version = await this.repo.currentOwnerVersion(workspaceId, ownerKind, ownerId);
    const exec = await this.resolveExecutor(workspaceId, ownerKind, ownerId);
    const { record } = await this.runCase(caseRow, exec, ownerKind, version);
    return toEvalRunDto(record, caseRow.name);
  }

  // ---- dashboard read -----------------------------------------------------

  async listRuns(
    workspaceId: string,
    ownerKind: EvalOwnerKind,
    ownerId: string,
  ): Promise<EvalRunRecord[]> {
    const rows = await this.repo.listRunsForOwner(workspaceId, ownerKind, ownerId);
    return rows.map((r) => toEvalRunDto(r.run, r.caseName));
  }

  /**
   * Per-owner dashboard aggregate (AC-15). `ownerId` alone is ambiguous over
   * kind, so we resolve the owner kind by which table the id belongs to. Reads
   * the last *completed* run's metrics for the cards (AC-23 is a client concern:
   * an in-flight row is client-side), the previous run for the delta, and the
   * chronological trend.
   */
  async dashboard(workspaceId: string, ownerId: string): Promise<EvalDashboard> {
    const ownerKind = await this.resolveOwnerKind(workspaceId, ownerId);
    if (!ownerKind) {
      return emptyDashboard(null, ownerId, 0);
    }
    const cases = await this.repo.listCases(workspaceId, ownerKind, ownerId);
    const runs = await this.listRuns(workspaceId, ownerKind, ownerId); // newest first

    if (runs.length === 0) {
      return emptyDashboard(ownerKind, ownerId, cases.length);
    }

    const latest = runs[0]!;
    const previous = runs[1];
    const num = (v: number | null) => v ?? 0;
    const current = {
      recall: num(latest.recall),
      precision: num(latest.precision),
      citation_accuracy: num(latest.citation_accuracy),
      traces_passed: latest.pass ? 1 : 0,
      traces_total: 1,
      cost_usd: latest.cost_usd,
    };
    const delta = {
      recall: num(latest.recall) - num(previous?.recall ?? null),
      precision: num(latest.precision) - num(previous?.precision ?? null),
      citation_accuracy: num(latest.citation_accuracy) - num(previous?.citation_accuracy ?? null),
    };
    // Trend is chronological (oldest → newest) for the multi-line chart.
    const trend = [...runs].reverse().map((r) => ({
      ran_at: r.ran_at,
      recall: num(r.recall),
      precision: num(r.precision),
      citation_accuracy: num(r.citation_accuracy),
      pass_rate: r.pass ? 1 : 0,
      cost_usd: r.cost_usd,
    }));

    return {
      owner_kind: ownerKind,
      owner_id: ownerId,
      cases_total: cases.length,
      current,
      delta,
      trend,
      recent_runs: runs,
      alert: null,
    };
  }

  /**
   * The owner's config snapshot text at a version (AC-17) — the agent's
   * `system_prompt` or the skill body. Owner kind is inferred from the id.
   * Delegates to the repository's existing version-snapshot reads.
   */
  async versionText(
    workspaceId: string,
    ownerId: string,
    version: number,
  ): Promise<{ version: number; text: string | null }> {
    const ownerKind = await this.resolveOwnerKind(workspaceId, ownerId);
    const text =
      ownerKind === 'agent'
        ? await this.repo.agentPromptAtVersion(ownerId, version)
        : ownerKind === 'skill'
          ? await this.repo.skillBodyAtVersion(ownerId, version)
          : null;
    return { version, text };
  }

  /** Which owner table this id belongs to (agent vs skill), workspace-scoped. */
  private async resolveOwnerKind(
    workspaceId: string,
    ownerId: string,
  ): Promise<EvalOwnerKind | null> {
    if (await this.repo.getAgent(workspaceId, ownerId)) return 'agent';
    if (await this.repo.getSkill(workspaceId, ownerId)) return 'skill';
    return null;
  }

  // ---- executor resolution ------------------------------------------------

  private async resolveExecutor(
    workspaceId: string,
    ownerKind: EvalOwnerKind,
    ownerId: string,
  ): Promise<ResolvedExecutor> {
    if (ownerKind === 'agent') {
      const agent = await this.repo.getAgent(workspaceId, ownerId);
      if (!agent) throw new ValidationError('Agent not found in this workspace');
      return { agent, skillBlocks: [] };
    }

    // Skill owner: resolve the single linked agent to execute the review through.
    const skill = await this.repo.getSkill(workspaceId, ownerId);
    if (!skill) throw new ValidationError('Skill not found in this workspace');
    const agents = await this.repo.agentsLinkingSkill(workspaceId, ownerId);
    if (agents.length === 0) {
      throw new ValidationError(
        'This skill is linked to no agent — link it to exactly one agent to run its evals.',
      );
    }
    if (agents.length > 1) {
      throw new ValidationError(
        `This skill is linked to ${agents.length} agents with no default — designate one to run its evals.`,
      );
    }
    const agent = await this.repo.getAgent(workspaceId, agents[0]!.id);
    if (!agent) throw new ValidationError('Linked agent not found in this workspace');

    // The skill's body is the with-skill block; manual bodies raw, others wrapped.
    const block = skill.source === 'manual' ? skill.body : wrapUntrusted(`skill:${skill.name}`, skill.body);
    return { agent, skillBlocks: [block] };
  }

  /** One `reviewPullRequest` over a case diff with the given skill blocks. */
  private async reviewOnce(
    exec: ResolvedExecutor,
    diff: UnifiedDiff,
    skillBlocks: string[],
  ): Promise<ReviewCaseResult> {
    const { agent } = exec;
    const llm = await this.container.llm(agent.provider as Provider);
    const outcome = await reviewPullRequest({
      systemPrompt: agent.systemPrompt,
      model: agent.model,
      diff,
      llm,
      strategy: EVAL_REVIEW_STRATEGY,
      ...(skillBlocks.length ? { skills: skillBlocks } : {}),
    });
    const proposedCount = outcome.review.findings.length + outcome.dropped.length;
    return {
      findings: outcome.review.findings,
      proposedCount,
      groundedCount: outcome.review.findings.length,
      grounding: outcome.grounding,
      costUsd: outcome.costUsd,
    };
  }
}

interface ResolvedExecutor {
  agent: {
    provider: string;
    model: string;
    systemPrompt: string;
  };
  skillBlocks: string[];
}

interface ReviewCaseResult {
  findings: Finding[];
  proposedCount: number;
  groundedCount: number;
  grounding: string;
  costUsd: number | null;
}

/** Empty-history dashboard (no runs → no plot; cards read "no runs yet"). */
function emptyDashboard(
  ownerKind: EvalOwnerKind | null,
  ownerId: string,
  casesTotal: number,
): EvalDashboard {
  return {
    owner_kind: ownerKind,
    owner_id: ownerId,
    cases_total: casesTotal,
    current: {
      recall: 0,
      precision: 0,
      citation_accuracy: 0,
      traces_passed: 0,
      traces_total: 0,
      cost_usd: null,
    },
    delta: { recall: 0, precision: 0, citation_accuracy: 0 },
    trend: [],
    recent_runs: [],
    alert: null,
  };
}

/** Assemble one case's scoring input from a review result. */
function toScoringCase(
  expectationKind: ExpectationKind,
  expected: import('@devdigest/shared').ExpectedFinding[],
  run: ReviewCaseResult,
): ScoringCase {
  return {
    expectation_kind: expectationKind,
    expected,
    actual: run.findings.map((f) => ({
      file: f.file,
      start_line: f.start_line,
      end_line: f.end_line,
    })),
    proposedCount: run.proposedCount,
    groundedCount: run.groundedCount,
  };
}
