import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          globals: true,
          environment: 'node',
          include: ['src/**/*.{test,spec}.{ts,tsx}'],
        },
      },
      {
        test: {
          name: 'boundary-browser',
          globals: true,
          environment: 'jsdom',
          include: ['src/diagnostics/component-error-boundary.test.tsx'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        '**/*.test.{ts,tsx}',
        '**/*.spec.{ts,tsx}',
        '**/*.d.ts',
        'src/test/**',
        'src/test-fixtures/**',
      ],
    },
  },
});
