import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContentfulViewDeliveryClient } from '@contentful/experience-delivery';
import { fetchExperiencePayload } from './fetch-experience.js';

// Exercise the generated transport rather than replacing its methods, because
// destination locale belongs in the query on both GET and POST.
afterEach(() => vi.unstubAllGlobals());

describe('destination payload transport', () => {
  it.each([{ nodeId: 'node-1' }, { path: '/products' }])(
    'forwards locale for GET and POST with selector %j',
    async (selector) => {
      const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(
        async () =>
          new globalThis.Response(
            JSON.stringify({
              experiences: [
                { path: '/products', experience: { sys: { id: 'actual' }, nodes: [] } },
              ],
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            }
          )
      );
      vi.stubGlobal('fetch', fetch);
      const client = new ContentfulViewDeliveryClient({
        token: 'delivery-token',
        spaceId: 'space',
        environmentId: 'master',
      });
      const options = {
        spaceId: 'space',
        destinationId: 'destination',
        locale: 'fr-FR',
        ...selector,
      };
      for (const personalization of [undefined, { profileId: 'profile' }]) {
        const payload = await fetchExperiencePayload({ ...options, personalization }, client);
        expect(payload).toMatchObject({ sys: { id: 'actual' }, nodes: [] });
        const [url, init] = fetch.mock.calls.at(-1)!;
        expect(new URL(String(url)).searchParams.get('locale')).toBe('fr-FR');
        expect(init?.method).toBe(personalization ? 'POST' : 'GET');
        expect(new globalThis.Headers(init?.headers).get('authorization')).toBe(
          'Bearer delivery-token'
        );
        expect(new globalThis.Headers(init?.headers).get('x-contentful-enable-alpha-feature')).toBe(
          'new-exo-entity-types'
        );
        if (personalization) {
          expect(JSON.parse(String(init?.body))).toEqual({
            ...('path' in selector ? { path: selector.path } : {}),
            extensions: { personalization: { profileId: 'profile', preflight: false } },
          });
        }
      }
      expect(fetch).toHaveBeenCalledTimes(2);
    }
  );
});
