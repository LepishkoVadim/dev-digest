import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ApiClient, ReviewDto, FindingDto } from '../http/client.js';
import { ApiUnreachableError } from '../http/client.js';
import { toolOk, toolError } from '../format.js';
import { resolvePullId } from '../http/resolve.js';
import { log } from '../log.js';

const DESCRIPTION =
  "Fetches findings for an already-completed review, without starting a new run. Identify it by run_id (from devdigest_run_agent_on_pr) or by repo + pr. response_format 'concise' (default) returns verdict, score and paginated findings (severity, title, file:line); 'detailed' adds rationale and suggestion. Use offset/limit to page large sets. Read-only.";

function shape(f: FindingDto, detailed: boolean) {
  const base = { severity: f.severity, title: f.title, file: f.file, line: f.start_line };
  if (!detailed) return base;
  return { ...base, rationale: f.rationale, suggestion: f.suggestion ?? null };
}

/** Pick the review by run_id if given, else the first (latest) review. */
function pickReview(reviews: ReviewDto[], runId?: string): ReviewDto | undefined {
  if (runId) return reviews.find((r) => r.run_id === runId);
  return reviews[0];
}

export function registerGetFindings(server: McpServer, client: ApiClient): void {
  server.registerTool(
    'devdigest_get_findings',
    {
      description: DESCRIPTION,
      // B2 — flat scalars; identify by run_id OR repo+pr.
      inputSchema: {
        run_id: z
          .string()
          .optional()
          .describe('Run id from devdigest_run_agent_on_pr. Preferred identifier when known.'),
        repo: z.string().optional().describe('Repository name or owner/name (with pr).'),
        pr: z.number().int().positive().optional().describe('Pull request number (with repo).'),
        response_format: z
          .enum(['concise', 'detailed'])
          .default('concise')
          .describe("'concise' = severity/title/file:line; 'detailed' adds rationale/suggestion."),
        offset: z.number().int().min(0).default(0).describe('Findings to skip (pagination).'),
        limit: z.number().int().min(1).max(100).default(50).describe('Max findings to return.'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ run_id, repo, pr, response_format, offset, limit }) => {
      try {
        // Need a PR id to read /pulls/:id/reviews. Derive it from repo+pr when
        // run_id alone is given, there's no run→pr endpoint, so require repo+pr.
        if (repo === undefined || pr === undefined) {
          return toolError('Provide repo and pr to locate the review.', {
            recovery:
              'Pass repo (name or owner/name) and pr (number); optionally run_id to select a specific run.',
          });
        }
        const pull = await resolvePullId(client, repo, pr);
        if (!pull.ok) return toolError(pull.message, { recovery: pull.recovery });

        const reviews = await client.reviewsForPull(pull.value.pullId);
        const review = pickReview(reviews, run_id);
        if (!review) {
          const recovery = run_id
            ? 'No review for that run_id yet — the run may still be in progress; retry later.'
            : 'This PR has no completed review yet — run devdigest_run_agent_on_pr first.';
          // Empty is a success, but "no matching review" is a not-found — flag it.
          return toolError('No matching review found.', { recovery });
        }

        const detailed = response_format === 'detailed';
        const total = review.findings.length;
        const page = review.findings.slice(offset, offset + limit).map((f) => shape(f, detailed));
        return toolOk({
          run_id: review.run_id,
          verdict: review.verdict,
          score: review.score,
          total,
          offset,
          limit,
          findings: page,
        });
      } catch (err) {
        if (err instanceof ApiUnreachableError) {
          return toolError(err.message, {
            recovery: 'Start the DevDigest API (./scripts/dev.sh) and retry.',
          });
        }
        log('get_findings failed', (err as Error).message);
        return toolError(`Failed to get findings: ${(err as Error).message}`);
      }
    },
  );
}
