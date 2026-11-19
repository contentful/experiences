import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import type { GlobalSetupContext } from 'vitest/node';
import { resolveExperience } from '@contentful/experiences-sdk-core';
import { componentNode } from './fixtures/render-plan.js';

/** Compile package components in Node before the browser project hydrates their real SSR output. */
export default async function setup({ provide }: GlobalSetupContext) {
  const compiler = await createServer({
    configFile: false,
    root: fileURLToPath(new URL('../..', import.meta.url)),
    plugins: [svelte({ hot: false, compilerOptions: { experimental: { async: true } } })],
    server: { middlewareMode: true, watch: null, hmr: false },
    optimizeDeps: { noDiscovery: true },
  });
  try {
    const [
      { default: Renderer },
      { default: Broken },
      { default: Fallback },
      { default: Button },
      server,
    ] = await Promise.all([
      compiler.ssrLoadModule('/src/rendering/ServerExperienceRenderer.svelte'),
      compiler.ssrLoadModule('/src/test/fixtures/BrokenFixture.svelte'),
      compiler.ssrLoadModule('/src/test/fixtures/PropsProbe.svelte'),
      compiler.ssrLoadModule('/src/test/fixtures/ButtonFixture.svelte'),
      compiler.ssrLoadModule('svelte/server'),
    ]);
    const config = { components: { broken: Broken, button: Button } };
    const plan = await resolveExperience(
      {
        nodes: [
          componentNode('broken', { id: 'b' }),
          componentNode('button', {
            id: 'healthy',
            contentProperties: { label: 'healthy sibling' },
          }),
        ],
      },
      config
    );
    const { body } = await server.render(Renderer, {
      props: { experience: plan, config, renderError: Fallback },
      transformError: async () => ({ message: 'Safe server rendering error' }),
    });
    provide('rendererFailure', { body, plan });
  } finally {
    await compiler.close();
  }
}
