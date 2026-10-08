// @vitest-environment jsdom

import { EventBuilder } from '@contentful/experiences-runtime';
import { ExperienceApiClient, InsightsApiClient } from '@contentful/optimization-api-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ContentfulExperiences, type ExperiencesWebConfig } from './contentful-experiences.js';
import { advance, installIOPolyfill, setDocumentVisibility } from './test-fixtures/dom.js';
import type { TrackingAttribution } from './tracking/attribution.js';
import { getTrackingAttributes } from './tracking-attributes.js';

const ATTRIBUTIONS: Record<string, TrackingAttribution> = {
  'node:page': { entityId: 'landing', entityKind: 'Experience' },
  'node:hero': { entityId: 'hero', entityKind: 'Fragment', parentExperienceId: 'landing' },
};

function createRuntime(overrides: Partial<ExperiencesWebConfig> = {}): ContentfulExperiences {
  return new ContentfulExperiences({
    spaceId: 'space',
    environmentId: 'environment',
    resolverConfig: { components: {} },
    delivery: { accessToken: 'delivery-token' },
    ...overrides,
  } as ExperiencesWebConfig);
}

function render(nodeId: string, tag = 'div'): HTMLElement {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(getTrackingAttributes({ roots: [{ key: nodeId }] }))) {
    element.setAttribute(name, value);
  }
  document.body.append(element);
  return element;
}

const click = (element: Element): void => {
  element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
  setDocumentVisibility('visible');
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('ContentfulExperiences interaction tracking', () => {
  it('sends interactions through the runtime event methods', async () => {
    const runtime = createRuntime();
    const trackClick = vi.spyOn(runtime, 'trackClick').mockResolvedValue(true);
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
    const trackView = vi.spyOn(runtime, 'trackView').mockResolvedValue(true);
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
    const trackClick = vi.spyOn(runtime, 'trackClick').mockResolvedValue(true);
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
    const trackView = vi.spyOn(runtime, 'trackView').mockResolvedValue(true);
    const trackClick = vi.spyOn(runtime, 'trackClick').mockResolvedValue(true);
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
      .mockImplementation(() => new Promise((resolve) => (finishSend = () => resolve(true))));
    const trackClick = vi.spyOn(runtime, 'trackClick').mockResolvedValue(true);
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

  it('keeps sessions isolated between runtime instances', async () => {
    const a = createRuntime();
    const b = createRuntime();
    const options = { views: false, resolveAttribution: () => undefined } as const;

    const sessionA = a.startInteractionTracking(options);
    const sessionB = b.startInteractionTracking(options);

    await Promise.all([sessionA.stop(), sessionB.stop()]);
  });

  it('re-reads attribution on refresh', async () => {
    const runtime = createRuntime();
    const trackClick = vi.spyOn(runtime, 'trackClick').mockResolvedValue(true);
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

  it('holds tracked events behind a pending event handoff', async () => {
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
    const runtime = createRuntime({
      eventHandoff: {
        version: 1,
        spaceId: 'space',
        environmentId: 'environment',
        events: [{ transport: 'personalization', event: builder.buildPageView() }],
        initialPageRouteKey: '/',
      },
      eventHandoffRouteKey: '/',
    });
    const hero = render('node:hero', 'button');

    const session = runtime.startInteractionTracking({
      views: false,
      resolveAttribution: (nodeId) => ATTRIBUTIONS[nodeId],
    });
    click(hero);
    await Promise.resolve();
    expect(sendBatchEvents).not.toHaveBeenCalled();

    finishReplay({ profile: { id: 'committed-profile' } });
    await runtime.whenEventHandoffCommitted();
    await vi.waitFor(() => expect(sendBatchEvents).toHaveBeenCalledOnce());

    const [[batch]] = sendBatchEvents.mock.calls as unknown as [
      [[{ profile: { id: string }; events: { type: string }[] }]],
    ];
    expect(batch[0]!.profile.id).toBe('committed-profile');
    expect(batch[0]!.events[0]!.type).toBe('exo_node_click');
    await session.stop();
  });
});
