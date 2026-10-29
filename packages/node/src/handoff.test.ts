import { profileFixture } from './test/profile.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExperiencePayload } from '@contentful/experiences-sdk-core';
import type {
  BuiltRuntimeFetchExperienceOptions,
  OptimizationEventStreamEvent,
  RuntimeFetchExperienceOptions,
  RuntimeFetchResolveOptions,
} from '@contentful/experiences-runtime';
import { ContentfulExperiences, type ExperiencesNodeConfig } from './contentful-experiences.js';

// Expose the actual Runtime payload boundary for a no-network spy.
class TestRuntime extends ContentfulExperiences {
  override fetchExperiencePayload(
    options: BuiltRuntimeFetchExperienceOptions,
    resolveOptions: RuntimeFetchResolveOptions
  ): Promise<ExperiencePayload> {
    return super.fetchExperiencePayload(options, resolveOptions);
  }
}

const resolver = { config: { components: {} } };
const route = { routeKey: '/' };
const scope = { spaceId: 'space', environmentId: 'environment' };
const runtimes: TestRuntime[] = [];
const payload = (profileId = 'xda-profile'): ExperiencePayload => ({
  sys: { type: 'Experience' },
  nodes: [],
  extensions: { personalization: { profile: profileFixture(profileId) } },
});

function setup(policy: Pick<ExperiencesNodeConfig, 'allowedEventTypes' | 'onEventBlocked'> = {}) {
  const sdk = new TestRuntime({
    ...scope,
    locale: 'en-US',
    delivery: { accessToken: 'token' },
    ...policy,
  });
  runtimes.push(sdk);
  const fetch = vi.spyOn(sdk, 'fetchExperiencePayload').mockResolvedValue(payload());
  const commit = vi
    .spyOn(sdk.api.experience, 'upsertProfile')
    .mockResolvedValue({ profile: profileFixture('committed-profile') } as never);
  const request = sdk.forRequest({ consent: true });
  const options = {
    experienceId: 'experience',
    personalization: { events: [request.eventBuilder.buildIdentify({ userId: 'user' })] },
  };
  return { sdk, request, options, fetch, commit };
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

describe('Node browser-handoff producer', () => {
  it.each(['home', '', undefined, null])(
    'rejects invalid route descriptors (%s) before XDA',
    async (routeKey) => {
      const { request, options, fetch, commit } = setup();
      await expect(
        request.fetchExperienceForHandoff(options, resolver, { routeKey } as never)
      ).rejects.toThrow(/route key/);
      expect(fetch).not.toHaveBeenCalled();
      expect(commit).not.toHaveBeenCalled();
    }
  );

  it('evaluates consumer events at XDA and returns their exact finalized aggregate without committing', async () => {
    const { sdk, fetch, commit } = setup();
    const request = sdk.forRequest({
      consent: true,
      profile: { id: 'incoming' },
      locale: 'de-DE',
      eventContext: { userAgent: 'request-agent' },
      experienceOptions: { ip: '203.0.113.7', plainText: true, locale: 'fr-FR' },
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
    ] satisfies NonNullable<RuntimeFetchExperienceOptions['personalization']>['events'];
    const original = globalThis.structuredClone(events);
    const builders = [
      vi.spyOn(sdk.eventBuilder, 'buildIdentify'),
      vi.spyOn(sdk.eventBuilder, 'buildTrack'),
      vi.spyOn(sdk.eventBuilder, 'buildPageView'),
    ];
    const { handoff, error, plan } = await request.fetchExperienceForHandoff(
      { experienceId: 'experience', personalization: { events } },
      resolver,
      { routeKey: '/home?sort=popular' }
    );
    expect(error).toBeUndefined();
    expect(plan).toBeDefined();
    expect(commit).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledOnce();
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

  it.each(['fetch', 'resolve'] as const)(
    'retains a usable browser replay after %s failure',
    async (stage) => {
      const { sdk, options, fetch, commit } = setup();
      const failure = new Error('content failed');
      if (stage === 'fetch') fetch.mockRejectedValueOnce(failure);
      else vi.spyOn(sdk, 'resolveExperience').mockRejectedValueOnce(failure);
      const request = sdk.forRequest({ consent: true, profile: { id: 'incoming' } });
      const events = options.personalization.events;
      const { handoff, error, plan } = await request.fetchExperienceForHandoff(
        options,
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
      expect(commit).not.toHaveBeenCalled();
    }
  );

  it('finishes asynchronous identify interception before starting track interception', async () => {
    const { sdk, request, fetch, commit } = setup();
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
    const pending = request.fetchExperienceForHandoff(
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
    const { sdk, request, fetch, commit } = setup();
    const hold = deferred<void>();
    const hook = vi.fn(async (event: OptimizationEventStreamEvent) => {
      await hold.promise;
      return event;
    });
    sdk.interceptors.event.add(hook);
    const pending = request.fetchExperienceForHandoff(
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
    const { request, fetch, commit } = setup();
    const page = request.eventBuilder.buildPageView({
      properties: { url: 'https://example.test/?tag=one&tag=two' },
    });
    const raw = {
      ...page,
      context: { ...page.context, page: { ...page.context.page, query: { tag: ['one', 'two'] } } },
    };
    const original = globalThis.structuredClone(raw);
    const { handoff, plan, error } = await request.fetchExperienceForHandoff(
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
    const { sdk, request, options, fetch, commit } = setup();
    const hook = vi.fn((event: OptimizationEventStreamEvent) => {
      Object.assign(event.context, { gdpr: { isConsentGiven: 'yes' } });
      return event;
    });
    sdk.interceptors.event.add(hook);
    await expect(request.fetchExperienceForHandoff(options, resolver, route)).rejects.toThrow(
      /Invalid Experience personalization options/
    );
    expect(hook).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  });

  it('filters consent-blocked events before interception and preserves admitted replay', async () => {
    const onEventBlocked = vi.fn();
    const { sdk, options, fetch, commit } = setup({ onEventBlocked });
    const denied = sdk.forRequest({ consent: false, profile: { id: 'denied' } });
    const events = [
      ...options.personalization.events,
      sdk.eventBuilder.buildTrack({ event: 'opened' }),
    ];
    const hook = vi.fn((event: OptimizationEventStreamEvent) => event);
    sdk.interceptors.event.add(hook);
    const { handoff: filtered } = await denied.fetchExperienceForHandoff(
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

  it('suppresses preview personalization and commitment while preserving request identity', async () => {
    const { sdk, options, fetch, commit } = setup();
    const request = sdk.forRequest({
      isPreview: true,
      consent: true,
      profile: { id: 'preview-owner' },
    });
    const { handoff } = await request.fetchExperienceForHandoff(options, resolver, route);
    expect(handoff.replay).toBeUndefined();
    expect(handoff.profileId).toBeUndefined();
    expect(request.profile?.id).toBe('preview-owner');
    expect(fetch.mock.calls[0]![0].personalization).toBeUndefined();
    expect(commit).not.toHaveBeenCalled();
  });

  it('returns a private aggregate without synthesizing event intent', async () => {
    const { request, fetch, commit } = setup();
    const { handoff } = await request.fetchExperienceForHandoff(
      { experienceId: 'experience' },
      resolver,
      route
    );
    expect(handoff).toEqual({
      ...scope,
      cache: { scope: 'private-request' },
      profileId: 'xda-profile',
      state: { profile: profileFixture('xda-profile') },
    });
    expect(fetch.mock.calls[0]![0].personalization).toBeUndefined();
    expect(commit).not.toHaveBeenCalled();
  });

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
  it('builds native arguments once, preserves raw intent and never commits through XPAPI', async () => {
    const { sdk, fetch, commit } = setup();
    const request = sdk.forRequest({ consent: true, profile: { id: 'incoming' } });
    const raw = sdk.eventBuilder.buildTrack({ event: 'raw' });
    const events = [
      { type: 'identify', userId: 'user' },
      { type: 'track', event: 'native' },
      { type: 'page', properties: { url: 'https://example.test/home' } },
      raw,
    ] satisfies NonNullable<RuntimeFetchExperienceOptions['personalization']>['events'];
    const original = globalThis.structuredClone(events);
    const builders = [
      vi.spyOn(sdk.eventBuilder, 'buildIdentify'),
      vi.spyOn(sdk.eventBuilder, 'buildTrack'),
      vi.spyOn(sdk.eventBuilder, 'buildPageView'),
    ];
    const hook = vi.fn((event: OptimizationEventStreamEvent) => event);
    sdk.interceptors.event.add(hook);
    const plan = await request.fetchExperience(
      { experienceId: 'experience', personalization: { events } },
      resolver
    );
    for (const builder of builders) expect(builder).toHaveBeenCalledOnce();
    expect(hook).toHaveBeenCalledTimes(events.length);
    expect(fetch).toHaveBeenCalledOnce();
    const sent = fetch.mock.calls[0]![0].personalization;
    expect(sent?.profileId).toBe('incoming');
    expect(sent?.events?.map((event) => event.type)).toEqual([
      'identify',
      'track',
      'page',
      'track',
    ]);
    expect(sent?.events?.[3]).toEqual({
      ...raw,
      context: { ...raw.context, gdpr: { ...raw.context.gdpr, isConsentGiven: true } },
    });
    expect(events).toEqual(original);
    expect(plan.personalization?.profile?.id).toBe('xda-profile');
    expect(request.profile?.id).toBe('xda-profile');
    expect(commit).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'drops native event intent before building under preview=%s',
    async (isPreview) => {
      const onEventBlocked = vi.fn();
      const { sdk, fetch, commit } = setup({ onEventBlocked });
      const build = vi.spyOn(sdk.eventBuilder, 'buildTrack');
      const hook = vi.fn((event: OptimizationEventStreamEvent) => event);
      sdk.interceptors.event.add(hook);
      const request = sdk.forRequest({ isPreview, consent: false, profile: { id: 'incoming' } });
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
      expect(request.profile?.id).toBe(isPreview ? 'incoming' : 'xda-profile');
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
