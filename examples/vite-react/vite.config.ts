import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    fs: {
      // Lets the dev server read the workspace SDK packages' dist/ output.
      allow: ['../..'],
    },
  },
});
