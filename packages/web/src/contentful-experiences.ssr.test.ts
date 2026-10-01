import { describe, expect, it, vi } from 'vitest';

describe('Web public entry on the server', () => {
  it('imports without browser work and exposes safe context fallbacks', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    const web = await import('./index.js');

    expect(web.ContentfulExperiences).toBeTypeOf('function');
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
    const runtime = new ContentfulExperiences({
      spaceId: 'space',
      environmentId: 'environment',
      resolverConfig: { components: {} },
      delivery: { accessToken: 'delivery-token' },
      profile: { id: 'server-render-profile' },
    });

    expect(runtime.profile).toEqual({ id: 'server-render-profile' });

    runtime.reset();
    expect(runtime.profile).toBeUndefined();
  });
});
