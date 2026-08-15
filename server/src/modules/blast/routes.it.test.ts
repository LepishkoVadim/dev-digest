import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { startPg, dockerAvailable, type PgFixture } from '../../../test/helpers/pg.js';
import { buildApp } from '../../app.js';
import { loadConfig } from '../../platform/config.js';
import { seed } from '../../db/seed.js';
import { MockGitClient, MockGitHubClient } from '../../adapters/mocks.js';
import * as t from '../../db/schema.js';
import type { BlastReport } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  console.warn('[blast] Docker not available — skipping integration tests.');
}

/**
 * Blast route over a real Postgres index. The fixture models a SHARED HELPER
 * (`format.ts` / `formatDate`) called from two API files, one of which is itself
 * imported by a third — exercising the 2-level reverse graph, the direction
 * guarantee (a dependency of the helper must NOT appear), and the partial/empty
 * states. All reads are from the persisted index — no clone, no LLM.
 */
d('blast route', () => {
  let pg: PgFixture;
  let workspaceId: string;

  // Files in the fixture graph.
  const HELPER = 'src/util/format.ts';
  const USERS = 'src/api/users.ts'; // imports HELPER, endpoint GET /users   (depth 1)
  const ORDERS = 'src/api/orders.ts'; // imports HELPER, endpoint POST /orders (depth 1)
  const INDEX = 'src/api/index.ts'; // imports USERS, endpoint GET /health   (depth 2)
  const BASE = 'src/util/base.ts'; // imported BY HELPER (dependency), GET /base — must NOT appear

  const repoId = randomUUID();
  const okPrId = randomUUID();
  const emptyPrId = randomUUID();

  async function seedIndex(db: PgFixture['handle']['db']) {
    await db.insert(t.repos).values({
      id: repoId,
      workspaceId,
      owner: 'acme',
      name: 'blast-demo',
      fullName: 'acme/blast-demo',
      defaultBranch: 'main',
      clonePath: null,
    });
    // A PR whose diff changes the shared helper.
    await db.insert(t.pullRequests).values({
      id: okPrId,
      workspaceId,
      repoId,
      number: 901,
      title: 'Tweak formatDate',
      author: 'dev',
      branch: 'feat/format',
      base: 'main',
      headSha: 'headsha901',
    });
    await db.insert(t.prFiles).values({ prId: okPrId, path: HELPER });

    // A second PR whose only changed file has no indexed symbols → empty state.
    await db.insert(t.pullRequests).values({
      id: emptyPrId,
      workspaceId,
      repoId,
      number: 902,
      title: 'Add README',
      author: 'dev',
      branch: 'docs/readme',
      base: 'main',
      headSha: 'headsha902',
    });
    await db.insert(t.prFiles).values({ prId: emptyPrId, path: 'docs/README.md' });

    // A prior MERGED PR that also touched the helper → shows in the history footer.
    const priorPrId = randomUUID();
    await db.insert(t.pullRequests).values({
      id: priorPrId,
      workspaceId,
      repoId,
      number: 800,
      title: 'Earlier formatDate refactor',
      author: 'dev',
      branch: 'chore/format',
      base: 'main',
      headSha: 'headsha800',
      status: 'merged',
    });
    await db.insert(t.prFiles).values({ prId: priorPrId, path: HELPER });

    // Symbols: the changed helper + enclosing symbols at the call sites.
    await db.insert(t.symbols).values([
      { repoId, path: HELPER, name: 'formatDate', kind: 'function', line: 10, endLine: 20, exported: true },
      { repoId, path: USERS, name: 'listUsers', kind: 'function', line: 3, endLine: 30, exported: true },
      { repoId, path: ORDERS, name: 'listOrders', kind: 'function', line: 3, endLine: 30, exported: true },
    ]);

    // Resolved references: both API files call formatDate (decl_file = HELPER).
    await db.insert(t.references).values([
      { repoId, fromPath: USERS, toSymbol: 'formatDate', line: 12, declFile: HELPER },
      { repoId, fromPath: ORDERS, toSymbol: 'formatDate', line: 8, declFile: HELPER },
    ]);

    // Import graph (fromFile imports toFile).
    await db.insert(t.fileEdges).values([
      { repoId, fromFile: USERS, toFile: HELPER },
      { repoId, fromFile: ORDERS, toFile: HELPER },
      { repoId, fromFile: INDEX, toFile: USERS }, // depth-2 dependent
      { repoId, fromFile: HELPER, toFile: BASE }, // HELPER's own dependency
    ]);

    // Ranks (needed for the caller join + ordering).
    const rank = (filePath: string, r: number, pct: number) => ({
      repoId,
      filePath,
      pagerank: r,
      hotness: 0,
      rank: r,
      percentile: pct,
    });
    await db.insert(t.fileRank).values([
      rank(HELPER, 0.8, 80),
      rank(USERS, 0.9, 90),
      rank(ORDERS, 0.5, 50),
      rank(INDEX, 0.7, 70),
      rank(BASE, 0.3, 30),
    ]);

    // Precomputed endpoints per file.
    await db.insert(t.fileFacts).values([
      { repoId, filePath: USERS, endpoints: ['GET /users'], crons: [] },
      { repoId, filePath: ORDERS, endpoints: ['POST /orders'], crons: [] },
      { repoId, filePath: INDEX, endpoints: ['GET /health'], crons: [] },
      { repoId, filePath: BASE, endpoints: ['GET /base'], crons: [] },
    ]);

    await db.insert(t.repoIndexState).values({
      repoId,
      lastIndexedSha: 'headsha901',
      indexerVersion: 2,
      status: 'full',
      filesIndexed: 5,
      filesSkipped: 0,
    });
  }

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
    await seedIndex(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
  }

  it('maps a shared helper to ≥2 callers and ≥1 endpoint, from the index only', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: `/pulls/${okPrId}/blast` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as BlastReport;

    expect(body.status).toBe('ok');
    expect(body.changed_symbols.map((s) => s.name)).toContain('formatDate');

    const group = body.symbols.find((s) => s.name === 'formatDate')!;
    const callerFiles = group.callers.map((c) => c.file);
    expect(callerFiles).toContain(USERS);
    expect(callerFiles).toContain(ORDERS);
    expect(group.callers.length).toBeGreaterThanOrEqual(2);
    // Highest-ranked caller first.
    expect(group.callers[0]!.file).toBe(USERS);

    const endpoints = body.impacted_endpoints.map((e) => e.endpoint);
    expect(endpoints).toContain('GET /users'); // depth 1
    expect(endpoints).toContain('GET /health'); // depth 2 (transitive dependent)
    expect(endpoints.length).toBeGreaterThanOrEqual(1);

    // Per-symbol endpoints (the tree view) come from the symbol's caller files.
    expect(group.endpoints).toEqual(expect.arrayContaining(['GET /users', 'POST /orders']));

    // History footer: the prior merged PR that touched the helper.
    expect(body.prior_prs.map((p) => p.number)).toContain(800);
    expect(body.prior_prs.find((p) => p.number === 800)!.files_overlap).toContain(HELPER);

    await app.close();
  });

  it('never reports the changed file\'s own dependencies (direction check)', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: `/pulls/${okPrId}/blast` });
    const body = res.json() as BlastReport;
    expect(body.impacted_endpoints.map((e) => e.endpoint)).not.toContain('GET /base');
    await app.close();
  });

  it('reports empty (not degraded) when changed files have no indexed symbols', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: `/pulls/${emptyPrId}/blast` });
    const body = res.json() as BlastReport;
    expect(body.status).toBe('empty');
    expect(body.symbols).toHaveLength(0);
    await app.close();
  });

  it('reports partial when the index is only partial', async () => {
    // Flip the index to partial (run last — no restore needed).
    const { eq } = await import('drizzle-orm');
    await pg.handle.db
      .update(t.repoIndexState)
      .set({ status: 'partial' })
      .where(eq(t.repoIndexState.repoId, repoId));

    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: `/pulls/${okPrId}/blast` });
    const body = res.json() as BlastReport;
    expect(body.status).toBe('partial');
    // Still resolves callers on the covered files.
    expect(body.symbols.find((s) => s.name === 'formatDate')!.callers.length).toBeGreaterThanOrEqual(2);
    await app.close();
  });
});
