import type { Container } from '../../platform/container.js';
import type {
  Brief,
  BriefRisk,
  FindingActionKind,
  Intent,
  IntentSource,
  PrBriefRecord,
  RiskSeverity,
  RunEventKind,
  RunTrace,
  UnifiedDiff,
} from '@devdigest/shared';
import { LlmBriefCandidate } from '@devdigest/shared';
import { groundBriefRefs } from '@devdigest/reviewer-core';
import { AppError, NotFoundError } from '../../platform/errors.js';
import type { AgentRow } from '../../db/rows.js';
import type { RunLogger } from '../../platform/run-logger.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { readFileSafe } from '../conventions/helpers.js';
import { ReviewRepository, type StoredIntent } from './repository.js';
import { type ReviewDto, type ReviewDtoFinding } from './helpers.js';
import { ReviewRunExecutor, type Logger } from './run-executor.js';
import { actOnFinding as actOnFindingImpl } from './findings.js';
import { reviewToDto } from './helpers.js';
import { loadDiff } from './diff-loader.js';
import {
  LINKED_ISSUE_PATTERN,
  IntentResult,
  buildBriefMessages,
  buildIntentMessages,
  deriveConfidence,
  extractDocRefs,
  hunkHeaderDigest,
  renderIntentBlock,
} from './intent.js';

/**
 * Overall Brief risk = the MAX severity across its risks (AC-4). Derived in
 * CODE from the grounded risks, never trusted from the model. `low` when there
 * are no risks (an empty brief is not "high risk").
 */
const SEVERITY_RANK: Record<RiskSeverity, number> = { low: 0, medium: 1, high: 2 };
export function riskLevelFrom(risks: BriefRisk[]): RiskSeverity {
  let level: RiskSeverity = 'low';
  for (const r of risks) {
    if (SEVERITY_RANK[r.severity] > SEVERITY_RANK[level]) level = r.severity;
  }
  return level;
}

// Re-export DTO types + converters for backward-compatible imports from
// './service.js' (these previously lived here; logic now in ./helpers.ts).
export { findingRowToDto, reviewToDto } from './helpers.js';
export type { ReviewDto, ReviewDtoFinding } from './helpers.js';

/**
 * Review service (the core). Orchestrates:
 *   diff → assemblePrompt(system + repo-map + diff)
 *        → llm.completeStructured({ schema: Review }) (single-pass)
 *        → groundFindings(...) (citation gate — drops findings off the diff)
 *        → persist reviews + kept findings (+ grounding summary)
 *   while streaming RunEvents over container.runBus, and on completion writing
 *   the whole log as ONE RunTrace doc + an agent_runs row.
 *
 * Also: the finding accept/dismiss actions. The bulky run execution lives in
 * run-executor; this class keeps the public method surface.
 */
export class ReviewService {
  private repo: ReviewRepository;
  private agents: Container['agentsRepo'];
  private executor: ReviewRunExecutor;

  constructor(private container: Container) {
    this.repo = new ReviewRepository(container.db);
    this.agents = container.agentsRepo;
    this.executor = new ReviewRunExecutor(container, this.repo, this.agents, (ws, prId, opts) =>
      this.deriveIntent(ws, prId, opts),
    );
  }

  // ===========================================================================
  // Run a review for one or all enabled agents on a PR.
  // ===========================================================================

  /**
   * Resolve which agents to run. `all` → all enabled agents; else a single agent.
   */
  async resolveTargets(
    workspaceId: string,
    opts: { agentId?: string; all?: boolean },
  ): Promise<AgentRow[]> {
    if (opts.all) return this.agents.listEnabled(workspaceId);
    if (opts.agentId) {
      const agent = await this.agents.getById(workspaceId, opts.agentId);
      if (!agent) throw new NotFoundError('Agent not found');
      return [agent];
    }
    throw new AppError('invalid_run_request', 'Provide agentId or all:true', 400);
  }

  /** Delete a whole review run (one agent's pass) + its findings (cascade). */
  async deleteReview(workspaceId: string, reviewId: string): Promise<boolean> {
    return this.repo.deleteReview(workspaceId, reviewId);
  }

  /** In-flight runs for a PR (server-side source of truth, survives reload). */
  async activeRuns(workspaceId: string, prId: string) {
    return this.repo.activeRunsForPull(workspaceId, prId);
  }

  /** All runs for a PR (any status), newest first — the run history (incl. failures). */
  async listRuns(workspaceId: string, prId: string) {
    return this.repo.listRunsForPull(workspaceId, prId);
  }

  /** Delete one run from the history (+ its trace). */
  async deleteRun(workspaceId: string, runId: string): Promise<boolean> {
    return this.repo.deleteAgentRun(workspaceId, runId);
  }

  /**
   * Cancel an in-flight run. Signals a live runner to stop at its next
   * checkpoint AND marks the DB row cancelled + completes the bus immediately —
   * so cancel also works for ORPHANED runs (whose background process died on a
   * server restart) where signalling alone would do nothing.
   */
  async cancelRun(runId: string): Promise<void> {
    this.publish(runId, 'info', 'Cancellation requested — stopping…');
    this.container.runBus.cancel(runId);
    await this.repo.cancelRunIfRunning(runId);
    this.container.runBus.complete(runId);
  }

  /** Reap runs left 'running' by a previous (now-dead) process. Called on boot. */
  async reapStaleRuns(): Promise<number> {
    return this.repo.reapStaleRunningRuns();
  }

  /**
   * Run a review for each target agent. Each agent gets its own runId
   * (= agent_runs.id) created up-front so the SSE route can be subscribed
   * before/while the run progresses. A partial failure in one agent does not
   * abort the others.
   */
  async runReview(
    workspaceId: string,
    prId: string,
    targets: AgentRow[],
    logger?: Logger,
  ): Promise<{ runs: { run_id: string; agent_id: string; agent_name: string }[]; reviews: ReviewDto[] }> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const repo = await this.repo.getRepo(pull.repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    // Create the agent_run rows up front so a runId is available IMMEDIATELY —
    // the client persists these in global state and subscribes to the SSE
    // stream. The actual (slow) review runs in the background below.
    const runs: { run_id: string; agent_id: string; agent_name: string }[] = [];
    const jobs: { agent: AgentRow; runId: string }[] = [];
    for (const agent of targets) {
      const runId = await this.repo.createAgentRun({
        workspaceId,
        agentId: agent.id,
        prId,
        provider: agent.provider,
        model: agent.model,
      });
      runs.push({ run_id: runId, agent_id: agent.id, agent_name: agent.name });
      jobs.push({ agent, runId });
    }

    // Fire-and-forget: the HTTP response returns now with the runIds; reviews
    // are persisted as each agent finishes and the client refetches on SSE done.
    void this.executor.executeRuns(workspaceId, pull, repo, jobs, logger).catch((err) => {
      logger?.error({ prId, err: (err as Error).message }, 'review: background execution crashed');
    });

    return { runs, reviews: [] };
  }

  private publish(runId: string, kind: RunEventKind, msg: string, data?: unknown) {
    return this.container.runBus.publish(runId, kind, msg, data);
  }

  // ===========================================================================
  // PR intent — the cheap metadata-only classifier
  // ===========================================================================

  /** The persisted intent for a PR, or undefined when it has never been derived. */
  async getIntent(workspaceId: string, prId: string): Promise<StoredIntent | undefined> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    return this.repo.getIntent(prId);
  }

  /**
   * Derive (or re-derive) a PR's intent + scope with the cheap `review_intent`
   * model and persist it. Same shape as `ConventionsService.extract`:
   * gather sources (pure code) → resolveFeatureModel → container.llm →
   * completeStructured → **code-side gate** → persist.
   *
   * The classifier is METADATA-ONLY: title, body, linked issue, plan docs, and
   * the changed-file/hunk-position digest. It never receives a diff body.
   * `confidence` is computed by `deriveConfidence` from which sources actually
   * resolved — the model never reports it.
   */
  async deriveIntent(
    workspaceId: string,
    prId: string,
    opts: { diff?: UnifiedDiff; log?: RunLogger } = {},
  ): Promise<StoredIntent> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const repo = await this.repo.getRepo(pull.repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    const log = opts.log;

    // ---- 1. Gather sources (pure code). Every fetch is individually caught
    //         into status:'unavailable' — a failure MARKS the source, never
    //         silently drops it.
    const sources: IntentSource[] = [{ kind: 'pr_title', ref: `#${pull.number}`, status: 'used' }];
    const body = pull.body ?? '';
    const hasBody = body.trim().length > 0;
    sources.push({ kind: 'pr_body', ref: `#${pull.number}`, status: hasBody ? 'used' : 'empty' });

    const ref = { owner: repo.owner, name: repo.name };

    // Linked issue — reuse the SAME regex the octokit adapter already uses.
    let linkedIssue: { ref: string; text: string } | undefined;
    const issueMatch = body.match(LINKED_ISSUE_PATTERN);
    if (issueMatch?.[1]) {
      const issueRef = `#${issueMatch[1]}`;
      try {
        const gh = await this.container.github();
        const issue = await gh.getIssue(ref, Number(issueMatch[1]));
        linkedIssue = { ref: issueRef, text: `${issue.title}\n\n${issue.body ?? ''}` };
        sources.push({ kind: 'linked_issue', ref: issueRef, status: 'used' });
      } catch {
        // Fetch failed → mark it missing. The prompt lists it under
        // "## Missing context" and confidence is forced to `low`.
        sources.push({ kind: 'linked_issue', ref: issueRef, status: 'unavailable' });
      }
    }

    // Plan/spec docs — repo-relative paths read through git (no HTTP fetcher,
    // so no SSRF surface); external links are recorded unavailable, never fetched.
    const planDocs: { ref: string; text: string }[] = [];
    for (const cand of extractDocRefs(body)) {
      if (cand.status === 'unavailable') {
        sources.push(cand);
        continue;
      }
      const content = await readFileSafe(this.container.git, ref, cand.ref);
      if (content == null) {
        sources.push({ ...cand, status: 'unavailable' });
      } else {
        planDocs.push({ ref: cand.ref, text: content });
        sources.push(cand);
      }
    }

    // Changed files + hunk POSITIONS. Reuse the caller's already-loaded diff
    // when given one (the review pre-work path) so we don't re-load it.
    let fileDigest = '';
    try {
      const diff =
        opts.diff ?? (await loadDiff(this.container, this.repo, workspaceId, pull, repo));
      fileDigest = hunkHeaderDigest(diff);
      const fileCount = diff.files.length;
      sources.push({
        kind: 'file_list',
        ref: `${fileCount} file(s)`,
        status: fileCount > 0 ? 'used' : 'empty',
      });
      const hunkCount = diff.files.reduce((n, f) => n + f.hunks.length, 0);
      sources.push({
        kind: 'hunk_headers',
        ref: `${hunkCount} hunk(s)`,
        status: hunkCount > 0 ? 'used' : 'empty',
      });
    } catch {
      sources.push({ kind: 'file_list', ref: 'diff', status: 'unavailable' });
    }

    log?.info(
      `intent: sources — ${sources.map((s) => `${s.kind}=${s.status}`).join(', ')}`,
      sources,
    );

    // ---- 2. Cheap model → intent + scope (three fields; NO confidence).
    const { provider, model } = await resolveFeatureModel(
      this.container,
      workspaceId,
      'review_intent',
    );
    const llm = await this.container.llm(provider);
    const messages = buildIntentMessages({
      title: pull.title,
      ...(hasBody ? { body } : {}),
      ...(linkedIssue ? { linkedIssue } : {}),
      ...(planDocs.length ? { planDocs } : {}),
      ...(fileDigest ? { fileDigest } : {}),
      sources,
    });
    // provider + model id only — never a key, never any prompt content.
    log?.info(`intent: model ${provider}/${model}, ${messages.length} message(s)`);

    const { data } = await llm.completeStructured({
      model,
      schema: IntentResult,
      schemaName: 'Intent',
      messages,
      temperature: 0,
      maxTokens: 800,
    });

    // ---- 3. Code-side gate: confidence is DERIVED, never model-reported.
    const derived: Intent = {
      intent: data.intent,
      in_scope: data.in_scope,
      out_of_scope: data.out_of_scope,
      confidence: deriveConfidence(sources),
      sources,
      model: `${provider}/${model}`,
    };

    // ---- 4. Persist (PK = pr_id → a re-derive overwrites).
    await this.repo.upsertIntent(prId, derived);
    for (const s of sources.filter((x) => x.status === 'unavailable')) {
      log?.info(`intent: missing context — ${s.kind}:${s.ref} unavailable`);
    }
    log?.result(
      `intent derived: confidence=${derived.confidence}, ` +
        `${derived.in_scope.length} in-scope, ${derived.out_of_scope.length} out-of-scope`,
    );

    return (await this.repo.getIntent(prId)) ?? { ...derived, derived_at: null };
  }

  // ===========================================================================
  // PR Brief — the "what / why / where it hurts" one-glance card
  // ===========================================================================

  /** The persisted Brief for a PR, or undefined when it has never been derived. */
  async getBrief(workspaceId: string, prId: string): Promise<PrBriefRecord | undefined> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    return this.repo.getBrief(prId);
  }

  /**
   * Derive (or re-derive) a PR's Brief with the `risk_brief` model and persist
   * it keyed by the current head SHA. Same "model proposes, code disposes"
   * shape as `deriveIntent`: gather METADATA-ONLY sources (never a diff body —
   * NFR-1) → resolveFeatureModel → completeStructured → **code-side gate**
   * (ground refs against the diff/blast, derive risk_level = max severity) →
   * persist. On LLM failure, `completeStructured` throws and NOTHING is
   * persisted (AC-8).
   */
  async deriveBrief(
    workspaceId: string,
    prId: string,
    opts: { diff?: UnifiedDiff; log?: RunLogger } = {},
  ): Promise<PrBriefRecord> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const repo = await this.repo.getRepo(pull.repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    const log = opts.log;

    // ---- 1. Gather sources (pure code); each fetch marks a source status.
    const sources: IntentSource[] = [{ kind: 'pr_title', ref: `#${pull.number}`, status: 'used' }];
    const body = pull.body ?? '';
    const hasBody = body.trim().length > 0;
    sources.push({ kind: 'pr_body', ref: `#${pull.number}`, status: hasBody ? 'used' : 'empty' });

    const ref = { owner: repo.owner, name: repo.name };

    // Persisted intent (may be absent — the Brief still derives without it).
    const intent = await this.repo.getIntent(prId);
    const intentBlock = intent ? renderIntentBlock(intent) : undefined;

    // Linked issue — same regex the octokit adapter + intent classifier use.
    let linkedIssue: { ref: string; text: string } | undefined;
    const issueMatch = body.match(LINKED_ISSUE_PATTERN);
    if (issueMatch?.[1]) {
      const issueRef = `#${issueMatch[1]}`;
      try {
        const gh = await this.container.github();
        const issue = await gh.getIssue(ref, Number(issueMatch[1]));
        linkedIssue = { ref: issueRef, text: `${issue.title}\n\n${issue.body ?? ''}` };
        sources.push({ kind: 'linked_issue', ref: issueRef, status: 'used' });
      } catch {
        sources.push({ kind: 'linked_issue', ref: issueRef, status: 'unavailable' });
      }
    }

    // Plan/spec docs — repo-relative paths read through git (no HTTP fetcher).
    const planDocs: { ref: string; text: string }[] = [];
    for (const cand of extractDocRefs(body)) {
      if (cand.status === 'unavailable') {
        sources.push(cand);
        continue;
      }
      const content = await readFileSafe(this.container.git, ref, cand.ref);
      if (content == null) {
        sources.push({ ...cand, status: 'unavailable' });
      } else {
        planDocs.push({ ref: cand.ref, text: content });
        sources.push(cand);
      }
    }

    // Changed files + hunk POSITIONS (never a diff body). Reuse a passed diff.
    let fileDigest = '';
    let changedFiles = new Set<string>();
    try {
      const diff =
        opts.diff ?? (await loadDiff(this.container, this.repo, workspaceId, pull, repo));
      fileDigest = hunkHeaderDigest(diff);
      changedFiles = new Set(diff.files.map((f) => f.path));
      sources.push({
        kind: 'file_list',
        ref: `${diff.files.length} file(s)`,
        status: diff.files.length > 0 ? 'used' : 'empty',
      });
    } catch {
      sources.push({ kind: 'file_list', ref: 'diff', status: 'unavailable' });
    }

    // ---- 2. Deterministic blast summary + impacted-endpoint set. Read via the
    //         RepoIntel FACADE (never the blast module — that would add a new
    //         cross-module arch edge). Degraded/empty blast is fine (AC-18):
    //         we omit endpoint refs and keep review_focus to changed files.
    const endpoints = new Set<string>();
    let blastSummary = '';
    try {
      const changedList = [...changedFiles];
      const blast = await this.container.repoIntel.getBlastRadius(pull.repoId, changedList);
      const impacted = await this.container.repoIntel.getImpactedEndpoints(pull.repoId, changedList);
      for (const e of blast.impactedEndpoints) endpoints.add(e);
      for (const e of impacted.endpoints) endpoints.add(e.endpoint);
      const lines: string[] = [];
      if (blast.changedSymbols.length > 0) {
        lines.push(
          `Changed symbols: ${blast.changedSymbols
            .slice(0, 40)
            .map((s) => `${s.name} (${s.file})`)
            .join(', ')}`,
        );
      }
      if (endpoints.size > 0) lines.push(`Impacted endpoints: ${[...endpoints].sort().join(', ')}`);
      if (blast.degraded) lines.push('(blast index degraded — endpoint impact may be incomplete)');
      blastSummary = lines.join('\n');
    } catch {
      // A blast failure never blocks the Brief; endpoints stay empty (AC-18).
    }

    log?.info(
      `brief: sources — ${sources.map((s) => `${s.kind}=${s.status}`).join(', ')}, ` +
        `${changedFiles.size} changed file(s), ${endpoints.size} endpoint(s)`,
    );

    // ---- 3. The Brief model (structured, temperature 0 — NFR-7).
    const { provider, model } = await resolveFeatureModel(this.container, workspaceId, 'risk_brief');
    const llm = await this.container.llm(provider);
    const messages = buildBriefMessages({
      title: pull.title,
      ...(hasBody ? { body } : {}),
      ...(intentBlock ? { intentBlock } : {}),
      ...(linkedIssue ? { linkedIssue } : {}),
      ...(planDocs.length ? { planDocs } : {}),
      ...(blastSummary ? { blastSummary } : {}),
      ...(fileDigest ? { fileDigest } : {}),
      sources,
    });
    log?.info(`brief: model ${provider}/${model}, ${messages.length} message(s)`);

    // Let this THROW on provider/schema failure — nothing is persisted (AC-8).
    const result = await llm.completeStructured({
      model,
      schema: LlmBriefCandidate,
      schemaName: 'Brief',
      messages,
      temperature: 0,
      maxTokens: 1500,
    });

    // ---- 4. Code-side gate: ground refs against the diff + blast, then derive
    //         risk_level as the max severity of the grounded risks (AC-4/5).
    const grounded = groundBriefRefs(
      { risks: result.data.risks, review_focus: result.data.review_focus },
      { changedFiles, endpoints },
    );
    for (const d of grounded.dropped) {
      log?.info(`brief: dropped ref for PR #${pull.number} — ${d.ref} (${d.reason})`);
    }

    const brief: Brief = {
      what: result.data.what,
      why: result.data.why,
      risk_level: riskLevelFrom(grounded.risks),
      risks: grounded.risks,
      review_focus: grounded.review_focus,
    };

    // ---- 5. Persist keyed by head SHA (AC-3/6) with the Brief's OWN cost
    //         fields (NFR-5). Overwrites regardless of state_key match (AC-6).
    await this.repo.upsertBrief(prId, brief, {
      stateKey: pull.headSha,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      costUsd: result.costUsd,
      model: `${provider}/${model}`,
    });
    log?.result(
      `brief derived: risk_level=${brief.risk_level}, ${brief.risks.length} risk(s), ` +
        `${brief.review_focus.length} focus item(s)`,
    );

    return (await this.repo.getBrief(prId)) as PrBriefRecord;
  }

  // ===========================================================================
  // Finding actions
  // ===========================================================================

  async actOnFinding(
    workspaceId: string,
    findingId: string,
    action: FindingActionKind,
  ): Promise<{ finding: ReviewDtoFinding }> {
    return actOnFindingImpl(this.repo, workspaceId, findingId, action);
  }

  // ===========================================================================
  // Reads
  // ===========================================================================

  async reviewsForPull(workspaceId: string, prId: string): Promise<ReviewDto[]> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const rows = await this.repo.reviewsForPull(prId);
    const names = new Map<string, string>();
    for (const { review } of rows) {
      if (review.agentId && !names.has(review.agentId)) {
        const a = await this.agents.getById(workspaceId, review.agentId);
        if (a) names.set(review.agentId, a.name);
      }
    }
    return rows.map(({ review, findings }) =>
      reviewToDto(review, findings, review.agentId ? names.get(review.agentId) : null),
    );
  }

  async getRunTrace(runId: string): Promise<RunTrace | undefined> {
    return this.repo.getRunTrace(runId);
  }
}
