import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_PERSONALIZATION_FLUSH_POLICY,
  PersonalizationFlushRuntime,
} from './personalization-flush.js';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('PersonalizationFlushRuntime', () => {
  it('uses the reference backoff and circuit defaults', () => {
    expect(DEFAULT_PERSONALIZATION_FLUSH_POLICY).toEqual({
      baseBackoffMs: 500,
      maxBackoffMs: 30_000,
      jitterRatio: 0.2,
      maxConsecutiveFailures: 8,
      circuitOpenMs: 120_000,
    });
  });

  it('schedules exponential retries, opens the circuit, and allows a forced attempt', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const onRetry = vi.fn();
    const runtime = new PersonalizationFlushRuntime(onRetry);
    for (let failure = 1; failure <= 8; failure++) {
      runtime.markFlushStarted();
      runtime.handleFlushFailure();
      runtime.markFlushFinished();
      expect(runtime.shouldSkip({ force: false, isOnline: true })).toBe(true);
      const delay = failure === 8 ? 120_000 : Math.min(30_000, 500 * 2 ** (failure - 1));
      await vi.advanceTimersByTimeAsync(delay);
      expect(onRetry).toHaveBeenCalledTimes(failure);
      expect(runtime.shouldSkip({ force: false, isOnline: true })).toBe(false);
    }
    expect(runtime.shouldSkip({ force: true, isOnline: false })).toBe(false);
  });

  it('clears scheduled retries on success and reset', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const onRetry = vi.fn();
    const runtime = new PersonalizationFlushRuntime(onRetry);
    runtime.handleFlushFailure();
    expect(vi.getTimerCount()).toBe(1);
    runtime.handleFlushSuccess();
    expect(vi.getTimerCount()).toBe(0);
    runtime.handleFlushFailure();
    runtime.reset();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(onRetry).not.toHaveBeenCalled();
  });
});
