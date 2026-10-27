// @vitest-environment jsdom

import {
  ContentfulExperiences as RuntimeContentfulExperiences,
  CONSENT_CACHE_KEY,
  EventBuilder,
  PERSISTENCE_CONSENT_CACHE_KEY,
  PROFILE_CACHE_KEY,
  type EventProfile,
  type ExperiencesHandoff,
} from '@contentful/experiences-runtime';
import { ExperienceApiClient, InsightsApiClient } from '@contentful/optimization-api-client';
import { effect } from '@preact/signals-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ContentfulExperiences, type ExperiencesWebConfig } from './contentful-experiences.js';
import { hydrateOptimizationData } from './bridge-support.js';
import type { Subscription } from './signals/Observable.js';
import * as signals from './signals/signals.js';
import { clearIdentityCookies, seedConsent } from './test-fixtures/consent.js';
import { deferred, setDocumentVisibility } from './test-fixtures/dom.js';

const runtimes = new Set<ContentfulExperiences>();
const subscriptions: Subscription[] = [];
const effects: (() => void)[] = [];

function createRuntime(overrides: Partial<ExperiencesWebConfig> = {}) {
  const runtime = new ContentfulExperiences({
    spaceId: 'space',
    environmentId: 'environment',
    locale: 'en-US',
    delivery: { accessToken: 'delivery-token' },
    defaults: { profile: { id: 'visitor' } },
    ...overrides,
  });
  runtimes.add(runtime);
  return runtime;
}

function preparedHandoff(): ExperiencesHandoff {
  const builder = new EventBuilder({
    channel: 'server',
    library: { name: 'test', version: '1' },
    getConsent: () => true,
  });
  return {
    spaceId: 'space',
    environmentId: 'environment',
    profileId: 'visitor',
    cache: { scope: 'private-request' },
    replay: {
      routeKey: '/prepared',
      events: [builder.buildTrack({ event: 'prepared' }), builder.buildPageView()],
    },
  };
}

beforeEach(() => {
  seedConsent({ events: true, persistence: true });
  vi.useFakeTimers();
  setDocumentVisibility('visible');
  vi.spyOn(ExperienceApiClient.prototype, 'upsertProfile').mockResolvedValue({
    profile: { id: 'visitor' },
  } as never);
  vi.spyOn(InsightsApiClient.prototype, 'sendBatchEvents').mockResolvedValue(true);
});

afterEach(async () => {
  for (const subscription of subscriptions) subscription.unsubscribe();
  subscriptions.length = 0;
  for (const dispose of effects) dispose();
  effects.length = 0;
  for (const runtime of runtimes) runtime.destroy();
  runtimes.clear();
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
      expect(ExperienceApiClient.prototype.upsertProfile).not.toHaveBeenCalled();
      expect(InsightsApiClient.prototype.sendBatchEvents).not.toHaveBeenCalled();
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
            profile: { id: 'visitor' },
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
          state === 'consent' ? runtime.states.consent : runtime.states.experienceRequestState;
        const subscription = observable.subscribe(subscriber);
        subscriptions.push(subscription);

        withdrawing = true;
        if (action === 'throw') {
          expect(() => runtime.consent(axes === 'both' ? false : { events: false })).toThrow(error);
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

        expect(ExperienceApiClient.prototype.upsertProfile).not.toHaveBeenCalled();
        expect(InsightsApiClient.prototype.sendBatchEvents).not.toHaveBeenCalled();
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

    expect(runtime.states.eventStream.current).toMatchObject({ type: 'track', event: 'rewritten' });
    expect(ExperienceApiClient.prototype.upsertProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        events: [expect.objectContaining({ type: 'track', event: 'rewritten' })],
      }),
      expect.anything()
    );
    expect(runtime.states.profile.current).toEqual({
      id: 'visitor',
      traits: { intercepted: true },
    });
    expect(runtime.states.experienceRequestState.current).toEqual({ status: 'success' });
    await runtime.page();
    expect(profiles).toHaveBeenCalledTimes(2);
    await hydrateOptimizationData(runtime, { profile: { id: 'hydrated' } });
    expect(runtime.states.profile.current).toEqual({
      id: 'hydrated',
      traits: { intercepted: true },
    });
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
    expect(runtime.states.experienceRequestState.current).toEqual({ status: 'idle' });
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

    const requests = vi.mocked(ExperienceApiClient.prototype.upsertProfile).mock.calls;
    expect(requests.map(([request]) => request.profileId)).toEqual(['external-1', 'external-2']);
    expect(getAnonymousId).toHaveBeenCalled();
  });

  it('publishes the response profile and request success atomically', async () => {
    const runtime = createRuntime();
    const response = deferred<{ profile: EventProfile }>();
    vi.mocked(ExperienceApiClient.prototype.upsertProfile).mockReturnValue(
      response.promise as never
    );
    const snapshots: { profile: string | undefined; status: string }[] = [];
    effects.push(
      effect(() => {
        snapshots.push({
          profile: signals.profile.value?.id,
          status: signals.experienceRequestState.value.status,
        });
      })
    );
    const events = vi.fn();
    subscriptions.push(runtime.states.eventStream.subscribe(events));
    const pending = runtime.page();
    await vi.waitFor(() => expect(ExperienceApiClient.prototype.upsertProfile).toHaveBeenCalled());
    expect(runtime.states.experienceRequestState.current).toEqual({ status: 'pending' });
    expect(events.mock.calls.slice(1).map(([event]) => event.type)).toEqual(['page']);
    response.resolve({ profile: { id: 'updated' } });
    await pending;
    expect(snapshots).toEqual([
      { profile: 'visitor', status: 'idle' },
      { profile: 'visitor', status: 'pending' },
      { profile: 'updated', status: 'success' },
    ]);
    runtime.reset();
    await hydrateOptimizationData(runtime, { profile: { id: 'hydrated' } });
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
      .mocked(ExperienceApiClient.prototype.upsertProfile)
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValue({ profile: { id: 'visitor' } } as never);
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
    expect(InsightsApiClient.prototype.sendBatchEvents).not.toHaveBeenCalled();
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(500);
    expect(upsert).toHaveBeenCalledTimes(3);
    expect(events).toHaveBeenCalledTimes(5);
    expect(warn).toHaveBeenCalledWith('Event stream subscriber failed', error);
  });

  it('streams valid ordinary events before queue capacity admission, as in Optimization', async () => {
    const runtime = createRuntime({ queuePolicy: { offlineMaxEvents: 1 } });
    const events = vi.fn();
    subscriptions.push(runtime.states.eventStream.subscribe(events));
    window.dispatchEvent(new Event('offline'));
    await expect(runtime.track({ event: 'accepted' })).resolves.toEqual({ accepted: true });
    await expect(runtime.track({ event: 'queue-full' })).resolves.toEqual({ accepted: false });
    expect(events.mock.calls.slice(1).map(([event]) => event.event)).toEqual([
      'accepted',
      'queue-full',
    ]);
    expect(ExperienceApiClient.prototype.upsertProfile).not.toHaveBeenCalled();
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
    expect(ExperienceApiClient.prototype.upsertProfile).not.toHaveBeenCalled();
  });

  it('does not emit refused prepared events, including the otherwise allowed page', async () => {
    const runtime = createRuntime({ defaults: { consent: false }, allowedEventTypes: [] });
    const events = vi.fn();
    subscriptions.push(runtime.states.eventStream.subscribe(events));
    await expect(
      runtime.hydrateAndTrackCurrentPage(preparedHandoff(), { routeKey: '/prepared' })
    ).resolves.toEqual({ accepted: false });
    expect(events.mock.calls).toEqual([[undefined]]);
    expect(ExperienceApiClient.prototype.upsertProfile).not.toHaveBeenCalled();
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
          request: signals.experienceRequestState.value,
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
    vi.mocked(ExperienceApiClient.prototype.upsertProfile).mockReturnValue(
      response.promise as never
    );
    const old = createRuntime();
    const pending = old.page();
    await vi.waitFor(() => expect(ExperienceApiClient.prototype.upsertProfile).toHaveBeenCalled());
    old.destroy();
    const replacementProfile = { id: 'visitor', traits: { generation: 'replacement' } };
    const replacement = createRuntime({ defaults: { profile: replacementProfile } });
    const stored = vi.spyOn(window.Storage.prototype, 'setItem');
    replacement.consent(false);
    replacement.consent(true);
    expect(stored.mock.calls.filter(([key]) => key === CONSENT_CACHE_KEY)).toHaveLength(2);
    response.resolve({ profile: { id: 'late-old-response' } });
    await pending;
    expect(replacement.states.profile.current).toEqual(replacementProfile);
    expect(replacement.states.experienceRequestState.current).toEqual({ status: 'idle' });
    expect(JSON.parse(window.localStorage.getItem(PROFILE_CACHE_KEY)!)).toEqual(replacementProfile);
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
      expect(ExperienceApiClient.prototype.upsertProfile).not.toHaveBeenCalled();
      expect(InsightsApiClient.prototype.sendBatchEvents).not.toHaveBeenCalled();

      window.dispatchEvent(new Event('online'));
      await runtime.flush();
      await vi.advanceTimersByTimeAsync(30_000);
      expect(ExperienceApiClient.prototype.upsertProfile).not.toHaveBeenCalled();
      expect(InsightsApiClient.prototype.sendBatchEvents).not.toHaveBeenCalled();
    }
  );
});
