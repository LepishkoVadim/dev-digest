import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ApiClient } from '../http/client.js';
import { ApiUnreachableError } from '../http/client.js';
import { toolOk, toolError } from '../format.js';
import { resolveRepoId } from '../http/resolve.js';
import { log } from '../log.js';

const DESCRIPTION =
  'Returns the coding conventions DevDigest has extracted for a repository (each with the rule and an evidence snippet). Arg: repo (name or owner/name). Returns accepted conventions by default. Read-only; does not extract or modify anything.';

export function registerGetConventions(server: McpServer, client: ApiClient): void {
  server.registerTool(
    'devdigest_get_conventions',
    {
      description: DESCRIPTION,
      inputSchema: {
        repo: z.string().min(1).describe('Repository as a name or owner/name (e.g. "acme/api").'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ repo }) => {
      try {
        const repoMatch = await resolveRepoId(client, repo);
        if (!repoMatch.ok) return toolError(repoMatch.message, { recovery: repoMatch.recovery });

        const all = await client.listConventions(repoMatch.value.id);
        const accepted = all.filter((c) => c.accepted);
        return toolOk({
          conventions: accepted.map((c) => ({
            rule: c.rule,
            evidence_snippet: c.evidence_snippet,
          })),
        });
      } catch (err) {
        if (err instanceof ApiUnreachableError) {
          return toolError(err.message, {
            recovery: 'Start the DevDigest API (./scripts/dev.sh) and retry.',
          });
        }
        log('get_conventions failed', (err as Error).message);
        return toolError(`Failed to get conventions: ${(err as Error).message}`);
      }
    },
  );
}
