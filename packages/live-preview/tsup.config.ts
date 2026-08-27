import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/**/*.ts', '!src/**/*.test.ts', '!src/**/*.spec.ts', '!src/test-fixtures/**/*.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'es2022',
  outDir: 'dist',
  tsconfig: 'tsconfig.lib.json',
  bundle: false,
  external: [/^@contentful\//],
});
