import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'dotenv';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
import { getPublicEnvironment } from './public-config.ts';
const file = resolve(import.meta.dirname, '.env');
const env = parse(readFileSync(existsSync(file) ? file : `${file}.example`));
export default defineConfig({
  envDir: false,
  envPrefix: [],
  define: {
    __REFERENCE_ENVIRONMENT__: JSON.stringify(getPublicEnvironment(env)),
    __LIVE_PREVIEW_ENABLED__: JSON.stringify(env.LIVE_PREVIEW_ENABLED === 'true'),
  },
  plugins: [sveltekit({ adapter: adapter(), preprocess: vitePreprocess() })],
  server: { host: '127.0.0.1', port: 3600, strictPort: true },
  preview: { host: '127.0.0.1', port: 3600, strictPort: true },
});
