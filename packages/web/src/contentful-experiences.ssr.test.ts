import { afterEach, describe, expect, it, vi } from 'vitest';

let runtime: import('./contentful-experiences.js').ContentfulExperiences | undefined;

afterEach(() => {
  runtime?.destroy();
  runtime = undefined;
  vi.restoreAllMocks();
});

describe('Web public entry on the server', () => {
  it('imports without browser work and exposes safe context fallbacks', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    const web = await import('./index.js');

    expect(fetch).not.toHaveBeenCalled();
    expect(web.getPageProperties()).toEqual({
      path: '',
      query: {},
      referrer: '',
      search: '',
      title: '',
      url: '',
    });
    expect(web.getUserAgent()).toBeUndefined();
  });

  it('retains live profile state when browser persistence is unavailable', async () => {
    const { ContentfulExperiences } = await import('./index.js');
    runtime = new ContentfulExperiences({
      spaceId: 'space',
      environmentId: 'environment',
      delivery: { accessToken: 'delivery-token' },
      defaults: { profile: { id: 'server-render-profile' } },
    });

    expect(runtime.states.profile.current).toEqual({ id: 'server-render-profile' });

    runtime.reset();
    expect(runtime.states.profile.current).toBeUndefined();
  });
});

describe('Web interaction tracking on the server', () => {
  it('automatically initializes and accepts tracking controls without a DOM', async () => {
    const { ContentfulExperiences } = await import('./index.js');
    runtime = new ContentfulExperiences({
      spaceId: 'space',
      environmentId: 'environment',
      delivery: { accessToken: 'delivery-token' },
    });

    expect(() => {
      runtime!.tracking.disable('views');
      runtime!.tracking.enable('views');
      runtime!.reset();
      runtime!.destroy();
    }).not.toThrow();
  });
});

describe('Session preview without browser globals', () => {
  it('uses an explicit ID before any event work', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    const { ContentfulExperiences } = await import('./index.js');
    runtime = new ContentfulExperiences({
      spaceId: 'space',
      environmentId: 'environment',
      delivery: { accessToken: 'delivery-token' },
      previewSessionId: ' session-1 ',
      defaults: { consent: true },
    });
    expect(runtime.isPreview).toBe(true);
    await expect(runtime.page()).resolves.toEqual({ accepted: false, reason: 'preview' });
    await expect(
      runtime.trackClick({ entityId: 'hero', entityKind: 'ExperienceFragment' })
    ).resolves.toEqual({ accepted: false, reason: 'preview' });
    await runtime.flush();
    runtime.destroy();
    expect(fetch).not.toHaveBeenCalled();
  });
});
