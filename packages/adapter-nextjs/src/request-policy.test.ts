import { ExperienceFetchError, type RequestRuntime } from '@contentful/experiences-node';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resolveRequestPolicy as resolvePolicy,
  loadPrimaryExperience as loadPrimary,
} from './request-policy.js';
import { profileFixture } from '../../adapter-react/src/test/profile.js';
import type { ServerConfig, ServerRequestContext } from './server-config.js';

const config: ServerConfig = {
  spaceId: 'space',
  environmentId: 'master',
  delivery: { accessToken: 'server' },
  config: { components: {} },
  request: { experience: { experienceId: 'home' } },
};
const context: ServerRequestContext = {
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
const fetchExperience = vi.fn<RequestRuntime['fetchExperience']>().mockResolvedValue(plan);
const fetchExperienceForHandoff = vi.fn(async () => ({ plan }));
const request = {
  isPreview: false,
  fetchExperience,
  fetchExperienceForHandoff,
} as unknown as RequestRuntime;

describe('Next primary request policy', () => {
  beforeEach(() => vi.clearAllMocks());
  it('defaults to hybrid and resolves a mode callback once with override precedence', async () => {
    expect((await resolvePolicy(config, {}, context)).mode).toBe('hybrid');
    const bound = vi.fn(() => 'hybrid' as const);
    const override = vi.fn(async () => 'ssr' as const);
    const resolved = await resolvePolicy(
      { ...config, request: { ...config.request!, mode: bound } },
      { mode: override },
      context
    );
    expect(resolved.mode).toBe('ssr');
    expect(override).toHaveBeenCalledExactlyOnceWith(context);
    expect(bound).not.toHaveBeenCalled();
    // @ts-expect-error Runtime callers must receive the same validation.
    await expect(resolvePolicy(config, { mode: 'invalid' }, context)).rejects.toThrow(
      'request.mode'
    );
  });

  it('uses ordinary SSR fetch with automatic page intent and server ownership', async () => {
    const composeRequest = vi.fn();
    const resolved = await resolvePolicy(
      config,
      {
        mode: 'ssr',
        experience: { experienceId: 'home', personalization: { preflight: true } },
        composeRequest,
      },
      context
    );
    const result = await loadPrimary(request, resolved, context, config);
    expect(fetchExperience).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        personalization: {
          preflight: true,
          events: [{ type: 'page', properties: expect.objectContaining({ path: '/page' }) }],
        },
      }),
      { config: config.config }
    );
    expect(fetchExperienceForHandoff).not.toHaveBeenCalled();
    expect(result.initialPageOwner).toBe('server');
    expect(result.handoff).toEqual({
      spaceId: 'space',
      environmentId: 'master',
      cache: { scope: 'private-request' },
    });
    expect(result.experience.personalization).toBeUndefined();
    expect(composeRequest).toHaveBeenCalledExactlyOnceWith(request, result, context);
  });

  it('hydrates SSR evaluation state and preserves current request identity on content failure', async () => {
    const profile = profileFixture('evaluated');
    const personalized = { ...plan, personalization: { profile, changes: [] } };
    fetchExperience.mockResolvedValueOnce(personalized);
    const facade = { ...request, profile: { id: profile.id } } as RequestRuntime;
    const resolved = await resolvePolicy(config, { mode: 'ssr' }, context);
    const result = await loadPrimary(facade, resolved, context, config);
    expect(result.handoff).toMatchObject({
      profileId: profile.id,
      state: { profile, changes: [] },
    });
    expect(result.handoff?.replay).toBeUndefined();
    const error = new ExperienceFetchError('unavailable', {
      spaceId: 'space',
      experienceId: 'home',
    });
    fetchExperience.mockRejectedValueOnce(error);
    const failed = await loadPrimary(facade, resolved, context, config);
    expect(failed).toMatchObject({
      error,
      contentError: 'Experience content unavailable.',
      initialPageOwner: 'server',
      handoff: { profileId: profile.id },
    });
    expect(failed.plan).toBeUndefined();
    expect(failed.handoff?.state).toBeUndefined();
    expect(failed.handoff?.replay).toBeUndefined();
  });

  it.each([
    { mode: 'ssr' as const, events: [] },
    { mode: 'hybrid' as const, events: [{ type: 'track' as const, event: 'Explicit' }] },
  ])('preserves explicit events without synthesizing a page ($mode)', async ({ mode, events }) => {
    const descriptor = { experienceId: 'home', personalization: { events } };
    const resolved = await resolvePolicy(config, { mode, experience: descriptor }, context);
    const result = await loadPrimary(request, resolved, context, config);
    const fetch = mode === 'ssr' ? fetchExperience : fetchExperienceForHandoff;
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0]![0]).toBe(descriptor);
    expect(result.initialPagePayload).toBeUndefined();
    expect(result.experience.personalization).toEqual({ events: [] });
  });

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

  it('keeps preview evaluation event-free without SSR ownership', async () => {
    const initialEvents = vi.fn();
    const pagePayload = vi.fn();
    const options = { ...config, request: { ...config.request!, initialEvents, pagePayload } };
    const resolved = await resolvePolicy(options, { mode: 'ssr' }, context);
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
    expect(result.initialPageOwner).toBeUndefined();
  });
});
