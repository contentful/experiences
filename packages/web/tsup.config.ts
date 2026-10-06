import { defineConfig } from 'tsup';
import packageJson from './package.json';

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
  define: {
    __DEFAULT_EVENT_CONTEXT_LIBRARY_NAME__: JSON.stringify(packageJson.name),
    __DEFAULT_EVENT_CONTEXT_LIBRARY_VERSION__: JSON.stringify(
      process.env.RELEASE_VERSION ?? packageJson.version
    ),
  },
});
