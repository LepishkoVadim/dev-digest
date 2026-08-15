import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient } from './http/client.js';
import type { Config } from './config.js';
import { registerListAgents } from './tools/list-agents.js';
import { registerRunAgentOnPr } from './tools/run-agent-on-pr.js';
import { registerGetFindings } from './tools/get-findings.js';
import { registerGetConventions } from './tools/get-conventions.js';
import { registerGetBlastRadius } from './tools/get-blast-radius.js';

/**
 * Build the McpServer and register the 5 tools in a FIXED order (B7 — a stable
 * tools/list improves the client's prompt-cache hit rate). Pure factory: no
 * transport, no side effects — index.ts wires the stdio transport.
 */
export function createServer(client: ApiClient, cfg: Config): McpServer {
  const server = new McpServer({ name: 'devdigest-mcp', version: '0.0.0' });
  registerListAgents(server, client);
  registerRunAgentOnPr(server, client, cfg);
  registerGetFindings(server, client);
  registerGetConventions(server, client);
  registerGetBlastRadius(server, client);
  return server;
}
