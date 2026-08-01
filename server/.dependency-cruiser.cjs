/**
 * Onion Architecture enforcement — see .claude/skills/onion-architecture/SKILL.md.
 *
 * The dependency rule: dependencies point INWARD only.
 *   domain (vendor/shared) <- application (module service + run-executor)
 *   <- infrastructure (adapters, db, module repository) <- presentation (routes).
 * The composition root (platform/container.ts) is the ONE place allowed to wire
 * every layer together, so it is intentionally exempt from the cross-layer rules.
 *
 * Keep this list to the few highest-value boundaries. Add a rule when a real
 * violation slips through, not for every hypothetical edge.
 */
module.exports = {
  forbidden: [
    {
      name: 'no-domain-to-outer',
      comment:
        'Domain (vendor/shared) is the pure core: Zod schemas + port interfaces. ' +
        'It must not import any framework, ORM, adapter, db, platform, or module.',
      severity: 'error',
      from: { path: '^src/vendor/shared' },
      to: {
        path: ['^src/(adapters|db|platform|modules)/', 'drizzle-orm', 'fastify'],
      },
    },
    {
      name: 'no-route-to-db',
      comment:
        'Presentation (routes.ts) must not touch the ORM or db schema directly — ' +
        'go through a module service, which goes through a repository.',
      severity: 'error',
      from: { path: '^src/modules/[^/]+/routes\\.ts$' },
      to: { path: ['drizzle-orm', '^src/db/(client|schema)'] },
    },
    {
      name: 'no-app-to-orm',
      comment:
        'Application (service.ts / run-executor.ts) must not import the ORM or db ' +
        'schema. Query construction belongs in the repository (infrastructure).',
      severity: 'error',
      from: { path: '^src/modules/[^/]+/(service\\.ts|run-executor\\.ts)$' },
      to: { path: ['drizzle-orm', '^src/db/(client|schema)'] },
    },
    {
      name: 'no-cross-module-internals',
      comment:
        'A module must not import another module\'s internals (routes/service/' +
        'repository). Cross-module wiring goes through platform/container.ts; ' +
        'shared helpers go in modules/_shared.',
      severity: 'error',
      from: { path: '^src/modules/([^/]+)/' },
      to: {
        path: '^src/modules/([^/]+)/(routes|service|repository)',
        pathNot: ['^src/modules/$1/', '^src/modules/_shared/'],
      },
    },
  ],
  options: {
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(\\.test\\.ts$|\\.it\\.test\\.ts$|/mocks\\.ts$)' },
  },
};
