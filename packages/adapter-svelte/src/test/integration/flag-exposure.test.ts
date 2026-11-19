import { ContentfulExperiences, type Config } from '@contentful/experiences-web';
import { cleanup, render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { profile } from '../fixtures/runtime-profile.js';
import RuntimeHarness from '../fixtures/RuntimeHarness.svelte';
const config: Config = {
  spaceId: 'space',
  environmentId: 'environment',
  delivery: { accessToken: 'test' },
  locale: 'en-US',
};
const instances: ContentfulExperiences[] = [];
afterEach(() => {
  cleanup();
  for (const instance of instances.splice(0)) instance.destroy();
  window.localStorage.clear();
  window.history.replaceState({}, '', '/');
  vi.restoreAllMocks();
});

describe('reactive flags and Web exposure', () => {
  it('does not repeat flag exposure when unrelated rendered state changes', async () => {
    const blocked = vi.fn();
    const injected = new ContentfulExperiences({
      ...config,
      onEventBlocked: blocked,
      allowedEventTypes: [],
      defaults: {
        consent: false,
        profile: profile('visitor'),
        changes: [
          {
            type: 'Variable',
            key: 'test',
            value: 'flag value',
            meta: { experienceId: 'experiment', variantIndex: 1 },
          },
        ],
      },
    });
    instances.push(injected);
    const view = render(RuntimeHarness, { config, sdk: injected });
    await tick();
    expect(view.container.textContent).toContain('|flag value|');
    const attempts = blocked.mock.calls.length;
    expect(attempts).toBeGreaterThan(0);
    injected.setLocale('de-DE');
    await tick();
    expect(blocked).toHaveBeenCalledTimes(attempts);
  });
});
