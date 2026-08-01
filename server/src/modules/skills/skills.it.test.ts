import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from '../../../test/helpers/pg.js';
import { buildApp } from '../../app.js';
import { loadConfig } from '../../platform/config.js';
import { seed } from '../../db/seed.js';
import { MockGitClient, MockGitHubClient } from '../../adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  console.warn('[skills] Docker not available — skipping integration tests.');
}

/**
 * Skills CRUD + body versioning over a real Postgres. Covers: create→get→list,
 * a body edit bumps version and writes a snapshot, restore creates a new version
 * carrying the old body, and delete.
 */
d('skills module', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
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

  const createBody = { name: 'My Rule', type: 'custom' as const, body: '# My Rule\n\nv1 body' };

  it('create → get → list', async () => {
    const app = await makeApp();
    const created = await app.inject({ method: 'POST', url: '/skills', payload: createBody });
    expect(created.statusCode).toBe(201);
    const skill = created.json();
    expect(skill).toMatchObject({ name: 'My Rule', source: 'manual', enabled: true, version: 1 });

    const got = await app.inject({ method: 'GET', url: `/skills/${skill.id}` });
    expect(got.statusCode).toBe(200);
    expect(got.json().body).toBe('# My Rule\n\nv1 body');

    const list = await app.inject({ method: 'GET', url: '/skills' });
    expect(list.json().some((s: { id: string }) => s.id === skill.id)).toBe(true);
    await app.close();
  });

  it('a body edit bumps version and writes a snapshot; name-only edit does not', async () => {
    const app = await makeApp();
    const id = (await app.inject({ method: 'POST', url: '/skills', payload: createBody })).json()
      .id as string;

    // name-only edit → no version bump.
    await app.inject({ method: 'PUT', url: `/skills/${id}`, payload: { name: 'Renamed' } });
    let versions = (await app.inject({ method: 'GET', url: `/skills/${id}/versions` })).json();
    expect(versions).toHaveLength(1);

    // body edit → version 2 + snapshot, newest first.
    const upd = await app.inject({
      method: 'PUT',
      url: `/skills/${id}`,
      payload: { body: '# My Rule\n\nv2 body' },
    });
    expect(upd.json().version).toBe(2);
    versions = (await app.inject({ method: 'GET', url: `/skills/${id}/versions` })).json();
    expect(versions.map((v: { version: number }) => v.version)).toEqual([2, 1]);
    expect(versions[0].body).toBe('# My Rule\n\nv2 body');
    expect(versions[1].body).toBe('# My Rule\n\nv1 body');
    await app.close();
  });

  it('restore creates a new version carrying the old body', async () => {
    const app = await makeApp();
    const id = (await app.inject({ method: 'POST', url: '/skills', payload: createBody })).json()
      .id as string;
    await app.inject({ method: 'PUT', url: `/skills/${id}`, payload: { body: 'v2' } });

    const restored = await app.inject({
      method: 'POST',
      url: `/skills/${id}/versions/1/restore`,
    });
    expect(restored.statusCode).toBe(200);
    // Restoring v1's body onto a skill at v2 → new v3 with the original body.
    expect(restored.json()).toMatchObject({ version: 3, body: '# My Rule\n\nv1 body' });
    await app.close();
  });

  it('delete removes the skill (subsequent get → 404)', async () => {
    const app = await makeApp();
    const id = (await app.inject({ method: 'POST', url: '/skills', payload: createBody })).json()
      .id as string;
    const del = await app.inject({ method: 'DELETE', url: `/skills/${id}` });
    expect(del.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/skills/${id}` })).statusCode).toBe(404);
    await app.close();
  });
});
