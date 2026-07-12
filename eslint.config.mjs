// ESLint 9 flat config — backend apps, libs, and root scripts.
// Frontends (apps/web, apps/web-next) carry their own configs and are linted
// through their per-app lint targets.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/.nx/**',
      'apps/web/**',
      'apps/web-next/**',
      '**/*.js',
      '**/*.mjs',
      '**/generated/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-floating-promises': 'off',
      // Configuration is read through ConfigService / the layered config loader,
      // never straight off process.env (see docs/agents/conventions.md).
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[object.name='process'][property.name='env']",
          message:
            'Do not read process.env directly — use ConfigService (libs/config layered loader).',
        },
      ],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    // Bootstrap surfaces that legitimately touch process.env: the config layer
    // itself, the TypeORM CLI datasource, main.ts, and the composition root
    // (CONFIG_DIR before config exists; THROTTLE_DISABLED read per-request).
    files: [
      'libs/config/**/*.ts',
      'libs/database/src/data-source.ts',
      'apps/*/src/main.ts',
      'apps/*/src/app.module.ts',
      'apps/api-prisma/prisma/seed.ts',
    ],
    rules: {
      'no-restricted-syntax': 'off',
      'no-console': 'off',
    },
  },
  {
    files: ['**/*.spec.ts', '**/test/**/*.ts', '**/*.e2e-spec.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-restricted-syntax': 'off',
      'no-console': 'off',
    },
  },
);
