/*
 * Server-side render tests (node, no DOM globals).
 *
 * Split into its own config rather than a `test.projects` entry because the
 * workspace is on Vitest 1.6 — `projects` needs 3.2+.
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.ssr.test.ts'],
    setupFiles: ['./vitest.ssr.setup.ts'],
  },
});
