import eslintReact from '@eslint-react/eslint-plugin';
import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

const reactConfig = eslintReact.configs['recommended-typescript'];
const reactHooksOverlap = Object.keys(eslintReact.configs['disable-conflict-eslint-plugin-react-hooks'].rules).map(
  (rule) => rule.replace('react-hooks/', ''),
);

export default [
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
      'react-hooks': reactHooks,
    },
    settings: {
      ...reactConfig.settings,
    },
    rules: {
      // TypeScript ESLint recommended rules
      ...tseslint.configs.recommended.rules,
      // React recommended rules (@eslint-react)
      ...reactConfig.rules,
      // React hooks rules
      ...reactHooks.configs.recommended.rules,
      // eslint-plugin-react-hooks (maintained by the React team) stays the
      // source of truth for hooks/compiler rules; turn off @eslint-react's
      // duplicates so each issue is reported once.
      ...Object.fromEntries(reactHooksOverlap.map((rule) => [`@eslint-react/${rule}`, 'off'])),

      // Custom rules (migrated from .eslintrc)
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/consistent-type-imports': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
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
