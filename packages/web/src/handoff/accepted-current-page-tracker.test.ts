import { describe, expect, it, vi } from 'vitest';

import { AcceptedCurrentPageTracker } from './accepted-current-page-tracker.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe('AcceptedCurrentPageTracker', () => {
  it('deduplicates only accepted or pending routes and tracks initial emission', async () => {
    const tracker = new AcceptedCurrentPageTracker();
    const pending = deferred<{ accepted: boolean }>();
    const emit = vi.fn(() => pending.promise);

    const first = tracker.emitIfNeeded('/first', emit);
    expect(tracker.hasAccepted()).toBe(false);
    await expect(tracker.emitIfNeeded('/first', emit)).resolves.toEqual({ accepted: false });
    expect(emit).toHaveBeenCalledTimes(1);

    pending.resolve({ accepted: true });
    await expect(first).resolves.toEqual({ accepted: true });
    expect(tracker.hasAccepted()).toBe(true);
    await expect(tracker.emitIfNeeded('/first', emit)).resolves.toEqual({ accepted: false });
    await expect(
      tracker.emitIfNeeded('/second', async () => ({ accepted: true }))
    ).resolves.toEqual({
      accepted: true,
    });
  });

  it('cannot let a stale same-route completion accept or release a new attempt after reset', async () => {
    const tracker = new AcceptedCurrentPageTracker();
    const old = deferred<{ accepted: boolean }>();
    const current = deferred<{ accepted: boolean }>();
    const oldAttempt = tracker.emitIfNeeded('/page', () => old.promise);

    tracker.reset();
    const currentAttempt = tracker.emitIfNeeded('/page', () => current.promise);
    old.resolve({ accepted: true });
    await expect(oldAttempt).resolves.toEqual({ accepted: true });
    expect(tracker.hasAccepted()).toBe(false);

    const duplicate = vi.fn(async () => ({ accepted: true }));
    await expect(tracker.emitIfNeeded('/page', duplicate)).resolves.toEqual({ accepted: false });
    expect(duplicate).not.toHaveBeenCalled();

    current.resolve({ accepted: false });
    await expect(currentAttempt).resolves.toEqual({ accepted: false });
    await expect(tracker.emitIfNeeded('/page', duplicate)).resolves.toEqual({ accepted: true });
    expect(tracker.hasAccepted()).toBe(true);
  });

  it('retries a failed attempt', async () => {
    const tracker = new AcceptedCurrentPageTracker();
    await expect(
      tracker.emitIfNeeded('/page', async () => {
        throw new Error('send failed');
      })
    ).rejects.toThrow('send failed');
    expect(tracker.hasAccepted()).toBe(false);
    await expect(tracker.emitIfNeeded('/page', async () => ({ accepted: true }))).resolves.toEqual({
      accepted: true,
    });
  });
});
