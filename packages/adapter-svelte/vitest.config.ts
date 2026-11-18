import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [svelte({ hot: false })],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{ts,svelte.ts}'],
    // `*.ssr.test.ts` needs Svelte's server build; those run under
    // vitest.ssr.config.ts instead.
    exclude: ['src/**/*.ssr.test.ts'],
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,svelte}'],
      exclude: ['**/*.test.{ts,svelte.ts}', '**/*.spec.{ts,svelte.ts}', '**/*.d.ts'],
    },
  },
  resolve: {
    alias: {
      '$app/navigation': fileURLToPath(new URL('./src/test/kit-navigation.ts', import.meta.url)),
    },
    conditions: ['browser'],
  },
});
