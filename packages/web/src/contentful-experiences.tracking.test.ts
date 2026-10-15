// @vitest-environment jsdom

import { EventBuilder } from '@contentful/experiences-runtime';
import { ExperienceApiClient, InsightsApiClient } from '@contentful/optimization-api-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ContentfulExperiences, type ExperiencesWebConfig } from './contentful-experiences.js';
import { clearIdentityCookies, seedConsent } from './test-fixtures/consent.js';
import { advance, installIOPolyfill, setDocumentVisibility } from './test-fixtures/dom.js';
import type { TrackingAttribution } from './tracking/attribution.js';
import { getTrackingAttributes } from './tracking-attributes.js';

const ATTRIBUTIONS: Record<string, TrackingAttribution> = {
  'node:page': { entityId: 'landing', entityKind: 'Experience' },
  'node:hero': { entityId: 'hero', entityKind: 'Fragment', parentExperienceId: 'landing' },
};

const runtimes = new Set<ContentfulExperiences>();

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

function render(nodeId: string, tag = 'div'): HTMLElement {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(getTrackingAttributes({ roots: [{ key: nodeId }] }))) {
    element.setAttribute(name, value);
  }
  document.body.append(element);
  return element;
}

/** Spies on the Analytics transport so tests see what would actually be sent. */
function spyOnTransport(runtime: ContentfulExperiences) {
  const analytics = (runtime as unknown as { optimizationApi: { analytics: InsightsApiClient } })
    .optimizationApi.analytics;
  const send = vi.spyOn(analytics, 'sendBatchEvents').mockResolvedValue(true);
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
  clearIdentityCookies();
  for (const runtime of runtimes) runtime.destroy();
  runtimes.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('ContentfulExperiences interaction tracking', () => {
  it('sends interactions through the runtime event methods', async () => {
    const runtime = createRuntime();
    const trackClick = vi.spyOn(runtime, 'trackClick').mockResolvedValue(undefined);
    const hero = render('node:hero', 'button');

    const session = runtime.startInteractionTracking({
      views: false,
      resolveAttribution: (nodeId) => ATTRIBUTIONS[nodeId],
    });
    click(hero);

    expect(trackClick).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: 'hero', parentExperienceId: 'landing' })
    );
    await session.stop();
  });

  it('flushes an in-progress view when stopped', async () => {
    const io = installIOPolyfill();
    const runtime = createRuntime();
    const trackView = vi.spyOn(runtime, 'trackView').mockResolvedValue({ accepted: true });
    const page = render('node:page', 'main');

    const session = runtime.startInteractionTracking({
      resolveAttribution: (nodeId) => ATTRIBUTIONS[nodeId],
    });
    io.trigger(page, true);
    await advance(1400);
    await session.stop();

    expect(trackView).toHaveBeenCalledTimes(2);
    const [first, final] = trackView.mock.calls.map(([args]) => args);
    expect(final).toMatchObject({ viewId: first!.viewId, viewDurationMs: 1400 });
  });

  it('stops tracking after stop, and stop is idempotent', async () => {
    const runtime = createRuntime();
    const trackClick = vi.spyOn(runtime, 'trackClick').mockResolvedValue(undefined);
    const hero = render('node:hero', 'button');

    const session = runtime.startInteractionTracking({
      views: false,
      resolveAttribution: (nodeId) => ATTRIBUTIONS[nodeId],
    });
    await Promise.all([session.stop(), session.stop()]);
    click(hero);

    expect(trackClick).not.toHaveBeenCalled();
  });

  it('runs one session at a time, and allows a new one after stopping', async () => {
    const runtime = createRuntime();
    const options = { views: false, resolveAttribution: () => undefined } as const;

    const first = runtime.startInteractionTracking(options);
    expect(() => runtime.startInteractionTracking(options)).toThrow('already running');
    await first.stop();

    const second = runtime.startInteractionTracking(options);
    await second.stop();
  });

  it('allows a new session right after stop without awaiting it, as an effect cleanup does', async () => {
    const io = installIOPolyfill();
    const runtime = createRuntime();
    const trackView = vi.spyOn(runtime, 'trackView').mockResolvedValue({ accepted: true });
    const trackClick = vi.spyOn(runtime, 'trackClick').mockResolvedValue(undefined);
    const page = render('node:page', 'main');
    const hero = render('node:hero', 'button');
    const options = { resolveAttribution: (nodeId: string) => ATTRIBUTIONS[nodeId] };

    // Mount → unmount → mount, as React StrictMode or a dependency change does.
    const first = runtime.startInteractionTracking(options);
    io.trigger(page, true);
    await advance(1200);
    void first.stop();
    const second = runtime.startInteractionTracking(options);
    await advance(0);

    // The first session still flushed its in-progress view.
    expect(trackView.mock.calls.map(([args]) => args.viewDurationMs)).toEqual([1000, 1200]);
    // The second session tracks; the stopped one no longer does.
    click(hero);
    expect(trackClick).toHaveBeenCalledOnce();
    await second.stop();
  });

  it("stops a session's listeners at once, so events are not counted twice while it flushes", async () => {
    const io = installIOPolyfill();
    const runtime = createRuntime();
    let finishSend!: () => void;
    const trackView = vi
      .spyOn(runtime, 'trackView')
      .mockImplementation(
        () => new Promise((resolve) => (finishSend = () => resolve({ accepted: true })))
      );
    const trackClick = vi.spyOn(runtime, 'trackClick').mockResolvedValue(undefined);
    const page = render('node:page', 'main');
    const hero = render('node:hero', 'button');
    const options = { resolveAttribution: (nodeId: string) => ATTRIBUTIONS[nodeId] };

    const first = runtime.startInteractionTracking(options);
    io.trigger(page, true);
    await advance(1000);
    finishSend();
    await advance(200);
    const flushed = first.stop(); // the final view is still being sent
    const second = runtime.startInteractionTracking(options);
    click(hero);

    expect(trackClick).toHaveBeenCalledOnce();
    finishSend();
    await flushed;
    expect(trackView).toHaveBeenCalledTimes(2);
    await second.stop();
  });

  it('starts a tracking session on a replacement SDK after destroy', async () => {
    const first = createRuntime();
    const options = { views: false, resolveAttribution: () => undefined } as const;

    const session = first.startInteractionTracking(options);
    await session.stop();
    first.destroy();

    const replacement = createRuntime();
    await replacement.startInteractionTracking(options).stop();
  });

  it('stops active interaction listeners before destroy releases singleton ownership', async () => {
    const first = createRuntime();
    const trackClick = vi.spyOn(first, 'trackClick').mockResolvedValue(undefined);
    const hero = render('node:hero', 'button');

    first.startInteractionTracking({
      views: false,
      resolveAttribution: (nodeId) => ATTRIBUTIONS[nodeId],
    });
    click(hero);
    expect(trackClick).toHaveBeenCalledOnce();

    first.destroy();
    click(hero);
    expect(trackClick).toHaveBeenCalledOnce();

    const replacement = createRuntime();
    await replacement
      .startInteractionTracking({ views: false, resolveAttribution: () => undefined })
      .stop();
  });

  it('re-reads attribution on refresh', async () => {
    const runtime = createRuntime();
    const trackClick = vi.spyOn(runtime, 'trackClick').mockResolvedValue(undefined);
    const hero = render('node:hero', 'button');
    let attributions: Record<string, TrackingAttribution> = {};

    const session = runtime.startInteractionTracking({
      views: false,
      resolveAttribution: (nodeId) => attributions[nodeId],
    });
    click(hero);
    attributions = ATTRIBUTIONS;
    session.refresh();
    click(hero);

    expect(trackClick).toHaveBeenCalledTimes(1);
    await session.stop();
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
    const hero = render('node:hero', 'button');

    const session = runtime.startInteractionTracking({
      views: false,
      resolveAttribution: (nodeId) => ATTRIBUTIONS[nodeId],
    });
    click(hero);
    // The replay is held open on purpose, so start the flush and wait for Analytics.
    void runtime.flush();
    await vi.waitFor(() => expect(sendBatchEvents).toHaveBeenCalledOnce());

    const [[batch]] = sendBatchEvents.mock.calls as unknown as [
      [[{ profile: { id: string }; events: { type: string }[] }]],
    ];
    expect(batch[0]!.profile.id).toBe('server-profile');
    expect(batch[0]!.events[0]!.type).toBe('exo_node_click');
    finishReplay({ profile: { id: 'committed-profile' } });
    await session.stop();
  });

  describe('consent', () => {
    it('drops clicks while event consent is denied and sends them once granted', async () => {
      seedConsent({ events: false });
      const onEventBlocked = vi.fn();
      const runtime = createRuntime({ profile: { id: 'visitor' }, onEventBlocked });
      const send = spyOnTransport(runtime);
      const hero = render('node:hero', 'button');

      const session = runtime.startInteractionTracking({
        views: false,
        resolveAttribution: (nodeId) => ATTRIBUTIONS[nodeId],
      });
      click(hero);
      await advance(0);

      // The click detector does not listen while clicks are not permitted, so the
      // gesture never reaches the gate and nothing is sent.
      expect(send).not.toHaveBeenCalled();
      expect(onEventBlocked).not.toHaveBeenCalled();

      // A manual call still reaches the gate, which stays as a backstop and reports.
      await expect(
        runtime.trackClick({ entityId: 'hero', entityKind: 'Fragment' })
      ).resolves.toBeUndefined();
      expect(onEventBlocked).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'consent', method: 'trackClick' })
      );

      runtime.consent({ events: true });
      click(hero);
      await advance(0);
      await runtime.flush();

      expect(send).toHaveBeenCalledTimes(1);
      await session.stop();
    });

    it('admits clicks under a click-only allow-list', async () => {
      seedConsent({ events: false });
      const runtime = createRuntime({
        profile: { id: 'visitor' },
        allowedEventTypes: ['component_click'],
      });
      const send = spyOnTransport(runtime);
      const hero = render('node:hero', 'button');

      const session = runtime.startInteractionTracking({
        views: false,
        resolveAttribution: (nodeId) => ATTRIBUTIONS[nodeId],
      });
      click(hero);
      await advance(0);
      await runtime.flush();

      expect(send).toHaveBeenCalledTimes(1);
      await session.stop();
    });

    it('does not observe views while event consent is denied, and starts once it is granted', async () => {
      seedConsent({ events: false });
      const io = installIOPolyfill();
      const runtime = createRuntime({ profile: { id: 'visitor' } });
      const send = spyOnTransport(runtime);
      const page = render('node:page', 'main');

      const session = runtime.startInteractionTracking({
        resolveAttribution: (nodeId) => ATTRIBUTIONS[nodeId],
      });
      // No observer is created for a view that is not permitted.
      expect(() => io.getLast()).toThrow(/polyfill instance not found/);
      await advance(1400);
      expect(send).not.toHaveBeenCalled();

      runtime.consent({ events: true });
      io.getLast().trigger(page, true);
      await advance(1400);

      expect((await sentEvents(send)).map((event) => event.type)).toContain('exo_node_view');
      await session.stop();
    });
  });

  describe('timed interactions across consent changes', () => {
    const enter = (element: Element): void => {
      element.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
    };
    const leave = (element: Element): void => {
      element.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));
    };

    it('measures a hover from the grant, not from before consent', async () => {
      seedConsent({ events: false });
      const runtime = createRuntime({ profile: { id: 'visitor' } });
      const send = spyOnTransport(runtime);
      const hero = render('node:hero', 'button');
      const session = runtime.startInteractionTracking({
        views: false,
        resolveAttribution: (nodeId) => ATTRIBUTIONS[nodeId],
      });

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
      await session.stop();
    });

    it('starts a fresh view measurement at the grant, not at the earlier intersection', async () => {
      seedConsent({ events: false });
      const io = installIOPolyfill();
      const runtime = createRuntime({ profile: { id: 'visitor' } });
      const send = spyOnTransport(runtime);
      const page = render('node:page', 'main');
      const session = runtime.startInteractionTracking({
        hovers: false,
        clicks: false,
        resolveAttribution: (nodeId) => ATTRIBUTIONS[nodeId],
      });

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
      await session.stop();
    });

    it('stops a view in progress when consent is withdrawn, and reports nothing afterwards', async () => {
      seedConsent({ events: true });
      const io = installIOPolyfill();
      const runtime = createRuntime({ profile: { id: 'visitor' } });
      const send = spyOnTransport(runtime);
      const page = render('node:page', 'main');
      const session = runtime.startInteractionTracking({
        hovers: false,
        clicks: false,
        resolveAttribution: (nodeId) => ATTRIBUTIONS[nodeId],
      });
      const observer = io.getLast();

      observer.trigger(page, true);
      await advance(500);
      runtime.consent({ events: false });
      await advance(5000);
      observer.trigger(page, false);
      await advance(0);
      await session.stop();

      expect(await sentEvents(send)).toEqual([]);
    });

    it('stops a hover in progress when consent is withdrawn, and reports nothing afterwards', async () => {
      seedConsent({ events: true });
      const runtime = createRuntime({ profile: { id: 'visitor' } });
      const send = spyOnTransport(runtime);
      const hero = render('node:hero', 'button');
      const session = runtime.startInteractionTracking({
        views: false,
        clicks: false,
        resolveAttribution: (nodeId) => ATTRIBUTIONS[nodeId],
      });

      enter(hero);
      await advance(500);
      runtime.consent({ events: false });
      await advance(1500);
      leave(hero);
      await advance(0);
      await session.stop();

      expect(await sentEvents(send)).toEqual([]);
    });

    it('does not carry a hover across a withdrawal and a regrant', async () => {
      seedConsent({ events: true });
      const runtime = createRuntime({ profile: { id: 'visitor' } });
      const send = spyOnTransport(runtime);
      const hero = render('node:hero', 'button');
      const session = runtime.startInteractionTracking({
        views: false,
        clicks: false,
        resolveAttribution: (nodeId) => ATTRIBUTIONS[nodeId],
      });

      enter(hero);
      await advance(500);
      runtime.consent({ events: false });
      await advance(3000);
      runtime.consent({ events: true });
      await advance(100);
      leave(hero);
      await advance(0);
      await session.stop();

      // If the hover were carried through the withdrawal it would report about 3.6s.
      // Permission was withdrawn, so that time must not be reported once it is back.
      const hovers = (await sentEvents(send)).filter((event) => event.type === 'exo_node_hover');
      expect(hovers.every((event) => (event.hoverDurationMs ?? 0) < 1000)).toBe(true);
    });

    it('does not carry a view across a withdrawal and a regrant', async () => {
      seedConsent({ events: true });
      const io = installIOPolyfill();
      const runtime = createRuntime({ profile: { id: 'visitor' } });
      const send = spyOnTransport(runtime);
      const page = render('node:page', 'main');
      const session = runtime.startInteractionTracking({
        hovers: false,
        clicks: false,
        resolveAttribution: (nodeId) => ATTRIBUTIONS[nodeId],
      });
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
      await session.stop();
    });

    it('leaves a running interaction alone when only persistence consent changes', async () => {
      seedConsent({ events: true, persistence: true });
      const runtime = createRuntime({ profile: { id: 'visitor' } });
      const send = spyOnTransport(runtime);
      const hero = render('node:hero', 'button');
      const session = runtime.startInteractionTracking({
        views: false,
        clicks: false,
        resolveAttribution: (nodeId) => ATTRIBUTIONS[nodeId],
      });

      enter(hero);
      await advance(500);
      runtime.consent({ persistence: false });
      await advance(700);
      leave(hero);
      await advance(0);
      await session.stop();

      // The hover began and ended under event consent, so its measurement is untouched.
      const hovers = (await sentEvents(send)).filter((event) => event.type === 'exo_node_hover');
      expect(hovers.length).toBeGreaterThan(0);
      expect(hovers.at(-1)!.hoverDurationMs).toBeGreaterThanOrEqual(1000);
    });

    it('respects a narrower allow-list: only the permitted interaction runs', async () => {
      seedConsent({ events: false });
      const io = installIOPolyfill();
      const runtime = createRuntime({
        profile: { id: 'visitor' },
        allowedEventTypes: ['component_hover'],
      });
      const send = spyOnTransport(runtime);
      const hero = render('node:hero', 'button');
      const session = runtime.startInteractionTracking({
        clicks: false,
        resolveAttribution: (nodeId) => ATTRIBUTIONS[nodeId],
      });

      // Views are not allow-listed, so no view observer exists; hovers are, so one runs.
      expect(() => io.getLast()).toThrow(/polyfill instance not found/);
      enter(hero);
      await advance(1200);
      leave(hero);
      await advance(0);
      await session.stop();

      const types = (await sentEvents(send)).map((event) => event.type);
      expect(types).toContain('exo_node_hover');
      expect(types).not.toContain('exo_node_view');
    });
  });
});
