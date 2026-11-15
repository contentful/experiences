// @vitest-environment jsdom

import {
  EventBuilder,
  PROFILE_CACHE_KEY,
  withEventConsent,
  type ExperiencesHandoff,
} from '@contentful/experiences-runtime';
import {
  InsightsApiClient as AnalyticsApiClient,
  ExperienceApiClient as PersonalizationApiClient,
} from '@contentful/optimization-api-client';
import { type Profile as EventProfile } from '@contentful/optimization-api-client/api-schemas';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContentfulExperiences, type Config } from '../../sdk/contentful-experiences.js';
import { getTrackingAttributes } from '../../tracking-attributes.js';
import { type TrackingAttribution } from '../../tracking/attribution.js';
import type { Subscription } from '../../signals/Observable.js';
import { clearIdentityCookies, seedConsent } from '../consent.js';
import { advance, deferred, installIOPolyfill, setDocumentVisibility } from '../dom.js';
import { completeProfile } from '../fixtures/profile.js';
import { createRuntimeConfig, createRuntimeFactory } from '../runtime-config.js';

beforeEach(() => document.body.replaceChildren());
afterEach(() => document.body.replaceChildren());

it('forwards the public offline capacity to ordinary Personalization admission and delivery', async () => {
  vi.useFakeTimers();
  let runtime: ContentfulExperiences | undefined;
  let subscription: Subscription | undefined;
  const published = vi.fn();
  const upsert = vi
    .spyOn(PersonalizationApiClient.prototype, 'upsertProfile')
    .mockResolvedValue({ profile: completeProfile('visitor') } as never);
  try {
    window.localStorage.clear();
    clearIdentityCookies();
    runtime = new ContentfulExperiences(
      createRuntimeConfig({ queuePolicy: { offlineMaxEvents: 3 } })
    );
    runtime.consent({ events: true, persistence: false });
    subscription = runtime.states.eventStream.subscribe(published);
    published.mockClear();
    window.dispatchEvent(new Event('offline'));

    const results = [];
    for (let index = 0; index < 4; index++) {
      results.push(await runtime.track({ event: `offline-${index}` }));
    }
    expect(results.map((result) => result.accepted)).toEqual([true, true, true, false]);
    const admitted = published.mock.calls.map(([event]) => event);
    expect(admitted).toEqual(
      [0, 1, 2].map((index) =>
        expect.objectContaining({ type: 'track', event: `offline-${index}` })
      )
    );
    expect(upsert).not.toHaveBeenCalled();

    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(0);

    expect(upsert.mock.calls.flatMap(([request]) => request.events)).toEqual(admitted);
    expect(published).toHaveBeenCalledTimes(3);
  } finally {
    subscription?.unsubscribe();
    window.dispatchEvent(new Event('online'));
    runtime?.destroy();
    await vi.advanceTimersByTimeAsync(0);
    vi.useRealTimers();
    vi.restoreAllMocks();
    window.localStorage.clear();
    clearIdentityCookies();
  }
});

describe('Analytics queue lifecycle commands', () => {
  const runtimes = new Set<ContentfulExperiences>();

  const createRuntime = createRuntimeFactory(runtimes, ContentfulExperiences, () =>
    createRuntimeConfig({
      defaults: { profile: completeProfile('visitor') },
    })
  );

  const click = (runtime: ContentfulExperiences) =>
    runtime.trackClick({ entityId: 'hero', entityKind: 'Experience' });

  beforeEach(() => {
    seedConsent({ events: true, persistence: true });
    vi.useFakeTimers();
    setDocumentVisibility('visible');
  });

  afterEach(() => {
    for (const runtime of runtimes) runtime.destroy();
    runtimes.clear();
    vi.useRealTimers();
    vi.restoreAllMocks();
    window.localStorage.clear();
    clearIdentityCookies();
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
  });
  it('gives a Personalization batch waiting for retry a final forced attempt', async () => {
    vi.useFakeTimers();
    setDocumentVisibility('visible');
    const upsert = vi
      .spyOn(PersonalizationApiClient.prototype, 'upsertProfile')
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ profile: completeProfile('visitor') } as never);
    vi.spyOn(AnalyticsApiClient.prototype, 'sendBatchEvents').mockResolvedValue(true);
    const runtime = createRuntime({ defaults: { profile: completeProfile('visitor') } });

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
  it('sends a queued offline page on destroy under the current profile, not an older one', async () => {
    vi.useFakeTimers();
    setDocumentVisibility('visible');
    const upsert = vi
      .spyOn(PersonalizationApiClient.prototype, 'upsertProfile')
      .mockResolvedValueOnce({ profile: completeProfile('profile-A') } as never)
      .mockResolvedValueOnce({ profile: completeProfile('profile-B') } as never)
      .mockResolvedValue({ profile: completeProfile('profile-B') } as never);
    const runtime = createRuntime({ defaults: { profile: undefined } });

    // A completed drain under A.
    window.dispatchEvent(new Event('offline'));
    await runtime.page();
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(0);
    // A newer direct identify() response makes B the current profile.
    await runtime.identify({ userId: 'user-1' });
    expect(runtime.states.profile.current?.id).toBe('profile-B');
    // An ordinary offline page, drained during destruction.
    window.dispatchEvent(new Event('offline'));
    await runtime.page();
    runtime.destroy();
    await vi.advanceTimersByTimeAsync(0);

    expect(upsert.mock.calls.at(-1)?.[0].profileId).toBe('profile-B');
  });
});

describe('pending delivery and browser lifetime', () => {
  class TestContentfulExperiences extends ContentfulExperiences {
    admit(
      events: NonNullable<ExperiencesHandoff['replay']>['events'],
      profileId?: string,
      locale?: string
    ) {
      return this.sendPreparedPersonalizationEvents(events, profileId, locale);
    }
  }

  const runtimes = new Set<TestContentfulExperiences>();

  function createRuntime(profile?: EventProfile) {
    const runtime = new TestContentfulExperiences({
      spaceId: 'space',
      environmentId: 'environment',
      locale: 'en-US',
      delivery: { accessToken: 'delivery-token' },
      ...(profile === undefined ? {} : { defaults: { profile } }),
    });
    runtimes.add(runtime);
    return runtime;
  }

  // Prepared for an opted-in visitor, matching the browser these tests run as.
  function prepared(runtime: TestContentfulExperiences, consent = true) {
    return [
      runtime.eventBuilder.buildTrack({ event: 'prepared' }),
      runtime.eventBuilder.buildPageView(),
    ].map((event) => withEventConsent(event, consent));
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
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('Web prepared Personalization delivery', () => {
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

      window.dispatchEvent(new Event('online'));
      await vi.waitFor(() => expect(upsert).toHaveBeenCalledTimes(2));
      await vi.waitFor(() =>
        expect(runtime.states.profile.current).toEqual(completeProfile('connected-profile'))
      );
    });
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
});

describe('browser discovery ownership', () => {
  const ATTRIBUTIONS: Record<string, TrackingAttribution> = {
    'node:page': { entityId: 'landing', entityKind: 'Experience' },
    'node:hero': {
      entityId: 'hero',
      entityKind: 'ExperienceFragment',
      parentExperienceId: 'landing',
    },
  };

  const runtimes = new Set<ContentfulExperiences>();

  async function removeRendered(): Promise<void> {
    document.body.replaceChildren();
    await Promise.resolve();
    if (vi.isFakeTimers()) await advance(0);
  }

  const createRuntime = createRuntimeFactory(
    runtimes,
    ContentfulExperiences,
    () =>
      ({
        spaceId: 'space',
        environmentId: 'environment',
        delivery: { accessToken: 'delivery-token' },
      }) as Config
  );

  async function render(nodeId: string, tag = 'div'): Promise<HTMLElement> {
    const element = document.createElement(tag);
    for (const [name, value] of Object.entries(
      getTrackingAttributes({ roots: [{ key: nodeId }] })
    )) {
      element.setAttribute(name, value);
    }
    element.setAttribute('data-ctfl-attribution', JSON.stringify({ scopes: ATTRIBUTIONS }));
    document.body.append(element);
    await Promise.resolve();
    if (vi.isFakeTimers()) await advance(0);
    return element;
  }

  /** Spies on the Analytics transport so tests see what would actually be sent. */
  function spyOnTransport(runtime: ContentfulExperiences) {
    const send = vi.spyOn(runtime.api.analytics, 'sendBatchEvents').mockResolvedValue(true);
    transportOwners.set(send, runtime);
    return send;
  }

  const transportOwners = new WeakMap<object, ContentfulExperiences>();

  /** Analytics events are queued, so flush the owning runtime before reading what was sent. */
  const sentEvents = async (send: ReturnType<typeof spyOnTransport>) => {
    await transportOwners.get(send)?.flush();
    return send.mock.calls.flatMap(([batches]) => batches.flatMap((batch) => batch.events));
  };

  const click = (element: Element): void => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  };

  beforeEach(() => {
    seedConsent({ events: true, persistence: true });
    vi.useFakeTimers();
    vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
    setDocumentVisibility('visible');
  });

  afterEach(() => {
    for (const runtime of runtimes) runtime.destroy();
    runtimes.clear();
    window.localStorage.clear();
    clearIdentityCookies();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  describe('ContentfulExperiences interaction tracking', () => {
    it('clears explicit element overrides on reset while resuming automatic tracking', async () => {
      const runtime = createRuntime();
      const trackClick = vi.spyOn(runtime, 'trackClick').mockResolvedValue({ accepted: true });
      const automatic = await render('node:hero', 'button');
      const manual = document.createElement('button');
      document.body.append(manual);
      runtime.tracking.disable('views');
      runtime.tracking.disableElement('clicks', automatic);
      runtime.tracking.enableElement('clicks', manual, { data: ATTRIBUTIONS['node:hero'] });
      click(automatic);
      click(manual);
      expect(trackClick).toHaveBeenCalledOnce();
      runtime.reset();
      click(manual);
      expect(trackClick).toHaveBeenCalledOnce();
      click(automatic);
      expect(trackClick).toHaveBeenCalledTimes(2);
    });

    it('sends interactions through the runtime event methods', async () => {
      const runtime = createRuntime();
      const trackClick = vi.spyOn(runtime, 'trackClick').mockResolvedValue({ accepted: true });
      const hero = await render('node:hero', 'button');

      runtime.tracking.disable('views');
      click(hero);

      expect(trackClick).toHaveBeenCalledWith(
        expect.objectContaining({ entityId: 'hero', parentExperienceId: 'landing' })
      );
      await removeRendered();
    });

    it('discovers roots on a replacement SDK after destroy', async () => {
      const first = createRuntime();
      const hero = await render('node:hero', 'button');
      const firstClick = vi.spyOn(first, 'trackClick').mockResolvedValue({ accepted: true });
      click(hero);
      first.destroy();
      click(hero);
      expect(firstClick).toHaveBeenCalledOnce();

      const replacement = createRuntime();
      const replacementClick = vi
        .spyOn(replacement, 'trackClick')
        .mockResolvedValue({ accepted: true });
      click(hero);
      expect(replacementClick).toHaveBeenCalledOnce();
    });

    it('drops active measurements on reset and resumes fresh visitor measurements', async () => {
      const io = installIOPolyfill();
      vi.spyOn(PersonalizationApiClient.prototype, 'upsertProfile').mockResolvedValue({
        profile: completeProfile('new-visitor'),
      } as never);
      const runtime = createRuntime({ defaults: { profile: completeProfile('old-visitor') } });
      const qualifying = deferred<void>();
      const intercept = vi.fn();
      runtime.interceptors.event.add(async (event) => {
        intercept(event);
        if (event.type === 'exo_node_view' || event.type === 'exo_node_hover') {
          await qualifying.promise;
        }
        return event;
      });
      const send = spyOnTransport(runtime);
      const page = await render('node:page', 'main');
      const hero = await render('node:hero', 'button');
      runtime.tracking.disable('clicks');
      const originalObserver = io.getLast();

      io.trigger(page, true);
      hero.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
      await advance(1500);
      expect(intercept).toHaveBeenCalledTimes(2);
      // Queue final durations behind the qualifying callbacks before resetting.
      io.trigger(page, false);
      hero.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));
      await advance(0);
      runtime.reset();
      await runtime.page();
      expect(runtime.states.profile.current).toEqual(completeProfile('new-visitor'));
      qualifying.resolve();
      await advance(0);

      // Reset drops measurements rather than sending the previous visitor's duration.
      // A callback from the previous observer cannot start a new visitor's interval.
      originalObserver.trigger(page, true);
      await advance(3000);
      hero.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));
      expect(await sentEvents(send)).toEqual([]);

      // Automatic tracking resumes with the retained configuration and fresh timers.
      io.trigger(page, true);
      hero.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
      await advance(1400);
      hero.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));
      await removeRendered();

      const events = await sentEvents(send);
      expect(
        events
          .filter((event) => event.type === 'exo_node_view')
          .map((event) => event.viewDurationMs)
      ).toEqual([1000, 1400]);
      expect(
        events
          .filter((event) => event.type === 'exo_node_hover')
          .map((event) => event.hoverDurationMs)
      ).toEqual([1000, 1400]);
      expect(
        send.mock.calls.flatMap(([batches]) => batches.map((batch) => batch.profile.id))
      ).toEqual(['new-visitor']);
    });

    it('drops tracked clicks under a bare continuation ID until delivery commits a complete profile', async () => {
      vi.useRealTimers();
      const builder = new EventBuilder({
        channel: 'server',
        library: { name: 'test', version: '1' },
      });
      let finishReplay!: (value: unknown) => void;
      vi.spyOn(PersonalizationApiClient.prototype, 'upsertProfile').mockReturnValueOnce(
        new Promise((resolve) => {
          finishReplay = resolve;
        }) as never
      );
      const sendBatchEvents = vi
        .spyOn(AnalyticsApiClient.prototype, 'sendBatchEvents')
        .mockResolvedValue(true);
      const runtime = createRuntime();
      await expect(
        runtime.hydrateAndTrackCurrentPage(
          {
            spaceId: 'space',
            environmentId: 'environment',
            cache: { scope: 'private-request' },
            profileId: 'server-profile',
            replay: { routeKey: '/', events: [builder.buildPageView()] },
          },
          { routeKey: '/' }
        )
      ).resolves.toEqual({ accepted: true });
      const hero = await render('node:hero', 'button');

      const trackClick = vi.spyOn(runtime, 'trackClick');

      runtime.tracking.disable('views');
      click(hero);
      // Analytics rejects an id-only profile, so the click under the continuation ID is
      // admitted but not sent.
      await vi.waitFor(() => expect(trackClick).toHaveBeenCalledOnce());
      await expect(trackClick.mock.results[0]!.value).resolves.toEqual({ accepted: true });
      expect(sendBatchEvents).not.toHaveBeenCalled();

      finishReplay({ profile: completeProfile('committed-profile') });
      await vi.waitFor(() => expect(runtime.states.profile.current?.id).toBe('committed-profile'));
      click(hero);
      await vi.waitFor(() => expect(trackClick).toHaveBeenCalledTimes(2));
      await runtime.flush();

      const [[batch]] = sendBatchEvents.mock.calls as unknown as [
        [[{ profile: { id: string }; events: { type: string }[] }]],
      ];
      expect(sendBatchEvents).toHaveBeenCalledOnce();
      expect(batch[0]!.profile.id).toBe('committed-profile');
      expect(batch[0]!.events.map((event) => event.type)).toEqual(['exo_node_click']);
      await removeRendered();
    });

    describe('consent', () => {
      it('drops clicks while event consent is denied and sends them once granted', async () => {
        seedConsent({ events: false });
        const onEventBlocked = vi.fn();
        const runtime = createRuntime({
          defaults: { profile: completeProfile('visitor') },
          onEventBlocked,
        });
        const send = spyOnTransport(runtime);
        const hero = await render('node:hero', 'button');

        runtime.tracking.disable('views');
        click(hero);
        await advance(0);

        // The click detector does not listen while clicks are not permitted, so the
        // gesture never reaches the gate and nothing is sent.
        expect(send).not.toHaveBeenCalled();
        expect(onEventBlocked).not.toHaveBeenCalled();

        // A manual call still reaches the gate, which stays as a backstop and reports.
        await expect(
          runtime.trackClick({ entityId: 'hero', entityKind: 'ExperienceFragment' })
        ).resolves.toEqual({ accepted: false });
        expect(onEventBlocked).toHaveBeenCalledWith(
          expect.objectContaining({ reason: 'consent', method: 'trackClick' })
        );

        runtime.consent({ events: true });
        click(hero);
        await advance(0);
        await runtime.flush();

        expect(send).toHaveBeenCalledTimes(1);
        await removeRendered();
      });

      it('admits clicks under a click-only allow-list', async () => {
        seedConsent({ events: false });
        const runtime = createRuntime({
          defaults: { profile: completeProfile('visitor') },
          allowedEventTypes: ['component_click'],
        });
        const send = spyOnTransport(runtime);
        const hero = await render('node:hero', 'button');

        runtime.tracking.disable('views');
        click(hero);
        await advance(0);
        await runtime.flush();

        expect(send).toHaveBeenCalledTimes(1);
        await removeRendered();
      });
    });

    describe('timed interactions across consent changes', () => {
      it('keeps allowlisted views and hovers live across withdrawal, regrant and boundary mutation', async () => {
        const io = installIOPolyfill();
        const runtime = createRuntime({
          defaults: { profile: completeProfile('visitor') },
          allowedEventTypes: ['component', 'component_hover'],
        });
        const send = spyOnTransport(runtime);
        const page = await render('node:page', 'main');
        const hero = await render('node:hero', 'button');
        runtime.tracking.disable('clicks');

        for (const stage of ['initial', 'withdrawn', 'withdrawn again', 'regranted', 'mutated']) {
          if (stage.startsWith('withdrawn')) runtime.consent({ events: false });
          if (stage === 'regranted') runtime.consent({ events: true });
          if (stage === 'mutated') {
            page.setAttribute(
              'data-ctfl-attribution',
              JSON.stringify({ scopes: ATTRIBUTIONS, revision: 1 })
            );
            hero.setAttribute(
              'data-ctfl-attribution',
              JSON.stringify({ scopes: ATTRIBUTIONS, revision: 1 })
            );
            await advance(0);
          }
          expect(runtime.hasConsent('trackView')).toBe(true);
          expect(runtime.hasConsent('trackHover')).toBe(true);
          send.mockClear();

          io.trigger(page, true);
          enter(hero);
          await advance(1400);
          io.trigger(page, false);
          leave(hero);
          await advance(0);

          const events = await sentEvents(send);
          const views = events.filter((event) => event.type === 'exo_node_view');
          const hovers = events.filter((event) => event.type === 'exo_node_hover');
          expect(
            views.map((event) => event.viewDurationMs),
            stage
          ).toEqual([1000, 1400]);
          expect(
            hovers.map((event) => event.hoverDurationMs),
            stage
          ).toEqual([1000, 1400]);
          expect(views[1]?.viewId).toBe(views[0]?.viewId);
          expect(hovers[1]?.hoverId).toBe(hovers[0]?.hoverId);
        }
        await removeRendered();
      });

      it.each(['connected', 'removed'] as const)(
        'discards pending allowlisted callbacks from a %s boundary at withdrawal',
        async (lifecycle) => {
          const io = installIOPolyfill();
          const runtime = createRuntime({
            defaults: { profile: completeProfile('visitor') },
            allowedEventTypes: ['component', 'component_hover'],
          });
          const qualifying = deferred<void>();
          runtime.interceptors.event.add(async (event) => {
            await qualifying.promise;
            return event;
          });
          const trackView = vi.spyOn(runtime, 'trackView');
          const trackHover = vi.spyOn(runtime, 'trackHover');
          const send = spyOnTransport(runtime);
          const page = await render('node:page', 'main');
          const hero = await render('node:hero', 'button');
          runtime.tracking.disable('clicks');
          const originalObserver = io.getLast();
          io.trigger(page, true);
          enter(hero);
          await advance(1500);
          // Finals are serialised behind the still-pending qualifying callbacks.
          io.trigger(page, false);
          leave(hero);
          await advance(0);
          // Removed boundaries can still have pending final callbacks. Withdrawal
          // must invalidate those callbacks along with connected measurements.
          if (lifecycle === 'removed') {
            page.remove();
            hero.remove();
            await advance(0);
          }
          runtime.consent({ events: false });
          if (lifecycle === 'removed') {
            document.body.append(page, hero);
            await advance(0);
          }
          qualifying.resolve();
          await advance(0);
          originalObserver.trigger(page, true);
          await advance(3000);

          expect(trackView).toHaveBeenCalledTimes(1);
          expect(trackHover).toHaveBeenCalledTimes(1);
          expect(await sentEvents(send)).toEqual([]);

          // Neither the queued final nor the previous measurement crosses the boundary.
          // The existing boundary starts fresh while consent remains denied.
          io.trigger(page, true);
          enter(hero);
          await advance(1400);
          io.trigger(page, false);
          leave(hero);
          await advance(0);
          const events = await sentEvents(send);
          expect(
            events
              .filter((event) => event.type === 'exo_node_view')
              .map((event) => event.viewDurationMs)
          ).toEqual([1000, 1400]);
          expect(
            events
              .filter((event) => event.type === 'exo_node_hover')
              .map((event) => event.hoverDurationMs)
          ).toEqual([1000, 1400]);
          expect(trackView).toHaveBeenCalledTimes(3);
          expect(trackHover).toHaveBeenCalledTimes(3);
          await removeRendered();
        }
      );

      const enter = (element: Element): void => {
        element.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
      };
      const leave = (element: Element): void => {
        element.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));
      };

      it('leaves a running interaction alone when only persistence consent changes', async () => {
        seedConsent({ events: true, persistence: true });
        const runtime = createRuntime({ defaults: { profile: completeProfile('visitor') } });
        const send = spyOnTransport(runtime);
        const hero = await render('node:hero', 'button');
        runtime.tracking.disable('views');
        runtime.tracking.disable('clicks');

        enter(hero);
        await advance(500);
        runtime.consent({ persistence: false });
        await advance(700);
        leave(hero);
        await advance(0);
        await removeRendered();

        // The hover began and ended under event consent, so its measurement is untouched.
        const hovers = (await sentEvents(send)).filter((event) => event.type === 'exo_node_hover');
        expect(hovers.length).toBeGreaterThan(0);
        expect(hovers.at(-1)!.hoverDurationMs).toBeGreaterThanOrEqual(1000);
      });
    });
  });
});
