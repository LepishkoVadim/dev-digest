import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { SmartDiff } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

let repoSeq = 0;
async function setupPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `sd-repo-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 900 + repoSeq,
      title: 'Smart Diff fixture',
      author: 'marisa.koch',
      branch: 'feat/sd',
      base: 'main',
      headSha: 'deadbeef',
      additions: 88,
      deletions: 24,
      filesCount: 3,
      status: 'needs_review',
    })
    .returning();
  // core, wiring, boilerplate — one of each
  await db.insert(t.prFiles).values([
    { prId: pr!.id, path: 'src/middleware/ratelimit.ts', additions: 84, deletions: 0, patch: null },
    { prId: pr!.id, path: 'src/config.ts', additions: 4, deletions: 0, patch: null },
    { prId: pr!.id, path: 'package-lock.json', additions: 0, deletions: 24, patch: null },
  ]);
  return pr!;
}

async function addReviewWithFinding(
  db: PgFixture['handle']['db'],
  workspaceId: string,
  prId: string,
) {
  const [review] = await db
    .insert(t.reviews)
    .values({ workspaceId, prId, kind: 'review' })
    .returning();
  await db.insert(t.findings).values({
    reviewId: review!.id,
    file: 'src/middleware/ratelimit.ts',
    startLine: 52,
    endLine: 53,
    severity: 'CRITICAL',
    category: 'security',
    title: 'unbounded loop',
    rationale: 'x',
    confidence: 0.9,
  });
}

d('GET /pulls/:id/smart-diff (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function app() {
    // Smart Diff reads the DB and calls no LLM/GitHub — a git mock is enough to
    // build the container.
    return buildApp({ config: config(), db: pg.handle.db, overrides: { git: new MockGitClient({ diff: '' }) } });
  }

  it('orders core → wiring → boilerplate with no findings before a review', async () => {
    const a = await app();
    const pr = await setupPr(pg.handle.db, workspaceId);

    const res = await a.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` });
    expect(res.statusCode).toBe(200);
    const sd = res.json() as SmartDiff;

    expect(sd.groups.map((g) => g.role)).toEqual(['core', 'wiring', 'boilerplate']);
    expect(sd.groups.find((g) => g.role === 'core')!.files[0]!.path).toBe('src/middleware/ratelimit.ts');
    expect(sd.groups.find((g) => g.role === 'boilerplate')!.files[0]!.path).toBe('package-lock.json');
    // no review yet → no finding lines anywhere
    expect(sd.groups.flatMap((g) => g.files).every((f) => f.finding_lines.length === 0)).toBe(true);

    await a.close();
  });

  it('attaches finding_lines to the right file after a review runs (no LLM)', async () => {
    const a = await app();
    const pr = await setupPr(pg.handle.db, workspaceId);
    await addReviewWithFinding(pg.handle.db, workspaceId, pr.id);

    const res = await a.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` });
    const sd = res.json() as SmartDiff;

    const core = sd.groups.find((g) => g.role === 'core')!.files[0]!;
    expect(core.path).toBe('src/middleware/ratelimit.ts');
    expect(core.finding_lines).toEqual([52, 53]);
    // findings don't bleed onto other files
    expect(sd.groups.find((g) => g.role === 'wiring')!.files[0]!.finding_lines).toEqual([]);

    await a.close();
  });
});
