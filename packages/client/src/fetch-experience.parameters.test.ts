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

describe('fetchExperience transport (real generated Delivery client)', () => {
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
      const page = {
        path: '/',
        query: { tag: ['one', 'two'] },
        referrer: '',
        search: '?tag=one&tag=two',
        url: '/?tag=one&tag=two',
        title: 'Home',
      };
      const personalization =
        reason === 'personalization'
          ? {
              profileId: 'profile',
              events: [
                {
                  type: 'page' as const,
                  channel: 'server' as const,
                  context: {
                    campaign: {},
                    library: { name: 'test', version: '1.0.0' },
                    gdpr: { isConsentGiven: true },
                    page,
                  },
                  messageId: 'page-1',
                  timestamp: '2026-10-29T00:00:00.000Z',
                  originalTimestamp: '2026-10-29T00:00:00.000Z',
                  sentAt: '2026-10-29T00:00:00.000Z',
                  properties: page,
                },
              ],
            }
          : undefined;
      const original = globalThis.structuredClone(personalization);
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
        extensions: {
          ...extensions,
          ...(personalization ? { personalization: { ...personalization, preflight: false } } : {}),
        },
      });
      expect(personalization).toEqual(original);
    }
  );

  it.each([
    { preflight: undefined, expected: false },
    { preflight: true, expected: true },
    { preflight: false, expected: false },
  ])(
    'sends profile-only preflight $preflight as $expected without mutating input',
    async ({ preflight, expected }) => {
      const fetch = transport();
      const personalization = { profileId: 'profile', preflight };
      const original = { ...personalization };
      await fetchExperience(
        { ...identity, personalization },
        { accessToken: 'delivery-token' },
        resolveOptions
      );
      expect(request(fetch).method).toBe('POST');
      expect(request(fetch).body).toEqual({
        extensions: { personalization: { profileId: 'profile', preflight: expected } },
      });
      expect(personalization).toEqual(original);
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
    const client = new ContentfulViewDeliveryClient({
      token: async () => 'supplier-token',
      spaceId: identity.spaceId,
      environmentId: identity.environmentId,
    });
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
