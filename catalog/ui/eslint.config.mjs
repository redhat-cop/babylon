import eslintReact from '@eslint-react/eslint-plugin';
import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import globals from 'globals';

const reactConfig = eslintReact.configs['recommended-typescript'];

export default [
  // Vendored third-party scripts (New Relic browser agent) — not our code.
  { ignores: ['src/public/monitor.js'] },

  // Base ESLint recommended rules
  js.configs.recommended,

  // Configuration for JavaScript and TypeScript files
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.jest,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      ...reactConfig.plugins,
    },
    settings: {
      ...reactConfig.settings,
    },
    rules: {
      // TypeScript ESLint recommended rules
      ...tseslint.configs.recommended.rules,
      // React recommended rules (@eslint-react)
      ...reactConfig.rules,

      // Custom rules (migrated from .eslintrc)
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/interface-name-prefix': 'off',
      'prettier/prettier': 'off',
      'import/no-unresolved': 'off',
      'import/extensions': 'off',
    },
  },

  // Configuration for JavaScript files only
  {
    files: ['**/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.jest,
      },
    },
  },
];
