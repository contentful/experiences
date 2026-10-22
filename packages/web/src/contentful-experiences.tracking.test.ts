// @vitest-environment jsdom

import { EventBuilder } from '@contentful/experiences-runtime';
import { ExperienceApiClient, InsightsApiClient } from '@contentful/optimization-api-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ContentfulExperiences, type ExperiencesWebConfig } from './contentful-experiences.js';
import { clearIdentityCookies, seedConsent } from './test-fixtures/consent.js';
import {
  advance,
  deferred,
  installIOPolyfill,
  setDocumentVisibility,
} from './test-fixtures/dom.js';
import type { TrackingAttribution } from './tracking/attribution.js';
import { getTrackingAttributes } from './tracking-attributes.js';

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

function createRuntime(overrides: Partial<ExperiencesWebConfig> = {}): ContentfulExperiences {
  const runtime = new ContentfulExperiences({
    spaceId: 'space',
    environmentId: 'environment',
    delivery: { accessToken: 'delivery-token' },
    ...overrides,
  } as ExperiencesWebConfig);
  runtimes.add(runtime);
  return runtime;
}

async function render(nodeId: string, tag = 'div'): Promise<HTMLElement> {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(getTrackingAttributes({ roots: [{ key: nodeId }] }))) {
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
  const send = vi.spyOn(runtime.api.insights, 'sendBatchEvents').mockResolvedValue(true);
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
  it('discovers existing and later attributed DOM opt-ins when automatic flags are false', async () => {
    const existing = await render('node:hero', 'button');
    existing.setAttribute('data-ctfl-track-clicks', 'true');
    const runtime = createRuntime({
      autoTrackEntryInteraction: { views: false, hovers: false, clicks: false },
    });
    const trackClick = vi.spyOn(runtime, 'trackClick').mockResolvedValue(undefined);
    click(existing);
    expect(trackClick).toHaveBeenCalledOnce();
    const later = await render('node:hero', 'button');
    later.setAttribute('data-ctfl-track-clicks', 'true');
    await advance(0);
    click(later);
    expect(trackClick).toHaveBeenCalledTimes(2);
    runtime.consent({ events: false });
    click(existing);
    click(later);
    expect(trackClick).toHaveBeenCalledTimes(2);
    runtime.consent({ events: true });
    click(later);
    expect(trackClick).toHaveBeenCalledTimes(3);
  });

  it('clears explicit element overrides on reset while resuming automatic tracking', async () => {
    const runtime = createRuntime();
    const trackClick = vi.spyOn(runtime, 'trackClick').mockResolvedValue(undefined);
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
    const trackClick = vi.spyOn(runtime, 'trackClick').mockResolvedValue(undefined);
    const hero = await render('node:hero', 'button');

    runtime.tracking.disable('views');
    click(hero);

    expect(trackClick).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: 'hero', parentExperienceId: 'landing' })
    );
    await removeRendered();
  });

  it('finalizes an in-progress view when its boundary is removed', async () => {
    const io = installIOPolyfill();
    const runtime = createRuntime();
    const trackView = vi.spyOn(runtime, 'trackView').mockResolvedValue({ accepted: true });
    const page = await render('node:page', 'main');

    io.trigger(page, true);
    await advance(1400);
    await removeRendered();

    expect(trackView).toHaveBeenCalledTimes(2);
    const [first, final] = trackView.mock.calls.map(([args]) => args);
    expect(final).toMatchObject({ viewId: first!.viewId, viewDurationMs: 1400 });
  });

  it('stops tracking detached roots and discovers their replacements', async () => {
    const runtime = createRuntime();
    const trackClick = vi.spyOn(runtime, 'trackClick').mockResolvedValue(undefined);
    const oldHero = await render('node:hero', 'button');
    click(oldHero);
    oldHero.remove();
    await advance(0);
    const hero = await render('node:hero', 'button');
    click(oldHero);
    click(hero);
    expect(trackClick).toHaveBeenCalledTimes(2);
  });

  it('tracks a replacement while the removed boundary finishes its final view', async () => {
    const io = installIOPolyfill();
    const runtime = createRuntime();
    const finalSend = deferred<{ accepted: boolean }>();
    const trackView = vi
      .spyOn(runtime, 'trackView')
      .mockResolvedValueOnce({ accepted: true })
      .mockReturnValueOnce(finalSend.promise);
    const trackClick = vi.spyOn(runtime, 'trackClick').mockResolvedValue(undefined);
    const page = await render('node:page', 'main');
    const oldHero = await render('node:hero', 'button');
    io.trigger(page, true);
    await advance(1200);

    page.remove();
    oldHero.remove();
    await advance(0);
    const hero = await render('node:hero', 'button');
    click(oldHero);
    click(hero);
    expect(trackClick).toHaveBeenCalledOnce();
    expect(trackView.mock.calls.map(([args]) => args.viewDurationMs)).toEqual([1000, 1200]);

    finalSend.resolve({ accepted: true });
    await advance(0);
    await removeRendered();
  });

  it('discovers roots on a replacement SDK after destroy', async () => {
    const first = createRuntime();
    const hero = await render('node:hero', 'button');
    const firstClick = vi.spyOn(first, 'trackClick').mockResolvedValue(undefined);
    click(hero);
    first.destroy();
    click(hero);
    expect(firstClick).toHaveBeenCalledOnce();

    const replacement = createRuntime();
    const replacementClick = vi.spyOn(replacement, 'trackClick').mockResolvedValue(undefined);
    click(hero);
    expect(replacementClick).toHaveBeenCalledOnce();
  });

  it('drops active measurements on reset and resumes fresh visitor measurements', async () => {
    const io = installIOPolyfill();
    vi.spyOn(ExperienceApiClient.prototype, 'upsertProfile').mockResolvedValue({
      profile: { id: 'new-visitor' },
    } as never);
    const runtime = createRuntime({ defaults: { profile: { id: 'old-visitor' } } });
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
    expect(runtime.states.profile.current).toEqual({ id: 'new-visitor' });
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
      events.filter((event) => event.type === 'exo_node_view').map((event) => event.viewDurationMs)
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

  it('re-reads attribution when a boundary changes', async () => {
    const runtime = createRuntime();
    const trackClick = vi.spyOn(runtime, 'trackClick').mockResolvedValue(undefined);
    const hero = await render('node:hero', 'button');
    hero.setAttribute('data-ctfl-attribution', JSON.stringify({ scopes: {} }));
    await advance(0);
    click(hero);
    hero.setAttribute('data-ctfl-attribution', JSON.stringify({ scopes: ATTRIBUTIONS }));
    await advance(0);
    click(hero);

    expect(trackClick).toHaveBeenCalledOnce();
  });

  it('attributes tracked clicks to an adopted continuation while delivery is pending', async () => {
    vi.useRealTimers();
    const builder = new EventBuilder({
      channel: 'server',
      library: { name: 'test', version: '1' },
    });
    let finishReplay!: (value: unknown) => void;
    vi.spyOn(ExperienceApiClient.prototype, 'upsertProfile').mockReturnValueOnce(
      new Promise((resolve) => {
        finishReplay = resolve;
      }) as never
    );
    const sendBatchEvents = vi
      .spyOn(InsightsApiClient.prototype, 'sendBatchEvents')
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

    runtime.tracking.disable('views');
    click(hero);
    await vi.waitFor(() => expect(runtime.states.eventStream.current?.type).toBe('exo_node_click'));
    // The replay is held open on purpose, so start the flush and wait for Analytics.
    void runtime.flush();
    await vi.waitFor(() => expect(sendBatchEvents).toHaveBeenCalledOnce());

    const [[batch]] = sendBatchEvents.mock.calls as unknown as [
      [[{ profile: { id: string }; events: { type: string }[] }]],
    ];
    expect(batch[0]!.profile.id).toBe('server-profile');
    expect(batch[0]!.events[0]!.type).toBe('exo_node_click');
    finishReplay({ profile: { id: 'committed-profile' } });
    await removeRendered();
  });

  describe('consent', () => {
    it('drops clicks while event consent is denied and sends them once granted', async () => {
      seedConsent({ events: false });
      const onEventBlocked = vi.fn();
      const runtime = createRuntime({ defaults: { profile: { id: 'visitor' } }, onEventBlocked });
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
      ).resolves.toBeUndefined();
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
        defaults: { profile: { id: 'visitor' } },
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

    it('does not observe views while event consent is denied, and starts once it is granted', async () => {
      seedConsent({ events: false });
      const io = installIOPolyfill();
      const runtime = createRuntime({ defaults: { profile: { id: 'visitor' } } });
      const send = spyOnTransport(runtime);
      const page = await render('node:page', 'main');

      // No observer is created for a view that is not permitted.
      expect(() => io.getLast()).toThrow(/polyfill instance not found/);
      await advance(1400);
      expect(send).not.toHaveBeenCalled();

      runtime.consent({ events: true });
      io.getLast().trigger(page, true);
      await advance(1400);

      expect((await sentEvents(send)).map((event) => event.type)).toContain('exo_node_view');
      await removeRendered();
    });
  });

  describe('timed interactions across consent changes', () => {
    it('keeps allowlisted views and hovers live across withdrawal, regrant and boundary mutation', async () => {
      const io = installIOPolyfill();
      const runtime = createRuntime({
        defaults: { profile: { id: 'visitor' } },
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
          defaults: { profile: { id: 'visitor' } },
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

    it('measures a hover from the grant, not from before consent', async () => {
      seedConsent({ events: false });
      const runtime = createRuntime({ defaults: { profile: { id: 'visitor' } } });
      const send = spyOnTransport(runtime);
      const hero = await render('node:hero', 'button');
      runtime.tracking.disable('views');

      enter(hero);
      await advance(1150);
      expect(await sentEvents(send)).toEqual([]);

      runtime.consent({ events: true });
      await advance(100);
      leave(hero);
      await advance(0);

      // The hover was not permitted until the grant, so nothing measured before it counts.
      const hovers = (await sentEvents(send)).filter((event) => event.type === 'exo_node_hover');
      expect(hovers.every((event) => (event.hoverDurationMs ?? 0) < 1000)).toBe(true);
      await removeRendered();
    });

    it('starts a fresh view measurement at the grant, not at the earlier intersection', async () => {
      seedConsent({ events: false });
      const io = installIOPolyfill();
      const runtime = createRuntime({ defaults: { profile: { id: 'visitor' } } });
      const send = spyOnTransport(runtime);
      const page = await render('node:page', 'main');
      runtime.tracking.disable('hovers');
      runtime.tracking.disable('clicks');

      await advance(5000);
      runtime.consent({ events: true });
      io.getLast().trigger(page, true);
      await advance(500);
      // Less than a second since the grant: no qualifying view yet, however long the
      // element had been visible before it.
      expect(await sentEvents(send)).toEqual([]);

      await advance(900);
      const views = (await sentEvents(send)).filter((event) => event.type === 'exo_node_view');
      expect(views).toHaveLength(1);
      expect(views[0]!.viewDurationMs).toBeLessThan(2000);
      await removeRendered();
    });

    it('stops a view in progress when consent is withdrawn, and reports nothing afterwards', async () => {
      seedConsent({ events: true });
      const io = installIOPolyfill();
      const runtime = createRuntime({ defaults: { profile: { id: 'visitor' } } });
      const send = spyOnTransport(runtime);
      const page = await render('node:page', 'main');
      runtime.tracking.disable('hovers');
      runtime.tracking.disable('clicks');
      const observer = io.getLast();

      observer.trigger(page, true);
      await advance(500);
      runtime.consent({ events: false });
      await advance(5000);
      observer.trigger(page, false);
      await advance(0);
      await removeRendered();

      expect(await sentEvents(send)).toEqual([]);
    });

    it('stops a hover in progress when consent is withdrawn, and reports nothing afterwards', async () => {
      seedConsent({ events: true });
      const runtime = createRuntime({ defaults: { profile: { id: 'visitor' } } });
      const send = spyOnTransport(runtime);
      const hero = await render('node:hero', 'button');
      runtime.tracking.disable('views');
      runtime.tracking.disable('clicks');

      enter(hero);
      await advance(500);
      runtime.consent({ events: false });
      await advance(1500);
      leave(hero);
      await advance(0);
      await removeRendered();

      expect(await sentEvents(send)).toEqual([]);
    });

    it('does not carry a hover across a withdrawal and a regrant', async () => {
      seedConsent({ events: true });
      const runtime = createRuntime({ defaults: { profile: { id: 'visitor' } } });
      const send = spyOnTransport(runtime);
      const hero = await render('node:hero', 'button');
      runtime.tracking.disable('views');
      runtime.tracking.disable('clicks');

      enter(hero);
      await advance(500);
      runtime.consent({ events: false });
      await advance(3000);
      runtime.consent({ events: true });
      await advance(100);
      leave(hero);
      await advance(0);
      await removeRendered();

      // If the hover were carried through the withdrawal it would report about 3.6s.
      // Permission was withdrawn, so that time must not be reported once it is back.
      const hovers = (await sentEvents(send)).filter((event) => event.type === 'exo_node_hover');
      expect(hovers.every((event) => (event.hoverDurationMs ?? 0) < 1000)).toBe(true);
    });

    it('does not carry a view across a withdrawal and a regrant', async () => {
      seedConsent({ events: true });
      const io = installIOPolyfill();
      const runtime = createRuntime({ defaults: { profile: { id: 'visitor' } } });
      const send = spyOnTransport(runtime);
      const page = await render('node:page', 'main');
      runtime.tracking.disable('hovers');
      runtime.tracking.disable('clicks');
      const original = io.getLast();

      original.trigger(page, true);
      await advance(500);
      runtime.consent({ events: false });
      await advance(3000);
      runtime.consent({ events: true });

      // The original observer was disconnected at the withdrawal, so a late signal from it
      // reaches nothing; the view is only measured by the observer created at the regrant.
      original.trigger(page, true);
      await advance(2000);
      expect((await sentEvents(send)).filter((event) => event.type === 'exo_node_view')).toEqual(
        []
      );

      // The new observer measures from its own first signal.
      io.getLast().trigger(page, true);
      await advance(1400);
      const views = (await sentEvents(send)).filter((event) => event.type === 'exo_node_view');
      expect(views.length).toBeGreaterThan(0);
      expect(views.every((event) => (event.viewDurationMs ?? 0) < 2000)).toBe(true);
      await removeRendered();
    });

    it('leaves a running interaction alone when only persistence consent changes', async () => {
      seedConsent({ events: true, persistence: true });
      const runtime = createRuntime({ defaults: { profile: { id: 'visitor' } } });
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

    it('respects a narrower allow-list: only the permitted interaction runs', async () => {
      seedConsent({ events: false });
      const io = installIOPolyfill();
      const runtime = createRuntime({
        defaults: { profile: { id: 'visitor' } },
        allowedEventTypes: ['component_hover'],
      });
      const send = spyOnTransport(runtime);
      const hero = await render('node:hero', 'button');
      runtime.tracking.disable('clicks');

      // Views are not allow-listed, so no view observer exists; hovers are, so one runs.
      expect(() => io.getLast()).toThrow(/polyfill instance not found/);
      enter(hero);
      await advance(1200);
      leave(hero);
      await advance(0);
      await removeRendered();

      const types = (await sentEvents(send)).map((event) => event.type);
      expect(types).toContain('exo_node_hover');
      expect(types).not.toContain('exo_node_view');
    });
  });
});
