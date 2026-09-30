import { describe, expect, it, vi } from 'vitest';

import { ContentfulExperiences } from './contentful-experiences.js';
import {
  EventProfileRequiredError,
  parseRuntimeEventHandoff,
} from '@contentful/experiences-client';
import { DEFAULT_EVENT_CONTEXT_LIBRARY } from './sdk-info.js';

function createRuntime() {
  return new ContentfulExperiences({
    spaceId: 'space',
    environmentId: 'environment',
    locale: 'en-US',
    resolverConfig: { components: {} },
    delivery: { accessToken: 'delivery-token' },
    resolveDefaults: { debug: true, metadata: { source: 'constructor', shared: 'constructor' } },
    app: { name: 'site', version: '1.0.0' },
  });
}

class TestContentfulExperiences extends ContentfulExperiences {
  get optimizationApiForTest() {
    return this.optimizationApi;
  }
}

function createEventRuntime() {
  const runtime = new TestContentfulExperiences({
    spaceId: 'space',
    environmentId: 'environment',
    locale: 'en-US',
    resolverConfig: { components: {} },
    delivery: { accessToken: 'delivery-token' },
  });
  const upsertProfile = vi
    .spyOn(runtime.optimizationApiForTest.personalization, 'upsertProfile')
    .mockResolvedValue({ profile: { id: 'updated-profile' } } as never);
  const sendBatchEvents = vi
    .spyOn(runtime.optimizationApiForTest.analytics, 'sendBatchEvents')
    .mockResolvedValue(true);

  return { runtime, sendBatchEvents, upsertProfile };
}

describe('Node ContentfulExperiences', () => {
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
      .mockResolvedValue({ nodes: [], viewports: [] } as never);
    const request = runtime.forRequest({
      resolveOptions: {
        debug: true,
        initialViewportId: 'tablet',
        metadata: { request: 'value', shared: 'request' },
      },
    });

    await request.resolveExperience(
      { sys: { type: 'Experience' }, nodes: [] },
      { debug: false, initialViewportId: 'phone', metadata: { method: 'value', shared: 'method' } }
    );

    expect(resolveExperience).toHaveBeenCalledWith(expect.anything(), {
      debug: false,
      initialViewportId: 'phone',
      metadata: { request: 'value', method: 'value', shared: 'method' },
    });
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
      .mockResolvedValue({ nodes: [], viewports: [] } as never);
    const byNode = vi
      .spyOn(runtime, 'fetchByDestinationNode')
      .mockResolvedValue({ nodes: [], viewports: [] } as never);
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
      { metadata: { request: true }, debug: undefined, initialViewportId: undefined }
    );
    expect(byNode).toHaveBeenCalledWith(
      { destinationId: 'destination', nodeId: 'node' },
      { metadata: { request: true }, debug: undefined, initialViewportId: undefined }
    );
    expect(byPath).toHaveBeenCalledWith(
      { destinationId: 'destination', path: '/path' },
      { metadata: { request: true }, debug: undefined, initialViewportId: undefined }
    );
  });

  it('retains profile updates within its request facade and delegates Personalization events', async () => {
    const { runtime, upsertProfile } = createEventRuntime();
    const request = runtime.forRequest({ profile: { id: 'initial-profile' } });

    await request.identify({ userId: 'user-1' });

    expect(upsertProfile).toHaveBeenCalledWith(
      expect.objectContaining({ profileId: 'initial-profile' }),
      { locale: 'en-US' }
    );
    expect(request.profile).toEqual({ id: 'updated-profile' });
    expect(request.createEventHandoff()).toBeUndefined();
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

  it('stages handoff events in order without sending Analytics, then finalizes a JSON-safe snapshot', async () => {
    const { runtime, sendBatchEvents, upsertProfile } = createEventRuntime();
    const request = runtime.forRequest({
      eventDelivery: 'handoff',
      profile: { id: 'initial-profile' },
    });

    await request.page();
    expect(upsertProfile).toHaveBeenLastCalledWith(
      expect.objectContaining({ events: [expect.objectContaining({ type: 'page' })] }),
      expect.objectContaining({ preflight: true })
    );

    await request.track({ event: 'staged-track' });
    expect(upsertProfile).toHaveBeenLastCalledWith(
      expect.objectContaining({
        events: [
          expect.objectContaining({ type: 'page' }),
          expect.objectContaining({ type: 'track' }),
        ],
      }),
      expect.objectContaining({ preflight: true })
    );
    await request.trackClick({ entityId: 'entry', entityKind: 'InlineComponent' });
    const handoff = request.createEventHandoff({ initialPageRouteKey: '/products' });

    expect(upsertProfile).toHaveBeenCalledWith(
      expect.objectContaining({ profileId: 'initial-profile' }),
      expect.objectContaining({ preflight: true })
    );
    expect(sendBatchEvents).not.toHaveBeenCalled();
    expect(handoff?.events.map(({ transport, event }) => [transport, event.type])).toEqual([
      ['personalization', 'page'],
      ['personalization', 'track'],
      ['analytics', 'exo_node_click'],
    ]);
    expect(handoff?.initialPageRouteKey).toBe('/products');
    expect(parseRuntimeEventHandoff(JSON.parse(JSON.stringify(handoff)))).toEqual(handoff);
    expect(() => request.createEventHandoff()).toThrow('already been created');
    await expect(request.track({ event: 'after-handoff' })).rejects.toThrow('finalized');
  });

  it('previews and stages an initial Personalization batch in one request', async () => {
    const { runtime, sendBatchEvents, upsertProfile } = createEventRuntime();
    const request = runtime.forRequest({
      eventConsent: false,
      eventContext: { userAgent: 'server-agent' },
      eventDelivery: 'handoff',
      profile: { id: 'initial-profile' },
    });

    const data = await request.previewInitialPersonalization({
      events: [
        { type: 'identify', userId: 'user-1' },
        { type: 'track', event: 'experience_rendered' },
      ],
      page: { properties: { url: 'https://example.test/products' } },
    });

    expect(upsertProfile).toHaveBeenCalledOnce();
    expect(upsertProfile).toHaveBeenCalledWith(
      {
        profileId: 'initial-profile',
        events: [
          expect.objectContaining({ type: 'identify' }),
          expect.objectContaining({ type: 'track' }),
          expect.objectContaining({ type: 'page' }),
        ],
      },
      { locale: 'en-US', preflight: true }
    );
    for (const event of upsertProfile.mock.calls[0]![0].events) {
      expect(event.context).toMatchObject({
        gdpr: { isConsentGiven: false },
        userAgent: 'server-agent',
      });
    }
    expect(data.profile).toEqual({ id: 'updated-profile' });
    expect(request.profile).toEqual({ id: 'updated-profile' });
    expect(sendBatchEvents).not.toHaveBeenCalled();

    const handoff = request.createEventHandoff({ initialPageRouteKey: '/products' });
    expect(handoff?.events.map(({ transport, event }) => [transport, event.type])).toEqual([
      ['personalization', 'identify'],
      ['personalization', 'track'],
      ['personalization', 'page'],
    ]);
  });

  it('requires handoff mode for an initial Personalization batch', async () => {
    const { runtime } = createEventRuntime();

    await expect(runtime.forRequest().previewInitialPersonalization()).rejects.toThrow(
      "requires eventDelivery: 'handoff'"
    );
  });

  it('requires a route key when a finalized handoff contains a page', async () => {
    const { runtime } = createEventRuntime();
    const request = runtime.forRequest({ eventDelivery: 'handoff' });

    await request.page();

    expect(() => request.createEventHandoff()).toThrow(
      'Page-bearing event handoffs require initialPageRouteKey'
    );
  });

  it('rejects overlapping handoff events so cumulative preflight order stays deterministic', async () => {
    const { runtime, upsertProfile } = createEventRuntime();
    let resolvePreflight!: (value: unknown) => void;
    upsertProfile.mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePreflight = resolve;
      }) as never
    );
    const request = runtime.forRequest({ eventDelivery: 'handoff' });

    const pending = request.page();
    await expect(request.track({ event: 'overlap' })).rejects.toThrow('handoff is pending');
    expect(upsertProfile).toHaveBeenCalledOnce();

    resolvePreflight({ profile: { id: 'profile-from-preflight' } });
    await pending;
  });

  it('does not retain a Personalization event when its preflight fails', async () => {
    const { runtime, upsertProfile } = createEventRuntime();
    upsertProfile.mockRejectedValueOnce(new Error('preflight failed'));
    const request = runtime.forRequest({ eventDelivery: 'handoff' });

    await expect(request.page()).rejects.toThrow('preflight failed');

    expect(request.createEventHandoff()?.events).toEqual([]);
  });

  it('rejects an event before preflight when it would exceed the handoff size limit', async () => {
    const { runtime, upsertProfile } = createEventRuntime();
    const request = runtime.forRequest({ eventDelivery: 'handoff' });

    await expect(
      request.track({
        event: 'oversized',
        properties: { payload: 'x'.repeat(64 * 1024) },
      })
    ).rejects.toThrow('exceeds 65536 serialized bytes');
    expect(upsertProfile).not.toHaveBeenCalled();
    expect(request.createEventHandoff()?.events).toEqual([]);
  });

  it('rejects an unsupported server event delivery mode', () => {
    const runtime = createRuntime();

    expect(() => runtime.forRequest({ eventDelivery: 'browser' } as never)).toThrow(
      'Unsupported server event delivery mode'
    );
  });
});
