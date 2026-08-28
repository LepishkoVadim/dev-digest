import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockGitClient } from '../src/adapters/mocks.js';
import type { Review, LLMProvider } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

/** A diff touching a.ts line 11 so grounding keeps a finding on line 11. */
const DIFF = `diff --git a/a.ts b/a.ts
--- a/a.ts
+++ b/a.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

/** A Review fixture: one grounded finding on a.ts line 11. */
const REVIEW_FIXTURE: Review = {
  verdict: 'request_changes',
  summary: 'Hardcoded secret.',
  score: 42,
  findings: [
    {
      id: 'f1',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded secret',
      file: 'a.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'A live secret is committed.',
      confidence: 0.95,
      kind: 'finding',
    },
  ],
};

/** A clean Review fixture: zero findings (for must_not_flag cases). */
const CLEAN_FIXTURE: Review = { verdict: 'comment', summary: 'ok', score: 100, findings: [] };

d('evals module (Testcontainers pg)', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function appWith(structured: unknown, provider: 'openai' = 'openai') {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ diff: DIFF }),
        llm: { [provider]: new MockLLMProvider(provider, { structured }) as unknown as LLMProvider },
      },
    });
  }

  async function makeAgent(app: Awaited<ReturnType<typeof buildApp>>, name = 'Rev') {
    return (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name, provider: 'openai', model: 'gpt-4.1', system_prompt: 'review' },
      })
    ).json();
  }

  async function addCase(
    app: Awaited<ReturnType<typeof buildApp>>,
    ownerKind: 'agent' | 'skill',
    ownerId: string,
    expectationKind: 'must_find' | 'must_not_flag',
    expectedOutput: { file: string; start_line: number; end_line: number }[],
  ) {
    return app.inject({
      method: 'POST',
      url: '/evals/cases',
      payload: {
        owner_kind: ownerKind,
        owner_id: ownerId,
        name: `${expectationKind} case`,
        input_diff: DIFF,
        expectation_kind: expectationKind,
        expected_output: expectedOutput,
      },
    });
  }

  it('rejects an unset expectation_kind with 422 (AC-2)', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const agent = await makeAgent(app);
    const res = await app.inject({
      method: 'POST',
      url: '/evals/cases',
      payload: {
        owner_kind: 'agent',
        owner_id: agent.id,
        name: 'no kind',
        input_diff: DIFF,
        expected_output: [],
      },
    });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('rejects malformed expected_output with 422 (AC-16)', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const agent = await makeAgent(app);
    const res = await app.inject({
      method: 'POST',
      url: '/evals/cases',
      payload: {
        owner_kind: 'agent',
        owner_id: agent.id,
        name: 'bad expected',
        input_diff: DIFF,
        expectation_kind: 'must_find',
        expected_output: [{ file: 'a.ts' }], // missing start_line/end_line
      },
    });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('runs an agent owner: persists a metrics row per case (AC-9/12)', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const agent = await makeAgent(app);
    await addCase(app, 'agent', agent.id, 'must_find', [
      { file: 'a.ts', start_line: 10, end_line: 12 },
    ]);

    const run = await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs` });
    expect(run.statusCode).toBe(200);
    const results = run.json();
    expect(results).toHaveLength(1);
    expect(results[0].result.recall).toBe(1);
    expect(results[0].result.precision).toBe(1);

    const runs = (
      await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-runs` })
    ).json();
    expect(runs).toHaveLength(1);
    expect(runs[0].version).toBe(agent.version); // AC-12: owner version recorded
    expect(runs[0].pass).toBe(true);
    await app.close();
  });

  it('returns 422 on an empty case set and creates no run (AC-20)', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const agent = await makeAgent(app, 'Empty');
    const run = await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs` });
    expect(run.statusCode).toBe(422);
    const runs = (
      await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-runs` })
    ).json();
    expect(runs).toHaveLength(0);
    await app.close();
  });

  it('increments the recorded version when the agent config changes (AC-13)', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const agent = await makeAgent(app, 'Versioned');
    await addCase(app, 'agent', agent.id, 'must_find', [
      { file: 'a.ts', start_line: 10, end_line: 12 },
    ]);

    await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs` });
    // Change the config → version bumps.
    const updated = (
      await app.inject({
        method: 'PUT',
        url: `/agents/${agent.id}`,
        payload: { system_prompt: 'a different prompt' },
      })
    ).json();
    expect(updated.version).toBe(agent.version + 1);
    await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs` });

    const runs = (
      await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-runs` })
    ).json();
    const versions = runs.map((r: { version: number }) => r.version).sort();
    expect(versions).toEqual([agent.version, agent.version + 1]);
    await app.close();
  });

  it('runs a skill owner through its single linked agent, recording without_skill (AC-10)', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const agent = await makeAgent(app, 'SkillHost');
    const skill = (
      await app.inject({
        method: 'POST',
        url: '/skills',
        payload: {
          name: 'Sec Rubric',
          description: 'security',
          type: 'security',
          body: 'Flag hardcoded secrets.',
        },
      })
    ).json();
    // Link the skill to the agent.
    await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skill_id: skill.id },
    });

    await addCase(app, 'skill', skill.id, 'must_find', [
      { file: 'a.ts', start_line: 10, end_line: 12 },
    ]);

    const run = await app.inject({ method: 'POST', url: `/skills/${skill.id}/eval-runs` });
    expect(run.statusCode).toBe(200);
    const runs = (
      await app.inject({ method: 'GET', url: `/skills/${skill.id}/eval-runs` })
    ).json();
    expect(runs).toHaveLength(1);
    expect(runs[0].actual_output.without_skill).toBeDefined();
    expect(runs[0].actual_output.without_skill).toHaveProperty('recall');
    await app.close();
  });

  it('returns 422 for a skill linked to zero agents (edge case)', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const skill = (
      await app.inject({
        method: 'POST',
        url: '/skills',
        payload: {
          name: 'Lonely',
          description: 'x',
          type: 'custom',
          body: 'rule',
        },
      })
    ).json();
    await addCase(app, 'skill', skill.id, 'must_find', [
      { file: 'a.ts', start_line: 10, end_line: 12 },
    ]);
    const run = await app.inject({ method: 'POST', url: `/skills/${skill.id}/eval-runs` });
    expect(run.statusCode).toBe(422);
    await app.close();
  });

  it('runs a single persisted case via POST /evals/cases/:id/run', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const agent = await makeAgent(app, 'SingleCase');
    const created = (
      await addCase(app, 'agent', agent.id, 'must_find', [
        { file: 'a.ts', start_line: 10, end_line: 12 },
      ])
    ).json();

    const run = await app.inject({ method: 'POST', url: `/evals/cases/${created.id}/run` });
    expect(run.statusCode).toBe(200);
    const record = run.json();
    expect(record.case_id).toBe(created.id);
    expect(record.recall).toBe(1);
    expect(record.precision).toBe(1);
    expect(record.version).toBe(agent.version);

    // The run is persisted (one row in the owner's history).
    const runs = (
      await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-runs` })
    ).json();
    expect(runs).toHaveLength(1);
    await app.close();
  });

  it('returns 404 running a non-existent case', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const res = await app.inject({
      method: 'POST',
      url: '/evals/cases/00000000-0000-0000-0000-000000000000/run',
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('renders an empty dashboard (no runs → no trend) (AC-15 empty state)', async () => {
    const app = await appWith(CLEAN_FIXTURE);
    const agent = await makeAgent(app, 'DashEmpty');
    const dash = (await app.inject({ method: 'GET', url: `/eval/${agent.id}` })).json();
    expect(dash.owner_kind).toBe('agent');
    expect(dash.recent_runs).toHaveLength(0);
    expect(dash.trend).toHaveLength(0);
    await app.close();
  });
});
