import { render } from 'svelte/server';
import { createWebSnapshotRuntime, type ContentfulExperiences } from '@contentful/experiences-web';
import { describe, expect, it, vi } from 'vitest';
import RuntimeHarness from '../test/fixtures/RuntimeHarness.svelte';
import { bindSvelteKitClientExperiences } from './client-binding.js';

describe('Kit client binding during SSR', () => {
  it.each(['owned', 'injected'] as const)(
    'renders each supplied inert snapshot with %s configuration without initializing Web',
    async (mode) => {
      const ready = vi.fn();
      const browserConfig = {
        spaceId: 'space',
        environmentId: 'environment',
        delivery: { accessToken: 'browser-token' },
      };
      const { request } = bindSvelteKitClientExperiences({
        config: { components: {} },
        endpoint: '/_exo/primary',
        ...(mode === 'owned'
          ? browserConfig
          : { sdk: createWebSnapshotRuntime({ locale: 'es-ES' }) as ContentfulExperiences }),
        onStatesReady: ready,
      });
      await request.init();
      const first = render(RuntimeHarness, {
        props: {
          config: browserConfig,
          Root: request.ExperiencesRoot,
          snapshot: { locale: 'fr-FR' },
        },
      });
      const second = render(RuntimeHarness, {
        props: {
          config: browserConfig,
          Root: request.ExperiencesRoot,
          snapshot: { locale: 'de-DE' },
        },
      });
      expect(first.body).toContain('idle|fr-FR|neutral');
      expect(second.body).toContain('idle|de-DE|neutral');
      expect(first.body).toContain('supplied content');
      expect(second.body).toContain('supplied content');
      expect(ready).not.toHaveBeenCalled();
    }
  );
});
