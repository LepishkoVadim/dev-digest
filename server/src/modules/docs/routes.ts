import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { NotFoundError } from '../../platform/errors.js';
import { DocsService } from './service.js';

/**
 * Project Context docs module (read-only).
 *   GET  /repos/:repoId/docs           → list `.md` docs under configured roots
 *   POST /repos/:repoId/docs/rescan    → re-walk the clone, refresh the list
 *   GET  /repos/:repoId/docs/preview/* → raw markdown body (containment-checked)
 *
 * No create / upload / new-folder / edit / delete routes — v1 is read + attach.
 */

const RepoParams = z.object({ repoId: z.string().uuid() });
/** Preview: repoId + the trailing wildcard doc path (may contain slashes). */
const PreviewParams = z.object({ repoId: z.string().uuid(), '*': z.string().min(1) });

export default async function docsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new DocsService(app.container);

  app.get('/repos/:repoId/docs', { schema: { params: RepoParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId, req.params.repoId);
  });

  app.post('/repos/:repoId/docs/rescan', { schema: { params: RepoParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.rescan(workspaceId, req.params.repoId);
  });

  app.get(
    '/repos/:repoId/docs/preview/*',
    { schema: { params: PreviewParams } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const body = await service.preview(workspaceId, req.params.repoId, req.params['*']);
      // Missing / unreadable / path-escape all collapse to 404 — never leak a
      // reason that distinguishes "escaped" from "absent" (containment).
      if (body === undefined) throw new NotFoundError('Doc not found');
      // JSON `{ body }` so it flows through the client's single JSON fetch
      // chokepoint (no separate text path). The body is untrusted repo markdown;
      // the client renders it WITHOUT raw HTML (no rehype-raw).
      return { path: req.params['*'], body };
    },
  );
}
