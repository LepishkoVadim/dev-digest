import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient } from '../http/client.js';
import { toolOk, toolError } from '../format.js';
import { ApiUnreachableError } from '../http/client.js';

const DESCRIPTION =
  'Lists the review agents configured in DevDigest (id, name, model, enabled). Takes no arguments. Call this first to discover which agent to pass to devdigest_run_agent_on_pr — names are resolved to ids there. Read-only; does not run any review.';

export function registerListAgents(server: McpServer, client: ApiClient): void {
  server.registerTool(
    'devdigest_list_agents',
    {
      description: DESCRIPTION,
      // B6 — no-arg tool: explicit empty object schema.
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async () => {
      try {
        const agents = await client.listAgents();
        return toolOk({
          agents: agents.map((a) => ({
            id: a.id,
            name: a.name,
            enabled: a.enabled,
            model: a.model,
          })),
        });
      } catch (err) {
        if (err instanceof ApiUnreachableError) {
          return toolError(err.message, {
            recovery: 'Start the DevDigest API (./scripts/dev.sh) and retry.',
          });
        }
        return toolError(`Failed to list agents: ${(err as Error).message}`);
      }
    },
  );
}
