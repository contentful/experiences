/*
 * Browser-side unit tests (jsdom).
 *
 * No Angular-specific Vite plugin. Templates are declared inline and compiled by
 * Angular's JIT compiler at runtime (pulled in by the `@angular/compiler` import
 * in vitest.setup.ts); esbuild's legacy-decorator transform handles the rest.
 * `experimentalDecorators` / `useDefineForClassFields` come from tsconfig.json,
 * which Vite forwards to esbuild.
 *
 * This is why every component in this package declares inputs with the `@Input()`
 * decorator rather than the signal-based `input()`: signal inputs are AOT-only.
 * JIT builds a component def's `inputs` map from decorator metadata and never
 * scans class-field initializers, so under JIT an `input()` field is invisible to
 * both `reflectComponentType()` and `setInput()` (NG0303). See the note in
 * src/types.ts. AOT-compiling the suite would mean @analogjs/vite-plugin-angular
 * plus `@angular/build`. Both packages' vite/vitest peers are satisfied by this
 * workspace's vite 6 / vitest 3.2 (no longer version-blocked as of the Vite 6 /
 * Vitest 3 bump) — switching is a deliberate harness change, not a dependency
 * wall.
 *
 * AOT-only concerns — `strictTemplates`, partial-Ivy emit — are covered by the
 * `build` target, which runs `ngc`.
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    exclude: ['src/**/*.ssr.test.ts'],
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.spec.ts', '**/*.d.ts', 'src/test-fixtures/**'],
    },
  },
});
