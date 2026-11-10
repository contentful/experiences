import { describe, expect, it, vi } from 'vitest';
import {
  applyNextjsPrivateResponseCache,
  assertNextjsPublicRequestPolicy,
  createNextjsPrivateFetch,
} from './policy.js';

describe('explicit cache boundaries', () => {
  it('preserves custom transport inputs while making Next caching private', async () => {
    const customFetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new globalThis.Response('ok'));
    const fetch = createNextjsPrivateFetch(customFetch);
    const controller = new globalThis.AbortController();
    const input = new globalThis.Request('https://example.com/private', {
      headers: { authorization: 'Bearer custom' },
    });
    const init = {
      method: 'POST',
      body: 'body',
      headers: { 'x-custom': 'value' },
      signal: controller.signal,
      cache: 'force-cache' as const,
      next: { revalidate: 30, tags: ['app'] },
    };
    await fetch(input, init);
    expect(customFetch).toHaveBeenCalledWith(input, {
      ...init,
      cache: 'no-store',
      next: { tags: ['app'] },
    });
    expect(init.next.revalidate).toBe(30);
    expect(customFetch.mock.calls[0]![1]?.signal).toBe(controller.signal);
    await fetch(input, { next: { revalidate: false } } as globalThis.RequestInit);
    expect(customFetch.mock.calls[1]![1]).toMatchObject({ cache: 'no-store', next: {} });
  });

  it('retains unrelated response and Vary headers', () => {
    const response = {
      headers: new globalThis.Headers({
        vary: 'RSC, Next-Router-Prefetch',
        etag: 'value',
        'cache-control': 'public, max-age=60',
      }),
    };
    applyNextjsPrivateResponseCache(response);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('vary')).toBe('RSC, Next-Router-Prefetch');
    expect(response.headers.get('etag')).toBe('value');
  });

  it('validates explicit public/static intent without imposing private fetch configuration', () => {
    expect(() =>
      assertNextjsPublicRequestPolicy({
        cache: { scope: 'static' },
        context: { consent: false, locale: 'en-US' },
        fetchOptions: { experienceId: 'home' },
      })
    ).not.toThrow();
    expect(() =>
      assertNextjsPublicRequestPolicy({
        cache: {
          scope: 'public-permutation',
          key: 'space/master/home/revision/en-US/all-selection-dimensions',
        },
      })
    ).not.toThrow();
    expect(() =>
      assertNextjsPublicRequestPolicy({ cache: { scope: 'public-permutation', key: ' ' } })
    ).toThrow('key');
    for (const context of [
      { profile: { id: 'id' } },
      { isPreview: true },
      {
        livePreview: {
          experienceId: 'home',
          sessionId: 'session',
          loadImplementation: async () => {
            throw new Error();
          },
        },
      },
    ]) {
      expect(() =>
        assertNextjsPublicRequestPolicy({ cache: { scope: 'static' }, context })
      ).toThrow('Public/static');
    }
    for (const fetchOptions of [
      { experienceId: 'home', personalization: { profile: { id: 'id' } } },
      { experienceId: 'home', personalization: { events: [] } },
      { experienceId: 'home', preview: true },
    ]) {
      expect(() =>
        assertNextjsPublicRequestPolicy({ cache: { scope: 'static' }, fetchOptions })
      ).toThrow('Public/static');
    }
  });
});
