import { describe, expect, it } from 'vitest';

import { DEFAULT_QUEUE_FLUSH_POLICY } from './flushPolicy.js';
import { OFFLINE_QUEUE_MAX_EVENTS, resolveQueuePolicy } from './queuePolicy.js';

describe('resolveQueuePolicy', () => {
  it('defaults offline capacity to 100 and resolves the flush policy', () => {
    const resolved = resolveQueuePolicy(undefined);

    expect(OFFLINE_QUEUE_MAX_EVENTS).toBe(100);
    expect(resolved.offlineMaxEvents).toBe(100);
    expect(resolved.flush).toEqual(expect.objectContaining(DEFAULT_QUEUE_FLUSH_POLICY));
  });

  it('keeps a configured capacity and floors fractions', () => {
    expect(resolveQueuePolicy({ offlineMaxEvents: 7 }).offlineMaxEvents).toBe(7);
    expect(resolveQueuePolicy({ offlineMaxEvents: 7.9 }).offlineMaxEvents).toBe(7);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'falls back to the default for %s',
    (offlineMaxEvents) => {
      expect(resolveQueuePolicy({ offlineMaxEvents }).offlineMaxEvents).toBe(100);
    }
  );

  it('passes flush policy values through', () => {
    expect(resolveQueuePolicy({ flush: { flushIntervalMs: 5_000 } }).flush.flushIntervalMs).toBe(
      5_000
    );
  });
});
