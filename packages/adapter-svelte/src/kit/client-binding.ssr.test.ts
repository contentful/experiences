import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';
import * as owners from '../runtime/owner-controller.svelte.js';
import KitStartupFixture from '../test/fixtures/KitStartupFixture.svelte';
import { bindSvelteKitClientExperiences } from './client-binding.js';

describe('Kit client binding during SSR', () => {
  it('creates independent inert component scopes and renders baseline without Web activation', async () => {
    const create = vi.spyOn(owners, 'createRuntimeOwner');
    try {
      const ready = vi.fn();
      const { request } = bindSvelteKitClientExperiences({
        config: { components: {} },
        endpoint: '/_exo/primary',
        spaceId: 'space',
        environmentId: 'environment',
        delivery: { accessToken: 'browser-token' },
        onStatesReady: ready,
      });
      await request.init();
      expect(create).not.toHaveBeenCalled();
      const first = render(KitStartupFixture, { props: { Root: request.ExperiencesRoot } });
      const second = render(KitStartupFixture, { props: { Root: request.ExperiencesRoot } });
      expect(first.body).toContain('Application baseline');
      expect(second.body).toContain('Application baseline');
      expect(create).toHaveBeenCalledTimes(2);
      const firstOwner = create.mock.results[0]!.value as owners.RuntimeOwner;
      const secondOwner = create.mock.results[1]!.value as owners.RuntimeOwner;
      expect(firstOwner).not.toBe(secondOwner);
      expect(firstOwner.current.status).toBe('disposed');
      expect(secondOwner.current.status).toBe('disposed');
      expect(ready).not.toHaveBeenCalled();
    } finally {
      create.mockRestore();
    }
  });
});
