import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [svelte()],
  server: {
    port: 5174,
    fs: {
      // Lets the dev server read the workspace SDK packages' dist/ output.
      allow: ['../..'],
    },
  },
});
