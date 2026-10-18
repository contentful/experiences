import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { QueueFlushFailureContext, QueueFlushRecoveredContext } from './flushPolicy.js';
import { resolveQueueFlushPolicy } from './flushPolicy.js';
import { QueueFlushRuntime } from './QueueFlushRuntime.js';

describe('QueueFlushRuntime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('skips flush while in flight and allows force bypass', () => {
    const runtime = new QueueFlushRuntime({
      policy: resolveQueueFlushPolicy(undefined),
      onRetry: vi.fn(),
    });

    expect(runtime.shouldSkip({ force: false, isOnline: true })).toBe(false);

    runtime.markFlushStarted();
    expect(runtime.shouldSkip({ force: false, isOnline: true })).toBe(true);

    runtime.markFlushFinished();
    expect(runtime.shouldSkip({ force: true, isOnline: false })).toBe(false);
  });

  it('schedules retries and opens a circuit window at the failure threshold', async () => {
    const onRetry = vi.fn<() => void>();
    const onFlushFailure = vi.fn<(context: QueueFlushFailureContext) => void>();
    const onCircuitOpen = vi.fn<(context: QueueFlushFailureContext) => void>();
    const runtime = new QueueFlushRuntime({
      policy: resolveQueueFlushPolicy({
        baseBackoffMs: 10,
        maxBackoffMs: 10,
        jitterRatio: 0,
        maxConsecutiveFailures: 2,
        circuitOpenMs: 50,
        onCircuitOpen,
        onFlushFailure,
      }),
      onRetry,
    });

    runtime.handleFlushFailure({ queuedBatches: 1, queuedEvents: 3 });

    expect(onFlushFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        consecutiveFailures: 1,
        queuedBatches: 1,
        queuedEvents: 3,
        retryDelayMs: 10,
      })
    );
    expect(onCircuitOpen).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(10);
    expect(onRetry).toHaveBeenCalledTimes(1);

    runtime.handleFlushFailure({ queuedBatches: 1, queuedEvents: 3 });

    expect(onCircuitOpen).toHaveBeenCalledWith(
      expect.objectContaining({
        consecutiveFailures: 2,
        queuedBatches: 1,
        queuedEvents: 3,
        retryDelayMs: 50,
      })
    );

    await vi.advanceTimersByTimeAsync(50);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it('clears pending backoff and emits recovery callback after success', async () => {
    const onRetry = vi.fn<() => void>();
    const onFlushRecovered = vi.fn<(context: QueueFlushRecoveredContext) => void>();
    const runtime = new QueueFlushRuntime({
      policy: resolveQueueFlushPolicy({
        baseBackoffMs: 10,
        maxBackoffMs: 10,
        jitterRatio: 0,
        onFlushRecovered,
      }),
      onRetry,
    });

    runtime.handleFlushFailure({ queuedBatches: 1, queuedEvents: 1 });
    expect(runtime.shouldSkip({ force: false, isOnline: true })).toBe(true);

    runtime.handleFlushSuccess();
    expect(runtime.shouldSkip({ force: false, isOnline: true })).toBe(false);
    expect(onFlushRecovered).toHaveBeenCalledWith({ consecutiveFailures: 1 });

    await vi.advanceTimersByTimeAsync(10);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('reports callback failures via onCallbackError', () => {
    const callbackError = new Error('callback-failed');
    const onCallbackError = vi.fn<(callbackName: string, error: unknown) => void>();
    const runtime = new QueueFlushRuntime({
      policy: resolveQueueFlushPolicy({
        onFlushFailure: () => {
          throw callbackError;
        },
      }),
      onRetry: vi.fn(),
      onCallbackError,
    });

    runtime.handleFlushFailure({ queuedBatches: 1, queuedEvents: 1 });

    expect(onCallbackError).toHaveBeenCalledWith('onFlushFailure', callbackError);
  });
});
