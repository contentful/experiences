// @vitest-environment jsdom

import { ExperienceApiClient as PersonalizationApiClient } from '@contentful/optimization-api-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearIdentityCookies, seedConsent } from '../test/consent.js';
import { deferred } from '../test/dom.js';
import { completeProfile as profileFixture } from '../test/fixtures/profile.js';

import {
  EventBuilder,
  PersonalizationDelivery,
  withEventConsent,
  parseExperiencesHandoffEnvelope,
  DEFAULT_ALLOWED_EVENT_TYPES,
  type AllowedEventType,
  type BlockedEvent,
  type ChangeArray,
  type ExperiencesHandoff,
} from '@contentful/experiences-runtime';
import { type Profile as EventProfile } from '@contentful/optimization-api-client/api-schemas';

import * as signals from '../signals/index.js';
import type { HandoffInitialization } from './types.js';
import { HandoffRuntime } from '../test/handoff-runtime.js';
class TestHandoffRuntime extends HandoffRuntime {
  preview = false;
  override get isPreview() {
    return this.preview;
  }
  override readonly onEventBlocked = vi.fn<(event: BlockedEvent) => void>();
  sendPrepared(...args: Parameters<TestHandoffRuntime['sendPreparedPersonalizationEvents']>) {
    return this.sendPreparedPersonalizationEvents(...args);
  }
  initialize(input: ExperiencesHandoff, routeKey = '/first', current = () => true) {
    return this['getHandoffInitialization'](
      input,
      parseExperiencesHandoffEnvelope(input, this),
      routeKey,
      current
    );
  }
}
const runtimes = new Set<TestHandoffRuntime>();
function createRuntime(
  profile?: EventProfile,
  allowed: readonly AllowedEventType[] = DEFAULT_ALLOWED_EVENT_TYPES
) {
  const runtime = new TestHandoffRuntime(profile, allowed);
  runtimes.add(runtime);
  return runtime;
}
function responseProfile(id = 'server-profile') {
  return vi
    .spyOn(PersonalizationApiClient.prototype, 'upsertProfile')
    .mockResolvedValue({ profile: profileFixture(id) } as never);
}
function pendingResponse() {
  const response = deferred<{ profile: EventProfile }>();
  const send = vi
    .spyOn(PersonalizationApiClient.prototype, 'upsertProfile')
    .mockReturnValue(response.promise as never);
  return { response, send };
}
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
  runtime: HandoffRuntime,
  routeKey = '/first?view=one',
  overrides: Partial<ExperiencesHandoff> = {}
): ExperiencesHandoff {
  const input = handoffWith(
    [
      runtime.eventBuilder.buildTrack({ event: 'prepared' }),
      runtime.eventBuilder.buildPageView(),
    ].map((event) => withEventConsent(event, true)),
    routeKey
  );
  return { ...input, replay: { ...input.replay!, locale: 'de-DE' }, ...overrides };
}

it.each(['refused', 'failed'] as const)(
  'keeps a new same-route attempt pending after reset when the old completes and the new is %s',
  async (outcome) => {
    const runtime = createRuntime();
    const old = deferred<{ accepted: boolean }>();
    const current = deferred<{ accepted: boolean }>();
    const page = vi
      .spyOn(runtime, 'page')
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(current.promise)
      .mockResolvedValue({ accepted: true });
    const initialFlags: boolean[] = [];
    const buildPayload = ({ isInitialEmission }: { isInitialEmission: boolean }) => {
      initialFlags.push(isInitialEmission);
      return {};
    };

    const oldAttempt = runtime.trackCurrentPage({ routeKey: '/same', buildPayload });
    runtime.reset();
    const currentAttempt = runtime.trackCurrentPage({ routeKey: '/same', buildPayload });
    old.resolve({ accepted: true });
    await expect(oldAttempt).resolves.toEqual({ accepted: true });

    await expect(runtime.trackCurrentPage({ routeKey: '/same', buildPayload })).resolves.toEqual({
      accepted: false,
    });
    expect(page).toHaveBeenCalledTimes(2);
    expect(initialFlags).toEqual([true, true]);

    if (outcome === 'refused') {
      current.resolve({ accepted: false });
      await expect(currentAttempt).resolves.toEqual({ accepted: false });
    } else {
      current.reject(new Error('send failed'));
      await expect(currentAttempt).rejects.toThrow('send failed');
    }

    await expect(runtime.trackCurrentPage({ routeKey: '/same', buildPayload })).resolves.toEqual({
      accepted: true,
    });
    expect(page).toHaveBeenCalledTimes(3);
    expect(initialFlags).toEqual([true, true, true]);
  }
);

it('does not admit a scoped fallback page after its caller leaves during interception', async () => {
  const send = vi.spyOn(PersonalizationApiClient.prototype, 'upsertProfile');
  const runtime = createRuntime();
  runtime.consent({ events: false });
  const started = deferred<void>(),
    release = deferred<void>();
  runtime.interceptors.event.add(async (event) => {
    started.resolve();
    await release.promise;
    return event;
  });
  let current = true;
  const input = handoff(runtime, '/scoped');
  const pending = runtime.hydrateAndTrackCurrentPage(input, {
    routeKey: '/scoped',
    isCurrent: () => current,
  });
  await started.promise;
  current = false;
  release.resolve();
  await expect(pending).resolves.toEqual({ accepted: false });
  expect(send).not.toHaveBeenCalled();
  expect(runtime.states.eventStream.current).toBeUndefined();
});

it('records accepted replay even when publication removes its last caller', async () => {
  const send = responseProfile('server-profile');
  const runtime = createRuntime();
  const input = handoff(runtime, '/accepted');
  let current = true;
  const error = new Error('subscriber');
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const subscription = runtime.states.eventStream.subscribe((event) => {
    if (event) {
      current = false;
      throw error;
    }
  });
  await expect(
    runtime.hydrateAndTrackCurrentPage(input, {
      routeKey: '/accepted',
      isCurrent: () => current,
    })
  ).resolves.toEqual({ accepted: true });
  await runtime.flush();
  await expect(
    runtime.hydrateAndTrackCurrentPage(JSON.parse(JSON.stringify(input)), {
      routeKey: '/accepted',
      isCurrent: () => true,
    })
  ).resolves.toEqual({ accepted: false });
  expect(send).toHaveBeenCalledOnce();
  expect(warn).toHaveBeenCalledWith('Event stream subscriber failed', error);
  subscription.unsubscribe();
});

it('does not readmit a supplied aggregate during publication or cancel newer supplied intent', async () => {
  const send = responseProfile('server-profile');
  const runtime = createRuntime();
  const first = handoff(runtime),
    next = handoff(runtime);
  const route = { routeKey: first.replay!.routeKey };
  let newer: Promise<unknown> | undefined, duplicate: Promise<unknown> | undefined;
  const subscription = runtime.states.eventStream.subscribe((event) => {
    if (event?.messageId === first.replay?.events[0]?.messageId) {
      newer = runtime.hydrateAndTrackCurrentPage(next, route);
      duplicate = runtime.hydrateAndTrackCurrentPage(JSON.parse(JSON.stringify(first)), route);
    }
  });
  await runtime.hydrateAndTrackCurrentPage(first, route);
  expect(await duplicate).toEqual({ accepted: false });
  expect(await newer).toEqual({ accepted: true });
  await runtime.flush();
  expect(send.mock.calls.map(([request]) => request.events)).toEqual([
    first.replay?.events,
    next.replay?.events,
  ]);
  subscription.unsubscribe();
});

it('joins duplicate and serialized invocations by final page message ID before HTTP completes', async () => {
  const route = { routeKey: '/first?view=one' };
  const { response, send } = pendingResponse();
  const runtime = createRuntime();
  const input = handoff(runtime);
  const copy = JSON.parse(JSON.stringify(input)) as ExperiencesHandoff;

  const first = runtime.hydrateAndTrackCurrentPage(input, route);
  const second = runtime.hydrateAndTrackCurrentPage(copy, route);
  await expect(Promise.all([first, second])).resolves.toEqual([
    { accepted: true },
    { accepted: true },
  ]);
  await expect(runtime.hydrateAndTrackCurrentPage(copy, route)).resolves.toEqual({
    accepted: true,
  });
  expect(send).toHaveBeenCalledTimes(1);
  expect(send).toHaveBeenCalledWith(
    { profileId: 'server-profile', events: input.replay?.events },
    { preflight: false, locale: 'de-DE' }
  );
  response.resolve({ profile: profileFixture('committed-profile') });
  await vi.waitFor(() =>
    expect(runtime.states.profile.current).toEqual(profileFixture('committed-profile'))
  );
});

it('captures identity before hydration and does not reseed the response profile on repeated consumption', async () => {
  const route = { routeKey: '/first' };
  const { response, send } = pendingResponse();
  const runtime = createRuntime();
  const input = handoff(runtime, '/first', {
    state: { profile: profileFixture('server-state') },
  });

  await expect(runtime.hydrateAndTrackCurrentPage(input, route)).resolves.toEqual({
    accepted: true,
  });
  expect(runtime.states.profile.current).toEqual(profileFixture('server-state'));
  response.resolve({ profile: profileFixture('api-profile') });
  await vi.waitFor(() =>
    expect(runtime.states.profile.current).toEqual(profileFixture('api-profile'))
  );
  await runtime.hydrateAndTrackCurrentPage(input, route);
  expect(runtime.states.profile.current).toEqual(profileFixture('api-profile'));
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0]?.[0].profileId).toBe('server-profile');
});

it('skips mismatched replay and state, and treats search changes as distinct routes', async () => {
  const send = responseProfile('browser-profile');
  const runtime = createRuntime(profileFixture('browser-profile'));
  const input = handoff(runtime, '/first?view=one', {
    state: { profile: profileFixture('stale-profile') },
  });
  await expect(
    runtime.hydrateAndTrackCurrentPage(input, { routeKey: '/current' })
  ).resolves.toEqual({ accepted: false });
  expect(send).not.toHaveBeenCalled();
  const buildPayload = vi.fn(() => ({ properties: { source: 'current-route' } }));

  await expect(
    runtime.hydrateAndTrackCurrentPage(input, {
      routeKey: '/first?view=two',
      buildPayload,
    })
  ).resolves.toMatchObject({ accepted: true });
  expect(buildPayload).toHaveBeenCalledTimes(1);
  expect(runtime.states.profile.current).toEqual(profileFixture('browser-profile'));
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0]?.[0].events).toHaveLength(1);
  expect(send.mock.calls[0]?.[0].events[0]?.messageId).not.toBe(
    input.replay?.events.at(-1)?.messageId
  );
});

it('allows new handoffs and later visits while deduplicating the accepted current route', async () => {
  const send = responseProfile('browser-profile');
  const runtime = createRuntime(profileFixture('browser-profile'));
  const first = handoff(runtime, '/first');
  const second = handoff(runtime, '/second');

  await runtime.hydrateAndTrackCurrentPage(first, { routeKey: '/first' });
  await runtime.hydrateAndTrackCurrentPage(handoff(runtime, '/first'), { routeKey: '/first' });
  await runtime.hydrateAndTrackCurrentPage(second, { routeKey: '/second' });
  await expect(runtime.hydrateAndTrackCurrentPage(first, { routeKey: '/first' })).resolves.toEqual({
    accepted: false,
  });
  expect(send).toHaveBeenCalledTimes(3);
  await expect(
    runtime.trackCurrentPage({ routeKey: '/first', buildPayload: () => ({}) })
  ).resolves.toMatchObject({ accepted: true });
  expect(send).toHaveBeenCalledTimes(4);
  await runtime.page();
  expect(send).toHaveBeenCalledTimes(5);
});

it.each([false, true])(
  'falls back once from invalid replay with explicit payload=%s',
  async (explicit) => {
    const { response, send } = pendingResponse();
    const runtime = createRuntime();
    const events = [
      runtime.eventBuilder.buildPageView(),
      explicit
        ? runtime.eventBuilder.buildTrack({ event: 'after-page' })
        : runtime.eventBuilder.buildPageView(),
    ];
    const input = handoff(runtime, '/invalid', {
      ...(explicit ? {} : { state: { profile: profileFixture('evaluated-profile') } }),
      replay: {
        routeKey: '/invalid',
        events: events as NonNullable<ExperiencesHandoff['replay']>['events'],
      },
    });
    const buildPayload = vi.fn(() => ({ properties: { title: 'caller fallback' } }));
    const route = { routeKey: '/invalid', ...(explicit ? { buildPayload } : {}) };
    const ordinaryPage = vi.spyOn(runtime, 'trackCurrentPage');
    const first = runtime.hydrateAndTrackCurrentPage(input, route);
    const copy = JSON.parse(JSON.stringify(input)) as ExperiencesHandoff;
    const second = runtime.hydrateAndTrackCurrentPage(copy, route);
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(send.mock.calls[0]?.[0]).toMatchObject({
      profileId: explicit ? 'server-profile' : 'evaluated-profile',
      events: [{ type: 'page', ...(explicit ? { properties: { title: 'caller fallback' } } : {}) }],
    });
    expect(send.mock.calls[0]?.[0].events).toHaveLength(1);
    expect(events).not.toContainEqual(send.mock.calls[0]?.[0].events[0]);
    if (explicit) expect(buildPayload).toHaveBeenCalledExactlyOnceWith({ isInitialEmission: true });
    else {
      expect(runtime.states.profile.current?.id).toBe('evaluated-profile');
      expect(ordinaryPage.mock.calls[0]?.[0].buildPayload({ isInitialEmission: true })).toEqual({});
    }
    expect(ordinaryPage).toHaveBeenCalledExactlyOnceWith({
      routeKey: '/invalid',
      buildPayload: explicit ? buildPayload : expect.any(Function),
      isCurrent: expect.any(Function),
    });
    response.resolve({ profile: profileFixture('committed-profile') });
    const result = await first;
    expect(result).toEqual({
      accepted: true,
      data: { profile: profileFixture('committed-profile') },
    });
    expect(result).toBe(await ordinaryPage.mock.results[0]?.value);
    expect(await second).toBe(result);
    expect(await runtime.hydrateAndTrackCurrentPage(copy, route)).toBe(result);
    expect(send).toHaveBeenCalledTimes(1);
  }
);

it('returns ordinary route deduplication refusal after rejected page-bearing replay', async () => {
  const send = responseProfile('browser-profile');
  const runtime = createRuntime();
  await runtime.trackCurrentPage({ routeKey: '/first', buildPayload: () => ({}) });
  const buildPayload = vi.fn(() => ({}));
  await expect(
    runtime.hydrateAndTrackCurrentPage(
      handoff(runtime, '/first', {
        replay: {
          routeKey: '/first',
          events: [runtime.eventBuilder.buildPageView(), runtime.eventBuilder.buildPageView()],
        },
      }),
      { routeKey: '/first', buildPayload }
    )
  ).resolves.toEqual({ accepted: false });
  expect(buildPayload).not.toHaveBeenCalled();
  expect(send).toHaveBeenCalledTimes(1);
});

it('rejects invalid envelopes before internal hydration or fallback', async () => {
  const send = vi.spyOn(PersonalizationApiClient.prototype, 'upsertProfile');
  const runtime = createRuntime();
  const input = handoff(runtime, '/first', {
    state: { profile: profileFixture('evaluated-profile') },
    replay: { routeKey: '/first', events: [] },
  });
  const buildPayload = vi.fn(() => ({}));
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

it.each([
  { type: 'identify', accepted: true },
  { type: 'identify', accepted: false },
  { type: 'track', accepted: true },
  { type: 'track', accepted: false },
] as const)(
  'keeps $type-only replay page-free with admission=$accepted',
  async ({ type, accepted }) => {
    const response = deferred<{ profile: EventProfile }>();
    const send = vi
      .spyOn(PersonalizationApiClient.prototype, 'upsertProfile')
      .mockReturnValueOnce(response.promise as never)
      .mockResolvedValue({ profile: profileFixture('server-profile') } as never);
    const runtime = createRuntime();
    const event = withEventConsent(
      type === 'identify'
        ? runtime.eventBuilder.buildIdentify({ userId: 'visitor' })
        : runtime.eventBuilder.buildTrack({ event: 'opened' }),
      true
    );
    const input = handoff(runtime, '/first', {
      replay: { routeKey: '/first', locale: 'de-DE', events: [event] },
    });
    const before = globalThis.structuredClone(input);
    const buildPayload = vi.fn(() => ({}));
    const route = { routeKey: '/first', buildPayload };

    const admission = vi.spyOn(PersonalizationDelivery.prototype, 'sendPrepared');
    if (!accepted) admission.mockReturnValue({ accepted: false });
    await expect(runtime.hydrateAndTrackCurrentPage(input, route)).resolves.toEqual({ accepted });
    expect(admission).toHaveBeenCalledOnce();
    expect(buildPayload).not.toHaveBeenCalled();
    if (!accepted) {
      expect(send).not.toHaveBeenCalled();
      return;
    }
    await expect(
      runtime.hydrateAndTrackCurrentPage(JSON.parse(JSON.stringify(input)), route)
    ).resolves.toEqual({ accepted: true });
    expect(send).toHaveBeenCalledExactlyOnceWith(
      { profileId: 'server-profile', events: [event] },
      { preflight: false, locale: 'de-DE' }
    );
    expect(buildPayload).not.toHaveBeenCalled();
    expect(input).toEqual(before);
    response.resolve({ profile: profileFixture('server-profile') });
    await vi.waitFor(() =>
      expect(runtime.states.personalizationRequestState.current.status).toBe('success')
    );

    await expect(runtime.trackCurrentPage(route)).resolves.toMatchObject({ accepted: true });
    expect(buildPayload).toHaveBeenCalledExactlyOnceWith({ isInitialEmission: true });
    expect(send.mock.calls[1]?.[0].events.map(({ type }) => type)).toEqual(['page']);
  }
);

it.each(['absent', 'empty', 'static'] as const)(
  'hydrates an %s replay without inventing a page, but permits explicit page intent',
  async (replay) => {
    const send = responseProfile('evaluated-profile');
    const runtime = createRuntime(
      replay === 'static' ? profileFixture('evaluated-profile') : undefined
    );
    const input = handoff(runtime, '/first', {
      state: { profile: profileFixture('evaluated-profile') },
      replay: replay === 'empty' ? { routeKey: '/first', events: [] } : undefined,
      ...(replay === 'static'
        ? { cache: { scope: 'static' as const }, state: {}, profileId: undefined }
        : {}),
    });

    await expect(
      runtime.hydrateAndTrackCurrentPage(input, { routeKey: '/first' })
    ).resolves.toEqual({ accepted: false });
    expect(runtime.states.profile.current).toEqual(profileFixture('evaluated-profile'));
    expect(runtime.states.personalizationRequestState.current).toEqual({ status: 'success' });
    expect(send).not.toHaveBeenCalled();
    const buildPayload = vi.fn(({ isInitialEmission }: { isInitialEmission: boolean }) => ({
      properties: { title: isInitialEmission ? 'explicit' : 'later' },
    }));
    await expect(
      runtime.hydrateAndTrackCurrentPage(input, { routeKey: '/first', buildPayload })
    ).resolves.toMatchObject({ accepted: true });
    expect(buildPayload).toHaveBeenCalledExactlyOnceWith({ isInitialEmission: true });
    expect(send.mock.calls[0]?.[0]).toMatchObject({
      profileId: 'evaluated-profile',
      events: [{ type: 'page', properties: { title: 'explicit' } }],
    });
    expect(send.mock.calls[0]?.[0].events).toHaveLength(1);
    const laterRoute = { routeKey: '/second', buildPayload };
    await expect(runtime.trackCurrentPage(laterRoute)).resolves.toMatchObject({ accepted: true });
    await expect(runtime.trackCurrentPage(laterRoute)).resolves.toEqual({ accepted: false });
    expect(buildPayload.mock.calls.map(([args]) => args.isInitialEmission)).toEqual([true, false]);
    expect(send.mock.calls.map(([request]) => request.events[0])).toMatchObject([
      { properties: { title: 'explicit' } },
      { properties: { title: 'later' } },
    ]);
  }
);

it.each(['supersession', 'reset', 'destroy'] as const)(
  'prevents stale fallback when %s occurs after rejected admission',
  async (action) => {
    const send = responseProfile('server-profile');
    const runtime = createRuntime();
    const buildPayload = vi.fn(() => ({}));
    const admission = vi
      .spyOn(PersonalizationDelivery.prototype, 'sendPrepared')
      .mockImplementationOnce(() => {
        queueMicrotask(() => {
          if (action === 'supersession') {
            void runtime.hydrateAndTrackCurrentPage(
              handoff(runtime, '/new', { replay: undefined }),
              { routeKey: '/new' }
            );
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
  const response = deferred<{ profile: EventProfile }>();
  const send = vi
    .spyOn(PersonalizationApiClient.prototype, 'upsertProfile')
    .mockReturnValueOnce(response.promise as never)
    .mockResolvedValue({ profile: profileFixture('server-profile') } as never);
  const runtime = createRuntime();
  const input = handoff(runtime, '/first');
  const buildPayload = vi.fn(() => ({}));
  const route = { routeKey: '/first', buildPayload };
  await expect(runtime.hydrateAndTrackCurrentPage(input, route)).resolves.toEqual({
    accepted: true,
  });
  response.reject(new Error('HTTP failure'));
  await vi.waitFor(() =>
    expect(runtime.states.personalizationRequestState.current.status).toBe('failed')
  );
  await expect(runtime.hydrateAndTrackCurrentPage(input, route)).resolves.toEqual({
    accepted: true,
  });
  expect(send).toHaveBeenCalledTimes(1);
  expect(buildPayload).not.toHaveBeenCalled();
  runtime.setOnline(false);
  runtime.setOnline(true);
  await vi.waitFor(() =>
    expect(runtime.states.personalizationRequestState.current.status).toBe('success')
  );
  expect(send).toHaveBeenCalledTimes(2);
  expect(send.mock.calls[1]?.[0].events).toEqual(input.replay?.events);
  expect(buildPayload).not.toHaveBeenCalled();
});

it.each(['supersession', 'reset', 'destroy'] as const)(
  'does not admit pending replay after %s',
  async (action) => {
    const send = responseProfile('new-profile');
    const runtime = createRuntime();
    const old = runtime.hydrateAndTrackCurrentPage(
      handoff(runtime, '/old', {
        profileId: 'old-continuation',
        state: { profile: profileFixture('old-profile') },
      }),
      { routeKey: '/old' }
    );
    if (action !== 'supersession') {
      runtime[action]();
      await expect(old).resolves.toEqual({ accepted: false });
      expect(send).not.toHaveBeenCalled();
      expect(runtime.states.profile.current).toBeUndefined();
      return;
    }
    const current = runtime.hydrateAndTrackCurrentPage(
      handoff(runtime, '/new', {
        profileId: 'new-continuation',
        state: { profile: profileFixture('new-profile') },
      }),
      { routeKey: '/new' }
    );

    await expect(old).resolves.toEqual({ accepted: false });
    await expect(current).resolves.toEqual({ accepted: true });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0].profileId).toBe('new-continuation');
    expect(send.mock.calls[0]?.[0].events.at(-1)?.type).toBe('page');
    expect(runtime.states.profile.current).toEqual(profileFixture('new-profile'));
  }
);

it('retains published continuity when ordinary navigation cancels pending replay', async () => {
  const { response, send } = pendingResponse();
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
  response.resolve({ profile: profileFixture('committed-profile') });
  await expect(current).resolves.toMatchObject({ accepted: true });
});

function handoffWith(
  events: NonNullable<ExperiencesHandoff['replay']>['events'],
  routeKey = '/first'
): ExperiencesHandoff {
  return {
    spaceId: 'space',
    environmentId: 'environment',
    cache: { scope: 'private-request' },
    profileId: 'server-profile',
    replay: { routeKey, events },
  };
}

it.each([false, true])(
  'keeps blocked nonpage replay dropped after grant and newer intent=%s',
  async (newerIntent) => {
    window.localStorage.clear();
    vi.spyOn(PersonalizationApiClient.prototype, 'upsertProfile').mockResolvedValue({
      profile: profileFixture('delivered'),
    } as never);
    const runtime = createRuntime();
    const upsert = vi.mocked(PersonalizationApiClient.prototype.upsertProfile);
    const events = [server.buildTrack({ event: 'prepared' }), server.buildPageView()].filter(
      (event) => event.type === 'track'
    );
    const blocked = handoffWith(events);
    const route = { routeKey: '/first' };
    await expect(runtime.hydrateAndTrackCurrentPage(blocked, route)).resolves.toEqual({
      accepted: false,
    });
    runtime.consent({ events: true });
    if (newerIntent)
      await runtime.hydrateAndTrackCurrentPage(
        handoffWith([server.buildTrack({ event: 'prepared' }), server.buildPageView()]),
        route
      );
    await expect(
      runtime.hydrateAndTrackCurrentPage(JSON.parse(JSON.stringify(blocked)), route)
    ).resolves.toEqual({ accepted: false });
    await runtime.flush();
    const sent = upsert.mock.calls.flatMap(([request]) => request.events);
    expect(sent.some((event) => event.messageId === events[0]?.messageId)).toBe(false);
    expect(upsert).toHaveBeenCalledTimes(newerIntent ? 1 : 0);
  }
);

it('retains the normal page exception through explicit denial and grant after a blocked mixed replay', async () => {
  const route = { routeKey: '/first' };
  window.localStorage.clear();
  vi.spyOn(PersonalizationApiClient.prototype, 'upsertProfile').mockResolvedValue({
    profile: profileFixture('delivered'),
  } as never);
  const runtime = createRuntime(undefined, []);
  const upsert = vi.mocked(PersonalizationApiClient.prototype.upsertProfile);
  const events = [server.buildTrack({ event: 'prepared' }), server.buildPageView()];
  const blocked = handoffWith(events);
  await expect(runtime.hydrateAndTrackCurrentPage(blocked, route)).resolves.toEqual({
    accepted: false,
  });
  runtime.consent({ events: false });
  runtime.consent({ events: true });
  await expect(runtime.hydrateAndTrackCurrentPage(blocked, route)).resolves.toMatchObject({
    accepted: true,
  });
  expect(upsert.mock.calls[0]?.[0].events.map((event) => event.type)).toEqual(['page']);
  expect(events.map((event) => event.messageId)).not.toContain(
    upsert.mock.calls[0]?.[0].events[0]?.messageId
  );
});

it('keeps shared pending consumption alive for another current caller', async () => {
  const send = responseProfile('server-profile');
  const runtime = createRuntime();
  const started = deferred<void>(),
    release = deferred<void>();
  runtime.interceptors.state.add(async (state) => {
    started.resolve();
    await release.promise;
    return state;
  });
  const input = handoff(runtime, '/shared', {
    state: { profile: profileFixture('server-profile') },
  });
  let firstCurrent = true,
    secondCurrent = true;
  const first = runtime.hydrateAndTrackCurrentPage(input, {
    routeKey: '/shared',
    isCurrent: () => firstCurrent,
  });
  await started.promise;
  const second = runtime.hydrateAndTrackCurrentPage(globalThis.structuredClone(input), {
    routeKey: '/shared',
    isCurrent: () => secondCurrent,
  });
  const initialization = runtime['currentInitialization']!;
  firstCurrent = false;
  expect(initialization.isCurrent()).toBe(true);
  await expect(
    runtime.hydrateAndTrackCurrentPage(handoff(runtime, '/stale'), {
      routeKey: '/stale',
      isCurrent: () => false,
    })
  ).resolves.toEqual({ accepted: false });
  release.resolve();
  await expect(Promise.all([first, second])).resolves.toEqual([
    { accepted: true },
    { accepted: true },
  ]);
  await runtime.flush();
  expect(send).toHaveBeenCalledOnce();
  expect(runtime.states.profile.current?.id).toBe('server-profile');
  secondCurrent = false;
  expect(initialization.isCurrent()).toBe(false);
});

const server = new EventBuilder({
  channel: 'server',
  library: { name: 'test', version: '1' },
  getConsent: () => true,
});
function initialization(): HandoffInitialization {
  return { key: 'message', routeKey: '/', callers: new Set(), isCurrent: () => true };
}
function initializationInput(
  messageId: string,
  type: 'page' | 'track' = 'page'
): ExperiencesHandoff {
  const event = type === 'page' ? server.buildPageView() : server.buildTrack({ event: 'prepared' });
  return handoffWith([{ ...event, messageId }]);
}
const flagChanges = (value: boolean): ChangeArray => [
  { type: 'Variable', key: 'banner', value, meta: { experienceId: 'experiment', variantIndex: 1 } },
];
function createAdmission(allowed: readonly AllowedEventType[] = DEFAULT_ALLOWED_EVENT_TYPES) {
  const runtime = createRuntime(undefined, allowed);
  signals.consent.value = undefined;
  const send = vi
    .spyOn(runtime['personalizationQueue'], 'sendPrepared')
    .mockReturnValue({ accepted: true });
  return { runtime, send, report: runtime.onEventBlocked };
}
describe('handoff initialization ownership', () => {
  it.each(['page', 'track'] as const)(
    'does not reactivate a consumed serialized %s identity after newer work',
    (type) => {
      const state = createRuntime(),
        a = initializationInput('a', type),
        b = initializationInput('b', type);
      const first = state.initialize(a, '/first', () => true);
      state['consumedHandoffs'].add('a');
      const current = state.initialize(b, '/next', () => true);
      const copy: ExperiencesHandoff = globalThis.structuredClone(a);
      const old = state.initialize(copy, '/first', () => true);
      expect(first.isCurrent()).toBe(false);
      expect(old.isCurrent()).toBe(false);
      expect(current.isCurrent()).toBe(true);
    }
  );

  it('captures a fresh owner only after joined caller checks and refuses that owner after invalidation', () => {
    const state = createRuntime(),
      original = initializationInput('same');
    let expireOnCheck = false;
    state.initialize(original, '/first', () => {
      if (expireOnCheck) {
        state['resetToken'] = {};
        return false;
      }
      return true;
    });
    expireOnCheck = true;
    const next = state.initialize(original, '/first', () => true);
    expect(next.isCurrent()).toBe(true);
    state['resetToken'] = {};
    expect(next.isCurrent()).toBe(false);
  });

  it('retains matching route work and clears stale history/current-page ownership at reset', () => {
    const state = createRuntime(),
      original = initializationInput('same');
    const first = state.initialize(original, '/first', () => true);
    state['clearHandoffInitialization']('/first');
    expect(first.isCurrent()).toBe(true);
    state['clearHandoffInitialization']('/second');
    expect(first.isCurrent()).toBe(false);
    state['consumedHandoffs'].add('same');
    state['currentPage'].markAccepted('/first');
    state.reset();
    const next = state.initialize(original, '/first', () => true);
    expect(next.isCurrent()).toBe(true);
    expect(state['currentPage'].hasAccepted()).toBe(false);
  });

  it('waits for identity before hydration and follows a superseding initialization without replay delivery', async () => {
    const state = createRuntime(),
      a = initializationInput('a'),
      b = initializationInput('b');
    const first = state.initialize(a, '/first', () => true);
    const identity = deferred<string | undefined>(),
      hydration = deferred<void>(),
      secondIdentity = deferred<string | undefined>();
    first.identityReady = identity.promise;
    first.hydration = hydration.promise;
    const waiting = state['awaitCurrentHandoffIdentity']();
    const second = state.initialize(b, '/next', () => true);
    second.identityReady = secondIdentity.promise;
    identity.resolve('old');
    let settled = false;
    void waiting?.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    secondIdentity.resolve('current');
    await waiting;
    expect(settled).toBe(true);
    hydration.resolve();
  });

  it('uses hydration readiness when identity is absent and exposes readiness errors unchanged', async () => {
    const state = createRuntime(),
      original = initializationInput('a');
    expect(state['awaitCurrentHandoffIdentity']()).toBeUndefined();
    const current = state.initialize(original, '/first', () => true);
    const hydration = deferred<void>();
    current.hydration = hydration.promise;
    const waiting = state['awaitCurrentHandoffIdentity'](),
      error = new Error('hydration');
    const rejected = expect(waiting).rejects.toBe(error);
    hydration.reject(error);
    await rejected;
    state['clearHandoffInitialization']();
    expect(state['awaitCurrentHandoffIdentity']()).toBeUndefined();
  });
});

describe('WebHandoffRuntime state hydration', () => {
  it.each(['public-permutation', 'static', 'private-request'] as const)(
    'limits invented hydration state to %s cache permissions',
    async (scope) => {
      const state = createRuntime(profileFixture('visitor'));
      signals.changes.value = flagChanges(true);
      state.interceptors.state.add(() => ({
        profile: profileFixture('invented'),
        changes: flagChanges(false),
      }));
      await state['hydrateHandoffState'](
        {
          spaceId: 'space',
          environmentId: 'environment',
          cache: scope === 'public-permutation' ? { scope, key: 'permutation' } : { scope },
          ...(scope === 'private-request' ? { state: { changes: flagChanges(false) } } : {}),
        },
        initialization()
      );
      expect(state.states.profile.current).toEqual(profileFixture('visitor'));
      expect(signals.changes.value).toEqual(
        scope === 'private-request' ? flagChanges(false) : flagChanges(true)
      );
      expect(state.states.personalizationRequestState.current).toEqual({ status: 'success' });
    }
  );
});

it('validates the complete prepared input before reporting, history reservation or queue delegation', async () => {
  const { runtime, report, send } = createAdmission([]);
  await expect(
    runtime.sendPrepared(
      [server.buildTrack({ event: 'blocked' }), { ...server.buildPageView(), context: null }],
      undefined,
      undefined,
      initialization()
    )
  ).resolves.toEqual({ accepted: false });
  expect(report).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
  expect(runtime['consumedHandoffs'].has('message')).toBe(false);
});

it('reserves consent refusal before blocked callbacks and rolls history back only for queue refusal', async () => {
  const { runtime, send, report } = createAdmission([]);
  report.mockImplementation(() => {
    expect(runtime['consumedHandoffs'].has('message')).toBe(true);
  });
  await runtime.sendPrepared([server.buildPageView()], undefined, undefined, initialization());
  expect(runtime['consumedHandoffs'].has('message')).toBe(true);
  signals.consent.value = true;
  send.mockReturnValue({ accepted: false });
  const second = { ...initialization(), key: 'queue-refused' };
  await expect(
    runtime.sendPrepared([server.buildPageView()], 'target', undefined, second)
  ).resolves.toEqual({ accepted: false });
  expect(runtime['consumedHandoffs'].has('queue-refused')).toBe(false);
  expect(runtime['consumedHandoffs'].has('message')).toBe(true);
  expect(runtime['adoptedProfileId'].value).toBeUndefined();
  send.mockImplementation(() => {
    expect(runtime['consumedHandoffs'].has('queue-refused')).toBe(true);
    expect(runtime['adoptedProfileId'].value).toBeUndefined();
    return { accepted: true };
  });
  await expect(
    runtime.sendPrepared([server.buildPageView()], 'target', undefined, second)
  ).resolves.toEqual({ accepted: true });
  expect(runtime['adoptedProfileId'].value).toBe('target');
});

it('preserves adopted identity when replay has no target and rejects preview before validation', async () => {
  const { runtime, report, send } = createAdmission();
  signals.profile.value = profileFixture('visitor');
  const handoff = { ...handoffWith([]), profileId: 'server' };
  expect(runtime['adoptHandoffIdentity'](handoff, () => true)).toBe('visitor');
  signals.profile.value = undefined;
  const anonymousId = vi.fn<() => string | undefined>(() => 'external');
  runtime['getAnonymousIdProvider'] = anonymousId;
  expect(runtime['adoptHandoffIdentity'](handoff, () => true)).toBe('external');
  anonymousId.mockReturnValue(undefined);
  expect(runtime['adoptHandoffIdentity'](handoff, () => true)).toBe('server');
  expect(
    runtime['adoptHandoffIdentity']({ ...handoff, profileId: 'expired' }, () => false)
  ).toBeUndefined();
  expect(runtime['requestIdentity']()).toBe('server');
  runtime['setAdoptedProfileId']('existing');
  await runtime.sendPrepared([server.buildPageView()]);
  expect(runtime['adoptedProfileId'].value).toBe('existing');
  runtime.preview = true;
  await expect(runtime.sendPrepared([null])).resolves.toEqual({
    accepted: false,
    reason: 'preview',
  });
  expect(report).toHaveBeenCalledExactlyOnceWith({
    reason: 'preview',
    method: 'sendPreparedPersonalizationEvents',
    args: [[null]],
  });
  runtime.destroy();
  await expect(runtime.sendPrepared([null])).resolves.toEqual({ accepted: false });
  expect(report).toHaveBeenCalledOnce();
  expect(send).toHaveBeenCalledOnce();
});

it('uses real queue publication on the same owner and lets withdrawal purge replay before transport', async () => {
  const runtime = createRuntime();
  runtime.setOnline(false);
  const request = vi.spyOn(runtime.api.personalization, 'upsertProfile');
  const subscription = runtime.states.eventStream.subscribe((event) => {
    if (event !== undefined) {
      expect(runtime['consumedHandoffs'].has('message')).toBe(true);
      runtime['withdrawEventConsent']();
    }
  });
  try {
    await expect(
      runtime.sendPrepared([server.buildPageView()], 'target', undefined, initialization())
    ).resolves.toEqual({ accepted: false });
    expect(runtime['personalizationQueue'].queuedEventCount).toBe(0);
    expect(request).not.toHaveBeenCalled();
    expect(runtime['adoptedProfileId'].value).toBeUndefined();
  } finally {
    subscription.unsubscribe();
  }
});
