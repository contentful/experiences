import type {
  InsightsEvent as AnalyticsEvent,
  PartialProfile as EventProfile,
} from '@contentful/optimization-api-client/api-schemas';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnalyticsDelivery } from './analytics-delivery.js';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const profile: EventProfile = { id: 'profile-1' };
const event = (n: number) =>
  ({ type: 'component', componentId: `c${n}` }) as unknown as AnalyticsEvent;

function setup(options: { online?: boolean; maxEvents?: number } = {}) {
  let online = options.online ?? true;
  const sendBatchEvents = vi.fn<(...args: unknown[]) => Promise<boolean>>().mockResolvedValue(true);
  const delivery = new AnalyticsDelivery({
    api: { sendBatchEvents } as never,
    getOnline: () => online,
    maxEvents: options.maxEvents,
  });
  return {
    delivery,
    sendBatchEvents,
    setOnline: (value: boolean) => {
      online = value;
    },
  };
}

describe('AnalyticsDelivery', () => {
  it('queues events instead of sending each one', async () => {
    const { delivery, sendBatchEvents } = setup();
    await expect(delivery.send(event(1), profile)).resolves.toBe(true);
    expect(sendBatchEvents).not.toHaveBeenCalled();
    expect(delivery.queuedEventCount).toBe(1);
    delivery.destroy();
  });

  it('flushes when the queue reaches its size limit, batching per profile', async () => {
    const { delivery, sendBatchEvents } = setup({ maxEvents: 3 });
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
    delivery.destroy();
  });

  it('flushes every 30 seconds while events remain queued', async () => {
    vi.useFakeTimers();
    const { delivery, sendBatchEvents } = setup();
    await delivery.send(event(1), profile);
    await vi.advanceTimersByTimeAsync(29_999);
    expect(sendBatchEvents).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(sendBatchEvents).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    delivery.destroy();
  });

  it('holds events while offline and sends them on a forced flush when back online', async () => {
    const { delivery, sendBatchEvents, setOnline } = setup({ online: false });
    await delivery.send(event(1), profile);
    await delivery.flush();
    expect(sendBatchEvents).not.toHaveBeenCalled();
    setOnline(true);
    await delivery.flush({ force: true });
    expect(sendBatchEvents).toHaveBeenCalledTimes(1);
    expect(delivery.queuedEventCount).toBe(0);
    delivery.destroy();
  });

  it('passes the beacon sender through for lifecycle flushes', async () => {
    const { delivery, sendBatchEvents } = setup();
    const beacon = vi.fn(() => true);
    await delivery.send(event(1), profile);
    await delivery.flush({ force: true, beacon });
    expect(sendBatchEvents.mock.calls[0]?.[1]).toEqual({ beacon });
    delivery.destroy();
  });

  it('keeps events and retries with backoff after a failed flush', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { delivery, sendBatchEvents } = setup();
    sendBatchEvents.mockResolvedValueOnce(false);
    await delivery.send(event(1), profile);
    await delivery.flush();
    expect(delivery.queuedEventCount).toBe(1);
    await delivery.flush();
    expect(sendBatchEvents).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(500);
    expect(sendBatchEvents).toHaveBeenCalledTimes(2);
    expect(delivery.queuedEventCount).toBe(0);
    delivery.destroy();
  });

  it('treats a thrown request as a failure and keeps the events', async () => {
    vi.useFakeTimers();
    const { delivery, sendBatchEvents } = setup();
    sendBatchEvents.mockRejectedValueOnce(new Error('network'));
    await delivery.send(event(1), profile);
    await delivery.flush();
    expect(delivery.queuedEventCount).toBe(1);
    delivery.destroy();
  });

  it('keeps events queued while a flush is in flight', async () => {
    const { delivery, sendBatchEvents } = setup();
    let resolve!: (ok: boolean) => void;
    sendBatchEvents.mockReturnValueOnce(new Promise<boolean>((r) => (resolve = r)));
    await delivery.send(event(1), profile);
    const flushing = delivery.flush();
    await delivery.send(event(2), profile);
    resolve(true);
    await flushing;
    expect(delivery.queuedEventCount).toBe(1);
    delivery.destroy();
  });

  it('drops queued events and timers on clearQueue, and keeps accepting afterwards', async () => {
    vi.useFakeTimers();
    const { delivery, sendBatchEvents } = setup();
    await delivery.send(event(1), profile);
    delivery.clearQueue();
    expect(delivery.queuedEventCount).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    await delivery.flush({ force: true });
    expect(sendBatchEvents).not.toHaveBeenCalled();
    await expect(delivery.send(event(2), profile)).resolves.toBe(true);
    delivery.destroy();
  });

  it('makes a final forced attempt on destroy, then refuses new events', async () => {
    const { delivery, sendBatchEvents } = setup({ online: false });
    await delivery.send(event(1), profile);
    delivery.destroy();
    expect(sendBatchEvents).toHaveBeenCalledTimes(1);
    await expect(delivery.send(event(2), profile)).resolves.toBe(false);
  });

  it('joins an active flush instead of resolving early, without starting a second request', async () => {
    const { delivery, sendBatchEvents } = setup();
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
    delivery.destroy();
  });

  it('does not let a join guarantee delivery: a failed attempt is not retried by the joiner', async () => {
    vi.useFakeTimers();
    const { delivery, sendBatchEvents } = setup();
    let resolve!: (ok: boolean) => void;
    sendBatchEvents.mockReturnValueOnce(new Promise<boolean>((r) => (resolve = r)));
    await delivery.send(event(1), profile);

    const first = delivery.flush();
    const joined = delivery.flush();
    resolve(false);
    await Promise.all([first, joined]);

    expect(sendBatchEvents).toHaveBeenCalledTimes(1);
    expect(delivery.queuedEventCount).toBe(1);
    delivery.destroy();
  });

  it('forgets an active flush when the queue is cleared, so a new flush can start', async () => {
    const { delivery, sendBatchEvents } = setup();
    sendBatchEvents.mockReturnValueOnce(new Promise<boolean>(() => undefined));
    await delivery.send(event(1), profile);
    void delivery.flush();
    delivery.clearQueue();

    await delivery.send(event(2), profile);
    await delivery.flush({ force: true });

    expect(sendBatchEvents).toHaveBeenCalledTimes(2);
    expect(delivery.queuedEventCount).toBe(0);
    delivery.destroy();
  });
});
