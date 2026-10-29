import { defineConfig } from 'tsup';
import packageJson from './package.json';

export default defineConfig({
  entry: ['src/index.ts'],
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
    __EXPERIENCES_CLIENT_NAME__: JSON.stringify(packageJson.name),
    __EXPERIENCES_CLIENT_VERSION__: JSON.stringify(
      process.env.RELEASE_VERSION ?? packageJson.version
    ),
  },
});
