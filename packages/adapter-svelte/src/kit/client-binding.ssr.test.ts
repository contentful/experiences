import { render } from 'svelte/server';
import { createWebSnapshotRuntime, type ContentfulExperiences } from '@contentful/experiences-web';
import { describe, expect, it, vi } from 'vitest';
import KitRequestHarness from '../test/fixtures/KitRequestHarness.svelte';
import { getRequestSourceState } from './request-source.js';
import RuntimeHarness from '../test/fixtures/RuntimeHarness.svelte';
import { bindSvelteKitClientExperiences } from './client-binding.js';

describe('Kit client binding during SSR', () => {
  it('keeps repeated server documents request-local and preserves each captured SSR/hybrid result without browser initialization', async () => {
    const { request } = bindSvelteKitClientExperiences({
      config: { components: {} },
      endpoint: '/_exo/primary',
      spaceId: 'space',
      environmentId: 'environment',
      delivery: { accessToken: 'public' },
    });
    const browserFetch = vi.spyOn(globalThis, 'fetch');
    const renderDocument = async (id: string, initialPageOwner?: 'server') => {
      const result = {
        requestId: id,
        routeKey: '/',
        experience: { experienceId: id },
        plan: { experienceId: id, nodes: [], diagnostics: [], metadata: {}, debug: false },
        ...(initialPageOwner ? { initialPageOwner } : {}),
      };
      const fetch: typeof globalThis.fetch = async (_url, init) => {
        expect(JSON.parse(String(init?.body))).toEqual({
          operation: 'prepare',
          routeKey: '/',
          experience: { experienceId: id },
        });
        return new globalThis.Response(JSON.stringify(result));
      };
      const source = await request.loadExperience(
        { url: new URL('https://example.test/'), fetch },
        { experience: result.experience }
      );
      const rendered = render(KitRequestHarness, {
        props: { Root: request.ExperiencesRoot, Experience: request.Experience, source },
      });
      expect(rendered.body).toContain(`${id}|success|${id}`);
      expect(getRequestSourceState(source).result).toEqual(result);
      return rendered.body;
    };
    await renderDocument('ordinary-ssr', 'server');
    const documents = await Promise.all([
      renderDocument('hybrid'),
      renderDocument('next-document', 'server'),
    ]);
    expect(documents[0]).not.toContain('next-document|success');
    expect(documents[1]).not.toContain('hybrid|success');
    expect(browserFetch).not.toHaveBeenCalled();
    browserFetch.mockRestore();
  });
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
