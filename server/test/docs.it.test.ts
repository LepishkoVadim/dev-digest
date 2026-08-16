import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { DocList } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

let repoSeq = 0;
async function seedRepo(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `docs-repo-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  return repo!;
}

// The clone fixture: a files map the MockGitClient walks/reads.
const FILES = {
  'specs/public-api.md': '# Public API\n\nThe api/ module must not import db/ directly.',
  'docs/architecture.md': '# Architecture\n\nOnion layers.',
  'insights/gotchas.md': '# Gotchas',
  'README.md': '# Readme',
  'src/config.ts': 'export const x = 1;', // not a doc — excluded by the glob
};

d('GET /repos/:repoId/docs (Testcontainers pg)', () => {
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

  function app(files: Record<string, string> = FILES) {
    return buildApp({ config: config(), db: pg.handle.db, overrides: { git: new MockGitClient({ files }) } });
  }

  it('lists .md docs with tokens>0 and correct type; excludes non-docs', async () => {
    const a = await app();
    const repo = await seedRepo(pg.handle.db, workspaceId);

    const res = await a.inject({ method: 'GET', url: `/repos/${repo.id}/docs` });
    expect(res.statusCode).toBe(200);
    const list = res.json() as DocList;

    const byPath = new Map(list.docs.map((doc) => [doc.path, doc]));
    expect([...byPath.keys()].sort()).toEqual([
      'README.md',
      'docs/architecture.md',
      'insights/gotchas.md',
      'specs/public-api.md',
    ]);
    expect(byPath.get('specs/public-api.md')!.type).toBe('specs');
    expect(byPath.get('docs/architecture.md')!.type).toBe('docs');
    expect(byPath.get('insights/gotchas.md')!.type).toBe('insights');
    expect(byPath.get('README.md')!.type).toBe('readme');
    expect(byPath.get('specs/public-api.md')!.tokens).toBeGreaterThan(0);
    expect(typeof list.scanned_at).toBe('string');

    await a.close();
  });

  it('counts used_by_agents for a path attached via an agent', async () => {
    const a = await app();
    const repo = await seedRepo(pg.handle.db, workspaceId);
    await pg.handle.db.insert(t.agents).values({
      workspaceId,
      name: 'ctx-agent',
      provider: 'openai',
      model: 'gpt-4.1',
      systemPrompt: 's',
      docPaths: ['specs/public-api.md'],
    });

    const res = await a.inject({ method: 'GET', url: `/repos/${repo.id}/docs` });
    const list = res.json() as DocList;
    const doc = list.docs.find((x) => x.path === 'specs/public-api.md')!;
    expect(doc.used_by_agents).toBeGreaterThanOrEqual(1);

    await a.close();
  });

  it('uncloned / empty repo → empty docs list with a scanned_at', async () => {
    const a = await app({});
    const repo = await seedRepo(pg.handle.db, workspaceId);

    const res = await a.inject({ method: 'GET', url: `/repos/${repo.id}/docs` });
    expect(res.statusCode).toBe(200);
    const list = res.json() as DocList;
    expect(list.docs).toEqual([]);
    expect(typeof list.scanned_at).toBe('string');

    await a.close();
  });

  it('preview returns a doc body; a traversal path returns 404, never content', async () => {
    const a = await app();
    const repo = await seedRepo(pg.handle.db, workspaceId);

    const ok = await a.inject({ method: 'GET', url: `/repos/${repo.id}/docs/preview/specs/public-api.md` });
    expect(ok.statusCode).toBe(200);
    expect((ok.json() as { body: string }).body).toContain('Public API');

    const escape = await a.inject({
      method: 'GET',
      url: `/repos/${repo.id}/docs/preview/../../etc/passwd`,
    });
    expect(escape.statusCode).toBe(404);
    expect(escape.body).not.toContain('root:');

    await a.close();
  });
});
