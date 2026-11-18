/*
 * Second Vitest project for the SSR-compiled output.
 *
 * The main config renders through `@testing-library/svelte` in jsdom, which
 * exercises Svelte's *client* build. Svelte's server build differs in ways that
 * matter to this adapter — most notably, compiled snippets receive their
 * arguments by value rather than as getters — so `*.ssr.test.ts` files run here
 * with `environment: 'node'`, where vite-plugin-svelte emits server code and
 * components render via `render()` from `svelte/server`.
 */
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '$app/navigation': fileURLToPath(new URL('./src/test/kit-navigation.ts', import.meta.url)),
    },
  },
  plugins: [svelte({ hot: false })],
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.ssr.test.ts'],
  },
});
