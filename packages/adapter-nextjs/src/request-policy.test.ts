import { ExperienceFetchError, type RequestRuntime } from '@contentful/experiences-node';
import { describe, expect, it, vi } from 'vitest';
import {
  resolveNextjsRequestPolicy as resolvePolicy,
  loadNextjsPrimaryExperience as loadPrimary,
} from './request-policy.js';
import type { NextjsServerExperiencesConfig, NextjsServerRequestContext } from './server-config.js';

const config: NextjsServerExperiencesConfig = {
  spaceId: 'space',
  environmentId: 'master',
  delivery: { accessToken: 'server' },
  config: { components: {} },
  request: { experience: { experienceId: 'home' } },
};
const context: NextjsServerRequestContext = {
  request: {
    url: 'https://example.com/page?q=a+b&tag=first&tag=last',
    headers: new globalThis.Headers(),
  },
  headers: new globalThis.Headers(),
  cookies: { get: () => undefined },
  requestUrl: 'https://example.com/page?q=a+b&tag=first&tag=last',
  routeKey: '/page?q=a+b&tag=first&tag=last',
};
const plan = { nodes: [], diagnostics: [], metadata: {}, debug: false };
const fetchExperience = vi.fn(async () => plan);
const fetchExperienceForHandoff = vi.fn(async () => ({ plan }));
const request = {
  isPreview: false,
  fetchExperience,
  fetchExperienceForHandoff,
} as unknown as RequestRuntime;

describe('Next primary request policy', () => {
  it.each([{ events: [] }, { events: [{ type: 'track' as const, event: 'Explicit' }] }])(
    'preserves explicit events %j',
    async ({ events }) => {
      const descriptor = { experienceId: 'home', personalization: { events } };
      const resolved = await resolvePolicy(config, { experience: descriptor }, context);
      fetchExperienceForHandoff.mockClear();
      const result = await loadPrimary(request, resolved, context, config);
      expect(fetchExperienceForHandoff).toHaveBeenCalledOnce();
      expect(vi.mocked(request.fetchExperienceForHandoff).mock.calls[0]![0]).toBe(descriptor);
      expect(result.initialPagePayload).toBeUndefined();
      expect(result.experience.personalization).toEqual({ events: [] });
    }
  );

  it.each(['initialEvents', 'pagePayload'] as const)('rejects competing %s', async (key) => {
    const resolver = vi.fn();
    await expect(
      resolvePolicy(
        config,
        {
          experience: { experienceId: 'home', personalization: { events: [] } },
          [key]: resolver,
        },
        context
      )
    ).rejects.toThrow('conflicts');
    expect(resolver).not.toHaveBeenCalled();
  });

  it('resolves policy in one context and appends one automatic page', async () => {
    const experience = vi.fn(() => ({ experienceId: 'bound' }));
    const defaults = vi.fn(() => ({ metadata: { bound: true }, debug: false }));
    const overrides = vi.fn(() => ({ debug: true }));
    const initialEvents = vi.fn(() => [{ type: 'identify' as const, userId: 'visitor' }]);
    const options = {
      ...config,
      request: { experience, resolveOptions: defaults, initialEvents },
    };
    const resolved = await resolvePolicy(options, { resolveOptions: overrides }, context);
    fetchExperienceForHandoff.mockClear();
    await loadPrimary(request, resolved, context, options);
    for (const resolver of [experience, defaults, overrides, initialEvents])
      expect(resolver).toHaveBeenCalledExactlyOnceWith(context);
    const [descriptor, resolve] = vi.mocked(request.fetchExperienceForHandoff).mock.calls[0]!;
    expect(resolve).toEqual({ config: config.config, metadata: { bound: true }, debug: true });
    expect(descriptor.personalization?.events).toEqual([
      { type: 'identify', userId: 'visitor' },
      {
        type: 'page',
        properties: expect.objectContaining({
          path: '/page',
          url: context.requestUrl,
          search: '?q=a+b&tag=first&tag=last',
          query: { q: 'a b', tag: ['first', 'last'] },
        }),
      },
    ]);
  });

  it('captures expected fetch failures as raw content errors', async () => {
    const error = new ExperienceFetchError('delivery unavailable', {
      spaceId: 'space',
      experienceId: 'home',
    });
    const resolved = await resolvePolicy(config, {}, context);
    fetchExperienceForHandoff.mockRejectedValueOnce(error);
    const result = await loadPrimary(request, resolved, context, config);
    expect(result).toMatchObject({ error, contentError: 'Experience content unavailable.' });
    expect(result.plan).toBeUndefined();
  });

  it('keeps preview evaluation event-free and outside the transfer producer', async () => {
    const initialEvents = vi.fn();
    const pagePayload = vi.fn();
    const options = { ...config, request: { ...config.request!, initialEvents, pagePayload } };
    const resolved = await resolvePolicy(options, {}, context);
    fetchExperience.mockClear();
    fetchExperienceForHandoff.mockClear();
    const result = await loadPrimary(
      { ...request, isPreview: true } as RequestRuntime,
      resolved,
      context,
      options
    );
    expect(fetchExperience).toHaveBeenCalledExactlyOnceWith(config.request!.experience, {
      config: config.config,
    });
    expect(fetchExperienceForHandoff).not.toHaveBeenCalled();
    expect(initialEvents).not.toHaveBeenCalled();
    expect(pagePayload).not.toHaveBeenCalled();
    expect(result.initialPagePayload).toBeUndefined();
    expect(result.handoff).toBeUndefined();
  });
});
