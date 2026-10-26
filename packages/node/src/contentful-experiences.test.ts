import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ContentfulExperiences,
  type ExperiencesNodeConfig,
  type ExperiencesNodeRequestContext,
} from './contentful-experiences.js';
import {
  EventProfileRequiredError,
  parseExperiencesHandoff,
} from '@contentful/experiences-runtime';
import { DEFAULT_EVENT_CONTEXT_LIBRARY } from './sdk-info.js';

const runtimes = new Set<ContentfulExperiences>();
const resolverConfig = { components: {} };

function trackRuntime<T extends ContentfulExperiences>(runtime: T): T {
  runtimes.add(runtime);
  return runtime;
}

afterEach(() => {
  for (const runtime of runtimes) runtime.destroy();
  runtimes.clear();
});

function createRuntime() {
  return trackRuntime(
    new ContentfulExperiences({
      spaceId: 'space',
      environmentId: 'environment',
      locale: 'en-US',
      delivery: { accessToken: 'delivery-token' },
      resolveDefaults: { debug: true, metadata: { source: 'constructor', shared: 'constructor' } },
      app: { name: 'site', version: '1.0.0' },
    })
  );
}

class TestContentfulExperiences extends ContentfulExperiences {
  // Most tests exercise delivery, so grant event consent unless a test says otherwise.
  override forRequest(context: ExperiencesNodeRequestContext = {}) {
    const hasConsent = context.consent !== undefined || context.eventConsent !== undefined;
    if (hasConsent) return super.forRequest(context);
    return super.forRequest({ ...context, consent: { events: true } });
  }
}

function createEventRuntime(
  policy: Pick<ExperiencesNodeConfig, 'allowedEventTypes' | 'onEventBlocked'> = {}
) {
  const runtime = trackRuntime(
    new TestContentfulExperiences({
      ...policy,
      spaceId: 'space',
      environmentId: 'environment',
      locale: 'en-US',
      delivery: { accessToken: 'delivery-token' },
    })
  );
  const upsertProfile = vi
    .spyOn(runtime.api.experience, 'upsertProfile')
    .mockResolvedValue({ profile: { id: 'updated-profile' } } as never);
  const sendBatchEvents = vi.spyOn(runtime.api.insights, 'sendBatchEvents').mockResolvedValue(true);

  return { runtime, sendBatchEvents, upsertProfile };
}

describe('Node ContentfulExperiences', () => {
  it('forwards changed parameters through request facades independently of event consent', async () => {
    const runtime = createRuntime();
    const fetch = vi.spyOn(runtime, 'fetchExperience').mockResolvedValue({ nodes: [] } as never);
    const request = runtime.forRequest({ consent: { events: false }, locale: 'de-DE' });
    const parameters = { featuredPosts: { limit: 6, order: '-fields.title' } };
    await request.fetchExperience({ experienceId: 'exp', parameters }, { config: resolverConfig });
    await request.fetchExperience(
      { experienceId: 'exp', parameters: { productId: 'other' }, preview: true },
      { config: resolverConfig }
    );
    await runtime.forRequest().fetchExperience({ experienceId: 'exp' }, { config: resolverConfig });
    expect(fetch.mock.calls.map(([options]) => options.parameters)).toEqual([
      parameters,
      { productId: 'other' },
      undefined,
    ]);
    expect(fetch.mock.calls[1]?.[0]).toMatchObject({ locale: 'de-DE', preview: true });
  });

  it('allows independent live SDK instances without requiring teardown', () => {
    const first = createRuntime();
    const german = first.forRequest({ locale: 'de-DE' });
    const french = first.forRequest({ locale: 'fr-FR' });
    const second = createRuntime();

    expect(german.locale).toBe('de-DE');
    expect(french.locale).toBe('fr-FR');
    expect(second.forRequest({ locale: 'es-ES' }).locale).toBe('es-ES');

    first.destroy();
    first.destroy();
    expect(second.forRequest({ locale: 'it-IT' }).locale).toBe('it-IT');
  });

  it('binds event construction to each request without changing the shared builder', () => {
    const runtime = createRuntime();
    const page = runtime.eventBuilder.getPageProperties();
    const firstContext = {
      locale: 'de-DE',
      userAgent: 'first-agent',
      page: { ...page, url: 'https://first.test' },
    };
    const secondContext = {
      locale: 'fr-FR',
      userAgent: 'second-agent',
      page: { ...page, url: 'https://second.test' },
    };
    const first = runtime.forRequest({
      locale: 'de-DE',
      eventContext: { ...firstContext, locale: 'it-IT' },
    });
    const second = runtime.forRequest({ eventContext: secondContext });

    expect(first).not.toBe(second);
    expect(first.eventBuilder.buildIdentify({ userId: 'first' }).context).toMatchObject(
      firstContext
    );
    expect(second.eventBuilder.buildTrack({ event: 'second' }).context).toMatchObject(
      secondContext
    );
    expect(runtime.eventBuilder.channel).toBe('server');
    expect(runtime.eventBuilder.library).toEqual(DEFAULT_EVENT_CONTEXT_LIBRARY);
    expect(runtime.eventBuilder.buildTrack({ event: 'runtime' }).context).toMatchObject({
      app: { name: 'site', version: '1.0.0' },
      gdpr: { isConsentGiven: false },
      locale: 'en-US',
      userAgent: undefined,
      page: { url: '' },
      library: DEFAULT_EVENT_CONTEXT_LIBRARY,
    });
  });

  it('lets event inputs override request defaults across Personalization builders', () => {
    const runtime = createRuntime();
    const page = { ...runtime.eventBuilder.getPageProperties(), url: 'https://request.test' };
    const request = runtime.forRequest({
      locale: 'de-DE',
      eventContext: { userAgent: 'request-agent', page },
    });
    const overrides = {
      locale: 'es-ES',
      userAgent: 'event-agent',
      page: { ...page, url: 'https://event.test' },
    };
    const events = [
      request.eventBuilder.buildIdentify({ ...overrides, userId: 'user' }),
      request.eventBuilder.buildTrack({ ...overrides, event: 'action' }),
      request.eventBuilder.buildPageView({ ...overrides, properties: overrides.page }),
    ];
    for (const event of events) expect(event.context).toMatchObject(overrides);
    expect(request.eventBuilder.buildPageView({ properties: page }).context).toMatchObject({
      locale: 'de-DE',
      userAgent: 'request-agent',
      page,
    });
    expect(
      request.eventBuilder.buildTrack({
        event: 'fallback',
        locale: undefined,
        userAgent: undefined,
      }).context
    ).toMatchObject({ locale: 'en-US', userAgent: undefined });
  });

  it('keeps concurrent request context isolated', async () => {
    const runtime = createRuntime();
    const fetchExperience = vi
      .spyOn(runtime, 'fetchExperience')
      .mockImplementation(
        async (options, resolveOptions) =>
          ({ locale: options.locale, metadata: resolveOptions?.metadata }) as never
      );
    const german = runtime.forRequest({
      locale: 'de-DE',
      resolveOptions: { metadata: { request: 'german' } },
    });
    const french = runtime.forRequest({
      locale: 'fr-FR',
      resolveOptions: { metadata: { request: 'french' } },
    });

    const [germanResult, frenchResult] = await Promise.all([
      german.fetchExperience({ experienceId: 'german' }, { config: resolverConfig }),
      french.fetchExperience({ experienceId: 'french' }, { config: resolverConfig }),
    ]);

    expect(germanResult).toEqual({
      locale: 'de-DE',
      metadata: { request: 'german' },
    });
    expect(frenchResult).toEqual({
      locale: 'fr-FR',
      metadata: { request: 'french' },
    });
    expect(fetchExperience).toHaveBeenCalledTimes(2);
  });

  it('applies request options before method options, including explicit false', async () => {
    const runtime = createRuntime();
    const resolveExperience = vi
      .spyOn(runtime, 'resolveExperience')
      .mockResolvedValue({ nodes: [] } as never);
    const request = runtime.forRequest({
      resolveOptions: {
        debug: true,
        metadata: { request: 'value', shared: 'request' },
      },
    });

    await request.resolveExperience(
      { sys: { type: 'Experience' }, nodes: [] },
      { config: resolverConfig, debug: false, metadata: { method: 'value', shared: 'method' } }
    );

    expect(resolveExperience).toHaveBeenCalledWith(expect.anything(), {
      config: resolverConfig,
      debug: false,
      metadata: { request: 'value', method: 'value', shared: 'method' },
    });
  });

  it('forwards an explicit sourceMap, letting the method value win', async () => {
    const runtime = createRuntime();
    const resolveExperience = vi
      .spyOn(runtime, 'resolveExperience')
      .mockResolvedValue({ nodes: [], viewports: [] } as never);
    const requestMap = { version: 1 } as never;
    const methodMap = { version: 2 } as never;
    const request = runtime.forRequest({ resolveOptions: { sourceMap: requestMap } });
    const payload = { sys: { type: 'Experience' }, nodes: [] } as never;

    await request.resolveExperience(payload, { config: resolverConfig });
    await request.resolveExperience(payload, { config: resolverConfig, sourceMap: methodMap });

    expect(resolveExperience.mock.calls[0]?.[1]).toMatchObject({ sourceMap: requestMap });
    expect(resolveExperience.mock.calls[1]?.[1]).toMatchObject({ sourceMap: methodMap });
  });

  it('passes merged request options through the Client runtime defaults', async () => {
    const runtime = createRuntime();
    const request = runtime.forRequest({
      resolveOptions: { debug: true, metadata: { request: 'value', shared: 'request' } },
    });

    const plan = await request.resolveExperience(
      { sys: { type: 'Experience' }, nodes: [] },
      { config: resolverConfig, debug: false, metadata: { method: 'value', shared: 'method' } }
    );

    expect(plan.debug).toBe(false);
    expect(plan.metadata).toEqual({
      source: 'constructor',
      request: 'value',
      method: 'value',
      shared: 'method',
    });
  });

  it("uses each call's resolver config on the same request facade", async () => {
    const runtime = createRuntime();
    const request = runtime.forRequest();
    const payload = {
      nodes: [
        {
          component: {
            sys: {
              type: 'ResourceLink' as const,
              linkType: 'Contentful:Component' as const,
              urn: 'crn:contentful:::experience:spaces/$self/environments/$self/components/hero',
            },
          },
        },
      ],
    };
    const firstConfig = {
      components: { hero: { resolveData: () => ({ variant: 'first' }) } },
    };
    const secondConfig = {
      components: { hero: { resolveData: () => ({ variant: 'second' }) } },
    };
    const fetchExperience = vi
      .spyOn(runtime, 'fetchExperience')
      .mockImplementation(async (_options, resolveOptions) =>
        runtime.resolveExperience(payload, resolveOptions)
      );

    const firstFetched = await request.fetchExperience(
      { experienceId: 'first' },
      { config: firstConfig, debug: false }
    );
    const secondFetched = await request.fetchExperience(
      { experienceId: 'second' },
      { config: secondConfig, debug: false }
    );

    expect(firstFetched.nodes[0]?.props.resolved).toEqual({ variant: 'first' });
    expect(secondFetched.nodes[0]?.props.resolved).toEqual({ variant: 'second' });
    expect(fetchExperience.mock.calls.map(([, options]) => options.config)).toEqual([
      firstConfig,
      secondConfig,
    ]);
  });

  it('forwards fetch and destination calls with the request locale and resolve options', async () => {
    const runtime = createRuntime();
    const fetchExperience = vi
      .spyOn(runtime, 'fetchExperience')
      .mockResolvedValue({ nodes: [] } as never);
    const byNode = vi
      .spyOn(runtime, 'fetchByDestinationNode')
      .mockResolvedValue({ nodes: [] } as never);
    const byPath = vi
      .spyOn(runtime, 'fetchByDestinationPath')
      .mockResolvedValue({ redirect: { path: '/next' } });
    const request = runtime.forRequest({
      locale: 'es-ES',
      resolveOptions: { metadata: { request: true } },
    });

    const personalization = {
      profileId: 'profile-1',
      events: [runtime.eventBuilder.buildPageView(), runtime.eventBuilder.buildPageView()],
    };
    await request.fetchExperience(
      { experienceId: 'experience', personalization },
      { config: resolverConfig }
    );
    await request.fetchByDestinationNode(
      { destinationId: 'destination', nodeId: 'node' },
      { config: resolverConfig }
    );
    await request.fetchByDestinationPath(
      { destinationId: 'destination', path: '/path' },
      { config: resolverConfig }
    );

    expect(fetchExperience).toHaveBeenCalledWith(
      { experienceId: 'experience', locale: 'es-ES', personalization },
      { config: resolverConfig, metadata: { request: true }, debug: undefined }
    );
    expect(byNode).toHaveBeenCalledWith(
      { destinationId: 'destination', nodeId: 'node' },
      { config: resolverConfig, metadata: { request: true }, debug: undefined }
    );
    expect(byPath).toHaveBeenCalledWith(
      { destinationId: 'destination', path: '/path' },
      { config: resolverConfig, metadata: { request: true }, debug: undefined }
    );
  });

  it('retains profile updates within its request facade and delegates Personalization events', async () => {
    const { runtime, upsertProfile } = createEventRuntime();
    const request = runtime.forRequest({ profile: { id: 'initial-profile' } });

    const data = { profile: { id: 'updated-profile' } };
    expect(await request.identify({ userId: 'user-1' })).toEqual({ accepted: true, data });

    expect(upsertProfile).toHaveBeenCalledWith(
      expect.objectContaining({ profileId: 'initial-profile' }),
      { locale: 'en-US' }
    );
    expect(request.profile).toEqual({ id: 'updated-profile' });
    expect(upsertProfile.mock.calls[0]?.[1]).toEqual({ locale: 'en-US' });
  });

  it('requires a request-local profile before delegating Analytics events', async () => {
    const { runtime, sendBatchEvents } = createEventRuntime();
    const request = runtime.forRequest();

    await expect(
      request.trackClick({ entityId: 'entry', entityKind: 'Experience' })
    ).rejects.toBeInstanceOf(EventProfileRequiredError);
    expect(sendBatchEvents).not.toHaveBeenCalled();
  });

  it('keeps concurrent event profiles and context isolated, with locale precedence and consent', async () => {
    const { runtime, sendBatchEvents, upsertProfile } = createEventRuntime({
      allowedEventTypes: ['track'],
    });
    const german = runtime.forRequest({
      locale: 'de-DE',
      profile: { id: 'german-profile' },
      eventContext: { locale: 'context-locale', userAgent: 'german-agent' },
      consent: { events: false },
    });
    const french = runtime.forRequest({
      locale: 'fr-FR',
      profile: { id: 'french-profile' },
      eventContext: { userAgent: 'french-agent' },
      eventConsent: true,
    });

    await Promise.all([
      german.track({ event: 'viewed', locale: 'method-locale' }),
      french.track({ event: 'viewed' }),
      german.trackClick({ entityId: 'german-entry', entityKind: 'Experience' }),
      french.trackClick({ entityId: 'french-entry', entityKind: 'Experience' }),
    ]);

    expect(upsertProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        events: [
          expect.objectContaining({
            context: expect.objectContaining({
              locale: 'method-locale',
              userAgent: 'german-agent',
              gdpr: { isConsentGiven: false },
            }),
          }),
        ],
      }),
      { locale: 'de-DE' }
    );
    expect(upsertProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        events: [
          expect.objectContaining({
            context: expect.objectContaining({
              locale: 'fr-FR',
              userAgent: 'french-agent',
              gdpr: { isConsentGiven: true },
            }),
          }),
        ],
      }),
      { locale: 'fr-FR' }
    );
    // German denied event consent and only allows `track`, so its click never leaves the request.
    expect(sendBatchEvents).toHaveBeenCalledTimes(1);
    expect(sendBatchEvents).toHaveBeenCalledWith([
      expect.objectContaining({
        profile: { id: 'french-profile' },
        events: [
          expect.objectContaining({
            context: expect.objectContaining({
              locale: 'fr-FR',
              userAgent: 'french-agent',
              gdpr: { isConsentGiven: true },
            }),
          }),
        ],
      }),
    ]);
  });

  it('uses event context locale only in the body when no request locale is supplied', async () => {
    const { runtime, upsertProfile } = createEventRuntime();
    const request = runtime.forRequest({ eventContext: { locale: 'it-IT' } });

    await request.track({ event: 'viewed' });

    expect(upsertProfile.mock.calls[0]?.[0].events[0]?.context.locale).toBe('it-IT');
    expect(upsertProfile).toHaveBeenCalledWith(expect.anything(), { locale: 'en-US' });
  });

  it('prepares one ordered, exact Personalization replay with request context and known identity', async () => {
    // This test is about ordering and context, not consent: allow every prepared type.
    const { runtime, sendBatchEvents, upsertProfile } = createEventRuntime({
      allowedEventTypes: ['identify', 'track', 'page'],
    });
    const request = runtime.forRequest({
      locale: 'de-DE',
      profile: { id: 'initial-profile' },
      eventContext: { userAgent: 'server-agent', locale: 'context-locale' },
      eventConsent: false,
    });

    const result = await request.prepareRequestHandoff({
      routeKey: '/products?sort=popular',
      initialEvents: [
        { type: 'identify', userId: 'user-1' },
        { type: 'track', event: 'experience_rendered' },
      ],
      page: { properties: { url: 'https://example.test/products' } },
    });

    expect(upsertProfile).toHaveBeenCalledOnce();
    const [input, options] = upsertProfile.mock.calls[0]!;
    expect(input.profileId).toBe('initial-profile');
    expect(options).toEqual({ locale: 'de-DE', preflight: true });
    expect(input.events.map(({ type }) => type)).toEqual(['identify', 'track', 'page']);
    expect(new Set(input.events.map(({ messageId }) => messageId)).size).toBe(3);
    for (const event of input.events) {
      expect(event.context).toMatchObject({
        locale: 'de-DE',
        userAgent: 'server-agent',
        gdpr: { isConsentGiven: false },
      });
    }
    expect(result.data).toEqual({ profile: { id: 'updated-profile' } });
    expect(request.profile).toEqual({ id: 'updated-profile' });
    expect(result.handoff).toMatchObject({
      spaceId: 'space',
      environmentId: 'environment',
      cache: { scope: 'private-request' },
      profileId: 'initial-profile',
      replay: { routeKey: '/products?sort=popular', locale: 'de-DE' },
    });
    expect(result.handoff.replay?.events).toEqual(input.events);
    expect(result.handoff.replay?.events.map(({ messageId }) => messageId)).toEqual(
      input.events.map(({ messageId }) => messageId)
    );
    expect(parseExperiencesHandoff(JSON.parse(JSON.stringify(result.handoff)))).toEqual(
      result.handoff
    );
    expect(sendBatchEvents).not.toHaveBeenCalled();
  });

  it('previews the full 100-event prepared batch with its exact replay bodies', async () => {
    const { runtime, upsertProfile } = createEventRuntime();
    const request = runtime.forRequest({ locale: 'de-DE' });
    const result = await request.prepareRequestHandoff({
      routeKey: '/products',
      initialEvents: Array.from({ length: 99 }, (_, index) => ({
        type: 'track' as const,
        event: `opened-${index}`,
      })),
    });

    expect(upsertProfile).toHaveBeenCalledOnce();
    const prepared = upsertProfile.mock.calls[0]![0].events;
    expect(prepared).toHaveLength(100);
    expect(prepared.at(-1)?.type).toBe('page');
    expect(new Set(prepared.map(({ messageId }) => messageId)).size).toBe(100);
    expect(prepared.every(({ context }) => context.locale === 'de-DE')).toBe(true);
    expect(result.handoff.replay?.events).toEqual(prepared);
    expect(
      parseExperiencesHandoff(JSON.parse(JSON.stringify(result.handoff))).replay?.events
    ).toEqual(prepared);
  });

  it('uses the API-issued identity for a new profile and keeps later ordinary calls direct', async () => {
    const { runtime, sendBatchEvents, upsertProfile } = createEventRuntime();
    const request = runtime.forRequest();

    const prepared = await request.prepareRequestHandoff({ routeKey: '/home' });

    expect(prepared.handoff.profileId).toBe('updated-profile');
    expect(prepared.handoff.replay?.events.map(({ type }) => type)).toEqual(['page']);
    expect(request.profile).toEqual({ id: 'updated-profile' });
    expect(upsertProfile.mock.calls[0]?.[1]).toEqual({ locale: 'en-US', preflight: true });

    const direct = await request.track({ event: 'after-preparation' });
    expect(direct).toEqual({ accepted: true, data: { profile: { id: 'updated-profile' } } });
    expect(upsertProfile).toHaveBeenCalledTimes(2);
    expect(upsertProfile.mock.calls[1]?.[0]).toMatchObject({ profileId: 'updated-profile' });
    expect(upsertProfile.mock.calls[1]?.[1]).toEqual({ locale: 'en-US' });
    await expect(
      request.trackClick({ entityId: 'entry', entityKind: 'Experience' })
    ).resolves.toEqual({ accepted: true });
    expect(sendBatchEvents).toHaveBeenCalledOnce();
  });

  it('keeps an explicit final-page locale separate from preparation and replay transport', async () => {
    const { runtime, upsertProfile } = createEventRuntime();
    const request = runtime.forRequest({ locale: 'de-DE' });

    const result = await request.prepareRequestHandoff({
      routeKey: '/fr',
      page: { locale: 'fr-FR' },
    });

    expect(result.handoff.replay?.events.at(-1)?.context.locale).toBe('fr-FR');
    expect(result.handoff.replay?.locale).toBe('de-DE');
    expect(upsertProfile.mock.calls[0]?.[1]).toEqual({ locale: 'de-DE', preflight: true });
  });

  it('returns no replay or preview and reports invalid route, event type, and batch limits', async () => {
    const { runtime, upsertProfile } = createEventRuntime();
    const request = runtime.forRequest({ profile: { id: 'known-profile' } });
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const invalid = [
        { routeKey: 'products' },
        { routeKey: '/products', initialEvents: [{ type: 'page' }] },
        {
          routeKey: '/products',
          initialEvents: Array.from({ length: 51 }, () => ({ type: 'identify', userId: 'u' })),
        },
        {
          routeKey: '/products',
          initialEvents: Array.from({ length: 100 }, () => ({ type: 'track', event: 'viewed' })),
        },
      ];
      for (const options of invalid) {
        const result = await request.prepareRequestHandoff(options as never);
        expect(result).toEqual({
          handoff: {
            spaceId: 'space',
            environmentId: 'environment',
            cache: { scope: 'private-request' },
            profileId: 'known-profile',
          },
        });
      }
      expect(warning).toHaveBeenCalledTimes(invalid.length);
      expect(warning).toHaveBeenCalledWith(
        expect.stringContaining('Invalid request handoff inputs')
      );
      expect(upsertProfile).not.toHaveBeenCalled();
      expect(request.profile).toEqual({ id: 'known-profile' });
    } finally {
      warning.mockRestore();
    }
  });

  it('keeps exact prepared replay and known identity when preview transport fails', async () => {
    const { runtime, upsertProfile } = createEventRuntime();
    upsertProfile.mockRejectedValueOnce(new Error('preview unavailable'));
    const request = runtime.forRequest({ profile: { id: 'known-profile' } });
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const result = await request.prepareRequestHandoff({
        routeKey: '/fallback',
        initialEvents: [{ type: 'track', event: 'opened' }],
      });
      expect(upsertProfile).toHaveBeenCalledOnce();
      expect(upsertProfile.mock.calls[0]?.[1]).toEqual({ locale: 'en-US', preflight: true });
      expect(result.data).toBeUndefined();
      expect(result.handoff.profileId).toBe('known-profile');
      expect(result.handoff.replay?.events).toEqual(upsertProfile.mock.calls[0]?.[0].events);
      expect(result.handoff.replay?.events.map(({ type }) => type)).toEqual(['track', 'page']);
      expect(request.profile).toEqual({ id: 'known-profile' });
      expect(warning).toHaveBeenCalledWith(expect.stringContaining('Request preview failed'));
    } finally {
      warning.mockRestore();
    }
  });

  it('keeps preparation identity and event context isolated across request facades', async () => {
    const { runtime, upsertProfile } = createEventRuntime();
    const german = runtime.forRequest({
      locale: 'de-DE',
      profile: { id: 'german-profile' },
      eventContext: { userAgent: 'german-agent' },
    });
    const french = runtime.forRequest({
      locale: 'fr-FR',
      eventContext: { userAgent: 'french-agent' },
    });

    const [germanResult, frenchResult] = await Promise.all([
      german.prepareRequestHandoff({ routeKey: '/de' }),
      french.prepareRequestHandoff({ routeKey: '/fr' }),
    ]);

    expect(germanResult.handoff.profileId).toBe('german-profile');
    expect(frenchResult.handoff.profileId).toBe('updated-profile');
    expect(upsertProfile).toHaveBeenCalledWith(
      expect.objectContaining({ profileId: 'german-profile' }),
      { locale: 'de-DE', preflight: true }
    );
    expect(upsertProfile).toHaveBeenCalledWith(expect.objectContaining({ profileId: undefined }), {
      locale: 'fr-FR',
      preflight: true,
    });
    expect(germanResult.handoff.replay?.events[0]?.context.userAgent).toBe('german-agent');
    expect(frenchResult.handoff.replay?.events[0]?.context.userAgent).toBe('french-agent');
    expect(german.profile).toEqual({ id: 'updated-profile' });
    expect(french.profile).toEqual({ id: 'updated-profile' });
  });

  it('defaults XDA fetch identity from its request, adopts returned identity, and respects overrides', async () => {
    const runtime = createRuntime();
    const fetchExperience = vi.spyOn(runtime, 'fetchExperience').mockResolvedValueOnce({
      nodes: [],
      personalization: { profileId: 'xda-profile' },
    } as never);
    fetchExperience.mockResolvedValue({ nodes: [] } as never);
    const request = runtime.forRequest({ profile: { id: 'initial-profile' } });

    await request.fetchExperience({ experienceId: 'first' }, { config: resolverConfig });
    expect(fetchExperience.mock.calls[0]?.[0]).toMatchObject({
      personalization: { profileId: 'initial-profile' },
    });
    expect(request.profile).toEqual({ id: 'xda-profile' });

    await request.fetchExperience(
      {
        experienceId: 'override',
        personalization: { profileId: 'explicit-profile', events: [] },
      },
      { config: resolverConfig }
    );
    expect(fetchExperience.mock.calls[1]?.[0]).toMatchObject({
      personalization: { profileId: 'explicit-profile', events: [] },
    });
    expect(request.profile).toEqual({ id: 'xda-profile' });
  });

  it('does not let a stale XDA response replace a newer request profile', async () => {
    const { runtime } = createEventRuntime();
    let resolveFetch!: (value: never) => void;
    const fetchExperience = vi.spyOn(runtime, 'fetchExperience').mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFetch = resolve;
      })
    );
    const request = runtime.forRequest({ profile: { id: 'initial-profile' } });

    const pending = request.fetchExperience({ experienceId: 'slow' }, { config: resolverConfig });
    expect(fetchExperience.mock.calls[0]?.[0]).toMatchObject({
      personalization: { profileId: 'initial-profile' },
    });
    await request.identify({ userId: 'new-user' });
    resolveFetch({ nodes: [], personalization: { profileId: 'stale-profile' } } as never);
    await pending;

    expect(request.profile).toEqual({ id: 'updated-profile' });
  });

  describe('consent', () => {
    it('sets both axes from a boolean and exposes canPersistProfile', () => {
      const { runtime } = createEventRuntime();

      expect(runtime.forRequest({ consent: true }).canPersistProfile).toBe(true);
      expect(runtime.forRequest({ consent: false }).canPersistProfile).toBe(false);
      expect(runtime.forRequest({ consent: { events: true } }).canPersistProfile).toBe(false);
      expect(
        runtime.forRequest({ consent: { events: false, persistence: true } }).canPersistProfile
      ).toBe(true);
    });

    it('blocks everything but allowedEventTypes and reports it to onEventBlocked', async () => {
      const onEventBlocked = vi.fn();
      const { runtime, upsertProfile } = createEventRuntime({ onEventBlocked });
      const request = runtime.forRequest({ consent: { events: false }, profile: { id: 'p' } });

      await expect(request.page()).resolves.toMatchObject({ accepted: true });
      await expect(request.track({ event: 'purchase' })).resolves.toEqual({ accepted: false });

      expect(upsertProfile).toHaveBeenCalledTimes(1);
      expect(onEventBlocked).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'consent', method: 'track' })
      );
    });

    it('does not share consent between requests', async () => {
      const { runtime, upsertProfile } = createEventRuntime();
      const granted = runtime.forRequest({ consent: true, profile: { id: 'a' } });
      const denied = runtime.forRequest({ consent: false, profile: { id: 'b' } });

      await granted.track({ event: 'viewed' });
      await denied.track({ event: 'viewed' });

      expect(upsertProfile).toHaveBeenCalledTimes(1);
    });

    describe('prepared handoff batches', () => {
      const initialEvents = [{ type: 'track' as const, event: 'opened' }];

      it('prepares no replay under strict opt-in, and sends nothing', async () => {
        const onEventBlocked = vi.fn();
        const { runtime, upsertProfile } = createEventRuntime({
          allowedEventTypes: [],
          onEventBlocked,
        });
        const request = runtime.forRequest({ consent: false });

        const result = await request.prepareRequestHandoff({ routeKey: '/home' });

        expect(result.handoff.replay).toBeUndefined();
        expect(result.data).toBeUndefined();
        expect(upsertProfile).not.toHaveBeenCalled();
        expect(onEventBlocked).toHaveBeenCalledWith(
          expect.objectContaining({ reason: 'consent', method: 'page' })
        );
      });

      it('admits a page-only batch by default, since page is allow-listed', async () => {
        const { runtime, upsertProfile } = createEventRuntime();
        const request = runtime.forRequest({ consent: false });

        const result = await request.prepareRequestHandoff({ routeKey: '/home' });

        expect(result.handoff.replay?.events.map(({ type }) => type)).toEqual(['page']);
        expect(upsertProfile).toHaveBeenCalledOnce();
      });

      it('drops a blocked initial track but still prepares the permitted page', async () => {
        const onEventBlocked = vi.fn();
        const { runtime, upsertProfile } = createEventRuntime({ onEventBlocked });
        const request = runtime.forRequest({ consent: { events: false } });

        const result = await request.prepareRequestHandoff({ routeKey: '/home', initialEvents });

        // `track` is not allow-listed and is left out; `page` is, so the batch is a valid
        // page-only preview and is still sent.
        expect(result.handoff.replay?.events.map(({ type }) => type)).toEqual(['page']);
        expect(result.data).toBeDefined();
        expect(upsertProfile).toHaveBeenCalledOnce();
        expect(upsertProfile.mock.calls[0]![0].events.map(({ type }) => type)).toEqual(['page']);
        expect(onEventBlocked).toHaveBeenCalledTimes(1);
        expect(onEventBlocked).toHaveBeenCalledWith(
          expect.objectContaining({ reason: 'consent', method: 'track' })
        );
      });

      it('keeps the initial events that are admitted and drops only the others', async () => {
        const { runtime } = createEventRuntime({ allowedEventTypes: ['identify', 'page'] });
        const request = runtime.forRequest({ consent: { events: false } });

        const result = await request.prepareRequestHandoff({
          routeKey: '/home',
          initialEvents: [
            { type: 'identify', userId: 'user-1' },
            { type: 'track', event: 'opened' },
          ],
        });

        expect(result.handoff.replay?.events.map(({ type }) => type)).toEqual(['identify', 'page']);
      });

      it('prepares nothing when the page itself is not admitted', async () => {
        const onEventBlocked = vi.fn();
        const { runtime, upsertProfile } = createEventRuntime({
          allowedEventTypes: ['track'],
          onEventBlocked,
        });
        const request = runtime.forRequest({ consent: { events: false } });

        const result = await request.prepareRequestHandoff({ routeKey: '/home', initialEvents });

        // A prepared batch must end in one page, so without a permitted page there is no
        // batch at all, even though the track alone would be allowed.
        expect(result.handoff.replay).toBeUndefined();
        expect(upsertProfile).not.toHaveBeenCalled();
        expect(onEventBlocked).toHaveBeenCalledWith(
          expect.objectContaining({ reason: 'consent', method: 'page' })
        );
      });

      it('admits the whole batch once event consent is granted', async () => {
        const { runtime } = createEventRuntime();
        const request = runtime.forRequest({ consent: { events: true } });

        const result = await request.prepareRequestHandoff({ routeKey: '/home', initialEvents });

        expect(result.handoff.replay?.events.map(({ type }) => type)).toEqual(['track', 'page']);
      });

      it('stamps the prepared events with the request event consent', async () => {
        const { runtime } = createEventRuntime();
        const granted = await runtime
          .forRequest({ consent: { events: true } })
          .prepareRequestHandoff({ routeKey: '/home', initialEvents });
        const undecided = await runtime
          .forRequest({ consent: { persistence: true } })
          .prepareRequestHandoff({ routeKey: '/home' });

        const flags = (
          events: readonly { context: { gdpr?: { isConsentGiven?: boolean } } }[] = []
        ) => events.map((event) => event.context.gdpr?.isConsentGiven);
        expect(flags(granted.handoff.replay?.events)).toEqual([true, true]);
        expect(flags(undecided.handoff.replay?.events)).toEqual([false]);
      });
    });

    it('drops caller-built fetchExperience events that request consent does not admit', async () => {
      const onEventBlocked = vi.fn();
      const { runtime } = createEventRuntime({ onEventBlocked });
      const fetchExperience = vi
        .spyOn(ContentfulExperiences.prototype, 'fetchExperience')
        .mockResolvedValue({ nodes: [] } as never);
      const page = runtime.eventBuilder.buildPageView();
      const track = runtime.eventBuilder.buildTrack({ event: 'purchase' });

      await runtime.forRequest({ consent: { events: false } }).fetchExperience(
        {
          experienceId: 'personalized',
          personalization: { profileId: 'p', events: [page, track] },
        },
        { config: resolverConfig }
      );

      expect(fetchExperience.mock.calls[0]![0].personalization).toEqual({
        profileId: 'p',
        events: [page],
      });
      expect(onEventBlocked).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'consent', method: 'track' })
      );
    });

    it('forwards every caller-built event when request consent is granted', async () => {
      const { runtime } = createEventRuntime();
      const fetchExperience = vi
        .spyOn(ContentfulExperiences.prototype, 'fetchExperience')
        .mockResolvedValue({ nodes: [] } as never);
      const track = runtime.eventBuilder.buildTrack({ event: 'purchase' });

      await runtime
        .forRequest({ consent: true })
        .fetchExperience(
          { experienceId: 'personalized', personalization: { events: [track] } },
          { config: resolverConfig }
        );

      expect(fetchExperience.mock.calls[0]![0].personalization).toEqual({ events: [track] });
    });
  });

  describe('request-scoped submission options', () => {
    it('forwards Experience API ip, plainText and locale on a direct Personalization call', async () => {
      const { runtime, upsertProfile } = createEventRuntime();
      const request = runtime.forRequest({
        consent: true,
        experienceOptions: { ip: '203.0.113.7', plainText: true },
      });

      await request.page();

      expect(upsertProfile).toHaveBeenCalledWith(expect.anything(), {
        ip: '203.0.113.7',
        plainText: true,
        locale: 'en-US',
      });
    });

    it('keeps separate request facades from leaking options into each other', async () => {
      const { runtime, upsertProfile } = createEventRuntime();
      const first = runtime.forRequest({
        consent: true,
        experienceOptions: { ip: '203.0.113.1' },
      });
      const second = runtime.forRequest({
        consent: true,
        experienceOptions: { ip: '203.0.113.2', plainText: true },
      });
      const third = runtime.forRequest({ consent: true });

      await Promise.all([first.page(), second.page(), third.page()]);

      const optionsByCall = upsertProfile.mock.calls.map(([, options]) => options);
      expect(optionsByCall).toContainEqual({
        ip: '203.0.113.1',
        plainText: undefined,
        locale: 'en-US',
      });
      expect(optionsByCall).toContainEqual({ ip: '203.0.113.2', plainText: true, locale: 'en-US' });
      expect(optionsByCall).toContainEqual({ locale: 'en-US' });
      expect(optionsByCall).toHaveLength(3);
    });

    it('copies options at construction so later mutation cannot change a request', async () => {
      const { runtime, upsertProfile } = createEventRuntime();
      const experienceOptions = { ip: '203.0.113.1' };
      const request = runtime.forRequest({ consent: true, experienceOptions });

      experienceOptions.ip = '198.51.100.99';
      await request.page();

      expect(upsertProfile).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ ip: '203.0.113.1' })
      );
    });

    it('lets the request locale take precedence over experienceOptions.locale', async () => {
      const { runtime, upsertProfile } = createEventRuntime();
      const request = runtime.forRequest({
        consent: true,
        locale: 'de-DE',
        experienceOptions: { locale: 'fr-FR' },
      });

      await request.page();

      // The request locale is the content locale and also wins as the transport locale.
      expect(request.locale).toBe('de-DE');
      expect(upsertProfile).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ locale: 'de-DE' })
      );
    });

    it('uses experienceOptions.locale for Personalization only, not for content', async () => {
      const { runtime, upsertProfile } = createEventRuntime();
      const fetchExperience = vi
        .spyOn(runtime, 'fetchExperience')
        .mockImplementation(async (options) => ({ locale: options.locale }) as never);
      const request = runtime.forRequest({
        consent: true,
        experienceOptions: { locale: 'fr-FR' },
      });

      // The request (content) locale stays on the runtime default, as in Optimization.
      expect(request.locale).toBe('en-US');

      await request.fetchExperience({ experienceId: 'landing' }, { config: resolverConfig });
      expect(fetchExperience.mock.calls[0]?.[0].locale).toBe('en-US');

      await request.page();
      expect(upsertProfile).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ locale: 'fr-FR' })
      );
    });

    it('uses experienceOptions.locale for the handoff preview and replay, not content', async () => {
      const { runtime, upsertProfile } = createEventRuntime();
      const request = runtime.forRequest({
        consent: true,
        experienceOptions: { locale: 'fr-FR' },
      });

      const result = await request.prepareRequestHandoff({ routeKey: '/landing' });

      expect(upsertProfile.mock.calls[0]?.[1]).toEqual(
        expect.objectContaining({ locale: 'fr-FR', preflight: true })
      );
      expect(result.handoff.replay?.locale).toBe('fr-FR');
      expect(request.locale).toBe('en-US');
    });

    it('forwards ip and plainText on the handoff preview and still previews without committing', async () => {
      const { runtime, upsertProfile } = createEventRuntime();
      const request = runtime.forRequest({
        consent: true,
        experienceOptions: { ip: '203.0.113.7', plainText: true },
      });

      await request.prepareRequestHandoff({ routeKey: '/landing' });

      expect(upsertProfile).toHaveBeenCalledTimes(1);
      expect(upsertProfile.mock.calls[0]?.[1]).toEqual({
        ip: '203.0.113.7',
        plainText: true,
        locale: 'en-US',
        preflight: true,
      });
    });

    it('forwards the Insights beacon to a direct Analytics send', async () => {
      const { runtime, sendBatchEvents } = createEventRuntime();
      const beacon = vi.fn(() => true);
      const request = runtime.forRequest({
        consent: true,
        profile: { id: 'visitor' },
        insightsOptions: { beacon },
      });

      await request.trackClick({ entityId: 'entry', entityKind: 'Experience' });

      expect(sendBatchEvents).toHaveBeenCalledWith(expect.any(Array), { beacon });
    });
  });
});
