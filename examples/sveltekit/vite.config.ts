import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    fs: {
      // Allow Vite to serve files from the workspace packages directory so
      // SvelteKit can compile @contentful/experiences-svelte source on the fly.
      allow: ['../../packages', '../..'],
    },
  },
});
