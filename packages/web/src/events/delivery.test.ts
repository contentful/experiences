import { preparedEvents } from '../test/fixtures/prepared-events.js';
// @vitest-environment jsdom

import {
  PROFILE_CACHE_KEY,
  ContentfulExperiences as RuntimeContentfulExperiences,
  type ExperiencesHandoff,
  type OptimizationEventStreamEvent,
} from '@contentful/experiences-runtime';
import {
  ExperienceApiClient as PersonalizationApiClient,
  InsightsApiClient as AnalyticsApiClient,
} from '@contentful/optimization-api-client';
import type { Profile as EventProfile } from '@contentful/optimization-api-client/api-schemas';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContentfulExperiences } from '../contentful-experiences.js';
import { deferred, setDocumentVisibility } from '../test/dom.js';
import { clearIdentityCookies, seedConsent } from '../test/fixtures/consent.js';
import { completeProfile } from '../test/fixtures/profile.js';
import { createSdkHarness, mockOptimization } from '../test/sdk-harness.js';
import { getTrackingAttributes } from '../tracking-attributes.js';

const analyticsCases = [
  [
    'view',
    (runtime: ContentfulExperiences) =>
      runtime.trackView({
        entityId: 'hero',
        entityKind: 'Experience',
        viewId: 'view',
        viewDurationMs: 1000,
      }),
  ],
  [
    'click',
    (runtime: ContentfulExperiences) =>
      runtime.trackClick({ entityId: 'hero', entityKind: 'Experience' }),
  ],
  [
    'hover',
    (runtime: ContentfulExperiences) =>
      runtime.trackHover({
        entityId: 'hero',
        entityKind: 'Experience',
        hoverId: 'hover',
        hoverDurationMs: 1000,
      }),
  ],
  [
    'flag',
    (runtime: ContentfulExperiences) =>
      runtime.trackFlagView({ componentId: 'flag', experienceId: 'experience' }),
  ],
] as const;

describe('queue-parity', () => {
  const { create: createRuntime, destroy: destroyRuntimes } = createSdkHarness(
    { locale: 'en-US', defaults: { profile: completeProfile('visitor') } },
    ContentfulExperiences
  );

  const click = (runtime: ContentfulExperiences) =>
    runtime.trackClick({ entityId: 'hero', entityKind: 'Experience' });

  beforeEach(() => {
    seedConsent({ events: true, persistence: true });
    vi.useFakeTimers();
    setDocumentVisibility('visible');
  });

  afterEach(() => {
    destroyRuntimes();
    vi.useRealTimers();
    vi.restoreAllMocks();
    window.localStorage.clear();
    clearIdentityCookies();
  });

  describe('Web queue parity with Optimization', () => {
    describe('page hide', () => {
      it('gives a Personalization batch waiting for retry a final forced attempt', async () => {
        const upsert = vi
          .spyOn(PersonalizationApiClient.prototype, 'upsertProfile')
          .mockRejectedValueOnce(new Error('offline'))
          .mockResolvedValue({ profile: completeProfile('visitor') } as never);
        vi.spyOn(AnalyticsApiClient.prototype, 'sendBatchEvents').mockResolvedValue(true);
        const runtime = createRuntime();

        window.dispatchEvent(new Event('offline'));
        await runtime.page();
        expect(upsert).not.toHaveBeenCalled();

        // Reconnect; the first request fails and the batch waits for its backoff retry.
        window.dispatchEvent(new Event('online'));
        await vi.advanceTimersByTimeAsync(0);
        expect(upsert).toHaveBeenCalledTimes(1);

        // Leaving the page must not lose it: the backoff is bypassed by the forced attempt.
        window.dispatchEvent(new Event('pagehide'));
        await vi.advanceTimersByTimeAsync(0);

        expect(upsert).toHaveBeenCalledTimes(2);
      });
    });

    describe('flush()', () => {
      it('awaits Analytics before flushing Personalization and waits for both queues', async () => {
        vi.spyOn(Math, 'random').mockReturnValue(0);
        const analyticsPending = deferred<boolean>();
        const personalizationPending = deferred<{ profile: EventProfile }>();
        const analytics = vi
          .spyOn(AnalyticsApiClient.prototype, 'sendBatchEvents')
          .mockReturnValue(analyticsPending.promise);
        const upsert = vi
          .spyOn(PersonalizationApiClient.prototype, 'upsertProfile')
          .mockRejectedValueOnce(new Error('offline'))
          .mockReturnValueOnce(personalizationPending.promise as never);
        const runtime = createRuntime();

        // A Personalization batch fails once and waits in backoff.
        window.dispatchEvent(new Event('offline'));
        await runtime.page();
        window.dispatchEvent(new Event('online'));
        await vi.advanceTimersByTimeAsync(0);
        expect(upsert).toHaveBeenCalledTimes(1);

        // Move the clock past the backoff without firing timers, so the batch is eligible
        // for flush() but nothing else has retried it.
        vi.setSystemTime(Date.now() + 60_000);
        await click(runtime);

        // Personalization must wait until the Analytics request completes.
        let settled = false;
        const flushing = runtime.flush().then(() => {
          settled = true;
        });
        await vi.advanceTimersByTimeAsync(0);

        expect(analytics).toHaveBeenCalledTimes(1);
        expect(upsert).toHaveBeenCalledTimes(1);
        expect(settled).toBe(false);

        analyticsPending.resolve(true);
        await vi.advanceTimersByTimeAsync(0);
        expect(upsert).toHaveBeenCalledTimes(2);
        expect(settled).toBe(false);

        personalizationPending.resolve({ profile: completeProfile('visitor') });
        await flushing;
        expect(settled).toBe(true);
      });
    });

    describe('queuePolicy.offlineMaxEvents', () => {
      const offlineTracks = async (runtime: ContentfulExperiences, count: number) => {
        const results = [];
        for (let index = 0; index < count; index += 1) {
          results.push(await runtime.track({ event: `offline-${index}` }));
        }
        return results;
      };

      it('forwards the configured ordinary-event capacity to its queue', async () => {
        const upsert = vi
          .spyOn(PersonalizationApiClient.prototype, 'upsertProfile')
          .mockResolvedValue({ profile: completeProfile('visitor') } as never);
        const runtime = createRuntime({ queuePolicy: { offlineMaxEvents: 3 } });
        const published = vi.fn();
        const subscription = runtime.states.eventStream.subscribe(published);
        published.mockClear();
        window.dispatchEvent(new Event('offline'));
        expect((await offlineTracks(runtime, 4)).map((result) => result.accepted)).toEqual([
          true,
          true,
          true,
          false,
        ]);
        window.dispatchEvent(new Event('online'));
        await vi.advanceTimersByTimeAsync(0);
        expect(upsert.mock.calls[0]?.[0].events).toHaveLength(3);
        expect(published).toHaveBeenCalledTimes(3);
        subscription.unsubscribe();
      });
    });
  });

  describe('Web Analytics queue', () => {
    it('holds events while offline and flushes when the browser comes back online', async () => {
      const send = vi
        .spyOn(AnalyticsApiClient.prototype, 'sendBatchEvents')
        .mockResolvedValue(true);
      const runtime = createRuntime();

      window.dispatchEvent(new Event('offline'));
      await click(runtime);
      await vi.advanceTimersByTimeAsync(30_000);
      expect(send).not.toHaveBeenCalled();

      window.dispatchEvent(new Event('online'));
      await vi.advanceTimersByTimeAsync(0);

      expect(send).toHaveBeenCalledTimes(1);
    });

    it('flushes with the Beacon API when the page is hidden', async () => {
      const send = vi
        .spyOn(AnalyticsApiClient.prototype, 'sendBatchEvents')
        .mockResolvedValue(true);
      const runtime = createRuntime();
      await click(runtime);

      setDocumentVisibility('hidden');
      await vi.advanceTimersByTimeAsync(0);

      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0]?.[1]).toEqual({ beacon: expect.any(Function) });
    });

    it('flushes on pagehide, once per hide cycle', async () => {
      const send = vi
        .spyOn(AnalyticsApiClient.prototype, 'sendBatchEvents')
        .mockResolvedValue(true);
      const runtime = createRuntime();
      await click(runtime);

      window.dispatchEvent(new Event('pagehide'));
      await click(runtime);
      window.dispatchEvent(new Event('pagehide'));
      await vi.advanceTimersByTimeAsync(0);

      expect(send).toHaveBeenCalledTimes(1);
    });
    it.each(['withdraw', 'reset'] as const)(
      'drops queued Analytics events on %s',
      async (transition) => {
        const send = vi
          .spyOn(AnalyticsApiClient.prototype, 'sendBatchEvents')
          .mockResolvedValue(true);
        const runtime = createRuntime();
        await click(runtime);
        if (transition === 'reset') runtime.reset();
        else {
          runtime.consent({ events: false });
          runtime.consent({ events: true });
        }
        await vi.advanceTimersByTimeAsync(30_000);
        await runtime.flush();
        expect(send).not.toHaveBeenCalled();
      }
    );

    it('makes a last attempt at queued events on destroy and stops listening', async () => {
      const send = vi
        .spyOn(AnalyticsApiClient.prototype, 'sendBatchEvents')
        .mockResolvedValue(true);
      const removed = vi.spyOn(document, 'removeEventListener');
      const runtime = createRuntime();
      await click(runtime);

      runtime.destroy();
      await vi.advanceTimersByTimeAsync(0);

      expect(send).toHaveBeenCalledTimes(1);
      expect(removed).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
      // After destroy a call reports no admission and queues nothing.
      await expect(click(runtime)).resolves.toEqual({ accepted: false });
      await vi.advanceTimersByTimeAsync(30_000);
      expect(send).toHaveBeenCalledTimes(1);
    });

    it('ends an in-progress hover before the hide flush, so its event is in the beacon', async () => {
      const send = vi
        .spyOn(AnalyticsApiClient.prototype, 'sendBatchEvents')
        .mockResolvedValue(true);
      createRuntime();
      const hero = document.createElement('div');
      for (const [name, value] of Object.entries(
        getTrackingAttributes({ roots: [{ key: 'node:hero' }] })
      )) {
        hero.setAttribute(name, value);
      }
      document.body.append(hero);
      hero.setAttribute(
        'data-ctfl-attribution',
        JSON.stringify({
          scopes: {
            'node:hero': { entityId: 'hero', entityKind: 'ExperienceFragment' },
          },
        })
      );
      await vi.advanceTimersByTimeAsync(0);

      hero.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
      await vi.advanceTimersByTimeAsync(1_500);
      expect(send).not.toHaveBeenCalled();

      // The pointer never leaves: the hover is still running when the page goes away.
      window.dispatchEvent(new Event('pagehide'));
      await vi.advanceTimersByTimeAsync(0);

      expect(send).toHaveBeenCalledTimes(1);
      const [batches, options] = send.mock.calls[0] as unknown as [
        { events: { type: string }[] }[],
        { beacon?: unknown },
      ];
      expect(batches.flatMap((batch) => batch.events).map((event) => event.type)).toContain(
        'exo_node_hover'
      );
      expect(options.beacon).toBeTypeOf('function');
      hero.remove();
      await vi.advanceTimersByTimeAsync(0);
    });

    it('forwards the configured flush interval to Analytics delivery', async () => {
      const send = vi
        .spyOn(AnalyticsApiClient.prototype, 'sendBatchEvents')
        .mockResolvedValue(true);
      const runtime = createRuntime({ queuePolicy: { flush: { flushIntervalMs: 1_000 } } });
      await click(runtime);
      await vi.advanceTimersByTimeAsync(999);
      expect(send).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(send).toHaveBeenCalledOnce();
    });

    describe('trackView acceptance result', () => {
      const view = {
        entityId: 'hero',
        entityKind: 'Experience' as const,
        viewId: 'v1',
        viewDurationMs: 1000,
      };
      it.each(['admitted', 'blocked', 'destroyed'] as const)(
        'returns the acceptance result for a %s view',
        async (mode) => {
          const send = vi
            .spyOn(AnalyticsApiClient.prototype, 'sendBatchEvents')
            .mockResolvedValue(true);
          const runtime = createRuntime();
          if (mode === 'blocked') runtime.consent({ events: false });
          if (mode === 'destroyed') runtime.destroy();
          await expect(runtime.trackView(view)).resolves.toEqual({ accepted: mode === 'admitted' });
          expect(send).not.toHaveBeenCalled();
          if (mode === 'destroyed') await vi.advanceTimersByTimeAsync(0);
          else await runtime.flush();
          expect(send).toHaveBeenCalledTimes(mode === 'admitted' ? 1 : 0);
        }
      );
    });
  });
});

describe('delivery', () => {
  class TestContentfulExperiences extends ContentfulExperiences {
    admit(
      events: NonNullable<ExperiencesHandoff['replay']>['events'],
      profileId?: string,
      locale?: string
    ) {
      return this.sendPreparedPersonalizationEvents(events, profileId, locale);
    }
  }

  function createRuntime(profile?: EventProfile) {
    return harness.create(profile === undefined ? {} : { defaults: { profile } });
  }

  const harness = createSdkHarness({ locale: 'en-US' }, TestContentfulExperiences);

  // Prepared for an opted-in visitor, matching the browser these tests run as.
  const prepared = (runtime: TestContentfulExperiences, consent = true) =>
    preparedEvents(runtime.eventBuilder, consent);

  // Consent is not what these tests are about: run as a visitor who has opted in.
  beforeEach(() => {
    seedConsent({ events: true, persistence: true });
  });

  afterEach(() => {
    harness.destroy();
    window.localStorage.clear();
    clearIdentityCookies();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('Web prepared Personalization delivery', () => {
    it('admits the exact batch before HTTP completes and stamps the browser consent', async () => {
      const pending = deferred<{ profile: EventProfile }>();
      const upsert = vi
        .spyOn(PersonalizationApiClient.prototype, 'upsertProfile')
        .mockReturnValue(pending.promise as never);
      const runtime = createRuntime();
      const events = prepared(runtime, true);

      await expect(runtime.admit(events, undefined, 'de-DE')).resolves.toEqual({ accepted: true });
      expect(runtime.states.personalizationRequestState.current.status).toBe('pending');
      expect(upsert).toHaveBeenCalledWith(
        { profileId: undefined, events },
        { preflight: false, locale: 'de-DE' }
      );
      expect(upsert.mock.calls[0]?.[0].events.map((event) => event.messageId)).toEqual(
        events.map((event) => event.messageId)
      );
      expect(
        upsert.mock.calls[0]?.[0].events.every(
          (event) => event.context.gdpr?.isConsentGiven === true
        )
      ).toBe(true);
      expect(runtime.states.profile.current).toBeUndefined();

      pending.resolve({ profile: completeProfile('api-profile') });
      await vi.waitFor(() =>
        expect(runtime.states.profile.current).toEqual(completeProfile('api-profile'))
      );
      expect(JSON.parse(window.localStorage.getItem(PROFILE_CACHE_KEY)!)).toEqual(
        completeProfile('api-profile')
      );
    });

    it.each(analyticsCases)(
      'drops early %s Analytics under a bare continuation ID without persisting a synthetic profile',
      async (_method, emit) => {
        const pending = deferred<{ profile: EventProfile }>();
        const upsert = vi
          .spyOn(PersonalizationApiClient.prototype, 'upsertProfile')
          .mockReturnValue(pending.promise as never);
        const analytics = vi
          .spyOn(AnalyticsApiClient.prototype, 'sendBatchEvents')
          .mockResolvedValue(true);
        const runtime = createRuntime();

        await expect(runtime.admit(prepared(runtime), 'server-profile')).resolves.toEqual({
          accepted: true,
        });
        expect(upsert.mock.calls[0]?.[0].profileId).toBe('server-profile');
        expect(runtime.states.profile.current).toBeUndefined();
        expect(window.localStorage.getItem(PROFILE_CACHE_KEY)).toBeNull();

        // All Analytics methods require a full profile; a bare continuation is not one.
        const previousEvent = runtime.states.eventStream.current;
        await expect(emit(runtime)).resolves.toEqual({ accepted: true });
        expect(runtime.states.eventStream.current).toBe(previousEvent);
        expect(window.localStorage.getItem(PROFILE_CACHE_KEY)).toBeNull();

        const apiProfile = completeProfile('api-profile');
        pending.resolve({ profile: apiProfile });
        await vi.waitFor(() => expect(runtime.states.profile.current).toEqual(apiProfile));
        expect(JSON.parse(window.localStorage.getItem(PROFILE_CACHE_KEY)!)).toEqual(apiProfile);
        await runtime.flush();
        expect(analytics).not.toHaveBeenCalled();

        // Once the Personalization API returns the complete profile, Analytics flows again.
        await emit(runtime);
        await runtime.flush();
        expect(analytics).toHaveBeenCalledExactlyOnceWith([
          expect.objectContaining({ profile: apiProfile }),
        ]);
      }
    );

    it('sends an ordinary online event while prepared HTTP is pending', async () => {
      const pending = deferred<{ profile: EventProfile }>();
      const upsert = vi
        .spyOn(PersonalizationApiClient.prototype, 'upsertProfile')
        .mockReturnValueOnce(pending.promise as never)
        .mockResolvedValueOnce({ profile: completeProfile('direct-profile') } as never);
      const runtime = createRuntime(completeProfile('existing-profile'));

      await runtime.admit(prepared(runtime));
      await expect(runtime.track({ event: 'ordinary' })).resolves.toMatchObject({
        accepted: true,
        data: { profile: completeProfile('direct-profile') },
      });
      expect(upsert).toHaveBeenCalledTimes(2);
      expect(upsert.mock.calls[1]?.[0].events).toHaveLength(1);
      expect(runtime.states.profile.current).toEqual(completeProfile('direct-profile'));

      pending.resolve({ profile: completeProfile('stale-prepared-profile') });
      await vi.waitFor(() =>
        expect(runtime.states.personalizationRequestState.current.status).toBe('success')
      );
      expect(runtime.states.profile.current).toEqual(completeProfile('direct-profile'));
    });

    it('queues while offline and flushes on reconnect', async () => {
      const upsert = vi
        .spyOn(PersonalizationApiClient.prototype, 'upsertProfile')
        .mockResolvedValue({ profile: completeProfile('connected-profile') } as never);
      const runtime = createRuntime();
      window.dispatchEvent(new Event('offline'));

      await expect(runtime.admit(prepared(runtime))).resolves.toEqual({ accepted: true });
      await expect(runtime.track({ event: 'offline-ordinary' })).resolves.toEqual({
        accepted: true,
      });
      expect(upsert).not.toHaveBeenCalled();
      expect(runtime.states.profile.current).toBeUndefined();

      window.dispatchEvent(new Event('online'));
      await vi.waitFor(() => expect(upsert).toHaveBeenCalledTimes(2));
      await vi.waitFor(() =>
        expect(runtime.states.profile.current).toEqual(completeProfile('connected-profile'))
      );
    });

    it('ignores stale prepared responses after reset and cleans up a failed retry', async () => {
      vi.useFakeTimers();
      const pending = deferred<{ profile: EventProfile }>();
      const upsert = vi
        .spyOn(PersonalizationApiClient.prototype, 'upsertProfile')
        .mockReturnValueOnce(pending.promise as never)
        .mockRejectedValueOnce(new Error('offline'));
      const runtime = createRuntime();

      await runtime.admit(prepared(runtime));
      runtime.reset();
      pending.resolve({ profile: completeProfile('old-profile') });
      await Promise.resolve();
      await Promise.resolve();
      expect(runtime.states.profile.current).toBeUndefined();
      expect(window.localStorage.getItem(PROFILE_CACHE_KEY)).toBeNull();
      expect(runtime.states.personalizationRequestState.current.status).toBe('idle');

      await runtime.admit(prepared(runtime));
      await Promise.resolve();
      await Promise.resolve();
      expect(runtime.states.personalizationRequestState.current).toEqual({
        status: 'failed',
        reason: 'api-error',
      });
      runtime.reset();
      await vi.advanceTimersByTimeAsync(1000);
      expect(upsert).toHaveBeenCalledTimes(2);
      expect(runtime.states.personalizationRequestState.current.status).toBe('idle');
    });

    it('ignores a late prepared response after destroy', async () => {
      const pending = deferred<{ profile: EventProfile }>();
      vi.spyOn(PersonalizationApiClient.prototype, 'upsertProfile').mockReturnValue(
        pending.promise as never
      );
      const runtime = createRuntime();

      await runtime.admit(prepared(runtime));
      runtime.destroy();
      pending.resolve({ profile: completeProfile('old-profile') });
      await Promise.resolve();
      await Promise.resolve();
      expect(runtime.states.profile.current).toBeUndefined();
      expect(window.localStorage.getItem(PROFILE_CACHE_KEY)).toBeNull();
    });

    it('does not persist a late ordinary Personalization response after destroy', async () => {
      const pending = deferred<{ profile: EventProfile }>();
      vi.spyOn(PersonalizationApiClient.prototype, 'upsertProfile').mockReturnValue(
        pending.promise as never
      );
      const runtime = createRuntime();
      const send = runtime.track({ event: 'in-flight' });
      await vi.waitFor(() =>
        expect(PersonalizationApiClient.prototype.upsertProfile).toHaveBeenCalled()
      );

      runtime.destroy();
      pending.resolve({ profile: completeProfile('late-profile') });
      await send;
      expect(runtime.states.profile.current).toBeUndefined();
      expect(window.localStorage.getItem(PROFILE_CACHE_KEY)).toBeNull();
    });

    it('cancels an old destroy drain without clearing a replacement Web profile', async () => {
      const pending = deferred<{ profile: EventProfile }>();
      const upsert = vi
        .spyOn(PersonalizationApiClient.prototype, 'upsertProfile')
        .mockReturnValueOnce(pending.promise as never)
        .mockResolvedValue({ profile: completeProfile('later-profile') } as never);
      const oldRuntime = createRuntime();
      await oldRuntime.admit(prepared(oldRuntime), undefined, 'de-DE');
      await oldRuntime.admit(prepared(oldRuntime), undefined, 'fr-FR');
      expect(upsert).toHaveBeenCalledTimes(1);

      oldRuntime.destroy();
      const replacement = createRuntime(completeProfile('replacement-profile'));
      oldRuntime.reset();
      pending.resolve({ profile: completeProfile('old-profile') });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(upsert).toHaveBeenCalledTimes(1);
      expect(replacement.states.profile.current).toEqual(completeProfile('replacement-profile'));
      expect(JSON.parse(window.localStorage.getItem(PROFILE_CACHE_KEY)!)).toEqual(
        completeProfile('replacement-profile')
      );
    });

    it('does not send ordinary Analytics after destroy releases ownership', async () => {
      const analytics = vi.spyOn(AnalyticsApiClient.prototype, 'sendBatchEvents');
      const runtime = createRuntime(completeProfile('browser-profile'));

      runtime.destroy();
      await expect(
        runtime.trackClick({ entityId: 'hero', entityKind: 'Experience' })
      ).resolves.toEqual({ accepted: false });
      expect(analytics).not.toHaveBeenCalled();
    });

    it('removes its connectivity listeners on destroy', () => {
      const added = vi.spyOn(window, 'addEventListener');
      const removed = vi.spyOn(window, 'removeEventListener');
      const runtime = createRuntime();
      const online = added.mock.calls.find(([name]) => name === 'online')?.[1];
      const offline = added.mock.calls.find(([name]) => name === 'offline')?.[1];

      expect(online).toBeTypeOf('function');
      expect(offline).toBeTypeOf('function');
      runtime.destroy();
      expect(removed).toHaveBeenCalledWith('online', online);
      expect(removed).toHaveBeenCalledWith('offline', offline);
    });
  });
});

describe('interceptors', () => {
  const { create: createRuntime, destroy: destroyRuntimes } = createSdkHarness(
    { defaults: { profile: completeProfile('visitor'), consent: false } },
    ContentfulExperiences
  );

  const resolveOptions = { config: { components: {} } };

  const entity = { entityId: 'hero', entityKind: 'Experience' } as const;

  const view = { ...entity, viewId: 'view', viewDurationMs: 1000 };

  const hover = { ...entity, hoverId: 'hover', hoverDurationMs: 1000 };

  beforeEach(() => {
    seedConsent({ events: false, persistence: false });
    vi.spyOn(PersonalizationApiClient.prototype, 'upsertProfile').mockResolvedValue({
      profile: completeProfile('visitor'),
    } as never);
    vi.spyOn(AnalyticsApiClient.prototype, 'sendBatchEvents').mockResolvedValue(true);
  });

  afterEach(() => {
    destroyRuntimes();
    vi.restoreAllMocks();
    window.localStorage.clear();
    clearIdentityCookies();
  });

  describe('Web event interception consent', () => {
    it('applies final Personalization consent before Web publication', async () => {
      const onEventBlocked = vi.fn();
      const runtime = createRuntime({ onEventBlocked });
      const hook = vi.fn((event: OptimizationEventStreamEvent) => ({
        ...event,
        type: 'track' as const,
        event: 'rewritten',
      }));
      runtime.interceptors.event.add(hook);

      await expect(runtime.page()).resolves.toEqual({ accepted: false });
      expect(hook).toHaveBeenCalledTimes(1);
      expect(onEventBlocked).toHaveBeenCalledExactlyOnceWith({
        reason: 'consent',
        method: 'track',
        args: [expect.objectContaining({ type: 'track', event: 'rewritten' })],
      });
      expect(runtime.states.eventStream.current).toBeUndefined();
      expect(PersonalizationApiClient.prototype.upsertProfile).not.toHaveBeenCalled();
    });

    it('reports final Analytics refusal through the Web admission callback', async () => {
      const onEventBlocked = vi.fn();
      const runtime = createRuntime({ onEventBlocked, allowedEventTypes: ['component'] });
      runtime.interceptors.event.add(() => runtime.eventBuilder.buildHover(hover));
      await expect(runtime.trackView(view)).resolves.toEqual({ accepted: false });
      expect(onEventBlocked).toHaveBeenCalledExactlyOnceWith({
        reason: 'consent',
        method: 'trackHover',
        args: [expect.objectContaining({ type: 'exo_node_hover' })],
      });
      expect(runtime.states.eventStream.current).toBeUndefined();
      await runtime.flush();
      expect(AnalyticsApiClient.prototype.sendBatchEvents).not.toHaveBeenCalled();
    });

    it('uses current consent when an async hook transforms an admitted page', async () => {
      const runtime = createRuntime();
      const gate = deferred<void>();
      const started = deferred<void>();
      runtime.interceptors.event.add(async (event) => {
        started.resolve();
        await gate.promise;
        return { ...event, type: 'track', event: 'now-admitted' };
      });
      const pending = runtime.page();
      await started.promise;
      runtime.consent({ events: true });
      gate.resolve();
      await expect(pending).resolves.toMatchObject({ accepted: true });
      expect(runtime.states.eventStream.current).toMatchObject({
        type: 'track',
        event: 'now-admitted',
      });
      expect(PersonalizationApiClient.prototype.upsertProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          events: [expect.objectContaining({ type: 'track', event: 'now-admitted' })],
        }),
        expect.anything()
      );
    });

    it('validates all final XDA hook output before reporting or publishing earlier events', async () => {
      const onEventBlocked = vi.fn();
      const runtime = createRuntime({ onEventBlocked });
      const first = runtime.eventBuilder.buildPageView();
      const second = runtime.eventBuilder.buildPageView();
      const hook = vi.fn((event: OptimizationEventStreamEvent) =>
        event.messageId === first.messageId
          ? { ...event, type: 'track' as const, event: 'blocked' }
          : ({ ...event, context: null } as never)
      );
      runtime.interceptors.event.add(hook);
      const fetch = vi.spyOn(RuntimeContentfulExperiences.prototype, 'fetchExperience');
      await expect(
        runtime.fetchExperience(
          { experienceId: 'invalid', personalization: { events: [first, second] } },
          resolveOptions
        )
      ).rejects.toThrow('Invalid Experience personalization');
      expect(onEventBlocked).not.toHaveBeenCalled();
      expect(runtime.states.eventStream.current).toBeUndefined();
      expect(fetch).not.toHaveBeenCalled();
      expect(hook).toHaveBeenCalledTimes(2);
    });

    it('serializes the entire XDA batch before filtering final types and preserves the fetch/profile', async () => {
      const onEventBlocked = vi.fn();
      const runtime = createRuntime({ onEventBlocked });
      const fetch = vi
        .spyOn(RuntimeContentfulExperiences.prototype, 'fetchExperience')
        .mockResolvedValue({ nodes: [] } as never);
      const page = runtime.eventBuilder.buildPageView();
      runtime.interceptors.event.add((event) => ({ ...event, type: 'track', event: 'rewritten' }));
      await runtime.fetchExperience(
        { experienceId: 'exp', personalization: { profileId: 'caller-profile', events: [page] } },
        resolveOptions
      );
      expect(fetch.mock.calls[0]?.[0].personalization).toEqual({
        profileId: 'caller-profile',
        events: [],
      });
      expect(onEventBlocked).toHaveBeenCalledWith(expect.objectContaining({ method: 'track' }));
      expect(runtime.states.eventStream.current).toBeUndefined();
    });

    it('passes concurrent XDA hook results to the fetch in input order', async () => {
      const runtime = createRuntime({ defaults: { consent: false } });
      const fetch = vi
        .spyOn(RuntimeContentfulExperiences.prototype, 'fetchExperience')
        .mockResolvedValue({ nodes: [] } as never);
      const first = deferred<void>();
      const secondStarted = deferred<void>();
      runtime.interceptors.event.add(async (event) => {
        const name = event.type === 'track' ? event.event : event.type;
        expect(event.context).toMatchObject({ gdpr: { isConsentGiven: true } });
        if (name === 'first') await first.promise;
        else secondStarted.resolve();
        Object.assign(event.context, { gdpr: { isConsentGiven: false } });
        return { ...event, event: `updated:${name}` };
      });
      const events = [
        runtime.eventBuilder.buildTrack({ event: 'first' }),
        runtime.eventBuilder.buildTrack({ event: 'second' }),
      ];
      Object.assign(events[0]!.context.gdpr!, { isConsentGiven: 'yes' });
      const original = globalThis.structuredClone(events);
      runtime.consent({ events: true });
      const pending = runtime.fetchExperience(
        { experienceId: 'exp', personalization: { events } },
        resolveOptions
      );
      await secondStarted.promise;
      first.resolve();
      await pending;
      expect(
        fetch.mock.calls[0]?.[0].personalization?.events?.map(
          (event) => event.type === 'track' && event.event
        )
      ).toEqual(['updated:first', 'updated:second']);
      expect(runtime.states.eventStream.current).toMatchObject({
        context: { gdpr: { isConsentGiven: false } },
      });
      expect(events).toEqual(original);
    });

    it('reports an unmapped valid transformed XDA type using its wire name', async () => {
      const onEventBlocked = vi.fn();
      const runtime = createRuntime({ onEventBlocked });
      const fetch = vi
        .spyOn(RuntimeContentfulExperiences.prototype, 'fetchExperience')
        .mockResolvedValue({ nodes: [] } as never);
      runtime.interceptors.event.add(
        (event) => ({ ...event, type: 'screen', properties: { name: 'screen' } }) as never
      );
      await runtime.fetchExperience(
        {
          experienceId: 'exp',
          personalization: { events: [runtime.eventBuilder.buildPageView()] },
        },
        resolveOptions
      );
      expect(onEventBlocked).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'screen',
          args: [expect.objectContaining({ type: 'screen' })],
        })
      );
      expect(fetch.mock.calls[0]?.[0].personalization?.events).toEqual([]);
    });

    it.each(['reset', 'destroy'] as const)(
      'discards pending direct and XDA hooks after %s',
      async (action) => {
        const runtime = createRuntime({
          defaults: { consent: true, profile: completeProfile('visitor') },
        });
        const gate = deferred<void>();
        const hook = vi.fn(async (event: OptimizationEventStreamEvent) => {
          await gate.promise;
          return event;
        });
        runtime.interceptors.event.add(hook);
        const fetch = vi.spyOn(RuntimeContentfulExperiences.prototype, 'fetchExperience');
        const page = runtime.page();
        const pendingView = runtime.trackView(view);
        const xda = runtime.fetchExperience(
          {
            experienceId: 'stale',
            personalization: { events: [runtime.eventBuilder.buildPageView()] },
          },
          resolveOptions
        );
        const xdaRejected = expect(xda).rejects.toThrow(
          action === 'reset' ? 'superseded' : 'destroyed'
        );
        expect(hook).toHaveBeenCalledTimes(3);
        runtime[action]();
        gate.resolve();
        await Promise.all([page, pendingView, xdaRejected]);
        expect(fetch).not.toHaveBeenCalled();
        expect(PersonalizationApiClient.prototype.upsertProfile).not.toHaveBeenCalled();
        expect(AnalyticsApiClient.prototype.sendBatchEvents).not.toHaveBeenCalled();
        expect(runtime.states.eventStream.current).toBeUndefined();
      }
    );

    it('rechecks current consent after an async hook and stops XDA when blocked reporting resets its owner', async () => {
      const runtime = createRuntime({ onEventBlocked: () => runtime.reset() });
      const gate = deferred<void>();
      runtime.interceptors.event.add(async (event) => {
        await gate.promise;
        return { ...event, type: 'track', event: 'changed' };
      });
      const fetch = vi.spyOn(RuntimeContentfulExperiences.prototype, 'fetchExperience');
      const pending = runtime.fetchExperience(
        {
          experienceId: 'cancelled',
          personalization: { events: [runtime.eventBuilder.buildPageView()] },
        },
        resolveOptions
      );
      const rejected = expect(pending).rejects.toThrow('superseded');
      gate.resolve();
      await rejected;
      expect(fetch).not.toHaveBeenCalled();
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

  describe('early Analytics profile boundaries', () => {
    it.each(analyticsCases)(
      'warns and drops %s Analytics without a profile, as Optimization does',
      async (_method, emit) => {
        const runtime = createRuntime();
        const optimization = mockOptimization(runtime);

        await expect(emit(runtime)).resolves.toEqual({ accepted: true });
        expect(runtime.states.eventStream.current).toBeUndefined();
        await runtime.flush();

        expect(optimization.sendBatchEvents).not.toHaveBeenCalled();
      }
    );

    it('drops an Analytics call made while the initial profile request is still pending', async () => {
      const runtime = createRuntime();
      let respond!: (value: { profile: EventProfile }) => void;
      const optimization = mockOptimization(runtime);
      optimization.upsertProfile.mockReturnValueOnce(
        new Promise((resolve) => {
          respond = resolve;
        }) as never
      );

      const pending = runtime.page();
      // A new visitor has no identity yet: the call resolves instead of rejecting, and sends nothing.
      await expect(
        runtime.trackClick({ entityId: 'experience', entityKind: 'Experience' })
      ).resolves.toEqual({ accepted: true });

      respond({ profile: completeProfile('issued-profile') });
      await pending;
      await runtime.flush();
      expect(optimization.sendBatchEvents).not.toHaveBeenCalled();

      // Once the profile exists, tracking queues and sends as usual.
      await runtime.trackClick({ entityId: 'experience', entityKind: 'Experience' });
      await runtime.flush();
      expect(optimization.sendBatchEvents).toHaveBeenCalledWith([
        expect.objectContaining({ profile: completeProfile('issued-profile') }),
      ]);
    });
  });
});
