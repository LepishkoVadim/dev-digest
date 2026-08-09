import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { BlastReport } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { BlastRepository } from './repository.js';
import { buildBlastReport } from './service.js';

/**
 * Blast Radius — the deterministic, index-only impact map for a PR.
 *
 *   GET /pulls/:id/blast → changed symbols → callers → impacted HTTP endpoints
 *
 * NO LLM, NO clone re-parse: every fact comes from the repo-intel Postgres index
 * (symbols / references / file_edges / file_facts / file_rank) via the RepoIntel
 * facade. Changed files come from the persisted `pr_files` (same source the
 * smart-diff route reads) — no GitHub round-trip on this path.
 *
 * Missing/partial data is surfaced honestly in `status` (degraded / partial /
 * empty), never masked as an empty `ok` result.
 */
export default async function blastRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const repo = new BlastRepository(container.db);

  app.get(
    '/pulls/:id/blast',
    { schema: { params: IdParams } },
    async (req): Promise<BlastReport> => {
      const { workspaceId } = await getContext(container, req);

      const pr = await repo.getPr(workspaceId, req.params.id);
      if (!pr) throw new NotFoundError('Pull request not found');

      // Changed files from the persisted diff (no GitHub call). Empty until the
      // PR detail has been fetched once — the report then reads `empty`.
      const changedFiles = await repo.getChangedFiles(pr.id);

      // All index reads are pure (no AST rebuild, no clone parse); prior-PRs is
      // a plain DB read over persisted pr_files.
      const [blast, impacted, indexState, priorPrs] = await Promise.all([
        container.repoIntel.getBlastRadius(pr.repoId, changedFiles),
        container.repoIntel.getImpactedEndpoints(pr.repoId, changedFiles),
        container.repoIntel.getIndexState(pr.repoId),
        repo.getPriorPrs(pr.repoId, pr.id, changedFiles),
      ]);

      return buildBlastReport({ changedFiles, blast, impacted, indexState, priorPrs });
    },
  );
}
