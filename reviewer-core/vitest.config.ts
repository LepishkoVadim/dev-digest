import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      // Single-sourced contracts live in the server's vendored shared (the
      // engine borrows them; see tsconfig paths).
      '@devdigest/shared': path.resolve(__dirname, '../server/src/vendor/shared'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts'],
      // RATCHET floor, not an aspiration. Current ~64%; the thin src/llm SDK
      // wrappers are covered at the server/integration layer (MockLLMProvider),
      // so a global 80% would demand duplicate unit tests. Locks the floor so
      // coverage of the critical engine can only go up. Raise as tests are added.
      thresholds: { lines: 60, statements: 60, functions: 60, branches: 60 },
    },
  },
});
