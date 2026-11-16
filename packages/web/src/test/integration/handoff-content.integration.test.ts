// @vitest-environment jsdom

import { ExperienceApiClient as PersonalizationApiClient } from '@contentful/optimization-api-client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ContentfulExperiences } from '../../sdk/contentful-experiences.js';
import { clearIdentityCookies, seedConsent } from '../../test/consent.js';
import { deferred } from '../../test/dom.js';
import { completeProfile as profileFixture } from '../../test/fixtures/profile.js';
import { createRuntimeConfig, createRuntimeFactory } from '../../test/runtime-config.js';

import {
  ContentfulExperiences as RuntimeContentfulExperiences,
  withEventConsent,
  type ExperiencesHandoff,
} from '@contentful/experiences-runtime';
import { type Profile as EventProfile } from '@contentful/optimization-api-client/api-schemas';

const runtimes = new Set<ContentfulExperiences>();
const createRuntime = createRuntimeFactory(runtimes, ContentfulExperiences, () =>
  createRuntimeConfig()
);
beforeEach(() => seedConsent({ events: true, persistence: true }));
afterEach(() => {
  for (const runtime of runtimes) runtime.destroy();
  runtimes.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  clearIdentityCookies();
  window.history.replaceState({}, '', '/');
  document.title = '';
});
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

it('follows supersession while a fetch waits for initialization, without waiting for replay HTTP', async () => {
  const response = deferred<{ profile: EventProfile }>();
  const send = vi
    .spyOn(PersonalizationApiClient.prototype, 'upsertProfile')
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
  response.resolve({ profile: profileFixture('committed-profile') });
});

it('destroy invalidates published continuation and a fetch waiting on initialization', async () => {
  const response = deferred<{ profile: EventProfile }>();
  const send = vi
    .spyOn(PersonalizationApiClient.prototype, 'upsertProfile')
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
    fetchResult = expect(fetching).rejects.toThrow('destroyed');
    runtime.destroy();
    return response.promise as never;
  });
  const ordinary = runtime.track({ event: 'published' });
  await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
  expect(send.mock.calls[0]?.[0].profileId).toBe('server-profile');
  releaseHydration.resolve();
  await expect(pending).resolves.toEqual({ accepted: false });
  await fetchResult;
  expect(fetch).not.toHaveBeenCalled();
  expect(send).toHaveBeenCalledTimes(1);
  response.resolve({ profile: profileFixture('late-profile') });
  await ordinary;
  expect(runtime.states.profile.current).toBeUndefined();
});

it('makes adopted identity visible during hydration and rejects stale selected content after reset', async () => {
  const first = deferred<{ nodes: []; personalization: { profile: EventProfile } }>();
  const second = deferred<{ nodes: []; personalization: { profile: EventProfile } }>();
  const fetch = vi
    .spyOn(RuntimeContentfulExperiences.prototype, 'fetchExperience')
    .mockReturnValueOnce(first.promise as never)
    .mockReturnValueOnce(second.promise as never);
  const send = vi
    .spyOn(PersonalizationApiClient.prototype, 'upsertProfile')
    .mockResolvedValue({ profile: profileFixture('api-profile') } as never);
  const runtime = createRuntime();
  const input = handoff(runtime, '/first');

  const hydrating = runtime.hydrateAndTrackCurrentPage(input, { routeKey: '/first' });
  const staleFetch = runtime.fetchExperience(
    { experienceId: 'old' },
    { config: { components: {} } }
  );
  const rejected = expect(staleFetch).rejects.toThrow('superseded');
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
  second.resolve({ nodes: [], personalization: { profile: profileFixture('new-profile') } });
  await currentFetch;
  first.resolve({ nodes: [], personalization: { profile: profileFixture('stale-profile') } });
  await rejected;
  expect(runtime.states.profile.current?.id).toBe('new-profile');
  expect(send).toHaveBeenCalledTimes(1);
});

it('does not let an earlier XDA response replace a newly adopted continuation ID', async () => {
  const staleResponse = deferred<{ nodes: []; personalization: { profile: EventProfile } }>();
  const fetch = vi
    .spyOn(RuntimeContentfulExperiences.prototype, 'fetchExperience')
    .mockReturnValueOnce(staleResponse.promise as never)
    .mockResolvedValueOnce({ nodes: [] } as never);
  const eventResponse = deferred<{ profile: EventProfile }>();
  vi.spyOn(PersonalizationApiClient.prototype, 'upsertProfile').mockReturnValue(
    eventResponse.promise as never
  );
  const runtime = createRuntime();

  const earlierFetch = runtime.fetchExperience(
    { experienceId: 'earlier' },
    { config: { components: {} } }
  );
  const rejected = expect(earlierFetch).rejects.toThrow('superseded');
  await runtime.hydrateAndTrackCurrentPage(handoff(runtime, '/new'), { routeKey: '/new' });
  staleResponse.resolve({
    nodes: [],
    personalization: { profile: profileFixture('stale-profile') },
  });
  await rejected;
  expect(runtime.states.profile.current).toBeUndefined();
  await runtime.fetchExperience({ experienceId: 'current' }, { config: { components: {} } });
  expect(fetch.mock.calls[1]?.[0]).toMatchObject({
    personalization: { profileId: 'server-profile' },
  });
  eventResponse.resolve({ profile: profileFixture('api-profile') });
});

it('does not mutate a caller-owned render plan when replay delivery finishes', async () => {
  const response = deferred<{ profile: EventProfile }>();
  vi.spyOn(PersonalizationApiClient.prototype, 'upsertProfile').mockReturnValue(
    response.promise as never
  );
  const runtime = createRuntime();
  const fetchedPlan = Object.freeze({
    nodes: Object.freeze([]),
    personalization: Object.freeze({ profile: profileFixture('server-profile') }),
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
  response.resolve({ profile: profileFixture('api-profile') });
  await vi.waitFor(() => expect(runtime.states.profile.current?.id).toBe('api-profile'));
  expect(plan).toEqual({
    nodes: [],
    personalization: { profile: profileFixture('server-profile') },
  });
});
