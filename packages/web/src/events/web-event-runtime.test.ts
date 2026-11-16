import {
  ExperienceApiClient as PersonalizationApiClient,
  InsightsApiClient as AnalyticsApiClient,
} from '@contentful/optimization-api-client';
import {
  DEFAULT_ALLOWED_EVENT_TYPES,
  EventBuilder,
  resolveQueuePolicy,
  withEventConsent,
  type AllowedEventType,
  type BlockedEvent,
  type Config as RuntimeConfig,
  type PersonalizationOptions,
  type OptimizationEventStreamEvent,
  type EventProfile,
  type QueuePolicy,
  validatePreparedEvents,
} from '@contentful/experiences-runtime';
import { logger } from '@contentful/optimization-api-client/logger';
import type { OptimizationData } from '@contentful/optimization-api-client/api-schemas';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  blockedEvent,
  consent,
  profile,
  online,
  event as emittedEvent,
  persistenceConsent,
  personalizationRequestState,
  changes,
  effect,
  locale,
} from '../signals/index.js';
import { completeProfile } from '../test/fixtures/profile.js';
import { deferred } from '../test/dom.js';
import { WebEventRuntime } from './web-event-runtime.js';

// Instantiate the event owner directly. Its queues, interceptors, state and
// bound methods share this receiver; browser effects/singleton are not started.
class TestEventRuntime extends WebEventRuntime<RuntimeConfig> {
  preview = false;
  get isPreview() {
    return this.preview;
  }
  readonly personalizationQueue;
  readonly analyticsQueue;
  readonly onEventBlocked = vi.fn<(event: BlockedEvent) => void>();
  constructor(
    readonly allowedEventTypes: readonly AllowedEventType[] = DEFAULT_ALLOWED_EVENT_TYPES,
    queuePolicy?: QueuePolicy
  ) {
    super({
      spaceId: 'space',
      environmentId: 'environment',
      delivery: { accessToken: 'test-token' },
      eventBuilder: {
        channel: 'web',
        library: { name: 'test', version: '1' },
        getConsent: () => consent.value === true,
      },
    });
    this.personalizationQueue = this.initializePersonalizationQueue(
      resolveQueuePolicy(queuePolicy)
    );
    this.analyticsQueue = this.initializeAnalyticsQueue(resolveQueuePolicy(queuePolicy));
    this.getAnonymousIdProvider = () => undefined;
    runtimes.add(this);
  }
  reset() {
    this.resetToken = {};
    this.personalizationQueue.reset();
    this.analyticsQueue.clearQueuedEvents();
  }
  override destroy() {
    this.destroyed = true;
    for (const dispose of this.effects.splice(0)) dispose();
    this.personalizationQueue.reset();
    this.analyticsQueue.clearScheduledRetry();
    this.analyticsQueue.clearQueuedEvents();
    this.analyticsQueue.clearPeriodicFlushTimer();
    super.destroy();
  }
  protected syncInteractionConsent() {
    // This direct owner does not activate browser interaction tracking.
  }
  sendPrepared(
    events: readonly unknown[],
    profileId?: string,
    locale?: string,
    current: () => boolean = () => true
  ) {
    const token = this.resetToken;
    const isCurrent = () => !this.destroyed && this.isCurrent(token) && current();
    const valid = validatePreparedEvents(events);
    return Promise.resolve(
      this.admitPreparedEvents(valid, isCurrent)
        ? this.queuePreparedEvents(valid, profileId, locale, isCurrent)
        : { accepted: false }
    );
  }
  connectivity() {
    this.effects.push(this.installConnectivityEffect());
  }
  withdraw() {
    this.withdrawEventConsent();
  }
  get continuationId() {
    return this.adoptedProfileId.value;
  }
  adopt(id: string) {
    this.setAdoptedProfileId(id);
  }
  admit(event: { type: string }, reportUnmapped = false) {
    return this.admitEvent(event, reportUnmapped);
  }
  reportBlocked(event: BlockedEvent) {
    this.reportBlockedEvent(event);
  }
  prepare(
    options: { personalization?: PersonalizationOptions },
    assertCurrent: () => void = () => undefined
  ) {
    return this.prepareContentRequest(options, assertCurrent);
  }
}
const runtimes = new Set<TestEventRuntime>();

const server = new EventBuilder({
  channel: 'server',
  library: { name: 'test', version: '1' },
  getConsent: () => true,
});
const entity = { entityId: 'hero', entityKind: 'Experience' } as const;

beforeEach(() => {
  locale.value = undefined;
  consent.value = undefined;
  persistenceConsent.value = false;
  profile.value = undefined;
  blockedEvent.value = undefined;
  emittedEvent.value = undefined;
  personalizationRequestState.value = { status: 'idle' };
  changes.value = undefined;
  online.value = false;
});
afterEach(() => {
  for (const runtime of runtimes) runtime.destroy();
  runtimes.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
  consent.value = undefined;
  persistenceConsent.value = undefined;
  profile.value = undefined;
  blockedEvent.value = undefined;
  emittedEvent.value = undefined;
  changes.value = undefined;
  online.value = undefined;
});

describe('WebEventRuntime direct events', () => {
  it('keeps all seven methods bound and builds events on the owning receiver', async () => {
    persistenceConsent.value = true;
    persistenceConsent.value = false;
    const runtime = new TestEventRuntime();
    consent.value = true;
    profile.value = completeProfile('visitor');
    const personalization = vi.spyOn(runtime.personalizationQueue, 'send');
    const analytics = vi.spyOn(runtime.analyticsQueue, 'send');
    const { identify, page, track, trackView, trackClick, trackHover, trackFlagView } = runtime;
    await expect(identify({ userId: 'user', traits: { member: true } })).resolves.toEqual({
      accepted: true,
    });
    await expect(page({ properties: { title: 'Home' } })).resolves.toEqual({ accepted: true });
    await expect(track({ event: 'purchase' })).resolves.toEqual({ accepted: true });
    await expect(trackView({ ...entity, viewId: 'view', viewDurationMs: 1000 })).resolves.toEqual({
      accepted: true,
    });
    await expect(trackClick(entity)).resolves.toEqual({ accepted: true });
    await expect(
      trackHover({ ...entity, hoverId: 'hover', hoverDurationMs: 1000 })
    ).resolves.toEqual({ accepted: true });
    await expect(trackFlagView({ componentId: 'flag' })).resolves.toEqual({ accepted: true });
    expect(personalization.mock.calls.map(([event]) => event.type)).toEqual([
      'identify',
      'page',
      'track',
    ]);
    expect(analytics.mock.calls.map(([event]) => event.type)).toEqual([
      'exo_node_view',
      'exo_node_click',
      'exo_node_hover',
      'component',
    ]);
    expect(personalization.mock.calls[0]?.[0]).toMatchObject({
      userId: 'user',
      traits: { member: true },
      channel: 'web',
      context: {
        library: { name: 'test', version: '1' },
        gdpr: { isConsentGiven: true },
      },
    });
    expect(personalization.mock.calls[1]?.[0]).toMatchObject({ properties: { title: 'Home' } });
    expect(personalization.mock.calls[2]?.[0]).toMatchObject({ event: 'purchase' });
    expect(analytics.mock.calls.every(([, sentProfile]) => sentProfile.id === 'visitor')).toBe(
      true
    );
    expect(emittedEvent.value).toMatchObject({ type: 'component', componentId: 'flag' });
  });

  it('warns and drops Analytics under an ID-only continuation without inventing a profile', async () => {
    const runtime = new TestEventRuntime();
    runtime.adopt('server-profile');
    consent.value = true;
    const warn = vi.spyOn(logger, 'warn');
    const send = vi.spyOn(runtime.analyticsQueue, 'send');
    await expect(runtime.trackClick(entity)).resolves.toEqual({ accepted: true });
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      'Experiences:Events',
      'Attempting to emit an event without a complete Optimization profile'
    );
    expect(send).not.toHaveBeenCalled();
    expect(profile.value).toBeUndefined();
    expect(runtime.continuationId).toBe('server-profile');
    expect(emittedEvent.value).toBeUndefined();
  });

  it('refuses preview and destroyed calls before building or queueing', async () => {
    const runtime = new TestEventRuntime();
    runtime.preview = true;
    const buildTrack = vi.spyOn(runtime.eventBuilder, 'buildTrack');
    await expect(runtime.track({ event: 'preview' })).resolves.toEqual({
      accepted: false,
      reason: 'preview',
    });
    expect(buildTrack).not.toHaveBeenCalled();
    expect(blockedEvent.value).toEqual({
      reason: 'preview',
      method: 'track',
      args: [{ event: 'preview' }],
    });
    runtime.destroy();
    runtime.onEventBlocked.mockClear();
    await expect(runtime.track({ event: 'destroyed' })).resolves.toEqual({ accepted: false });
    expect(runtime.onEventBlocked).not.toHaveBeenCalled();
  });

  it('applies final transformed consent before publication and reports with the SDK receiver', async () => {
    const runtime = new TestEventRuntime();
    runtime.onEventBlocked.mockImplementation(function (this: TestEventRuntime) {
      expect(this).toBe(runtime);
    });
    runtime.interceptors.event.add(
      (event) =>
        // This page-to-track transformation intentionally exercises final event-type policy.
        ({ ...event, type: 'track', event: 'rewritten' }) as unknown as OptimizationEventStreamEvent
    );
    await expect(runtime.page()).resolves.toEqual({ accepted: false });
    expect(runtime.onEventBlocked).toHaveBeenCalledExactlyOnceWith({
      reason: 'consent',
      method: 'track',
      args: [expect.objectContaining({ type: 'track', event: 'rewritten' })],
    });
    expect(emittedEvent.value).toBeUndefined();
    expect(runtime.personalizationQueue.queuedEventCount).toBe(0);
  });

  it('uses live consent after an asynchronous interceptor admits a transformed event', async () => {
    const runtime = new TestEventRuntime();
    online.value = true;
    const send = vi.spyOn(runtime.api.personalization, 'upsertProfile').mockResolvedValue({
      profile: completeProfile('updated'),
      changes: [],
      selectedOptimizations: [],
    });
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    runtime.interceptors.event.add(async (event) => {
      await gate;
      // The test intentionally transforms a page into a track event.
      return {
        ...event,
        type: 'track',
        event: 'admitted',
      } as unknown as OptimizationEventStreamEvent;
    });
    const pending = runtime.page();
    consent.value = true;
    finish();
    await expect(pending).resolves.toMatchObject({ accepted: true });
    expect(emittedEvent.value).toMatchObject({ type: 'track', event: 'admitted' });
    expect(send).toHaveBeenCalledExactlyOnceWith(
      {
        profileId: undefined,
        events: [expect.objectContaining({ type: 'track', event: 'admitted' })],
      },
      { locale: undefined }
    );
    expect(runtime.onEventBlocked).not.toHaveBeenCalled();
  });

  it('publishes the response profile and request success atomically after publishing the event', async () => {
    const runtime = new TestEventRuntime();
    online.value = true;
    profile.value = completeProfile('visitor');
    const response = deferred<OptimizationData>();
    const upsert = vi
      .spyOn(runtime.api.personalization, 'upsertProfile')
      .mockReturnValue(response.promise);
    const snapshots: { profile: string | undefined; status: string }[] = [];
    const dispose = effect(() => {
      snapshots.push({
        profile: runtime.states.profile.current?.id,
        status: runtime.states.personalizationRequestState.current.status,
      });
    });
    const events = vi.fn();
    const subscription = runtime.states.eventStream.subscribe(events);
    const returnedChanges: OptimizationData['changes'] = [
      {
        type: 'Variable',
        key: 'banner',
        value: false,
        meta: { experienceId: 'experiment', variantIndex: 1 },
      },
    ];
    try {
      const pending = runtime.page();
      await vi.waitFor(() => expect(upsert).toHaveBeenCalledOnce());
      expect(runtime.states.personalizationRequestState.current).toEqual({ status: 'pending' });
      expect(events.mock.calls.slice(1).map(([event]) => event.type)).toEqual(['page']);
      expect(profile.value).toEqual(completeProfile('visitor'));
      expect(upsert).toHaveBeenCalledWith(
        { profileId: 'visitor', events: [events.mock.calls[1]![0]] },
        { locale: undefined }
      );
      response.resolve({
        profile: completeProfile('updated'),
        changes: returnedChanges,
        selectedOptimizations: [],
      });
      await pending;
      expect(snapshots).toEqual([
        { profile: 'visitor', status: 'idle' },
        { profile: 'visitor', status: 'pending' },
        { profile: 'updated', status: 'success' },
      ]);
      expect(changes.value).toEqual(returnedChanges);
      expect(runtime.getFlag('banner')).toBe(false);
    } finally {
      subscription.unsubscribe();
      dispose();
    }
  });

  it('reports transformed Analytics refusal before event publication or delivery', async () => {
    const runtime = new TestEventRuntime(['component']);
    profile.value = completeProfile('visitor');
    const send = vi.spyOn(runtime.api.analytics, 'sendBatchEvents');
    runtime.interceptors.event.add(() =>
      runtime.eventBuilder.buildHover({ ...entity, hoverId: 'hover', hoverDurationMs: 1000 })
    );
    await expect(
      runtime.trackView({ ...entity, viewId: 'view', viewDurationMs: 1000 })
    ).resolves.toEqual({ accepted: false });
    expect(runtime.onEventBlocked).toHaveBeenCalledExactlyOnceWith({
      reason: 'consent',
      method: 'trackHover',
      args: [expect.objectContaining({ type: 'exo_node_hover' })],
    });
    expect(emittedEvent.value).toBeUndefined();
    expect(send).not.toHaveBeenCalled();
  });

  it.each(['reset', 'destroy'] as const)(
    'invalidates pending direct queue interception on %s',
    async (action) => {
      const runtime = new TestEventRuntime();
      consent.value = true;
      profile.value = completeProfile('visitor');
      const gate = deferred<void>();
      const personalization = vi.spyOn(runtime.api.personalization, 'upsertProfile');
      const analytics = vi.spyOn(runtime.api.analytics, 'sendBatchEvents');
      runtime.interceptors.event.add(async (event) => {
        await gate.promise;
        return event;
      });
      const page = runtime.page();
      const view = runtime.trackView({ ...entity, viewId: 'view', viewDurationMs: 1000 });
      runtime[action]();
      gate.resolve();
      await expect(page).resolves.toEqual({ accepted: false });
      // Analytics queue cancellation returns void. The event method maps only an
      // explicit consent refusal to accepted:false; neither result permits stale publication.
      await expect(view).resolves.toEqual({ accepted: true });
      expect(emittedEvent.value).toBeUndefined();
      expect(runtime.personalizationQueue.queuedEventCount).toBe(0);
      expect(runtime.analyticsQueue.queuedEventCount).toBe(0);
      expect(personalization).not.toHaveBeenCalled();
      expect(analytics).not.toHaveBeenCalled();
    }
  );
});

describe('WebEventRuntime blocked reporting', () => {
  it('maps final types to method names while reporting explicitly requested unmapped wire names', () => {
    const runtime = new TestEventRuntime();
    const report = runtime.onEventBlocked;
    expect(runtime.admit({ type: 'exo_node_hover' })).toBe(false);
    expect(runtime.admit({ type: 'screen' })).toBe(false);
    expect(runtime.admit({ type: 'screen' }, true)).toBe(false);
    expect(report.mock.calls.map(([event]) => event.method)).toEqual(['trackHover', 'screen']);
    consent.value = true;
    expect(runtime.admit({ type: 'screen' }, true)).toBe(true);
    expect(runtime.hasConsent('track')).toBe(true);
  });

  it('warns on callback errors and publishes blocked metadata afterward', () => {
    const runtime = new TestEventRuntime();
    const error = new Error('callback');
    runtime.onEventBlocked.mockImplementation(() => {
      throw error;
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const event: BlockedEvent = { reason: 'consent', method: 'track', args: [] };
    runtime.reportBlocked(event);
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      'onEventBlocked callback failed for method "track"',
      error
    );
    expect(blockedEvent.value).toBe(event);
  });

  it.each(['reset', 'destroy'] as const)(
    'does not publish blocked metadata when callback triggers %s',
    (action) => {
      const runtime = new TestEventRuntime();
      runtime.onEventBlocked.mockImplementation(() => runtime[action]());
      runtime.reportBlocked({ reason: 'consent', method: 'track', args: [] });
      expect(runtime.onEventBlocked).toHaveBeenCalledOnce();
      expect(blockedEvent.value).toBeUndefined();
      runtime.destroy();
      runtime.reportBlocked({ reason: 'consent', method: 'track', args: [] });
      expect(runtime.onEventBlocked).toHaveBeenCalledOnce();
    }
  );
});

describe('WebEventRuntime XDA preparation', () => {
  it.each(['identify', 'track', 'page'] as const)(
    'builds %s arguments and intercepts exactly once without mutating input',
    async (type) => {
      const runtime = new TestEventRuntime();
      consent.value = true;
      const method =
        type === 'identify' ? 'buildIdentify' : type === 'track' ? 'buildTrack' : 'buildPageView';
      const build = vi.spyOn(runtime.eventBuilder, method);
      const event =
        type === 'identify'
          ? { type, userId: 'visitor' }
          : type === 'track'
            ? { type, event: 'action' }
            : { type, properties: { title: 'Current' } };
      const options = { personalization: { events: [event] } };
      const original = globalThis.structuredClone(options);
      const hook = vi.fn(
        (event: Parameters<typeof runtime.interceptors.event.run>[0]) =>
          ({
            ...event,
            context: { ...event.context, userAgent: 'enriched' },
          }) as unknown as OptimizationEventStreamEvent
      );
      runtime.interceptors.event.add(hook);
      const result = await runtime.prepare(options);
      expect(result.personalization?.events).toMatchObject([
        { type, messageId: expect.any(String), context: { userAgent: 'enriched' } },
      ]);
      expect(result.personalization?.events).toHaveLength(1);
      expect(build).toHaveBeenCalledOnce();
      expect(hook).toHaveBeenCalledOnce();
      expect(options).toEqual(original);
      await expect(runtime.prepare({})).resolves.toEqual({ personalization: undefined });
      expect(build).toHaveBeenCalledOnce();
      expect(hook).toHaveBeenCalledOnce();
      expect(emittedEvent.value).toBeUndefined();
    }
  );

  it('retains raw query arrays without rebuilding and gates arguments before construction without synthesizing a page', async () => {
    const runtime = new TestEventRuntime();
    const page = server.buildPageView();
    const raw = {
      ...page,
      context: {
        ...page.context,
        page: { ...page.context.page, query: { filter: ['first', 'second'] } },
      },
    };
    const original = globalThis.structuredClone(raw);
    const buildPage = vi.spyOn(runtime.eventBuilder, 'buildPageView');
    const result = await runtime.prepare({ personalization: { events: [raw] } });
    expect(result.personalization?.events).toEqual([withEventConsent(raw, false)]);
    expect(raw).toEqual(original);
    expect(buildPage).not.toHaveBeenCalled();
    const buildTrack = vi.spyOn(runtime.eventBuilder, 'buildTrack');
    await expect(
      runtime.prepare({
        personalization: { profileId: 'caller', events: [{ type: 'track', event: 'blocked' }] },
      })
    ).resolves.toEqual({ personalization: { profileId: 'caller', events: [] } });
    expect(buildTrack).not.toHaveBeenCalled();
    expect(buildPage).not.toHaveBeenCalled();
  });

  it.each(['timestamp', 'context'] as const)(
    'validates final XDA batch with invalid %s before reporting an earlier valid blocked type',
    async (field) => {
      const runtime = new TestEventRuntime();
      const first = server.buildPageView();
      const second = server.buildPageView();
      const hook = vi.fn((event: Parameters<typeof runtime.interceptors.event.run>[0]) => {
        if (event.messageId === first.messageId)
          return { ...event, type: 'track' as const, event: 'blocked', properties: {} };
        const invalid = { ...event };
        Reflect.set(invalid, field, field === 'timestamp' ? 123 : null);
        return invalid;
      });
      runtime.interceptors.event.add(hook);
      await expect(
        runtime.prepare({ personalization: { events: [first, second] } })
      ).rejects.toThrow('Invalid Experience personalization');
      expect(hook).toHaveBeenCalledTimes(2);
      expect(runtime.onEventBlocked).not.toHaveBeenCalled();
      expect(emittedEvent.value).toBeUndefined();
    }
  );

  it('prepares concurrently in input order, stamps incoming consent and preserves final metadata and caller input', async () => {
    const runtime = new TestEventRuntime();
    const first = deferred<void>();
    const secondStarted = deferred<void>();
    const events = [server.buildTrack({ event: 'first' }), server.buildTrack({ event: 'second' })];
    Object.assign(events[0]!.context.gdpr!, { isConsentGiven: 'yes' });
    const original = globalThis.structuredClone(events);
    consent.value = true;
    runtime.interceptors.event.add(async (event) => {
      expect(event.context.gdpr).toEqual({ isConsentGiven: true });
      const name = event.type === 'track' ? event.event : event.type;
      if (name === 'first') await first.promise;
      else secondStarted.resolve();
      return {
        ...event,
        event: `updated:${name}`,
        context: { ...event.context, gdpr: { isConsentGiven: false } },
      } as unknown as OptimizationEventStreamEvent;
    });
    const pending = runtime.prepare({ personalization: { events } });
    await secondStarted.promise;
    first.resolve();
    const result = await pending;
    expect(
      result.personalization?.events?.map((event) => event.type === 'track' && event.event)
    ).toEqual(['updated:first', 'updated:second']);
    expect(
      result.personalization?.events?.every((event) => event.context.gdpr?.isConsentGiven === false)
    ).toBe(true);
    expect(events).toEqual(original);
  });

  it('filters asynchronous final types using current consent while retaining caller profile', async () => {
    const runtime = new TestEventRuntime();
    const gate = deferred<void>();
    runtime.interceptors.event.add(async (event) => {
      await gate.promise;
      return {
        ...event,
        type: 'track',
        event: 'rewritten',
      } as unknown as OptimizationEventStreamEvent;
    });
    const pending = runtime.prepare({
      personalization: { profileId: 'caller-profile', events: [server.buildPageView()] },
    });
    gate.resolve();
    await expect(pending).resolves.toEqual({
      personalization: { profileId: 'caller-profile', events: [] },
    });
    expect(runtime.onEventBlocked).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'track' })
    );
    expect(emittedEvent.value).toBeUndefined();
  });

  it('reports a valid transformed unmapped XDA type with its wire name', async () => {
    const runtime = new TestEventRuntime();
    runtime.interceptors.event.add((event) => {
      const screen = { ...event, context: { ...event.context, screen: { name: 'screen' } } };
      Reflect.set(screen, 'type', 'screen');
      Reflect.set(screen, 'name', 'screen');
      return screen as unknown as OptimizationEventStreamEvent;
    });
    const result = await runtime.prepare({ personalization: { events: [server.buildPageView()] } });
    expect(runtime.onEventBlocked).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'screen',
        args: [expect.objectContaining({ type: 'screen' })],
      })
    );
    expect(result.personalization?.events).toEqual([]);
  });

  it.each(['caller', 'blocked callback'] as const)(
    'checks operation currentness after %s invalidation',
    async (source) => {
      const runtime = new TestEventRuntime();
      const gate = deferred<void>();
      let current = true;
      runtime.interceptors.event.add(async (event) => {
        await gate.promise;
        return {
          ...event,
          type: 'track',
          event: 'blocked',
        } as unknown as OptimizationEventStreamEvent;
      });
      runtime.onEventBlocked.mockImplementation(() => {
        current = false;
      });
      const pending = runtime.prepare(
        { personalization: { events: [server.buildPageView()] } },
        () => {
          if (!current) throw new Error('superseded');
        }
      );
      const rejected = expect(pending).rejects.toThrow('superseded');
      if (source === 'caller') current = false;
      gate.resolve();
      await rejected;
      expect(runtime.onEventBlocked).toHaveBeenCalledTimes(source === 'caller' ? 0 : 1);
      expect(emittedEvent.value).toBeUndefined();
    }
  );
});

describe('WebEventRuntime queue policy and ordering', () => {
  it('applies queuePolicy.flush: interval, backoff, and failure callbacks', async () => {
    vi.useFakeTimers();
    consent.value = true;
    online.value = true;
    profile.value = completeProfile('visitor');
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const send = vi
      .spyOn(AnalyticsApiClient.prototype, 'sendBatchEvents')
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true);
    const onFlushFailure = vi.fn(() => {
      throw new Error('callback');
    });
    const onFlushRecovered = vi.fn();
    const runtime = new TestEventRuntime(DEFAULT_ALLOWED_EVENT_TYPES, {
      flush: { flushIntervalMs: 1_000, baseBackoffMs: 100, onFlushFailure, onFlushRecovered },
    });
    await runtime.trackClick(entity);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(send).toHaveBeenCalledTimes(1);
    expect(onFlushFailure).toHaveBeenCalledWith(
      expect.objectContaining({ consecutiveFailures: 1, queuedEvents: 1, retryDelayMs: 100 })
    );

    await vi.advanceTimersByTimeAsync(100);
    expect(send).toHaveBeenCalledTimes(2);
    expect(onFlushRecovered).toHaveBeenCalledWith({ consecutiveFailures: 1 });
  });
  it('awaits Analytics before flushing Personalization and waits for both queues', async () => {
    vi.useFakeTimers();
    consent.value = true;
    profile.value = completeProfile('visitor');
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
    const runtime = new TestEventRuntime();
    runtime.connectivity();

    // A Personalization batch fails once and waits in backoff.
    online.value = false;
    await runtime.page();
    online.value = true;
    await vi.advanceTimersByTimeAsync(0);
    expect(upsert).toHaveBeenCalledTimes(1);

    // Move the clock past the backoff without firing timers, so the batch is eligible
    // for flush() but nothing else has retried it.
    vi.setSystemTime(Date.now() + 60_000);
    await runtime.trackClick(entity);

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

  it('keeps event and transport locales distinct and reads the current locale when queued work drains', async () => {
    consent.value = true;
    online.value = true;
    const runtime = new TestEventRuntime();
    runtime.setLocale('en-US');
    const send = vi.spyOn(runtime.api.personalization, 'upsertProfile').mockResolvedValue({
      profile: completeProfile('visitor'),
      changes: [],
      selectedOptimizations: [],
    });
    await runtime.identify({ userId: 'visitor', locale: 'fr-FR' });
    expect(send.mock.calls[0]?.[0].events[0]?.context.locale).toBe('fr-FR');
    expect(send.mock.calls[0]?.[1]).toEqual({ locale: 'en-US' });
    online.value = false;
    await runtime.track({ event: 'queued', locale: 'it-IT' });
    expect(send).toHaveBeenCalledOnce();
    runtime.setLocale('de-DE');
    online.value = true;
    await runtime.flush();
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1]?.[0].events[0]?.context.locale).toBe('it-IT');
    expect(send.mock.calls[1]?.[1]).toEqual({ locale: 'de-DE' });
  });
});

it('drops Analytics while its first profile request is pending and accepts tracking after that profile arrives', async () => {
  const runtime = new TestEventRuntime();
  online.value = true;
  consent.value = true;
  const response = deferred<OptimizationData>();
  vi.spyOn(runtime.api.personalization, 'upsertProfile').mockReturnValueOnce(response.promise);
  const analytics = vi.spyOn(runtime.api.analytics, 'sendBatchEvents').mockResolvedValue(true);
  const pending = runtime.page();
  await expect(
    runtime.trackClick({ entityId: 'experience', entityKind: 'Experience' })
  ).resolves.toEqual({ accepted: true });
  response.resolve({
    profile: completeProfile('issued-profile'),
    changes: [],
    selectedOptimizations: [],
  });
  await pending;
  await runtime.flush();
  expect(analytics).not.toHaveBeenCalled();
  await runtime.trackClick({ entityId: 'experience', entityKind: 'Experience' });
  await runtime.flush();
  expect(analytics).toHaveBeenCalledWith([
    expect.objectContaining({ profile: completeProfile('issued-profile') }),
  ]);
});

function createAdmission(allowed: readonly AllowedEventType[] = DEFAULT_ALLOWED_EVENT_TYPES) {
  const runtime = new TestEventRuntime(allowed);
  const send = vi
    .spyOn(runtime.personalizationQueue, 'sendPrepared')
    .mockReturnValue({ accepted: true });
  return { runtime, send, report: runtime.onEventBlocked };
}

describe('WebEventRuntime prepared batches', () => {
  it('admits the exact evaluated batch before HTTP completes and applies the response profile', async () => {
    const runtime = new TestEventRuntime();
    online.value = true;
    consent.value = true;
    const response = deferred<OptimizationData>();
    const upsert = vi
      .spyOn(runtime.api.personalization, 'upsertProfile')
      .mockReturnValue(response.promise);
    const events = [server.buildTrack({ event: 'prepared' }), server.buildPageView()];
    const original = globalThis.structuredClone(events);
    expect(runtime.states.profile.current).toBeUndefined();

    await expect(runtime.sendPrepared(events, undefined, 'de-DE')).resolves.toEqual({
      accepted: true,
    });

    expect(runtime.states.personalizationRequestState.current).toEqual({ status: 'pending' });
    expect(upsert).toHaveBeenCalledExactlyOnceWith(
      { profileId: undefined, events },
      { preflight: false, locale: 'de-DE' }
    );
    expect(upsert.mock.calls[0]?.[0].events.map((event) => event.messageId)).toEqual(
      events.map((event) => event.messageId)
    );
    expect(
      upsert.mock.calls[0]?.[0].events.every((event) => event.context.gdpr?.isConsentGiven === true)
    ).toBe(true);
    expect(runtime.states.profile.current).toBeUndefined();
    expect(events).toEqual(original);

    response.resolve({
      profile: completeProfile('api-profile'),
      changes: [],
      selectedOptimizations: [],
    });
    await runtime.flush();
    expect(runtime.states.profile.current).toEqual(completeProfile('api-profile'));
    expect(runtime.states.personalizationRequestState.current).toEqual({ status: 'success' });
  });

  it.each([undefined, false, true])(
    'restamps evaluated bodies with live consent %s without changing input',
    async (browserConsent) => {
      const { runtime, send } = createAdmission();
      const events = [
        ...(browserConsent === true ? [server.buildTrack({ event: 'prepared' })] : []),
        server.buildPageView(),
      ].map((event) => withEventConsent(event, browserConsent !== true));
      const original = globalThis.structuredClone(events);
      consent.value = browserConsent;
      await expect(runtime.sendPrepared(events, 'server-profile', 'de-DE')).resolves.toEqual({
        accepted: true,
      });
      expect(send).toHaveBeenCalledExactlyOnceWith(
        events.map((event) => ({
          ...event,
          context: { ...event.context, gdpr: { isConsentGiven: browserConsent === true } },
        })),
        { profileId: 'server-profile', locale: 'de-DE' }
      );
      expect(events).toEqual(original);
      expect(profile.value).toBeUndefined();
      expect(runtime.continuationId).toBe('server-profile');
    }
  );

  it.each([{ allowed: DEFAULT_ALLOWED_EVENT_TYPES }, { allowed: [] }])(
    'refuses a whole mixed batch under allowlist $allowed and reports each refusal in order',
    async ({ allowed }) => {
      const { runtime, report, send } = createAdmission(allowed);
      const events = [server.buildTrack({ event: 'prepared' }), server.buildPageView()];
      await expect(runtime.sendPrepared(events)).resolves.toEqual({ accepted: false });
      expect(report.mock.calls.map(([event]) => event)).toEqual([
        { reason: 'consent', method: 'track', args: [events[0]] },
        ...(allowed.length === 0 ? [{ reason: 'consent', method: 'page', args: [events[1]] }] : []),
      ]);
      expect(send).not.toHaveBeenCalled();
      expect(emittedEvent.value).toBeUndefined();
    }
  );

  it.each(['reset', 'destroy', 'supersession'] as const)(
    'stops batch reporting after callback %s',
    async (action) => {
      const { runtime, report, send } = createAdmission([]);
      let current = true;
      report.mockImplementation(() => {
        if (action === 'supersession') current = false;
        else runtime[action]();
      });
      await expect(
        runtime.sendPrepared(
          [server.buildTrack({ event: 'first' }), server.buildPageView()],
          'target',
          undefined,
          () => current
        )
      ).resolves.toEqual({ accepted: false });
      expect(report).toHaveBeenCalledOnce();
      expect(send).not.toHaveBeenCalled();
    }
  );

  it.each(['reset', 'destroy', 'supersession', 'profile'] as const)(
    'does not adopt stale identity when queue publication changes %s',
    async (action) => {
      const { runtime, send } = createAdmission();
      let current = true;
      send.mockImplementation(() => {
        if (action === 'profile') profile.value = completeProfile('published');
        else if (action === 'supersession') current = false;
        else runtime[action]();
        return { accepted: true };
      });
      await runtime.sendPrepared([server.buildPageView()], 'stale', undefined, () => current);
      expect(runtime.continuationId).toBeUndefined();
      expect(profile.value).toEqual(
        action === 'profile' ? completeProfile('published') : undefined
      );
    }
  );
});

it('reports event subscriber errors without interrupting prepared admission bookkeeping', async () => {
  consent.value = true;
  const runtime = new TestEventRuntime(),
    error = new Error('diagnostic subscriber failed');
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const request = vi.spyOn(runtime.api.personalization, 'upsertProfile');
  const events = vi.fn();
  const observing = runtime.states.eventStream.subscribe(events);
  const failing = runtime.states.eventStream.subscribe((event) => {
    if (event) throw error;
  });
  try {
    await expect(
      runtime.sendPrepared(
        [server.buildTrack({ event: 'prepared' }), server.buildPageView()],
        'target',
        undefined,
        () => true
      )
    ).resolves.toEqual({ accepted: true });
    expect(runtime.personalizationQueue.queuedEventCount).toBe(2);
    expect(events.mock.calls.map(([event]) => event?.type)).toEqual([undefined, 'track', 'page']);
    expect(request).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith('Event stream subscriber failed', error);
  } finally {
    observing.unsubscribe();
    failing.unsubscribe();
  }
});
