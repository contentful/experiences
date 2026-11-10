import { preparedEvents, serverEventBuilder } from '../test/fixtures/prepared-events.js';
// @vitest-environment jsdom

import {
  PROFILE_CACHE_KEY,
  PersonalizationDelivery,
  ContentfulExperiences as RuntimeContentfulExperiences,
  withEventConsent,
  type ExperiencesHandoff,
} from '@contentful/experiences-runtime';
import { ExperienceApiClient as PersonalizationApiClient } from '@contentful/optimization-api-client';
import type { Profile as EventProfile } from '@contentful/optimization-api-client/api-schemas';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContentfulExperiences } from '../contentful-experiences.js';
import { deferred } from '../test/dom.js';
import { clearIdentityCookies, seedConsent } from '../test/fixtures/consent.js';
import { completeProfile as profileFixture } from '../test/fixtures/profile.js';
import { createSdkHarness } from '../test/sdk-harness.js';

describe('handoff', () => {
  function createRuntime(profile?: EventProfile) {
    return harness.create(profile === undefined ? {} : { defaults: { profile } });
  }

  const harness = createSdkHarness({ locale: 'en-US' }, ContentfulExperiences);

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
        events: preparedEvents(runtime.eventBuilder, true),
      },
      ...overrides,
    };
  }

  // Consent is not what these tests are about: run as a visitor who has opted in.
  beforeEach(() => {
    seedConsent({ events: true, persistence: true });
  });

  afterEach(() => {
    harness.destroy();
    window.localStorage.clear();
    clearIdentityCookies();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('Web handoff and current-page lifecycle', () => {
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
      const send = vi
        .spyOn(PersonalizationApiClient.prototype, 'upsertProfile')
        .mockResolvedValue({ profile: profileFixture('server-profile') } as never);
      const runtime = createRuntime();
      const input = handoff(runtime, '/accepted');
      let current = true;
      const subscription = runtime.states.eventStream.subscribe((event) => {
        if (event) current = false;
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
      subscription.unsubscribe();
    });

    it('keeps shared pending consumption alive for another current caller', async () => {
      const send = vi
        .spyOn(PersonalizationApiClient.prototype, 'upsertProfile')
        .mockResolvedValue({ profile: profileFixture('server-profile') } as never);
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
      let firstCurrent = true;
      const first = runtime.hydrateAndTrackCurrentPage(input, {
        routeKey: '/shared',
        isCurrent: () => firstCurrent,
      });
      await started.promise;
      const second = runtime.hydrateAndTrackCurrentPage(input, {
        routeKey: '/shared',
        isCurrent: () => true,
      });
      firstCurrent = false;
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
    });

    it('does not readmit a supplied aggregate during publication or cancel newer supplied intent', async () => {
      const send = vi
        .spyOn(PersonalizationApiClient.prototype, 'upsertProfile')
        .mockResolvedValue({ profile: profileFixture('server-profile') } as never);
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

    it("does not create current-route page intent from another route's supplied replay", async () => {
      const send = vi.spyOn(PersonalizationApiClient.prototype, 'upsertProfile');
      const runtime = createRuntime();
      await expect(
        runtime.hydrateAndTrackCurrentPage(handoff(runtime, '/previous'), { routeKey: '/current' })
      ).resolves.toEqual({ accepted: false });
      expect(send).not.toHaveBeenCalled();
    });

    it('lets publication-time consent withdrawal purge supplied replay before transport', async () => {
      const send = vi.spyOn(PersonalizationApiClient.prototype, 'upsertProfile');
      const runtime = createRuntime();
      const subscription = runtime.states.eventStream.subscribe((event) => {
        if (event) runtime.consent({ events: false });
      });
      await runtime.hydrateAndTrackCurrentPage(handoff(runtime), { routeKey: '/first?view=one' });
      expect(send).not.toHaveBeenCalled();
      subscription.unsubscribe();
    });

    it('joins duplicate and serialized invocations by final page message ID before HTTP completes', async () => {
      const response = deferred<{ profile: EventProfile }>();
      const send = vi
        .spyOn(PersonalizationApiClient.prototype, 'upsertProfile')
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
      response.resolve({ profile: profileFixture('committed-profile') });
      await vi.waitFor(() =>
        expect(runtime.states.profile.current).toEqual(profileFixture('committed-profile'))
      );
    });

    it('hydrates internally and does not reseed the response profile on repeated complete consumption', async () => {
      const response = deferred<{ profile: EventProfile }>();
      const send = vi
        .spyOn(PersonalizationApiClient.prototype, 'upsertProfile')
        .mockReturnValue(response.promise as never);
      const runtime = createRuntime();
      const input = handoff(runtime, '/first', {
        state: { profile: profileFixture('server-state') },
      });

      await expect(
        runtime.hydrateAndTrackCurrentPage(input, { routeKey: '/first' })
      ).resolves.toEqual({
        accepted: true,
      });
      expect(runtime.states.profile.current).toEqual(profileFixture('server-state'));
      response.resolve({ profile: profileFixture('api-profile') });
      await vi.waitFor(() =>
        expect(runtime.states.profile.current).toEqual(profileFixture('api-profile'))
      );
      await runtime.hydrateAndTrackCurrentPage(input, { routeKey: '/first' });
      expect(runtime.states.profile.current).toEqual(profileFixture('api-profile'));
      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0]?.[0].profileId).toBe('server-profile');
    });

    it('captures the replay target before evaluated state hydration changes the profile', async () => {
      const response = deferred<{ profile: EventProfile }>();
      const send = vi
        .spyOn(PersonalizationApiClient.prototype, 'upsertProfile')
        .mockReturnValue(response.promise as never);
      const runtime = createRuntime();
      const input = handoff(runtime, '/first', {
        profileId: 'continuation-id',
        state: { profile: profileFixture('evaluated-profile') },
      });

      await expect(
        runtime.hydrateAndTrackCurrentPage(input, { routeKey: '/first' })
      ).resolves.toEqual({
        accepted: true,
      });
      expect(send.mock.calls[0]?.[0].profileId).toBe('continuation-id');
      expect(runtime.states.profile.current).toEqual(profileFixture('evaluated-profile'));
      response.resolve({ profile: profileFixture('committed-profile') });
      await vi.waitFor(() =>
        expect(runtime.states.profile.current).toEqual(profileFixture('committed-profile'))
      );
    });

    it('skips mismatched replay and state, and treats search changes as distinct routes', async () => {
      const send = vi
        .spyOn(PersonalizationApiClient.prototype, 'upsertProfile')
        .mockResolvedValue({ profile: profileFixture('browser-profile') } as never);
      const runtime = createRuntime(profileFixture('browser-profile'));
      const input = handoff(runtime, '/first?view=one', {
        state: { profile: profileFixture('stale-profile') },
      });
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

    it('uses explicit page intent for a handoff without replay and marks later routes noninitial', async () => {
      const send = vi
        .spyOn(PersonalizationApiClient.prototype, 'upsertProfile')
        .mockResolvedValue({ profile: profileFixture('browser-profile') } as never);
      const runtime = createRuntime(profileFixture('browser-profile'));
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
      await expect(
        runtime.trackCurrentPage({ routeKey: '/second', buildPayload })
      ).resolves.toEqual({
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
        .spyOn(PersonalizationApiClient.prototype, 'upsertProfile')
        .mockResolvedValue({ profile: profileFixture('browser-profile') } as never);
      const runtime = createRuntime(profileFixture('browser-profile'));
      const first = handoff(runtime, '/first');
      const second = handoff(runtime, '/second');

      await runtime.hydrateAndTrackCurrentPage(first, { routeKey: '/first' });
      await runtime.hydrateAndTrackCurrentPage(handoff(runtime, '/first'), { routeKey: '/first' });
      await runtime.hydrateAndTrackCurrentPage(second, { routeKey: '/second' });
      await expect(
        runtime.hydrateAndTrackCurrentPage(first, { routeKey: '/first' })
      ).resolves.toEqual({ accepted: false });
      expect(send).toHaveBeenCalledTimes(3);
      await expect(
        runtime.trackCurrentPage({ routeKey: '/first', buildPayload: () => ({}) })
      ).resolves.toMatchObject({ accepted: true });
      expect(send).toHaveBeenCalledTimes(4);
      await runtime.page();
      expect(send).toHaveBeenCalledTimes(5);
    });

    it.each([true, false])(
      'uses ordinary fallback guards at prepared capacity when online is %s',
      async (online) => {
        const firstDelivery = deferred<{ profile: EventProfile }>();
        const upsert = vi
          .spyOn(PersonalizationApiClient.prototype, 'upsertProfile')
          .mockReturnValueOnce(firstDelivery.promise as never)
          .mockResolvedValue({ profile: profileFixture('committed-profile') } as never);
        const browser = createRuntime();
        const builder = serverEventBuilder(true);
        const fullEvents = [
          ...Array.from({ length: 99 }, () => builder.buildTrack({ event: 'bulk' })),
          builder.buildPageView(),
        ];
        const nextEvents = preparedEvents(builder, true);
        const fullHandoff = handoff(browser, '/full', {
          profileId: 'preview-profile',
          replay: { routeKey: '/full', events: fullEvents },
        });
        const nextHandoff = handoff(browser, '/next', {
          profileId: 'preview-profile',
          replay: { routeKey: '/next', events: nextEvents },
        });
        await expect(
          browser.hydrateAndTrackCurrentPage(fullHandoff, { routeKey: '/full' })
        ).resolves.toEqual({ accepted: true });
        if (!online) window.dispatchEvent(new Event('offline'));
        const buildPayload = vi.fn(() => ({ properties: { source: 'capacity-fallback' } }));
        const result = await browser.hydrateAndTrackCurrentPage(nextHandoff, {
          routeKey: '/next',
          buildPayload,
        });
        expect(result).toEqual(
          online
            ? { accepted: true, data: { profile: profileFixture('committed-profile') } }
            : { accepted: false }
        );
        expect(buildPayload).toHaveBeenCalledExactlyOnceWith({ isInitialEmission: false });
        expect(upsert).toHaveBeenCalledTimes(online ? 2 : 1);
        expect(upsert.mock.calls[0]?.[0].events).toEqual(fullEvents);
        if (online) {
          const fallback = upsert.mock.calls[1];
          expect(fallback?.[0]).toMatchObject({
            profileId: 'preview-profile',
            events: [{ type: 'page', properties: { source: 'capacity-fallback' } }],
          });
          expect(fallback?.[0].events).toHaveLength(1);
          expect(fallback?.[1]).toEqual({ locale: 'en-US' });
          expect(nextEvents.map(({ messageId }) => messageId)).not.toContain(
            fallback?.[0].events[0]?.messageId
          );
        }

        firstDelivery.resolve({ profile: profileFixture('committed-profile') });
        window.dispatchEvent(new Event('online'));
        await browser.flush();
        expect(browser.states.personalizationRequestState.current.status).toBe('success');
        const repeated = await browser.hydrateAndTrackCurrentPage(nextHandoff, {
          routeKey: '/next',
          buildPayload,
        });
        if (online) {
          expect(repeated).toBe(result);
          expect(buildPayload).toHaveBeenCalledTimes(1);
        } else {
          expect(repeated).toEqual({ accepted: true });
          await vi.waitFor(() => expect(upsert).toHaveBeenCalledTimes(2));
          expect(upsert.mock.calls[1]?.[0].events).toEqual(nextEvents);
        }
        expect(upsert).toHaveBeenCalledTimes(2);
      }
    );
    it.each(['identify', 'page', 'track'] as const)(
      'propagates a full offline queue rejection through public %s without losing prepared work',
      async (method) => {
        const response = deferred<{ profile: EventProfile }>();
        const send = vi
          .spyOn(PersonalizationApiClient.prototype, 'upsertProfile')
          .mockReturnValue(response.promise as never);
        const runtime = createRuntime(profileFixture('browser-profile'));
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
        expect(runtime.states.profile.current).toEqual(profileFixture('browser-profile'));

        window.dispatchEvent(new Event('online'));
        await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
        expect(send).toHaveBeenCalledWith(
          { profileId: 'browser-profile', events },
          { preflight: false, locale: 'de-DE' }
        );
        response.resolve({ profile: profileFixture('browser-profile') });
      }
    );

    it('falls back once with retained identity for an out-of-order prepared batch', async () => {
      const response = deferred<{ profile: EventProfile }>();
      const send = vi
        .spyOn(PersonalizationApiClient.prototype, 'upsertProfile')
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
      expect(ordinaryPage).toHaveBeenCalledExactlyOnceWith({
        routeKey: '/invalid',
        buildPayload,
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
      expect(
        await runtime.hydrateAndTrackCurrentPage(copy, { routeKey: '/invalid', buildPayload })
      ).toBe(result);
      expect(send).toHaveBeenCalledTimes(1);
    });

    it('returns ordinary route deduplication refusal after rejected page-bearing replay', async () => {
      const send = vi
        .spyOn(PersonalizationApiClient.prototype, 'upsertProfile')
        .mockResolvedValue({ profile: profileFixture('browser-profile') } as never);
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

    it('hydrates applicable state before rejected replay falls back with the default page payload', async () => {
      const send = vi
        .spyOn(PersonalizationApiClient.prototype, 'upsertProfile')
        .mockResolvedValue({ profile: profileFixture('evaluated-profile') } as never);
      const runtime = createRuntime();
      const input = handoff(runtime, '/first', {
        state: { profile: profileFixture('evaluated-profile') },
        replay: {
          routeKey: '/first',
          events: [runtime.eventBuilder.buildPageView(), runtime.eventBuilder.buildPageView()],
        },
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
        .spyOn(PersonalizationApiClient.prototype, 'upsertProfile')
        .mockResolvedValue({ profile: profileFixture('server-profile') } as never);
      const runtime = createRuntime();
      await runtime.hydrateAndTrackCurrentPage(
        handoff(runtime, '/old', {
          state: { profile: profileFixture('stale-profile') },
          replay: { routeKey: '/old', events: [] },
        }),
        { routeKey: '/current', buildPayload: () => ({}) }
      );
      expect(send.mock.calls[0]?.[0].profileId).toBe('server-profile');
      expect(runtime.states.profile.current?.id).toBe('server-profile');
    });

    it.each(['identify', 'track'] as const)(
      'admits matching %s-only replay once without marking or inventing a page',
      async (type) => {
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

        await expect(
          runtime.hydrateAndTrackCurrentPage(input, { routeKey: '/first', buildPayload })
        ).resolves.toEqual({ accepted: true });
        await expect(
          runtime.hydrateAndTrackCurrentPage(JSON.parse(JSON.stringify(input)), {
            routeKey: '/first',
            buildPayload,
          })
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

        await expect(
          runtime.trackCurrentPage({ routeKey: '/first', buildPayload })
        ).resolves.toMatchObject({ accepted: true });
        expect(buildPayload).toHaveBeenCalledExactlyOnceWith({ isInitialEmission: true });
        expect(send.mock.calls[1]?.[0].events.map(({ type }) => type)).toEqual(['page']);
      }
    );

    it.each(['identify', 'track'] as const)(
      'refuses a matching %s-only replay without fallback even with explicit page payload',
      async (type) => {
        const send = vi.spyOn(PersonalizationApiClient.prototype, 'upsertProfile');
        const admission = vi
          .spyOn(PersonalizationDelivery.prototype, 'sendPrepared')
          .mockReturnValue({ accepted: false });
        const runtime = createRuntime();
        const event =
          type === 'identify'
            ? runtime.eventBuilder.buildIdentify({ userId: 'visitor' })
            : runtime.eventBuilder.buildTrack({ event: 'opened' });
        const input = handoff(runtime, '/first', {
          replay: { routeKey: '/first', events: [event] },
        });
        const buildPayload = vi.fn(() => ({}));

        await expect(
          runtime.hydrateAndTrackCurrentPage(input, { routeKey: '/first', buildPayload })
        ).resolves.toEqual({ accepted: false });
        expect(admission).toHaveBeenCalledOnce();
        expect(buildPayload).not.toHaveBeenCalled();
        expect(send).not.toHaveBeenCalled();
      }
    );

    it.each(['absent', 'empty'] as const)(
      'hydrates an %s replay without inventing a page, but permits explicit page intent',
      async (replay) => {
        const send = vi
          .spyOn(PersonalizationApiClient.prototype, 'upsertProfile')
          .mockResolvedValue({ profile: profileFixture('evaluated-profile') } as never);
        const runtime = createRuntime();
        const input = handoff(runtime, '/first', {
          state: { profile: profileFixture('evaluated-profile') },
          replay: replay === 'empty' ? { routeKey: '/first', events: [] } : undefined,
        });

        await expect(
          runtime.hydrateAndTrackCurrentPage(input, { routeKey: '/first' })
        ).resolves.toEqual({ accepted: false });
        expect(runtime.states.profile.current).toEqual(profileFixture('evaluated-profile'));
        expect(runtime.states.personalizationRequestState.current).toEqual({ status: 'success' });
        expect(send).not.toHaveBeenCalled();
        const buildPayload = vi.fn(() => ({ properties: { title: 'explicit' } }));
        await expect(
          runtime.hydrateAndTrackCurrentPage(input, { routeKey: '/first', buildPayload })
        ).resolves.toMatchObject({ accepted: true });
        expect(buildPayload).toHaveBeenCalledExactlyOnceWith({ isInitialEmission: true });
        expect(send.mock.calls[0]?.[0]).toMatchObject({
          profileId: 'evaluated-profile',
          events: [{ type: 'page', properties: { title: 'explicit' } }],
        });
        expect(send.mock.calls[0]?.[0].events).toHaveLength(1);
      }
    );

    it.each(['supersession', 'reset', 'destroy'] as const)(
      'prevents stale fallback when %s occurs after rejected admission',
      async (action) => {
        const send = vi
          .spyOn(PersonalizationApiClient.prototype, 'upsertProfile')
          .mockResolvedValue({ profile: profileFixture('server-profile') } as never);
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
      await expect(
        runtime.hydrateAndTrackCurrentPage(input, { routeKey: '/first', buildPayload })
      ).resolves.toEqual({ accepted: true });
      response.reject(new Error('HTTP failure'));
      await vi.waitFor(() =>
        expect(runtime.states.personalizationRequestState.current.status).toBe('failed')
      );
      await expect(
        runtime.hydrateAndTrackCurrentPage(input, { routeKey: '/first', buildPayload })
      ).resolves.toEqual({ accepted: true });
      expect(send).toHaveBeenCalledTimes(1);
      expect(buildPayload).not.toHaveBeenCalled();
      window.dispatchEvent(new Event('offline'));
      window.dispatchEvent(new Event('online'));
      await vi.waitFor(() =>
        expect(runtime.states.personalizationRequestState.current.status).toBe('success')
      );
      expect(send).toHaveBeenCalledTimes(2);
      expect(send.mock.calls[1]?.[0].events).toEqual(input.replay?.events);
      expect(buildPayload).not.toHaveBeenCalled();
    });

    it('prevents superseded hydration and reset from publishing state', async () => {
      const runtime = createRuntime();
      const older = handoff(runtime, '/old', {
        state: { profile: profileFixture('old-profile') },
        replay: undefined,
      });
      const newer = handoff(runtime, '/new', {
        state: { profile: profileFixture('new-profile') },
        replay: undefined,
      });

      const pending = runtime.hydrateAndTrackCurrentPage(older, { routeKey: '/old' });
      await runtime.hydrateAndTrackCurrentPage(newer, { routeKey: '/new' });
      await pending;
      expect(runtime.states.profile.current).toEqual(profileFixture('new-profile'));

      const resetting = runtime.hydrateAndTrackCurrentPage(older, { routeKey: '/old' });
      runtime.reset();
      await resetting;
      expect(runtime.states.profile.current).toBeUndefined();
      expect(window.localStorage.getItem(PROFILE_CACHE_KEY)).toBeNull();
    });

    it('does not admit a superseded pending replay', async () => {
      const send = vi
        .spyOn(PersonalizationApiClient.prototype, 'upsertProfile')
        .mockResolvedValue({ profile: profileFixture('new-profile') } as never);
      const runtime = createRuntime();
      const old = runtime.hydrateAndTrackCurrentPage(
        handoff(runtime, '/old', {
          profileId: 'old-continuation',
          state: { profile: profileFixture('old-profile') },
        }),
        { routeKey: '/old' }
      );
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
    });

    it('retains published continuity when ordinary navigation cancels pending replay', async () => {
      const response = deferred<{ profile: EventProfile }>();
      const send = vi
        .spyOn(PersonalizationApiClient.prototype, 'upsertProfile')
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
      response.resolve({ profile: profileFixture('committed-profile') });
      await expect(current).resolves.toMatchObject({ accepted: true });
    });

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

    it.each(['reset', 'destroy'] as const)(
      'does not admit a pending prepared replay after %s',
      async (action) => {
        const send = vi.spyOn(PersonalizationApiClient.prototype, 'upsertProfile');
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

    it('allows a fresh current-page attempt after reset invalidates an in-flight one', async () => {
      const oldResponse = deferred<{ profile: EventProfile }>();
      const send = vi
        .spyOn(PersonalizationApiClient.prototype, 'upsertProfile')
        .mockReturnValueOnce(oldResponse.promise as never)
        .mockResolvedValue({ profile: profileFixture('new-profile') } as never);
      const runtime = createRuntime();
      const oldPage = runtime.trackCurrentPage({ routeKey: '/first', buildPayload: () => ({}) });
      await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
      runtime.reset();
      oldResponse.resolve({ profile: profileFixture('old-profile') });
      await oldPage;

      await expect(
        runtime.trackCurrentPage({ routeKey: '/first', buildPayload: () => ({}) })
      ).resolves.toMatchObject({ accepted: true });
      expect(send).toHaveBeenCalledTimes(2);
      expect(runtime.states.profile.current).toEqual(profileFixture('new-profile'));
    });

    it('releases singleton ownership on destroy and rejects later publication', async () => {
      const runtime = createRuntime();
      expect(() => createRuntime()).toThrow();
      const pending = runtime.hydrateAndTrackCurrentPage(
        handoff(runtime, '/first', { state: { profile: profileFixture('late') } }),
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

    it('does not overwrite browser identity with profileless public or static state', async () => {
      const send = vi.spyOn(PersonalizationApiClient.prototype, 'upsertProfile');
      const runtime = createRuntime(profileFixture('browser-profile'));
      runtime.interceptors.state.add(() => ({ profile: profileFixture('interceptor-profile') }));
      for (const cache of [
        { scope: 'public-permutation' as const, key: 'experience:en-US:revision' },
        { scope: 'static' as const },
      ]) {
        for (const state of [{}, { profile: undefined }]) {
          await expect(
            runtime.hydrateAndTrackCurrentPage(
              { spaceId: 'space', environmentId: 'environment', cache, state },
              { routeKey: '/first' }
            )
          ).resolves.toEqual({ accepted: false });
          expect(runtime.states.profile.current).toEqual(profileFixture('browser-profile'));
          expect(runtime.states.personalizationRequestState.current).toEqual({ status: 'success' });
        }
      }
      expect(send).not.toHaveBeenCalled();
    });

    it('honors an in-memory explicit profile clear', async () => {
      const runtime = createRuntime(profileFixture('browser-profile'));
      await runtime.hydrateAndTrackCurrentPage(
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
      const send = vi.spyOn(PersonalizationApiClient.prototype, 'upsertProfile');
      const runtime = createRuntime(profileFixture('browser-profile'));
      const input = handoff(runtime, '/first', {
        state: { profile: profileFixture('server-profile') },
      });

      await expect(
        runtime.hydrateAndTrackCurrentPage({ ...input, spaceId: 'other' }, { routeKey: '/first' })
      ).rejects.toThrow('does not match');
      await expect(
        runtime.hydrateAndTrackCurrentPage(
          { ...input, cache: { scope: 'static' } },
          { routeKey: '/first' }
        )
      ).rejects.toThrow('Profile state');
      expect(runtime.states.profile.current).toEqual(profileFixture('browser-profile'));
      expect(send).not.toHaveBeenCalled();
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
  });
});

describe('prepared-consent', () => {
  type PersonalizationEvents = NonNullable<ExperiencesHandoff['replay']>['events'];

  const { create: createRuntime, destroy: destroyRuntimes } = createSdkHarness(
    { locale: 'en-US' },
    ContentfulExperiences
  );

  /** A batch built the way a Node server builds it, stamped with the server's consent. */
  const serverBatch = (serverConsent: boolean, withTrack = true): PersonalizationEvents =>
    preparedEvents(serverEventBuilder(serverConsent), serverConsent, withTrack);

  function handoffWith(events: PersonalizationEvents, routeKey = '/first'): ExperiencesHandoff {
    return {
      spaceId: 'space',
      environmentId: 'environment',
      cache: { scope: 'private-request' },
      profileId: 'server-profile',
      replay: { routeKey, events },
    };
  }

  const flags = (events: readonly { context: { gdpr?: { isConsentGiven?: boolean } } }[]) =>
    events.map((event) => event.context.gdpr?.isConsentGiven);

  beforeEach(() => {
    vi.spyOn(PersonalizationApiClient.prototype, 'upsertProfile').mockResolvedValue({
      profile: profileFixture('delivered'),
    } as never);
  });

  afterEach(async () => {
    destroyRuntimes();
    vi.restoreAllMocks();
    window.localStorage.clear();
    clearIdentityCookies();
  });

  describe('Web prepared handoff and consent', () => {
    describe('the gate', () => {
      it.each([false, true])(
        'keeps blocked nonpage replay dropped after grant and newer intent=%s',
        async (newerIntent) => {
          const runtime = createRuntime();
          const upsert = vi.mocked(PersonalizationApiClient.prototype.upsertProfile);
          const events = serverBatch(true).filter((event) => event.type === 'track');
          const blocked = handoffWith(events);
          const route = { routeKey: '/first' };
          await expect(runtime.hydrateAndTrackCurrentPage(blocked, route)).resolves.toEqual({
            accepted: false,
          });
          runtime.consent({ events: true });
          if (newerIntent)
            await runtime.hydrateAndTrackCurrentPage(handoffWith(serverBatch(true)), route);
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
        const runtime = createRuntime({ allowedEventTypes: [] });
        const upsert = vi.mocked(PersonalizationApiClient.prototype.upsertProfile);
        const events = serverBatch(true);
        const blocked = handoffWith(events);
        await expect(
          runtime.hydrateAndTrackCurrentPage(blocked, { routeKey: '/first' })
        ).resolves.toEqual({ accepted: false });
        runtime.consent({ events: false });
        runtime.consent({ events: true });
        await expect(
          runtime.hydrateAndTrackCurrentPage(blocked, { routeKey: '/first' })
        ).resolves.toMatchObject({ accepted: true });
        expect(upsert.mock.calls[0]?.[0].events.map((event) => event.type)).toEqual(['page']);
        expect(events.map((event) => event.messageId)).not.toContain(
          upsert.mock.calls[0]?.[0].events[0]?.messageId
        );
      });

      it('admits a page-only batch by default, since page is allow-listed', async () => {
        const runtime = createRuntime();
        const upsert = vi.mocked(PersonalizationApiClient.prototype.upsertProfile);
        const [page] = serverBatch(true, false);

        const result = await runtime.hydrateAndTrackCurrentPage(handoffWith([page!]), {
          routeKey: '/first',
        });

        expect(result.accepted).toBe(true);
        await vi.waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
        expect(upsert.mock.calls[0]![0].events).toEqual([
          { ...page, context: { ...page!.context, gdpr: { isConsentGiven: false } } },
        ]);
      });

      it('refuses the whole batch when one event is not admitted, and reports each', async () => {
        const onEventBlocked = vi.fn();
        const runtime = createRuntime({ onEventBlocked });
        const upsert = vi.mocked(PersonalizationApiClient.prototype.upsertProfile);
        const events = serverBatch(true);

        const result = await runtime.hydrateAndTrackCurrentPage(handoffWith(events), {
          routeKey: '/first',
        });

        // `track` is not allow-listed, so the prepared batch is refused...
        expect(onEventBlocked).toHaveBeenCalledTimes(1);
        expect(onEventBlocked).toHaveBeenCalledWith(
          expect.objectContaining({ reason: 'consent', method: 'track' })
        );
        // ...and the browser falls back to its own gated page event.
        await vi.waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
        const sent = upsert.mock.calls[0]![0].events;
        expect(sent.map(({ type }) => type)).toEqual(['page']);
        expect(sent[0]!.messageId).not.toBe(events.at(-1)!.messageId);
        expect(result.accepted).toBe(true);
      });

      it('reports every blocked event, not only the first', async () => {
        const onEventBlocked = vi.fn();
        const runtime = createRuntime({ onEventBlocked, allowedEventTypes: [] });
        const events = serverBatch(true);

        await expect(
          runtime.hydrateAndTrackCurrentPage(handoffWith(events), { routeKey: '/first' })
        ).resolves.toEqual({ accepted: false });

        // Both prepared events are reported, then the browser's own fallback page, which
        // the same gate also blocks.
        expect(onEventBlocked.mock.calls.map(([event]) => event.method)).toEqual([
          'track',
          'page',
          'page',
        ]);
        expect(PersonalizationApiClient.prototype.upsertProfile).not.toHaveBeenCalled();
      });
    });

    describe('the stamp', () => {
      it.each([false, true])(
        'stamps admitted replay with browser consent=%s, overriding the server',
        async (browserConsent) => {
          seedConsent({ events: browserConsent });
          const runtime = createRuntime();
          const upsert = vi.mocked(PersonalizationApiClient.prototype.upsertProfile);
          await runtime.hydrateAndTrackCurrentPage(
            handoffWith(serverBatch(!browserConsent, browserConsent)),
            { routeKey: '/first' }
          );
          await vi.waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
          expect(flags(upsert.mock.calls[0]![0].events)).toEqual(
            browserConsent ? [true, true] : [false]
          );
        }
      );
    });

    describe('queued events when consent changes', () => {
      /** Accept events while offline so they sit in the queue, as for a visitor on a bad connection. */
      async function queueOffline(runtime: ContentfulExperiences) {
        window.dispatchEvent(new Event('offline'));
        await runtime.track({ event: 'queued-1' });
        await runtime.track({ event: 'queued-2' });
        expect(runtime.states.personalizationRequestState.current.status).toBe('idle');
      }

      it('drops queued events when event consent is withdrawn, so they are never sent', async () => {
        seedConsent({ events: true, persistence: true });
        const runtime = createRuntime();
        const upsert = vi.mocked(PersonalizationApiClient.prototype.upsertProfile);
        await queueOffline(runtime);

        runtime.consent({ events: false });
        window.dispatchEvent(new Event('online'));
        await Promise.resolve();

        expect(upsert).not.toHaveBeenCalled();
        runtime.destroy();
        await Promise.resolve();
        expect(upsert).not.toHaveBeenCalled();
      });

      it('still sends queued events when consent is granted or only persistence changes', async () => {
        seedConsent({ events: true, persistence: true });
        const runtime = createRuntime();
        const upsert = vi.mocked(PersonalizationApiClient.prototype.upsertProfile);
        await queueOffline(runtime);

        runtime.consent({ persistence: false });
        runtime.consent({ events: true });
        window.dispatchEvent(new Event('online'));

        await vi.waitFor(() => expect(upsert).toHaveBeenCalled());
        expect(upsert.mock.calls[0]![0].events.map((event) => event.type)).toEqual([
          'track',
          'track',
        ]);
      });

      it('blocks new events after withdrawal, so nothing is queued again', async () => {
        seedConsent({ events: true, persistence: true });
        const runtime = createRuntime();
        const upsert = vi.mocked(PersonalizationApiClient.prototype.upsertProfile);
        window.dispatchEvent(new Event('offline'));
        runtime.consent({ events: false });

        await expect(runtime.track({ event: 'after' })).resolves.toEqual({ accepted: false });
        window.dispatchEvent(new Event('online'));
        await Promise.resolve();

        expect(upsert).not.toHaveBeenCalled();
      });
    });

    describe('responses that complete after consent is withdrawn', () => {
      it('does not publish or persist a profile from an online event that was in flight', async () => {
        seedConsent({ events: true, persistence: true });
        const runtime = createRuntime({ defaults: { profile: profileFixture('live-profile') } });
        const response = deferred<{ profile: EventProfile }>();
        vi.mocked(PersonalizationApiClient.prototype.upsertProfile).mockReturnValue(
          response.promise as never
        );

        const pending = runtime.track({ event: 'in-flight' });
        await vi.waitFor(() =>
          expect(PersonalizationApiClient.prototype.upsertProfile).toHaveBeenCalled()
        );
        runtime.consent({ events: false });
        response.resolve({ profile: profileFixture('late-profile') });
        await pending;

        // The request was already sent, but its response must not replace the live profile
        // or reach storage while persistence is still granted.
        expect(runtime.states.profile.current).toEqual(profileFixture('live-profile'));
        expect(window.localStorage.getItem('__ctfl_opt_profile__')).toBe(
          JSON.stringify(profileFixture('live-profile'))
        );
        expect({
          events: runtime.states.consent.current,
          persistence: runtime.states.persistenceConsent.current,
        }).toEqual({ events: false, persistence: true });
      });

      it('does not publish delivery state or profile from a queued flush that was in flight', async () => {
        seedConsent({ events: true, persistence: true });
        const runtime = createRuntime({ defaults: { profile: profileFixture('live-profile') } });
        window.dispatchEvent(new Event('offline'));
        await runtime.track({ event: 'queued' });
        const response = deferred<{ profile: EventProfile }>();
        vi.mocked(PersonalizationApiClient.prototype.upsertProfile).mockReturnValue(
          response.promise as never
        );
        window.dispatchEvent(new Event('online'));
        await vi.waitFor(() =>
          expect(runtime.states.personalizationRequestState.current.status).toBe('pending')
        );

        runtime.consent({ events: false });
        response.resolve({ profile: profileFixture('late-profile') });
        await Promise.resolve();
        await Promise.resolve();

        expect(runtime.states.profile.current).toEqual(profileFixture('live-profile'));
        expect(runtime.states.personalizationRequestState.current.status).not.toBe('success');
      });

      it('still publishes responses for events sent after consent is granted again', async () => {
        seedConsent({ events: true, persistence: true });
        const runtime = createRuntime({ defaults: { profile: profileFixture('live-profile') } });
        runtime.consent({ events: false });
        runtime.consent({ events: true });
        vi.mocked(PersonalizationApiClient.prototype.upsertProfile).mockResolvedValue({
          profile: profileFixture('fresh-profile'),
        } as never);

        await runtime.track({ event: 'after-regrant' });

        expect(runtime.states.profile.current).toEqual(profileFixture('fresh-profile'));
      });
    });

    describe('handoff acceptance across a withdrawal', () => {
      it('drops an admitted aggregate on withdrawal and permits fresh page intent for the same route', async () => {
        seedConsent({ events: true, persistence: true });
        const runtime = createRuntime();
        const upsert = vi.mocked(PersonalizationApiClient.prototype.upsertProfile);
        const handoff = handoffWith(serverBatch(true, false));

        // Admitted while offline, so the page sits in the queue and is not sent.
        window.dispatchEvent(new Event('offline'));
        await expect(
          runtime.hydrateAndTrackCurrentPage(handoff, { routeKey: '/first' })
        ).resolves.toEqual({ accepted: true });
        expect(upsert).not.toHaveBeenCalled();

        // Withdrawing discards the admitted batch permanently. The route remains
        // eligible for a fresh page after regrant; the old aggregate never replays.
        runtime.consent({ events: false });
        runtime.consent({ events: true });
        window.dispatchEvent(new Event('online'));
        await Promise.resolve();
        expect(upsert).not.toHaveBeenCalled();

        const retry = await runtime.hydrateAndTrackCurrentPage(handoff, { routeKey: '/first' });

        expect(retry.accepted).toBe(true);
        await vi.waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
        expect(upsert.mock.calls[0]?.[0].events.map((event) => event.type)).toEqual(['page']);
        expect(upsert.mock.calls[0]?.[0].events[0]?.messageId).not.toBe(
          handoff.replay?.events[0]?.messageId
        );
      });

      it('lets trackCurrentPage send the route again after withdrawal discarded its page', async () => {
        seedConsent({ events: true, persistence: true });
        const runtime = createRuntime();
        const upsert = vi.mocked(PersonalizationApiClient.prototype.upsertProfile);

        window.dispatchEvent(new Event('offline'));
        await runtime.hydrateAndTrackCurrentPage(handoffWith(serverBatch(true, false)), {
          routeKey: '/first',
        });
        runtime.consent({ events: false });
        runtime.consent({ events: true });
        window.dispatchEvent(new Event('online'));

        const result = await runtime.trackCurrentPage({
          routeKey: '/first',
          buildPayload: () => ({}),
        });

        expect(result.accepted).toBe(true);
        await vi.waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
      });

      it('forgets a route that was already sent, so it can be sent again after withdrawal and a new grant', async () => {
        seedConsent({ events: true, persistence: true });
        const runtime = createRuntime();
        const upsert = vi.mocked(PersonalizationApiClient.prototype.upsertProfile);

        await runtime.hydrateAndTrackCurrentPage(handoffWith(serverBatch(true, false)), {
          routeKey: '/first',
        });
        await vi.waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
        runtime.consent({ events: false });
        runtime.consent({ events: true });

        await runtime.trackCurrentPage({ routeKey: '/first', buildPayload: () => ({}) });

        // A new consent decision starts a new page view for the route.
        await vi.waitFor(() => expect(upsert).toHaveBeenCalledTimes(2));
      });

      it('keeps an accepted route accepted when consent is only granted or persistence changes', async () => {
        seedConsent({ events: true, persistence: true });
        const runtime = createRuntime();
        const upsert = vi.mocked(PersonalizationApiClient.prototype.upsertProfile);

        await runtime.hydrateAndTrackCurrentPage(handoffWith(serverBatch(true, false)), {
          routeKey: '/first',
        });
        await vi.waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
        runtime.consent({ persistence: false });
        runtime.consent({ events: true });

        await runtime.trackCurrentPage({ routeKey: '/first', buildPayload: () => ({}) });

        // Already sent for this route; nothing is sent twice.
        expect(upsert).toHaveBeenCalledTimes(1);
      });
    });
  });
});

describe('current-page', () => {
  afterEach(() => {
    window.localStorage.clear();
    clearIdentityCookies();
    vi.restoreAllMocks();
  });

  describe('current-page attempt ownership', () => {
    it.each(['refused', 'failed'] as const)(
      'keeps a new same-route attempt pending after reset when the old completes and the new is %s',
      async (outcome) => {
        const runtime = new ContentfulExperiences({
          spaceId: 'space',
          environmentId: 'environment',
          delivery: { accessToken: 'delivery-token' },
        });
        try {
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

          await expect(
            runtime.trackCurrentPage({ routeKey: '/same', buildPayload })
          ).resolves.toEqual({
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

          await expect(
            runtime.trackCurrentPage({ routeKey: '/same', buildPayload })
          ).resolves.toEqual({
            accepted: true,
          });
          expect(page).toHaveBeenCalledTimes(3);
          expect(initialFlags).toEqual([true, true, true]);
        } finally {
          runtime.destroy();
        }
      }
    );
  });
});
