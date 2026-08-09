/**
 * Runtime config from env, with safe defaults. No secrets, no workspace-id
 * (the API resolves both server-side — see server/INSIGHTS.md 2026-08-09).
 */
export interface Config {
  /** Base URL of the running Fastify API (no trailing slash). */
  apiUrl: string;
  /** Poll interval while waiting for a review run to reach a terminal status. */
  pollIntervalMs: number;
  /** Total time to block in devdigest_run_agent_on_pr before returning run_id. */
  pollBudgetMs: number;
}

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function loadConfig(): Config {
  const apiUrl = (process.env.DEVDIGEST_API_URL ?? 'http://localhost:3001').replace(/\/+$/, '');
  return {
    apiUrl,
    pollIntervalMs: num('DEVDIGEST_POLL_INTERVAL_MS', 2000),
    pollBudgetMs: num('DEVDIGEST_POLL_BUDGET_MS', 120_000),
  };
}
