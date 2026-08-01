// Flat ESLint config: typescript-eslint recommended (non-type-checked — fast),
// with Prettier owning formatting. Lean by design.
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  // `clones/` holds repos the studio git-clones for review — never our source.
  { ignores: ['dist/**', 'node_modules/**', 'clones/**', 'src/db/migrations/**', 'src/vendor/**'] },
  ...tseslint.configs.recommended,
  // Baseline: pre-existing violations kept as `warn` so lint is green today and
  // the debt stays visible. Fix incrementally, then promote back to `error`.
  {
    rules: {
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/triple-slash-reference': 'warn',
    },
  },
  prettier,
);
