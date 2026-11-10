import { describe, expect, it } from 'vitest';

import { DEFAULT_QUEUE_FLUSH_POLICY } from './flush-policy.js';
import { OFFLINE_QUEUE_MAX_EVENTS, resolveQueuePolicy } from './policy.js';

describe('resolveQueuePolicy', () => {
  it('defaults offline capacity to 100 and resolves the flush policy', () => {
    const resolved = resolveQueuePolicy(undefined);

    expect(OFFLINE_QUEUE_MAX_EVENTS).toBe(100);
    expect(resolved.offlineMaxEvents).toBe(100);
    expect(resolved.flush).toEqual(expect.objectContaining(DEFAULT_QUEUE_FLUSH_POLICY));
  });

  it('delegates a configured capacity with the queue default as its fallback', () => {
    expect(resolveQueuePolicy({ offlineMaxEvents: 7 }).offlineMaxEvents).toBe(7);
    expect(resolveQueuePolicy({ offlineMaxEvents: 0 }).offlineMaxEvents).toBe(100);
  });

  it('passes flush policy values through', () => {
    expect(resolveQueuePolicy({ flush: { flushIntervalMs: 5_000 } }).flush.flushIntervalMs).toBe(
      5_000
    );
  });
});
