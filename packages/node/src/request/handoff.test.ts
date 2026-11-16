import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExperiencePayload } from '@contentful/experiences-sdk-core';
import {
  toConsentState,
  type FetchExperienceOptions,
  type FetchResolveOptions,
  type OptimizationEventStreamEvent,
} from '@contentful/experiences-runtime';
import {
  ContentfulExperiences,
  type Config,
  type RequestContext,
} from '../contentful-experiences.js';
import { RequestBoundExperiences } from './request-runtime.js';
import { RequestPersonalization } from './personalization.js';
import { assertHandoffRequest, fetchHandoff } from './handoff.js';
import { profileFixture } from '../test/fixtures/profile.js';
import { createBoundRequest } from '../test/fixtures/request-runtime.js';

const resolver = { config: { components: {} } };
const route = { routeKey: '/' };
const scope = { spaceId: 'space', environmentId: 'environment' };
const runtimes: ContentfulExperiences[] = [];
const payload = (profileId = 'xda-profile'): ExperiencePayload => ({
  sys: { type: 'Experience' },
  nodes: [],
  extensions: { personalization: { profile: profileFixture(profileId) } },
});

function setup(policy: Pick<Config, 'allowedEventTypes' | 'onEventBlocked'> = {}) {
  const sdk = new ContentfulExperiences({
    ...scope,
    locale: 'en-US',
    delivery: { accessToken: 'token' },
    ...policy,
  });
  runtimes.push(sdk);
  const fetch = vi.fn<Parameters<typeof fetchHandoff>[3]>().mockResolvedValue(payload());
  const commit = vi.spyOn(sdk.api.personalization, 'upsertProfile');
  const states = new Map<
    RequestBoundExperiences,
    {
      identity: Parameters<typeof fetchHandoff>[1];
      personalization: RequestPersonalization;
    }
  >();
  function createRequest(context: RequestContext = {}) {
    const { request, bindings } = createBoundRequest(context, sdk, policy);
    const assertActive = () => {
      if (!bindings.isActive?.()) throw new Error('The Node request has been destroyed');
    };
    states.set(request, {
      identity: {
        getProfile: () => request.profile,
        getRevision: () => bindings.getProfileRevision!(),
        setProfile: bindings.setProfile,
        isPreview: request.isPreview,
        locale: request.locale,
        assertActive,
      },
      personalization: new RequestPersonalization({
        getProfile: () => request.profile,
        locale: request.locale,
        isPreview: request.isPreview,
        eventBuilder: request.eventBuilder,
        consent: toConsentState(context.consent ?? {}),
        consentPolicy: policy,
        getInterceptors: () => sdk.interceptors.event,
        assertActive,
      }),
    });
    return request;
  }
  function produce(
    request: RequestBoundExperiences,
    options: FetchExperienceOptions,
    resolve: FetchResolveOptions,
    replay: { routeKey: string }
  ) {
    const state = states.get(request)!;
    return fetchHandoff(
      sdk,
      state.identity,
      state.personalization,
      fetch,
      options,
      resolve,
      replay.routeKey,
      { ...scope, cache: { scope: 'private-request' } }
    );
  }
  const request = createRequest({ consent: true });
  const options = {
    experienceId: 'experience',
    personalization: { events: [request.eventBuilder.buildIdentify({ userId: 'user' })] },
  };
  return { sdk, request, options, fetch, commit, createRequest, produce };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
afterEach(() => {
  for (const sdk of runtimes.splice(0)) sdk.destroy();
  vi.restoreAllMocks();
});

describe('fetchHandoff', () => {
  it.each([
    { changes: [] },
    {
      changes: [
        {
          type: 'Variable' as const,
          key: 'banner',
          value: false,
          meta: { experienceId: 'experiment', variantIndex: 0 },
        },
      ],
    },
  ])('carries returned flag snapshots through private handoffs (%j)', async ({ changes }) => {
    const { request, options, fetch, produce } = setup();
    const response = payload();
    response.extensions!.personalization!.changes = changes;
    fetch.mockResolvedValueOnce(response);
    const { handoff } = await produce(request, options, resolver, route);
    expect(handoff.state).toEqual({ profile: profileFixture('xda-profile'), changes });
  });

  it('evaluates consumer events at XDA and returns their exact finalized aggregate without committing', async () => {
    const { sdk, fetch, commit, produce, createRequest } = setup();
    const request = createRequest({
      consent: true,
      preflight: false,
      profile: { id: 'incoming' },
      locale: 'de-DE',
      eventContext: { userAgent: 'request-agent' },
      personalizationOptions: { ip: '203.0.113.7', plainText: true, locale: 'fr-FR' },
    });
    const hook = vi.fn((event: OptimizationEventStreamEvent) => {
      expect(event.context).toMatchObject({
        locale: 'de-DE',
        userAgent: 'request-agent',
        gdpr: { isConsentGiven: true },
      });
      event.context.userAgent = 'intercepted';
      return event;
    });
    sdk.interceptors.event.add(hook);
    const events = [
      { type: 'identify', userId: 'user' },
      { type: 'track', event: 'opened' },
      { type: 'page', properties: { url: 'https://example.test/home' } },
    ] satisfies NonNullable<FetchExperienceOptions['personalization']>['events'];
    const original = globalThis.structuredClone(events);
    const builders = [
      vi.spyOn(sdk.eventBuilder, 'buildIdentify'),
      vi.spyOn(sdk.eventBuilder, 'buildTrack'),
      vi.spyOn(sdk.eventBuilder, 'buildPageView'),
    ];
    const { handoff, error, plan } = await produce(
      request,
      { experienceId: 'experience', personalization: { events } },
      resolver,
      { routeKey: '/home?sort=popular' }
    );
    expect(error).toBeUndefined();
    expect(plan).toBeDefined();
    expect(commit).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0]![0].personalization?.preflight).toBe(true);
    const evaluated = globalThis.structuredClone(fetch.mock.calls[0]![0].personalization?.events);
    expect(handoff.replay?.events).toEqual(evaluated);
    expect(evaluated).toMatchObject(
      events.map((event) => ({
        ...event,
        messageId: expect.any(String),
        context: { locale: 'de-DE', userAgent: 'intercepted', gdpr: { isConsentGiven: true } },
      }))
    );
    expect(events).toEqual(original);
    expect(fetch.mock.calls[0]![0].personalization?.profileId).toBe('incoming');
    expect(handoff).toMatchObject({
      ...scope,
      cache: { scope: 'private-request' },
      profileId: 'xda-profile',
      state: { profile: profileFixture('xda-profile') },
      replay: { routeKey: '/home?sort=popular', locale: 'de-DE' },
    });
    expect(request.profile?.id).toBe('xda-profile');
    for (const builder of builders) expect(builder).toHaveBeenCalledOnce();
    expect(hook).toHaveBeenCalledTimes(events.length);
    expect(commit).not.toHaveBeenCalled();
  });

  it.each([
    { stage: 'fetch', selector: { experienceId: 'experience' } },
    { stage: 'resolve', selector: { experienceId: 'experience' } },
    { stage: 'resolve', selector: { destinationId: 'dest', path: '/page' } },
    { stage: 'resolve', selector: { destinationId: 'dest', nodeId: 'node' } },
  ] as const)(
    'retains a usable browser replay after $stage failure ($selector)',
    async ({ stage, selector }) => {
      const { sdk, options, fetch, commit, produce, createRequest } = setup();
      const failure = new Error('content failed');
      if (stage === 'fetch') fetch.mockRejectedValueOnce(failure);
      else vi.spyOn(sdk, 'resolveExperience').mockRejectedValueOnce(failure);
      const request = createRequest({ consent: true, profile: { id: 'incoming' } });
      const events = options.personalization.events;
      const { handoff, error, plan } = await produce(
        request,
        { ...selector, locale: 'de-DE', personalization: options.personalization },
        resolver,
        route
      );
      expect(error).toBe(failure);
      expect(plan).toBeUndefined();
      expect(handoff.replay?.events).toEqual(events);
      expect(handoff.profileId).toBe(stage === 'fetch' ? 'incoming' : 'xda-profile');
      expect(handoff.state).toEqual(
        stage === 'fetch' ? undefined : { profile: profileFixture('xda-profile') }
      );
      expect(handoff.replay?.locale).toBe('de-DE');
      expect(fetch).toHaveBeenCalledOnce();
      expect(fetch.mock.calls[0]?.[0]).toMatchObject({
        ...selector,
        locale: 'de-DE',
        personalization: { preflight: true },
      });
      expect(commit).not.toHaveBeenCalled();
    }
  );

  it('finishes asynchronous identify interception before starting track interception', async () => {
    const { sdk, request, fetch, commit, produce } = setup();
    const hold = deferred<void>();
    let identified = false;
    const hook = vi.fn(async (event: OptimizationEventStreamEvent) => {
      if (event.type === 'identify') {
        await hold.promise;
        identified = true;
      } else {
        expect(identified).toBe(true);
      }
      return event;
    });
    sdk.interceptors.event.add(hook);
    const pending = produce(
      request,
      {
        experienceId: 'experience',
        personalization: {
          events: [
            { type: 'identify', userId: 'user' },
            { type: 'track', event: 'opened' },
          ],
        },
      },
      resolver,
      route
    );
    expect(hook).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
    hold.resolve();
    const { handoff, plan, error } = await pending;
    expect(hook.mock.calls.map(([event]) => event.type)).toEqual(['identify', 'track']);
    expect(handoff.replay?.events).toEqual(fetch.mock.calls[0]![0].personalization?.events);
    expect(plan).toBeDefined();
    expect(error).toBeUndefined();
    expect(fetch).toHaveBeenCalledOnce();
    expect(commit).not.toHaveBeenCalled();
  });

  it('stops remaining interception and XDA when destroyed during an asynchronous identify hook', async () => {
    const { sdk, request, fetch, commit, produce } = setup();
    const hold = deferred<void>();
    const hook = vi.fn(async (event: OptimizationEventStreamEvent) => {
      await hold.promise;
      return event;
    });
    sdk.interceptors.event.add(hook);
    const pending = produce(
      request,
      {
        experienceId: 'experience',
        personalization: {
          events: [
            { type: 'identify', userId: 'user' },
            { type: 'track', event: 'opened' },
          ],
        },
      },
      resolver,
      route
    );
    request.destroy();
    hold.resolve();
    await expect(pending).rejects.toThrow(/destroyed/);
    expect(hook).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  });

  it('passes a valid raw query-array body unchanged to XDA and returns content without committing', async () => {
    const { request, fetch, commit, produce } = setup();
    const page = request.eventBuilder.buildPageView({
      properties: { url: 'https://example.test/?tag=one&tag=two' },
    });
    const raw = {
      ...page,
      context: { ...page.context, page: { ...page.context.page, query: { tag: ['one', 'two'] } } },
    };
    const original = globalThis.structuredClone(raw);
    const { handoff, plan, error } = await produce(
      request,
      { experienceId: 'experience', personalization: { events: [raw] } },
      resolver,
      route
    );
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0]![0].personalization?.events).toEqual([original]);
    expect(handoff.replay?.events).toEqual([original]);
    expect(raw).toEqual(original);
    expect(plan?.personalization?.profile?.id).toBe('xda-profile');
    expect(request.profile?.id).toBe('xda-profile');
    expect(error).toBeUndefined();
    expect(commit).not.toHaveBeenCalled();
  });

  it('rejects invalid finalized XDA hook output before XDA', async () => {
    const { sdk, request, options, fetch, commit, produce } = setup();
    const hook = vi.fn((event: OptimizationEventStreamEvent) => {
      Object.assign(event.context, { gdpr: { isConsentGiven: 'yes' } });
      return event;
    });
    sdk.interceptors.event.add(hook);
    await expect(produce(request, options, resolver, route)).rejects.toThrow(
      /Invalid Experience personalization options/
    );
    expect(hook).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  });

  it('filters consent-blocked events before interception and preserves admitted replay', async () => {
    const onEventBlocked = vi.fn();
    const { sdk, options, fetch, commit, produce, createRequest } = setup({ onEventBlocked });
    const denied = createRequest({ consent: false, profile: { id: 'denied' } });
    const events = [
      ...options.personalization.events,
      sdk.eventBuilder.buildTrack({ event: 'opened' }),
    ];
    const hook = vi.fn((event: OptimizationEventStreamEvent) => event);
    sdk.interceptors.event.add(hook);
    const { handoff: filtered } = await produce(
      denied,
      { ...options, personalization: { events } },
      resolver,
      route
    );
    expect(filtered.replay?.events.map((event) => event.type)).toEqual(['identify']);
    expect(filtered.replay?.events[0]).toMatchObject({
      context: { gdpr: { isConsentGiven: false } },
    });
    expect(hook).toHaveBeenCalledOnce();
    expect(onEventBlocked).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'consent', method: 'track' })
    );

    expect(fetch.mock.calls[0]![0].personalization?.events).toEqual(filtered.replay?.events);
    expect(commit).not.toHaveBeenCalled();
  });

  it('returns a private aggregate without synthesizing event intent', async () => {
    const { request, fetch, commit, produce } = setup();
    const { handoff } = await produce(request, { experienceId: 'experience' }, resolver, route);
    expect(handoff).toEqual({
      ...scope,
      cache: { scope: 'private-request' },
      profileId: 'xda-profile',
      state: { profile: profileFixture('xda-profile') },
    });
    expect(fetch.mock.calls[0]![0].personalization).toBeUndefined();
    expect(commit).not.toHaveBeenCalled();
  });

  it('returns terminal redirects alongside explicit replay intent without resolution', async () => {
    const { sdk, request, fetch, produce } = setup();
    fetch.mockResolvedValueOnce({ redirect: { path: '/target' } });
    const resolve = vi.spyOn(sdk, 'resolveExperience');
    const result = await produce(
      request,
      { destinationId: 'dest', path: '/old', personalization: { events: [{ type: 'page' }] } },
      resolver,
      route
    );
    expect(result.redirect).toEqual({ path: '/target' });
    expect(result.handoff.replay?.events).toHaveLength(1);
    expect(result.plan).toBeUndefined();
    expect(resolve).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledOnce();
  });
});

describe('assertHandoffRequest', () => {
  it.each([
    { preflight: false, routeKey: '/', error: /preflight: true/ },
    { preflight: undefined, routeKey: 'home', error: /route key/ },
    { preflight: undefined, routeKey: undefined, error: /route key/ },
  ])('rejects invalid producer intent (%j)', ({ preflight, routeKey, error }) => {
    expect(() =>
      assertHandoffRequest({ experienceId: 'experience', personalization: { preflight } }, {
        routeKey,
      } as never)
    ).toThrow(error);
  });
  it.each([true, undefined])('accepts preflight %s and an absolute route', (preflight) => {
    expect(() =>
      assertHandoffRequest({ experienceId: 'experience', personalization: { preflight } }, route)
    ).not.toThrow();
  });
});
