// Flat ESLint config: typescript-eslint recommended (non-type-checked — fast),
// with Prettier owning formatting. Copied from reviewer-core/, lean by design.
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  ...tseslint.configs.recommended,
  // Baseline: pre-existing violations kept as `warn` so lint is green today.
  { rules: { '@typescript-eslint/no-unused-vars': 'warn' } },
  prettier,
);
