import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { toolOk } from '../format.js';

const DESCRIPTION =
  "NOT IMPLEMENTED YET — do not rely on this tool. Intended to return the blast radius (impacted files/symbols) for a set of changed files, but currently always returns {status:'not_implemented'} without calling the API. Args repo and files[] are accepted for forward compatibility only.";

// Schema-correct stub. The real work later is "add a route" (not "build it"):
// RepoIntelService.getBlastRadius already exists at
// server/src/modules/repo-intel/service.ts:212 — expose it, then wire it here.
export function registerGetBlastRadius(server: McpServer): void {
  server.registerTool(
    'devdigest_get_blast_radius',
    {
      description: DESCRIPTION,
      inputSchema: {
        repo: z.string().min(1).describe('Repository as a name or owner/name (forward-compat only).'),
        files: z
          .array(z.string())
          .describe('Changed file paths to compute blast radius for (forward-compat only).'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    // Always a stub — no HTTP call, no reliance.
    async () =>
      toolOk({
        status: 'not_implemented',
        message:
          'Blast radius is not wired up yet. The engine facade (RepoIntelService.getBlastRadius) exists but is not exposed over HTTP; do not rely on this tool.',
      }),
  );
}
