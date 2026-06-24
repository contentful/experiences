import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  // Force SvelteKit's SSR loader to bundle our workspace SDK packages instead
  // of letting Node ESM resolve them directly. Their compiled dist/ files use
  // extensionless relative imports (e.g. `./viewport`), which Vite happily
  // resolves but Node's strict ESM loader rejects. This is the SvelteKit
  // equivalent of Next.js's `transpilePackages` option.
  ssr: {
    noExternal: [
      '@contentful/experiences-svelte',
      '@contentful/experiences-core',
      '@contentful/experiences-design',
    ],
  },
  server: {
    fs: {
      allow: ['../../packages', '../..'],
    },
  },
});
