import { afterEach, describe, expect, it, vi } from 'vitest';

import { ContentfulExperiences } from './contentful-experiences.js';
import {
  EventProfileRequiredError,
  parseExperiencesHandoff,
} from '@contentful/experiences-runtime';
import { DEFAULT_EVENT_CONTEXT_LIBRARY } from './sdk-info.js';

const runtimes = new Set<ContentfulExperiences>();

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
      resolverConfig: { components: {} },
      delivery: { accessToken: 'delivery-token' },
      resolveDefaults: { debug: true, metadata: { source: 'constructor', shared: 'constructor' } },
      app: { name: 'site', version: '1.0.0' },
    })
  );
}

class TestContentfulExperiences extends ContentfulExperiences {
  get optimizationApiForTest() {
    return this.optimizationApi;
  }
}

function createEventRuntime() {
  const runtime = trackRuntime(
    new TestContentfulExperiences({
      spaceId: 'space',
      environmentId: 'environment',
      locale: 'en-US',
      resolverConfig: { components: {} },
      delivery: { accessToken: 'delivery-token' },
    })
  );
  const upsertProfile = vi
    .spyOn(runtime.optimizationApiForTest.personalization, 'upsertProfile')
    .mockResolvedValue({ profile: { id: 'updated-profile' } } as never);
  const sendBatchEvents = vi
    .spyOn(runtime.optimizationApiForTest.analytics, 'sendBatchEvents')
    .mockResolvedValue(true);

  return { runtime, sendBatchEvents, upsertProfile };
}

describe('Node ContentfulExperiences', () => {
  it('rejects a second live SDK and allows replacement after destroy', () => {
    const first = createRuntime();
    const german = first.forRequest({ locale: 'de-DE' });
    const french = first.forRequest({ locale: 'fr-FR' });

    expect(german.locale).toBe('de-DE');
    expect(french.locale).toBe('fr-FR');
    expect(() => createRuntime()).toThrow();

    first.destroy();
    first.destroy();

    const replacement = createRuntime();
    expect(replacement.forRequest({ locale: 'es-ES' }).locale).toBe('es-ES');
  });

  it('applies stable Node attribution and creates distinct request facades', () => {
    const runtime = createRuntime();
    const first = runtime.forRequest({ locale: 'de-DE' });
    const second = runtime.forRequest({ locale: 'fr-FR' });

    expect(first).not.toBe(second);
    expect('eventBuilder' in first).toBe(false);
    expect(runtime.eventBuilder.channel).toBe('server');
    expect(runtime.eventBuilder.library).toEqual(DEFAULT_EVENT_CONTEXT_LIBRARY);
    expect(runtime.eventBuilder.buildTrack({ event: 'runtime' }).context).toMatchObject({
      app: { name: 'site', version: '1.0.0' },
      gdpr: { isConsentGiven: false },
      locale: 'en-US',
      library: DEFAULT_EVENT_CONTEXT_LIBRARY,
    });
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
      german.fetchExperience({ experienceId: 'german' }),
      french.fetchExperience({ experienceId: 'french' }),
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
      { debug: false, metadata: { method: 'value', shared: 'method' } }
    );

    expect(resolveExperience).toHaveBeenCalledWith(expect.anything(), {
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

    await request.resolveExperience(payload);
    await request.resolveExperience(payload, { sourceMap: methodMap });

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
      { debug: false, metadata: { method: 'value', shared: 'method' } }
    );

    expect(plan.debug).toBe(false);
    expect(plan.metadata).toEqual({
      source: 'constructor',
      request: 'value',
      method: 'value',
      shared: 'method',
    });
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
    await request.fetchExperience({ experienceId: 'experience', personalization });
    await request.fetchByDestinationNode({ destinationId: 'destination', nodeId: 'node' });
    await request.fetchByDestinationPath({ destinationId: 'destination', path: '/path' });

    expect(fetchExperience).toHaveBeenCalledWith(
      { experienceId: 'experience', locale: 'es-ES', personalization },
      { metadata: { request: true }, debug: undefined }
    );
    expect(byNode).toHaveBeenCalledWith(
      { destinationId: 'destination', nodeId: 'node' },
      { metadata: { request: true }, debug: undefined }
    );
    expect(byPath).toHaveBeenCalledWith(
      { destinationId: 'destination', path: '/path' },
      { metadata: { request: true }, debug: undefined }
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
      request.trackClick({ entityId: 'entry', entityKind: 'InlineComponent' })
    ).rejects.toBeInstanceOf(EventProfileRequiredError);
    expect(sendBatchEvents).not.toHaveBeenCalled();
  });

  it('keeps concurrent event profiles and context isolated, with locale precedence and consent', async () => {
    const { runtime, sendBatchEvents, upsertProfile } = createEventRuntime();
    const german = runtime.forRequest({
      locale: 'de-DE',
      profile: { id: 'german-profile' },
      eventContext: { locale: 'context-locale', userAgent: 'german-agent' },
      eventConsent: false,
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
      german.trackClick({ entityId: 'german-entry', entityKind: 'InlineComponent' }),
      french.trackClick({ entityId: 'french-entry', entityKind: 'InlineComponent' }),
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
      { locale: 'method-locale' }
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
    expect(sendBatchEvents).toHaveBeenCalledWith([
      expect.objectContaining({
        profile: { id: 'german-profile' },
        events: [
          expect.objectContaining({
            context: expect.objectContaining({
              locale: 'de-DE',
              userAgent: 'german-agent',
              gdpr: { isConsentGiven: false },
            }),
          }),
        ],
      }),
    ]);
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

  it('uses event context locale when no request locale is supplied', async () => {
    const { runtime, upsertProfile } = createEventRuntime();
    const request = runtime.forRequest({ eventContext: { locale: 'it-IT' } });

    await request.track({ event: 'viewed' });

    expect(upsertProfile).toHaveBeenCalledWith(expect.anything(), { locale: 'it-IT' });
  });

  it('prepares one ordered, exact Personalization replay with request context and known identity', async () => {
    const { runtime, sendBatchEvents, upsertProfile } = createEventRuntime();
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

  it('uses the API-issued identity for a new profile and keeps later ordinary calls direct', async () => {
    const { runtime, sendBatchEvents, upsertProfile } = createEventRuntime();
    const request = runtime.forRequest();

    const prepared = await request.prepareRequestHandoff({ routeKey: '/home' });

    expect(prepared.handoff.profileId).toBe('updated-profile');
    expect(prepared.handoff.replay?.events.map(({ type }) => type)).toEqual(['page']);
    expect(prepared.handoff.state).toBeUndefined();
    expect(request.profile).toEqual({ id: 'updated-profile' });
    expect(upsertProfile.mock.calls[0]?.[1]).toEqual({ locale: 'en-US', preflight: true });

    const direct = await request.track({ event: 'after-preparation' });
    expect(direct).toEqual({ accepted: true, data: { profile: { id: 'updated-profile' } } });
    expect(upsertProfile).toHaveBeenCalledTimes(2);
    expect(upsertProfile.mock.calls[1]?.[0]).toMatchObject({ profileId: 'updated-profile' });
    expect(upsertProfile.mock.calls[1]?.[1]).toEqual({ locale: 'en-US' });
    expect(await request.trackClick({ entityId: 'entry', entityKind: 'InlineComponent' })).toBe(
      true
    );
    expect(sendBatchEvents).toHaveBeenCalledOnce();
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
          initialEvents: Array.from({ length: 200 }, () => ({ type: 'track', event: 'viewed' })),
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

    await request.fetchExperience({ experienceId: 'first' });
    expect(fetchExperience.mock.calls[0]?.[0]).toMatchObject({
      personalization: { profileId: 'initial-profile' },
    });
    expect(request.profile).toEqual({ id: 'xda-profile' });

    await request.fetchExperience({
      experienceId: 'override',
      personalization: { profileId: 'explicit-profile', events: [] },
    });
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

    const pending = request.fetchExperience({ experienceId: 'slow' });
    expect(fetchExperience.mock.calls[0]?.[0]).toMatchObject({
      personalization: { profileId: 'initial-profile' },
    });
    await request.identify({ userId: 'new-user' });
    resolveFetch({ nodes: [], personalization: { profileId: 'stale-profile' } } as never);
    await pending;

    expect(request.profile).toEqual({ id: 'updated-profile' });
  });
});
