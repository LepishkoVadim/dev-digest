/**
 * Composition root: load config, build the client + server (server.ts), connect
 * the stdio transport. stdout is the JSON-RPC channel; all logging goes to
 * stderr via log.ts.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config.js';
import { ApiClient } from './http/client.js';
import { createServer } from './server.js';
import { log } from './log.js';

async function main(): Promise<void> {
  const cfg = loadConfig();
  const client = new ApiClient(cfg);
  const server = createServer(client, cfg);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  log(`devdigest-mcp ready (API: ${cfg.apiUrl})`);
}

main().catch((err) => {
  log('devdigest-mcp failed to start', err);
  process.exit(1);
});
