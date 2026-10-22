import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'vite';

const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'public/dist');

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
// Copy installed artifacts, never workspace sources or an adjacent checkout.
await cp(resolve(root, 'node_modules/@contentful/experiences-web/dist'), dist, {
  recursive: true,
});

await build({
  configFile: false,
  root,
  publicDir: false,
  build: {
    outDir: dist,
    emptyOutDir: false,
    target: 'es2022',
    sourcemap: true,
    lib: {
      entry: resolve(root, 'scripts/rich-text.ts'),
      formats: ['es'],
      fileName: () => 'rich-text.js',
    },
  },
});
