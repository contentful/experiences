import { existsSync, readFileSync } from 'node:fs';
import { parse } from 'dotenv';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const localEnvironment = resolve(import.meta.dirname, '.env');
const previewEnabled =
  parse(
    readFileSync(existsSync(localEnvironment) ? localEnvironment : `${localEnvironment}.example`)
  ).LIVE_PREVIEW_ENABLED === 'true';

// Maintainer: Vite bundles local React presentation only. Hosting projects the
// explicit allowlist at request time; no environment values are baked into assets.
export default defineConfig({
  root: import.meta.dirname,
  publicDir: false,
  envDir: false,
  envPrefix: [],
  define: { __LIVE_PREVIEW_ENABLED__: JSON.stringify(previewEnabled) },
  build: {
    outDir: resolve(import.meta.dirname, 'dist'),
    target: 'es2022',
    sourcemap: true,
  },
});
