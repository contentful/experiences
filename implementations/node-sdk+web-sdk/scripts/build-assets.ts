import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'vite';

// Maintainer: prepare this standalone reference from locally packed/installed SDK
// artifacts, so verification exercises the consumer distribution. A consumer's
// existing bundler/package installation can supply these assets instead.
const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'public/dist');

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
// Copy installed artifacts, never workspace sources or an adjacent checkout.
const umd = 'contentful-experiences-web.umd.js';
for (const file of [umd, `${umd}.map`])
  await cp(
    resolve(root, 'node_modules/@contentful/experiences-web/dist', file),
    resolve(dist, file)
  );

await cp(resolve(root, 'dist/shared.js'), resolve(dist, 'shared.js'));

await build({
  // Reference app: bundle Rich Text and pure tracking helpers for native ES modules;
  // the SDK constructor still comes from the unchanged classic UMD distribution.
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
