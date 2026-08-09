/**
 * Composition root: build the McpServer, register the 5 tools in a FIXED order
 * (B7 — a stable tools/list improves the client's prompt-cache hit rate), and
 * connect the stdio transport. stdout is the JSON-RPC channel; all logging goes
 * to stderr via log.ts.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config.js';
import { ApiClient } from './http/client.js';
import { log } from './log.js';
import { registerListAgents } from './tools/list-agents.js';
import { registerRunAgentOnPr } from './tools/run-agent-on-pr.js';
import { registerGetFindings } from './tools/get-findings.js';
import { registerGetConventions } from './tools/get-conventions.js';
import { registerGetBlastRadius } from './tools/get-blast-radius.js';

async function main(): Promise<void> {
  const cfg = loadConfig();
  const client = new ApiClient(cfg);

  const server = new McpServer({ name: 'devdigest-mcp', version: '0.0.0' });

  // B7 — deterministic registration order.
  registerListAgents(server, client);
  registerRunAgentOnPr(server, client, cfg);
  registerGetFindings(server, client);
  registerGetConventions(server, client);
  registerGetBlastRadius(server, client);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  log(`devdigest-mcp ready (API: ${cfg.apiUrl})`);
}

main().catch((err) => {
  log('devdigest-mcp failed to start', err);
  process.exit(1);
});
