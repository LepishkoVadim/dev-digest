import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { EvalCaseInput, EvalOwnerKind } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { NotFoundError } from '../../platform/errors.js';
import { EvalsService } from './service.js';

/**
 * Evals module (L06). Thin presentation layer — schema-first zod params/body,
 * delegates to one shared EvalsService. Workspace comes from `getContext`
 * (server-resolved, never client-supplied); NO db import here (onion
 * no-route-to-db).
 *
 *   GET    /agents/:id/eval-runs        → list runs for an agent owner
 *   POST   /agents/:id/eval-runs        → run the agent's case set
 *   GET    /skills/:id/eval-runs        → list runs for a skill owner
 *   POST   /skills/:id/eval-runs        → run the skill's case set (with/without)
 *   GET    /evals/cases?owner_kind=&owner_id= → list cases
 *   POST   /evals/cases                 → create a case
 *   PUT    /evals/cases/:id             → update a case
 *   DELETE /evals/cases/:id             → delete a case
 *   GET    /eval/:ownerId               → per-owner dashboard
 */

const IdParam = z.object({ id: z.string().uuid() });
const OwnerIdParam = z.object({ ownerId: z.string().uuid() });
const CaseListQuery = z.object({ owner_kind: EvalOwnerKind, owner_id: z.string().uuid() });
const VersionQuery = z.object({ version: z.coerce.number().int() });

export default async function evalsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new EvalsService(app.container);

  // ---- run routes (two thin owner-parameterized routes) -------------------

  app.get('/agents/:id/eval-runs', { schema: { params: IdParam } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.listRuns(workspaceId, 'agent', req.params.id);
  });

  app.post('/agents/:id/eval-runs', { schema: { params: IdParam } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.runOwner(workspaceId, 'agent', req.params.id);
  });

  app.get('/skills/:id/eval-runs', { schema: { params: IdParam } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.listRuns(workspaceId, 'skill', req.params.id);
  });

  app.post('/skills/:id/eval-runs', { schema: { params: IdParam } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.runOwner(workspaceId, 'skill', req.params.id);
  });

  // ---- case CRUD ----------------------------------------------------------

  app.get('/evals/cases', { schema: { querystring: CaseListQuery } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.listCases(workspaceId, req.query.owner_kind, req.query.owner_id);
  });

  app.post('/evals/cases', { schema: { body: EvalCaseInput } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const created = await service.createCase(workspaceId, req.body);
    reply.code(201);
    return created;
  });

  app.put('/evals/cases/:id', { schema: { params: IdParam, body: EvalCaseInput } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const updated = await service.updateCase(workspaceId, req.params.id, req.body);
    if (!updated) throw new NotFoundError('Eval case not found');
    return updated;
  });

  app.delete('/evals/cases/:id', { schema: { params: IdParam } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const ok = await service.deleteCase(workspaceId, req.params.id);
    if (!ok) throw new NotFoundError('Eval case not found');
    reply.code(204);
  });

  // Run a single persisted case through the same per-case path the owner-run
  // uses (review + ground + score + persist), returning the EvalRunRecord.
  app.post('/evals/cases/:id/run', { schema: { params: IdParam } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const record = await service.runSingleCase(workspaceId, req.params.id);
    if (!record) throw new NotFoundError('Eval case not found');
    return record;
  });

  // ---- dashboard read -----------------------------------------------------

  app.get('/eval/:ownerId', { schema: { params: OwnerIdParam } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.dashboard(workspaceId, req.params.ownerId);
  });

  // Config snapshot text at a version — feeds the Compare modal's prompt/skill
  // diff (AC-17). Owner kind is inferred; text is null when no snapshot exists.
  app.get(
    '/eval/:ownerId/version-text',
    { schema: { params: OwnerIdParam, querystring: VersionQuery } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.versionText(workspaceId, req.params.ownerId, req.query.version);
    },
  );
}
