import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
export default [
  {
    ignores: [
      'node_modules/**',
      'build/**',
      '.svelte-kit/**',
      'coverage/**',
      'src/contentful-generated.d.ts',
    ],
  },
  js.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        __REFERENCE_ENVIRONMENT__: 'readonly',
        __LIVE_PREVIEW_ENABLED__: 'readonly',
        $state: 'readonly',
      },
    },
  },
  ...svelte.configs['flat/recommended'],
  {
    files: ['**/*.ts'],
    languageOptions: { parser: tsParser },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: { ...tsPlugin.configs.recommended.rules },
  },
  {
    files: ['**/*.svelte'],
    languageOptions: { parserOptions: { parser: tsParser } },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: { 'no-unused-vars': 'off', '@typescript-eslint/no-unused-vars': 'error' },
  },
  // This app renders validated Rich Text through Contentful's escaping HTML renderer.
  { files: ['src/lib/components/ContentBody.svelte'], rules: { 'svelte/no-at-html-tags': 'off' } },
];
