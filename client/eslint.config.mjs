// Flat ESLint config for the Next.js studio. Deliberately lean: typescript-eslint
// recommended (non-type-checked — fast, no project service), React Hooks rules
// (the exhaustive-deps/rules-of-hooks catches that were previously unenforced),
// and the Next.js plugin. eslint-config-prettier is last so formatting is
// Prettier's job, not ESLint's.
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import next from '@next/eslint-plugin-next';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts', 'src/vendor/**'] },
  ...tseslint.configs.recommended,
  {
    plugins: { '@next/next': next, 'react-hooks': reactHooks },
    rules: {
      ...next.configs.recommended.rules,
      ...next.configs['core-web-vitals'].rules,
      ...reactHooks.configs.recommended.rules,
    },
  },
  // Baseline: these rules already have pre-existing violations. Kept as `warn`
  // (not `error`) so lint is green today and the debt stays visible. Fix
  // incrementally, then promote back to `error`. See plan P2 (types/patterns).
  {
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
      '@next/next/no-html-link-for-pages': 'warn',
    },
  },
  prettier,
);
