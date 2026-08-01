import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { ConventionsService } from './service.js';

/**
 * Conventions Extractor module.
 *   POST /repos/:id/conventions/extract → sample → cheap LLM → verify → persist
 *   GET  /repos/:id/conventions         → list candidates for a repo
 *   PATCH /conventions/:id              → accept / reject / edit a candidate
 *   POST /repos/:id/conventions/skill   → merge accepted → one extracted skill
 */

const UpdateConventionBody = z.object({
  rule: z.string().min(1).optional(),
  evidence_snippet: z.string().min(1).optional(),
  accepted: z.boolean().optional(),
});

const CreateSkillBody = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  body: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
  agentId: z.string().uuid().optional(),
});

export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new ConventionsService(app.container);

  app.get('/repos/:id/conventions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId, req.params.id);
  });

  app.post(
    '/repos/:id/conventions/extract',
    { schema: { params: IdParams }, config: { rateLimit: { max: 6, timeWindow: '1 minute' } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.extract(workspaceId, req.params.id);
    },
  );

  app.post(
    '/repos/:id/conventions/skill',
    { schema: { params: IdParams, body: CreateSkillBody } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.createSkill(workspaceId, req.params.id, req.body);
      reply.status(201);
      return skill;
    },
  );

  app.patch(
    '/conventions/:id',
    { schema: { params: IdParams, body: UpdateConventionBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const updated = await service.update(workspaceId, req.params.id, req.body);
      if (!updated) throw new NotFoundError('Convention not found');
      return updated;
    },
  );
}
