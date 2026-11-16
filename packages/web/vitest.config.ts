import { defineConfig } from 'vitest/config';
import nodeProject from './vitest.ssr.config.js';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'browser',
          globals: true,
          environment: 'jsdom',
          provide: { webTestEnvironment: 'browser' },
          include: ['src/**/*.{test,spec}.ts'],
          exclude: [
            'src/**/*.ssr.test.ts',
            'src/runtime/snapshot-runtime.test.ts',
            'src/preview/preview-session.test.ts',
          ],
        },
      },
      nodeProject,
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.spec.ts', '**/*.d.ts', 'src/test/**', 'src/test-fixtures/**'],
    },
  },
});
