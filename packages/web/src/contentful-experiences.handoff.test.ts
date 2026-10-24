// @vitest-environment jsdom

import {
  ContentfulExperiences as RuntimeContentfulExperiences,
  PROFILE_CACHE_KEY,
  PersonalizationDelivery,
  type ExperiencesHandoff,
  withEventConsent,
} from '@contentful/experiences-runtime';
import { ExperienceApiClient } from '@contentful/optimization-api-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ContentfulExperiences } from './contentful-experiences.js';
import { seedConsent, clearIdentityCookies } from './test-fixtures/consent.js';

const runtimes = new Set<ContentfulExperiences>();

function createRuntime(profile?: { id: string }): ContentfulExperiences {
  const runtime = new ContentfulExperiences({
    spaceId: 'space',
    environmentId: 'environment',
    locale: 'en-US',
    delivery: { accessToken: 'delivery-token' },
    ...(profile === undefined ? {} : { defaults: { profile } }),
  });
  runtimes.add(runtime);
  return runtime;
}

function handoff(
  runtime: ContentfulExperiences,
  routeKey = '/first?view=one',
  overrides: Partial<ExperiencesHandoff> = {}
): ExperiencesHandoff {
  return {
    spaceId: 'space',
    environmentId: 'environment',
    cache: { scope: 'private-request' },
    profileId: 'server-profile',
    replay: {
      routeKey,
      locale: 'de-DE',
      // Prepared for an opted-in visitor, matching the browser these tests run as.
      events: [
        runtime.eventBuilder.buildTrack({ event: 'prepared' }),
        runtime.eventBuilder.buildPageView(),
      ].map((event) => withEventConsent(event, true)),
    },
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((complete, fail) => {
    resolve = complete;
    reject = fail;
  });
  return { promise, resolve, reject };
}

// Consent is not what these tests are about: run as a visitor who has opted in.
beforeEach(() => {
  seedConsent({ events: true, persistence: true });
});

afterEach(() => {
  for (const runtime of runtimes) runtime.destroy();
  runtimes.clear();
  window.localStorage.clear();
  clearIdentityCookies();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('Web handoff and current-page lifecycle', () => {
  it('joins duplicate and serialized invocations by final page message ID before HTTP completes', async () => {
    const response = deferred<{ profile: { id: string } }>();
    const send = vi
      .spyOn(ExperienceApiClient.prototype, 'upsertProfile')
      .mockReturnValue(response.promise as never);
    const runtime = createRuntime();
    const input = handoff(runtime);
    const copy = JSON.parse(JSON.stringify(input)) as ExperiencesHandoff;

    const first = runtime.hydrateAndTrackCurrentPage(input, { routeKey: '/first?view=one' });
    const second = runtime.hydrateAndTrackCurrentPage(copy, { routeKey: '/first?view=one' });
    await expect(Promise.all([first, second])).resolves.toEqual([
      { accepted: true },
      { accepted: true },
    ]);
    await expect(
      runtime.hydrateAndTrackCurrentPage(copy, { routeKey: '/first?view=one' })
    ).resolves.toEqual({ accepted: true });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(
      { profileId: 'server-profile', events: input.replay?.events },
      { preflight: false, locale: 'de-DE' }
    );
    response.resolve({ profile: { id: 'committed-profile' } });
    await vi.waitFor(() =>
      expect(runtime.states.profile.current).toEqual({ id: 'committed-profile' })
    );
  });

  it('joins state-only hydration with subsequent delivery without reseeding the response profile', async () => {
    const send = vi
      .spyOn(ExperienceApiClient.prototype, 'upsertProfile')
      .mockResolvedValue({ profile: { id: 'api-profile' } } as never);
    const runtime = createRuntime();
    const input = handoff(runtime, '/first', { state: { profile: { id: 'server-state' } } });

    await runtime.hydrateHandoffState(input, { routeKey: '/first' });
    expect(runtime.states.profile.current).toEqual({ id: 'server-state' });
    expect(runtime.states.experienceRequestState.current).toEqual({ status: 'success' });
    expect(send).not.toHaveBeenCalled();
    await expect(
      runtime.hydrateAndTrackCurrentPage(input, { routeKey: '/first' })
    ).resolves.toEqual({
      accepted: true,
    });
    await vi.waitFor(() => expect(runtime.states.profile.current).toEqual({ id: 'api-profile' }));
    await runtime.hydrateHandoffState(input, { routeKey: '/first' });
    expect(runtime.states.profile.current).toEqual({ id: 'api-profile' });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0].profileId).toBe('server-state');
  });

  it('captures the replay target before evaluated state hydration changes the profile', async () => {
    const response = deferred<{ profile: { id: string } }>();
    const send = vi
      .spyOn(ExperienceApiClient.prototype, 'upsertProfile')
      .mockReturnValue(response.promise as never);
    const runtime = createRuntime();
    const input = handoff(runtime, '/first', {
      profileId: 'continuation-id',
      state: { profile: { id: 'evaluated-profile' } },
    });

    await expect(
      runtime.hydrateAndTrackCurrentPage(input, { routeKey: '/first' })
    ).resolves.toEqual({
      accepted: true,
    });
    expect(send.mock.calls[0]?.[0].profileId).toBe('continuation-id');
    expect(runtime.states.profile.current).toEqual({ id: 'evaluated-profile' });
    response.resolve({ profile: { id: 'committed-profile' } });
    await vi.waitFor(() =>
      expect(runtime.states.profile.current).toEqual({ id: 'committed-profile' })
    );
  });

  it('skips mismatched replay and state, and treats search changes as distinct routes', async () => {
    const send = vi
      .spyOn(ExperienceApiClient.prototype, 'upsertProfile')
      .mockResolvedValue({ profile: { id: 'browser-profile' } } as never);
    const runtime = createRuntime({ id: 'browser-profile' });
    const input = handoff(runtime, '/first?view=one', {
      state: { profile: { id: 'stale-profile' } },
    });
    const buildPayload = vi.fn(() => ({ properties: { source: 'current-route' } }));

    await runtime.hydrateHandoffState(input, { routeKey: '/first?view=two' });
    expect(runtime.states.profile.current).toEqual({ id: 'browser-profile' });
    await expect(
      runtime.hydrateAndTrackCurrentPage(input, {
        routeKey: '/first?view=two',
        buildPayload,
      })
    ).resolves.toMatchObject({ accepted: true });
    expect(buildPayload).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0].events).toHaveLength(1);
    expect(send.mock.calls[0]?.[0].events[0]?.messageId).not.toBe(
      input.replay?.events.at(-1)?.messageId
    );
  });

  it('tracks a state-only handoff as an ordinary page and marks later routes noninitial', async () => {
    const send = vi
      .spyOn(ExperienceApiClient.prototype, 'upsertProfile')
      .mockResolvedValue({ profile: { id: 'browser-profile' } } as never);
    const runtime = createRuntime({ id: 'browser-profile' });
    const initialFlags: boolean[] = [];
    const buildPayload = ({ isInitialEmission }: { isInitialEmission: boolean }) => {
      initialFlags.push(isInitialEmission);
      return { properties: { title: isInitialEmission ? 'initial' : 'later' } };
    };

    await expect(
      runtime.hydrateAndTrackCurrentPage(
        { spaceId: 'space', environmentId: 'environment', cache: { scope: 'static' }, state: {} },
        { routeKey: '/first', buildPayload }
      )
    ).resolves.toMatchObject({ accepted: true });
    await expect(
      runtime.trackCurrentPage({ routeKey: '/second', buildPayload })
    ).resolves.toMatchObject({
      accepted: true,
    });
    await expect(runtime.trackCurrentPage({ routeKey: '/second', buildPayload })).resolves.toEqual({
      accepted: false,
    });
    expect(initialFlags).toEqual([true, false]);
    expect(
      send.mock.calls.map(([request]) => {
        const event = request.events[0];
        return event?.type === 'page' ? event.properties?.title : undefined;
      })
    ).toEqual(['initial', 'later']);
  });

  it('allows new handoffs and later visits while deduplicating the accepted current route', async () => {
    const send = vi
      .spyOn(ExperienceApiClient.prototype, 'upsertProfile')
      .mockResolvedValue({ profile: { id: 'browser-profile' } } as never);
    const runtime = createRuntime({ id: 'browser-profile' });
    const first = handoff(runtime, '/first');
    const second = handoff(runtime, '/second');

    await runtime.hydrateAndTrackCurrentPage(first, { routeKey: '/first' });
    await runtime.hydrateAndTrackCurrentPage(handoff(runtime, '/first'), { routeKey: '/first' });
    await runtime.hydrateAndTrackCurrentPage(second, { routeKey: '/second' });
    await runtime.hydrateAndTrackCurrentPage(first, { routeKey: '/first' });
    expect(send).toHaveBeenCalledTimes(4);
    await expect(
      runtime.trackCurrentPage({ routeKey: '/first', buildPayload: () => ({}) })
    ).resolves.toEqual({ accepted: false });
    expect(send).toHaveBeenCalledTimes(4);
    await runtime.page();
    expect(send).toHaveBeenCalledTimes(5);
  });

  it.each([99, 100])(
    'falls back within ordinary capacity guards with %i queued events',
    async (queuedCount) => {
      const send = vi
        .spyOn(ExperienceApiClient.prototype, 'upsertProfile')
        .mockResolvedValue({ profile: { id: 'server-profile' } } as never);
      const runtime = createRuntime();
      window.dispatchEvent(new Event('offline'));
      for (let index = 0; index < queuedCount; index += 1) {
        await expect(runtime.track({ event: `accepted-${index}` })).resolves.toEqual({
          accepted: true,
        });
      }
      const input = handoff(runtime, '/second');
      const buildPayload = vi.fn(() => ({ properties: { title: 'ordinary fallback' } }));
      const ordinaryPage = vi.spyOn(runtime, 'trackCurrentPage');
      const result = await runtime.hydrateAndTrackCurrentPage(input, {
        routeKey: '/second',
        buildPayload,
      });
      expect(result).toEqual({ accepted: queuedCount === 99 });
      expect(result).toBe(await ordinaryPage.mock.results[0]?.value);
      expect(ordinaryPage).toHaveBeenCalledExactlyOnceWith({ routeKey: '/second', buildPayload });
      expect(buildPayload).toHaveBeenCalledExactlyOnceWith({ isInitialEmission: true });
      expect(send).not.toHaveBeenCalled();

      window.dispatchEvent(new Event('online'));
      await vi.waitFor(() =>
        expect(runtime.states.experienceRequestState.current.status).toBe('success')
      );
      expect(send).toHaveBeenCalledTimes(1);
      const request = send.mock.calls[0]?.[0];
      expect(request?.profileId).toBe('server-profile');
      expect(request?.events).toHaveLength(100);
      expect(
        request?.events
          .slice(0, queuedCount)
          .map((event) => (event.type === 'track' ? event.event : undefined))
      ).toEqual(Array.from({ length: queuedCount }, (_, index) => `accepted-${index}`));
      if (queuedCount === 99) {
        expect(request?.events.at(-1)).toMatchObject({
          type: 'page',
          properties: { title: 'ordinary fallback' },
        });
      }
      expect(
        request?.events.some((event) =>
          input.replay?.events.some((prepared) => prepared.messageId === event.messageId)
        )
      ).toBe(false);
    }
  );

  it.each(['identify', 'page', 'track'] as const)(
    'propagates a full offline queue rejection through public %s without losing prepared work',
    async (method) => {
      const response = deferred<{ profile: { id: string } }>();
      const send = vi
        .spyOn(ExperienceApiClient.prototype, 'upsertProfile')
        .mockReturnValue(response.promise as never);
      const runtime = createRuntime({ id: 'browser-profile' });
      window.dispatchEvent(new Event('offline'));
      const events = [
        ...Array.from({ length: 99 }, (_, index) =>
          runtime.eventBuilder.buildTrack({ event: `accepted-${index}` })
        ),
        runtime.eventBuilder.buildPageView(),
      ].map((event) => withEventConsent(event, true));
      await expect(
        runtime.hydrateAndTrackCurrentPage(
          handoff(runtime, '/full', { replay: { routeKey: '/full', events, locale: 'de-DE' } }),
          { routeKey: '/full' }
        )
      ).resolves.toEqual({ accepted: true });
      const rejected =
        method === 'identify'
          ? runtime.identify({ userId: 'rejected-user', traits: { rejected: true } })
          : method === 'page'
            ? runtime.page()
            : runtime.track({ event: 'rejected' });
      await expect(rejected).resolves.toEqual({ accepted: false });
      expect(send).not.toHaveBeenCalled();
      expect(runtime.states.profile.current).toEqual({ id: 'browser-profile' });

      window.dispatchEvent(new Event('online'));
      await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
      expect(send).toHaveBeenCalledWith(
        { profileId: 'browser-profile', events },
        { preflight: false, locale: 'de-DE' }
      );
      response.resolve({ profile: { id: 'browser-profile' } });
    }
  );

  it('falls back once with retained identity for an out-of-order prepared batch', async () => {
    const response = deferred<{ profile: { id: string } }>();
    const send = vi
      .spyOn(ExperienceApiClient.prototype, 'upsertProfile')
      .mockReturnValue(response.promise as never);
    const runtime = createRuntime();
    const events = [
      runtime.eventBuilder.buildPageView(),
      runtime.eventBuilder.buildTrack({ event: 'after-page' }),
    ];
    const input = handoff(runtime, '/invalid', {
      replay: {
        routeKey: '/invalid',
        events: events as NonNullable<ExperiencesHandoff['replay']>['events'],
      },
    });
    const buildPayload = vi.fn(() => ({ properties: { title: 'caller fallback' } }));
    const ordinaryPage = vi.spyOn(runtime, 'trackCurrentPage');
    const first = runtime.hydrateAndTrackCurrentPage(input, {
      routeKey: '/invalid',
      buildPayload,
    });
    const copy = JSON.parse(JSON.stringify(input)) as ExperiencesHandoff;
    const second = runtime.hydrateAndTrackCurrentPage(copy, {
      routeKey: '/invalid',
      buildPayload,
    });
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(send.mock.calls[0]?.[0]).toMatchObject({
      profileId: 'server-profile',
      events: [{ type: 'page', properties: { title: 'caller fallback' } }],
    });
    expect(send.mock.calls[0]?.[0].events).toHaveLength(1);
    expect(events).not.toContainEqual(send.mock.calls[0]?.[0].events[0]);
    expect(buildPayload).toHaveBeenCalledExactlyOnceWith({ isInitialEmission: true });
    expect(ordinaryPage).toHaveBeenCalledExactlyOnceWith({ routeKey: '/invalid', buildPayload });
    response.resolve({ profile: { id: 'committed-profile' } });
    const result = await first;
    expect(result).toEqual({ accepted: true, data: { profile: { id: 'committed-profile' } } });
    expect(result).toBe(await ordinaryPage.mock.results[0]?.value);
    expect(await second).toBe(result);
    expect(
      await runtime.hydrateAndTrackCurrentPage(copy, { routeKey: '/invalid', buildPayload })
    ).toBe(result);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('returns ordinary route deduplication refusal after rejected replay', async () => {
    const send = vi
      .spyOn(ExperienceApiClient.prototype, 'upsertProfile')
      .mockResolvedValue({ profile: { id: 'browser-profile' } } as never);
    const runtime = createRuntime();
    await runtime.trackCurrentPage({ routeKey: '/first', buildPayload: () => ({}) });
    const buildPayload = vi.fn(() => ({}));
    await expect(
      runtime.hydrateAndTrackCurrentPage(
        handoff(runtime, '/first', {
          replay: { routeKey: '/first', events: [] },
        }),
        { routeKey: '/first', buildPayload }
      )
    ).resolves.toEqual({ accepted: false });
    expect(buildPayload).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('keeps state-only hydration strict and rejects invalid envelopes before fallback', async () => {
    const send = vi.spyOn(ExperienceApiClient.prototype, 'upsertProfile');
    const runtime = createRuntime();
    const input = handoff(runtime, '/first', {
      state: { profile: { id: 'evaluated-profile' } },
      replay: { routeKey: '/first', events: [] },
    });
    const buildPayload = vi.fn(() => ({}));
    await expect(runtime.hydrateHandoffState(input, { routeKey: '/first' })).rejects.toThrow();
    for (const invalid of [
      { ...input, spaceId: 'other' },
      { ...input, cache: { scope: 'static' as const } },
      { ...input, replay: { routeKey: 'invalid', events: [] } },
    ]) {
      await expect(
        runtime.hydrateAndTrackCurrentPage(invalid, { routeKey: '/first', buildPayload })
      ).rejects.toThrow();
    }
    expect(runtime.states.profile.current).toBeUndefined();
    expect(buildPayload).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('hydrates applicable state before rejected replay falls back with the default page payload', async () => {
    const send = vi
      .spyOn(ExperienceApiClient.prototype, 'upsertProfile')
      .mockResolvedValue({ profile: { id: 'evaluated-profile' } } as never);
    const runtime = createRuntime();
    const input = handoff(runtime, '/first', {
      state: { profile: { id: 'evaluated-profile' } },
      replay: { routeKey: '/first', events: [] },
    });
    const ordinaryPage = vi.spyOn(runtime, 'trackCurrentPage');
    await expect(
      runtime.hydrateAndTrackCurrentPage(input, { routeKey: '/first' })
    ).resolves.toMatchObject({ accepted: true });
    expect(runtime.states.profile.current?.id).toBe('evaluated-profile');
    expect(send.mock.calls[0]?.[0]).toMatchObject({
      profileId: 'evaluated-profile',
      events: [{ type: 'page' }],
    });
    expect(ordinaryPage.mock.calls[0]?.[0].buildPayload({ isInitialEmission: true })).toEqual({});
  });

  it('does not hydrate mismatched state even when prepared events are invalid', async () => {
    const send = vi
      .spyOn(ExperienceApiClient.prototype, 'upsertProfile')
      .mockResolvedValue({ profile: { id: 'server-profile' } } as never);
    const runtime = createRuntime();
    await runtime.hydrateAndTrackCurrentPage(
      handoff(runtime, '/old', {
        state: { profile: { id: 'stale-profile' } },
        replay: { routeKey: '/old', events: [] },
      }),
      { routeKey: '/current' }
    );
    expect(send.mock.calls[0]?.[0].profileId).toBe('server-profile');
    expect(runtime.states.profile.current?.id).toBe('server-profile');
  });

  it.each(['supersession', 'reset', 'destroy'] as const)(
    'prevents stale fallback when %s occurs after rejected admission',
    async (action) => {
      const send = vi
        .spyOn(ExperienceApiClient.prototype, 'upsertProfile')
        .mockResolvedValue({ profile: { id: 'server-profile' } } as never);
      const runtime = createRuntime();
      const buildPayload = vi.fn(() => ({}));
      const admission = vi
        .spyOn(PersonalizationDelivery.prototype, 'sendPrepared')
        .mockImplementationOnce(() => {
          queueMicrotask(() => {
            if (action === 'supersession') {
              void runtime.hydrateHandoffState(handoff(runtime, '/new'), { routeKey: '/new' });
            } else runtime[action]();
          });
          return { accepted: false };
        });
      await expect(
        runtime.hydrateAndTrackCurrentPage(handoff(runtime, '/old'), {
          routeKey: '/old',
          buildPayload,
        })
      ).resolves.toEqual({ accepted: false });
      expect(admission).toHaveBeenCalledTimes(1);
      expect(buildPayload).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
      if (action === 'supersession') {
        await runtime.page();
        expect(send.mock.calls[0]?.[0].profileId).toBe('server-profile');
      }
    }
  );

  it('keeps accepted replay and its retry after HTTP failure without a fallback page', async () => {
    const response = deferred<{ profile: { id: string } }>();
    const send = vi
      .spyOn(ExperienceApiClient.prototype, 'upsertProfile')
      .mockReturnValueOnce(response.promise as never)
      .mockResolvedValue({ profile: { id: 'server-profile' } } as never);
    const runtime = createRuntime();
    const input = handoff(runtime, '/first');
    const buildPayload = vi.fn(() => ({}));
    await expect(
      runtime.hydrateAndTrackCurrentPage(input, { routeKey: '/first', buildPayload })
    ).resolves.toEqual({ accepted: true });
    response.reject(new Error('HTTP failure'));
    await vi.waitFor(() =>
      expect(runtime.states.experienceRequestState.current.status).toBe('failed')
    );
    await expect(
      runtime.hydrateAndTrackCurrentPage(input, { routeKey: '/first', buildPayload })
    ).resolves.toEqual({ accepted: true });
    expect(send).toHaveBeenCalledTimes(1);
    expect(buildPayload).not.toHaveBeenCalled();
    window.dispatchEvent(new Event('offline'));
    window.dispatchEvent(new Event('online'));
    await vi.waitFor(() =>
      expect(runtime.states.experienceRequestState.current.status).toBe('success')
    );
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1]?.[0].events).toEqual(input.replay?.events);
    expect(buildPayload).not.toHaveBeenCalled();
  });

  it('prevents superseded hydration and reset from publishing state', async () => {
    const runtime = createRuntime();
    const older = handoff(runtime, '/old', { state: { profile: { id: 'old-profile' } } });
    const newer = handoff(runtime, '/new', { state: { profile: { id: 'new-profile' } } });

    const pending = runtime.hydrateHandoffState(older, { routeKey: '/old' });
    await runtime.hydrateHandoffState(newer, { routeKey: '/new' });
    await pending;
    expect(runtime.states.profile.current).toEqual({ id: 'new-profile' });

    const resetting = runtime.hydrateHandoffState(older, { routeKey: '/old' });
    runtime.reset();
    await resetting;
    expect(runtime.states.profile.current).toBeUndefined();
    expect(window.localStorage.getItem(PROFILE_CACHE_KEY)).toBeNull();
  });

  it('does not admit a superseded pending replay', async () => {
    const send = vi
      .spyOn(ExperienceApiClient.prototype, 'upsertProfile')
      .mockResolvedValue({ profile: { id: 'new-profile' } } as never);
    const runtime = createRuntime();
    const old = runtime.hydrateAndTrackCurrentPage(
      handoff(runtime, '/old', {
        profileId: 'old-continuation',
        state: { profile: { id: 'old-profile' } },
      }),
      { routeKey: '/old' }
    );
    const current = runtime.hydrateAndTrackCurrentPage(
      handoff(runtime, '/new', {
        profileId: 'new-continuation',
        state: { profile: { id: 'new-profile' } },
      }),
      { routeKey: '/new' }
    );

    await expect(old).resolves.toEqual({ accepted: false });
    await expect(current).resolves.toEqual({ accepted: true });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0].profileId).toBe('new-continuation');
    expect(send.mock.calls[0]?.[0].events.at(-1)?.type).toBe('page');
    expect(runtime.states.profile.current).toEqual({ id: 'new-profile' });
  });

  it('retains published identity when an ordinary event observes it before supersession', async () => {
    const response = deferred<{ profile: { id: string } }>();
    const send = vi
      .spyOn(ExperienceApiClient.prototype, 'upsertProfile')
      .mockReturnValue(response.promise as never);
    const fetch = vi
      .spyOn(RuntimeContentfulExperiences.prototype, 'fetchExperience')
      .mockResolvedValue({ nodes: [] } as never);
    const runtime = createRuntime();
    const older = handoff(runtime, '/old', {
      profileId: 'old-continuation',
      state: { profile: { id: 'obsolete-evaluated-profile' } },
    });
    const newer = handoff(runtime, '/new', { profileId: 'new-continuation' });
    const hydrationStarted = deferred<void>();
    const releaseHydration = deferred<void>();
    runtime.interceptors.state.add(async (state) => {
      hydrationStarted.resolve();
      await releaseHydration.promise;
      return state;
    });
    const old = runtime.hydrateAndTrackCurrentPage(older, { routeKey: '/old' });
    await hydrationStarted.promise;

    const ordinary = runtime.track({ event: 'between-routes' });
    await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
    expect(send.mock.calls[0]?.[0].profileId).toBe('old-continuation');
    expect(runtime.states.profile.current).toBeUndefined();
    const current = runtime.hydrateAndTrackCurrentPage(newer, { routeKey: '/new' });
    releaseHydration.resolve();
    await expect(old).resolves.toEqual({ accepted: false });
    await expect(current).resolves.toEqual({ accepted: true });
    await runtime.fetchExperience({ experienceId: 'current' }, { config: { components: {} } });
    expect(runtime.states.profile.current).toBeUndefined();
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1]?.[0]).toEqual({
      profileId: 'old-continuation',
      events: newer.replay?.events,
    });
    expect(fetch.mock.calls[0]?.[0]).toMatchObject({
      personalization: { profileId: 'old-continuation' },
    });
    response.resolve({ profile: { id: 'committed-profile' } });
    await ordinary;
  });

  it('retains published continuity when ordinary navigation cancels pending replay', async () => {
    const response = deferred<{ profile: { id: string } }>();
    const send = vi
      .spyOn(ExperienceApiClient.prototype, 'upsertProfile')
      .mockReturnValue(response.promise as never);
    const runtime = createRuntime();
    const old = runtime.hydrateAndTrackCurrentPage(
      handoff(runtime, '/old', { profileId: 'adopted-continuation' }),
      { routeKey: '/old' }
    );
    const current = Promise.resolve().then(() =>
      runtime.trackCurrentPage({ routeKey: '/new', buildPayload: () => ({}) })
    );

    await expect(old).resolves.toEqual({ accepted: false });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0].profileId).toBe('adopted-continuation');
    response.resolve({ profile: { id: 'committed-profile' } });
    await expect(current).resolves.toMatchObject({ accepted: true });
  });

  it('follows supersession while a fetch waits for initialization, without waiting for replay HTTP', async () => {
    const response = deferred<{ profile: { id: string } }>();
    const send = vi
      .spyOn(ExperienceApiClient.prototype, 'upsertProfile')
      .mockReturnValue(response.promise as never);
    const fetch = vi
      .spyOn(RuntimeContentfulExperiences.prototype, 'fetchExperience')
      .mockResolvedValue({ nodes: [] } as never);
    const runtime = createRuntime();
    const old = runtime.hydrateAndTrackCurrentPage(
      handoff(runtime, '/old', { profileId: 'obsolete-id' }),
      { routeKey: '/old' }
    );
    const fetching = runtime.fetchExperience(
      { experienceId: 'current' },
      { config: { components: {} } }
    );
    const current = runtime.hydrateAndTrackCurrentPage(
      handoff(runtime, '/new', { profileId: 'current-id' }),
      { routeKey: '/new' }
    );

    await fetching;
    await expect(old).resolves.toEqual({ accepted: false });
    await expect(current).resolves.toEqual({ accepted: true });
    expect(fetch.mock.calls[0]?.[0]).toMatchObject({
      personalization: { profileId: 'current-id' },
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0].profileId).toBe('current-id');
    response.resolve({ profile: { id: 'committed-profile' } });
  });

  it.each(['reset', 'destroy'] as const)(
    'does not admit a pending prepared replay after %s',
    async (action) => {
      const send = vi.spyOn(ExperienceApiClient.prototype, 'upsertProfile');
      const runtime = createRuntime();
      const pending = runtime.hydrateAndTrackCurrentPage(handoff(runtime, '/first'), {
        routeKey: '/first',
      });

      runtime[action]();
      await expect(pending).resolves.toEqual({ accepted: false });
      expect(send).not.toHaveBeenCalled();
      expect(runtime.states.profile.current).toBeUndefined();
    }
  );

  it.each(['reset', 'destroy'] as const)(
    '%s invalidates published continuation and a fetch waiting on initialization',
    async (action) => {
      const response = deferred<{ profile: { id: string } }>();
      const send = vi
        .spyOn(ExperienceApiClient.prototype, 'upsertProfile')
        .mockReturnValue(response.promise as never);
      const fetch = vi
        .spyOn(RuntimeContentfulExperiences.prototype, 'fetchExperience')
        .mockResolvedValue({ nodes: [] } as never);
      const runtime = createRuntime();
      const hydrationStarted = deferred<void>();
      const releaseHydration = deferred<void>();
      runtime.interceptors.state.add(async (state) => {
        hydrationStarted.resolve();
        await releaseHydration.promise;
        return state;
      });
      const pending = runtime.hydrateAndTrackCurrentPage(
        handoff(runtime, '/old', { state: { profile: undefined } }),
        { routeKey: '/old' }
      );
      await hydrationStarted.promise;
      let fetchResult!: Promise<unknown>;
      send.mockImplementationOnce(() => {
        const fetching = runtime.fetchExperience(
          { experienceId: 'waiting' },
          { config: { components: {} } }
        );
        fetchResult =
          action === 'destroy'
            ? expect(fetching).rejects.toThrow('destroyed')
            : expect(fetching).resolves.toEqual({ nodes: [] });
        runtime[action]();
        return response.promise as never;
      });
      const ordinary = runtime.track({ event: 'published' });
      await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
      expect(send.mock.calls[0]?.[0].profileId).toBe('server-profile');
      releaseHydration.resolve();
      await expect(pending).resolves.toEqual({ accepted: false });
      await fetchResult;
      if (action === 'reset') {
        expect(fetch.mock.calls[0]?.[0]).toEqual({
          experienceId: 'waiting',
          extensions: { sourceMap: {} },
        });
        await expect(
          runtime.hydrateAndTrackCurrentPage(
            handoff(runtime, '/new', { profileId: 'fresh-continuation' }),
            { routeKey: '/new' }
          )
        ).resolves.toEqual({ accepted: true });
        expect(send.mock.calls[1]?.[0].profileId).toBe('fresh-continuation');
      } else {
        expect(fetch).not.toHaveBeenCalled();
        expect(send).toHaveBeenCalledTimes(1);
      }
      response.resolve({ profile: { id: 'late-profile' } });
      await ordinary;
      if (action === 'destroy') expect(runtime.states.profile.current).toBeUndefined();
    }
  );

  it('allows a fresh current-page attempt after reset invalidates an in-flight one', async () => {
    const oldResponse = deferred<{ profile: { id: string } }>();
    const send = vi
      .spyOn(ExperienceApiClient.prototype, 'upsertProfile')
      .mockReturnValueOnce(oldResponse.promise as never)
      .mockResolvedValue({ profile: { id: 'new-profile' } } as never);
    const runtime = createRuntime();
    const oldPage = runtime.trackCurrentPage({ routeKey: '/first', buildPayload: () => ({}) });
    await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
    runtime.reset();
    oldResponse.resolve({ profile: { id: 'old-profile' } });
    await oldPage;

    await expect(
      runtime.trackCurrentPage({ routeKey: '/first', buildPayload: () => ({}) })
    ).resolves.toMatchObject({ accepted: true });
    expect(send).toHaveBeenCalledTimes(2);
    expect(runtime.states.profile.current).toEqual({ id: 'new-profile' });
  });

  it('releases singleton ownership on destroy and rejects later publication', async () => {
    const runtime = createRuntime();
    expect(() => createRuntime()).toThrow();
    const pending = runtime.hydrateHandoffState(
      handoff(runtime, '/first', { state: { profile: { id: 'late' } } }),
      { routeKey: '/first' }
    );
    runtime.destroy();
    runtime.destroy();
    await pending;
    expect(runtime.states.profile.current).toBeUndefined();
    await expect(
      runtime.trackCurrentPage({ routeKey: '/first', buildPayload: () => ({}) })
    ).resolves.toEqual({ accepted: false });
    const replacement = createRuntime();
    expect(replacement.states.profile.current).toBeUndefined();
  });

  it('makes adopted identity visible to a fetch during hydration and ignores stale fetch results', async () => {
    const first = deferred<{ nodes: []; personalization: { profileId: string } }>();
    const second = deferred<{ nodes: []; personalization: { profileId: string } }>();
    const fetch = vi
      .spyOn(RuntimeContentfulExperiences.prototype, 'fetchExperience')
      .mockReturnValueOnce(first.promise as never)
      .mockReturnValueOnce(second.promise as never);
    const send = vi
      .spyOn(ExperienceApiClient.prototype, 'upsertProfile')
      .mockResolvedValue({ profile: { id: 'api-profile' } } as never);
    const runtime = createRuntime();
    const input = handoff(runtime, '/first');

    const hydrating = runtime.hydrateAndTrackCurrentPage(input, { routeKey: '/first' });
    const staleFetch = runtime.fetchExperience(
      { experienceId: 'old' },
      { config: { components: {} } }
    );
    await vi.waitFor(() =>
      expect(fetch.mock.calls[0]?.[0]).toMatchObject({
        personalization: { profileId: 'server-profile' },
      })
    );
    await hydrating;
    runtime.reset();
    const currentFetch = runtime.fetchExperience(
      { experienceId: 'new' },
      { config: { components: {} } }
    );
    await vi.waitFor(() =>
      expect(fetch.mock.calls[1]?.[0]).toEqual({
        experienceId: 'new',
        extensions: { sourceMap: {} },
      })
    );
    second.resolve({ nodes: [], personalization: { profileId: 'new-profile' } });
    await currentFetch;
    first.resolve({ nodes: [], personalization: { profileId: 'stale-profile' } });
    await staleFetch;
    expect(runtime.states.profile.current?.id).toBe('new-profile');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('does not let an earlier XDA response replace a newly adopted continuation ID', async () => {
    const staleResponse = deferred<{ nodes: []; personalization: { profileId: string } }>();
    const fetch = vi
      .spyOn(RuntimeContentfulExperiences.prototype, 'fetchExperience')
      .mockReturnValueOnce(staleResponse.promise as never)
      .mockResolvedValueOnce({ nodes: [] } as never);
    const eventResponse = deferred<{ profile: { id: string } }>();
    vi.spyOn(ExperienceApiClient.prototype, 'upsertProfile').mockReturnValue(
      eventResponse.promise as never
    );
    const runtime = createRuntime();

    const earlierFetch = runtime.fetchExperience(
      { experienceId: 'earlier' },
      { config: { components: {} } }
    );
    await runtime.hydrateAndTrackCurrentPage(handoff(runtime, '/new'), { routeKey: '/new' });
    staleResponse.resolve({ nodes: [], personalization: { profileId: 'stale-profile' } });
    await earlierFetch;
    expect(runtime.states.profile.current).toBeUndefined();
    await runtime.fetchExperience({ experienceId: 'current' }, { config: { components: {} } });
    expect(fetch.mock.calls[1]?.[0]).toMatchObject({
      personalization: { profileId: 'server-profile' },
    });
    eventResponse.resolve({ profile: { id: 'api-profile' } });
  });

  it('does not overwrite browser identity with profileless public or static state', async () => {
    const send = vi.spyOn(ExperienceApiClient.prototype, 'upsertProfile');
    const runtime = createRuntime({ id: 'browser-profile' });
    runtime.interceptors.state.add(() => ({ profile: { id: 'interceptor-profile' } }));
    for (const cache of [
      { scope: 'public-permutation' as const, key: 'experience:en-US:revision' },
      { scope: 'static' as const },
    ]) {
      for (const state of [{}, { profile: undefined }]) {
        await runtime.hydrateHandoffState(
          { spaceId: 'space', environmentId: 'environment', cache, state },
          { routeKey: '/first' }
        );
        expect(runtime.states.profile.current).toEqual({ id: 'browser-profile' });
        expect(runtime.states.experienceRequestState.current).toEqual({ status: 'success' });
      }
    }
    expect(send).not.toHaveBeenCalled();
  });

  it('honors an in-memory explicit profile clear', async () => {
    const runtime = createRuntime({ id: 'browser-profile' });
    await runtime.hydrateHandoffState(
      {
        spaceId: 'space',
        environmentId: 'environment',
        cache: { scope: 'private-request' },
        state: { profile: undefined },
      },
      { routeKey: '/first' }
    );
    expect(runtime.states.profile.current).toBeUndefined();
    expect(window.localStorage.getItem(PROFILE_CACHE_KEY)).toBeNull();
  });

  it('rejects invalid scope and cache before state mutation or transport', async () => {
    const send = vi.spyOn(ExperienceApiClient.prototype, 'upsertProfile');
    const runtime = createRuntime({ id: 'browser-profile' });
    const input = handoff(runtime, '/first', { state: { profile: { id: 'server-profile' } } });

    await expect(
      runtime.hydrateAndTrackCurrentPage({ ...input, spaceId: 'other' }, { routeKey: '/first' })
    ).rejects.toThrow('does not match');
    await expect(
      runtime.hydrateAndTrackCurrentPage(
        { ...input, cache: { scope: 'static' } },
        { routeKey: '/first' }
      )
    ).rejects.toThrow('Profile state');
    expect(runtime.states.profile.current).toEqual({ id: 'browser-profile' });
    expect(send).not.toHaveBeenCalled();
  });

  it('does not mutate a caller-owned render plan when replay delivery finishes', async () => {
    const response = deferred<{ profile: { id: string } }>();
    vi.spyOn(ExperienceApiClient.prototype, 'upsertProfile').mockReturnValue(
      response.promise as never
    );
    const runtime = createRuntime();
    const fetchedPlan = Object.freeze({
      nodes: Object.freeze([]),
      personalization: Object.freeze({ profileId: 'server-profile' }),
    });
    vi.spyOn(RuntimeContentfulExperiences.prototype, 'fetchExperience').mockResolvedValue(
      fetchedPlan as never
    );
    const plan = await runtime.fetchExperience(
      { experienceId: 'first' },
      { config: { components: {} } }
    );
    const input = handoff(runtime, '/first');

    await runtime.hydrateAndTrackCurrentPage(input, { routeKey: '/first' });
    response.resolve({ profile: { id: 'api-profile' } });
    await vi.waitFor(() => expect(runtime.states.profile.current?.id).toBe('api-profile'));
    expect(plan).toEqual({ nodes: [], personalization: { profileId: 'server-profile' } });
  });
});
