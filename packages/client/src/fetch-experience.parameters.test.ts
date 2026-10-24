import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContentfulViewDeliveryClient } from '@contentful/experience-delivery';
import { fetchExperience } from './fetch-experience.js';
import type { ExperienceParameters } from './index.js';

const identity = { spaceId: 'space', environmentId: 'master', experienceId: 'collection' };
const resolveOptions = { config: { components: { posts: {} } } };
const parameters = {
  productId: 'a/b & café?=+',
  count: 0,
  locale: 'fr-FR',
  featuredPosts: { limit: 6, order: '-fields.title' },
} satisfies ExperienceParameters;

function payload(title = 'initial') {
  return {
    sys: {
      id: 'collection',
      type: 'Experience',
      space: { sys: { type: 'Link', linkType: 'Space', id: 'space' } },
      environment: { sys: { type: 'Link', linkType: 'Environment', id: 'master' } },
      experienceTemplate: {
        sys: {
          type: 'ResourceLink',
          linkType: 'Contentful:ExperienceTemplate',
          urn: 'crn:contentful:::experience:spaces/space/environments/master/experience_templates/page',
        },
      },
      createdAt: '2026-10-15T00:00:00.000Z',
      updatedAt: '2026-10-15T00:00:00.000Z',
      createdBy: { sys: { type: 'Link', linkType: 'User', id: 'user' } },
      updatedBy: { sys: { type: 'Link', linkType: 'User', id: 'user' } },
    },
    nodes: [
      {
        component: {
          sys: {
            type: 'ResourceLink',
            linkType: 'Contentful:Component',
            urn: 'crn:contentful:::experience:spaces/space/environments/master/components/posts',
          },
        },
        contentProperties: { title },
        designProperties: {},
      },
    ],
    errors: [],
  };
}

function transport() {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
    new globalThis.Response(JSON.stringify(payload()), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  );
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

function request(fetch: ReturnType<typeof transport>, index = 0) {
  const [url, init] = fetch.mock.calls[index]!;
  return {
    url: new URL(String(url)),
    method: init?.method,
    body: init?.body ? JSON.parse(String(init.body)) : undefined,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('runtime parameter transport (real generated Delivery client)', () => {
  it('encodes scalar and Record leaves on GET, keeping system locale separate', async () => {
    const fetch = transport();
    await fetchExperience(
      { ...identity, locale: 'en-US', parameters },
      { accessToken: 'delivery-token' },
      resolveOptions
    );
    const sent = request(fetch);
    expect(sent.method).toBe('GET');
    expect(Object.fromEntries(sent.url.searchParams)).toEqual({
      locale: 'en-US',
      'parameter.productId': parameters.productId,
      'parameter.count': '0',
      'parameter.locale': 'fr-FR',
      'parameter.featuredPosts.limit': '6',
      'parameter.featuredPosts.order': '-fields.title',
    });
    expect(sent.body).toBeUndefined();
  });

  it.each(['extensions', 'personalization', 'empty record'] as const)(
    'preserves structured, unprefixed parameters on POST for %s',
    async (reason) => {
      const fetch = transport();
      const values = reason === 'empty record' ? { featuredPosts: {} } : parameters;
      const extensions = reason === 'extensions' ? { sourceMap: {} } : undefined;
      const personalization = reason === 'personalization' ? { profileId: 'profile' } : undefined;
      await fetchExperience(
        { ...identity, locale: 'en-US', parameters: values, extensions, personalization },
        { accessToken: 'delivery-token' },
        resolveOptions
      );
      const sent = request(fetch);
      expect(sent.method).toBe('POST');
      expect(Object.fromEntries(sent.url.searchParams)).toEqual({ locale: 'en-US' });
      expect(sent.body).toEqual({
        parameters: values,
        extensions: { ...extensions, ...(personalization ? { personalization } : {}) },
      });
    }
  );

  it.each([parameters, { featuredPosts: {} }])(
    'sends parameters on preview with the preview token and host: %j',
    async (values) => {
      const fetch = transport();
      await fetchExperience(
        { ...identity, parameters: values },
        { accessToken: 'delivery-token', previewToken: 'preview-token', preview: true },
        resolveOptions
      );
      expect(request(fetch).url.origin).toBe('https://preview.xdn.contentful.com');
      if ('productId' in values) {
        expect(request(fetch).method).toBe('GET');
        expect(request(fetch).url.searchParams.get('parameter.featuredPosts.order')).toBe(
          '-fields.title'
        );
      } else {
        expect(request(fetch).method).toBe('POST');
        expect(request(fetch).body.parameters).toEqual(values);
      }
    }
  );

  it('preserves dotted IDs on POST so they cannot masquerade as Record leaves', async () => {
    const fetch = transport();
    const values = { 'featuredPosts.limit': 6 };
    await fetchExperience(
      { ...identity, parameters: values },
      { accessToken: 'token' },
      resolveOptions
    );
    expect(request(fetch).method).toBe('POST');
    expect(request(fetch).url.search).toBe('');
    expect(request(fetch).body.parameters).toEqual(values);
  });

  it('supports caller-created clients and resolves a new plan after a parameter change', async () => {
    const fetch = transport();
    fetch
      .mockResolvedValueOnce(new globalThis.Response(JSON.stringify(payload('first six'))))
      .mockResolvedValueOnce(new globalThis.Response(JSON.stringify(payload('next twelve'))));
    const client = new ContentfulViewDeliveryClient({ token: async () => 'supplier-token' });
    const first = await fetchExperience({ ...identity, parameters }, { client }, resolveOptions);
    const second = await fetchExperience(
      {
        ...identity,
        parameters: { ...parameters, featuredPosts: { limit: 12, order: 'sys.createdAt' } },
      },
      { client },
      resolveOptions
    );
    expect(first.nodes[0]?.props.content).toEqual({ title: 'first six' });
    expect(second.nodes[0]?.props.content).toEqual({ title: 'next twelve' });
    expect(request(fetch, 0).url.searchParams.get('parameter.featuredPosts.limit')).toBe('6');
    expect(request(fetch, 1).url.searchParams.get('parameter.featuredPosts.limit')).toBe('12');
    expect(request(fetch, 1).url.searchParams.get('parameter.featuredPosts.order')).toBe(
      'sys.createdAt'
    );
  });

  it.each([undefined, {}])(
    'preserves existing GET calls with absent/empty parameters: %j',
    async (values) => {
      const fetch = transport();
      await fetchExperience(
        { ...identity, parameters: values },
        { accessToken: 'token' },
        resolveOptions
      );
      expect(request(fetch).method).toBe('GET');
      expect(request(fetch).url.search).toBe('');
      expect(request(fetch).body).toBeUndefined();
    }
  );
});
