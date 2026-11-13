import { profileFixture as completeProfile } from './test/profile.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ContentfulExperiences,
  type Config,
  type RequestContext,
} from './contentful-experiences.js';
import {
  EventProfileRequiredError,
  type PreviewSessionOptions,
} from '@contentful/experiences-runtime';
import type { ExperiencePayload } from '@contentful/experiences-sdk-core';
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

function createRuntime(overrides: Partial<Config> = {}) {
  return trackRuntime(
    new ContentfulExperiences({
      spaceId: 'space',
      environmentId: 'environment',
      locale: 'en-US',
      delivery: { accessToken: 'delivery-token' },
      resolveDefaults: { debug: true, metadata: { source: 'constructor', shared: 'constructor' } },
      app: { name: 'site', version: '1.0.0' },
      ...overrides,
    })
  );
}

class TestContentfulExperiences extends ContentfulExperiences {
  // Most tests exercise delivery, so grant event consent unless a test says otherwise.
  override forRequest(context: RequestContext = {}) {
    const hasConsent = context.consent !== undefined || context.eventConsent !== undefined;
    if (hasConsent) return super.forRequest(context);
    return super.forRequest({ ...context, consent: { events: true } });
  }
}

function createEventRuntime(policy: Pick<Config, 'allowedEventTypes' | 'onEventBlocked'> = {}) {
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
    .spyOn(runtime.api.personalization, 'upsertProfile')
    .mockResolvedValue({ profile: completeProfile('updated-profile') } as never);
  const sendBatchEvents = vi
    .spyOn(runtime.api.analytics, 'sendBatchEvents')
    .mockResolvedValue(true);

  return { runtime, sendBatchEvents, upsertProfile };
}

describe('Node ContentfulExperiences', () => {
  it('inherits pure flag lookup without retaining changes or tracking exposures', () => {
    const runtime = createRuntime();
    const send = vi.spyOn(runtime.api.analytics, 'sendBatchEvents');
    const personalize = vi.spyOn(runtime.api.personalization, 'upsertProfile');
    const changes = [
      {
        type: 'Variable',
        key: 'flag',
        value: 0,
        meta: { experienceId: 'experiment', variantIndex: 0 },
      },
    ];
    expect(runtime.getFlag('flag', changes)).toBe(0);
    expect(runtime.getFlag('flag')).toBeUndefined();
    expect(send).not.toHaveBeenCalled();
    expect(personalize).not.toHaveBeenCalled();
  });

  describe('request-owned Preview Session', () => {
    function previewFixture(configured = true) {
      const payload: ExperiencePayload = { sys: { id: 'edited', type: 'Experience' }, nodes: [] };
      const snapshot = vi.fn((_session: PreviewSessionOptions) => Promise.resolve(payload));
      class PreviewExperiences extends ContentfulExperiences {
        protected override fetchPreviewSessionPayload(session: PreviewSessionOptions) {
          return snapshot(session);
        }
      }
      const runtime = trackRuntime(
        new PreviewExperiences({
          spaceId: 'space',
          environmentId: 'environment',
          delivery: { accessToken: 'delivery-token' },
          preview: configured ? { accessToken: 'preview-token' } : undefined,
        })
      );
      const ordinary = vi
        .spyOn(runtime, 'fetchExperience')
        .mockResolvedValue({ nodes: [] } as never);
      const resolve = vi.spyOn(runtime, 'resolveExperience');
      return { runtime, payload, snapshot, ordinary, resolve };
    }

    it.each([
      [true, ' session ', true],
      [true, '  ', false],
      [true, undefined, false],
      [false, 'session', false],
    ])(
      'derives request policy from configuration=%s and session=%s',
      async (configured, sessionId, isPreview) => {
        const f = previewFixture(configured);
        const request = f.runtime.forRequest({
          preview: sessionId === undefined ? undefined : { sessionId },
          consent: true,
          profile: { id: 'live-visitor' },
        });
        expect(request.profile).toEqual(isPreview ? undefined : { id: 'live-visitor' });
        expect(request.canPersistProfile).toBe(!isPreview);
        expect(request.isPreview).toBe(isPreview);
        if (isPreview) {
          await expect(request.page()).resolves.toEqual({ accepted: false, reason: 'preview' });
        }
        expect(f.snapshot).not.toHaveBeenCalled();
        await request.fetchExperience({ experienceId: 'edited' }, { config: resolverConfig });
        if (isPreview) {
          expect(f.snapshot).toHaveBeenCalledWith({
            sessionId: 'session',
            sessionHost: undefined,
            resourceResolution: undefined,
          });
          expect(f.ordinary).not.toHaveBeenCalled();
        } else {
          expect(f.snapshot).not.toHaveBeenCalled();
          expect(f.ordinary).toHaveBeenCalledOnce();
        }
        expect(f.runtime.forRequest().isPreview).toBe(false);
      }
    );

    it('resolves only the edited Experience from one raw snapshot, retaining each call registry', async () => {
      const f = previewFixture();
      f.payload.extensions = { personalization: { profile: completeProfile('preview-profile') } };
      const request = f.runtime.forRequest({
        preview: { sessionId: 'session' },
        profile: { id: 'visitor' },
        resolveOptions: { metadata: { request: true } },
      });
      await request.fetchExperience(
        { experienceId: 'edited' },
        { config: resolverConfig, metadata: { operation: true } }
      );
      await request.fetchExperience({ experienceId: 'other' }, { config: resolverConfig });
      expect(f.resolve).toHaveBeenCalledWith(f.payload, {
        config: resolverConfig,
        metadata: { request: true, operation: true },
        debug: undefined,
      });
      expect(f.ordinary).toHaveBeenCalledWith(
        { experienceId: 'other', personalization: undefined, locale: undefined },
        expect.anything()
      );
      expect(f.snapshot).toHaveBeenCalledOnce();
      expect(request.profile).toBeUndefined();
    });

    it('keeps payloads without an ID out of the requested Experience', async () => {
      const f = previewFixture();
      delete f.payload.sys;
      const request = f.runtime.forRequest({ preview: { sessionId: 'session' } });
      await request.fetchExperience({ experienceId: 'edited' }, { config: resolverConfig });
      expect(f.resolve).not.toHaveBeenCalled();
      expect(f.ordinary).toHaveBeenCalledOnce();
    });

    it('shares failed acquisition without Delivery fallback and retries on the next call', async () => {
      const f = previewFixture();
      const failure = new Error('session unavailable');
      let reject!: (error: Error) => void;
      f.snapshot.mockReturnValueOnce(
        new Promise((_resolve, fail) => {
          reject = fail;
        })
      );
      const request = f.runtime.forRequest({
        preview: { sessionId: 'session' },
        consent: true,
        profile: { id: 'visitor' },
      });
      const pending = Promise.allSettled([
        request.fetchExperience({ experienceId: 'edited' }, { config: resolverConfig }),
        request.fetchExperience({ experienceId: 'other' }, { config: resolverConfig }),
      ]);
      expect(f.snapshot).toHaveBeenCalledOnce();
      expect(f.ordinary).not.toHaveBeenCalled();
      reject(failure);
      expect(await pending).toEqual([
        { status: 'rejected', reason: failure },
        { status: 'rejected', reason: failure },
      ]);
      expect(f.ordinary).not.toHaveBeenCalled();
      expect(request.isPreview).toBe(true);
      expect(request.profile).toBeUndefined();
      expect(request.canPersistProfile).toBe(false);
      await expect(request.page()).resolves.toMatchObject({ accepted: false, reason: 'preview' });

      await request.fetchExperience({ experienceId: 'edited' }, { config: resolverConfig });
      await request.fetchExperience({ experienceId: 'other' }, { config: resolverConfig });
      expect(f.snapshot).toHaveBeenCalledTimes(2);
      expect(f.ordinary).toHaveBeenCalledOnce();
    });

    it.each(['success', 'failure'] as const)(
      'discards snapshot %s after request disposal',
      async (outcome) => {
        const f = previewFixture();
        let complete!: (payload: ExperiencePayload) => void;
        let fail!: (error: Error) => void;
        f.snapshot.mockReturnValueOnce(
          new Promise((resolve, reject) => {
            complete = resolve;
            fail = reject;
          })
        );
        const request = f.runtime.forRequest({ preview: { sessionId: 'session' } });
        const pending = request.fetchExperience(
          { experienceId: 'edited' },
          { config: resolverConfig }
        );
        request.destroy();
        if (outcome === 'success') complete(f.payload);
        else fail(new Error('late snapshot failure'));
        await expect(pending).rejects.toThrow(/destroyed/);
        await expect(
          request.fetchExperience({ experienceId: 'edited' }, { config: resolverConfig })
        ).rejects.toThrow(/destroyed/);
        expect(f.snapshot).toHaveBeenCalledOnce();
        expect(f.resolve).not.toHaveBeenCalled();
        expect(f.ordinary).not.toHaveBeenCalled();
      }
    );
  });

  it('forwards changed parameters through request facades independently of event consent', async () => {
    const runtime = createRuntime();
    const fetch = vi.spyOn(runtime, 'fetchExperience').mockResolvedValue({ nodes: [] } as never);
    const request = runtime.forRequest({ consent: { events: false }, locale: 'de-DE' });
    const parameters = { featuredPosts: { limit: 6, order: '-fields.title' } };
    await request.fetchExperience({ experienceId: 'exp', parameters }, { config: resolverConfig });
    await request.fetchExperience(
      { experienceId: 'exp', parameters: { productId: 'other' } },
      { config: resolverConfig }
    );
    await runtime
      .forRequest({ preflight: true })
      .fetchExperience({ experienceId: 'exp' }, { config: resolverConfig });
    expect(fetch.mock.calls.map(([options]) => options.parameters)).toEqual([
      parameters,
      { productId: 'other' },
      undefined,
    ]);
    expect(fetch.mock.calls[1]?.[0]).toMatchObject({ locale: 'de-DE' });
    expect(fetch.mock.calls[2]?.[0].personalization).toBeUndefined();
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

  it('keeps event disposal local to a request without adding shared SDK shutdown', async () => {
    const { runtime, upsertProfile } = createEventRuntime();
    const disposed = runtime.forRequest();
    const sibling = runtime.forRequest();
    disposed.destroy();
    disposed.destroy();
    await expect(disposed.page()).resolves.toEqual({ accepted: false });
    expect(upsertProfile).not.toHaveBeenCalled();

    runtime.destroy();
    await expect(sibling.page()).resolves.toMatchObject({ accepted: true });
    await expect(runtime.forRequest().page()).resolves.toMatchObject({ accepted: true });
    expect(upsertProfile).toHaveBeenCalledTimes(2);
    expect(disposed.profile).toBeUndefined();
    expect(sibling.profile).toEqual(completeProfile('updated-profile'));
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
      consent: true,
    });
    const second = runtime.forRequest({ eventContext: secondContext, consent: false });

    expect(first).not.toBe(second);
    expect(first.eventBuilder.buildIdentify({ userId: 'first' }).context).toMatchObject({
      ...firstContext,
      gdpr: { isConsentGiven: true },
    });
    expect(first.eventBuilder.buildPageView().context.gdpr?.isConsentGiven).toBe(true);
    expect(first.eventBuilder.buildTrack({ event: 'first' }).context.gdpr?.isConsentGiven).toBe(
      true
    );
    expect(second.eventBuilder.buildTrack({ event: 'second' }).context).toMatchObject({
      ...secondContext,
      gdpr: { isConsentGiven: false },
    });
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

    const data = { profile: completeProfile('updated-profile') };
    expect(await request.identify({ userId: 'user-1' })).toEqual({ accepted: true, data });

    expect(upsertProfile).toHaveBeenCalledWith(
      expect.objectContaining({ profileId: 'initial-profile' }),
      { locale: 'en-US' }
    );
    expect(request.profile).toEqual(completeProfile('updated-profile'));
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
      profile: completeProfile('german-profile'),
      eventContext: { locale: 'context-locale', userAgent: 'german-agent' },
      consent: { events: false },
    });
    const french = runtime.forRequest({
      locale: 'fr-FR',
      profile: completeProfile('french-profile'),
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
        profile: completeProfile('french-profile'),
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

  it.each([
    { requestDefault: undefined, explicit: undefined, expected: undefined },
    { requestDefault: true, explicit: undefined, expected: true },
    { requestDefault: false, explicit: undefined, expected: false },
    { requestDefault: true, explicit: false, expected: false },
    { requestDefault: false, explicit: true, expected: true },
  ])(
    'uses XDA preflight default $requestDefault with override $explicit',
    async ({ requestDefault, explicit, expected }) => {
      const runtime = createRuntime();
      const fetch = vi.spyOn(runtime, 'fetchExperience').mockResolvedValue({ nodes: [] } as never);
      const context = { preflight: requestDefault, profile: { id: 'known' } };
      const request = runtime.forRequest(context);
      context.preflight = !requestDefault;
      const options = { experienceId: 'experience', personalization: { preflight: explicit } };
      await request.fetchExperience(options, { config: resolverConfig });
      expect(fetch.mock.calls[0]?.[0].personalization).toEqual({
        profileId: 'known',
        preflight: expected,
      });
      expect(options.personalization).toEqual({ preflight: explicit });
    }
  );

  it('rejects invalid preflight without replacing it with the request default', async () => {
    const runtime = createRuntime();
    expect(() => runtime.forRequest({ preflight: null as never })).toThrow(
      /preflight must be a boolean/
    );
    const fetch = vi.spyOn(runtime, 'fetchExperience').mockResolvedValue({ nodes: [] } as never);
    const request = runtime.forRequest({ preflight: true, profile: { id: 'known' } });
    await expect(
      request.fetchExperience(
        { experienceId: 'experience', personalization: { preflight: null as never } },
        { config: resolverConfig }
      )
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('defaults XDA fetch identity from its request, adopts returned identity, and respects overrides', async () => {
    const runtime = createRuntime();
    const fetchExperience = vi.spyOn(runtime, 'fetchExperience').mockResolvedValueOnce({
      nodes: [],
      personalization: { profile: completeProfile('xda-profile') },
    } as never);
    fetchExperience.mockResolvedValue({ nodes: [] } as never);
    const request = runtime.forRequest({ profile: { id: 'initial-profile' } });

    await request.fetchExperience({ experienceId: 'first' }, { config: resolverConfig });
    expect(fetchExperience.mock.calls[0]?.[0]).toMatchObject({
      personalization: { profileId: 'initial-profile' },
    });
    expect(request.profile).toEqual(completeProfile('xda-profile'));

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
    expect(request.profile).toEqual(completeProfile('xda-profile'));
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
    resolveFetch({
      nodes: [],
      personalization: { profile: completeProfile('stale-profile') },
    } as never);
    await pending;

    expect(request.profile).toEqual(completeProfile('updated-profile'));
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
      const original = globalThis.structuredClone(track);

      await runtime
        .forRequest({ consent: true })
        .fetchExperience(
          { experienceId: 'personalized', personalization: { events: [track] } },
          { config: resolverConfig }
        );

      expect(fetchExperience.mock.calls[0]![0].personalization).toEqual({
        events: [{ ...track, context: { ...track.context, gdpr: { isConsentGiven: true } } }],
      });
      expect(track).toEqual(original);
      expect(track.context.gdpr?.isConsentGiven).toBe(false);
    });
  });

  describe('request-scoped submission options', () => {
    it('forwards Personalization API ip, plainText and locale on a direct Personalization call', async () => {
      const { runtime, upsertProfile } = createEventRuntime();
      const request = runtime.forRequest({
        consent: true,
        preflight: true,
        personalizationOptions: { ip: '203.0.113.7', plainText: true },
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
        personalizationOptions: { ip: '203.0.113.1' },
      });
      const second = runtime.forRequest({
        consent: true,
        personalizationOptions: { ip: '203.0.113.2', plainText: true },
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
      const personalizationOptions = { ip: '203.0.113.1' };
      const request = runtime.forRequest({ consent: true, personalizationOptions });

      personalizationOptions.ip = '198.51.100.99';
      await request.page();

      expect(upsertProfile).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ ip: '203.0.113.1' })
      );
    });

    it('lets the request locale take precedence over personalizationOptions.locale', async () => {
      const { runtime, upsertProfile } = createEventRuntime();
      const request = runtime.forRequest({
        consent: true,
        locale: 'de-DE',
        personalizationOptions: { locale: 'fr-FR' },
      });

      await request.page();

      // The request locale is the content locale and also wins as the transport locale.
      expect(request.locale).toBe('de-DE');
      expect(upsertProfile).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ locale: 'de-DE' })
      );
    });

    it('uses personalizationOptions.locale for Personalization only, not for content', async () => {
      const { runtime, upsertProfile } = createEventRuntime();
      const fetchExperience = vi
        .spyOn(runtime, 'fetchExperience')
        .mockImplementation(async (options) => ({ locale: options.locale }) as never);
      const request = runtime.forRequest({
        consent: true,
        personalizationOptions: { locale: 'fr-FR' },
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

    it('forwards the Insights beacon to a direct Analytics send', async () => {
      const { runtime, sendBatchEvents } = createEventRuntime();
      const beacon = vi.fn(() => true);
      const request = runtime.forRequest({
        consent: true,
        profile: completeProfile('visitor'),
        analyticsOptions: { beacon },
      });

      await request.trackClick({ entityId: 'entry', entityKind: 'Experience' });

      expect(sendBatchEvents).toHaveBeenCalledWith(expect.any(Array), { beacon });
    });
  });
});
