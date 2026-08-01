import 'dotenv/config';
import { createDb, type Db } from './client.js';
import * as t from './schema.js';
import { eq, and } from 'drizzle-orm';
import {
  GENERAL_REVIEWER_PROMPT,
  SECURITY_REVIEWER_PROMPT,
  PERFORMANCE_REVIEWER_PROMPT,
  TEST_QUALITY_REVIEWER_PROMPT,
} from './seed-prompts.js';

/** Default provider/model for the built-in reviewer agents. */
const DEFAULT_PROVIDER = 'openrouter' as const;
const DEFAULT_MODEL = 'deepseek/deepseek-v4-flash';

/**
 * Seed the starter's demo data. Idempotent: re-running upserts the default
 * workspace/user and the demo fixtures.
 *
 * Seeds: default workspace + system user + membership, default settings,
 * demo repo (acme/payments-api), PR #482 with files/commits, a sample review
 * with a few findings, and the three built-in agents (General + Security +
 * Performance), all on the default openrouter/deepseek-v4-flash provider+model.
 *
 * Course lessons populate the other tables (skills, conventions, memory, eval,
 * …) once their features are built — they start empty here.
 */

export const DEFAULT_WORKSPACE_NAME = 'default';
export const SYSTEM_USER_EMAIL = 'you@local';

export async function seed(db: Db): Promise<{ workspaceId: string; userId: string }> {
  // ---- workspace + user (no-auth defaults) ----
  let [ws] = await db
    .select()
    .from(t.workspaces)
    .where(eq(t.workspaces.name, DEFAULT_WORKSPACE_NAME));
  if (!ws) {
    [ws] = await db
      .insert(t.workspaces)
      .values({ name: DEFAULT_WORKSPACE_NAME })
      .returning();
  }
  const workspaceId = ws!.id;

  let [user] = await db.select().from(t.users).where(eq(t.users.email, SYSTEM_USER_EMAIL));
  if (!user) {
    [user] = await db
      .insert(t.users)
      .values({ email: SYSTEM_USER_EMAIL, name: 'You' })
      .returning();
  }
  const userId = user!.id;

  await db
    .insert(t.workspaceMembers)
    .values({ workspaceId, userId, role: 'owner' })
    .onConflictDoNothing();

  // ---- default settings ----
  const defaultSettings: Record<string, unknown> = {
    polling_interval_min: 5,
    theme: 'dark',
    density: 'regular',
    sync_to_folder: true,
  };
  for (const [key, value] of Object.entries(defaultSettings)) {
    await db
      .insert(t.settings)
      .values({ workspaceId, userId, key, value })
      .onConflictDoNothing();
  }

  // ---- demo repo (acme/payments-api) ----
  let [repo] = await db
    .select()
    .from(t.repos)
    .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, 'acme/payments-api')));
  if (!repo) {
    [repo] = await db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: 'payments-api',
        fullName: 'acme/payments-api',
        defaultBranch: 'main',
        clonePath: null,
        createdBy: userId,
      })
      .returning();
  }
  const repoId = repo!.id;

  // ---- PR #482 (rate limiting) ----
  let [pr] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.repoId, repoId), eq(t.pullRequests.number, 482)));
  if (!pr) {
    [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number: 482,
        title: 'Add rate limiting to public API endpoints',
        author: 'marisa.koch',
        branch: 'feat/rate-limit-public',
        base: 'main',
        headSha: 'a1b2c3d4e5f6',
        additions: 247,
        deletions: 38,
        filesCount: 9,
        status: 'needs_review',
        body: 'Add rate limiting to public API endpoints to prevent abuse from unauthenticated clients.',
      })
      .returning();

    // pr_files (subset)
    await db.insert(t.prFiles).values([
      { prId: pr!.id, path: 'src/middleware/ratelimit.ts', additions: 84, deletions: 0 },
      { prId: pr!.id, path: 'src/api/public/webhooks.ts', additions: 31, deletions: 6 },
      { prId: pr!.id, path: 'src/config.ts', additions: 4, deletions: 0 },
      { prId: pr!.id, path: 'src/api/users.ts', additions: 7, deletions: 2 },
    ]);

    // pr_commits
    await db.insert(t.prCommits).values({
      prId: pr!.id,
      sha: 'a1b2c3d4e5f6',
      message: 'Add token-bucket rate limiter',
      author: 'marisa.koch',
    });

    // a sample review + findings so the PR shows results before the first run
    const [review] = await db
      .insert(t.reviews)
      .values({
        workspaceId,
        prId: pr!.id,
        kind: 'review',
        verdict: 'request_changes',
        summary:
          'Solid middleware approach, but a Stripe secret key is committed in plaintext and the user-list endpoint introduces an N+1 query under the new limiter.',
        score: 61,
        model: 'seed',
      })
      .returning();

    await db.insert(t.findings).values([
      {
        reviewId: review!.id,
        file: 'src/config.ts',
        startLine: 12,
        endLine: 12,
        severity: 'CRITICAL',
        category: 'security',
        title: 'Hardcoded Stripe secret key in commit',
        rationale: 'Line 12 contains a literal `sk_live_` Stripe secret key.',
        suggestion: 'Move to env var and rotate the key immediately.',
        confidence: 0.98,
      },
      {
        reviewId: review!.id,
        file: 'src/api/users.ts',
        startLine: 45,
        endLine: 52,
        severity: 'WARNING',
        category: 'perf',
        title: 'N+1 query in user list endpoint',
        rationale: 'Loop issues one query per user → N+1.',
        suggestion: 'Use a single IN query and group in memory.',
        confidence: 0.86,
      },
    ]);
  }

  // ---- built-in agents (the three starter presets) ----
  // Prompt bodies live in ./seed-prompts.ts (mirrored in docs/agent-prompts/*.md).
  const seedAgents: Array<typeof t.agents.$inferInsert> = [
    {
      workspaceId,
      name: 'General Reviewer',
      description: 'Reviews a PR diff for bugs, correctness, and clarity.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: GENERAL_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Security Reviewer',
      description: 'Flags secrets, injection, SSRF and the lethal trifecta before merge.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: SECURITY_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Performance Reviewer',
      description: 'Catches N+1 queries, missing indexes, and hot-path allocations.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: PERFORMANCE_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Test Quality Reviewer',
      description:
        'Reviews test quality: uncovered branches, missing edge cases, over-mocking, and flaky-test smells.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: TEST_QUALITY_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
  ];
  for (const a of seedAgents) {
    const [existing] = await db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, a.name)));
    if (!existing) await db.insert(t.agents).values(a);
  }

  // ---- skills (the Skills feature) ----
  // Idempotent by (workspace, name); each also gets a matching skill_versions v1 row.
  const seedSkills: Array<Omit<typeof t.skills.$inferInsert, 'workspaceId'>> = [
    {
      name: 'pr-quality-rubric',
      description: 'A scoring rubric for PR quality across correctness, security, tests, and scope.',
      type: 'rubric',
      source: 'manual',
      enabled: true,
      version: 1,
      body: `# PR Quality Rubric
Score the change on each dimension; a failure on any single dimension caps the PR.

- **Correctness** — does the change do what it claims, on the happy path AND the
  edge cases (empty/null/boundary inputs, error paths)? No inverted conditionals,
  no swallowed errors, no broken caller contracts.
- **Security** — no secrets in the diff, input validated at trust boundaries,
  parameterized queries, fail-closed defaults, no new injection/SSRF/authz gaps.
- **Tests** — new behaviour and new branches are covered by tests that would fail
  if the code were wrong; no over-mocking, no flaky-test smells.
- **Scope** — the diff does one thing; no unrelated refactors, no dead code, no
  speculative abstraction, no drive-by config churn.`,
    },
    {
      name: 'no-then-chains',
      description: 'House rule: use async/await instead of Promise .then() chains.',
      type: 'convention',
      source: 'extracted',
      enabled: true,
      version: 1,
      body: `# Convention: no \`.then()\` chains
Always use \`async/await\` instead of \`.then()\`/\`.catch()\` promise chains.

- Flag any \`.then(\` / \`.catch(\` / \`.finally(\` added in the diff.
- Rewrite \`fetch(url).then(r => r.json())\` as \`const r = await fetch(url); const data = await r.json();\`.
- Rationale: await keeps control flow linear, error handling in one \`try/catch\`,
  and stack traces intact. Chains hide missed rejections and nest quickly.`,
    },
    {
      name: 'secret-leakage-gate',
      description: 'Detects committed secret patterns (sk_live, service_role, NEXT_PUBLIC_) in diffs.',
      type: 'security',
      source: 'community',
      enabled: true,
      version: 1,
      body: `# Secret Leakage Gate
Block any diff that introduces a committed secret.

- **\`sk_live\`** — Stripe live secret keys (also \`sk_test\`, \`rk_live\`).
- **\`service_role\`** — Supabase service-role keys / JWTs (full DB bypass).
- **\`NEXT_PUBLIC_\`** — a public env var holding a value that is actually a
  secret (anything ending up in the client bundle must never be a real secret).

For any match: CRITICAL, cite file:line, tell the author to move the value to
\`~/.devdigest/secrets.json\` / env and ROTATE the exposed credential. Never echo the
secret value back in the finding.`,
    },
    {
      name: 'lethal-trifecta',
      description:
        'Flags PRs that combine private-data access, untrusted input, and an exfiltration path.',
      type: 'security',
      source: 'community',
      enabled: true,
      version: 1,
      body: `# Lethal Trifecta
Flag a change only when ONE flow combines all three components:

1. **Untrusted input** — PR body, web page, file, or tool output the agent ingests.
2. **Private-data access** — the same agent/flow can read secrets, private repos,
   PII, or internal data.
3. **Exfiltration path** — an outbound call, tool, or attacker-readable output the
   data can escape through.

Name a concrete file:line for each of the three. A normal authenticated
\`request → DB read → JSON response\` is NOT a trifecta — that is ordinary access
control. When any component is missing or speculative, downgrade to a normal
finding. A false trifecta is worse than none.`,
    },
    {
      name: 'phantom-api-gate',
      description:
        'Detects imports of functions/modules that do not exist in the repo. Imported, unvetted.',
      type: 'security',
      source: 'extracted',
      enabled: false,
      version: 1,
      body: `# Phantom API Gate
Detect "phantom" / hallucinated imports: code that imports a module, function, or
export that does not actually exist in the repository or its dependencies.

- Flag \`import { foo } from './bar'\` where \`bar\` has no \`foo\` export.
- Flag imports of packages absent from \`package.json\`.
- Flag calls to methods that do not exist on the imported symbol.

Rationale: hallucinated APIs are a common LLM-authored-PR failure and, when the
name collides with a squatted package, a supply-chain risk.`,
    },
    {
      name: 'test-coverage-nudge',
      description: 'Suggests tests when new branches lack coverage.',
      type: 'custom',
      source: 'manual',
      enabled: true,
      version: 1,
      body: `# Test Coverage Nudge
When the diff adds a new branch (\`if\`/\`else\`, \`switch\` case, ternary, \`try/catch\`,
early return) that no test in the diff exercises, suggest a test.

- Name the specific untested branch and the input that would reach it.
- Keep it a SUGGESTION unless the untested branch is an error/failure path with real
  defect risk — then WARNING.
- Do not demand tests for trivial one-liners or pure type changes.`,
    },
  ];
  for (const s of seedSkills) {
    let [existing] = await db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.name, s.name)));
    if (!existing) {
      [existing] = await db
        .insert(t.skills)
        .values({ ...s, workspaceId })
        .returning();
      await db
        .insert(t.skillVersions)
        .values({ skillId: existing!.id, version: 1, body: s.body })
        .onConflictDoNothing();
    }
  }

  // ---- link skills to agents (agent_skills, order = index) ----
  const skillIdByName = new Map(
    (
      await db
        .select({ id: t.skills.id, name: t.skills.name })
        .from(t.skills)
        .where(eq(t.skills.workspaceId, workspaceId))
    ).map((s) => [s.name, s.id]),
  );
  const agentIdByName = new Map(
    (
      await db
        .select({ id: t.agents.id, name: t.agents.name })
        .from(t.agents)
        .where(eq(t.agents.workspaceId, workspaceId))
    ).map((a) => [a.name, a.id]),
  );
  const links: Array<{ agent: string; skills: string[] }> = [
    { agent: 'Security Reviewer', skills: ['pr-quality-rubric', 'secret-leakage-gate', 'lethal-trifecta'] },
    { agent: 'Test Quality Reviewer', skills: ['test-coverage-nudge', 'pr-quality-rubric'] },
  ];
  for (const { agent, skills } of links) {
    const agentId = agentIdByName.get(agent);
    if (!agentId) continue;
    for (const [order, skillName] of skills.entries()) {
      const skillId = skillIdByName.get(skillName);
      if (!skillId) continue;
      await db
        .insert(t.agentSkills)
        .values({ agentId, skillId, order })
        .onConflictDoNothing();
    }
  }

  return { workspaceId, userId };
}

// CLI entrypoint
if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  const handle = createDb(url);
  seed(handle.db)
    .then(async (r) => {
      console.log('✓ seeded', r);
      await handle.close();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('✗ seed failed:', err);
      await handle.close();
      process.exit(1);
    });
}
