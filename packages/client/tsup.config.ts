import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/**/*.ts', '!src/**/*.test.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'es2022',
  outDir: 'dist',
  tsconfig: 'tsconfig.lib.json',
  bundle: false,
});
