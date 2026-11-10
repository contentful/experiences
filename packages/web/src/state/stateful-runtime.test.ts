import { preparedEvents, serverEventBuilder } from '../test/fixtures/prepared-events.js';
// @vitest-environment jsdom

import {
  ANONYMOUS_ID_COOKIE,
  ANONYMOUS_ID_COOKIE_LEGACY,
  ANONYMOUS_ID_KEY,
  ANONYMOUS_ID_KEY_LEGACY,
  CONSENT_CACHE_KEY,
  PERSISTENCE_CONSENT_CACHE_KEY,
  PROFILE_CACHE_KEY,
  ContentfulExperiences as RuntimeContentfulExperiences,
  type EventProfile,
  type ExperiencesHandoff,
} from '@contentful/experiences-runtime';
import {
  ExperienceApiClient as PersonalizationApiClient,
  InsightsApiClient as AnalyticsApiClient,
} from '@contentful/optimization-api-client';
import { effect } from '@preact/signals-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hydrateOptimizationData } from '../bridge-support.js';
import { getCookie, removeCookie, setCookie } from '../browser/cookies.js';
import { ContentfulExperiences } from '../contentful-experiences.js';
import type { Subscription } from '../signals/Observable.js';
import * as signals from '../signals/signals.js';
import { captureCookieWrites } from '../test/cookies.js';
import { deferred, setDocumentVisibility } from '../test/dom.js';
import { clearIdentityCookies, seedConsent } from '../test/fixtures/consent.js';
import { completeProfile, completeProfile as profileFixture } from '../test/fixtures/profile.js';
import { createSdkHarness, mockOptimization } from '../test/sdk-harness.js';

describe('states', () => {
  const { create: createRuntime, destroy: destroyRuntimes } = createSdkHarness(
    { locale: 'en-US', defaults: { profile: completeProfile('visitor') } },
    ContentfulExperiences
  );

  const subscriptions: Subscription[] = [];

  const effects: (() => void)[] = [];

  function preparedHandoff(): ExperiencesHandoff {
    return {
      spaceId: 'space',
      environmentId: 'environment',
      profileId: 'visitor',
      cache: { scope: 'private-request' },
      replay: {
        routeKey: '/prepared',
        events: preparedEvents(serverEventBuilder(true), true),
      },
    };
  }

  beforeEach(() => {
    seedConsent({ events: true, persistence: true });
    vi.useFakeTimers();
    setDocumentVisibility('visible');
    vi.spyOn(PersonalizationApiClient.prototype, 'upsertProfile').mockResolvedValue({
      profile: completeProfile('visitor'),
    } as never);
    vi.spyOn(AnalyticsApiClient.prototype, 'sendBatchEvents').mockResolvedValue(true);
  });

  afterEach(async () => {
    for (const subscription of subscriptions) subscription.unsubscribe();
    subscriptions.length = 0;
    for (const dispose of effects) dispose();
    effects.length = 0;
    destroyRuntimes();
    await vi.advanceTimersByTimeAsync(0);
    vi.useRealTimers();
    vi.restoreAllMocks();
    window.localStorage.clear();
    clearIdentityCookies();
  });

  describe('Web public state subscriptions', () => {
    describe('consent withdrawal notifications', () => {
      it('completes event withdrawal even if deleting the identity cookie throws', async () => {
        const runtime = createRuntime();
        window.dispatchEvent(new Event('offline'));
        await runtime.track({ event: 'queued' });
        await runtime.trackClick({ entityId: 'hero', entityKind: 'Experience' });
        subscriptions.push(
          runtime.states.consent.subscribe((consent) => {
            if (consent === false) runtime.destroy();
          })
        );
        const error = new globalThis.DOMException('Cookie access denied', 'SecurityError');
        const cookieSetter = vi.spyOn(document, 'cookie', 'set').mockImplementation(() => {
          throw error;
        });

        expect(() => runtime.consent(false)).toThrow('Cookie access denied');
        cookieSetter.mockRestore();
        await vi.advanceTimersByTimeAsync(0);
        expect(runtime.states.consent.current).toBe(false);
        expect(window.localStorage.getItem(CONSENT_CACHE_KEY)).toBe('denied');
        expect(window.localStorage.getItem(PERSISTENCE_CONSENT_CACHE_KEY)).toBe('denied');
        expect(window.localStorage.getItem(PROFILE_CACHE_KEY)).toBeNull();
        expect(PersonalizationApiClient.prototype.upsertProfile).not.toHaveBeenCalled();
        expect(AnalyticsApiClient.prototype.sendBatchEvents).not.toHaveBeenCalled();
      });

      describe.each(['events', 'both'] as const)('%s consent', (axes) => {
        it.each([
          ['consent', 'destroy'],
          ['consent', 'throw'],
          ['request state', 'destroy'],
          ['request state', 'throw'],
        ] as const)('purges both queues before a %s subscriber can %s', async (state, action) => {
          const runtime = createRuntime({
            defaults: {
              profile: completeProfile('visitor'),
              consent: true,
              persistenceConsent: axes === 'both',
            },
          });
          window.dispatchEvent(new Event('offline'));
          await expect(runtime.track({ event: 'queued' })).resolves.toEqual({ accepted: true });
          await runtime.trackClick({ entityId: 'hero', entityKind: 'Experience' });

          const error = new Error('withdrawal subscriber failed');
          let withdrawing = false;
          const subscriber = vi.fn(() => {
            if (!withdrawing) return;
            withdrawing = false; // destroy() can also publish request state.
            if (action === 'destroy') runtime.destroy();
            else throw error;
          });
          const observable =
            state === 'consent'
              ? runtime.states.consent
              : runtime.states.personalizationRequestState;
          const subscription = observable.subscribe(subscriber);
          subscriptions.push(subscription);

          withdrawing = true;
          if (action === 'throw') {
            expect(() => runtime.consent(axes === 'both' ? false : { events: false })).toThrow(
              error
            );
          } else {
            runtime.consent(axes === 'both' ? false : { events: false });
          }
          expect(subscriber.mock.calls.length).toBeGreaterThan(1);
          subscription.unsubscribe();
          expect(runtime.states.consent.current).toBe(false);
          expect(window.localStorage.getItem(CONSENT_CACHE_KEY)).toBe('denied');
          expect(window.localStorage.getItem(PERSISTENCE_CONSENT_CACHE_KEY)).toBe('denied');
          expect(window.localStorage.getItem(PROFILE_CACHE_KEY)).toBeNull();
          expect(document.cookie).toBe('');

          await runtime.flush();
          window.dispatchEvent(new Event('online'));
          await vi.advanceTimersByTimeAsync(0);
          runtime.consent({ events: true });
          await runtime.flush();
          await vi.advanceTimersByTimeAsync(30_000);
          runtime.destroy();
          await vi.advanceTimersByTimeAsync(0);

          expect(PersonalizationApiClient.prototype.upsertProfile).not.toHaveBeenCalled();
          expect(AnalyticsApiClient.prototype.sendBatchEvents).not.toHaveBeenCalled();
        });
      });
    });

    it('publishes and sends intercepted events, then commits intercepted response state', async () => {
      const runtime = createRuntime();
      runtime.interceptors.event.add(async (event) =>
        event.type === 'track' ? { ...event, event: 'rewritten' } : event
      );
      runtime.interceptors.state.add(async (state) => ({
        profile: { ...state.profile!, traits: { intercepted: true } },
      }));
      runtime.interceptors.state.add(() => ({}));
      const profiles = vi.fn();
      subscriptions.push(runtime.states.profile.subscribe(profiles));

      await runtime.track({ event: 'original' });

      expect(runtime.states.eventStream.current).toMatchObject({
        type: 'track',
        event: 'rewritten',
      });
      expect(PersonalizationApiClient.prototype.upsertProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          events: [expect.objectContaining({ type: 'track', event: 'rewritten' })],
        }),
        expect.anything()
      );
      expect(runtime.states.profile.current).toEqual(
        completeProfile('visitor', { traits: { intercepted: true } })
      );
      expect(runtime.states.personalizationRequestState.current).toEqual({ status: 'success' });
      await runtime.page();
      expect(profiles).toHaveBeenCalledTimes(2);
      await hydrateOptimizationData(runtime, { profile: completeProfile('hydrated') });
      expect(runtime.states.profile.current).toEqual(
        completeProfile('hydrated', { traits: { intercepted: true } })
      );
      expect(profiles).toHaveBeenCalledTimes(3);
    });

    it('does not commit incoming state if reset occurs while a state interceptor is pending', async () => {
      const runtime = createRuntime();
      const started = deferred<void>();
      const released = deferred<void>();
      runtime.interceptors.state.add(async (state) => {
        started.resolve();
        await released.promise;
        return state;
      });
      const pending = runtime.page();
      await started.promise;
      runtime.reset();
      released.resolve();
      await pending;

      expect(runtime.states.profile.current).toBeUndefined();
      expect(runtime.states.personalizationRequestState.current).toEqual({ status: 'idle' });
      expect(window.localStorage.getItem(PROFILE_CACHE_KEY)).toBeNull();
    });

    it('queries consent and calls the current anonymous identity provider for each request', async () => {
      let id = 'external-1';
      const getAnonymousId = vi.fn(() => id);
      const runtime = createRuntime({ getAnonymousId, defaults: { consent: false } });
      expect(runtime.hasConsent('page')).toBe(true);
      expect(runtime.hasConsent('track')).toBe(false);
      expect(runtime.hasConsent('unrecognized')).toBe(false);
      await runtime.page();
      id = 'external-2';
      runtime.consent({ events: true });
      expect(runtime.hasConsent('unrecognized')).toBe(true);
      await runtime.page();

      const requests = vi.mocked(PersonalizationApiClient.prototype.upsertProfile).mock.calls;
      expect(requests.map(([request]) => request.profileId)).toEqual(['external-1', 'external-2']);
      expect(getAnonymousId).toHaveBeenCalled();
    });

    it('publishes the response profile and request success atomically', async () => {
      const runtime = createRuntime();
      const response = deferred<{ profile: EventProfile }>();
      vi.mocked(PersonalizationApiClient.prototype.upsertProfile).mockReturnValue(
        response.promise as never
      );
      const snapshots: { profile: string | undefined; status: string }[] = [];
      effects.push(
        effect(() => {
          snapshots.push({
            profile: signals.profile.value?.id,
            status: signals.personalizationRequestState.value.status,
          });
        })
      );
      const events = vi.fn();
      subscriptions.push(runtime.states.eventStream.subscribe(events));
      const pending = runtime.page();
      await vi.waitFor(() =>
        expect(PersonalizationApiClient.prototype.upsertProfile).toHaveBeenCalled()
      );
      expect(runtime.states.personalizationRequestState.current).toEqual({ status: 'pending' });
      expect(events.mock.calls.slice(1).map(([event]) => event.type)).toEqual(['page']);
      response.resolve({ profile: completeProfile('updated') });
      await pending;
      expect(snapshots).toEqual([
        { profile: 'visitor', status: 'idle' },
        { profile: 'visitor', status: 'pending' },
        { profile: 'updated', status: 'success' },
      ]);
      runtime.reset();
      await hydrateOptimizationData(runtime, { profile: completeProfile('hydrated') });
      expect(snapshots.slice(-2)).toEqual([
        { profile: undefined, status: 'idle' },
        { profile: 'hydrated', status: 'success' },
      ]);
    });

    it('keeps delivery, prepared deduplication and retries independent of diagnostic errors', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const error = new Error('diagnostic subscriber failed');
      vi.spyOn(Math, 'random').mockReturnValue(0);
      const upsert = vi
        .mocked(PersonalizationApiClient.prototype.upsertProfile)
        .mockRejectedValueOnce(new Error('temporary'))
        .mockResolvedValue({ profile: completeProfile('visitor') } as never);
      const runtime = createRuntime();
      const events = vi.fn();
      subscriptions.push(runtime.states.eventStream.subscribe(events));
      subscriptions.push(
        runtime.states.eventStream.subscribe((event) => {
          if (event) throw error;
        })
      );
      window.dispatchEvent(new Event('offline'));
      await runtime.track({ event: 'queued' });
      await runtime.trackClick({ entityId: 'hero', entityKind: 'Experience' });
      const handoff = preparedHandoff();
      await expect(
        runtime.hydrateAndTrackCurrentPage(handoff, { routeKey: '/prepared' })
      ).resolves.toEqual({ accepted: true });
      await expect(
        runtime.hydrateAndTrackCurrentPage(handoff, { routeKey: '/prepared' })
      ).resolves.toEqual({ accepted: true });
      expect(events.mock.calls.map(([event]) => event?.type)).toEqual([
        undefined,
        'track',
        'exo_node_click',
        'track',
        'page',
      ]);
      expect(upsert).not.toHaveBeenCalled();
      expect(AnalyticsApiClient.prototype.sendBatchEvents).not.toHaveBeenCalled();
      window.dispatchEvent(new Event('online'));
      await vi.advanceTimersByTimeAsync(500);
      expect(upsert).toHaveBeenCalledTimes(3);
      expect(events).toHaveBeenCalledTimes(5);
      expect(warn).toHaveBeenCalledWith('Event stream subscriber failed', error);
    });

    it('publishes blocked metadata even when the configured callback throws', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const onEventBlocked = vi.fn(() => {
        throw new Error('consumer callback failed');
      });
      const runtime = createRuntime({
        defaults: { consent: false },
        allowedEventTypes: [],
        onEventBlocked,
      });
      const blocked = vi.fn();
      subscriptions.push(runtime.states.blockedEventStream.subscribe(blocked));
      await expect(runtime.track({ event: 'blocked' })).resolves.toEqual({ accepted: false });
      expect(onEventBlocked).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('onEventBlocked callback failed'),
        expect.any(Error)
      );
      expect(blocked).toHaveBeenLastCalledWith(
        expect.objectContaining({ reason: 'consent', method: 'track' })
      );
      expect(runtime.states.eventStream.current).toBeUndefined();
      expect(PersonalizationApiClient.prototype.upsertProfile).not.toHaveBeenCalled();
    });

    it('does not emit refused prepared events, including the otherwise allowed page', async () => {
      const runtime = createRuntime({ defaults: { consent: false }, allowedEventTypes: [] });
      const events = vi.fn();
      subscriptions.push(runtime.states.eventStream.subscribe(events));
      await expect(
        runtime.hydrateAndTrackCurrentPage(preparedHandoff(), { routeKey: '/prepared' })
      ).resolves.toEqual({ accepted: false });
      expect(events.mock.calls).toEqual([[undefined]]);
      expect(PersonalizationApiClient.prototype.upsertProfile).not.toHaveBeenCalled();
    });

    it('resets profile, request and streams atomically while retaining locale and consent', async () => {
      const runtime = createRuntime();
      runtime.setLocale('de-DE');
      await runtime.page();
      runtime.consent({ events: false });
      await runtime.track({ event: 'blocked' });
      const snapshots: unknown[] = [];
      effects.push(
        effect(() => {
          snapshots.push({
            profile: signals.profile.value,
            event: signals.event.value,
            blocked: signals.blockedEvent.value,
            request: signals.personalizationRequestState.value,
          });
        })
      );
      runtime.reset();
      expect(snapshots).toHaveLength(2);
      expect(snapshots.at(-1)).toEqual({
        profile: undefined,
        event: undefined,
        blocked: undefined,
        request: { status: 'idle' },
      });
      expect(runtime.states.locale.current).toBe('de-DE');
      expect(runtime.states.consent.current).toBe(false);
      expect(runtime.states.persistenceConsent.current).toBe(true);
      expect(window.localStorage.getItem(PROFILE_CACHE_KEY)).toBeNull();
    });

    it('disposes old persistence effects and discards late requests when recreated', async () => {
      const response = deferred<{ profile: EventProfile }>();
      vi.mocked(PersonalizationApiClient.prototype.upsertProfile).mockReturnValue(
        response.promise as never
      );
      const old = createRuntime();
      const pending = old.page();
      await vi.waitFor(() =>
        expect(PersonalizationApiClient.prototype.upsertProfile).toHaveBeenCalled()
      );
      old.destroy();
      const replacementProfile = completeProfile('visitor', {
        traits: { generation: 'replacement' },
      });
      const replacement = createRuntime({ defaults: { profile: replacementProfile } });
      const stored = vi.spyOn(window.Storage.prototype, 'setItem');
      replacement.consent(false);
      replacement.consent(true);
      expect(stored.mock.calls.filter(([key]) => key === CONSENT_CACHE_KEY)).toHaveLength(2);
      response.resolve({ profile: completeProfile('late-old-response') });
      await pending;
      expect(replacement.states.profile.current).toEqual(replacementProfile);
      expect(replacement.states.personalizationRequestState.current).toEqual({ status: 'idle' });
      expect(JSON.parse(window.localStorage.getItem(PROFILE_CACHE_KEY)!)).toEqual(
        replacementProfile
      );
    });

    it('leaves external observers caller-owned across destroy and recreation', () => {
      const old = createRuntime();
      const locales = vi.fn();
      const subscription = old.states.locale.subscribe(locales);
      subscriptions.push(subscription);
      old.destroy();
      const replacement = createRuntime({ locale: 'de-DE' });
      expect(locales).toHaveBeenLastCalledWith('de-DE');
      subscription.unsubscribe();
      replacement.setLocale('fr-FR');
      expect(locales).toHaveBeenLastCalledWith('de-DE');
    });

    it('stops the rest of prepared publication when the first event observer replaces its owner', async () => {
      const old = createRuntime();
      window.dispatchEvent(new Event('offline'));
      let replacement: ContentfulExperiences | undefined;
      const emitted: string[] = [];
      const subscription = old.states.eventStream.subscribe((event) => {
        if (event === undefined) return;
        emitted.push(event.type);
        subscription.unsubscribe();
        old.destroy();
        replacement = createRuntime();
      });
      subscriptions.push(subscription);
      await old.hydrateAndTrackCurrentPage(preparedHandoff(), { routeKey: '/prepared' });
      await vi.advanceTimersByTimeAsync(0);
      expect(emitted).toEqual(['track']);
      expect(replacement).toBeDefined();
      expect(replacement!.states.eventStream.current).toBeUndefined();
    });

    it('streams embedded events before Delivery and validates the whole batch before publication', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const error = new Error('diagnostic subscriber failed');
      const runtime = createRuntime();
      const events = vi.fn((event) => {
        if (event) throw error;
      });
      subscriptions.push(runtime.states.eventStream.subscribe(events));
      const fetch = vi
        .spyOn(RuntimeContentfulExperiences.prototype, 'fetchExperience')
        .mockImplementation(async () => {
          expect(events).toHaveBeenCalledTimes(2);
          return { nodes: [] } as never;
        });
      const page = runtime.eventBuilder.buildPageView();
      await runtime.fetchExperience(
        { experienceId: 'embedded', personalization: { events: [page] } },
        { config: { components: {} } }
      );
      expect(events.mock.calls[1]?.[0].messageId).toBe(page.messageId);
      expect(warn).toHaveBeenCalledWith('Event stream subscriber failed', error);
      events.mockClear();
      // No partial stream publication when a later embedded event is invalid.
      await expect(
        runtime.fetchExperience(
          {
            experienceId: 'invalid',
            personalization: {
              events: [page, { ...page, timestamp: 123 } as never],
            },
          },
          { config: { components: {} } }
        )
      ).rejects.toThrow('Invalid Experience personalization');
      expect(events).not.toHaveBeenCalled();
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('rejects an embedded fetch superseded by its first event observer resetting', async () => {
      const runtime = createRuntime();
      const fetch = vi
        .spyOn(RuntimeContentfulExperiences.prototype, 'fetchExperience')
        .mockResolvedValue({ nodes: [] } as never);
      const events = vi.fn();
      subscriptions.push(runtime.states.eventStream.subscribe(events));
      const subscription = runtime.states.eventStream.subscribe((event) => {
        if (event === undefined) return;
        subscription.unsubscribe();
        runtime.reset();
      });
      subscriptions.push(subscription);
      await expect(
        runtime.fetchExperience(
          {
            experienceId: 'superseded',
            personalization: {
              events: [
                runtime.eventBuilder.buildTrack({ event: 'first' }),
                runtime.eventBuilder.buildPageView(),
              ],
            },
          },
          { config: { components: {} } }
        )
      ).rejects.toThrow('superseded');
      expect(
        events.mock.calls.filter(([event]) => event !== undefined).map(([event]) => event.type)
      ).toEqual(['track']);
      expect(runtime.states.eventStream.current).toBeUndefined();
      expect(runtime.states.profile.current).toBeUndefined();
      expect(fetch).not.toHaveBeenCalled();
    });

    it.each([
      ['track', 'reset'],
      ['click', 'withdraw'],
    ] as const)(
      'cancels ordinary %s delivery when its event subscriber triggers %s',
      async (method, action) => {
        const runtime = createRuntime();
        await vi.advanceTimersByTimeAsync(0);
        window.dispatchEvent(new Event('offline'));
        let handled = false;
        const subscription = runtime.states.eventStream.subscribe((event) => {
          if (event === undefined || handled) return;
          handled = true;
          if (action === 'reset') runtime.reset();
          else runtime.consent({ events: false });
        });
        subscriptions.push(subscription);

        if (method === 'track') {
          await expect(runtime.track({ event: 'cancelled' })).resolves.toEqual({ accepted: false });
        } else {
          await expect(
            runtime.trackClick({ entityId: 'hero', entityKind: 'Experience' })
          ).resolves.toEqual({ accepted: true });
        }
        expect(handled).toBe(true);
        if (action === 'reset') {
          expect(runtime.states.eventStream.current).toBeUndefined();
          expect(runtime.states.profile.current).toBeUndefined();
        } else {
          expect(runtime.states.consent.current).toBe(false);
          runtime.consent({ events: true });
        }
        expect(PersonalizationApiClient.prototype.upsertProfile).not.toHaveBeenCalled();
        expect(AnalyticsApiClient.prototype.sendBatchEvents).not.toHaveBeenCalled();

        window.dispatchEvent(new Event('online'));
        await runtime.flush();
        await vi.advanceTimersByTimeAsync(30_000);
        expect(PersonalizationApiClient.prototype.upsertProfile).not.toHaveBeenCalled();
        expect(AnalyticsApiClient.prototype.sendBatchEvents).not.toHaveBeenCalled();
      }
    );
  });
});

describe('identity', () => {
  // The identity cookie is what lets a server recognise a visitor the browser SDK has
  // identified. These cases follow the Optimization SDK's own lifecycle tests.

  const { create: createRuntime, destroy: destroyRuntimes } = createSdkHarness(
    { locale: 'en-US' },
    ContentfulExperiences
  );

  function respondWith(profileId: string) {
    vi.mocked(PersonalizationApiClient.prototype.upsertProfile).mockResolvedValue({
      profile: profileFixture(profileId),
    } as never);
  }

  function handoff(overrides: Partial<ExperiencesHandoff> = {}): ExperiencesHandoff {
    return {
      spaceId: 'space',
      environmentId: 'environment',
      cache: { scope: 'private-request' },
      ...overrides,
    };
  }

  beforeEach(() => {
    // A fresh spy per test, so a test reads only the requests it made itself.
    vi.restoreAllMocks();
    vi.spyOn(PersonalizationApiClient.prototype, 'upsertProfile').mockResolvedValue({
      profile: profileFixture('api-profile'),
    } as never);
    window.localStorage.clear();
    removeCookie(ANONYMOUS_ID_COOKIE);
    removeCookie(ANONYMOUS_ID_COOKIE_LEGACY);
  });

  afterEach(() => {
    destroyRuntimes();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('writing the identity', () => {
    it.each([true, undefined, false])(
      'persists profile identity only for granted persistence (%s)',
      (persistence) => {
        seedConsent({ events: persistence === undefined ? undefined : true, persistence });
        createRuntime({ defaults: { profile: profileFixture('visitor-1') } });
        expect(getCookie(ANONYMOUS_ID_COOKIE)).toBe(persistence ? 'visitor-1' : undefined);
        expect(window.localStorage.getItem(ANONYMOUS_ID_KEY)).toBe(
          persistence ? 'visitor-1' : null
        );
      }
    );

    it('keeps the in-memory profile when persistence is denied', () => {
      seedConsent({ events: true, persistence: false });

      const runtime = createRuntime({ defaults: { profile: profileFixture('visitor-1') } });

      expect(runtime.states.profile.current).toEqual(profileFixture('visitor-1'));
    });

    it('writes the identity from a profile-producing response', async () => {
      seedConsent({ events: true, persistence: true });
      respondWith('response-profile');
      const runtime = createRuntime();

      await runtime.page();

      expect(getCookie(ANONYMOUS_ID_COOKIE)).toBe('response-profile');
      expect(window.localStorage.getItem(ANONYMOUS_ID_KEY)).toBe('response-profile');
    });

    it('writes the identity from an XDA profile id on a fetched plan', async () => {
      seedConsent({ events: true, persistence: true });
      const runtime = createRuntime();
      vi.spyOn(RuntimeContentfulExperiences.prototype, 'fetchExperience').mockResolvedValue({
        nodes: [],
        personalization: { profile: profileFixture('xda-profile') },
      } as never);

      await runtime.fetchExperience({ experienceId: 'landing' }, { config: { components: {} } });

      expect(getCookie(ANONYMOUS_ID_COOKIE)).toBe('xda-profile');
      expect(runtime.states.profile.current).toEqual(profileFixture('xda-profile'));
      expect(JSON.parse(window.localStorage.getItem(PROFILE_CACHE_KEY)!)).toEqual(
        profileFixture('xda-profile')
      );
    });

    it('applies the configured cookie scope', () => {
      seedConsent({ events: true, persistence: true });
      const { writes, restore } = captureCookieWrites();

      createRuntime({
        defaults: { profile: profileFixture('visitor-1') },
        cookie: { domain: 'example.com', path: '/shop', sameSite: 'lax', secure: true, expires: 7 },
      });
      restore();

      expect(writes[0]).toMatch(
        /^ctfl-opt-aid=visitor-1; Path=\/shop; Domain=example\.com; SameSite=lax; Secure; Expires=/
      );
    });
  });

  describe('deleting the identity in the scope it was written in', () => {
    const scope = { domain: 'example.com', path: '/shop', sameSite: 'none', secure: true } as const;
    const scopeText = 'Path=/shop; Domain=example.com; SameSite=none; Secure';
    it.each(['withdraw', 'reset'] as const)(
      '%s deletes the cookie with the configured scope',
      (transition) => {
        seedConsent({ events: true, persistence: true });
        const { writes, restore } = captureCookieWrites();
        const runtime = createRuntime({
          defaults: { profile: profileFixture('visitor-1') },
          cookie: scope,
        });
        if (transition === 'withdraw') runtime.consent({ persistence: false });
        else runtime.reset();
        restore();
        const deletions = writes.filter((write) => write.includes('Expires=Thu, 01 Jan 1970'));
        expect(deletions.length).toBeGreaterThan(0);
        expect(deletions.every((write) => write.includes(scopeText))).toBe(true);
      }
    );
  });

  describe('adopting an identity the browser already holds', () => {
    it('adopts a server cookie at startup when persistence is granted', async () => {
      seedConsent({ events: true, persistence: true });
      setCookie(ANONYMOUS_ID_COOKIE, 'server-id');

      const runtime = createRuntime();
      expect(window.localStorage.getItem(ANONYMOUS_ID_KEY)).toBe('server-id');
      await runtime.page();

      // The first request carries the identity the server wrote.
      expect(
        vi.mocked(PersonalizationApiClient.prototype.upsertProfile).mock.calls[0]![0].profileId
      ).toBe('server-id');
      // The response's profile is then the authoritative identity, as in the Optimization SDK.
      expect(getCookie(ANONYMOUS_ID_COOKIE)).toBe('api-profile');
    });

    it('does not adopt a server cookie at startup when persistence is undecided', async () => {
      setCookie(ANONYMOUS_ID_COOKIE, 'server-id');

      const runtime = createRuntime();
      await runtime.page();

      expect(
        vi.mocked(PersonalizationApiClient.prototype.upsertProfile).mock.calls[0]![0].profileId
      ).toBeUndefined();
      expect(window.localStorage.getItem(ANONYMOUS_ID_KEY)).toBeNull();
    });

    it('adopts a server cookie when persistence is granted after initialization', async () => {
      setCookie(ANONYMOUS_ID_COOKIE, 'server-id');
      const runtime = createRuntime();
      expect(window.localStorage.getItem(ANONYMOUS_ID_KEY)).toBeNull();

      runtime.consent({ persistence: true });
      expect(window.localStorage.getItem(ANONYMOUS_ID_KEY)).toBe('server-id');
      expect(getCookie(ANONYMOUS_ID_COOKIE)).toBe('server-id');
      await runtime.page();

      expect(
        vi.mocked(PersonalizationApiClient.prototype.upsertProfile).mock.calls[0]![0].profileId
      ).toBe('server-id');
    });

    it('writes an identity already held in memory when persistence is granted later', () => {
      const runtime = createRuntime({ defaults: { profile: profileFixture('visitor-1') } });
      expect(getCookie(ANONYMOUS_ID_COOKIE)).toBeUndefined();

      runtime.consent({ persistence: true });

      expect(getCookie(ANONYMOUS_ID_COOKIE)).toBe('visitor-1');
      expect(window.localStorage.getItem(ANONYMOUS_ID_KEY)).toBe('visitor-1');
    });

    it('migrates a legacy cookie when persistence is granted after initialization', () => {
      setCookie(ANONYMOUS_ID_COOKIE_LEGACY, 'legacy-id');
      const runtime = createRuntime();

      runtime.consent({ persistence: true });

      expect(window.localStorage.getItem(ANONYMOUS_ID_KEY)).toBe('legacy-id');
      expect(getCookie(ANONYMOUS_ID_COOKIE)).toBe('legacy-id');
      expect(getCookie(ANONYMOUS_ID_COOKIE_LEGACY)).toBeUndefined();
    });

    it('keeps the matching profile when the server cookie is the same identity', () => {
      seedConsent({ events: true, persistence: true });
      setCookie(ANONYMOUS_ID_COOKIE, 'server-id');

      const runtime = createRuntime({ defaults: { profile: profileFixture('server-id') } });

      expect(runtime.states.profile.current).toEqual(profileFixture('server-id'));
      expect(getCookie(ANONYMOUS_ID_COOKIE)).toBe('server-id');
    });

    it('replaces a profile that belongs to a different identity than the server cookie', () => {
      seedConsent({ events: true, persistence: true });
      window.localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profileFixture('old-visitor')));
      setCookie(ANONYMOUS_ID_COOKIE, 'server-id');

      const runtime = createRuntime();

      expect(runtime.states.profile.current).toBeUndefined();
      expect(getCookie(ANONYMOUS_ID_COOKIE)).toBe('server-id');
    });
  });

  describe('reconciling a server cookie with the identity held', () => {
    /** Records every write to the cookie jar and to the stored anonymous id. */
    function recordWrites() {
      const { writes: cookieWrites, restore } = captureCookieWrites(document.cookie);
      const setItem = vi.spyOn(window.Storage.prototype, 'setItem');
      const removeItem = vi.spyOn(window.Storage.prototype, 'removeItem');
      return {
        cookieWrites,
        storedIdWrites: () =>
          [...setItem.mock.calls, ...removeItem.mock.calls].filter(
            ([key]) => key === ANONYMOUS_ID_KEY
          ),
        restore,
      };
    }

    it('reconciles the cookie before persisting the profile, then restores the captured cookie as Optimization does', () => {
      seedConsent({ events: true, persistence: true });
      window.localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profileFixture('old-visitor')));
      setCookie(ANONYMOUS_ID_COOKIE, 'server-id');
      const { cookieWrites, restore } = recordWrites();

      const runtime = createRuntime();
      restore();

      expect(runtime.states.profile.current).toBeUndefined();
      const identityWrites = cookieWrites
        .map((write) => write.split(';')[0] ?? '')
        .filter((write) => write.startsWith('ctfl-opt-aid='));
      // Optimization registers its persistence-consent effect before its profile effect.
      // The conflicting profile is reset before it can be persisted; the profile effect
      // then synchronizes the incoming visitor's identity.
      expect(identityWrites).toEqual([
        'ctfl-opt-aid=',
        'ctfl-opt-aid=server-id',
        'ctfl-opt-aid=server-id',
      ]);
      expect(window.localStorage.getItem(ANONYMOUS_ID_KEY)).toBe('server-id');
    });

    it('refreshes the cookie once when it already matches the stored id and the profile, as Optimization does', () => {
      seedConsent({ events: true, persistence: true });
      window.localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profileFixture('server-id')));
      window.localStorage.setItem(ANONYMOUS_ID_KEY, 'server-id');
      setCookie(ANONYMOUS_ID_COOKIE, 'server-id');
      const { cookieWrites, restore } = recordWrites();

      createRuntime();
      restore();

      // Reconciliation finds nothing to change; the profile synchronization then refreshes expiry.
      expect(cookieWrites.map((write) => write.split(';')[0])).toEqual(['ctfl-opt-aid=server-id']);
    });

    it('writes the active profile over a different stored identity when persistence is granted later', () => {
      setCookie(ANONYMOUS_ID_COOKIE, 'cookie-id');
      window.localStorage.setItem(ANONYMOUS_ID_KEY, 'cookie-id');
      const runtime = createRuntime({ defaults: { profile: profileFixture('profile-id') } });
      expect(getCookie(ANONYMOUS_ID_COOKIE)).toBe('cookie-id');

      runtime.consent({ persistence: true });

      expect(runtime.states.profile.current).toEqual(profileFixture('profile-id'));
      expect(getCookie(ANONYMOUS_ID_COOKIE)).toBe('profile-id');
      expect(window.localStorage.getItem(ANONYMOUS_ID_KEY)).toBe('profile-id');
    });
    it.each(['configured', 'persisted'] as const)(
      'restores the incoming cookie over a conflicting %s profile at startup',
      (source) => {
        seedConsent({ events: true, persistence: true });
        setCookie(ANONYMOUS_ID_COOKIE, 'cookie-id');
        window.localStorage.setItem(ANONYMOUS_ID_KEY, 'cookie-id');
        const profile = profileFixture('profile-id');
        if (source === 'persisted')
          window.localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile));
        const runtime = createRuntime(source === 'configured' ? { defaults: { profile } } : {});
        expect(runtime.states.profile.current).toBeUndefined();
        expect(getCookie(ANONYMOUS_ID_COOKIE)).toBe('cookie-id');
        expect(window.localStorage.getItem(ANONYMOUS_ID_KEY)).toBe('cookie-id');
        if (source === 'persisted')
          expect(window.localStorage.getItem(PROFILE_CACHE_KEY)).toBeNull();
      }
    );

    it('keeps a configured profile that matches the incoming cookie at startup', () => {
      seedConsent({ events: true, persistence: true });
      setCookie(ANONYMOUS_ID_COOKIE, 'same-id');
      window.localStorage.setItem(ANONYMOUS_ID_KEY, 'same-id');

      const runtime = createRuntime({ defaults: { profile: profileFixture('same-id') } });

      expect(runtime.states.profile.current).toEqual(profileFixture('same-id'));
      expect(getCookie(ANONYMOUS_ID_COOKIE)).toBe('same-id');
    });

    it('migrates a legacy cookie to the current one, then synchronizes the effective identity', () => {
      seedConsent({ events: true, persistence: true });
      setCookie(ANONYMOUS_ID_COOKIE_LEGACY, 'legacy-id');
      window.localStorage.setItem(ANONYMOUS_ID_KEY, 'legacy-id');
      const { cookieWrites, restore } = recordWrites();

      createRuntime();
      restore();

      const written = cookieWrites.filter((write) => write.startsWith('ctfl-opt-aid=legacy-id'));
      // Initial consent reconciliation, profile persistence, then the captured legacy cookie.
      expect(written).toHaveLength(3);
    });
  });

  describe('withdrawing persistence consent', () => {
    it('removes the cookie and stored id but keeps the in-memory profile', () => {
      seedConsent({ events: true, persistence: true });
      const runtime = createRuntime({ defaults: { profile: profileFixture('visitor-1') } });
      expect(getCookie(ANONYMOUS_ID_COOKIE)).toBe('visitor-1');

      runtime.consent({ persistence: false });

      expect(getCookie(ANONYMOUS_ID_COOKIE)).toBeUndefined();
      expect(window.localStorage.getItem(ANONYMOUS_ID_KEY)).toBeNull();
      expect(runtime.states.profile.current).toEqual(profileFixture('visitor-1'));
    });

    it('removes the legacy cookie too', () => {
      seedConsent({ events: true, persistence: true });
      const runtime = createRuntime({ defaults: { profile: profileFixture('visitor-1') } });
      setCookie(ANONYMOUS_ID_COOKIE_LEGACY, 'visitor-1');

      runtime.consent({ persistence: false });

      expect(getCookie(ANONYMOUS_ID_COOKIE_LEGACY)).toBeUndefined();
    });

    it('leaves event consent independent', async () => {
      seedConsent({ events: true, persistence: true });
      const runtime = createRuntime({ defaults: { profile: profileFixture('visitor-1') } });

      runtime.consent({ persistence: false });

      await expect(runtime.track({ event: 'purchase' })).resolves.toMatchObject({ accepted: true });
    });
    it.each(['persistence', 'events', 'reset'] as const)(
      'guards identity from late responses after %s',
      async (transition) => {
        seedConsent({ events: true, persistence: true });
        const response = deferred<{ profile: EventProfile }>();
        vi.mocked(PersonalizationApiClient.prototype.upsertProfile).mockReturnValue(
          response.promise as never
        );
        const runtime = createRuntime({ defaults: { profile: profileFixture('visitor-1') } });
        const pending = runtime.track({ event: 'in-flight' });
        await vi.waitFor(() =>
          expect(PersonalizationApiClient.prototype.upsertProfile).toHaveBeenCalled()
        );
        if (transition === 'reset') runtime.reset();
        else runtime.consent({ [transition]: false });
        response.resolve({ profile: profileFixture('late-profile') });
        await pending;
        expect(getCookie(ANONYMOUS_ID_COOKIE)).toBe(
          transition === 'events' ? 'visitor-1' : undefined
        );
        expect(window.localStorage.getItem(ANONYMOUS_ID_KEY)).toBe(
          transition === 'events' ? 'visitor-1' : null
        );
        expect(runtime.states.profile.current?.id).toBe(
          transition === 'events'
            ? 'visitor-1'
            : transition === 'persistence'
              ? 'late-profile'
              : undefined
        );
      }
    );
  });

  describe('startup defaults', () => {
    it('writes the identity when a default grants persistence', () => {
      createRuntime({ defaults: { profile: profileFixture('visitor-1'), consent: true } });

      expect(getCookie(ANONYMOUS_ID_COOKIE)).toBe('visitor-1');
    });

    it('removes a stored identity when a default denies persistence', () => {
      seedConsent({ events: true, persistence: true });
      setCookie(ANONYMOUS_ID_COOKIE, 'visitor-1');
      window.localStorage.setItem(ANONYMOUS_ID_KEY, 'visitor-1');

      createRuntime({ defaults: { persistenceConsent: false } });

      expect(getCookie(ANONYMOUS_ID_COOKIE)).toBeUndefined();
      expect(window.localStorage.getItem(ANONYMOUS_ID_KEY)).toBeNull();
    });
  });

  describe('handoff identity', () => {
    it('writes the profile a private handoff carries', async () => {
      seedConsent({ events: true, persistence: true });
      const runtime = createRuntime();

      await runtime.hydrateAndTrackCurrentPage(
        handoff({ state: { profile: profileFixture('server-profile') } }),
        {
          routeKey: '/first',
        }
      );

      expect(getCookie(ANONYMOUS_ID_COOKIE)).toBe('server-profile');
      expect(window.localStorage.getItem(ANONYMOUS_ID_KEY)).toBe('server-profile');
    });

    it('writes the identity a handoff carries when it replays the page and no profile exists yet', async () => {
      seedConsent({ events: true, persistence: true });
      const runtime = createRuntime();

      await runtime.hydrateAndTrackCurrentPage(handoff({ profileId: 'server-profile' }), {
        routeKey: '/first',
        buildPayload: () => ({}),
      });

      expect(
        vi.mocked(PersonalizationApiClient.prototype.upsertProfile).mock.calls[0]![0].profileId
      ).toBe('server-profile');
    });

    it('does not write a handoff identity without persistence consent', async () => {
      const runtime = createRuntime();

      await runtime.hydrateAndTrackCurrentPage(
        handoff({ state: { profile: profileFixture('server-profile') } }),
        {
          routeKey: '/first',
        }
      );

      expect(getCookie(ANONYMOUS_ID_COOKIE)).toBeUndefined();
    });

    it.each([
      ['static', { scope: 'static' }],
      ['public permutation', { scope: 'public-permutation', key: 'variant-a' }],
    ] as const)(
      'does not let a profileless %s handoff erase an existing identity',
      async (_name, cache) => {
        seedConsent({ events: true, persistence: true });
        const runtime = createRuntime({ defaults: { profile: profileFixture('visitor-1') } });

        await runtime.hydrateAndTrackCurrentPage(handoff({ cache }), {
          routeKey: '/first',
        });

        expect(getCookie(ANONYMOUS_ID_COOKIE)).toBe('visitor-1');
        expect(window.localStorage.getItem(ANONYMOUS_ID_KEY)).toBe('visitor-1');
      }
    );

    it.each([
      ['static', { scope: 'static' }],
      ['public permutation', { scope: 'public-permutation', key: 'variant-a' }],
    ] as const)(
      'keeps an identity held only in storage when a profileless %s handoff arrives',
      async (_name, cache) => {
        seedConsent({ events: true, persistence: true });
        // A returning visitor: the cookie and stored id exist, but no profile is in memory yet.
        setCookie(ANONYMOUS_ID_COOKIE, 'visitor-1');
        window.localStorage.setItem(ANONYMOUS_ID_KEY, 'visitor-1');
        const runtime = createRuntime();
        expect(runtime.states.profile.current).toBeUndefined();

        await runtime.hydrateAndTrackCurrentPage(handoff({ cache }), {
          routeKey: '/first',
          buildPayload: () => ({}),
        });

        expect(getCookie(ANONYMOUS_ID_COOKIE)).not.toBeUndefined();
        expect(
          vi.mocked(PersonalizationApiClient.prototype.upsertProfile).mock.calls[0]![0].profileId
        ).toBe('visitor-1');
      }
    );

    it('does not replace an existing identity with a different one carried by a handoff', async () => {
      seedConsent({ events: true, persistence: true });
      const runtime = createRuntime({ defaults: { profile: profileFixture('visitor-1') } });

      await runtime.hydrateAndTrackCurrentPage(handoff({ profileId: 'someone-else' }), {
        routeKey: '/first',
        buildPayload: () => ({}),
      });

      // The held identity is what the request is sent under, not the handoff's.
      expect(
        vi.mocked(PersonalizationApiClient.prototype.upsertProfile).mock.calls[0]![0].profileId
      ).toBe('visitor-1');
    });
  });

  describe('the effective identity when only the stored id is held', () => {
    // A returning visitor: the cookie and stored id exist, but no complete profile is in memory.
    function returningVisitor() {
      seedConsent({ events: true, persistence: true });
      setCookie(ANONYMOUS_ID_COOKIE, 'visitor-1');
      window.localStorage.setItem(ANONYMOUS_ID_KEY, 'visitor-1');
      return createRuntime();
    }

    function spyOnFetch() {
      return vi
        .spyOn(RuntimeContentfulExperiences.prototype, 'fetchExperience')
        .mockResolvedValue({ nodes: [] } as never);
    }

    it('is not replaced by the identity an incoming handoff carries', async () => {
      const runtime = returningVisitor();
      expect(runtime.states.profile.current).toBeUndefined();

      await runtime.hydrateAndTrackCurrentPage(handoff({ profileId: 'someone-else' }), {
        routeKey: '/first',
        buildPayload: () => ({}),
      });

      expect(
        vi.mocked(PersonalizationApiClient.prototype.upsertProfile).mock.calls[0]![0].profileId
      ).toBe('visitor-1');
    });

    it('is sent with the first fetch', async () => {
      const runtime = returningVisitor();
      const fetch = spyOnFetch();

      await runtime.fetchExperience({ experienceId: 'landing' }, { config: { components: {} } });

      expect(fetch.mock.calls[0]![0].personalization?.profileId).toBe('visitor-1');
    });

    it('yields to an explicit profile on the fetch call', async () => {
      const runtime = returningVisitor();
      const fetch = spyOnFetch();

      await runtime.fetchExperience(
        { experienceId: 'landing', personalization: { profileId: 'explicit' } },
        { config: { components: {} } }
      );

      expect(fetch.mock.calls[0]![0].personalization?.profileId).toBe('explicit');
    });

    it('is not sent when persistence is not granted', async () => {
      setCookie(ANONYMOUS_ID_COOKIE, 'visitor-1');
      window.localStorage.setItem(ANONYMOUS_ID_KEY, 'visitor-1');
      const runtime = createRuntime();
      const fetch = spyOnFetch();

      await runtime.fetchExperience({ experienceId: 'landing' }, { config: { components: {} } });

      expect(fetch.mock.calls[0]![0].personalization?.profileId).toBeUndefined();
    });
  });

  describe('clearing a legacy stored identity', () => {
    it('removes a legacy-only stored id when startup defaults deny persistence, so a later grant does not revive it', () => {
      seedConsent({ events: true, persistence: true });
      window.localStorage.setItem(ANONYMOUS_ID_KEY_LEGACY, 'legacy-id');
      const runtime = createRuntime({ defaults: { persistenceConsent: false } });

      expect(window.localStorage.getItem(ANONYMOUS_ID_KEY_LEGACY)).toBeNull();
      runtime.consent({ persistence: true });

      expect(getCookie(ANONYMOUS_ID_COOKIE)).toBeUndefined();
      expect(window.localStorage.getItem(ANONYMOUS_ID_KEY)).toBeNull();
    });

    it('removes a legacy-only stored id when persistence is withdrawn', () => {
      seedConsent({ events: true, persistence: true });
      const runtime = createRuntime();
      window.localStorage.setItem(ANONYMOUS_ID_KEY_LEGACY, 'legacy-id');

      runtime.consent({ persistence: false });
      runtime.consent({ persistence: true });

      expect(getCookie(ANONYMOUS_ID_COOKIE)).toBeUndefined();
    });

    it('removes a legacy-only stored id on reset(), so a later grant does not revive it', () => {
      seedConsent({ events: true, persistence: true });
      const runtime = createRuntime();
      window.localStorage.setItem(ANONYMOUS_ID_KEY_LEGACY, 'legacy-id');

      runtime.reset();
      runtime.consent({ persistence: true });

      expect(window.localStorage.getItem(ANONYMOUS_ID_KEY_LEGACY)).toBeNull();
      expect(getCookie(ANONYMOUS_ID_COOKIE)).toBeUndefined();
    });
  });

  describe('reset and destroy', () => {
    it('reset() clears the cookie, the stored id and the stored profile', () => {
      seedConsent({ events: true, persistence: true });
      const runtime = createRuntime({ defaults: { profile: profileFixture('visitor-1') } });
      expect(getCookie(ANONYMOUS_ID_COOKIE)).toBe('visitor-1');

      runtime.reset();

      expect(getCookie(ANONYMOUS_ID_COOKIE)).toBeUndefined();
      expect(window.localStorage.getItem(ANONYMOUS_ID_KEY)).toBeNull();
      expect(window.localStorage.getItem(PROFILE_CACHE_KEY)).toBeNull();
    });

    it('destroy() leaves the approved identity in place', () => {
      seedConsent({ events: true, persistence: true });
      const runtime = createRuntime({ defaults: { profile: profileFixture('visitor-1') } });

      runtime.destroy();

      expect(getCookie(ANONYMOUS_ID_COOKIE)).toBe('visitor-1');
      expect(window.localStorage.getItem(ANONYMOUS_ID_KEY)).toBe('visitor-1');
      expect(window.localStorage.getItem(PROFILE_CACHE_KEY)).not.toBeNull();
    });
  });
});

describe('browser owner wiring', () => {
  const { create: createRuntime, destroy: destroyRuntimes } = createSdkHarness(
    { locale: 'en-US' },
    ContentfulExperiences
  );

  // A returning visitor who has already opted in to events and persistence.
  beforeEach(() => {
    seedConsent({ events: true, persistence: true });
  });

  afterEach(() => {
    destroyRuntimes();
    vi.restoreAllMocks();
    window.localStorage.clear();
    clearIdentityCookies();
    window.history.replaceState({}, '', '/');
    document.title = '';
  });

  describe('state persistence and consent', () => {
    it('continues when LocalStorage is unavailable', () => {
      vi.spyOn(window.Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('storage blocked');
      });
      vi.spyOn(window.Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('storage blocked');
      });

      const runtime = createRuntime({ defaults: { profile: completeProfile('browser-profile') } });

      expect(runtime.states.profile.current).toEqual(completeProfile('browser-profile'));
    });

    it('updates and persists the complete profile from Personalization events', async () => {
      const runtime = createRuntime({
        defaults: { profile: completeProfile('initial-profile') },
      });
      const updatedProfile = completeProfile('updated-profile', { traits: { plan: 'pro' } });
      const optimization = mockOptimization(runtime, updatedProfile);

      const track = runtime.track({ event: 'started' });
      await track;
      expect(optimization.upsertProfile).toHaveBeenCalledOnce();

      expect(optimization.upsertProfile).toHaveBeenCalledWith(
        expect.objectContaining({ profileId: 'initial-profile' }),
        { locale: 'en-US' }
      );
      expect(runtime.states.profile.current).toEqual(updatedProfile);
      expect(JSON.parse(window.localStorage.getItem(PROFILE_CACHE_KEY)!)).toEqual(updatedProfile);
    });

    it('resets the profile before establishing a new one', async () => {
      const runtime = createRuntime({
        defaults: { profile: completeProfile('first-profile') },
      });
      const optimization = mockOptimization(runtime);

      runtime.reset();
      await expect(
        runtime.trackClick({ entityId: 'experience', entityKind: 'Experience' })
      ).resolves.toEqual({ accepted: true });
      await runtime.flush();
      expect(optimization.sendBatchEvents).not.toHaveBeenCalled();

      await runtime.page();
      await runtime.trackClick({ entityId: 'experience', entityKind: 'Experience' });
      await runtime.flush();

      expect(optimization.sendBatchEvents).toHaveBeenCalledWith([
        expect.objectContaining({ profile: completeProfile('updated-profile') }),
      ]);
    });

    it('does not restore a prior profile from an in-flight Personalization response', async () => {
      let resolveResponse!: (value: { profile: EventProfile }) => void;
      const response = new Promise<{ profile: EventProfile }>((resolve) => {
        resolveResponse = resolve;
      });
      const runtime = createRuntime({
        defaults: { profile: completeProfile('first-profile') },
      });
      const optimization = mockOptimization(runtime);
      optimization.upsertProfile.mockReturnValueOnce(response as never);

      const pending = runtime.track({ event: 'started-before-session-change' });
      await vi.waitFor(() => expect(optimization.upsertProfile).toHaveBeenCalledOnce());
      runtime.reset();
      await runtime.page();
      resolveResponse({ profile: completeProfile('first-profile-from-api') });

      await pending;
      expect(runtime.states.profile.current).toEqual(completeProfile('updated-profile'));
    });

    it('uses the SDK locale for ordinary Personalization independently of event overrides', async () => {
      const runtime = createRuntime({ locale: 'en-US' });
      const { upsertProfile } = mockOptimization(runtime);
      await runtime.identify({ userId: 'visitor', locale: 'fr-FR' });
      expect(upsertProfile.mock.calls[0]?.[0].events[0]?.context.locale).toBe('fr-FR');
      expect(upsertProfile.mock.calls[0]?.[1]).toEqual({ locale: 'en-US' });

      window.dispatchEvent(new Event('offline'));
      await runtime.track({ event: 'queued', locale: 'it-IT' });
      expect(upsertProfile).toHaveBeenCalledTimes(1);
      runtime.setLocale('de-DE');
      window.dispatchEvent(new Event('online'));
      await vi.waitFor(() => expect(upsertProfile).toHaveBeenCalledTimes(2));
      expect(upsertProfile.mock.calls[1]?.[0].events[0]?.context.locale).toBe('it-IT');
      expect(upsertProfile.mock.calls[1]?.[1]).toEqual({ locale: 'de-DE' });

      await runtime.page({ locale: 'es-ES' });
      expect(upsertProfile.mock.calls[2]?.[0].events[0]?.context.locale).toBe('es-ES');
      expect(upsertProfile.mock.calls[2]?.[1]).toEqual({ locale: 'de-DE' });
    });

    it('treats a boolean as both axes and an object as independent axes', () => {
      const runtime = createRuntime();

      runtime.consent(true);
      expect({
        events: runtime.states.consent.current,
        persistence: runtime.states.persistenceConsent.current,
      }).toEqual({ events: true, persistence: true });

      runtime.consent({ persistence: false });
      expect({
        events: runtime.states.consent.current,
        persistence: runtime.states.persistenceConsent.current,
      }).toEqual({ events: true, persistence: false });

      runtime.consent(false);
      expect({
        events: runtime.states.consent.current,
        persistence: runtime.states.persistenceConsent.current,
      }).toEqual({ events: false, persistence: false });
    });

    it('reports blocked events to onEventBlocked and drops them', async () => {
      window.localStorage.clear();
      const onEventBlocked = vi.fn();
      const runtime = createRuntime({
        onEventBlocked,
        defaults: { profile: completeProfile('visitor') },
      });
      const optimization = mockOptimization(runtime, completeProfile('visitor'));

      await expect(runtime.track({ event: 'purchase' })).resolves.toEqual({ accepted: false });

      expect(optimization.upsertProfile).not.toHaveBeenCalled();
      expect(onEventBlocked).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'consent', method: 'track' })
      );
      runtime.consent(true);
      expect(optimization.upsertProfile).not.toHaveBeenCalled();
    });
  });
});
