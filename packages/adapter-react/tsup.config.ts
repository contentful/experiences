import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/**/*.ts',
    'src/**/*.tsx',
    '!src/**/*.test.ts',
    '!src/**/*.test.tsx',
    // Legacy hook source/tests stay in place until the runtime migration.
    '!src/use-live-preview.ts',
    '!src/use-live-preview-experience.ts',
  ],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'es2022',
  outDir: 'dist',
  tsconfig: 'tsconfig.lib.json',
  bundle: false,
  external: ['react', 'react-dom', /^@contentful\//],
});
