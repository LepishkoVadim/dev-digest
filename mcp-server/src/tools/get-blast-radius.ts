import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ApiClient, BlastReportDto } from '../http/client.js';
import { ApiUnreachableError } from '../http/client.js';
import { toolOk, toolError } from '../format.js';
import { resolvePullId } from '../http/resolve.js';
import { log } from '../log.js';

const DESCRIPTION =
  'Returns the blast radius (potential impact) of a pull request, read straight from the DevDigest code index — no LLM. For each symbol declared in the PR\'s changed files it lists cross-file callers (as file:line) and the HTTP endpoints that may be affected via the reverse import graph. Args: repo (name or owner/name), pr (number). status is one of ok/partial/degraded/empty; degraded means no usable index was built for the repo. Read-only.';

/**
 * Shape the full report into a compact, agent-friendly result (pure — unit
 * tested in pure.test.ts). Callers are collapsed to `file:line` locations.
 */
export function summarizeBlast(report: BlastReportDto) {
  return {
    status: report.status,
    reason: report.reason,
    changed_files: report.changed_files.length,
    changed_symbols: report.symbols.map((s) => ({
      symbol: s.name,
      file: s.file,
      kind: s.kind,
      callers: s.callers.map((c) => ({ location: `${c.file}:${c.line}`, symbol: c.symbol })),
      endpoints: s.endpoints,
      crons: s.crons,
    })),
    impacted_endpoints: report.impacted_endpoints.map((e) => ({
      endpoint: e.endpoint,
      via: e.via_files,
      depth: e.depth,
    })),
    prior_prs: report.prior_prs.map((p) => ({
      pr: `#${p.number}`,
      title: p.title,
      author: p.author,
      shared_files: p.files_overlap.length,
    })),
    index: report.index,
  };
}

export function registerGetBlastRadius(server: McpServer, client: ApiClient): void {
  server.registerTool(
    'devdigest_get_blast_radius',
    {
      description: DESCRIPTION,
      // Flat scalars only (mirrors run_agent_on_pr / get_conventions).
      inputSchema: {
        repo: z.string().min(1).describe('Repository as a name or owner/name (e.g. "acme/api").'),
        pr: z.number().int().positive().describe('Pull request number (e.g. 482).'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ repo, pr }) => {
      try {
        const pull = await resolvePullId(client, repo, pr);
        if (!pull.ok) return toolError(pull.message, { recovery: pull.recovery });

        const report = await client.blastForPull(pull.value.pullId);
        const summary = summarizeBlast(report);

        if (report.status === 'degraded') {
          return toolOk({
            ...summary,
            message:
              'No usable code index for this repo yet, so the map is best-effort. Re-analyze the repo in DevDigest to build the index.',
          });
        }
        if (report.status === 'empty') {
          return toolOk({
            ...summary,
            message:
              'The index is healthy but the PR\'s changed files have no indexed symbols/callers (e.g. non-code or freshly imported files).',
          });
        }
        return toolOk(summary);
      } catch (err) {
        if (err instanceof ApiUnreachableError) {
          return toolError(err.message, {
            recovery: 'Start the DevDigest API (./scripts/dev.sh) and retry.',
          });
        }
        log('get_blast_radius failed', (err as Error).message);
        return toolError(`Failed to get blast radius: ${(err as Error).message}`);
      }
    },
  );
}
