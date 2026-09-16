import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import prettierConfig from 'eslint-config-prettier';

export default [
  js.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
      },
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        module: 'readonly',
        require: 'readonly',
        performance: 'readonly',
        queueMicrotask: 'readonly',
        // Browser globals — used in React adapter (gated by typeof window checks)
        window: 'readonly',
        document: 'readonly',
        HTMLElement: 'readonly',
        HTMLDivElement: 'readonly',
        HTMLDetailsElement: 'readonly',
        Element: 'readonly',
        MediaQueryList: 'readonly',
        MediaQueryListEvent: 'readonly',
        URL: 'readonly',
        crypto: 'readonly',
        globalThis: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    // JSX namespace import used only in type position (React.ReactElement, React.ContextType, …).
    files: ['packages/adapter-react/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        React: 'readonly',
      },
    },
  },
  {
    // Svelte 5 runes are compiler-injected globals, not imports.
    files: ['packages/adapter-svelte/**/*.svelte.ts'],
    languageOptions: {
      globals: {
        $state: 'readonly',
        $effect: 'readonly',
      },
    },
  },
  prettierConfig,
  {
    ignores: [
      '**/node_modules/',
      '**/dist/',
      '**/build/',
      '**/coverage/',
      '**/.next/',
      '**/.svelte-kit/',
      '**/out-tsc/',
      '**/next-env.d.ts',
      '**/*.config.{js,mjs}',
      '.husky/',
    ],
  },
];
