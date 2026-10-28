import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Maintainer: Vite bundles local React presentation only. Hosting projects the
// explicit allowlist at request time; no environment values are baked into assets.
export default defineConfig({
  root: import.meta.dirname,
  publicDir: false,
  envDir: false,
  envPrefix: [],
  build: {
    outDir: resolve(import.meta.dirname, 'dist'),
    target: 'es2022',
    sourcemap: true,
  },
});
