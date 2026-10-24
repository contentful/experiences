import type {
  InsightsEvent as AnalyticsEvent,
  PartialProfile as EventProfile,
} from '@contentful/optimization-api-client/api-schemas';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnalyticsDelivery } from './analytics-delivery.js';
import EventBuilder from './event-builder.js';
import type { EventInterceptors } from './event-interceptors.js';
import { resolveQueueFlushPolicy } from './lib/queue/index.js';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const profile: EventProfile = { id: 'profile-1' };
const builder = new EventBuilder({
  channel: 'web',
  library: { name: '@contentful/experiences-web', version: 'test' },
});
const baseEvent = builder.buildFlagView({ componentId: 'flag', experienceId: 'experience' });
const event = (n: number): AnalyticsEvent => ({ ...baseEvent, componentId: `c${n}` });

/**
 * The queue has no lifecycle of its own; like Optimization's InsightsQueue it reads an
 * owner-provided reset token. This fixture plays that owner, as Web does.
 */
function setup(
  options: {
    online?: boolean;
    maxEvents?: number;
    admitEvent?: (event: AnalyticsEvent) => boolean;
  } = {}
) {
  let online = options.online ?? true;
  let resetToken: object = {};
  let destroyed = false;
  const sendBatchEvents = vi.fn<(...args: unknown[]) => Promise<boolean>>().mockResolvedValue(true);
  const eventInterceptors = { run: vi.fn<EventInterceptors['run']>(async (event) => event) };
  const publishEvent = vi.fn();
  const delivery = new AnalyticsDelivery({
    api: { sendBatchEvents } as never,
    eventInterceptors,
    publishEvent,
    admitEvent: options.admitEvent,
    getOnline: () => online,
    getResetToken: () => (destroyed ? undefined : resetToken),
    flushPolicy: resolveQueueFlushPolicy(undefined),
    maxEvents: options.maxEvents,
  });
  const owner = {
    /** Optimization's CoreStateful.clearQueuedEvents(): new token, then clear the queue. */
    reset: () => {
      resetToken = {};
      delivery.clearQueuedEvents();
    },
    /** Optimization's CoreStateful.destroy() order: flush, end the lifetime, cancel timers. */
    destroy: () => {
      const drain = delivery.flush({ force: true });
      destroyed = true;
      delivery.clearPeriodicFlushTimer();
      delivery.clearScheduledRetry();
      return drain;
    },
  };
  return {
    delivery,
    owner,
    sendBatchEvents,
    eventInterceptors,
    publishEvent,
    setOnline: (value: boolean) => {
      online = value;
    },
  };
}

describe('AnalyticsDelivery', () => {
  it('validates the rewritten event before final admission and refuses without publication or queueing', async () => {
    const admitEvent = vi.fn(() => false);
    const f = setup({ admitEvent });
    const rewritten = builder.buildClick({ entityId: 'experience', entityKind: 'Experience' });
    f.eventInterceptors.run
      .mockResolvedValueOnce({ type: 'exo_node_click' })
      .mockResolvedValueOnce(rewritten);

    await expect(f.delivery.send(event(1), profile)).rejects.toThrow();
    expect(admitEvent).not.toHaveBeenCalled();
    await expect(f.delivery.send(event(1), profile)).resolves.toBe(false);
    expect(admitEvent).toHaveBeenCalledExactlyOnceWith(rewritten);
    expect(f.publishEvent).not.toHaveBeenCalled();
    expect(f.delivery.queuedEventCount).toBe(0);
    await f.delivery.flush({ force: true });
    expect(f.sendBatchEvents).not.toHaveBeenCalled();
    await f.owner.destroy();
  });

  it('rechecks the owner token after a final admission callback resets the owner', async () => {
    const admitEvent = vi.fn(() => {
      f.owner.reset();
      return true;
    });
    const f = setup({ admitEvent });
    await f.delivery.send(event(1), profile);

    expect(admitEvent).toHaveBeenCalledOnce();
    expect(f.publishEvent).not.toHaveBeenCalled();
    expect(f.delivery.queuedEventCount).toBe(0);
    await f.owner.destroy();
    expect(f.sendBatchEvents).not.toHaveBeenCalled();
  });

  it('preserves rewritten bodies across retries without rerunning hooks or admission', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const admitEvent = vi.fn(() => true);
    const f = setup({ admitEvent });
    const rewritten = builder.buildClick({ entityId: 'rewritten', entityKind: 'Experience' });
    f.eventInterceptors.run.mockResolvedValueOnce(rewritten);
    f.sendBatchEvents.mockResolvedValueOnce(false);

    await f.delivery.send(event(1), profile);
    await f.delivery.flush();
    expect(f.delivery.queuedEventCount).toBe(1);
    await f.delivery.flush();
    expect(f.sendBatchEvents).toHaveBeenCalledTimes(1);
    const firstBody = f.sendBatchEvents.mock.calls[0]?.[0];
    expect(firstBody).toEqual([{ profile, events: [rewritten] }]);
    await vi.advanceTimersByTimeAsync(500);

    expect(f.sendBatchEvents).toHaveBeenCalledTimes(2);
    expect(f.sendBatchEvents.mock.calls[1]?.[0]).toEqual(firstBody);
    expect(f.eventInterceptors.run).toHaveBeenCalledOnce();
    expect(admitEvent).toHaveBeenCalledOnce();
    expect(f.publishEvent).toHaveBeenCalledExactlyOnceWith(rewritten);
    expect(f.delivery.queuedEventCount).toBe(0);
    await f.owner.destroy();
  });

  it('discards an event when the owner resets during asynchronous interception', async () => {
    const f = setup();
    let resolve!: (value: AnalyticsEvent) => void;
    f.eventInterceptors.run.mockReturnValueOnce(
      new Promise<AnalyticsEvent>((done) => {
        resolve = done;
      })
    );
    const sending = f.delivery.send(event(1), profile);
    f.owner.reset();
    resolve(event(1));
    await sending;
    await f.delivery.flush({ force: true });

    expect(f.publishEvent).not.toHaveBeenCalled();
    expect(f.delivery.queuedEventCount).toBe(0);
    expect(f.sendBatchEvents).not.toHaveBeenCalled();
    await f.owner.destroy();
  });

  it('queues events instead of sending each one', async () => {
    const { delivery, owner, sendBatchEvents } = setup();
    await expect(delivery.send(event(1), profile)).resolves.toBeUndefined();
    expect(sendBatchEvents).not.toHaveBeenCalled();
    expect(delivery.queuedEventCount).toBe(1);
    void owner.destroy();
  });

  it('flushes when the queue reaches its size limit, batching per profile', async () => {
    const { delivery, owner, sendBatchEvents } = setup({ maxEvents: 3 });
    await delivery.send(event(1), profile);
    await delivery.send(event(2), { id: 'profile-2' });
    expect(sendBatchEvents).not.toHaveBeenCalled();
    await delivery.send(event(3), profile);
    expect(sendBatchEvents).toHaveBeenCalledTimes(1);
    expect(sendBatchEvents.mock.calls[0]?.[0]).toEqual([
      { profile, events: [event(1), event(3)] },
      { profile: { id: 'profile-2' }, events: [event(2)] },
    ]);
    expect(delivery.queuedEventCount).toBe(0);
    void owner.destroy();
  });

  it('flushes every 30 seconds while events remain queued', async () => {
    vi.useFakeTimers();
    const { delivery, owner, sendBatchEvents } = setup();
    await delivery.send(event(1), profile);
    await vi.advanceTimersByTimeAsync(29_999);
    expect(sendBatchEvents).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(sendBatchEvents).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    void owner.destroy();
  });

  it('holds events while offline and sends them on a forced flush when back online', async () => {
    const { delivery, owner, sendBatchEvents, setOnline } = setup({ online: false });
    await delivery.send(event(1), profile);
    await delivery.flush();
    expect(sendBatchEvents).not.toHaveBeenCalled();
    setOnline(true);
    await delivery.flush({ force: true });
    expect(sendBatchEvents).toHaveBeenCalledTimes(1);
    expect(delivery.queuedEventCount).toBe(0);
    void owner.destroy();
  });

  it('passes the beacon sender through for lifecycle flushes', async () => {
    const { delivery, owner, sendBatchEvents } = setup();
    const beacon = vi.fn(() => true);
    await delivery.send(event(1), profile);
    await delivery.flush({ force: true, beacon });
    expect(sendBatchEvents.mock.calls[0]?.[1]).toEqual({ beacon });
    void owner.destroy();
  });

  it('treats a thrown request as a failure and keeps the events', async () => {
    vi.useFakeTimers();
    const { delivery, owner, sendBatchEvents } = setup();
    sendBatchEvents.mockRejectedValueOnce(new Error('network'));
    await delivery.send(event(1), profile);
    await delivery.flush();
    expect(delivery.queuedEventCount).toBe(1);
    void owner.destroy();
  });

  it('drops queued events and timers when the owner resets, and keeps accepting afterwards', async () => {
    vi.useFakeTimers();
    const { delivery, owner, sendBatchEvents } = setup();
    await delivery.send(event(1), profile);
    owner.reset();
    expect(delivery.queuedEventCount).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    await delivery.flush({ force: true });
    expect(sendBatchEvents).not.toHaveBeenCalled();
    await delivery.send(event(2), profile);
    expect(delivery.queuedEventCount).toBe(1);
    void owner.destroy();
  });

  it('sends a final forced attempt when the owner destroys, then refuses new events', async () => {
    const { delivery, owner, sendBatchEvents } = setup({ online: false });
    await delivery.send(event(1), profile);
    void owner.destroy();
    expect(sendBatchEvents).toHaveBeenCalledTimes(1);
    const queuedAtDestroy = delivery.queuedEventCount;
    await delivery.send(event(2), profile);
    // The refused event is neither queued nor sent.
    expect(delivery.queuedEventCount).toBe(queuedAtDestroy);
    await Promise.resolve();
    expect(sendBatchEvents).toHaveBeenCalledTimes(1);
  });

  it('awaits the threshold flush but resolves with no result when it fails, keeping the events', async () => {
    vi.useFakeTimers();
    const { delivery, owner, sendBatchEvents } = setup({ maxEvents: 2 });
    sendBatchEvents.mockResolvedValueOnce(false);
    await delivery.send(event(1), profile);

    // The call that reaches the threshold awaits its flush; the failure is not surfaced.
    await expect(delivery.send(event(2), profile)).resolves.toBeUndefined();

    expect(sendBatchEvents).toHaveBeenCalledTimes(1);
    expect(delivery.queuedEventCount).toBe(2);
    void owner.destroy();
  });

  it('does not resolve the threshold-reaching call until its flush settles', async () => {
    const { delivery, owner, sendBatchEvents } = setup({ maxEvents: 2 });
    let resolve!: (ok: boolean) => void;
    sendBatchEvents.mockReturnValueOnce(new Promise<boolean>((r) => (resolve = r)));
    await delivery.send(event(1), profile);

    let settled = false;
    const reaching = delivery.send(event(2), profile).then(() => {
      settled = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);

    resolve(true);
    await reaching;
    expect(settled).toBe(true);
    void owner.destroy();
  });

  it('joins an active flush instead of resolving early, without starting a second request', async () => {
    const { delivery, owner, sendBatchEvents } = setup();
    let resolve!: (ok: boolean) => void;
    sendBatchEvents.mockReturnValueOnce(new Promise<boolean>((r) => (resolve = r)));
    await delivery.send(event(1), profile);

    const first = delivery.flush();
    let secondSettled = false;
    const second = delivery.flush({ force: true }).then(() => {
      secondSettled = true;
    });
    await Promise.resolve();
    expect(secondSettled).toBe(false);
    expect(sendBatchEvents).toHaveBeenCalledTimes(1);

    resolve(true);
    await Promise.all([first, second]);
    expect(secondSettled).toBe(true);
    expect(sendBatchEvents).toHaveBeenCalledTimes(1);
    void owner.destroy();
  });

  it('does not let a join guarantee delivery: a failed attempt is not retried by the joiner', async () => {
    vi.useFakeTimers();
    const { delivery, owner, sendBatchEvents } = setup();
    let resolve!: (ok: boolean) => void;
    sendBatchEvents.mockReturnValueOnce(new Promise<boolean>((r) => (resolve = r)));
    await delivery.send(event(1), profile);

    const first = delivery.flush();
    const joined = delivery.flush();
    resolve(false);
    await Promise.all([first, joined]);

    expect(sendBatchEvents).toHaveBeenCalledTimes(1);
    expect(delivery.queuedEventCount).toBe(1);
    void owner.destroy();
  });

  it('forgets an active flush when the owner resets, so a new flush can start', async () => {
    const { delivery, owner, sendBatchEvents } = setup();
    sendBatchEvents.mockReturnValueOnce(new Promise<boolean>(() => undefined));
    await delivery.send(event(1), profile);
    void delivery.flush();
    owner.reset();

    await delivery.send(event(2), profile);
    await delivery.flush({ force: true });

    expect(sendBatchEvents).toHaveBeenCalledTimes(2);
    expect(delivery.queuedEventCount).toBe(0);
    void owner.destroy();
  });

  describe('owner-provided lifecycle, as Optimization InsightsQueue', () => {
    it('removes sent events by the batch snapshot, keeping events added in flight', async () => {
      const { delivery, owner, sendBatchEvents } = setup();
      let resolve!: (ok: boolean) => void;
      sendBatchEvents.mockReturnValueOnce(new Promise<boolean>((r) => (resolve = r)));
      await delivery.send(event(1), profile);
      await delivery.send(event(2), { id: 'profile-2' });

      const flushing = delivery.flush();
      // Appended while the snapshot is on the wire: must survive the success.
      await delivery.send(event(3), profile);
      await delivery.send(event(4), { id: 'profile-3' });
      resolve(true);
      await flushing;

      expect(sendBatchEvents.mock.calls[0]?.[0]).toEqual([
        { profile, events: [event(1)] },
        { profile: { id: 'profile-2' }, events: [event(2)] },
      ]);
      expect(delivery.queuedEventCount).toBe(2);
      void owner.destroy();
    });

    it('does not apply an attempt the owner reset while it was in flight', async () => {
      const { delivery, owner, sendBatchEvents } = setup();
      let resolve!: (ok: boolean) => void;
      sendBatchEvents.mockReturnValueOnce(new Promise<boolean>((r) => (resolve = r)));
      await delivery.send(event(1), profile);
      const flushing = delivery.flush();

      owner.reset();
      await delivery.send(event(2), profile);
      resolve(true);
      await flushing;

      // The stale success must not remove the event queued after the reset.
      expect(delivery.queuedEventCount).toBe(1);
      void owner.destroy();
    });

    it('sends the final flush on destroy but ignores its late result', async () => {
      vi.useFakeTimers();
      const { delivery, owner, sendBatchEvents } = setup();
      let resolve!: (ok: boolean) => void;
      sendBatchEvents.mockReturnValueOnce(new Promise<boolean>((r) => (resolve = r)));
      await delivery.send(event(1), profile);

      const drain = owner.destroy();
      expect(sendBatchEvents).toHaveBeenCalledTimes(1);
      resolve(false);
      await drain;

      // A late failure after destroy schedules no retry and leaves no timers.
      expect(vi.getTimerCount()).toBe(0);
      await vi.advanceTimersByTimeAsync(120_000);
      expect(sendBatchEvents).toHaveBeenCalledTimes(1);
    });

    it('refuses events and skips flushing once the owner token is gone', async () => {
      const { delivery, owner, sendBatchEvents } = setup();
      await owner.destroy();

      await delivery.send(event(1), profile);
      await delivery.flush({ force: true });

      expect(delivery.queuedEventCount).toBe(0);
      expect(sendBatchEvents).not.toHaveBeenCalled();
    });
  });
});
