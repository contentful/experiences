import {
  profileFixture as completeProfile,
  analyticsProfileFixture,
} from '../test/fixtures/profile.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ContentfulExperiences,
  type Config,
  type RequestContext,
} from '../contentful-experiences.js';
import {
  EventProfileRequiredError,
  type PreviewSessionOptions,
  InterceptorManager,
  type OptimizationEventStreamEvent,
} from '@contentful/experiences-runtime';
import type { ExperiencePayload } from '@contentful/experiences-sdk-core';
import { createBoundRequest, requestRuntimeFixture } from '../test/fixtures/request-runtime.js';
import { DEFAULT_EVENT_CONTEXT_LIBRARY } from '../sdk-info.js';

const runtimes = new Set<ContentfulExperiences>();
const resolverConfig = { components: {} };
const emptyPlan = { nodes: [] } as never;

function trackRuntime<T extends ContentfulExperiences>(runtime: T): T {
  runtimes.add(runtime);
  return runtime;
}

afterEach(() => {
  for (const runtime of runtimes) runtime.destroy();
  runtimes.clear();
  vi.restoreAllMocks();
});

function createRuntime(overrides: Partial<Config> = {}) {
  return trackRuntime(
    new TestRuntime({
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

function createEventRuntime() {
  const runtime = createRuntime();
  const upsertProfile = vi
    .spyOn(runtime.api.personalization, 'upsertProfile')
    .mockResolvedValue({ profile: completeProfile('updated-profile') } as never);
  const sendBatchEvents = vi
    .spyOn(runtime.api.analytics, 'sendBatchEvents')
    .mockResolvedValue(true);

  return { runtime, sendBatchEvents, upsertProfile };
}

class TestRuntime extends ContentfulExperiences {
  override fetchPreviewSessionPayload(session: PreviewSessionOptions): Promise<ExperiencePayload> {
    return super.fetchPreviewSessionPayload(session);
  }
  override fetchExperiencePayload(
    options: import('@contentful/experiences-runtime').BuiltFetchExperienceOptions,
    resolveOptions: import('@contentful/experiences-runtime').FetchResolveOptions
  ) {
    return super.fetchExperiencePayload(options, resolveOptions);
  }
}
const resolver = { config: resolverConfig };
const route = { routeKey: '/' };
const scope = { spaceId: 'space', environmentId: 'environment' };
const payload = (profileId = 'xda-profile'): ExperiencePayload => ({
  sys: { type: 'Experience' },
  nodes: [],
  extensions: { personalization: { profile: completeProfile(profileId) } },
});
function setup(policy: Pick<Config, 'allowedEventTypes' | 'onEventBlocked'> = {}) {
  const sdk = createRuntime({ preview: { accessToken: 'preview-token' }, ...policy });
  const fetch = vi.spyOn(sdk, 'fetchExperiencePayload').mockResolvedValue(payload());
  const commit = vi
    .spyOn(sdk.api.personalization, 'upsertProfile')
    .mockResolvedValue({ profile: completeProfile('committed-profile') } as never);
  const request = sdk.forRequest({ consent: true });
  const options = {
    experienceId: 'experience',
    personalization: { events: [request.eventBuilder.buildIdentify({ userId: 'user' })] },
  };
  return { sdk, request, options, fetch, commit };
}
function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
describe('request context', () => {
  it.each([
    { consent: true, events: true, persistence: true },
    { consent: false, events: false, persistence: false },
    { consent: { events: true }, events: true, persistence: false },
    { consent: { events: false, persistence: true }, events: false, persistence: true },
  ])('keeps consent axes independent (%j)', ({ consent, events, persistence }) => {
    const { request, bindings } = createBoundRequest({ consent });
    expect(request.canPersistProfile).toBe(persistence);
    expect(bindings.getConsent?.()?.events).toBe(events);
  });

  it('keeps separate request submission options isolated, including omission', () => {
    const runtime = requestRuntimeFixture();
    const inputs = [{ ip: '203.0.113.1' }, { ip: '203.0.113.2', plainText: true }, undefined];
    const options = inputs.map((personalizationOptions) => {
      const { bindings } = createBoundRequest({ consent: true, personalizationOptions }, runtime);
      return { ...bindings.getPersonalizationOptions?.(), locale: bindings.getLocale?.() };
    });
    expect(options).toEqual([
      { ip: '203.0.113.1', plainText: undefined, locale: 'en-US' },
      { ip: '203.0.113.2', plainText: true, locale: 'en-US' },
      { locale: 'en-US' },
    ]);
  });

  it('copies submission options and request preflight before later input mutation', () => {
    const personalizationOptions = { ip: '203.0.113.1' };
    const context = { consent: true, preflight: true, personalizationOptions };
    const state = createBoundRequest(context);
    personalizationOptions.ip = '198.51.100.99';
    context.preflight = false;
    expect(state.bindings.getPersonalizationOptions?.()).toEqual(
      expect.objectContaining({ ip: '203.0.113.1' })
    );
    expect(state.request.requestPreflight).toBe(true);
  });

  it('lets request locale win for content, context and Personalization transport', () => {
    const state = createBoundRequest({
      locale: 'de-DE',
      eventContext: { locale: 'it-IT' },
      personalizationOptions: { locale: 'fr-FR' },
    });
    expect(state.request.locale).toBe('de-DE');
    expect(state.bindings.getLocale?.()).toBe('de-DE');
    expect(state.request.requestEventContext).toMatchObject({ locale: 'de-DE' });
  });

  it('uses Personalization transport locale without changing the content locale', () => {
    const state = createBoundRequest({
      consent: true,
      personalizationOptions: { locale: 'fr-FR' },
    });
    expect(state.request.locale).toBe('en-US');
    expect(state.bindings.getLocale?.()).toBe('fr-FR');
  });
  it('binds event construction to each request without changing the shared builder', () => {
    const runtime = requestRuntimeFixture();
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
    const first = createBoundRequest(
      {
        locale: 'de-DE',
        eventContext: { ...firstContext, locale: 'it-IT' },
        consent: true,
      },
      runtime
    ).request;
    const second = createBoundRequest(
      { eventContext: secondContext, consent: false },
      runtime
    ).request;

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
    const runtime = requestRuntimeFixture();
    const page = { ...runtime.eventBuilder.getPageProperties(), url: 'https://request.test' };
    const request = createBoundRequest(
      {
        locale: 'de-DE',
        eventContext: { userAgent: 'request-agent', page },
      },
      runtime
    ).request;
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

  it('captures the direct registry but reads current profile, context, preview and lifetime', async () => {
    const context: RequestContext = {
      consent: true,
      profile: { id: 'first' },
      eventContext: { userAgent: 'current' },
      personalizationOptions: { ip: '203.0.113.7', plainText: true },
      analyticsOptions: { beacon: vi.fn(() => true) },
    };
    const onEventBlocked = vi.fn();
    const { request, runtime, bindings, methods } = createBoundRequest(
      context,
      requestRuntimeFixture(),
      { onEventBlocked }
    );
    const registry = runtime.interceptors.event;
    runtime.interceptors.event = new InterceptorManager<OptimizationEventStreamEvent>();
    const profile = completeProfile('second');
    bindings.setProfile(profile);
    request.previewOverride = true;
    context.eventContext = { userAgent: 'latest' };
    expect(bindings.eventInterceptors).toBe(registry);
    expect(bindings.getProfile()).toEqual(profile);
    expect(bindings.getProfileRevision?.()).toBe(1);
    expect(bindings.getIsPreview?.()).toBe(true);
    expect(bindings.getEventContext?.()).toEqual({ userAgent: 'latest' });
    expect(bindings.getPersonalizationOptions?.()).toEqual({
      ip: '203.0.113.7',
      plainText: true,
      locale: undefined,
    });
    expect(bindings.getAnalyticsOptions?.()).toEqual(context.analyticsOptions);
    expect(bindings.getLocale?.()).toBe('en-US');
    expect(bindings.onEventBlocked).toBe(onEventBlocked);
    request.destroy();
    expect(bindings.isActive?.()).toBe(false);
    const detachedPage = request.page;
    await expect(detachedPage()).resolves.toEqual({ accepted: false });
    expect(methods.page).not.toHaveBeenCalled();
  });
});

describe('request facade', () => {
  it.each([
    { label: 'committing intent', preflight: false, routeKey: '/', error: /preflight: true/ },
    { label: 'invalid route', preflight: undefined, routeKey: 'home', error: /route key/ },
  ])(
    'rejects handoff $label before building, hooks or transport',
    async ({ preflight, routeKey, error }) => {
      const fetch = vi.fn<typeof globalThis.fetch>();
      const runtime = createRuntime({ delivery: { accessToken: 'delivery-token', fetch } });
      const build = vi.spyOn(runtime.eventBuilder, 'buildPageView');
      const hook = vi.fn((event: OptimizationEventStreamEvent) => event);
      runtime.interceptors.event.add(hook);
      const commit = vi.spyOn(runtime.api.personalization, 'upsertProfile');
      const request = runtime.forRequest({ consent: true });
      await expect(
        request.fetchExperienceForHandoff(
          {
            experienceId: 'experience',
            personalization: { preflight, events: [{ type: 'page' }] },
          },
          resolver,
          { routeKey }
        )
      ).rejects.toThrow(error);
      expect(build).not.toHaveBeenCalled();
      expect(hook).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
      expect(commit).not.toHaveBeenCalled();
    }
  );

  describe('request-owned Preview Session', () => {
    function previewFixture(configured = true) {
      const payload: ExperiencePayload = { sys: { id: 'edited', type: 'Experience' }, nodes: [] };
      const runtime = trackRuntime(
        new TestRuntime({
          ...scope,
          delivery: { accessToken: 'delivery-token' },
          preview: configured ? { accessToken: 'preview-token' } : undefined,
        })
      );
      const snapshot = vi.spyOn(runtime, 'fetchPreviewSessionPayload').mockResolvedValue(payload);
      const ordinary = vi.spyOn(runtime, 'fetchExperience').mockResolvedValue(emptyPlan);
      const resolve = vi.spyOn(runtime, 'resolveExperience');
      return { runtime, payload, snapshot, ordinary, resolve };
    }

    it('validates normal and handoff selectors before preview acquisition', async () => {
      const f = previewFixture();
      const request = f.runtime.forRequest({ preview: { sessionId: 'session' } });
      const invalid = { experienceId: 'edited', destinationId: 'site', path: '/' } as never;
      await expect(request.fetchExperience(invalid, resolver)).rejects.toBeInstanceOf(TypeError);
      await expect(
        request.fetchExperienceForHandoff(invalid, resolver, { routeKey: '/' })
      ).rejects.toBeInstanceOf(TypeError);
      expect(f.snapshot).not.toHaveBeenCalled();
      expect(f.ordinary).not.toHaveBeenCalled();
    });

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
        await request.fetchExperience({ experienceId: 'edited' }, resolver);
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
      await request.fetchExperience({ experienceId: 'other' }, resolver);
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
      await request.fetchExperience({ experienceId: 'edited' }, resolver);
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
        request.fetchExperience({ experienceId: 'edited' }, resolver),
        request.fetchExperience({ experienceId: 'other' }, resolver),
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

      await request.fetchExperience({ experienceId: 'edited' }, resolver);
      await request.fetchExperience({ experienceId: 'other' }, resolver);
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
        const pending = request.fetchExperience({ experienceId: 'edited' }, resolver);
        request.destroy();
        if (outcome === 'success') complete(f.payload);
        else fail(new Error('late snapshot failure'));
        await expect(pending).rejects.toThrow(/destroyed/);
        await expect(request.fetchExperience({ experienceId: 'edited' }, resolver)).rejects.toThrow(
          /destroyed/
        );
        expect(f.snapshot).toHaveBeenCalledOnce();
        expect(f.resolve).not.toHaveBeenCalled();
        expect(f.ordinary).not.toHaveBeenCalled();
      }
    );
  });

  it('forwards changed parameters through request facades independently of event consent', async () => {
    const runtime = createRuntime();
    const fetch = vi.spyOn(runtime, 'fetchExperience').mockResolvedValue(emptyPlan);
    const request = runtime.forRequest({ consent: { events: false }, locale: 'de-DE' });
    const parameters = { featuredPosts: { limit: 6, order: '-fields.title' } };
    await request.fetchExperience({ experienceId: 'exp', parameters }, resolver);
    await request.fetchExperience(
      { experienceId: 'exp', parameters: { productId: 'other' } },
      resolver
    );
    await runtime
      .forRequest({ preflight: true })
      .fetchExperience({ experienceId: 'exp' }, resolver);
    expect(fetch.mock.calls.map(([options]) => options.parameters)).toEqual([
      parameters,
      { productId: 'other' },
      undefined,
    ]);
    expect(fetch.mock.calls[1]?.[0]).toMatchObject({ locale: 'de-DE' });
    expect(fetch.mock.calls[2]?.[0].personalization).toBeUndefined();
  });

  it('keeps event disposal local to a request without adding shared SDK shutdown', async () => {
    const { runtime, upsertProfile } = createEventRuntime();
    const disposed = runtime.forRequest({ consent: true });
    const sibling = runtime.forRequest({ consent: true });
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
    const configs = ['first', 'second'].map((variant) => ({
      components: { hero: { resolveData: () => ({ variant }) } },
    }));
    const fetch = vi
      .spyOn(runtime, 'fetchExperience')
      .mockImplementation(async (_options, resolve) => runtime.resolveExperience(payload, resolve));
    for (const [index, config] of configs.entries()) {
      const plan = await request.fetchExperience({ experienceId: String(index) }, { config });
      expect(plan.nodes[0]?.props.resolved).toEqual({ variant: ['first', 'second'][index] });
    }
    expect(fetch.mock.calls.map(([, options]) => options.config)).toEqual(configs);
  });

  it.each([
    { experienceId: 'experience' },
    { destinationId: 'destination', nodeId: 'node' },
    { destinationId: 'destination', path: '/path' },
  ])('forwards the selector, request locale and resolve options (%j)', async (selector) => {
    const runtime = createRuntime();
    const fetch = vi.spyOn(runtime, 'fetchExperience').mockResolvedValue(emptyPlan);
    const request = runtime.forRequest({
      locale: 'es-ES',
      resolveOptions: { metadata: { request: true } },
    });
    if (selector.nodeId !== undefined) await request.fetchByDestinationNode(selector, resolver);
    else if (selector.path !== undefined) await request.fetchByDestinationPath(selector, resolver);
    else await request.fetchExperience(selector, resolver);
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      { ...selector, locale: 'es-ES', personalization: undefined },
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
  });

  it('requires a request-local profile before delegating Analytics events', async () => {
    const { runtime, sendBatchEvents } = createEventRuntime();
    const request = runtime.forRequest({ consent: true });

    await expect(
      request.trackClick({ entityId: 'entry', entityKind: 'Experience' })
    ).rejects.toBeInstanceOf(EventProfileRequiredError);
    expect(sendBatchEvents).not.toHaveBeenCalled();
  });

  it('rejects invalid preflight without replacing it with the request default', async () => {
    const runtime = createRuntime();
    expect(() => runtime.forRequest({ preflight: null as never })).toThrow(
      /preflight must be a boolean/
    );
    const fetch = vi.spyOn(runtime, 'fetchExperience').mockResolvedValue(emptyPlan);
    const request = runtime.forRequest({ preflight: true, profile: { id: 'known' } });
    await expect(
      request.fetchExperience(
        { experienceId: 'experience', personalization: { preflight: null as never } },
        resolver
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
    const redirect = { redirect: { path: '/elsewhere' } };
    fetchExperience.mockResolvedValue(redirect);
    const request = runtime.forRequest({ profile: { id: 'initial-profile' } });

    await request.fetchExperience({ experienceId: 'first' }, resolver);
    expect(fetchExperience.mock.calls[0]?.[0]).toMatchObject({
      personalization: { profileId: 'initial-profile' },
    });
    expect(request.profile).toEqual(completeProfile('xda-profile'));

    const result = await request.fetchExperience(
      {
        destinationId: 'destination',
        path: '/override',
        personalization: { profileId: 'explicit-profile', events: [] },
      },
      resolver
    );
    expect(result).toEqual(redirect);
    expect(fetchExperience.mock.calls[1]?.[0]).toMatchObject({
      personalization: { profileId: 'explicit-profile', events: [] },
    });
    expect(request.profile).toEqual(completeProfile('xda-profile'));
  });

  it('does not let a stale XDA response replace a newer request profile', async () => {
    const { runtime } = createEventRuntime();
    const hold = deferred<never>();
    const fetchExperience = vi.spyOn(runtime, 'fetchExperience').mockReturnValueOnce(hold.promise);
    const request = runtime.forRequest({ profile: { id: 'initial-profile' } });

    const pending = request.fetchExperience({ experienceId: 'slow' }, resolver);
    expect(fetchExperience.mock.calls[0]?.[0]).toMatchObject({
      personalization: { profileId: 'initial-profile' },
    });
    await request.identify({ userId: 'new-user' });
    hold.resolve({
      nodes: [],
      personalization: { profile: completeProfile('stale-profile') },
    } as never);
    await pending;

    expect(request.profile).toEqual(completeProfile('updated-profile'));
  });

  describe('request event interception', () => {
    function setup() {
      const {
        runtime: sdk,
        upsertProfile: upsert,
        sendBatchEvents: analytics,
      } = createEventRuntime();
      upsert.mockResolvedValue({ profile: analyticsProfileFixture('response') } as never);
      return { sdk, upsert, analytics };
    }
    it('intercepts direct Personalization and Analytics once on their original transports', async () => {
      const { sdk, upsert, analytics } = setup();
      const hook = vi.fn((event: OptimizationEventStreamEvent) => {
        event.context.userAgent = 'normalized';
        return event;
      });
      sdk.interceptors.event.add(hook);
      const request = sdk.forRequest({
        consent: true,
        profile: analyticsProfileFixture('visitor'),
      });
      await request.page();
      await request.trackClick({ entityId: 'entity', entityKind: 'Experience' });
      expect(hook).toHaveBeenCalledTimes(2);
      expect(upsert.mock.calls[0]?.[0].events[0]?.context.userAgent).toBe('normalized');
      expect(analytics.mock.calls[0]?.[0][0]?.events[0]?.context.userAgent).toBe('normalized');
    });

    it('isolates concurrent request identities/context despite one shared asynchronous hook', async () => {
      const { sdk, upsert } = setup();
      sdk.interceptors.event.add(async (event) => {
        await Promise.resolve();
        return event;
      });
      const requests = ['a', 'b'].map((id) =>
        sdk.forRequest({
          consent: true,
          profile: { id },
          eventContext: { userAgent: `agent-${id}` },
        })
      );
      await Promise.all(requests.map((request) => request.page()));
      expect(
        upsert.mock.calls.map(([body]) => [body.profileId, body.events[0]?.context.userAgent])
      ).toEqual([
        ['a', 'agent-a'],
        ['b', 'agent-b'],
      ]);
    });

    it('captures XDA identity and revision before asynchronous interception', async () => {
      const { sdk } = setup();
      const hold = deferred();
      sdk.interceptors.event.add(async (event) => {
        if (event.type === 'page') await hold.promise;
        return event;
      });
      const fetch = vi.spyOn(sdk, 'fetchExperience').mockResolvedValue({
        nodes: [],
        personalization: { profile: analyticsProfileFixture('stale') },
      } as never);
      const request = sdk.forRequest({ consent: true, profile: { id: 'initial' } });
      const pending = request.fetchExperience(
        {
          experienceId: 'exp',
          personalization: { events: [sdk.eventBuilder.buildPageView()] },
        },
        resolver
      );
      await request.identify({ userId: 'new' });
      hold.resolve();
      await pending;
      expect(fetch.mock.calls[0]?.[0].personalization?.profileId).toBe('initial');
      expect(request.profile?.id).toBe('response');
    });
  });
});
describe('request preflight defaults', () => {
  it.each([
    { requestDefault: undefined, explicit: undefined, expected: undefined },
    { requestDefault: true, explicit: undefined, expected: true },
    { requestDefault: false, explicit: undefined, expected: false },
    { requestDefault: true, explicit: false, expected: false },
    { requestDefault: false, explicit: true, expected: true },
  ])(
    'uses preflight default $requestDefault with explicit $explicit',
    async ({ requestDefault, explicit, expected }) => {
      const options = { personalization: { profileId: 'known', preflight: explicit } };
      const input = globalThis.structuredClone(options.personalization);
      const runtime = createRuntime();
      const fetch = vi.spyOn(runtime, 'fetchExperience').mockResolvedValue({} as never);
      const request = runtime.forRequest({ preflight: requestDefault });
      await request.fetchExperience({ experienceId: 'experience', ...options }, resolver);
      const gated = fetch.mock.calls[0]![0];
      expect(gated.personalization).toEqual({ profileId: 'known', preflight: expected });
      expect(options.personalization).toEqual(input);
    }
  );
});

describe('request handoff Preview routing', () => {
  it.each([undefined, 'experience'])(
    'isolates preview personalization and identity with snapshot ID %s',
    async (experienceId) => {
      const { sdk, options, fetch, commit } = setup();
      vi.spyOn(sdk, 'fetchPreviewSessionPayload').mockResolvedValue({
        ...payload('preview-profile'),
        sys: { type: 'Experience', id: experienceId },
      });
      const request = sdk.forRequest({
        preview: { sessionId: 'session' },
        consent: true,
        profile: { id: 'preview-owner' },
      });
      const result = await request.fetchExperienceForHandoff(options, resolver, route);
      expect(result.handoff).toEqual({ ...scope, cache: { scope: 'private-request' } });
      expect(result.plan?.personalization?.profile.id).toBe(
        experienceId ? 'preview-profile' : 'xda-profile'
      );
      expect(result.error).toBeUndefined();
      expect(request.profile).toBeUndefined();
      expect(request.canPersistProfile).toBe(false);
      if (experienceId) expect(fetch).not.toHaveBeenCalled();
      else expect(fetch.mock.calls[0]![0].personalization).toBeUndefined();
      expect(commit).not.toHaveBeenCalled();
    }
  );

  it.each(['snapshot', 'delivery', 'resolution'] as const)(
    'returns preview %s failures in an identity-free handoff',
    async (source) => {
      const { sdk, options, fetch, commit } = setup();
      const failure = new TypeError(`${source} content failed`);
      const snapshot = { ...payload(), sys: { type: 'Experience' as const, id: 'experience' } };
      const read = vi.spyOn(sdk, 'fetchPreviewSessionPayload').mockResolvedValue(snapshot);
      const resolve = vi.spyOn(sdk, 'resolveExperience');
      if (source === 'snapshot') read.mockRejectedValueOnce(failure);
      if (source === 'delivery') {
        snapshot.sys.id = 'other';
        fetch.mockRejectedValueOnce(failure);
      }
      if (source === 'resolution') resolve.mockRejectedValueOnce(failure);
      const request = sdk.forRequest({
        preview: { sessionId: 'session' },
        consent: true,
        profile: { id: 'visitor' },
      });
      await expect(request.fetchExperienceForHandoff(options, resolver, route)).resolves.toEqual({
        handoff: { ...scope, cache: { scope: 'private-request' } },
        error: failure,
      });
      expect(request.isPreview).toBe(true);
      expect(request.profile).toBeUndefined();
      expect(request.canPersistProfile).toBe(false);
      expect(commit).not.toHaveBeenCalled();
      if (source !== 'delivery') expect(fetch).not.toHaveBeenCalled();
    }
  );

  it('keeps matching preview override validation outside handoff content errors', async () => {
    const { sdk, options, fetch, commit } = setup();
    vi.spyOn(sdk, 'fetchPreviewSessionPayload').mockResolvedValue({
      ...payload(),
      sys: { type: 'Experience', id: 'experience' },
    });
    const resolve = vi.spyOn(sdk, 'resolveExperience');
    const request = sdk.forRequest({ preview: { sessionId: 'session' } });
    await expect(
      request.fetchExperienceForHandoff({ ...options, locale: 'de-DE' }, resolver, route)
    ).rejects.toThrow(/locale is server-owned/);
    expect(resolve).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  });

  it.each(['snapshot', 'resolution'] as const)(
    'rejects preview handoff disposal during %s instead of returning a content error',
    async (source) => {
      const { sdk, options, fetch, commit } = setup();
      const snapshot = { ...payload(), sys: { type: 'Experience' as const, id: 'experience' } };
      const read = vi.spyOn(sdk, 'fetchPreviewSessionPayload').mockResolvedValue(snapshot);
      const resolve = vi.spyOn(sdk, 'resolveExperience');
      const hold = deferred<ExperiencePayload>();
      if (source === 'snapshot') read.mockReturnValueOnce(hold.promise);
      else
        resolve.mockImplementationOnce(async () => {
          await hold.promise;
          throw new Error('late resolution failure');
        });
      const request = sdk.forRequest({ preview: { sessionId: 'session' } });
      const pending = request.fetchExperienceForHandoff(options, resolver, route);
      if (source === 'resolution') await vi.waitFor(() => expect(resolve).toHaveBeenCalled());
      request.destroy();
      hold.resolve(snapshot);
      await expect(pending).rejects.toThrow(/destroyed/);
      expect(fetch).not.toHaveBeenCalled();
      expect(commit).not.toHaveBeenCalled();
    }
  );

  it.each(['ordinary', 'handoff'] as const)(
    'discards late %s content after destruction without touching another request',
    async (operation) => {
      const { sdk, options, fetch, commit } = setup();
      const owner = sdk.forRequest({ consent: true, profile: { id: 'owner' } });
      const other = sdk.forRequest({ consent: true, profile: { id: 'other' } });
      const hold = deferred<ExperiencePayload>();
      fetch.mockReturnValueOnce(hold.promise);
      const pending =
        operation === 'ordinary'
          ? owner.fetchExperience(options, resolver)
          : owner.fetchExperienceForHandoff(options, resolver, route);
      owner.destroy();
      hold.resolve(payload('late'));
      await expect(pending).rejects.toThrow(/destroyed/);
      expect(owner.profile?.id).toBe('owner');
      expect(other.profile?.id).toBe('other');
      expect(commit).not.toHaveBeenCalled();
    }
  );
});

describe('Node ordinary XDA fetch', () => {
  it('forwards prepared native and raw events once without a direct Personalization commit', async () => {
    const { sdk, request, fetch, commit } = setup();
    const hook = vi.fn((event: OptimizationEventStreamEvent) => event);
    sdk.interceptors.event.add(hook);
    const raw = sdk.eventBuilder.buildTrack({ event: 'raw' });
    const plan = await request.fetchExperience(
      { experienceId: 'experience', personalization: { events: [{ type: 'page' }, raw] } },
      resolver
    );
    expect(fetch).toHaveBeenCalledOnce();
    expect(hook).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0]?.[0].personalization?.events?.map((event) => event.type)).toEqual([
      'page',
      'track',
    ]);
    expect(plan.personalization?.profile?.id).toBe('xda-profile');
    expect(request.profile?.id).toBe('xda-profile');
    expect(commit).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'drops native event intent before building under preview=%s',
    async (isPreview) => {
      const onEventBlocked = vi.fn();
      const { sdk, fetch, commit } = setup({ onEventBlocked });
      vi.spyOn(sdk, 'fetchPreviewSessionPayload').mockResolvedValue(payload());
      const build = vi.spyOn(sdk.eventBuilder, 'buildTrack');
      const hook = vi.fn((event: OptimizationEventStreamEvent) => event);
      sdk.interceptors.event.add(hook);
      const request = sdk.forRequest({
        preview: isPreview ? { sessionId: 'session' } : undefined,
        consent: false,
        profile: { id: 'incoming' },
      });
      await request.fetchExperience(
        {
          experienceId: 'experience',
          personalization: { events: [{ type: 'track', event: 'blocked' }] },
        },
        resolver
      );
      expect(fetch.mock.calls[0]![0].personalization).toEqual(
        isPreview ? undefined : { profileId: 'incoming', events: [] }
      );
      expect(onEventBlocked).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'track', reason: isPreview ? 'preview' : 'consent' })
      );
      expect(build).not.toHaveBeenCalled();
      expect(hook).not.toHaveBeenCalled();
      expect(commit).not.toHaveBeenCalled();
      expect(request.profile?.id).toBe(isPreview ? undefined : 'xda-profile');
    }
  );

  it('propagates content failure without a fallback commit', async () => {
    const { request, options, fetch, commit } = setup();
    const failure = new Error('content failed');
    fetch.mockRejectedValueOnce(failure);
    await expect(request.fetchExperience(options, resolver)).rejects.toBe(failure);
    expect(request.profile).toBeUndefined();
    expect(commit).not.toHaveBeenCalled();
  });
});

describe('destination Preview routing', () => {
  it.each([
    ['master', 'selected', 'preview'],
    ['master', 'other', 'delivery'],
    ['branch', 'selected', 'delivery'],
  ])(
    'uses only same-scope, actual-ID preview content (%s, %s)',
    async (environmentId, previewId, expected) => {
      const sdk = new TestRuntime({
        spaceId: 'space',
        environmentId,
        delivery: { accessToken: 'token' },
        preview: { accessToken: 'preview' },
      });
      trackRuntime(sdk);
      const fetch = vi.spyOn(sdk, 'fetchExperiencePayload').mockResolvedValue({
        sys: { id: 'selected' },
        nodes: [],
        errors: [{ message: 'delivery' }],
      });
      const preview = vi
        .spyOn(sdk, 'fetchPreviewSessionPayload')
        .mockResolvedValue({ sys: { id: previewId }, nodes: [], errors: [{ message: 'preview' }] });
      const resolve = vi.spyOn(sdk, 'resolveExperience');
      const request = sdk.forRequest({ preview: { sessionId: 'session' }, consent: true });
      await request.fetchExperience(
        { destinationId: 'dest', path: '/', personalization: { events: [{ type: 'page' }] } },
        resolver
      );
      expect(fetch).toHaveBeenCalledOnce();
      expect(fetch.mock.calls[0]?.[0].personalization).toBeUndefined();
      expect(resolve).toHaveBeenCalledOnce();
      expect(resolve.mock.calls[0]?.[0]).toMatchObject({ errors: [{ message: expected }] });
      if (environmentId !== 'master') expect(preview).not.toHaveBeenCalled();
    }
  );
});
