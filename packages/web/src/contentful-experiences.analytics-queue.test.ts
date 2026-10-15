// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InsightsApiClient } from '@contentful/optimization-api-client';

import { ContentfulExperiences, type ExperiencesWebConfig } from './contentful-experiences.js';
import { seedConsent, clearIdentityCookies } from './test-fixtures/consent.js';
import { setDocumentVisibility } from './test-fixtures/dom.js';
import { getTrackingAttributes } from './tracking-attributes.js';

const runtimes = new Set<ContentfulExperiences>();

function createRuntime(overrides: Partial<ExperiencesWebConfig> = {}): ContentfulExperiences {
  const runtime = new ContentfulExperiences({
    spaceId: 'space',
    environmentId: 'environment',
    locale: 'en-US',
    delivery: { accessToken: 'delivery-token' },
    profile: { id: 'visitor' },
    ...overrides,
  } as ExperiencesWebConfig);
  runtimes.add(runtime);
  return runtime;
}

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
  it('queues Analytics events and flushes them after 30 seconds', async () => {
    const send = vi.spyOn(InsightsApiClient.prototype, 'sendBatchEvents').mockResolvedValue(true);
    const runtime = createRuntime();

    await expect(click(runtime)).resolves.toBeUndefined();
    await expect(click(runtime)).resolves.toBeUndefined();
    expect(send).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(30_000);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0]).toEqual([
      { profile: { id: 'visitor' }, events: [expect.anything(), expect.anything()] },
    ]);
  });

  it('flushes when the queue reaches 25 events', async () => {
    const send = vi.spyOn(InsightsApiClient.prototype, 'sendBatchEvents').mockResolvedValue(true);
    const runtime = createRuntime();

    for (let i = 0; i < 24; i++) await click(runtime);
    expect(send).not.toHaveBeenCalled();
    await click(runtime);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0][0]?.events).toHaveLength(25);
  });

  it('holds events while offline and flushes when the browser comes back online', async () => {
    const send = vi.spyOn(InsightsApiClient.prototype, 'sendBatchEvents').mockResolvedValue(true);
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
    const send = vi.spyOn(InsightsApiClient.prototype, 'sendBatchEvents').mockResolvedValue(true);
    const runtime = createRuntime();
    await click(runtime);

    setDocumentVisibility('hidden');
    await vi.advanceTimersByTimeAsync(0);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[1]).toEqual({ beacon: expect.any(Function) });
  });

  it('flushes on pagehide, once per hide cycle', async () => {
    const send = vi.spyOn(InsightsApiClient.prototype, 'sendBatchEvents').mockResolvedValue(true);
    const runtime = createRuntime();
    await click(runtime);

    window.dispatchEvent(new Event('pagehide'));
    await click(runtime);
    window.dispatchEvent(new Event('pagehide'));
    await vi.advanceTimersByTimeAsync(0);

    expect(send).toHaveBeenCalledTimes(1);
  });

  it('retries a failed flush with backoff and keeps the events', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const send = vi
      .spyOn(InsightsApiClient.prototype, 'sendBatchEvents')
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true);
    const runtime = createRuntime();
    await click(runtime);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(send).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(500);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1]?.[0]).toEqual(send.mock.calls[0]?.[0]);
  });

  it('drops queued Analytics events when event consent is withdrawn', async () => {
    const send = vi.spyOn(InsightsApiClient.prototype, 'sendBatchEvents').mockResolvedValue(true);
    const runtime = createRuntime();
    await click(runtime);

    runtime.consent({ events: false });
    runtime.consent({ events: true });
    await vi.advanceTimersByTimeAsync(30_000);
    await runtime.flush();

    expect(send).not.toHaveBeenCalled();
  });

  it('drops queued Analytics events on reset', async () => {
    const send = vi.spyOn(InsightsApiClient.prototype, 'sendBatchEvents').mockResolvedValue(true);
    const runtime = createRuntime();
    await click(runtime);

    runtime.reset();
    await vi.advanceTimersByTimeAsync(30_000);

    expect(send).not.toHaveBeenCalled();
  });

  it('makes a last attempt at queued events on destroy and stops listening', async () => {
    const send = vi.spyOn(InsightsApiClient.prototype, 'sendBatchEvents').mockResolvedValue(true);
    const removed = vi.spyOn(document, 'removeEventListener');
    const runtime = createRuntime();
    await click(runtime);

    runtime.destroy();
    await vi.advanceTimersByTimeAsync(0);

    expect(send).toHaveBeenCalledTimes(1);
    expect(removed).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    // After destroy a call resolves with no result and queues nothing.
    await expect(click(runtime)).resolves.toBeUndefined();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('ends an in-progress hover before the hide flush, so its event is in the beacon', async () => {
    const send = vi.spyOn(InsightsApiClient.prototype, 'sendBatchEvents').mockResolvedValue(true);
    const runtime = createRuntime();
    const hero = document.createElement('div');
    for (const [name, value] of Object.entries(
      getTrackingAttributes({ roots: [{ key: 'node:hero' }] })
    )) {
      hero.setAttribute(name, value);
    }
    document.body.append(hero);
    const session = runtime.startInteractionTracking({
      views: false,
      clicks: false,
      resolveAttribution: () => ({ entityId: 'hero', entityKind: 'Fragment' }),
    });

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
    await session.stop();
  });

  it('applies queuePolicy.flush: interval, backoff, and failure callbacks', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const send = vi
      .spyOn(InsightsApiClient.prototype, 'sendBatchEvents')
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true);
    const onFlushFailure = vi.fn();
    const onFlushRecovered = vi.fn();
    const runtime = createRuntime({
      queuePolicy: {
        flush: { flushIntervalMs: 1_000, baseBackoffMs: 100, onFlushFailure, onFlushRecovered },
      },
    });
    await click(runtime);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(send).toHaveBeenCalledTimes(1);
    expect(onFlushFailure).toHaveBeenCalledWith(
      expect.objectContaining({ consecutiveFailures: 1, queuedEvents: 1, retryDelayMs: 100 })
    );

    await vi.advanceTimersByTimeAsync(100);
    expect(send).toHaveBeenCalledTimes(2);
    expect(onFlushRecovered).toHaveBeenCalledWith({ consecutiveFailures: 1 });
  });

  it('does not let a throwing policy callback break delivery', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const send = vi
      .spyOn(InsightsApiClient.prototype, 'sendBatchEvents')
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true);
    const runtime = createRuntime({
      queuePolicy: {
        flush: {
          flushIntervalMs: 1_000,
          baseBackoffMs: 100,
          onFlushFailure: () => {
            throw new Error('callback');
          },
        },
      },
    });
    await click(runtime);

    await vi.advanceTimersByTimeAsync(1_100);

    expect(send).toHaveBeenCalledTimes(2);
  });
});
