import { defineConfig } from 'tsup';
import packageJson from './package.json';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/sdk-info.ts',
    'src/runtime.ts',
    'src/tracking-attributes.ts',
    'src/bridge-support.ts',
  ],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'es2022',
  outDir: 'dist',
  tsconfig: 'tsconfig.lib.json',
  bundle: true,
  splitting: true,
  external: [/^@contentful\//],
  define: {
    __DEFAULT_EVENT_CONTEXT_LIBRARY_NAME__: JSON.stringify(packageJson.name),
    __DEFAULT_EVENT_CONTEXT_LIBRARY_VERSION__: JSON.stringify(
      process.env.RELEASE_VERSION ?? packageJson.version
    ),
  },
});
