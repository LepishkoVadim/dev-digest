/**
 * The ONLY place that calls fetch. One function per REST call against the
 * DevDigest Fastify API. Every failure is wrapped in a typed error so callers
 * never see an unhandled rejection (fail-closed). No secrets are sent or logged
 * — the API has no auth today (server/INSIGHTS.md 2026-08-09).
 */
import type { Config } from '../config.js';

/** The API returned a non-2xx status (business/HTTP failure). */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** The API could not be reached at all (down / offline / DNS). */
export class ApiUnreachableError extends Error {
  constructor(
    public readonly url: string,
    cause: unknown,
  ) {
    super(`Could not reach the DevDigest API at ${url}`);
    this.name = 'ApiUnreachableError';
    this.cause = cause;
  }
}

/** Minimal shapes we read from the API (subset of the shared DTOs). */
export interface RepoDto {
  id: string;
  owner: string;
  name: string;
  full_name: string;
}
export interface PrMetaDto {
  id?: string | null;
  number: number;
  status: string;
}
export interface AgentDto {
  id: string;
  name: string;
  model: string;
  enabled: boolean;
}
export interface FindingDto {
  severity: string;
  title: string;
  file: string;
  start_line: number;
  end_line: number;
  rationale: string;
  suggestion?: string | null;
}
export interface ReviewDto {
  run_id: string | null;
  agent_name?: string | null;
  verdict: string | null;
  score: number | null;
  findings: FindingDto[];
}
export interface RunSummaryDto {
  run_id: string;
  status: string | null;
}
export interface ReviewRunResponseDto {
  pr_id: string;
  runs: { run_id: string; agent_id: string; agent_name: string }[];
}
export interface ConventionDto {
  rule: string;
  evidence_snippet: string;
  accepted: boolean;
}
/** Subset of the shared `BlastReport` contract we read for the MCP tool. */
export interface BlastReportDto {
  status: 'ok' | 'partial' | 'degraded' | 'empty';
  reason: string | null;
  changed_files: string[];
  changed_symbols: { name: string; file: string; kind: string }[];
  symbols: {
    name: string;
    file: string;
    kind: string;
    callers: {
      file: string;
      symbol: string;
      line: number;
      rank: number;
      endpoints: string[];
      crons: string[];
    }[];
    endpoints: string[];
    crons: string[];
  }[];
  impacted_endpoints: { endpoint: string; via_files: string[]; depth: number }[];
  prior_prs: {
    number: number;
    title: string;
    status: string;
    author: string;
    date: string | null;
    note: string | null;
    files_overlap: string[];
  }[];
  index: { status: string; last_indexed_sha: string; indexer_version: number };
}

export class ApiClient {
  constructor(private readonly cfg: Config) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const url = `${this.cfg.apiUrl}${path}`;
    let res: Response;
    try {
      res = await fetch(url, {
        ...init,
        headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
      });
    } catch (cause) {
      throw new ApiUnreachableError(this.cfg.apiUrl, cause);
    }
    if (!res.ok) {
      // Body may carry a useful message; never assume it's JSON.
      const body = await res.text().catch(() => '');
      const detail = body ? `: ${body.slice(0, 300)}` : '';
      throw new ApiError(res.status, url, `API ${res.status} for ${path}${detail}`);
    }
    return (await res.json()) as T;
  }

  listRepos(): Promise<RepoDto[]> {
    return this.request<RepoDto[]>('/repos');
  }

  listPulls(repoId: string): Promise<PrMetaDto[]> {
    return this.request<PrMetaDto[]>(`/repos/${encodeURIComponent(repoId)}/pulls`);
  }

  listAgents(): Promise<AgentDto[]> {
    return this.request<AgentDto[]>('/agents');
  }

  /** Fire a review for one agent on a PR; returns synchronously with run ids. */
  runReview(prId: string, agentId: string): Promise<ReviewRunResponseDto> {
    return this.request<ReviewRunResponseDto>(`/pulls/${encodeURIComponent(prId)}/review`, {
      method: 'POST',
      body: JSON.stringify({ agentId }),
    });
  }

  listRunsForPull(prId: string): Promise<RunSummaryDto[]> {
    return this.request<RunSummaryDto[]>(`/pulls/${encodeURIComponent(prId)}/runs`);
  }

  reviewsForPull(prId: string): Promise<ReviewDto[]> {
    return this.request<ReviewDto[]>(`/pulls/${encodeURIComponent(prId)}/reviews`);
  }

  listConventions(repoId: string): Promise<ConventionDto[]> {
    return this.request<ConventionDto[]>(`/repos/${encodeURIComponent(repoId)}/conventions`);
  }

  /** Deterministic blast radius for a PR (same route the studio's Blast tab uses). */
  blastForPull(prId: string): Promise<BlastReportDto> {
    return this.request<BlastReportDto>(`/pulls/${encodeURIComponent(prId)}/blast`);
  }
}
