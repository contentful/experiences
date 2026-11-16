import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContentfulExperiences, type ExperienceRuntime } from '../../index.js';

afterEach(() => vi.unstubAllGlobals());

describe('Destination sitemap transport', () => {
  it('uses configured Delivery credentials and space, and follows pagination without fetching content', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () =>
      globalThis.Response.json({
        paths: {
          items: [
            {
              path: '/products',
              experienceUrn:
                'crn:contentful:::experience:spaces/space/environments/master/experiences/products',
              sys: { type: 'DestinationExperienceNode' },
            },
          ],
          limit: 10,
          pages: { next: 'next-cursor', prev: 'prev-cursor' },
        },
      })
    );
    vi.stubGlobal('fetch', fetch);
    const sdk: ExperienceRuntime = new ContentfulExperiences({
      spaceId: 'configured-space',
      environmentId: 'staging',
      delivery: { accessToken: () => 'delivery-token', host: 'https://delivery.example' },
      preview: { accessToken: 'preview-token', host: 'https://preview.example' },
      eventBuilder: { channel: 'server' },
    });
    try {
      const result = await sdk.fetchDestinationSitemap({ destinationId: 'destination' });
      expect(result).toEqual({
        items: [{ path: '/products', experienceId: 'products', type: 'DestinationExperienceNode' }],
        limit: 10,
        pages: { next: 'next-cursor', prev: 'prev-cursor' },
      });
      await sdk.fetchDestinationSitemap(
        { destinationId: 'destination' },
        { limit: 10, pageNext: result.pages.next }
      );
      await sdk.fetchDestinationSitemap(
        { destinationId: 'destination' },
        { limit: 10, pagePrev: result.pages.prev }
      );

      expect(fetch).toHaveBeenCalledTimes(3);
      for (const [url, init] of fetch.mock.calls) {
        const requestUrl = new URL(String(url));
        expect(requestUrl.origin).toBe('https://delivery.example');
        expect(requestUrl.pathname).toContain('/spaces/configured-space/');
        expect(requestUrl.pathname).toContain('/destinations/destination/');
        expect(requestUrl.pathname).not.toContain('/environments/');
        expect(init?.method).toBe('GET');
        expect(new globalThis.Headers(init?.headers).get('authorization')).toBe(
          'Bearer delivery-token'
        );
      }
      const queries = fetch.mock.calls.map(([url]) => new URL(String(url)).searchParams);
      expect([...queries[0]!]).toEqual([]);
      expect(Object.fromEntries(queries[1]!)).toEqual({ limit: '10', pageNext: 'next-cursor' });
      expect(Object.fromEntries(queries[2]!)).toEqual({ limit: '10', pagePrev: 'prev-cursor' });
    } finally {
      sdk.destroy();
    }
  });
});
