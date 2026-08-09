/**
 * id-resolution — the one real design point (plan §7). No lookup-by-name/number
 * endpoint exists, so we list-then-match. The pure matchers are split out from
 * the HTTP calls so they can be unit-tested without a network.
 */
import type { ApiClient, RepoDto, PrMetaDto } from './client.js';

/** Discriminated result of a match attempt over a small in-memory list. */
export type MatchResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: 'not_found' | 'ambiguous'; message: string; recovery: string };

/**
 * Match a repo by `repo` (name or owner/name), case-insensitively, in order:
 * full_name, then name, then `${owner}/${name}`. Exactly one match wins; zero →
 * not_found (lists available full_names); many (ambiguous bare name) → ambiguous
 * (asks for owner/name). PURE — takes the repo list, returns a MatchResult.
 */
export function matchRepo(repos: RepoDto[], repo: string): MatchResult<RepoDto> {
  const q = repo.trim().toLowerCase();
  const matches = repos.filter(
    (r) =>
      r.full_name.toLowerCase() === q ||
      r.name.toLowerCase() === q ||
      `${r.owner}/${r.name}`.toLowerCase() === q,
  );
  if (matches.length === 1) return { ok: true, value: matches[0]! };
  if (matches.length === 0) {
    const available = repos.map((r) => r.full_name).join(', ') || '(none)';
    return {
      ok: false,
      reason: 'not_found',
      message: `No repository matches "${repo}".`,
      recovery: `Available repositories: ${available}. Pass one of these (name or owner/name).`,
    };
  }
  return {
    ok: false,
    reason: 'ambiguous',
    message: `"${repo}" matches ${matches.length} repositories.`,
    recovery: `Disambiguate with owner/name, e.g. ${matches.map((r) => r.full_name).join(' or ')}.`,
  };
}

/**
 * Match a PR by its number within an already-resolved repo. PURE — takes the
 * pull list, returns a MatchResult. Not found lists a few available numbers.
 */
export function matchPull(pulls: PrMetaDto[], pr: number): MatchResult<PrMetaDto> {
  const found = pulls.find((p) => p.number === pr);
  if (found) return { ok: true, value: found };
  const some = pulls
    .map((p) => p.number)
    .slice(0, 10)
    .join(', ');
  return {
    ok: false,
    reason: 'not_found',
    message: `PR #${pr} was not found in this repository.`,
    recovery: some ? `Known PR numbers include: ${some}.` : 'This repository has no imported PRs.',
  };
}

/** Resolve `repo` → repoId via the API (two-step: list repos, then match). */
export async function resolveRepoId(client: ApiClient, repo: string): Promise<MatchResult<RepoDto>> {
  return matchRepo(await client.listRepos(), repo);
}

/** Resolve (repo, pr#) → pull id, resolving the repo first. */
export async function resolvePullId(
  client: ApiClient,
  repo: string,
  pr: number,
): Promise<MatchResult<{ pullId: string; repoId: string }>> {
  const repoMatch = await resolveRepoId(client, repo);
  if (!repoMatch.ok) return repoMatch;
  const repoId = repoMatch.value.id;
  const pullMatch = matchPull(await client.listPulls(repoId), pr);
  if (!pullMatch.ok) return pullMatch;
  const pullId = pullMatch.value.id;
  if (!pullId) {
    return {
      ok: false,
      reason: 'not_found',
      message: `PR #${pr} has no persisted id yet.`,
      recovery: 'Open the PR in DevDigest once so it is imported, then retry.',
    };
  }
  return { ok: true, value: { pullId, repoId } };
}
