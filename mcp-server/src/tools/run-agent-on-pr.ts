import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ApiClient, ReviewDto } from '../http/client.js';
import { ApiUnreachableError } from '../http/client.js';
import { toolOk, toolError } from '../format.js';
import { resolvePullId } from '../http/resolve.js';
import type { Config } from '../config.js';
import { log } from '../log.js';

const DESCRIPTION =
  "Runs a review agent on a pull request and blocks up to ~120s for it to finish. Args: repo (name or owner/name), pr (number), agent (name or id from devdigest_list_agents). Returns verdict, score and findings when done, or {status:'running', run_id} on timeout — pass run_id to devdigest_get_findings later. Starts a new run each call; to read an existing review, use devdigest_get_findings.";

const TERMINAL = new Set(['done', 'failed', 'cancelled']);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** concise finding for the agent (severity, title, file:line, rationale). */
function conciseFindings(reviews: ReviewDto[], runId: string) {
  const review = reviews.find((r) => r.run_id === runId) ?? reviews[0];
  if (!review) return null;
  return {
    verdict: review.verdict,
    score: review.score,
    findings: review.findings.map((f) => ({
      severity: f.severity,
      title: f.title,
      file: f.file,
      line: f.start_line,
      rationale: f.rationale,
    })),
  };
}

export function registerRunAgentOnPr(server: McpServer, client: ApiClient, cfg: Config): void {
  server.registerTool(
    'devdigest_run_agent_on_pr',
    {
      description: DESCRIPTION,
      // B2 — flat scalars only.
      inputSchema: {
        repo: z.string().min(1).describe('Repository as a name or owner/name (e.g. "acme/api").'),
        pr: z.number().int().positive().describe('Pull request number (e.g. 42).'),
        agent: z
          .string()
          .min(1)
          .describe('Agent name or id from devdigest_list_agents; names resolve to ids.'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ repo, pr, agent }) => {
      try {
        const pull = await resolvePullId(client, repo, pr);
        if (!pull.ok) return toolError(pull.message, { recovery: pull.recovery });
        const prId = pull.value.pullId;

        // Resolve the agent name/id against the agent list.
        const agents = await client.listAgents();
        const q = agent.trim().toLowerCase();
        const agentRow =
          agents.find((a) => a.id.toLowerCase() === q) ??
          agents.find((a) => a.name.toLowerCase() === q);
        if (!agentRow) {
          return toolError(`No agent matches "${agent}".`, {
            recovery: `Available agents: ${agents.map((a) => a.name).join(', ') || '(none)'}. Call devdigest_list_agents.`,
          });
        }

        // Fire the review; the API returns the run ids synchronously.
        const started = await client.runReview(prId, agentRow.id);
        const runId = started.runs[0]?.run_id;
        if (!runId) {
          return toolError('The API accepted the review but returned no run id.', {
            recovery: 'Retry, or check the API logs.',
          });
        }

        // Poll until this run is terminal or the budget elapses.
        const deadline = Date.now() + cfg.pollBudgetMs;
        while (Date.now() < deadline) {
          await sleep(cfg.pollIntervalMs);
          const runs = await client.listRunsForPull(prId);
          const run = runs.find((r) => r.run_id === runId);
          const status = run?.status ?? null;
          if (status && TERMINAL.has(status)) {
            if (status !== 'done') {
              return toolError(`Run ${status} for PR #${pr}.`, {
                recovery: 'Check the run trace in DevDigest, or retry.',
              });
            }
            const reviews = await client.reviewsForPull(prId);
            const result = conciseFindings(reviews, runId);
            if (!result) {
              return toolOk({ status: 'done', run_id: runId, verdict: null, score: null, findings: [] });
            }
            return toolOk({ status: 'done', run_id: runId, ...result });
          }
        }

        // B10 — timeout is an expected path for large PRs, not an error.
        return toolOk({
          status: 'running',
          run_id: runId,
          message: `Review still running after ${Math.round(cfg.pollBudgetMs / 1000)}s. Call devdigest_get_findings with this run_id later.`,
        });
      } catch (err) {
        if (err instanceof ApiUnreachableError) {
          return toolError(err.message, {
            recovery: 'Start the DevDigest API (./scripts/dev.sh) and retry.',
          });
        }
        log('run_agent_on_pr failed', (err as Error).message);
        return toolError(`Failed to run agent: ${(err as Error).message}`);
      }
    },
  );
}
