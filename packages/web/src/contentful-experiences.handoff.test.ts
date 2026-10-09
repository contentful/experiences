// @vitest-environment jsdom

import {
  ContentfulExperiences as RuntimeContentfulExperiences,
  PROFILE_CACHE_KEY,
  type ExperiencesHandoff,
} from '@contentful/experiences-runtime';
import { ExperienceApiClient } from '@contentful/optimization-api-client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ContentfulExperiences } from './contentful-experiences.js';

const runtimes = new Set<ContentfulExperiences>();

function createRuntime(profile?: { id: string }): ContentfulExperiences {
  const runtime = new ContentfulExperiences({
    spaceId: 'space',
    environmentId: 'environment',
    locale: 'en-US',
    resolverConfig: { components: {} },
    delivery: { accessToken: 'delivery-token' },
    ...(profile === undefined ? {} : { profile }),
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
      events: [
        runtime.eventBuilder.buildTrack({ event: 'prepared' }),
        runtime.eventBuilder.buildPageView(),
      ],
    },
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

afterEach(() => {
  for (const runtime of runtimes) runtime.destroy();
  runtimes.clear();
  window.localStorage.clear();
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
    await vi.waitFor(() => expect(runtime.profile).toEqual({ id: 'committed-profile' }));
  });

  it('joins state-only hydration with subsequent delivery without reseeding the response profile', async () => {
    const send = vi
      .spyOn(ExperienceApiClient.prototype, 'upsertProfile')
      .mockResolvedValue({ profile: { id: 'api-profile' } } as never);
    const runtime = createRuntime();
    const input = handoff(runtime, '/first', { state: { profile: { id: 'server-state' } } });

    await runtime.hydrateHandoffState(input, { routeKey: '/first' });
    expect(runtime.profile).toEqual({ id: 'server-state' });
    expect(send).not.toHaveBeenCalled();
    await expect(
      runtime.hydrateAndTrackCurrentPage(input, { routeKey: '/first' })
    ).resolves.toEqual({
      accepted: true,
    });
    await vi.waitFor(() => expect(runtime.profile).toEqual({ id: 'api-profile' }));
    await runtime.hydrateHandoffState(input, { routeKey: '/first' });
    expect(runtime.profile).toEqual({ id: 'api-profile' });
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
    expect(runtime.profile).toEqual({ id: 'evaluated-profile' });
    response.resolve({ profile: { id: 'committed-profile' } });
    await vi.waitFor(() => expect(runtime.profile).toEqual({ id: 'committed-profile' }));
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
    expect(runtime.profile).toEqual({ id: 'browser-profile' });
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

  it('refuses a capacity-limited prepared batch without a substitute page, then reassesses', async () => {
    const firstResponse = deferred<{ profile: { id: string } }>();
    const send = vi
      .spyOn(ExperienceApiClient.prototype, 'upsertProfile')
      .mockReturnValueOnce(firstResponse.promise as never)
      .mockResolvedValue({ profile: { id: 'browser-profile' } } as never);
    const runtime = createRuntime({ id: 'browser-profile' });
    const fullQueue = [
      ...Array.from({ length: 99 }, () => runtime.eventBuilder.buildTrack({ event: 'bulk' })),
      runtime.eventBuilder.buildPageView(),
    ];
    await runtime.hydrateAndTrackCurrentPage(
      handoff(runtime, '/first', { replay: { routeKey: '/first', events: fullQueue } }),
      { routeKey: '/first' }
    );
    const input = handoff(runtime, '/second');

    await expect(
      runtime.hydrateAndTrackCurrentPage(input, { routeKey: '/second' })
    ).resolves.toEqual({
      accepted: false,
    });
    expect(send).toHaveBeenCalledTimes(1);
    await expect(
      runtime.hydrateAndTrackCurrentPage(input, { routeKey: '/second' })
    ).resolves.toEqual({
      accepted: false,
    });
    expect(send).toHaveBeenCalledTimes(1);
    firstResponse.resolve({ profile: { id: 'browser-profile' } });
    await vi.waitFor(() => expect(runtime.personalizationDeliveryState.status).toBe('success'));
    await expect(
      runtime.hydrateAndTrackCurrentPage(input, { routeKey: '/second' })
    ).resolves.toEqual({ accepted: true });
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(send.mock.calls[1]?.[0].events).toEqual(input.replay?.events);
  });

  it('prevents superseded hydration and reset from publishing state', async () => {
    const runtime = createRuntime();
    const older = handoff(runtime, '/old', { state: { profile: { id: 'old-profile' } } });
    const newer = handoff(runtime, '/new', { state: { profile: { id: 'new-profile' } } });

    const pending = runtime.hydrateHandoffState(older, { routeKey: '/old' });
    await runtime.hydrateHandoffState(newer, { routeKey: '/new' });
    await pending;
    expect(runtime.profile).toEqual({ id: 'new-profile' });

    const resetting = runtime.hydrateHandoffState(older, { routeKey: '/old' });
    runtime.reset();
    await resetting;
    expect(runtime.profile).toBeUndefined();
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
    expect(runtime.profile).toEqual({ id: 'new-profile' });
  });

  it('drops a provisional continuation when superseded between identity and admission', async () => {
    const response = deferred<{ profile: { id: string } }>();
    const send = vi
      .spyOn(ExperienceApiClient.prototype, 'upsertProfile')
      .mockReturnValue(response.promise as never);
    const fetch = vi
      .spyOn(RuntimeContentfulExperiences.prototype, 'fetchExperience')
      .mockResolvedValue({ nodes: [] } as never);
    const runtime = createRuntime();

    const old = runtime.hydrateAndTrackCurrentPage(
      handoff(runtime, '/old', { profileId: 'old-continuation' }),
      { routeKey: '/old' }
    );
    await Promise.resolve(); // Old identity is provisional; its admission has not run.
    const current = runtime.hydrateAndTrackCurrentPage(
      handoff(runtime, '/new', { profileId: 'new-continuation' }),
      { routeKey: '/new' }
    );
    const currentFetch = runtime.fetchExperience({ experienceId: 'current' });

    await expect(old).resolves.toEqual({ accepted: false });
    await expect(current).resolves.toEqual({ accepted: true });
    await currentFetch;
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0].profileId).toBe('new-continuation');
    expect(fetch.mock.calls[0]?.[0]).toMatchObject({
      personalization: { profileId: 'new-continuation' },
    });
    response.resolve({ profile: { id: 'committed-profile' } });
  });

  it('keeps an adopted continuation when a later route supersedes hydration', async () => {
    const response = deferred<{ profile: { id: string } }>();
    const send = vi
      .spyOn(ExperienceApiClient.prototype, 'upsertProfile')
      .mockReturnValue(response.promise as never);
    const runtime = createRuntime();
    const old = runtime.hydrateAndTrackCurrentPage(
      handoff(runtime, '/old', { profileId: 'adopted-continuation' }),
      { routeKey: '/old' }
    );
    await Promise.resolve(); // Selection has run.
    await Promise.resolve(); // The current attempt has begun hydration.
    const current = runtime.hydrateAndTrackCurrentPage(
      handoff(runtime, '/new', { profileId: 'later-server-id' }),
      { routeKey: '/new' }
    );

    await expect(old).resolves.toEqual({ accepted: false });
    await expect(current).resolves.toEqual({ accepted: true });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0].profileId).toBe('adopted-continuation');
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
      expect(runtime.profile).toBeUndefined();
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
    runtime.reset();
    oldResponse.resolve({ profile: { id: 'old-profile' } });
    await oldPage;

    await expect(
      runtime.trackCurrentPage({ routeKey: '/first', buildPayload: () => ({}) })
    ).resolves.toMatchObject({ accepted: true });
    expect(send).toHaveBeenCalledTimes(2);
    expect(runtime.profile).toEqual({ id: 'new-profile' });
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
    expect(runtime.profile).toBeUndefined();
    await expect(
      runtime.trackCurrentPage({ routeKey: '/first', buildPayload: () => ({}) })
    ).resolves.toEqual({ accepted: false });
    const replacement = createRuntime();
    expect(replacement.profile).toBeUndefined();
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
    const staleFetch = runtime.fetchExperience({ experienceId: 'old' });
    await vi.waitFor(() =>
      expect(fetch.mock.calls[0]?.[0]).toMatchObject({
        personalization: { profileId: 'server-profile' },
      })
    );
    await hydrating;
    runtime.reset();
    const currentFetch = runtime.fetchExperience({ experienceId: 'new' });
    await vi.waitFor(() => expect(fetch.mock.calls[1]?.[0]).toEqual({ experienceId: 'new' }));
    second.resolve({ nodes: [], personalization: { profileId: 'new-profile' } });
    await currentFetch;
    first.resolve({ nodes: [], personalization: { profileId: 'stale-profile' } });
    await staleFetch;
    expect(runtime.profile?.id).toBe('new-profile');
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

    const earlierFetch = runtime.fetchExperience({ experienceId: 'earlier' });
    await runtime.hydrateAndTrackCurrentPage(handoff(runtime, '/new'), { routeKey: '/new' });
    staleResponse.resolve({ nodes: [], personalization: { profileId: 'stale-profile' } });
    await earlierFetch;
    expect(runtime.profile).toBeUndefined();
    await runtime.fetchExperience({ experienceId: 'current' });
    expect(fetch.mock.calls[1]?.[0]).toMatchObject({
      personalization: { profileId: 'server-profile' },
    });
    eventResponse.resolve({ profile: { id: 'api-profile' } });
  });

  it('does not overwrite browser identity with profileless public or static state', async () => {
    const send = vi.spyOn(ExperienceApiClient.prototype, 'upsertProfile');
    const runtime = createRuntime({ id: 'browser-profile' });
    for (const cache of [
      { scope: 'public-permutation' as const, key: 'experience:en-US:revision' },
      { scope: 'static' as const },
    ]) {
      for (const state of [{}, { profile: undefined }]) {
        await runtime.hydrateHandoffState(
          { spaceId: 'space', environmentId: 'environment', cache, state },
          { routeKey: '/first' }
        );
        expect(runtime.profile).toEqual({ id: 'browser-profile' });
      }
    }
    expect(send).not.toHaveBeenCalled();
  });

  it('honors an in-memory own-property undefined profile clear without inventing a wire sentinel', async () => {
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
    expect(runtime.profile).toBeUndefined();
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
    expect(runtime.profile).toEqual({ id: 'browser-profile' });
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
    const plan = await runtime.fetchExperience({ experienceId: 'first' });
    const input = handoff(runtime, '/first');

    await runtime.hydrateAndTrackCurrentPage(input, { routeKey: '/first' });
    response.resolve({ profile: { id: 'api-profile' } });
    await vi.waitFor(() => expect(runtime.profile?.id).toBe('api-profile'));
    expect(plan).toEqual({ nodes: [], personalization: { profileId: 'server-profile' } });
  });
});
